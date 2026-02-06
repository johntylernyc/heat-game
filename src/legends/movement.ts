/**
 * Legend movement rules.
 *
 * Movement depends on position relative to corners and legends lines:
 *
 * Case 1 — Behind legends line (on a straight):
 *   Move forward by card speed value. If movement would carry past a corner,
 *   stop at (corner position - diamond value) instead.
 *
 * Case 2 — Between legends line and corner:
 *   Move = corner speed limit + diamond modifier. The Legend crosses the
 *   corner at approximately the speed limit.
 */

import type { Track } from '../track/track.js';
import type { Corner, LegendsLine } from '../track/types.js';
import type { LegendCardValues, LegendCarState, LegendDifficulty } from './types.js';
import type { LegendCard } from './types.js';

/** Result of computing a Legend's move for the round. */
export interface LegendMoveResult {
  car: LegendCarState;
  /** Number of spaces the Legend moved this round. */
  spacesMoved: number;
}

/**
 * Get the card values for a given difficulty level.
 */
export function getCardValues(card: LegendCard, difficulty: LegendDifficulty): LegendCardValues {
  return card[difficulty];
}

/**
 * Find the next corner ahead of the given position on the track.
 * Returns the corner and its associated legends line.
 */
export function findNextCorner(
  position: number,
  track: Track,
): { corner: Corner; legendsLine: LegendsLine } | null {
  const corners = track.corners;
  const legendsLines = track.legendsLines;
  const total = track.totalSpaces;

  if (corners.length === 0) return null;

  // Find the corner with the smallest forward distance from position
  let bestCorner: Corner | null = null;
  let bestDist = Infinity;

  for (const corner of corners) {
    const dist = (corner.position - position + total) % total;
    if (dist > 0 && dist < bestDist) {
      bestDist = dist;
      bestCorner = corner;
    }
  }

  // If no corner found ahead, position is exactly on a corner — take the next one
  if (!bestCorner) {
    const idx = corners.findIndex(c => c.position === position);
    bestCorner = corners[((idx === -1 ? 0 : idx) + 1) % corners.length];
  }

  const line = legendsLines.find(l => l.cornerId === bestCorner!.id);
  if (line) {
    return { corner: bestCorner, legendsLine: line };
  }

  return null;
}

/**
 * Check if position is between a legends line and its corner (inclusive of line,
 * exclusive of corner). Handles track wrapping.
 */
export function isBetweenLineAndCorner(
  position: number,
  legendsLine: LegendsLine,
  corner: Corner,
  totalSpaces: number,
): boolean {
  const linePos = legendsLine.position;
  const cornerPos = corner.position;

  if (linePos < cornerPos) {
    // Normal case: line ... position ... corner
    return position >= linePos && position < cornerPos;
  }
  // Wrapping case
  return position >= linePos || position < cornerPos;
}

/**
 * Compute the forward distance between two positions on the track.
 */
function forwardDistance(from: number, to: number, totalSpaces: number): number {
  return (to - from + totalSpaces) % totalSpaces;
}

/**
 * Move a single Legend car for the round.
 *
 * @param car Current Legend car state
 * @param card The flipped Legend card for this round
 * @param difficulty Which difficulty row to use
 * @param track The track being raced on
 * @returns Updated car state and distance moved
 */
export function moveLegend(
  car: LegendCarState,
  card: LegendCard,
  difficulty: LegendDifficulty,
  track: Track,
): LegendMoveResult {
  const values = getCardValues(card, difficulty);
  const total = track.totalSpaces;

  const nextCornerInfo = findNextCorner(car.position, track);
  if (!nextCornerInfo) {
    // No corners on track (degenerate case) — just move by speed
    const newPos = (car.position + values.speed) % total;
    return {
      car: { ...car, position: newPos },
      spacesMoved: values.speed,
    };
  }

  const { corner, legendsLine } = nextCornerInfo;
  const between = isBetweenLineAndCorner(car.position, legendsLine, corner, total);

  if (between) {
    // Case 2: Between legends line and corner
    // Move = corner speed limit + diamond modifier
    const moveDistance = corner.speedLimit + values.diamond;
    const newPos = (car.position + moveDistance) % total;
    return {
      car: { ...car, position: newPos },
      spacesMoved: moveDistance,
    };
  }

  // Case 1: Behind legends line (on a straight)
  // Move forward by card speed value
  const targetPos = (car.position + values.speed) % total;
  const distToCorner = forwardDistance(car.position, corner.position, total);

  if (values.speed >= distToCorner) {
    // Movement would carry past corner — stop at diamond spaces before corner
    const stopPos = (corner.position - values.diamond + total) % total;
    const actualDistance = forwardDistance(car.position, stopPos, total);
    return {
      car: { ...car, position: stopPos },
      spacesMoved: actualDistance,
    };
  }

  // Normal straight movement, doesn't reach corner
  return {
    car: { ...car, position: targetPos },
    spacesMoved: values.speed,
  };
}
