import { describe, it, expect } from 'vitest';
import {
  initDraft,
  executeDraftPick,
  getCurrentDrafter,
  getPlayerDraftedCards,
  buildDraftedDeck,
  cardsPerRound,
} from '../draft.js';
import { DRAFT_ROUNDS } from '../types.js';
import type { DraftState, GarageUpgradeCard } from '../types.js';

function makeCard(name: string, speed: number): GarageUpgradeCard {
  return {
    type: 'upgrade',
    garageType: 'body',
    name,
    speedValue: speed,
    heatCost: 0,
    effects: [],
  };
}

/** Create a pool large enough for a given player count. */
function makePool(playerCount: number): GarageUpgradeCard[] {
  const needed = cardsPerRound(playerCount) * DRAFT_ROUNDS;
  return Array.from({ length: needed + 5 }, (_, i) => makeCard(`card-${i}`, i + 1));
}

describe('Draft Initialization', () => {
  it('creates a valid draft state for 2 players', () => {
    const state = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 42,
    });

    expect(state.phase).toBe('drafting');
    expect(state.playerCount).toBe(2);
    expect(state.players).toHaveLength(2);
    expect(state.availableCards).toHaveLength(5); // players + 3 for round 1
    expect(state.currentRound).toBe(0);
    expect(state.currentPickIndex).toBe(0);
    expect(state.pickOrders).toHaveLength(DRAFT_ROUNDS);
  });

  it('deals correct number of face-up cards per round (players + 3)', () => {
    // Default pool has 22 cards; max players for 3 rounds = floor((22/3) - 3) = 4
    for (const count of [2, 3, 4]) {
      const ids = Array.from({ length: count }, (_, i) => `p${i}`);
      const grids = Array.from({ length: count }, (_, i) => i + 1);
      const state = initDraft({ playerIds: ids, gridPositions: grids, seed: 1 });
      expect(state.availableCards).toHaveLength(count + 3);
    }
  });

  it('supports larger player counts with custom pool', () => {
    for (const count of [5, 6]) {
      const ids = Array.from({ length: count }, (_, i) => `p${i}`);
      const grids = Array.from({ length: count }, (_, i) => i + 1);
      const pool = makePool(count);
      const state = initDraft({ playerIds: ids, gridPositions: grids, seed: 1, cardPool: pool });
      expect(state.availableCards).toHaveLength(count + 3);
    }
  });

  it('throws with fewer than 2 players', () => {
    expect(() =>
      initDraft({ playerIds: ['p1'], gridPositions: [1], seed: 1 }),
    ).toThrow('at least 2 players');
  });

  it('throws if playerIds and gridPositions length mismatch', () => {
    expect(() =>
      initDraft({ playerIds: ['p1', 'p2'], gridPositions: [1], seed: 1 }),
    ).toThrow('same length');
  });

  it('throws if card pool too small for all rounds', () => {
    // 2 players need 5/round × 3 rounds = 15 total
    const smallPool = Array.from({ length: 10 }, (_, i) => makeCard(`c${i}`, i));
    expect(() =>
      initDraft({
        playerIds: ['p1', 'p2'],
        gridPositions: [1, 2],
        seed: 1,
        cardPool: smallPool,
      }),
    ).toThrow('Not enough upgrade cards');
  });

  it('accepts a custom card pool', () => {
    const pool = makePool(2);
    const state = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 42,
      cardPool: pool,
    });
    expect(state.availableCards).toHaveLength(5);
  });
});

describe('Draft Pick Order (Snake Draft)', () => {
  it('Round 1 is back-to-front (last grid position picks first)', () => {
    const state = initDraft({
      playerIds: ['p1', 'p2', 'p3'],
      gridPositions: [1, 2, 3],
      seed: 42,
    });

    // Round 1: back-to-front → p3 (grid 3), p2 (grid 2), p1 (grid 1)
    const round1Order = state.pickOrders[0];
    expect(state.players[round1Order[0]].playerId).toBe('p3');
    expect(state.players[round1Order[1]].playerId).toBe('p2');
    expect(state.players[round1Order[2]].playerId).toBe('p1');
  });

  it('Round 2 is front-to-back (first grid position picks first)', () => {
    const state = initDraft({
      playerIds: ['p1', 'p2', 'p3'],
      gridPositions: [1, 2, 3],
      seed: 42,
    });

    // Round 2: front-to-back → p1 (grid 1), p2 (grid 2), p3 (grid 3)
    const round2Order = state.pickOrders[1];
    expect(state.players[round2Order[0]].playerId).toBe('p1');
    expect(state.players[round2Order[1]].playerId).toBe('p2');
    expect(state.players[round2Order[2]].playerId).toBe('p3');
  });

  it('Round 3 is back-to-front (same as round 1)', () => {
    const state = initDraft({
      playerIds: ['p1', 'p2', 'p3'],
      gridPositions: [1, 2, 3],
      seed: 42,
    });

    expect(state.pickOrders[2]).toEqual(state.pickOrders[0]);
  });

  it('getCurrentDrafter returns correct player', () => {
    const state = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 42,
    });

    // Round 1, back-to-front: p2 picks first
    expect(getCurrentDrafter(state)).toBe('p2');
  });
});

describe('Draft Execution', () => {
  function setupDraft(): DraftState {
    const pool = makePool(2);
    return initDraft({
      playerIds: ['alice', 'bob'],
      gridPositions: [1, 2],
      seed: 100,
      cardPool: pool,
    });
  }

  it('allows the correct player to pick', () => {
    let state = setupDraft();
    const drafter = getCurrentDrafter(state)!;

    // bob should pick first (back-to-front)
    expect(drafter).toBe('bob');

    state = executeDraftPick(state, {
      type: 'draft-pick',
      playerId: 'bob',
      cardIndex: 0,
    });

    expect(state.phase).toBe('drafting');
  });

  it('rejects pick from wrong player', () => {
    const state = setupDraft();
    expect(() =>
      executeDraftPick(state, {
        type: 'draft-pick',
        playerId: 'alice',
        cardIndex: 0,
      }),
    ).toThrow("Not alice's turn");
  });

  it('rejects invalid card index', () => {
    const state = setupDraft();
    const drafter = getCurrentDrafter(state)!;
    expect(() =>
      executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 99,
      }),
    ).toThrow('Invalid card index');
  });

  it('removes picked card from available cards', () => {
    let state = setupDraft();
    const initialCount = state.availableCards.length;
    const drafter = getCurrentDrafter(state)!;

    state = executeDraftPick(state, {
      type: 'draft-pick',
      playerId: drafter,
      cardIndex: 0,
    });

    expect(state.availableCards).toHaveLength(initialCount - 1);
  });

  it('adds picked card to player drafted cards', () => {
    let state = setupDraft();
    const drafter = getCurrentDrafter(state)!;
    const pickedCard = state.availableCards[0];

    state = executeDraftPick(state, {
      type: 'draft-pick',
      playerId: drafter,
      cardIndex: 0,
    });

    const drafted = getPlayerDraftedCards(state, drafter);
    expect(drafted).toHaveLength(1);
    expect(drafted[0]).toEqual(pickedCard);
  });

  it('deals new cards when round completes', () => {
    let state = setupDraft();

    // Complete round 1 (2 picks for 2 players)
    for (let i = 0; i < 2; i++) {
      const drafter = getCurrentDrafter(state)!;
      state = executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 0,
      });
    }

    // Should now be in round 2 with fresh cards
    expect(state.currentRound).toBe(1);
    expect(state.availableCards).toHaveLength(5); // players + 3 again
  });

  it('advances through all rounds and completes', () => {
    let state = setupDraft();

    // 2 players × 3 rounds = 6 total picks
    for (let pick = 0; pick < 6; pick++) {
      expect(state.phase).toBe('drafting');
      const drafter = getCurrentDrafter(state)!;
      state = executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 0,
      });
    }

    expect(state.phase).toBe('complete');
    expect(getPlayerDraftedCards(state, 'alice')).toHaveLength(3);
    expect(getPlayerDraftedCards(state, 'bob')).toHaveLength(3);
  });

  it('moves unpicked cards to undraftedCards each round', () => {
    let state = setupDraft();

    // Complete all 3 rounds
    for (let pick = 0; pick < 6; pick++) {
      const drafter = getCurrentDrafter(state)!;
      state = executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 0,
      });
    }

    expect(state.phase).toBe('complete');
    // 3 rounds × (5 dealt - 2 picked) = 3 rounds × 3 leftover = 9 undrafted per round
    // Plus any remaining pool cards
    expect(state.undraftedCards.length).toBeGreaterThan(0);
    expect(state.availableCards).toHaveLength(0);
  });

  it('rejects picks after draft is complete', () => {
    let state = setupDraft();

    for (let pick = 0; pick < 6; pick++) {
      const drafter = getCurrentDrafter(state)!;
      state = executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 0,
      });
    }

    expect(() =>
      executeDraftPick(state, {
        type: 'draft-pick',
        playerId: 'alice',
        cardIndex: 0,
      }),
    ).toThrow("Cannot pick during phase");
  });

  it('getCurrentDrafter returns null when complete', () => {
    let state = setupDraft();

    for (let pick = 0; pick < 6; pick++) {
      const drafter = getCurrentDrafter(state)!;
      state = executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 0,
      });
    }

    expect(getCurrentDrafter(state)).toBeNull();
  });
});

describe('Snake Draft Order Verification', () => {
  it('follows correct snake pattern for 3 players', () => {
    const pool = makePool(3);
    let state = initDraft({
      playerIds: ['p1', 'p2', 'p3'],
      gridPositions: [1, 2, 3],
      seed: 42,
      cardPool: pool,
    });

    const pickSequence: string[] = [];
    for (let i = 0; i < 9; i++) {
      const drafter = getCurrentDrafter(state)!;
      pickSequence.push(drafter);
      state = executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 0,
      });
    }

    // Round 1 (back-to-front): p3, p2, p1
    // Round 2 (front-to-back): p1, p2, p3
    // Round 3 (back-to-front): p3, p2, p1
    expect(pickSequence).toEqual([
      'p3', 'p2', 'p1', // Round 1
      'p1', 'p2', 'p3', // Round 2
      'p3', 'p2', 'p1', // Round 3
    ]);

    expect(state.phase).toBe('complete');
  });

  it('follows correct snake pattern for 4 players', () => {
    const pool = makePool(4);
    let state = initDraft({
      playerIds: ['a', 'b', 'c', 'd'],
      gridPositions: [1, 2, 3, 4],
      seed: 7,
      cardPool: pool,
    });

    const pickSequence: string[] = [];
    for (let i = 0; i < 12; i++) {
      const drafter = getCurrentDrafter(state)!;
      pickSequence.push(drafter);
      state = executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 0,
      });
    }

    expect(pickSequence).toEqual([
      'd', 'c', 'b', 'a', // Round 1 (back-to-front)
      'a', 'b', 'c', 'd', // Round 2 (front-to-back)
      'd', 'c', 'b', 'a', // Round 3 (back-to-front)
    ]);

    expect(state.phase).toBe('complete');
  });
});

describe('buildDraftedDeck', () => {
  it('builds a deck with 12 speed + 3 drafted + stress cards', () => {
    const drafted = [
      makeCard('d1', 3),
      makeCard('d2', 5),
      makeCard('d3', 7),
    ];
    const deck = buildDraftedDeck(drafted, 3);

    // 12 speed + 3 drafted + 3 stress = 18
    expect(deck).toHaveLength(18);

    const speedCards = deck.filter(c => c.type === 'speed');
    expect(speedCards).toHaveLength(12);

    const upgradeCards = deck.filter(c => c.type === 'upgrade');
    expect(upgradeCards).toHaveLength(3);

    const stressCards = deck.filter(c => c.type === 'stress');
    expect(stressCards).toHaveLength(3);
  });

  it('throws if not exactly 3 drafted cards', () => {
    expect(() => buildDraftedDeck([], 3)).toThrow('Expected 3');
    expect(() => buildDraftedDeck([makeCard('c', 1)], 3)).toThrow('Expected 3');
  });

  it('supports varying stress counts', () => {
    const drafted = [makeCard('d1', 1), makeCard('d2', 2), makeCard('d3', 3)];
    expect(buildDraftedDeck(drafted, 0)).toHaveLength(15); // 12 + 3
    expect(buildDraftedDeck(drafted, 5)).toHaveLength(20); // 12 + 3 + 5
  });
});

describe('getPlayerDraftedCards', () => {
  it('returns empty array before any picks', () => {
    const state = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 42,
    });
    expect(getPlayerDraftedCards(state, 'p1')).toHaveLength(0);
    expect(getPlayerDraftedCards(state, 'p2')).toHaveLength(0);
  });

  it('throws for unknown player', () => {
    const state = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 42,
    });
    expect(() => getPlayerDraftedCards(state, 'unknown')).toThrow('Player not found');
  });
});

describe('Deterministic shuffling', () => {
  it('produces same deal with same seed', () => {
    const state1 = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 12345,
    });
    const state2 = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 12345,
    });

    expect(state1.availableCards).toEqual(state2.availableCards);
  });

  it('produces different deal with different seed', () => {
    const state1 = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 1,
    });
    const state2 = initDraft({
      playerIds: ['p1', 'p2'],
      gridPositions: [1, 2],
      seed: 2,
    });

    const names1 = state1.availableCards.map(c => c.name);
    const names2 = state2.availableCards.map(c => c.name);
    expect(names1).not.toEqual(names2);
  });
});

describe('Card accounting', () => {
  it('all cards are accounted for after complete draft', () => {
    const pool = makePool(3);
    const poolSize = pool.length;
    let state = initDraft({
      playerIds: ['p1', 'p2', 'p3'],
      gridPositions: [1, 2, 3],
      seed: 42,
      cardPool: pool,
    });

    for (let i = 0; i < 9; i++) {
      const drafter = getCurrentDrafter(state)!;
      state = executeDraftPick(state, {
        type: 'draft-pick',
        playerId: drafter,
        cardIndex: 0,
      });
    }

    const totalDrafted = state.players.reduce(
      (sum, p) => sum + p.draftedCards.length,
      0,
    );

    // drafted + undrafted + available + remaining = original pool size
    const totalAccounted =
      totalDrafted +
      state.undraftedCards.length +
      state.availableCards.length +
      state.remainingPool.length;

    expect(totalAccounted).toBe(poolSize);
    expect(totalDrafted).toBe(9); // 3 players × 3 rounds
  });
});
