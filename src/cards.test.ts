import { describe, it, expect } from 'vitest';
import {
  speedCard,
  heatCard,
  stressCard,
  upgradeCard,
  buildStartingDeck,
  buildEngineZone,
  getCardSpeedValue,
} from './cards.js';

describe('Card constructors', () => {
  it('creates speed cards with correct value', () => {
    const card = speedCard(3);
    expect(card).toEqual({ type: 'speed', value: 3 });
  });

  it('creates heat cards', () => {
    expect(heatCard()).toEqual({ type: 'heat' });
  });

  it('creates stress cards', () => {
    expect(stressCard()).toEqual({ type: 'stress' });
  });

  it('creates upgrade cards with subtype', () => {
    expect(upgradeCard('speed-0')).toEqual({ type: 'upgrade', subtype: 'speed-0' });
    expect(upgradeCard('speed-5')).toEqual({ type: 'upgrade', subtype: 'speed-5' });
    expect(upgradeCard('starting-heat')).toEqual({ type: 'upgrade', subtype: 'starting-heat' });
  });
});

describe('buildStartingDeck', () => {
  it('contains 12 speed cards (3x each of 1,2,3,4)', () => {
    const deck = buildStartingDeck(0);
    const speedCards = deck.filter(c => c.type === 'speed');
    expect(speedCards).toHaveLength(12);

    for (const value of [1, 2, 3, 4] as const) {
      const count = speedCards.filter(c => c.type === 'speed' && c.value === value).length;
      expect(count).toBe(3);
    }
  });

  it('contains 3 starting upgrades', () => {
    const deck = buildStartingDeck(0);
    const upgrades = deck.filter(c => c.type === 'upgrade');
    expect(upgrades).toHaveLength(3);
    expect(upgrades.find(c => c.type === 'upgrade' && c.subtype === 'speed-0')).toBeDefined();
    expect(upgrades.find(c => c.type === 'upgrade' && c.subtype === 'speed-5')).toBeDefined();
    expect(upgrades.find(c => c.type === 'upgrade' && c.subtype === 'starting-heat')).toBeDefined();
  });

  it('includes stress cards based on count', () => {
    const deck3 = buildStartingDeck(3);
    expect(deck3.filter(c => c.type === 'stress')).toHaveLength(3);

    const deck0 = buildStartingDeck(0);
    expect(deck0.filter(c => c.type === 'stress')).toHaveLength(0);
  });

  it('has correct total size (15 base + stress)', () => {
    expect(buildStartingDeck(0)).toHaveLength(15);
    expect(buildStartingDeck(3)).toHaveLength(18);
  });

  it('does NOT contain heat cards (those go in engine zone)', () => {
    const deck = buildStartingDeck(3);
    expect(deck.filter(c => c.type === 'heat')).toHaveLength(0);
  });
});

describe('buildEngineZone', () => {
  it('contains 6 heat cards', () => {
    const engine = buildEngineZone();
    expect(engine).toHaveLength(6);
    expect(engine.every(c => c.type === 'heat')).toBe(true);
  });
});

describe('getCardSpeedValue', () => {
  it('returns value for speed cards', () => {
    expect(getCardSpeedValue(speedCard(1))).toBe(1);
    expect(getCardSpeedValue(speedCard(4))).toBe(4);
  });

  it('returns 0 for speed-0 upgrade', () => {
    expect(getCardSpeedValue(upgradeCard('speed-0'))).toBe(0);
  });

  it('returns 5 for speed-5 upgrade', () => {
    expect(getCardSpeedValue(upgradeCard('speed-5'))).toBe(5);
  });

  it('returns null for starting-heat upgrade', () => {
    expect(getCardSpeedValue(upgradeCard('starting-heat'))).toBeNull();
  });

  it('returns null for heat cards', () => {
    expect(getCardSpeedValue(heatCard())).toBeNull();
  });

  it('returns null for stress cards', () => {
    expect(getCardSpeedValue(stressCard())).toBeNull();
  });
});
