import { describe, it, expect } from 'vitest';
import {
  GARAGE_UPGRADE_CARDS,
  ALL_GARAGE_UPGRADE_CARDS,
  fourWheelDrive3,
  brakes3or1,
  coolingSystem3,
  body4,
  rpm3,
  tires3,
  wings6,
  turbocharger7,
  fuel3,
  gasPedal4,
  suspension3,
} from '../upgrade-cards.js';
import type { GarageUpgradeType } from '../types.js';

describe('Garage Upgrade Cards', () => {
  it('has all 11 upgrade card types', () => {
    const types = Object.keys(GARAGE_UPGRADE_CARDS) as GarageUpgradeType[];
    expect(types).toHaveLength(11);
    expect(types).toContain('4-wheel-drive');
    expect(types).toContain('brakes');
    expect(types).toContain('cooling-system');
    expect(types).toContain('body');
    expect(types).toContain('rpm');
    expect(types).toContain('tires');
    expect(types).toContain('wings');
    expect(types).toContain('turbocharger');
    expect(types).toContain('fuel');
    expect(types).toContain('gas-pedal');
    expect(types).toContain('suspension');
  });

  it('has 2 variants per type (22 total cards)', () => {
    for (const [type, cards] of Object.entries(GARAGE_UPGRADE_CARDS)) {
      expect(cards).toHaveLength(2);
      for (const card of cards) {
        expect(card.garageType).toBe(type);
        expect(card.type).toBe('upgrade');
      }
    }
    expect(ALL_GARAGE_UPGRADE_CARDS).toHaveLength(22);
  });

  it('all cards have type "upgrade"', () => {
    for (const card of ALL_GARAGE_UPGRADE_CARDS) {
      expect(card.type).toBe('upgrade');
    }
  });

  describe('4 Wheel Drive', () => {
    it('has speed value and super-cool effect', () => {
      expect(fourWheelDrive3.speedValue).toBe(3);
      expect(fourWheelDrive3.heatCost).toBe(0);
      expect(fourWheelDrive3.effects).toEqual([{ keyword: 'super-cool', count: 1 }]);
    });
  });

  describe('Brakes', () => {
    it('has primary and alternate speed values', () => {
      expect(brakes3or1.speedValue).toBe(3);
      expect(brakes3or1.alternateSpeedValue).toBe(1);
      expect(brakes3or1.heatCost).toBe(0);
    });
  });

  describe('Cooling System', () => {
    it('has super-cool effect', () => {
      expect(coolingSystem3.speedValue).toBe(3);
      expect(coolingSystem3.effects).toEqual([{ keyword: 'super-cool', count: 3 }]);
    });
  });

  describe('Body', () => {
    it('has reduce-stress effect', () => {
      expect(body4.speedValue).toBe(4);
      expect(body4.effects).toEqual([{ keyword: 'reduce-stress', count: 1 }]);
    });
  });

  describe('R.P.M.', () => {
    it('has slipstream-boost effect', () => {
      expect(rpm3.speedValue).toBe(3);
      expect(rpm3.effects).toEqual([{ keyword: 'slipstream-boost', count: 2 }]);
    });
  });

  describe('Tires', () => {
    it('has adjust-speed-limit effect', () => {
      expect(tires3.speedValue).toBe(3);
      expect(tires3.effects).toEqual([{ keyword: 'adjust-speed-limit', amount: 2 }]);
    });
  });

  describe('Wings', () => {
    it('has speed limit boost with heat cost', () => {
      expect(wings6.speedValue).toBe(6);
      expect(wings6.heatCost).toBe(1);
      expect(wings6.effects).toEqual([{ keyword: 'adjust-speed-limit', amount: 1 }]);
    });
  });

  describe('Turbocharger', () => {
    it('has high speed, heat cost, and scrap effect', () => {
      expect(turbocharger7.speedValue).toBe(7);
      expect(turbocharger7.heatCost).toBe(1);
      expect(turbocharger7.effects).toEqual([{ keyword: 'scrap', count: 1 }]);
    });
  });

  describe('Fuel', () => {
    it('has salvage effect', () => {
      expect(fuel3.speedValue).toBe(3);
      expect(fuel3.effects).toEqual([{ keyword: 'salvage', count: 2 }]);
    });
  });

  describe('Gas Pedal', () => {
    it('has direct-play effect', () => {
      expect(gasPedal4.speedValue).toBe(4);
      expect(gasPedal4.heatCost).toBe(0);
      expect(gasPedal4.effects).toEqual([{ keyword: 'direct-play' }]);
    });
  });

  describe('Suspension', () => {
    it('has refresh effect', () => {
      expect(suspension3.speedValue).toBe(3);
      expect(suspension3.effects).toEqual([{ keyword: 'refresh' }]);
    });
  });
});
