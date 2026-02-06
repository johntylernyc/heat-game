/**
 * Legend system orchestration.
 *
 * Manages the shared Legend deck, card flipping per round,
 * and coordinated movement of all Legend cars.
 */

import type { Track } from '../track/track.js';
import type { LegendCarState, LegendConfig, LegendState } from './types.js';
import { LEGEND_CARDS } from './cards.js';
import { shuffle, createRng } from '../deck.js';
import { moveLegend } from './movement.js';

/**
 * Initialize the Legend state for a race.
 *
 * Creates Legend cars with the specified starting positions and
 * shuffles the shared Legend deck.
 *
 * @param config Legend configuration
 * @param startingPositions Position on track for each Legend car (must match config.count)
 */
export function initLegends(
  config: LegendConfig,
  startingPositions: number[],
): LegendState {
  if (config.count < 1 || config.count > 5) {
    throw new Error(`Legend count must be 1-5, got ${config.count}`);
  }

  if (startingPositions.length !== config.count) {
    throw new Error(
      `Expected ${config.count} starting positions, got ${startingPositions.length}`,
    );
  }

  const rng = createRng(config.seed);

  const cars: LegendCarState[] = startingPositions.map((pos, i) => ({
    id: `legend-${i + 1}`,
    position: pos,
    lapCount: 0,
  }));

  const deck = shuffle([...LEGEND_CARDS], rng);

  return {
    cars,
    deck,
    discard: [],
    difficulty: config.difficulty,
    currentCard: null,
  };
}

/**
 * Flip the next Legend card for the round.
 *
 * If the deck is empty, reshuffles the discard pile to form a new deck.
 * Returns updated state with the flipped card set as currentCard.
 */
export function flipLegendCard(
  state: LegendState,
  rng: () => number,
): LegendState {
  let deck = [...state.deck];
  let discard = [...state.discard];

  if (deck.length === 0) {
    if (discard.length === 0) {
      throw new Error('Legend deck and discard pile are both empty');
    }
    deck = shuffle(discard, rng);
    discard = [];
  }

  const card = deck.pop()!;

  return {
    ...state,
    deck,
    discard,
    currentCard: card,
  };
}

/**
 * Discard the current round's Legend card.
 * Call this after all Legend cars have moved for the round.
 */
export function discardCurrentCard(state: LegendState): LegendState {
  if (!state.currentCard) {
    throw new Error('No current Legend card to discard');
  }

  return {
    ...state,
    discard: [...state.discard, state.currentCard],
    currentCard: null,
  };
}

/**
 * Execute a full Legend round: flip one card and move all Legend cars.
 *
 * @param state Current Legend state
 * @param track The track being raced on
 * @param rng Random number generator (for deck reshuffling)
 * @param lapTarget Number of laps to complete (for lap/finish tracking)
 */
export function executeLegendRound(
  state: LegendState,
  track: Track,
  rng: () => number,
  lapTarget: number,
): LegendState {
  // Flip card
  let updated = flipLegendCard(state, rng);
  const card = updated.currentCard!;

  // Move all Legend cars
  const cars = updated.cars.map(car => {
    const result = moveLegend(car, card, updated.difficulty, track);
    return checkLegendLap(result.car, track, lapTarget);
  });

  // Discard the card
  return discardCurrentCard({
    ...updated,
    cars,
  });
}

/**
 * Check if a Legend car has completed a lap by crossing the finish line.
 */
function checkLegendLap(
  car: LegendCarState,
  track: Track,
  _lapTarget: number,
): LegendCarState {
  const completedLaps = Math.floor(car.position / track.totalSpaces);
  if (completedLaps > car.lapCount) {
    return {
      ...car,
      lapCount: completedLaps,
      position: car.position % track.totalSpaces,
    };
  }
  return car;
}

/**
 * Check if any Legend car has finished the race.
 */
export function anyLegendFinished(state: LegendState, lapTarget: number): boolean {
  return state.cars.some(car => car.lapCount >= lapTarget);
}

/**
 * Get Legend cars sorted by finishing position (furthest ahead first).
 * Used for integrating Legends into final standings.
 */
export function getLegendStandings(state: LegendState, track: Track): LegendCarState[] {
  return [...state.cars].sort((a, b) => {
    // Higher lap count = further ahead
    if (b.lapCount !== a.lapCount) return b.lapCount - a.lapCount;
    // Same lap: higher position = further ahead
    // Use forward distance from start/finish as tiebreaker
    const aDist = (a.position - track.startFinishLine + track.totalSpaces) % track.totalSpaces;
    const bDist = (b.position - track.startFinishLine + track.totalSpaces) % track.totalSpaces;
    return bDist - aDist;
  });
}
