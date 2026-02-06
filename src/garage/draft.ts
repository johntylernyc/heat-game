/**
 * Garage draft state machine.
 *
 * Implements the snake draft procedure:
 * 1. After placing cars on grid, each round deals face-up cards = players + 3
 * 2. Three rounds of drafting in snake order based on grid position:
 *    - Round 1: LAST to FIRST (back picks first)
 *    - Round 2: FIRST to LAST (front picks first)
 *    - Round 3: LAST to FIRST (back picks first)
 * 3. Each player drafts 1 card per round (3 total)
 * 4. Unpicked cards each round are removed from play
 * 5. Drafted cards replace the 3 standard starting upgrades in the player's deck
 *
 * All state transitions are pure functions returning new state.
 */

import type {
  DraftState,
  DraftPlayerState,
  GarageUpgradeCard,
} from './types.js';
import { DRAFT_ROUNDS, DRAFT_ROUND_DIRECTIONS } from './types.js';
import { ALL_GARAGE_UPGRADE_CARDS } from './upgrade-cards.js';
import { shuffle } from '../deck.js';

// -- Initialization --

export interface DraftConfig {
  /** Player IDs in game order. */
  playerIds: string[];
  /** Grid positions for each player (1 = pole). Must match playerIds length. */
  gridPositions: number[];
  /** RNG seed for shuffling the upgrade card pool. */
  seed: number;
  /** Optional: custom card pool (defaults to all 22 garage upgrade cards). */
  cardPool?: GarageUpgradeCard[];
}

/** Cards dealt face-up each round = playerCount + 3. */
export function cardsPerRound(playerCount: number): number {
  return playerCount + 3;
}

/**
 * Initialize the draft state.
 *
 * Shuffles the upgrade card pool and deals (players + 3) face-up cards
 * for the first round. Computes pick orders for all 3 rounds.
 */
export function initDraft(config: DraftConfig): DraftState {
  const { playerIds, gridPositions, seed, cardPool } = config;

  if (playerIds.length < 2) {
    throw new Error('Need at least 2 players for draft');
  }
  if (playerIds.length !== gridPositions.length) {
    throw new Error('playerIds and gridPositions must have same length');
  }

  const rng = createDraftRng(seed);
  const pool = cardPool ?? [...ALL_GARAGE_UPGRADE_CARDS];
  const shuffled = shuffle(pool, rng);

  const dealCount = cardsPerRound(playerIds.length);
  const totalNeeded = dealCount * DRAFT_ROUNDS;
  if (shuffled.length < totalNeeded) {
    throw new Error(
      `Not enough upgrade cards: need ${totalNeeded} (${dealCount}/round × ${DRAFT_ROUNDS} rounds), have ${shuffled.length}`,
    );
  }

  // Deal first round
  const availableCards = shuffled.slice(0, dealCount);
  const remainingPool = shuffled.slice(dealCount);

  const players: DraftPlayerState[] = playerIds.map((id, i) => ({
    playerId: id,
    gridPosition: gridPositions[i],
    draftedCards: [],
  }));

  const pickOrders = computePickOrders(players);

  return {
    phase: 'drafting',
    playerCount: playerIds.length,
    players,
    availableCards,
    remainingPool,
    currentRound: 0,
    currentPickIndex: 0,
    pickOrders,
    undraftedCards: [],
  };
}

// -- Draft Actions --

export interface DraftPickAction {
  type: 'draft-pick';
  playerId: string;
  /** Index into availableCards. */
  cardIndex: number;
}

/**
 * Execute a draft pick for the current player.
 *
 * Validates:
 * - Draft is in 'drafting' phase
 * - It's the correct player's turn
 * - Card index is valid
 *
 * When a round ends, unpicked cards are removed from play and
 * new cards are dealt from the remaining pool for the next round.
 */
export function executeDraftPick(
  state: DraftState,
  action: DraftPickAction,
): DraftState {
  if (state.phase !== 'drafting') {
    throw new Error(`Cannot pick during phase '${state.phase}'`);
  }

  const currentPlayerIdx = state.pickOrders[state.currentRound][state.currentPickIndex];
  const currentPlayer = state.players[currentPlayerIdx];

  if (currentPlayer.playerId !== action.playerId) {
    throw new Error(
      `Not ${action.playerId}'s turn to pick (expected ${currentPlayer.playerId})`,
    );
  }

  if (action.cardIndex < 0 || action.cardIndex >= state.availableCards.length) {
    throw new Error(
      `Invalid card index: ${action.cardIndex} (${state.availableCards.length} available)`,
    );
  }

  // Take the card
  const pickedCard = state.availableCards[action.cardIndex];
  const availableCards = [
    ...state.availableCards.slice(0, action.cardIndex),
    ...state.availableCards.slice(action.cardIndex + 1),
  ];

  const updatedPlayer: DraftPlayerState = {
    ...currentPlayer,
    draftedCards: [...currentPlayer.draftedCards, pickedCard],
  };

  const players = [...state.players];
  players[currentPlayerIdx] = updatedPlayer;

  // Advance pick index
  const nextPickIndex = state.currentPickIndex + 1;
  const roundSize = state.pickOrders[state.currentRound].length;

  if (nextPickIndex < roundSize) {
    // More picks this round
    return {
      ...state,
      players,
      availableCards,
      currentPickIndex: nextPickIndex,
    };
  }

  // Round complete — remaining cards are undrafted
  const undraftedCards = [...state.undraftedCards, ...availableCards];
  const nextRound = state.currentRound + 1;

  if (nextRound < DRAFT_ROUNDS) {
    // Deal new cards for next round from remaining pool
    const dealCount = cardsPerRound(state.playerCount);
    const newAvailable = state.remainingPool.slice(0, dealCount);
    const newRemaining = state.remainingPool.slice(dealCount);

    return {
      ...state,
      players,
      availableCards: newAvailable,
      remainingPool: newRemaining,
      currentRound: nextRound,
      currentPickIndex: 0,
      undraftedCards,
    };
  }

  // All rounds complete — draft is done
  return {
    ...state,
    phase: 'complete',
    players,
    availableCards: [],
    remainingPool: [],
    currentRound: nextRound,
    currentPickIndex: 0,
    undraftedCards: [...undraftedCards, ...state.remainingPool],
  };
}

// -- Query Helpers --

/**
 * Get the player ID whose turn it is to pick.
 * Returns null if the draft is not in 'drafting' phase.
 */
export function getCurrentDrafter(state: DraftState): string | null {
  if (state.phase !== 'drafting') return null;

  const playerIdx = state.pickOrders[state.currentRound][state.currentPickIndex];
  return state.players[playerIdx].playerId;
}

/**
 * Get the drafted cards for a specific player.
 */
export function getPlayerDraftedCards(
  state: DraftState,
  playerId: string,
): GarageUpgradeCard[] {
  const player = state.players.find(p => p.playerId === playerId);
  if (!player) throw new Error(`Player not found: ${playerId}`);
  return player.draftedCards;
}

// -- Deck Integration --

/**
 * Build a starting deck that replaces the 3 default upgrades with drafted cards.
 *
 * Standard deck composition:
 * - 12 Speed cards (3x each of 1, 2, 3, 4)
 * - 3 Drafted upgrade cards (instead of default speed-0, speed-5, starting-heat)
 * - Stress cards (count varies by track)
 */
export function buildDraftedDeck(
  draftedCards: GarageUpgradeCard[],
  stressCount: number,
): Array<import('../types.js').Card | GarageUpgradeCard> {
  if (draftedCards.length !== DRAFT_ROUNDS) {
    throw new Error(`Expected ${DRAFT_ROUNDS} drafted cards, got ${draftedCards.length}`);
  }

  const deck: Array<import('../types.js').Card | GarageUpgradeCard> = [];

  // 12 Speed cards: 3x each of 1, 2, 3, 4
  for (const value of [1, 2, 3, 4] as const) {
    for (let i = 0; i < 3; i++) {
      deck.push({ type: 'speed', value });
    }
  }

  // 3 Drafted upgrade cards replace the default upgrades
  for (const card of draftedCards) {
    deck.push(card);
  }

  // Stress cards
  for (let i = 0; i < stressCount; i++) {
    deck.push({ type: 'stress' });
  }

  return deck;
}

// -- Internal Helpers --

/**
 * Compute pick orders for all 3 rounds based on grid positions.
 *
 * Snake draft:
 * - Round 1 (back-to-front): Players sorted by grid position descending (last picks first)
 * - Round 2 (front-to-back): Players sorted by grid position ascending (first picks first)
 * - Round 3 (back-to-front): Same as round 1
 */
function computePickOrders(players: DraftPlayerState[]): number[][] {
  const indexed = players.map((p, i) => ({ index: i, gridPosition: p.gridPosition }));

  // Back-to-front: highest grid position (furthest back) picks first
  const backToFront = [...indexed]
    .sort((a, b) => b.gridPosition - a.gridPosition)
    .map(p => p.index);

  // Front-to-back: lowest grid position (closest to front) picks first
  const frontToBack = [...indexed]
    .sort((a, b) => a.gridPosition - b.gridPosition)
    .map(p => p.index);

  return DRAFT_ROUND_DIRECTIONS.map(dir =>
    dir === 'back-to-front' ? [...backToFront] : [...frontToBack],
  );
}

/**
 * Create a seeded RNG for draft shuffling.
 * Uses a different seed space from the game engine RNG to avoid correlation.
 */
function createDraftRng(seed: number): () => number {
  let s = (seed ^ 0x47617261) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
