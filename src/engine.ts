/**
 * Core game engine: state initialization, phase transitions, and turn execution.
 *
 * All state transitions are deterministic given the same inputs and RNG seed.
 */

import type {
  Card,
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
} from './types.js';
import { buildStartingDeck, buildEngineZone, getCardSpeedValue } from './cards.js';
import { shuffle, drawCards, replenishHand, createRng } from './deck.js';
import { shiftGear } from './gear.js';

// -- Initialization --

export interface GameConfig {
  playerIds: string[];
  lapTarget: number;
  stressCount?: number;
  seed: number;
}

/**
 * Create the initial game state.
 * Shuffles each player's deck and deals starting hands.
 */
export function initGame(config: GameConfig): GameState {
  const { playerIds, lapTarget, seed } = config;
  const stressCount = config.stressCount ?? DEFAULT_STRESS_COUNT;

  if (playerIds.length < 2) {
    throw new Error('Need at least 2 players');
  }

  const rng = createRng(seed);

  const players: PlayerState[] = playerIds.map((id) => {
    const deck = buildStartingDeck(stressCount);
    const shuffledDeck = shuffle(deck, rng);
    const engineZone = buildEngineZone();

    // Draw initial hand of 7
    let player: PlayerState = {
      id,
      gear: 1 as Gear,
      hand: [],
      drawPile: shuffledDeck,
      discardPile: [],
      engineZone,
      position: 0,
      lapCount: 0,
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
  };
}

// -- Phase: Gear Shift --

export interface GearShiftAction {
  type: 'gear-shift';
  playerIndex: number;
  targetGear: Gear;
}

/**
 * Execute a gear shift for the active player.
 */
export function executeGearShift(
  state: GameState,
  action: GearShiftAction,
): GameState {
  assertPhase(state, 'gear-shift');
  assertActivePlayer(state, action.playerIndex);

  const player = state.players[action.playerIndex];
  const result = shiftGear(player, action.targetGear);

  if (!result.ok) {
    throw new Error(`Invalid gear shift: ${result.reason}`);
  }

  const players = replacePlayer(state.players, action.playerIndex, result.player);

  return {
    ...state,
    players,
    phase: 'play-cards',
  };
}

// -- Phase: Play Cards --

export interface PlayCardsAction {
  type: 'play-cards';
  playerIndex: number;
  cardIndices: number[];
}

/**
 * Execute card play for the active player.
 *
 * The number of cards played must match the current gear.
 * Cards are moved from hand to discard pile, and their speed values
 * are summed to determine movement.
 */
export function executePlayCards(
  state: GameState,
  action: PlayCardsAction,
): GameState {
  assertPhase(state, 'play-cards');
  assertActivePlayer(state, action.playerIndex);

  const player = state.players[action.playerIndex];
  const requiredCount = CARDS_PER_GEAR[player.gear];

  if (action.cardIndices.length !== requiredCount) {
    throw new Error(
      `Must play exactly ${requiredCount} card(s) in gear ${player.gear}, got ${action.cardIndices.length}`,
    );
  }

  // Validate indices and compute movement
  const hand = [...player.hand];
  const playedCards: Card[] = [];
  const sortedIndices = [...action.cardIndices].sort((a, b) => b - a);

  for (const idx of sortedIndices) {
    if (idx < 0 || idx >= hand.length) {
      throw new Error(`Invalid hand index: ${idx}`);
    }
    playedCards.push(...hand.splice(idx, 1));
  }

  // Compute total speed
  let totalSpeed = 0;
  for (const card of playedCards) {
    const value = getCardSpeedValue(card);
    if (value === null) {
      throw new Error(`Card of type '${card.type}' cannot be played for speed`);
    }
    totalSpeed += value;
  }

  const updatedPlayer: PlayerState = {
    ...player,
    hand,
    discardPile: [...player.discardPile, ...playedCards],
    position: player.position + totalSpeed,
  };

  const players = replacePlayer(state.players, action.playerIndex, updatedPlayer);

  return {
    ...state,
    players,
    phase: 'react',
  };
}

// -- Phase: React (Cooldown & Boost) --

export interface CooldownAction {
  type: 'cooldown';
  playerIndex: number;
  /** Indices of Heat cards in discard pile to move back to engine zone. */
  heatIndices: number[];
}

/**
 * Execute cooldown: move Heat cards from discard pile back to engine zone.
 * Number of cards cannot exceed the cooldown limit for the current gear.
 */
export function executeCooldown(
  state: GameState,
  action: CooldownAction,
): GameState {
  assertPhase(state, 'react');
  assertActivePlayer(state, action.playerIndex);

  const player = state.players[action.playerIndex];
  const maxCooldown = COOLDOWN_PER_GEAR[player.gear];

  if (action.heatIndices.length > maxCooldown) {
    throw new Error(
      `Cooldown limit is ${maxCooldown} in gear ${player.gear}, tried ${action.heatIndices.length}`,
    );
  }

  const discardPile = [...player.discardPile];
  const engineZone = [...player.engineZone];
  const sortedIndices = [...action.heatIndices].sort((a, b) => b - a);

  for (const idx of sortedIndices) {
    if (idx < 0 || idx >= discardPile.length) {
      throw new Error(`Invalid discard pile index: ${idx}`);
    }
    const card = discardPile[idx];
    if (card.type !== 'heat') {
      throw new Error('Can only cool down Heat cards');
    }
    discardPile.splice(idx, 1);
    engineZone.push(card);
  }

  const players = replacePlayer(state.players, action.playerIndex, {
    ...player,
    discardPile,
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
 * the player's position. All flipped cards go to discard.
 *
 * Boost is available in any gear (per Simon's correction).
 * Max once per turn.
 */
export function executeBoost(
  state: GameState,
  action: BoostAction,
  rng: () => number,
): GameState {
  assertPhase(state, 'react');
  assertActivePlayer(state, action.playerIndex);

  const player = state.players[action.playerIndex];

  // Pay 1 Heat from engine
  const heatIndex = player.engineZone.findIndex(c => c.type === 'heat');
  if (heatIndex === -1) {
    throw new Error('No Heat in engine zone to pay for boost');
  }

  const engineZone = [...player.engineZone];
  const [heatCard] = engineZone.splice(heatIndex, 1);

  // Flip cards from draw pile until we find a Speed card
  let drawPile = [...player.drawPile];
  let discardPile = [...player.discardPile, heatCard];
  let boostSpeed = 0;

  while (true) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break;
      // Note: we need to shuffle discard into draw, but the Heat card
      // we just paid should already be in discard
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
  });

  return { ...state, players };
}

// -- Phase: Replenish --

/**
 * Transition from react to replenish phase.
 * Call this when the player is done with their react actions.
 */
export function endReactPhase(state: GameState, playerIndex: number): GameState {
  assertPhase(state, 'react');
  assertActivePlayer(state, playerIndex);

  return { ...state, phase: 'replenish' };
}

/**
 * Replenish the active player's hand to 7 cards and advance to the next player
 * or the next round.
 */
export function executeReplenish(
  state: GameState,
  playerIndex: number,
  rng: () => number,
): GameState {
  assertPhase(state, 'replenish');
  assertActivePlayer(state, playerIndex);

  const player = state.players[playerIndex];
  const replenished = replenishHand(player, rng);
  let players = replacePlayer(state.players, playerIndex, replenished);

  // Check if player crossed lap threshold
  players = checkLapCompletion(players, playerIndex, state.lapTarget);

  // Check if race is finished
  const raceStatus = checkRaceFinished(players, state.lapTarget);

  // Advance to next player or next round
  const currentTurnIdx = state.turnOrder.indexOf(playerIndex);
  const nextTurnIdx = currentTurnIdx + 1;

  if (raceStatus === 'finished') {
    return {
      ...state,
      players,
      phase: 'finished',
      raceStatus: 'finished',
    };
  }

  if (nextTurnIdx < state.turnOrder.length) {
    // Next player's turn
    return {
      ...state,
      players,
      phase: 'gear-shift',
      activePlayerIndex: state.turnOrder[nextTurnIdx],
    };
  }

  // New round
  return {
    ...state,
    players,
    round: state.round + 1,
    phase: 'gear-shift',
    activePlayerIndex: state.turnOrder[0],
  };
}

// -- Lap and Race Completion --

/**
 * Track length is abstracted as a position threshold.
 * For now, each "lap" is defined by reaching a certain position.
 * This can be refined when track data is added.
 *
 * Simple model: trackLength positions per lap.
 */
const TRACK_LENGTH = 100; // Placeholder, configurable per track later

function checkLapCompletion(
  players: PlayerState[],
  playerIndex: number,
  _lapTarget: number,
): PlayerState[] {
  const player = players[playerIndex];
  const completedLaps = Math.floor(player.position / TRACK_LENGTH);

  if (completedLaps > player.lapCount) {
    return replacePlayer(players, playerIndex, {
      ...player,
      lapCount: completedLaps,
    });
  }

  return players;
}

function checkRaceFinished(players: PlayerState[], lapTarget: number): RaceStatus {
  const anyFinished = players.some(p => p.lapCount >= lapTarget);
  return anyFinished ? 'finished' : 'racing';
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
