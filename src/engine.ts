/**
 * Core game engine: 9-phase turn structure for Heat: Pedal to the Metal.
 *
 * Round phases:
 *   1. Gear Shift (simultaneous)
 *   2. Play Cards (simultaneous)
 *   3. Reveal & Move (sequential, leader first)
 *   4. Adrenaline (conditional/automatic)
 *   5. React (sequential) — Cooldown + Boost
 *   6. Slipstream (sequential)
 *   7. Check Corner (sequential/automatic)
 *   8. Discard (simultaneous)
 *   9. Replenish (simultaneous)
 *
 * All state transitions are deterministic given the same inputs and RNG seed.
 */

import type {
  Card,
  CornerDef,
  GameMode,
  GameState,
  GamePhase,
  Gear,
  PlayerState,
  RaceStatus,
} from './types.js';
import {
  HAND_SIZE,
  DEFAULT_STRESS_COUNT,
  CARDS_PER_GEAR,
  COOLDOWN_PER_GEAR,
  SPINOUT_STRESS,
} from './types.js';
import { buildStartingDeck, buildEngineZone, getCardSpeedValue, isPlayableCard } from './cards.js';
import { shuffle, drawCards, replenishHand, discardFromHand, createRng } from './deck.js';
import { shiftGear } from './gear.js';
import { stressCard } from './cards.js';
import { getEffectiveCooldown, isSlipstreamAllowedByWeather, getEffectiveSlipstreamRange } from './weather/weather.js';
import { getEffectiveSpeedLimit, getCornerOverheatPenalty, getSlipstreamSectorBonus, isInFreeBoostSector, isInWeatherSector } from './weather/road-conditions.js';

// -- Initialization --

export interface GameConfig {
  playerIds: string[];
  lapTarget: number;
  stressCount?: number;
  seed: number;
  corners?: CornerDef[];
  totalSpaces?: number;
  startFinishLine?: number;
  trackId?: string;
  /** Starting positions per player (index 0 = first player, etc.) */
  startingPositions?: number[];
  /** Game mode: 'race' (default) or 'qualifying' (solo). */
  mode?: GameMode;
}

/**
 * Create the initial game state.
 * Shuffles each player's deck and deals starting hands.
 */
export function initGame(config: GameConfig): GameState {
  const { playerIds, lapTarget, seed } = config;
  const mode = config.mode ?? 'race';
  const stressCount = config.stressCount ?? DEFAULT_STRESS_COUNT;

  const minPlayers = mode === 'qualifying' ? 1 : 2;
  if (playerIds.length < minPlayers) {
    throw new Error(`Need at least ${minPlayers} players`);
  }

  const rng = createRng(seed);

  const players: PlayerState[] = playerIds.map((id, i) => {
    const deck = buildStartingDeck(stressCount);
    const shuffledDeck = shuffle(deck, rng);
    const engineZone = buildEngineZone();

    const startPos = config.startingPositions ? config.startingPositions[i] : 0;

    let player: PlayerState = {
      id,
      gear: 1 as Gear,
      hand: [],
      drawPile: shuffledDeck,
      discardPile: [],
      engineZone,
      position: startPos,
      lapCount: 0,
      speed: 0,
      hasBoosted: false,
      adrenalineCooldownBonus: 0,
      playedCards: [],
      previousPosition: startPos,
    };

    player = drawCards(player, HAND_SIZE, rng);
    return player;
  });

  const turnOrder = playerIds.map((_, i) => i);

  return {
    players,
    round: 1,
    phase: 'gear-shift',
    activePlayerIndex: 0,
    turnOrder,
    lapTarget,
    raceStatus: 'racing',
    mode,
    corners: config.corners ?? [],
    totalSpaces: config.totalSpaces ?? 100,
    startFinishLine: config.startFinishLine ?? 0,
    trackId: config.trackId ?? '',
    ...(mode === 'qualifying' ? { lapTimes: [], lapStartRound: 1 } : {}),
  };
}

// -- Phase 1: Gear Shift (simultaneous) --

export interface GearSelection {
  playerIndex: number;
  targetGear: Gear;
}

/**
 * All players shift gears simultaneously.
 * Transitions to 'play-cards'.
 */
export function executeGearShiftPhase(
  state: GameState,
  selections: GearSelection[],
): GameState {
  assertPhase(state, 'gear-shift');

  if (selections.length !== state.players.length) {
    throw new Error(
      `Expected gear selections from all ${state.players.length} players, got ${selections.length}`,
    );
  }

  let players = [...state.players];

  for (const sel of selections) {
    const player = players[sel.playerIndex];
    const result = shiftGear(player, sel.targetGear);
    if (!result.ok) {
      throw new Error(`Player ${sel.playerIndex}: invalid gear shift: ${result.reason}`);
    }
    players = replacePlayer(players, sel.playerIndex, result.player);
  }

  return {
    ...state,
    players,
    phase: 'play-cards',
  };
}

// -- Phase 2: Play Cards (simultaneous) --

export interface CardSelection {
  playerIndex: number;
  cardIndices: number[];
}

/**
 * All players select cards from hand simultaneously.
 * Cards move from hand to playedCards (face-down, pending reveal).
 * Detects cluttered hand: if a player can't play enough cards, their car
 * doesn't move, gear resets to 1st.
 * Transitions to 'reveal-and-move'.
 */
export function executePlayCardsPhase(
  state: GameState,
  selections: CardSelection[],
): GameState {
  assertPhase(state, 'play-cards');

  if (selections.length !== state.players.length) {
    throw new Error(
      `Expected card selections from all ${state.players.length} players, got ${selections.length}`,
    );
  }

  let players = [...state.players];

  for (const sel of selections) {
    const player = players[sel.playerIndex];
    const requiredCount = CARDS_PER_GEAR[player.gear];

    // Check for cluttered hand
    if (sel.cardIndices.length === 0) {
      const playableCount = player.hand.filter(isPlayableCard).length;
      if (playableCount < requiredCount) {
        // Cluttered hand: gear reset to 1st, no cards played
        players = replacePlayer(players, sel.playerIndex, {
          ...player,
          gear: 1 as Gear,
          playedCards: [],
          previousPosition: player.position,
          speed: 0,
        });
        continue;
      }
    }

    if (sel.cardIndices.length !== requiredCount) {
      throw new Error(
        `Player ${sel.playerIndex}: must play exactly ${requiredCount} card(s) in gear ${player.gear}, got ${sel.cardIndices.length}`,
      );
    }

    // Validate and extract cards
    const hand = [...player.hand];
    const playedCards: Card[] = [];
    const sortedIndices = [...sel.cardIndices].sort((a, b) => b - a);

    for (const idx of sortedIndices) {
      if (idx < 0 || idx >= hand.length) {
        throw new Error(`Player ${sel.playerIndex}: invalid hand index: ${idx}`);
      }
      const card = hand[idx];
      if (!isPlayableCard(card)) {
        throw new Error(
          `Player ${sel.playerIndex}: card of type '${card.type}' cannot be played`,
        );
      }
      playedCards.push(...hand.splice(idx, 1));
    }

    players = replacePlayer(players, sel.playerIndex, {
      ...player,
      hand,
      playedCards,
      previousPosition: player.position,
    });
  }

  // Compute turn order for sequential phases (leader first)
  const turnOrder = computeTurnOrder(players);

  return {
    ...state,
    players,
    turnOrder,
    phase: 'reveal-and-move',
    activePlayerIndex: turnOrder[0],
  };
}

// -- Phase 3: Reveal & Move (sequential) --

/**
 * Reveal and resolve the active player's played cards.
 * Stress cards flip from draw pile until a Speed card is found.
 * Sums speed, moves the car, then advances to next player or Phase 4.
 */
export function executeRevealAndMove(
  state: GameState,
  playerIndex: number,
  rng: () => number,
): GameState {
  assertPhase(state, 'reveal-and-move');
  assertActivePlayer(state, playerIndex);

  let player = state.players[playerIndex];

  // Cluttered hand: skip (no played cards)
  if (player.playedCards.length === 0) {
    const players = replacePlayer(state.players, playerIndex, {
      ...player,
      speed: 0,
    });
    return advanceSequentialPhase(
      { ...state, players },
      playerIndex,
      'reveal-and-move',
      'adrenaline',
    );
  }

  // Resolve each played card
  let totalSpeed = 0;
  let drawPile = [...player.drawPile];
  let discardPile = [...player.discardPile];
  const resolvedCards: Card[] = [];

  for (const card of player.playedCards) {
    if (card.type === 'stress') {
      // Stress resolution: flip from draw pile until Speed card found
      const result = resolveStressFlip(drawPile, discardPile, rng);
      totalSpeed += result.speed;
      drawPile = result.drawPile;
      discardPile = result.discardPile;
      resolvedCards.push(card);
    } else {
      const value = getCardSpeedValue(card);
      if (value !== null) {
        totalSpeed += value;
      }
      resolvedCards.push(card);
    }
  }

  // Move all played cards to discard
  discardPile = [...discardPile, ...resolvedCards];

  const updatedPlayer: PlayerState = {
    ...player,
    drawPile,
    discardPile,
    playedCards: [],
    speed: totalSpeed,
    position: player.position + totalSpeed,
  };

  const players = replacePlayer(state.players, playerIndex, updatedPlayer);

  return advanceSequentialPhase(
    { ...state, players },
    playerIndex,
    'reveal-and-move',
    'adrenaline',
  );
}

// -- Phase Skipping (qualifying mode) --

/**
 * Check if a phase should be skipped in qualifying mode.
 * Adrenaline and slipstream have no effect with 1 player.
 */
export function shouldSkipPhase(state: GameState, phase: GamePhase): boolean {
  if (state.mode !== 'qualifying') return false;
  return phase === 'adrenaline' || phase === 'slipstream';
}

// -- Phase 4: Adrenaline (automatic/conditional) --

/**
 * Adrenaline phase: last-place player (or last 2 in 5+ players)
 * gains +1 speed and +1 cooldown bonus.
 * Transitions to 'react'.
 *
 * In qualifying mode, skips entirely (no opponents = no relative positions).
 */
export function executeAdrenaline(state: GameState): GameState {
  assertPhase(state, 'adrenaline');

  // Skip in qualifying mode — no opponents to compare against
  if (state.mode === 'qualifying') {
    return {
      ...state,
      phase: 'react',
      activePlayerIndex: state.turnOrder[0],
    };
  }

  const playerCount = state.players.length;
  let players = [...state.players];

  // Find last-place player(s) by position
  const positions = players.map((p, i) => ({ index: i, position: p.position }));
  positions.sort((a, b) => a.position - b.position); // Ascending: worst first

  // Last place gets adrenaline; in 5+ players, last 2 get it
  const adrenalineCount = playerCount >= 5 ? 2 : 1;
  const adrenalinePlayers = positions.slice(0, adrenalineCount);

  for (const { index } of adrenalinePlayers) {
    const player = players[index];
    players = replacePlayer(players, index, {
      ...player,
      speed: player.speed + 1,
      position: player.position + 1,
      adrenalineCooldownBonus: 1,
    });
  }

  return {
    ...state,
    players,
    phase: 'react',
    activePlayerIndex: state.turnOrder[0],
  };
}

// -- Phase 5: React (sequential) — Cooldown & Boost --

export interface CooldownAction {
  type: 'cooldown';
  playerIndex: number;
  /** Indices of Heat cards in hand to move to engine zone. */
  heatIndices: number[];
}

/**
 * Execute cooldown: move Heat cards from HAND to engine zone.
 * Limited by gear's cooldown allowance + adrenaline bonus.
 */
export function executeCooldown(
  state: GameState,
  action: CooldownAction,
): GameState {
  assertPhase(state, 'react');
  assertActivePlayer(state, action.playerIndex);

  const player = state.players[action.playerIndex];
  const baseCooldown = getEffectiveCooldown(player.gear, state.weather);
  const maxCooldown = baseCooldown + player.adrenalineCooldownBonus;

  if (action.heatIndices.length > maxCooldown) {
    throw new Error(
      `Cooldown limit is ${maxCooldown} in gear ${player.gear}, tried ${action.heatIndices.length}`,
    );
  }

  const hand = [...player.hand];
  const engineZone = [...player.engineZone];
  const sortedIndices = [...action.heatIndices].sort((a, b) => b - a);

  for (const idx of sortedIndices) {
    if (idx < 0 || idx >= hand.length) {
      throw new Error(`Invalid hand index: ${idx}`);
    }
    const card = hand[idx];
    if (card.type !== 'heat') {
      throw new Error('Can only cool down Heat cards');
    }
    hand.splice(idx, 1);
    engineZone.push(card);
  }

  const players = replacePlayer(state.players, action.playerIndex, {
    ...player,
    hand,
    engineZone,
  });

  return { ...state, players };
}

export interface BoostAction {
  type: 'boost';
  playerIndex: number;
}

/**
 * Execute boost: pay 1 Heat from engine, flip cards from draw pile
 * until a Speed card is found. The Speed card's value is added to
 * both position and speed (affects corner checks).
 * Available in any gear. Max once per turn.
 */
export function executeBoost(
  state: GameState,
  action: BoostAction,
  rng: () => number,
): GameState {
  assertPhase(state, 'react');
  assertActivePlayer(state, action.playerIndex);

  const player = state.players[action.playerIndex];

  if (player.hasBoosted) {
    throw new Error('Already boosted this round');
  }

  const freeBoost = isInFreeBoostSector(
    player.position, state.corners, state.totalSpaces, state.roadConditions,
  );

  let engineZone = [...player.engineZone];
  let discardPile = [...player.discardPile];

  if (!freeBoost) {
    // Pay 1 Heat from engine
    const heatIndex = engineZone.findIndex(c => c.type === 'heat');
    if (heatIndex === -1) {
      throw new Error('No Heat in engine zone to pay for boost');
    }
    const [heatCard] = engineZone.splice(heatIndex, 1);
    discardPile.push(heatCard);
  }

  // Flip cards from draw pile until Speed card found
  let drawPile = [...player.drawPile];
  let boostSpeed = 0;

  while (true) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break;
      const toShuffle = [...discardPile];
      discardPile = [];
      drawPile = shuffle(toShuffle, rng);
    }

    const flipped = drawPile.pop()!;
    const speedValue = getCardSpeedValue(flipped);

    if (speedValue !== null && flipped.type === 'speed') {
      boostSpeed = speedValue;
      discardPile.push(flipped);
      break;
    }

    discardPile.push(flipped);
  }

  const players = replacePlayer(state.players, action.playerIndex, {
    ...player,
    drawPile,
    discardPile,
    engineZone,
    position: player.position + boostSpeed,
    speed: player.speed + boostSpeed,
    hasBoosted: true,
  });

  return { ...state, players };
}

/**
 * End the react phase for the active player.
 * Advances to the next player or transitions to Phase 6 (slipstream).
 */
export function endReactPhase(state: GameState, playerIndex: number): GameState {
  assertPhase(state, 'react');
  assertActivePlayer(state, playerIndex);

  return advanceSequentialPhase(state, playerIndex, 'react', 'slipstream');
}

// -- Phase 6: Slipstream (sequential) --

export interface SlipstreamAction {
  type: 'slipstream';
  playerIndex: number;
  accept: boolean;
}

/**
 * Slipstream: if a car is 1-2 spaces behind another car, it may move +2 spaces.
 * The +2 does NOT affect speed for corner checks.
 *
 * In qualifying mode, auto-declines (no other cars to draft).
 */
export function executeSlipstream(
  state: GameState,
  action: SlipstreamAction,
): GameState {
  assertPhase(state, 'slipstream');
  assertActivePlayer(state, action.playerIndex);

  // In qualifying mode, skip slipstream — no other cars
  if (state.mode === 'qualifying') {
    return advanceSequentialPhase(
      state,
      action.playerIndex,
      'slipstream',
      'check-corner',
    );
  }

  const player = state.players[action.playerIndex];
  let players = state.players;

  if (action.accept) {
    if (!isSlipstreamAllowedByWeather(state.weather)) {
      throw new Error('Slipstream is disabled by weather');
    }

    const otherPositions = state.players
      .filter((_, i) => i !== action.playerIndex)
      .map(p => p.position);

    const slipstreamRange = getEffectiveSlipstreamRange(state.weather);

    if (!isSlipstreamEligible(player.position, otherPositions, state.totalSpaces, slipstreamRange)) {
      throw new Error('Not eligible for slipstream');
    }

    const sectorBonus = getSlipstreamSectorBonus(
      player.position, state.corners, state.totalSpaces, state.roadConditions,
    );
    const slipstreamDistance = 2 + sectorBonus;

    players = replacePlayer(state.players, action.playerIndex, {
      ...player,
      position: player.position + slipstreamDistance,
    });
  }

  return advanceSequentialPhase(
    { ...state, players },
    action.playerIndex,
    'slipstream',
    'check-corner',
  );
}

// -- Phase 7: Check Corner (sequential/automatic) --

/**
 * Check corners crossed by the active player.
 * For each corner: if speed > limit, pay (speed - limit) Heat from engine.
 * If Heat insufficient, spinout occurs.
 * Advances to next player or Phase 8 (discard).
 */
export function executeCheckCorner(
  state: GameState,
  playerIndex: number,
): GameState {
  assertPhase(state, 'check-corner');
  assertActivePlayer(state, playerIndex);

  let player = state.players[playerIndex];

  // Find corners crossed during the full movement (phases 3 + 6)
  const cornersCrossed = findCornersCrossed(
    player.previousPosition,
    player.position,
    state.corners,
    state.totalSpaces,
  );

  let players = state.players;

  for (const corner of cornersCrossed) {
    player = players[playerIndex];
    const effectiveLimit = getEffectiveSpeedLimit(corner, state.roadConditions);
    const overspeed = player.speed - effectiveLimit;

    if (overspeed > 0) {
      // Extra Heat penalty from overheat road condition
      const overheatPenalty = getCornerOverheatPenalty(corner.id, state.roadConditions);
      const heatCost = overspeed + overheatPenalty;

      // Must pay Heat from engine
      const heatInEngine = player.engineZone.filter(c => c.type === 'heat').length;

      if (heatInEngine >= heatCost) {
        // Pay Heat penalty
        const engineZone = [...player.engineZone];
        const discardPile = [...player.discardPile];

        for (let i = 0; i < heatCost; i++) {
          const hIdx = engineZone.findIndex(c => c.type === 'heat');
          const [paid] = engineZone.splice(hIdx, 1);
          discardPile.push(paid);
        }

        players = replacePlayer(players, playerIndex, {
          ...player,
          engineZone,
          discardPile,
        });
      } else {
        // Spinout: can't pay enough Heat
        players = applySpinout(players, playerIndex, corner, state.totalSpaces, state.roadConditions);
        break; // No further corner checks after spinout
      }
    }
  }

  return advanceSequentialPhase(
    { ...state, players },
    playerIndex,
    'check-corner',
    'discard',
  );
}

// -- Phase 8: Discard (simultaneous) --

export interface DiscardSelection {
  playerIndex: number;
  cardIndices: number[];
}

/**
 * All players may optionally discard playable cards from hand.
 * Transitions to 'replenish'.
 */
export function executeDiscardPhase(
  state: GameState,
  selections: DiscardSelection[],
): GameState {
  assertPhase(state, 'discard');

  let players = [...state.players];

  for (const sel of selections) {
    if (sel.cardIndices.length === 0) continue;

    const player = players[sel.playerIndex];

    // Validate all cards are playable (can only discard playable cards)
    for (const idx of sel.cardIndices) {
      if (idx < 0 || idx >= player.hand.length) {
        throw new Error(`Player ${sel.playerIndex}: invalid hand index: ${idx}`);
      }
      if (!isPlayableCard(player.hand[idx])) {
        throw new Error(`Player ${sel.playerIndex}: can only discard playable cards`);
      }
    }

    players = replacePlayer(players, sel.playerIndex, discardFromHand(player, sel.cardIndices));
  }

  return {
    ...state,
    players,
    phase: 'replenish',
  };
}

// -- Phase 9: Replenish (simultaneous) --

/**
 * All players draw to 7 cards. Check lap/race completion.
 * Reset per-round state. Advance to next round or finish.
 */
export function executeReplenishPhase(
  state: GameState,
  rng: () => number,
): GameState {
  assertPhase(state, 'replenish');

  let players = [...state.players];

  // Replenish all hands
  for (let i = 0; i < players.length; i++) {
    players = replacePlayer(players, i, replenishHand(players[i], rng));
  }

  // Check lap completion for all players
  const prevLapCounts = players.map(p => p.lapCount);
  for (let i = 0; i < players.length; i++) {
    players = checkLapCompletion(players, i, state.totalSpaces);
  }

  // Track lap times in qualifying mode
  let lapTimes = state.lapTimes ? [...state.lapTimes] : undefined;
  let lapStartRound = state.lapStartRound;
  if (state.mode === 'qualifying' && lapTimes !== undefined && lapStartRound !== undefined) {
    const player = players[0];
    if (player.lapCount > prevLapCounts[0]) {
      // Lap just completed — record the lap time (rounds for this lap)
      const lapTime = state.round - lapStartRound + 1;
      lapTimes.push(lapTime);
      lapStartRound = state.round + 1;
    }
  }

  // Check if race is finished
  const raceStatus = checkRaceFinished(players, state.lapTarget, state.raceStatus);

  if (raceStatus === 'finished') {
    return {
      ...state,
      players,
      phase: 'finished',
      raceStatus: 'finished',
      lapTimes,
      lapStartRound,
    };
  }

  // Reset per-round state for all players
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    players = replacePlayer(players, i, {
      ...player,
      speed: 0,
      hasBoosted: false,
      adrenalineCooldownBonus: 0,
      playedCards: [],
      previousPosition: player.position,
    });
  }

  // New round
  const turnOrder = computeTurnOrder(players);

  return {
    ...state,
    players,
    round: state.round + 1,
    phase: 'gear-shift',
    activePlayerIndex: turnOrder[0],
    turnOrder,
    raceStatus,
    lapTimes,
    lapStartRound,
  };
}

// -- Turn Order --

/**
 * Compute turn order: furthest ahead first.
 * Tiebreaker: player index (lower goes first — placeholder for race-line).
 */
export function computeTurnOrder(players: PlayerState[]): number[] {
  return players
    .map((p, i) => ({ index: i, position: p.position }))
    .sort((a, b) => {
      if (b.position !== a.position) return b.position - a.position;
      return a.index - b.index;
    })
    .map(entry => entry.index);
}

// -- Cluttered Hand Detection --

/**
 * Check if a player has a cluttered hand: not enough playable cards
 * to meet the gear requirement.
 */
export function isClutteredHand(player: PlayerState): boolean {
  const playableCount = player.hand.filter(isPlayableCard).length;
  return playableCount < CARDS_PER_GEAR[player.gear];
}

// -- Slipstream Eligibility --

/**
 * Check if a player is eligible for slipstream.
 * Eligible if any other car is 1-2 spaces ahead (circular track).
 */
export function isSlipstreamEligible(
  playerPosition: number,
  otherPositions: number[],
  totalSpaces: number,
  range: number = 2,
): boolean {
  for (const otherPos of otherPositions) {
    const spacesAhead = (otherPos - playerPosition + totalSpaces) % totalSpaces;
    if (spacesAhead >= 1 && spacesAhead <= range) return true;
  }
  return false;
}

// -- Corner Detection --

/**
 * Find corners crossed when moving from `from` to `to` on a circular track.
 * Returns corners in traversal order.
 */
export function findCornersCrossed(
  from: number,
  to: number,
  corners: CornerDef[],
  totalSpaces: number,
): CornerDef[] {
  if (from === to) return [];
  const traversed = spacesTraversed(from, to, totalSpaces);
  // Filter and sort corners by their position in the traversal order
  return corners
    .filter(c => traversed.includes(c.position))
    .sort((a, b) => traversed.indexOf(a.position) - traversed.indexOf(b.position));
}

/**
 * Get the ordered list of space indices traversed when moving from `from` to `to`.
 * Exclusive of `from`, inclusive of `to`. Handles wrapping.
 */
function spacesTraversed(from: number, to: number, totalSpaces: number): number[] {
  const spaces: number[] = [];
  let current = from;
  while (current !== to) {
    current = (current + 1) % totalSpaces;
    spaces.push(current);
  }
  return spaces;
}

// -- Stress Resolution --

/**
 * Flip cards from draw pile until a Speed card is found.
 * Returns the speed value and updated pile states.
 * All flipped cards (including the Speed card) go to discard.
 */
function resolveStressFlip(
  drawPile: Card[],
  discardPile: Card[],
  rng: () => number,
): { speed: number; drawPile: Card[]; discardPile: Card[] } {
  let dp = [...drawPile];
  let disc = [...discardPile];
  let speed = 0;

  while (true) {
    if (dp.length === 0) {
      if (disc.length === 0) break; // No cards left
      dp = shuffle(disc, rng);
      disc = [];
    }

    const flipped = dp.pop()!;

    if (flipped.type === 'speed') {
      speed = flipped.value;
      disc.push(flipped);
      break;
    }

    disc.push(flipped);
  }

  return { speed, drawPile: dp, discardPile: disc };
}

// -- Spinout --

/**
 * Apply spinout: move car back before the corner, award stress cards,
 * reset gear to 1st.
 */
function applySpinout(
  players: PlayerState[],
  playerIndex: number,
  corner: CornerDef,
  totalSpaces: number,
  roadConditions?: import('./types.js').RoadConditionPlacement[],
): PlayerState[] {
  const player = players[playerIndex];

  // Position before corner: one space before the corner line
  const positionBeforeCorner = (corner.position - 1 + totalSpaces) % totalSpaces;

  // Award stress cards based on gear
  let stressCount = SPINOUT_STRESS[player.gear];

  // Weather-sector road condition at this corner adds +1 extra stress on spinout
  if (roadConditions) {
    const placement = roadConditions.find(rc => rc.cornerId === corner.id);
    if (placement?.token.target === 'sector' && placement.token.modType === 'weather-sector') {
      stressCount += 1;
    }
  }

  const stressCards: Card[] = Array.from({ length: stressCount }, () => stressCard());

  return replacePlayer(players, playerIndex, {
    ...player,
    position: positionBeforeCorner,
    gear: 1 as Gear,
    discardPile: [...player.discardPile, ...stressCards],
  });
}

// -- Lap and Race Completion --

function checkLapCompletion(
  players: PlayerState[],
  playerIndex: number,
  totalSpaces: number,
): PlayerState[] {
  const player = players[playerIndex];
  const completedLaps = Math.floor(player.position / totalSpaces);

  if (completedLaps > player.lapCount) {
    return replacePlayer(players, playerIndex, {
      ...player,
      lapCount: completedLaps,
    });
  }

  return players;
}

function checkRaceFinished(
  players: PlayerState[],
  lapTarget: number,
  currentStatus: RaceStatus,
): RaceStatus {
  const anyFinished = players.some(p => p.lapCount >= lapTarget);
  if (!anyFinished) return currentStatus === 'final-round' ? 'final-round' : 'racing';
  // First car crossed finish line this round — this round is the final round.
  // Since we're already at the end of the round (replenish), the race is finished.
  return 'finished';
}

// -- Helpers --

function assertPhase(state: GameState, expected: GamePhase): void {
  if (state.phase !== expected) {
    throw new Error(`Expected phase '${expected}', but in phase '${state.phase}'`);
  }
}

function assertActivePlayer(state: GameState, playerIndex: number): void {
  if (state.activePlayerIndex !== playerIndex) {
    throw new Error(
      `Player ${playerIndex} is not the active player (active: ${state.activePlayerIndex})`,
    );
  }
}

function replacePlayer(
  players: PlayerState[],
  index: number,
  updated: PlayerState,
): PlayerState[] {
  const result = [...players];
  result[index] = updated;
  return result;
}

/**
 * Advance through a sequential phase: move to the next player in turn order,
 * or transition to the next phase if all players have been processed.
 */
function advanceSequentialPhase(
  state: GameState,
  currentPlayerIndex: number,
  currentPhase: GamePhase,
  nextPhase: GamePhase,
): GameState {
  const currentTurnIdx = state.turnOrder.indexOf(currentPlayerIndex);
  const nextTurnIdx = currentTurnIdx + 1;

  if (nextTurnIdx < state.turnOrder.length) {
    return {
      ...state,
      activePlayerIndex: state.turnOrder[nextTurnIdx],
    };
  }

  // All players processed, transition to next phase
  if (nextPhase === 'discard' || nextPhase === 'replenish') {
    // Simultaneous phases don't need activePlayerIndex
    return { ...state, phase: nextPhase };
  }

  return {
    ...state,
    phase: nextPhase,
    activePlayerIndex: state.turnOrder[0],
  };
}
