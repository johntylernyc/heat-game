import { describe, it, expect } from 'vitest';
import { createRng, shuffle, drawCards, replenishHand, discardFromHand } from './deck.js';
import { speedCard, heatCard } from './cards.js';
import type { PlayerState, Gear } from './types.js';

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'test',
    gear: 1 as Gear,
    hand: [],
    drawPile: [],
    discardPile: [],
    engineZone: [],
    position: 0,
    lapCount: 0,
    ...overrides,
  };
}

describe('createRng', () => {
  it('produces deterministic results from same seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('produces different results from different seeds', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(99);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it('produces values in [0, 1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('returns array of same length', () => {
    const items = [1, 2, 3, 4, 5];
    const rng = createRng(42);
    const result = shuffle(items, rng);
    expect(result).toHaveLength(items.length);
  });

  it('contains same elements', () => {
    const items = [1, 2, 3, 4, 5];
    const rng = createRng(42);
    const result = shuffle(items, rng);
    expect(result.sort()).toEqual(items.sort());
  });

  it('does not mutate original array', () => {
    const items = [1, 2, 3, 4, 5];
    const original = [...items];
    const rng = createRng(42);
    shuffle(items, rng);
    expect(items).toEqual(original);
  });

  it('is deterministic with same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result1 = shuffle(items, createRng(42));
    const result2 = shuffle(items, createRng(42));
    expect(result1).toEqual(result2);
  });
});

describe('drawCards', () => {
  it('draws from draw pile into hand', () => {
    const player = makePlayer({
      drawPile: [speedCard(1), speedCard(2), speedCard(3)],
    });
    const rng = createRng(42);
    const result = drawCards(player, 2, rng);
    expect(result.hand).toHaveLength(2);
    expect(result.drawPile).toHaveLength(1);
  });

  it('shuffles discard into draw pile when draw pile is empty', () => {
    const player = makePlayer({
      drawPile: [speedCard(1)],
      discardPile: [speedCard(2), speedCard(3), speedCard(4)],
    });
    const rng = createRng(42);
    const result = drawCards(player, 3, rng);
    expect(result.hand).toHaveLength(3);
    // 1 from draw + 2 from reshuffled discard
    expect(result.discardPile).toHaveLength(0);
  });

  it('stops drawing when no cards remain anywhere', () => {
    const player = makePlayer({
      drawPile: [speedCard(1)],
      discardPile: [],
    });
    const rng = createRng(42);
    const result = drawCards(player, 5, rng);
    expect(result.hand).toHaveLength(1);
  });

  it('appends to existing hand', () => {
    const player = makePlayer({
      hand: [speedCard(1)],
      drawPile: [speedCard(2), speedCard(3)],
    });
    const rng = createRng(42);
    const result = drawCards(player, 1, rng);
    expect(result.hand).toHaveLength(2);
  });
});

describe('replenishHand', () => {
  it('draws up to 7 cards', () => {
    const player = makePlayer({
      hand: [speedCard(1), speedCard(2)],
      drawPile: [
        speedCard(3), speedCard(4), speedCard(1), speedCard(2),
        speedCard(3), speedCard(4), speedCard(1),
      ],
    });
    const rng = createRng(42);
    const result = replenishHand(player, rng);
    expect(result.hand).toHaveLength(7);
  });

  it('does nothing if hand already has 7 cards', () => {
    const hand = Array.from({ length: 7 }, () => speedCard(1));
    const player = makePlayer({ hand });
    const rng = createRng(42);
    const result = replenishHand(player, rng);
    expect(result.hand).toHaveLength(7);
    expect(result).toBe(player); // Same reference, no change
  });
});

describe('discardFromHand', () => {
  it('moves specified cards to discard pile', () => {
    const player = makePlayer({
      hand: [speedCard(1), speedCard(2), speedCard(3)],
    });
    const result = discardFromHand(player, [1]);
    expect(result.hand).toHaveLength(2);
    expect(result.discardPile).toHaveLength(1);
    expect(result.discardPile[0]).toEqual(speedCard(2));
  });

  it('handles multiple indices', () => {
    const player = makePlayer({
      hand: [speedCard(1), speedCard(2), speedCard(3), speedCard(4)],
    });
    const result = discardFromHand(player, [0, 2]);
    expect(result.hand).toHaveLength(2);
    expect(result.discardPile).toHaveLength(2);
  });

  it('throws on invalid index', () => {
    const player = makePlayer({ hand: [speedCard(1)] });
    expect(() => discardFromHand(player, [5])).toThrow('Invalid hand index');
  });

  it('appends to existing discard pile', () => {
    const player = makePlayer({
      hand: [speedCard(1)],
      discardPile: [speedCard(2)],
    });
    const result = discardFromHand(player, [0]);
    expect(result.discardPile).toHaveLength(2);
  });
});
