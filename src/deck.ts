/**
 * Deck management: shuffle, draw, and discard operations.
 *
 * All operations are pure functions that return new state.
 * Shuffle uses a seeded PRNG for deterministic replay.
 */

import type { Card, PlayerState } from './types.js';
import { HAND_SIZE } from './types.js';

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces the next random number in [0, 1).
 */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using provided RNG.
 * Returns a new shuffled array (does not mutate input).
 */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Draw cards from a player's draw pile into their hand.
 *
 * If the draw pile runs out, the discard pile is shuffled to form
 * a new draw pile and drawing continues.
 *
 * Returns updated player state.
 */
export function drawCards(
  player: PlayerState,
  count: number,
  rng: () => number,
): PlayerState {
  let drawPile = [...player.drawPile];
  let discardPile = [...player.discardPile];
  const drawn: Card[] = [];

  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break; // No cards left anywhere
      drawPile = shuffle(discardPile, rng);
      discardPile = [];
    }
    drawn.push(drawPile.pop()!);
  }

  return {
    ...player,
    hand: [...player.hand, ...drawn],
    drawPile,
    discardPile,
  };
}

/**
 * Replenish a player's hand to HAND_SIZE cards.
 * Draws (HAND_SIZE - current hand size) cards.
 */
export function replenishHand(
  player: PlayerState,
  rng: () => number,
): PlayerState {
  const deficit = HAND_SIZE - player.hand.length;
  if (deficit <= 0) return player;
  return drawCards(player, deficit, rng);
}

/**
 * Move cards from hand to discard pile.
 * The indices must refer to valid positions in the hand.
 */
export function discardFromHand(
  player: PlayerState,
  cardIndices: number[],
): PlayerState {
  const sorted = [...cardIndices].sort((a, b) => b - a); // Remove from end first
  const hand = [...player.hand];
  const discarded: Card[] = [];

  for (const idx of sorted) {
    if (idx < 0 || idx >= hand.length) {
      throw new Error(`Invalid hand index: ${idx}`);
    }
    discarded.push(...hand.splice(idx, 1));
  }

  return {
    ...player,
    hand,
    discardPile: [...player.discardPile, ...discarded],
  };
}
