/**
 * Game controller: orchestrates multiplayer game flow.
 *
 * Wraps the pure functional engine with multiplayer concerns:
 *   - Collecting actions from all players for simultaneous phases
 *   - Processing sequential phases with active player tracking
 *   - Turn timer with auto-advance using default actions
 *   - Default actions for disconnected players
 *   - Action validation before engine execution
 *
 * The controller is the authoritative game server. Clients send intents,
 * the controller validates them, executes via the engine, and broadcasts
 * updated state.
 */

import type { GamePhase, GameState, Gear } from '../types.js';
import { CARDS_PER_GEAR } from '../types.js';
import { createRng } from '../deck.js';
import {
  initGame,
  executeGearShiftPhase,
  executePlayCardsPhase,
  executeRevealAndMove,
  executeAdrenaline,
  executeCooldown,
  executeBoost,
  endReactPhase,
  executeSlipstream,
  executeCheckCorner,
  executeDiscardPhase,
  executeReplenishPhase,
  isClutteredHand,
  isSlipstreamEligible,
} from '../engine.js';
import type { GearSelection, CardSelection, DiscardSelection } from '../engine.js';
import type {
  Room,
  Connection,
  ServerMessage,
  ClientMessage,
  ClientGameState,
  PlayerStanding,
} from './types.js';
import { partitionState, computeStandings, getPhaseType } from './state-partition.js';
import {
  getPlayerIndex,
  isPlayerConnected,
  setRoomStatus,
} from './room.js';
import { isPlayableCard } from '../cards.js';
import { shiftGear } from '../gear.js';
import { baseGameTracks } from '../track/tracks/index.js';

// -- Connection Registry --

export interface ConnectionRegistry {
  /** Get connection for a player in a room. Returns null if disconnected. */
  getConnection(playerId: string): Connection | null;
  /** Broadcast a message to all connected players in a room. */
  broadcast(room: Room, message: ServerMessage): void;
  /** Send a message to a specific player. */
  sendTo(playerId: string, message: ServerMessage): void;
}

// -- Game Lifecycle --

/**
 * Start a game in a room. Initializes game state and begins the first phase.
 */
export function startGame(
  room: Room,
  registry: ConnectionRegistry,
): void {
  const seed = room.config.seed ?? Date.now();
  room.rng = createRng(seed);

  const track = baseGameTracks[room.config.trackId];

  const state = initGame({
    playerIds: room.playerIds,
    lapTarget: room.config.lapCount,
    seed,
    mode: room.config.mode,
    trackId: track.id,
    totalSpaces: track.totalSpaces,
    startFinishLine: track.startFinishLine,
    corners: track.corners,
  });

  room.gameState = state;
  setRoomStatus(room, 'playing');
  room.pendingActions.clear();

  // Send personalized game-started to each player
  for (let i = 0; i < room.playerIds.length; i++) {
    const playerId = room.playerIds[i];
    const clientState = partitionState(state, i, room.playerInfo);
    registry.sendTo(playerId, {
      type: 'game-started',
      state: clientState,
    });
  }

  // Start the first phase
  beginPhase(room, registry);
}

/**
 * Process a client message as a game action.
 */
export function handleGameAction(
  room: Room,
  playerId: string,
  message: ClientMessage,
  registry: ConnectionRegistry,
): void {
  if (!room.gameState || room.status !== 'playing') {
    registry.sendTo(playerId, { type: 'error', message: 'Game not in progress' });
    return;
  }

  const playerIndex = getPlayerIndex(room, playerId);
  if (playerIndex === -1) {
    registry.sendTo(playerId, { type: 'error', message: 'Not a player in this game' });
    return;
  }

  const state = room.gameState;

  // Silently ignore stale actions from a previous phase.
  // This handles race conditions where a client sends an action for a phase that
  // has already advanced (e.g., react-done arriving after phase moved to slipstream).
  if (isStaleAction(state.phase, message)) {
    return;
  }

  const phaseType = getPhaseType(state.phase);

  try {
    if (phaseType === 'simultaneous') {
      handleSimultaneousAction(room, playerIndex, message, registry);
    } else if (phaseType === 'sequential') {
      handleSequentialAction(room, playerIndex, message, registry);
    } else {
      registry.sendTo(playerId, {
        type: 'error',
        message: `Phase '${state.phase}' does not accept player actions`,
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    registry.sendTo(playerId, { type: 'error', message: errorMsg });
  }
}

// -- Simultaneous Phase Handling --

function handleSimultaneousAction(
  room: Room,
  playerIndex: number,
  message: ClientMessage,
  registry: ConnectionRegistry,
): void {
  const state = room.gameState!;

  // Validate the action matches the current phase
  validateActionForPhase(state.phase, message);

  // Validate the action content for this specific player.
  // This catches invalid actions at submission time so the error is sent
  // to the correct player, not whoever triggers batch execution later.
  validateSimultaneousActionContent(state, playerIndex, message);

  // Store the action (overwrites previous if resubmitted)
  room.pendingActions.set(playerIndex, message);

  // Check if all connected players have submitted
  if (allPlayersActed(room)) {
    executeSimultaneousPhase(room, registry);
  }
}

function handleSequentialAction(
  room: Room,
  playerIndex: number,
  message: ClientMessage,
  registry: ConnectionRegistry,
): void {
  const state = room.gameState!;

  // Only the active player can act in sequential phases
  if (playerIndex !== state.activePlayerIndex) {
    const playerId = room.playerIds[playerIndex];
    registry.sendTo(playerId, {
      type: 'error',
      message: 'Not your turn',
    });
    return;
  }

  validateActionForPhase(state.phase, message);
  executeSequentialAction(room, playerIndex, message, registry);
}

// -- Phase Execution --

function executeSimultaneousPhase(
  room: Room,
  registry: ConnectionRegistry,
): void {
  const state = room.gameState!;

  // Fill in default actions for disconnected players
  fillDefaultActions(room);

  clearTurnTimer(room);

  try {
    switch (state.phase) {
      case 'gear-shift':
        executeGearShift(room, registry);
        break;
      case 'play-cards':
        executePlayCards(room, registry);
        break;
      case 'discard':
        executeDiscard(room, registry);
        break;
    }
  } catch (_err) {
    // Batch processing failed (e.g., invalid gear shift slipped through).
    // Clear stale actions and restart the phase so the turn timer can
    // recover and players can resubmit. Without this, pendingActions
    // retains the invalid entries, fillDefaultActions skips those players,
    // and the game permanently soft-locks.
    //
    // We intentionally swallow the error after recovery. Re-throwing would
    // propagate uncaught through handleTimeout's setTimeout callback (or
    // handleDisconnection), crashing the entire WS server (ht-h9i4).
    // The phase restart is sufficient recovery — players get a fresh
    // phase-changed broadcast and can resubmit.
    room.pendingActions.clear();
    beginPhase(room, registry);
  }
}

function executeGearShift(room: Room, registry: ConnectionRegistry): void {
  const state = room.gameState!;
  const selections: GearSelection[] = [];

  for (let i = 0; i < state.players.length; i++) {
    const action = room.pendingActions.get(i) as { type: 'gear-shift'; targetGear: Gear } | undefined;
    selections.push({
      playerIndex: i,
      targetGear: action?.targetGear ?? state.players[i].gear, // Default: keep current gear
    });
  }

  room.gameState = executeGearShiftPhase(state, selections);
  room.pendingActions.clear();
  advancePhase(room, registry);
}

function executePlayCards(room: Room, registry: ConnectionRegistry): void {
  const state = room.gameState!;
  const selections: CardSelection[] = [];

  for (let i = 0; i < state.players.length; i++) {
    const action = room.pendingActions.get(i) as { type: 'play-cards'; cardIndices: number[] } | undefined;

    if (action) {
      selections.push({ playerIndex: i, cardIndices: action.cardIndices });
    } else {
      // Default: auto-select first playable cards
      selections.push({
        playerIndex: i,
        cardIndices: getDefaultCardSelection(state.players[i]),
      });
    }
  }

  room.gameState = executePlayCardsPhase(state, selections);
  room.pendingActions.clear();
  advancePhase(room, registry);
}

function executeDiscard(room: Room, registry: ConnectionRegistry): void {
  const state = room.gameState!;
  const selections: DiscardSelection[] = [];

  for (let i = 0; i < state.players.length; i++) {
    const action = room.pendingActions.get(i) as { type: 'discard'; cardIndices: number[] } | undefined;
    selections.push({
      playerIndex: i,
      cardIndices: action?.cardIndices ?? [], // Default: discard nothing
    });
  }

  room.gameState = executeDiscardPhase(state, selections);
  room.pendingActions.clear();
  advancePhase(room, registry);
}

function executeSequentialAction(
  room: Room,
  playerIndex: number,
  message: ClientMessage,
  registry: ConnectionRegistry,
): void {
  const state = room.gameState!;

  clearTurnTimer(room);

  switch (state.phase) {
    case 'react':
      if (message.type === 'react-cooldown') {
        room.gameState = executeCooldown(state, {
          type: 'cooldown',
          playerIndex,
          heatIndices: message.heatIndices,
        });
        // Don't advance yet — player may still boost or end react
        broadcastState(room, registry);
        startTurnTimer(room, registry);
        return;
      }
      if (message.type === 'react-boost') {
        room.gameState = executeBoost(state, {
          type: 'boost',
          playerIndex,
        }, room.rng!);
        // Don't advance yet — player may still end react
        broadcastState(room, registry);
        startTurnTimer(room, registry);
        return;
      }
      if (message.type === 'react-done') {
        room.gameState = endReactPhase(state, playerIndex);
      }
      break;

    case 'slipstream': {
      const slipMsg = message as { type: 'slipstream'; accept: boolean };
      room.gameState = executeSlipstream(state, {
        type: 'slipstream',
        playerIndex,
        accept: slipMsg.accept,
      });
      break;
    }
  }

  advancePhase(room, registry);
}

// -- Phase Advancement --

/**
 * After a phase completes, determine the next phase and begin it.
 * Handles automatic phases (adrenaline, replenish) without player input.
 * In qualifying mode, skips adrenaline and slipstream (no opponents).
 */
function advancePhase(room: Room, registry: ConnectionRegistry): void {
  const state = room.gameState!;

  // Check for game over
  if (state.raceStatus === 'finished' || state.phase === 'finished') {
    handleGameOver(room, registry);
    return;
  }

  // In qualifying mode, skip adrenaline and slipstream phases
  if (state.mode === 'qualifying') {
    if (state.phase === 'adrenaline') {
      room.gameState = {
        ...state,
        phase: 'react',
        activePlayerIndex: state.turnOrder[0],
      };
      advancePhase(room, registry);
      return;
    }
    if (state.phase === 'slipstream') {
      room.gameState = {
        ...state,
        phase: 'check-corner',
        activePlayerIndex: state.turnOrder[0],
      };
      advancePhase(room, registry);
      return;
    }
  }

  const phaseType = getPhaseType(state.phase);

  // Process automatic phases immediately
  if (phaseType === 'automatic') {
    executeAutomaticPhase(room, registry);
    return;
  }

  // Process sequential-auto phases (no player input needed)
  if (phaseType === 'sequential-auto') {
    executeSequentialAutoPhase(room, registry);
    return;
  }

  // Begin the new phase (sends state updates and starts timers)
  beginPhase(room, registry);
}

function executeAutomaticPhase(room: Room, registry: ConnectionRegistry): void {
  const state = room.gameState!;

  switch (state.phase) {
    case 'adrenaline':
      room.gameState = executeAdrenaline(state);
      break;

    case 'replenish':
      room.gameState = executeReplenishPhase(state, room.rng!);
      break;
  }

  advancePhase(room, registry);
}

/** Next phase when a sequential-auto phase must be force-skipped on error. */
const SEQUENTIAL_AUTO_NEXT_PHASE: Record<string, GamePhase> = {
  'reveal-and-move': 'adrenaline',
  'check-corner': 'discard',
};

/**
 * Process a sequential-automatic phase: run through all players in turn order
 * without waiting for input. Used for reveal-and-move and check-corner.
 */
function executeSequentialAutoPhase(room: Room, registry: ConnectionRegistry): void {
  let state = room.gameState!;

  // Process all players in sequence until the phase advances
  const currentPhase = state.phase;

  try {
    while (state.phase === currentPhase) {
      const playerIndex = state.activePlayerIndex;

      switch (currentPhase) {
        case 'reveal-and-move':
          state = executeRevealAndMove(state, playerIndex, room.rng!);
          break;

        case 'check-corner':
          state = executeCheckCorner(state, playerIndex);
          break;
      }

      room.gameState = state;
    }
  } catch (_err) {
    // If an auto-phase throws (e.g., executeCheckCorner), force-advance to the
    // next phase. Without this, the game permanently soft-locks at the current
    // phase since there's no player input to re-trigger processing, and
    // reconnection only resends state without re-running auto phases (ht-rcak).
    const nextPhase = SEQUENTIAL_AUTO_NEXT_PHASE[currentPhase];
    if (nextPhase) {
      state = room.gameState!;
      room.gameState = { ...state, phase: nextPhase };
    }
  }

  advancePhase(room, registry);
}

/**
 * Begin a new phase: broadcast state and start turn timer.
 */
function beginPhase(room: Room, registry: ConnectionRegistry): void {
  const state = room.gameState!;
  room.phaseStartedAt = Date.now();
  room.pendingActions.clear();

  // Auto-act for disconnected players in sequential phases
  const phaseType = getPhaseType(state.phase);
  if (phaseType === 'sequential') {
    const activePlayerIndex = state.activePlayerIndex;
    const activePlayerId = room.playerIds[activePlayerIndex];

    if (!isPlayerConnected(room, activePlayerId)) {
      // Disconnected player: auto-play with default action
      autoPlayDisconnected(room, activePlayerIndex, registry);
      return;
    }
  }

  broadcastState(room, registry);
  startTurnTimer(room, registry);
}

// -- Turn Timer --

function startTurnTimer(room: Room, registry: ConnectionRegistry): void {
  if (room.config.turnTimeoutMs <= 0) return;

  clearTurnTimer(room);

  room.turnTimer = setTimeout(() => {
    handleTimeout(room, registry);
  }, room.config.turnTimeoutMs);
}

function clearTurnTimer(room: Room): void {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function handleTimeout(room: Room, registry: ConnectionRegistry): void {
  if (!room.gameState || room.status !== 'playing') return;

  const state = room.gameState;
  const phaseType = getPhaseType(state.phase);

  try {
    if (phaseType === 'simultaneous') {
      // Fill defaults for players who haven't acted, then execute
      executeSimultaneousPhase(room, registry);
    } else if (phaseType === 'sequential') {
      // Auto-play the active player with default action
      autoPlayDisconnected(room, state.activePlayerIndex, registry);
    }
  } catch (_err) {
    // Defense-in-depth: never let errors escape setTimeout callbacks.
    // executeSimultaneousPhase already handles its own recovery (clear +
    // restart phase), so reaching here means something truly unexpected.
    // Swallow to protect the WS server process (ht-h9i4).
  }
}

// -- Disconnected Player Auto-Play --

/**
 * Auto-play a disconnected or timed-out player with safe default actions.
 */
function autoPlayDisconnected(
  room: Room,
  playerIndex: number,
  registry: ConnectionRegistry,
): void {
  const state = room.gameState!;

  clearTurnTimer(room);

  switch (state.phase) {
    case 'react':
      // Default: skip react (no cooldown, no boost)
      room.gameState = endReactPhase(state, playerIndex);
      break;

    case 'slipstream':
      // Default: decline slipstream
      room.gameState = executeSlipstream(state, {
        type: 'slipstream',
        playerIndex,
        accept: false,
      });
      break;
  }

  advancePhase(room, registry);
}

// -- Default Actions --

/**
 * Fill in default actions for disconnected players in simultaneous phases.
 */
function fillDefaultActions(room: Room): void {
  const state = room.gameState!;

  for (let i = 0; i < state.players.length; i++) {
    if (room.pendingActions.has(i)) continue;

    switch (state.phase) {
      case 'gear-shift':
        // Default: keep current gear
        room.pendingActions.set(i, {
          type: 'gear-shift',
          targetGear: state.players[i].gear,
        });
        break;

      case 'play-cards':
        // Default: auto-select first playable cards
        room.pendingActions.set(i, {
          type: 'play-cards',
          cardIndices: getDefaultCardSelection(state.players[i]),
        });
        break;

      case 'discard':
        // Default: don't discard
        room.pendingActions.set(i, {
          type: 'discard',
          cardIndices: [],
        });
        break;
    }
  }
}

/**
 * Get default card indices for a player who didn't submit play-cards.
 * Selects the first N playable cards where N = cards required for current gear.
 * Returns empty array if cluttered hand (triggers cluttered hand handling).
 */
function getDefaultCardSelection(player: import('../types.js').PlayerState): number[] {
  const required = CARDS_PER_GEAR[player.gear];
  const playableIndices: number[] = [];

  for (let i = 0; i < player.hand.length; i++) {
    if (isPlayableCard(player.hand[i])) {
      playableIndices.push(i);
    }
    if (playableIndices.length === required) break;
  }

  // If not enough playable cards, return empty (triggers cluttered hand)
  if (playableIndices.length < required) return [];

  return playableIndices;
}

// -- State Broadcasting --

/**
 * Send partitioned state to each connected player.
 */
function broadcastState(room: Room, registry: ConnectionRegistry): void {
  const state = room.gameState!;
  const timeoutMs = room.config.turnTimeoutMs > 0 ? room.config.turnTimeoutMs : undefined;

  for (let i = 0; i < room.playerIds.length; i++) {
    const playerId = room.playerIds[i];
    if (!isPlayerConnected(room, playerId)) continue;

    const clientState = partitionState(state, i, room.playerInfo);
    registry.sendTo(playerId, {
      type: 'phase-changed',
      phase: state.phase,
      state: clientState,
      timeoutMs,
    });
  }
}

// -- Game Over --

function handleGameOver(room: Room, registry: ConnectionRegistry): void {
  const state = room.gameState!;
  const standings = computeStandings(state);

  clearTurnTimer(room);
  setRoomStatus(room, 'finished');

  registry.broadcast(room, {
    type: 'game-over',
    standings,
  });

  // Send per-player result messages for profile stats tracking
  if (state.mode === 'qualifying') {
    // Single player — compute lap times from lapRounds
    const player = state.players[0];
    const lapTimes = player.lapRounds.map((r, i) => r - (i > 0 ? player.lapRounds[i - 1] : 0));
    const bestLap = lapTimes.length > 0 ? Math.min(...lapTimes) : 0;
    const totalTime = player.lapRounds.length > 0 ? player.lapRounds[player.lapRounds.length - 1] : 0;

    registry.sendTo(room.playerIds[0], {
      type: 'qualifying-result',
      trackId: state.trackId,
      lapCount: state.lapTarget,
      lapTimes,
      bestLap,
      totalTime,
    });
  } else {
    // Multiplayer race — send individual result to each player
    const points = computeRacePoints(standings.length);
    const standingInfo = standings.map((s) => {
      const info = room.playerInfo.get(s.playerId);
      return {
        profileId: s.playerId,
        displayName: info?.displayName ?? s.playerId,
        position: s.rank,
      };
    });

    for (let i = 0; i < room.playerIds.length; i++) {
      const playerId = room.playerIds[i];
      const rank = standings.find((s) => s.playerId === playerId)?.rank ?? standings.length;

      registry.sendTo(playerId, {
        type: 'race-result',
        trackId: state.trackId,
        lapCount: state.lapTarget,
        position: rank,
        totalPlayers: standings.length,
        points: points[rank - 1] ?? 0,
        standings: standingInfo,
        spinouts: 0,  // TODO: track per-player spinouts in game state
        boostsUsed: 0, // TODO: track per-player boosts in game state
        heatPaid: 0,   // TODO: track per-player heat paid in game state
      });
    }
  }
}

/** Championship-style points: 10, 6, 4, 3, 2, 1 for positions 1-6. */
function computeRacePoints(totalPlayers: number): number[] {
  const table = [10, 6, 4, 3, 2, 1];
  return Array.from({ length: totalPlayers }, (_, i) => table[i] ?? 0);
}

// -- Validation --

/**
 * All action types that are valid game actions in SOME phase.
 * Used to distinguish stale actions (valid type, wrong phase) from
 * genuinely unknown/malformed messages.
 */
const GAME_ACTION_TYPES = new Set([
  'gear-shift', 'play-cards',
  'react-cooldown', 'react-boost', 'react-done',
  'slipstream', 'discard',
]);

const VALID_ACTIONS_FOR_PHASE: Record<string, string[]> = {
  'gear-shift': ['gear-shift'],
  'play-cards': ['play-cards'],
  'reveal-and-move': [], // Automatic per-player, no client message needed
  'react': ['react-cooldown', 'react-boost', 'react-done'],
  'slipstream': ['slipstream'],
  'check-corner': [], // Automatic per-player
  'discard': ['discard'],
};

/**
 * Check if a message is a stale action from a previous phase.
 *
 * During sequential phases, all players receive phase-changed broadcasts.
 * Non-active players may respond before learning the phase has advanced.
 * Their action is a known game action type but not valid for the current phase.
 * These should be silently ignored rather than producing confusing errors.
 */
export function isStaleAction(phase: GamePhase, message: ClientMessage): boolean {
  const allowed = VALID_ACTIONS_FOR_PHASE[phase];
  if (allowed && allowed.includes(message.type)) {
    return false; // Valid for current phase — not stale
  }
  // Stale if it's a known game action type but wrong phase
  return GAME_ACTION_TYPES.has(message.type);
}

/**
 * Validate the content of a simultaneous action for a specific player.
 * Called at submission time so errors route to the correct player,
 * not whoever's message triggers batch execution.
 */
function validateSimultaneousActionContent(
  state: GameState,
  playerIndex: number,
  message: ClientMessage,
): void {
  const player = state.players[playerIndex];

  switch (message.type) {
    case 'gear-shift': {
      const result = shiftGear(player, (message as { targetGear: Gear }).targetGear);
      if (!result.ok) {
        throw new Error(`Invalid gear shift: ${result.reason}`);
      }
      break;
    }

    case 'play-cards': {
      const { cardIndices } = message as { cardIndices: number[] };
      const requiredCount = CARDS_PER_GEAR[player.gear];

      // Empty submission is allowed for cluttered hand — engine handles it
      if (cardIndices.length === 0) break;

      if (cardIndices.length !== requiredCount) {
        throw new Error(
          `Must play exactly ${requiredCount} card(s) in gear ${player.gear}, got ${cardIndices.length}`,
        );
      }

      for (const idx of cardIndices) {
        if (idx < 0 || idx >= player.hand.length) {
          throw new Error(`Invalid hand index: ${idx}`);
        }
        if (!isPlayableCard(player.hand[idx])) {
          throw new Error(`Card of type '${player.hand[idx].type}' cannot be played`);
        }
      }

      // Check for duplicate indices
      if (new Set(cardIndices).size !== cardIndices.length) {
        throw new Error('Duplicate card indices');
      }
      break;
    }

    case 'discard': {
      const { cardIndices } = message as { cardIndices: number[] };
      for (const idx of cardIndices) {
        if (idx < 0 || idx >= player.hand.length) {
          throw new Error(`Invalid hand index: ${idx}`);
        }
        if (!isPlayableCard(player.hand[idx])) {
          throw new Error(`Can only discard playable cards`);
        }
      }

      if (new Set(cardIndices).size !== cardIndices.length) {
        throw new Error('Duplicate card indices');
      }
      break;
    }
  }
}

function validateActionForPhase(phase: GamePhase, message: ClientMessage): void {
  const allowed = VALID_ACTIONS_FOR_PHASE[phase];
  if (!allowed || !allowed.includes(message.type)) {
    throw new Error(`Action '${message.type}' not valid in phase '${phase}'`);
  }
}

/**
 * Check if all connected players have submitted their action.
 */
function allPlayersActed(room: Room): boolean {
  const state = room.gameState!;
  for (let i = 0; i < state.players.length; i++) {
    const playerId = room.playerIds[i];
    if (isPlayerConnected(room, playerId) && !room.pendingActions.has(i)) {
      return false;
    }
  }
  return true;
}

// -- Reconnection --

/**
 * Handle a player reconnecting mid-game.
 * Sends them the current game state so they can resume.
 */
export function handleReconnection(
  room: Room,
  playerId: string,
  registry: ConnectionRegistry,
): void {
  if (!room.gameState) return;

  const playerIndex = getPlayerIndex(room, playerId);
  if (playerIndex === -1) return;

  const clientState = partitionState(room.gameState, playerIndex, room.playerInfo);
  const timeoutMs = room.config.turnTimeoutMs > 0
    ? Math.max(0, room.config.turnTimeoutMs - (Date.now() - room.phaseStartedAt))
    : undefined;

  registry.sendTo(playerId, {
    type: 'phase-changed',
    phase: room.gameState.phase,
    state: clientState,
    timeoutMs,
  });

  // Notify others
  registry.broadcast(room, {
    type: 'player-reconnected',
    playerId,
  });
}

/**
 * Handle a player disconnecting mid-game.
 */
export function handleDisconnection(
  room: Room,
  playerId: string,
  registry: ConnectionRegistry,
): void {
  registry.broadcast(room, {
    type: 'player-disconnected',
    playerId,
  });

  if (!room.gameState || room.status !== 'playing') return;

  const playerIndex = getPlayerIndex(room, playerId);
  if (playerIndex === -1) return;

  const state = room.gameState;
  const phaseType = getPhaseType(state.phase);

  // If the disconnected player is the active player in a sequential phase,
  // auto-play them immediately
  if (phaseType === 'sequential' && state.activePlayerIndex === playerIndex) {
    autoPlayDisconnected(room, playerIndex, registry);
  }

  // In simultaneous phases, check if all remaining connected players have acted
  if (phaseType === 'simultaneous' && allPlayersActed(room)) {
    executeSimultaneousPhase(room, registry);
  }
}
