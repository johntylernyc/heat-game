/**
 * Gear shifting rules.
 *
 * Free shift: ±1 gear (no cost)
 * Paid shift: ±2 gears (costs 1 Heat from engine zone)
 * Cannot go below 1st or above 4th gear.
 */

import type { Gear, PlayerState } from './types.js';
import { MIN_GEAR, MAX_GEAR } from './types.js';

export type ShiftResult =
  | { ok: true; player: PlayerState }
  | { ok: false; reason: string };

/**
 * Attempt to shift gears.
 *
 * @param player Current player state
 * @param targetGear Desired gear
 * @returns ShiftResult with updated player or error reason
 */
export function shiftGear(
  player: PlayerState,
  targetGear: Gear,
): ShiftResult {
  const diff = Math.abs(targetGear - player.gear);

  if (diff === 0) {
    return { ok: true, player };
  }

  if (targetGear < MIN_GEAR || targetGear > MAX_GEAR) {
    return { ok: false, reason: `Gear must be between ${MIN_GEAR} and ${MAX_GEAR}` };
  }

  if (diff > 2) {
    return { ok: false, reason: 'Cannot shift more than 2 gears at once' };
  }

  // Free shift: ±1
  if (diff === 1) {
    return {
      ok: true,
      player: { ...player, gear: targetGear },
    };
  }

  // Paid shift: ±2 costs 1 Heat from engine
  const heatIndex = player.engineZone.findIndex(c => c.type === 'heat');
  if (heatIndex === -1) {
    return { ok: false, reason: 'No Heat in engine zone to pay for ±2 shift' };
  }

  const engineZone = [...player.engineZone];
  const [heatCard] = engineZone.splice(heatIndex, 1);

  return {
    ok: true,
    player: {
      ...player,
      gear: targetGear,
      engineZone,
      discardPile: [...player.discardPile, heatCard],
    },
  };
}

/**
 * Get valid gear targets from the current gear.
 * Returns gears reachable via free (±1) or paid (±2) shifts.
 */
export function getValidGearTargets(
  player: PlayerState,
): { gear: Gear; cost: 'free' | 'heat' }[] {
  const current = player.gear;
  const hasHeat = player.engineZone.some(c => c.type === 'heat');
  const targets: { gear: Gear; cost: 'free' | 'heat' }[] = [];

  // Same gear (no shift)
  targets.push({ gear: current, cost: 'free' });

  // ±1 free
  if (current - 1 >= MIN_GEAR) {
    targets.push({ gear: (current - 1) as Gear, cost: 'free' });
  }
  if (current + 1 <= MAX_GEAR) {
    targets.push({ gear: (current + 1) as Gear, cost: 'free' });
  }

  // ±2 paid (costs 1 Heat)
  if (hasHeat) {
    if (current - 2 >= MIN_GEAR) {
      targets.push({ gear: (current - 2) as Gear, cost: 'heat' });
    }
    if (current + 2 <= MAX_GEAR) {
      targets.push({ gear: (current + 2) as Gear, cost: 'heat' });
    }
  }

  return targets;
}
