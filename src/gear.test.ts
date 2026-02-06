import { describe, it, expect } from 'vitest';
import { shiftGear, getValidGearTargets } from './gear.js';
import { heatCard, speedCard } from './cards.js';
import type { PlayerState, Gear } from './types.js';

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'test',
    gear: 2 as Gear,
    hand: [],
    drawPile: [],
    discardPile: [],
    engineZone: Array.from({ length: 6 }, () => heatCard()),
    position: 0,
    lapCount: 0,
    ...overrides,
  };
}

describe('shiftGear', () => {
  it('stays in same gear (no-op)', () => {
    const player = makePlayer({ gear: 2 });
    const result = shiftGear(player, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.player.gear).toBe(2);
    }
  });

  it('shifts up by 1 for free', () => {
    const player = makePlayer({ gear: 2 });
    const result = shiftGear(player, 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.player.gear).toBe(3);
      expect(result.player.engineZone).toHaveLength(6); // No Heat spent
    }
  });

  it('shifts down by 1 for free', () => {
    const player = makePlayer({ gear: 3 });
    const result = shiftGear(player, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.player.gear).toBe(2);
      expect(result.player.engineZone).toHaveLength(6);
    }
  });

  it('shifts up by 2 and costs 1 Heat', () => {
    const player = makePlayer({ gear: 1 });
    const result = shiftGear(player, 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.player.gear).toBe(3);
      expect(result.player.engineZone).toHaveLength(5); // 1 Heat spent
      expect(result.player.discardPile).toHaveLength(1);
      expect(result.player.discardPile[0].type).toBe('heat');
    }
  });

  it('shifts down by 2 and costs 1 Heat', () => {
    const player = makePlayer({ gear: 4 });
    const result = shiftGear(player, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.player.gear).toBe(2);
      expect(result.player.engineZone).toHaveLength(5);
    }
  });

  it('fails to shift ±2 without Heat in engine', () => {
    const player = makePlayer({ gear: 1, engineZone: [] });
    const result = shiftGear(player, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('No Heat');
    }
  });

  it('fails to shift more than 2 gears', () => {
    const player = makePlayer({ gear: 1 });
    const result = shiftGear(player, 4);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('more than 2');
    }
  });

  it('fails to shift below gear 1', () => {
    const player = makePlayer({ gear: 1 });
    const result = shiftGear(player, 0 as Gear);
    expect(result.ok).toBe(false);
  });

  it('fails to shift above gear 4', () => {
    const player = makePlayer({ gear: 4 });
    const result = shiftGear(player, 5 as Gear);
    expect(result.ok).toBe(false);
  });
});

describe('getValidGearTargets', () => {
  it('includes current gear as free', () => {
    const player = makePlayer({ gear: 2 });
    const targets = getValidGearTargets(player);
    expect(targets).toContainEqual({ gear: 2, cost: 'free' });
  });

  it('includes ±1 as free shifts', () => {
    const player = makePlayer({ gear: 2 });
    const targets = getValidGearTargets(player);
    expect(targets).toContainEqual({ gear: 1, cost: 'free' });
    expect(targets).toContainEqual({ gear: 3, cost: 'free' });
  });

  it('includes ±2 as heat shifts when Heat available', () => {
    const player = makePlayer({ gear: 2 });
    const targets = getValidGearTargets(player);
    expect(targets).toContainEqual({ gear: 4, cost: 'heat' });
  });

  it('excludes ±2 when no Heat in engine', () => {
    const player = makePlayer({ gear: 2, engineZone: [] });
    const targets = getValidGearTargets(player);
    expect(targets.some(t => t.cost === 'heat')).toBe(false);
  });

  it('respects gear bounds', () => {
    const player = makePlayer({ gear: 1 });
    const targets = getValidGearTargets(player);
    const gears = targets.map(t => t.gear);
    expect(gears).not.toContain(0);
    expect(gears).not.toContain(-1);
  });

  it('gear 4 has no upshift options', () => {
    const player = makePlayer({ gear: 4 });
    const targets = getValidGearTargets(player);
    const gears = targets.map(t => t.gear);
    expect(Math.max(...gears)).toBe(4);
  });
});
