/**
 * Type definitions for the Legends (AI) system.
 *
 * Legends are AI-controlled cars that fill out a race. They use a shared
 * deck of 10 cards (not personal decks) and simplified movement rules.
 * Legends do NOT use heat, cooldown, boost, slipstream, or spin out.
 */

/** Difficulty level determines which row of values on a Legend card is used. */
export type LegendDifficulty = 'easy' | 'medium' | 'hard';

/** Speed and diamond values for a single difficulty level on a Legend card. */
export interface LegendCardValues {
  /** Movement speed on straights (behind legends line). */
  speed: number;
  /**
   * Diamond modifier. Dual purpose:
   * - Case 1 (straight): number of spaces before corner where Legend stops
   *   if straight movement would carry past.
   * - Case 2 (between legends line and corner): added to corner speed limit
   *   to determine movement distance.
   */
  diamond: number;
}

/** A single Legend card with values per difficulty level. */
export interface LegendCard {
  id: number;
  easy: LegendCardValues;
  medium: LegendCardValues;
  hard: LegendCardValues;
}

/** State of a single Legend car. Simplified compared to human PlayerState. */
export interface LegendCarState {
  id: string;
  position: number;
  lapCount: number;
}

/** Shared state for all Legend cars in a race. */
export interface LegendState {
  cars: LegendCarState[];
  deck: LegendCard[];
  discard: LegendCard[];
  difficulty: LegendDifficulty;
  /** Card flipped for the current round (null before first flip). */
  currentCard: LegendCard | null;
}

/** Configuration for initializing Legends in a game. */
export interface LegendConfig {
  /** Number of Legend cars (1-5). */
  count: number;
  difficulty: LegendDifficulty;
  /** RNG seed for shuffling the Legend deck. */
  seed: number;
}
