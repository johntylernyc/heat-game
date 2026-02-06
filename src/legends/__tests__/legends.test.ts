import { describe, it, expect } from 'vitest';
import { Track } from '../../track/track.js';
import { usaTrack } from '../../track/tracks/usa.js';
import { createRng } from '../../deck.js';
import {
  LEGEND_CARDS,
  LEGEND_DECK_SIZE,
  getCardValues,
  findNextCorner,
  isBetweenLineAndCorner,
  moveLegend,
  initLegends,
  flipLegendCard,
  discardCurrentCard,
  executeLegendRound,
  anyLegendFinished,
  getLegendStandings,
} from '../index.js';
import type { LegendCard, LegendCarState, LegendState } from '../types.js';

const track = new Track(usaTrack);

// ── Legend Cards ──

describe('LEGEND_CARDS', () => {
  it('contains exactly 10 cards', () => {
    expect(LEGEND_CARDS).toHaveLength(LEGEND_DECK_SIZE);
    expect(LEGEND_DECK_SIZE).toBe(10);
  });

  it('each card has unique id 1-10', () => {
    const ids = LEGEND_CARDS.map(c => c.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('each card has values for all three difficulties', () => {
    for (const card of LEGEND_CARDS) {
      expect(card.easy).toBeDefined();
      expect(card.medium).toBeDefined();
      expect(card.hard).toBeDefined();
      expect(card.easy.speed).toBeGreaterThan(0);
      expect(card.medium.speed).toBeGreaterThan(0);
      expect(card.hard.speed).toBeGreaterThan(0);
      expect(card.easy.diamond).toBeGreaterThanOrEqual(0);
      expect(card.medium.diamond).toBeGreaterThanOrEqual(0);
      expect(card.hard.diamond).toBeGreaterThanOrEqual(0);
    }
  });

  it('harder difficulties have generally higher speed values', () => {
    const avgEasy = LEGEND_CARDS.reduce((s, c) => s + c.easy.speed, 0) / 10;
    const avgMed = LEGEND_CARDS.reduce((s, c) => s + c.medium.speed, 0) / 10;
    const avgHard = LEGEND_CARDS.reduce((s, c) => s + c.hard.speed, 0) / 10;
    expect(avgMed).toBeGreaterThan(avgEasy);
    expect(avgHard).toBeGreaterThan(avgMed);
  });
});

describe('getCardValues', () => {
  const card = LEGEND_CARDS[0]; // id: 1, easy: {4,0}, medium: {5,1}, hard: {7,2}

  it('returns easy values', () => {
    expect(getCardValues(card, 'easy')).toEqual({ speed: 4, diamond: 0 });
  });

  it('returns medium values', () => {
    expect(getCardValues(card, 'medium')).toEqual({ speed: 5, diamond: 1 });
  });

  it('returns hard values', () => {
    expect(getCardValues(card, 'hard')).toEqual({ speed: 7, diamond: 2 });
  });
});

// ── Track Awareness (findNextCorner, isBetweenLineAndCorner) ──

describe('findNextCorner', () => {
  // USA track: corners at 16, 28, 39; legends lines at 14, 26, 37

  it('finds corner 1 when on the front straight', () => {
    const result = findNextCorner(5, track);
    expect(result).not.toBeNull();
    expect(result!.corner.id).toBe(1);
    expect(result!.legendsLine.position).toBe(14);
  });

  it('finds corner 2 when on the back straight', () => {
    const result = findNextCorner(20, track);
    expect(result).not.toBeNull();
    expect(result!.corner.id).toBe(2);
  });

  it('finds corner 3 when in mid section', () => {
    const result = findNextCorner(30, track);
    expect(result).not.toBeNull();
    expect(result!.corner.id).toBe(3);
  });

  it('wraps to corner 1 when past all corners', () => {
    const result = findNextCorner(42, track);
    expect(result).not.toBeNull();
    expect(result!.corner.id).toBe(1);
  });

  it('finds corner 1 when exactly at corner 3 position', () => {
    // At position 39 (corner 3), the next corner ahead is corner 1
    const result = findNextCorner(39, track);
    expect(result).not.toBeNull();
    expect(result!.corner.id).toBe(1);
  });
});

describe('isBetweenLineAndCorner', () => {
  // Corner 1: position 16, legends line: position 14
  const corner1 = usaTrack.corners[0];
  const line1 = usaTrack.legendsLines[0];

  it('returns true when between legends line and corner', () => {
    expect(isBetweenLineAndCorner(14, line1, corner1, 48)).toBe(true);
    expect(isBetweenLineAndCorner(15, line1, corner1, 48)).toBe(true);
  });

  it('returns false when at corner position', () => {
    expect(isBetweenLineAndCorner(16, line1, corner1, 48)).toBe(false);
  });

  it('returns false when before legends line', () => {
    expect(isBetweenLineAndCorner(13, line1, corner1, 48)).toBe(false);
    expect(isBetweenLineAndCorner(5, line1, corner1, 48)).toBe(false);
  });

  it('returns false when past corner', () => {
    expect(isBetweenLineAndCorner(17, line1, corner1, 48)).toBe(false);
  });
});

// ── Legend Movement ──

describe('moveLegend', () => {
  // Card 1: easy {speed:4, diamond:0}, medium {speed:5, diamond:1}, hard {speed:7, diamond:2}
  const card = LEGEND_CARDS[0];

  describe('Case 1: behind legends line (straight movement)', () => {
    it('moves forward by speed value', () => {
      const car: LegendCarState = { id: 'l1', position: 2, lapCount: 0 };
      const result = moveLegend(car, card, 'easy', track);
      // speed=4, position 2+4=6, still before legends line at 14
      expect(result.car.position).toBe(6);
      expect(result.spacesMoved).toBe(4);
    });

    it('stops at diamond spaces before corner if would pass', () => {
      // Position 13, speed 4 would reach 17 (past corner 1 at 16)
      // Diamond 0 → stop at 16-0=16
      const car: LegendCarState = { id: 'l1', position: 13, lapCount: 0 };
      const result = moveLegend(car, card, 'easy', track);
      expect(result.car.position).toBe(16); // corner - diamond(0)
      expect(result.spacesMoved).toBe(3); // 16-13=3
    });

    it('uses diamond value to stop before corner', () => {
      // Medium: speed 5, diamond 1. Position 13 → would reach 18 (past corner 16)
      // Stop at 16-1=15
      const car: LegendCarState = { id: 'l1', position: 13, lapCount: 0 };
      const result = moveLegend(car, card, 'medium', track);
      expect(result.car.position).toBe(15); // corner(16) - diamond(1)
      expect(result.spacesMoved).toBe(2);
    });

    it('uses hard diamond value to stop further before corner', () => {
      // Hard: speed 7, diamond 2. Position 13 → would reach 20 (past corner 16)
      // Stop at 16-2=14
      const car: LegendCarState = { id: 'l1', position: 13, lapCount: 0 };
      const result = moveLegend(car, card, 'hard', track);
      expect(result.car.position).toBe(14); // corner(16) - diamond(2)
      expect(result.spacesMoved).toBe(1);
    });
  });

  describe('Case 2: between legends line and corner', () => {
    it('moves by speed limit + diamond', () => {
      // Position 14 (legends line 1), corner 1 speed limit = 5
      // Easy: diamond 0, move = 5+0=5, new position = 14+5=19
      const car: LegendCarState = { id: 'l1', position: 14, lapCount: 0 };
      const result = moveLegend(car, card, 'easy', track);
      expect(result.car.position).toBe(19);
      expect(result.spacesMoved).toBe(5);
    });

    it('adds diamond modifier to speed limit', () => {
      // Medium: diamond 1, move = 5+1=6, new position = 14+6=20
      const car: LegendCarState = { id: 'l1', position: 14, lapCount: 0 };
      const result = moveLegend(car, card, 'medium', track);
      expect(result.car.position).toBe(20);
      expect(result.spacesMoved).toBe(6);
    });

    it('harder difficulty crosses corner faster', () => {
      // Hard: diamond 2, move = 5+2=7, new position = 14+7=21
      const car: LegendCarState = { id: 'l1', position: 14, lapCount: 0 };
      const result = moveLegend(car, card, 'hard', track);
      expect(result.car.position).toBe(21);
      expect(result.spacesMoved).toBe(7);
    });

    it('works at position 15 (between line 14 and corner 16)', () => {
      // Position 15, corner speed limit 5, easy diamond 0
      // Move = 5+0=5, new pos = 15+5=20
      const car: LegendCarState = { id: 'l1', position: 15, lapCount: 0 };
      const result = moveLegend(car, card, 'easy', track);
      expect(result.car.position).toBe(20);
      expect(result.spacesMoved).toBe(5);
    });
  });

  describe('wrapping around the track', () => {
    it('wraps position past the end of the track', () => {
      // Card 9: easy {speed:7, diamond:0}. Position 44, speed 7 → 44+7=51 → 51%48=3
      // Next corner from 44 is corner 1 at 16, distance = (16-44+48)%48 = 20
      // Speed 7 < 20, so straight movement applies
      const card9 = LEGEND_CARDS[8]; // id:9, easy: {speed:7, diamond:0}
      const car: LegendCarState = { id: 'l1', position: 44, lapCount: 0 };
      const result = moveLegend(car, card9, 'easy', track);
      expect(result.car.position).toBe(3); // (44+7)%48=3
    });
  });
});

// ── Legend Initialization ──

describe('initLegends', () => {
  it('creates the specified number of legend cars', () => {
    const state = initLegends(
      { count: 3, difficulty: 'medium', seed: 42 },
      [45, 44, 43],
    );
    expect(state.cars).toHaveLength(3);
    expect(state.cars[0].id).toBe('legend-1');
    expect(state.cars[1].id).toBe('legend-2');
    expect(state.cars[2].id).toBe('legend-3');
  });

  it('sets starting positions correctly', () => {
    const state = initLegends(
      { count: 2, difficulty: 'easy', seed: 99 },
      [46, 45],
    );
    expect(state.cars[0].position).toBe(46);
    expect(state.cars[1].position).toBe(45);
  });

  it('initializes all cars at lap 0', () => {
    const state = initLegends(
      { count: 2, difficulty: 'hard', seed: 1 },
      [47, 46],
    );
    for (const car of state.cars) {
      expect(car.lapCount).toBe(0);
    }
  });

  it('shuffles the deck (10 cards)', () => {
    const state = initLegends(
      { count: 1, difficulty: 'easy', seed: 42 },
      [47],
    );
    expect(state.deck).toHaveLength(10);
    expect(state.discard).toHaveLength(0);
    expect(state.currentCard).toBeNull();
  });

  it('sets the difficulty', () => {
    const state = initLegends(
      { count: 1, difficulty: 'hard', seed: 1 },
      [47],
    );
    expect(state.difficulty).toBe('hard');
  });

  it('rejects count < 1', () => {
    expect(() => initLegends({ count: 0, difficulty: 'easy', seed: 1 }, [])).toThrow(
      'Legend count must be 1-5',
    );
  });

  it('rejects count > 5', () => {
    expect(() =>
      initLegends({ count: 6, difficulty: 'easy', seed: 1 }, [1, 2, 3, 4, 5, 6]),
    ).toThrow('Legend count must be 1-5');
  });

  it('rejects mismatched positions count', () => {
    expect(() => initLegends({ count: 2, difficulty: 'easy', seed: 1 }, [47])).toThrow(
      'Expected 2 starting positions',
    );
  });

  it('produces different shuffles with different seeds', () => {
    const state1 = initLegends({ count: 1, difficulty: 'easy', seed: 1 }, [47]);
    const state2 = initLegends({ count: 1, difficulty: 'easy', seed: 2 }, [47]);
    const ids1 = state1.deck.map(c => c.id);
    const ids2 = state2.deck.map(c => c.id);
    expect(ids1).not.toEqual(ids2);
  });
});

// ── Card Flipping ──

describe('flipLegendCard', () => {
  it('takes a card from the deck and sets it as currentCard', () => {
    const state = initLegends({ count: 1, difficulty: 'easy', seed: 42 }, [47]);
    const rng = createRng(100);
    const flipped = flipLegendCard(state, rng);
    expect(flipped.currentCard).not.toBeNull();
    expect(flipped.deck).toHaveLength(9);
    expect(flipped.discard).toHaveLength(0);
  });

  it('reshuffles discard when deck is empty', () => {
    const state: LegendState = {
      cars: [{ id: 'l1', position: 0, lapCount: 0 }],
      deck: [],
      discard: [...LEGEND_CARDS],
      difficulty: 'easy',
      currentCard: null,
    };
    const rng = createRng(42);
    const flipped = flipLegendCard(state, rng);
    expect(flipped.currentCard).not.toBeNull();
    expect(flipped.deck).toHaveLength(9);
    expect(flipped.discard).toHaveLength(0);
  });

  it('throws when both deck and discard are empty', () => {
    const state: LegendState = {
      cars: [{ id: 'l1', position: 0, lapCount: 0 }],
      deck: [],
      discard: [],
      difficulty: 'easy',
      currentCard: null,
    };
    const rng = createRng(42);
    expect(() => flipLegendCard(state, rng)).toThrow('both empty');
  });
});

describe('discardCurrentCard', () => {
  it('moves currentCard to discard pile', () => {
    const state = initLegends({ count: 1, difficulty: 'easy', seed: 42 }, [47]);
    const rng = createRng(100);
    const flipped = flipLegendCard(state, rng);
    const card = flipped.currentCard!;
    const discarded = discardCurrentCard(flipped);
    expect(discarded.currentCard).toBeNull();
    expect(discarded.discard).toContainEqual(card);
  });

  it('throws when no current card', () => {
    const state = initLegends({ count: 1, difficulty: 'easy', seed: 42 }, [47]);
    expect(() => discardCurrentCard(state)).toThrow('No current Legend card');
  });
});

// ── Full Round Execution ──

describe('executeLegendRound', () => {
  it('flips a card, moves all legend cars, and discards', () => {
    const state = initLegends(
      { count: 2, difficulty: 'easy', seed: 42 },
      [5, 3],
    );
    const rng = createRng(100);
    const after = executeLegendRound(state, track, rng, 1);

    // Card was flipped and discarded
    expect(after.currentCard).toBeNull();
    expect(after.discard).toHaveLength(1);
    expect(after.deck).toHaveLength(9);

    // Both cars should have moved forward
    expect(after.cars[0].position).not.toBe(5);
    expect(after.cars[1].position).not.toBe(3);
  });

  it('exhausts and reshuffles the deck over 10+ rounds', () => {
    let state = initLegends(
      { count: 1, difficulty: 'medium', seed: 7 },
      [0],
    );
    const rng = createRng(200);

    // Play 11 rounds (will exhaust 10-card deck and reshuffle)
    for (let i = 0; i < 11; i++) {
      state = executeLegendRound(state, track, rng, 3);
    }

    // Should have processed 11 cards total: 10 from first deck + 1 from reshuffled
    expect(state.discard.length + state.deck.length).toBe(LEGEND_DECK_SIZE);
    // All 10 cards should still be accounted for
    expect(state.discard.length + state.deck.length).toBe(10);
  });

  it('all legend cars use the same card each round', () => {
    // We verify this indirectly: 2 cars at same position with same difficulty
    // should end up at the same position
    const state = initLegends(
      { count: 2, difficulty: 'easy', seed: 42 },
      [5, 5], // same starting position
    );
    const rng = createRng(100);
    const after = executeLegendRound(state, track, rng, 1);
    expect(after.cars[0].position).toBe(after.cars[1].position);
  });
});

// ── Race Completion ──

describe('anyLegendFinished', () => {
  it('returns false when no legend has completed target laps', () => {
    const state: LegendState = {
      cars: [
        { id: 'l1', position: 40, lapCount: 0 },
        { id: 'l2', position: 30, lapCount: 0 },
      ],
      deck: [],
      discard: [],
      difficulty: 'easy',
      currentCard: null,
    };
    expect(anyLegendFinished(state, 1)).toBe(false);
  });

  it('returns true when a legend has completed target laps', () => {
    const state: LegendState = {
      cars: [
        { id: 'l1', position: 5, lapCount: 1 },
        { id: 'l2', position: 30, lapCount: 0 },
      ],
      deck: [],
      discard: [],
      difficulty: 'easy',
      currentCard: null,
    };
    expect(anyLegendFinished(state, 1)).toBe(true);
  });
});

describe('getLegendStandings', () => {
  it('sorts by lap count first (higher = better)', () => {
    const state: LegendState = {
      cars: [
        { id: 'l1', position: 5, lapCount: 0 },
        { id: 'l2', position: 10, lapCount: 1 },
      ],
      deck: [],
      discard: [],
      difficulty: 'easy',
      currentCard: null,
    };
    const standings = getLegendStandings(state, track);
    expect(standings[0].id).toBe('l2');
    expect(standings[1].id).toBe('l1');
  });

  it('sorts by position within same lap (further ahead = better)', () => {
    const state: LegendState = {
      cars: [
        { id: 'l1', position: 5, lapCount: 0 },
        { id: 'l2', position: 20, lapCount: 0 },
        { id: 'l3', position: 10, lapCount: 0 },
      ],
      deck: [],
      discard: [],
      difficulty: 'easy',
      currentCard: null,
    };
    const standings = getLegendStandings(state, track);
    expect(standings[0].id).toBe('l2');
    expect(standings[1].id).toBe('l3');
    expect(standings[2].id).toBe('l1');
  });
});

// ── Legends never use heat/cooldown/boost/slipstream ──

describe('Legend constraints', () => {
  it('LegendCarState has no heat, hand, or deck properties', () => {
    const car: LegendCarState = { id: 'l1', position: 0, lapCount: 0 };
    expect(car).not.toHaveProperty('hand');
    expect(car).not.toHaveProperty('drawPile');
    expect(car).not.toHaveProperty('discardPile');
    expect(car).not.toHaveProperty('engineZone');
    expect(car).not.toHaveProperty('gear');
  });
});
