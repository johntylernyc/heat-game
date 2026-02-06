/**
 * Road Condition system: placement and effect queries.
 *
 * 12 road condition tokens are shuffled at race start.
 * One is placed at each corner. Each modifies either:
 * - The corner itself (speed limit ±1, overheat)
 * - The sector leading away from the corner (slipstream boost, free boost, weather sector)
 */

import type { CornerDef, RoadConditionPlacement, RoadConditionToken, SectorModType } from '../types.js';
import { shuffle, createRng } from '../deck.js';
import { ROAD_CONDITION_TOKENS } from './tokens.js';

/**
 * Randomly place road condition tokens at corners.
 * Shuffles all 12 tokens and assigns one per corner.
 * Returns placements only for corners that exist on the track.
 */
export function placeRoadConditions(
  cornerIds: number[],
  seed: number,
): RoadConditionPlacement[] {
  const rng = createRng(seed);
  const shuffled = shuffle([...ROAD_CONDITION_TOKENS] as RoadConditionToken[], rng);

  return cornerIds.map((cornerId, i) => ({
    cornerId,
    token: shuffled[i],
  }));
}

/**
 * Get the effective speed limit for a corner, considering road conditions.
 * - speed-plus-1: +1 to speed limit
 * - speed-minus-1: -1 to speed limit (minimum 1)
 * - overheat: speed limit unchanged (extra Heat cost handled separately)
 */
export function getEffectiveSpeedLimit(
  corner: CornerDef,
  roadConditions?: RoadConditionPlacement[],
): number {
  if (!roadConditions) return corner.speedLimit;

  const placement = roadConditions.find(rc => rc.cornerId === corner.id);
  if (!placement || placement.token.target !== 'corner') return corner.speedLimit;

  switch (placement.token.modType) {
    case 'speed-plus-1':
      return corner.speedLimit + 1;
    case 'speed-minus-1':
      return Math.max(1, corner.speedLimit - 1);
    case 'overheat':
      return corner.speedLimit;
  }
}

/**
 * Get extra Heat penalty for a corner from overheat road condition.
 * Returns 1 if overheat is active and the player exceeded the speed limit, 0 otherwise.
 */
export function getCornerOverheatPenalty(
  cornerId: number,
  roadConditions?: RoadConditionPlacement[],
): number {
  if (!roadConditions) return 0;

  const placement = roadConditions.find(rc => rc.cornerId === cornerId);
  if (!placement || placement.token.target !== 'corner') return 0;
  if (placement.token.modType === 'overheat') return 1;
  return 0;
}

/**
 * Find which corner's "leading away" sector a position falls in.
 *
 * The sector leading away from corner C covers positions
 * (C.position, nextCorner.position] with wrapping.
 *
 * Returns the corner ID that starts the sector, or null if no corners exist.
 */
export function findSectorStartCorner(
  position: number,
  corners: CornerDef[],
  totalSpaces: number,
): number | null {
  if (corners.length === 0) return null;

  for (let i = 0; i < corners.length; i++) {
    const start = corners[i].position;
    const end = corners[(i + 1) % corners.length].position;

    if (start < end) {
      if (position > start && position <= end) return corners[i].id;
    } else {
      // Wrapping around the track
      if (position > start || position <= end) return corners[i].id;
    }
  }

  return corners[corners.length - 1].id;
}

/**
 * Check if a position is in a sector with a specific road condition effect.
 */
export function hasSectorEffect(
  position: number,
  corners: CornerDef[],
  totalSpaces: number,
  roadConditions: RoadConditionPlacement[] | undefined,
  effectType: SectorModType,
): boolean {
  if (!roadConditions || corners.length === 0) return false;

  const cornerId = findSectorStartCorner(position, corners, totalSpaces);
  if (cornerId === null) return false;

  const placement = roadConditions.find(rc => rc.cornerId === cornerId);
  if (!placement || placement.token.target !== 'sector') return false;
  return placement.token.modType === effectType;
}

/**
 * Check if a position is in a free-boost sector (boost costs no Heat).
 */
export function isInFreeBoostSector(
  position: number,
  corners: CornerDef[],
  totalSpaces: number,
  roadConditions?: RoadConditionPlacement[],
): boolean {
  return hasSectorEffect(position, corners, totalSpaces, roadConditions, 'free-boost');
}

/**
 * Get extra slipstream spaces from sector road condition.
 * Returns 1 if in a slipstream-boost sector, 0 otherwise.
 */
export function getSlipstreamSectorBonus(
  position: number,
  corners: CornerDef[],
  totalSpaces: number,
  roadConditions?: RoadConditionPlacement[],
): number {
  if (hasSectorEffect(position, corners, totalSpaces, roadConditions, 'slipstream-boost')) {
    return 1;
  }
  return 0;
}

/**
 * Check if a position is in a weather-sector (spinout gives +1 extra stress).
 */
export function isInWeatherSector(
  position: number,
  corners: CornerDef[],
  totalSpaces: number,
  roadConditions?: RoadConditionPlacement[],
): boolean {
  return hasSectorEffect(position, corners, totalSpaces, roadConditions, 'weather-sector');
}
