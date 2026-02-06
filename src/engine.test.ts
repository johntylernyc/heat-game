import { describe, it, expect } from 'vitest';
import {
  initGame,
  executeGearShift,
  executePlayCards,
  executeCooldown,
  executeBoost,
  endReactPhase,
  executeReplenish,
} from './engine.js';
import type { GameConfig } from './engine.js';
import type { Gear } from './types.js';
import { HAND_SIZE, CARDS_PER_GEAR, COOLDOWN_PER_GEAR } from './types.js';
import { createRng } from './deck.js';
import { heatCard, speedCard } from './cards.js';

const defaultConfig: GameConfig = {
  playerIds: ['alice', 'bob'],
  lapTarget: 2,
  stressCount: 3,
  seed: 42,
};

describe('initGame', () => {
  it('creates game with correct number of players', () => {
    const state = initGame(defaultConfig);
    expect(state.players).toHaveLength(2);
  });

  it('all players start in gear 1', () => {
    const state = initGame(defaultConfig);
    for (const p of state.players) {
      expect(p.gear).toBe(1);
    }
  });

  it('all players have 7 cards in hand', () => {
    const state = initGame(defaultConfig);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(HAND_SIZE);
    }
  });

  it('all players have 6 Heat in engine zone', () => {
    const state = initGame(defaultConfig);
    for (const p of state.players) {
      expect(p.engineZone).toHaveLength(6);
      expect(p.engineZone.every(c => c.type === 'heat')).toBe(true);
    }
  });

  it('draw pile contains remaining cards after dealing hand', () => {
    const state = initGame(defaultConfig);
    for (const p of state.players) {
      // 18 total deck cards (15 base + 3 stress), 7 in hand = 11 in draw pile
      expect(p.drawPile).toHaveLength(18 - HAND_SIZE);
    }
  });

  it('starts in gear-shift phase, round 1, racing', () => {
    const state = initGame(defaultConfig);
    expect(state.phase).toBe('gear-shift');
    expect(state.round).toBe(1);
    expect(state.raceStatus).toBe('racing');
    expect(state.activePlayerIndex).toBe(0);
  });

  it('throws with fewer than 2 players', () => {
    expect(() => initGame({ ...defaultConfig, playerIds: ['solo'] })).toThrow('at least 2');
  });

  it('produces deterministic state from same seed', () => {
    const state1 = initGame(defaultConfig);
    const state2 = initGame(defaultConfig);
    expect(state1).toEqual(state2);
  });

  it('produces different state from different seeds', () => {
    const state1 = initGame({ ...defaultConfig, seed: 1 });
    const state2 = initGame({ ...defaultConfig, seed: 2 });
    // Hands should differ (with overwhelming probability)
    expect(state1.players[0].hand).not.toEqual(state2.players[0].hand);
  });
});

describe('executeGearShift', () => {
  it('shifts gear and transitions to play-cards phase', () => {
    const state = initGame(defaultConfig);
    const result = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 0,
      targetGear: 2,
    });
    expect(result.players[0].gear).toBe(2);
    expect(result.phase).toBe('play-cards');
  });

  it('throws if not in gear-shift phase', () => {
    const state = { ...initGame(defaultConfig), phase: 'play-cards' as const };
    expect(() =>
      executeGearShift(state, { type: 'gear-shift', playerIndex: 0, targetGear: 2 }),
    ).toThrow('Expected phase');
  });

  it('throws if wrong player acts', () => {
    const state = initGame(defaultConfig);
    expect(() =>
      executeGearShift(state, { type: 'gear-shift', playerIndex: 1, targetGear: 2 }),
    ).toThrow('not the active player');
  });

  it('allows staying in same gear', () => {
    const state = initGame(defaultConfig);
    const result = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 0,
      targetGear: 1,
    });
    expect(result.players[0].gear).toBe(1);
    expect(result.phase).toBe('play-cards');
  });
});

describe('executePlayCards', () => {
  function getToPlayCards(gear: Gear = 1): ReturnType<typeof initGame> {
    let state = initGame(defaultConfig);
    state = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 0,
      targetGear: gear,
    });
    return state;
  }

  it('plays correct number of cards for gear 1', () => {
    const state = getToPlayCards(1);
    // Find a playable card (speed or speed upgrade)
    const playableIdx = state.players[0].hand.findIndex(
      c => c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'),
    );

    const result = executePlayCards(state, {
      type: 'play-cards',
      playerIndex: 0,
      cardIndices: [playableIdx],
    });
    expect(result.phase).toBe('react');
    expect(result.players[0].hand).toHaveLength(HAND_SIZE - 1);
  });

  it('rejects wrong number of cards', () => {
    const state = getToPlayCards(1);
    expect(() =>
      executePlayCards(state, {
        type: 'play-cards',
        playerIndex: 0,
        cardIndices: [0, 1], // Gear 1 requires exactly 1
      }),
    ).toThrow('Must play exactly 1');
  });

  it('advances player position by total speed', () => {
    const state = getToPlayCards(2); // Gear 2: play 2 cards
    // Find two speed cards
    const player = state.players[0];
    const speedIndices: number[] = [];
    for (let i = 0; i < player.hand.length && speedIndices.length < 2; i++) {
      if (player.hand[i].type === 'speed') {
        speedIndices.push(i);
      }
    }

    if (speedIndices.length < 2) return; // Skip if not enough speed cards

    const expectedSpeed = speedIndices.reduce((sum, idx) => {
      const card = player.hand[idx];
      return sum + (card.type === 'speed' ? card.value : 0);
    }, 0);

    const result = executePlayCards(state, {
      type: 'play-cards',
      playerIndex: 0,
      cardIndices: speedIndices,
    });
    expect(result.players[0].position).toBe(expectedSpeed);
  });

  it('rejects non-speed cards', () => {
    // Create a state where player has a heat card in hand
    const state = getToPlayCards(1);
    const player = state.players[0];
    const heatIdx = player.hand.findIndex(c => c.type === 'heat');
    if (heatIdx === -1) return; // No heat cards in hand, skip

    expect(() =>
      executePlayCards(state, {
        type: 'play-cards',
        playerIndex: 0,
        cardIndices: [heatIdx],
      }),
    ).toThrow('cannot be played for speed');
  });
});

describe('executeCooldown', () => {
  function getToReactPhase(): ReturnType<typeof initGame> {
    let state = initGame(defaultConfig);
    state = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 0,
      targetGear: 1, // Cooldown 3 in gear 1
    });

    // Find a playable card
    const playableIdx = state.players[0].hand.findIndex(
      c => c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'),
    );

    state = executePlayCards(state, {
      type: 'play-cards',
      playerIndex: 0,
      cardIndices: [playableIdx],
    });

    return state;
  }

  it('moves heat cards from discard to engine zone', () => {
    let state = getToReactPhase();
    // Manually put a heat card in discard for testing
    const player = state.players[0];
    const modifiedPlayer = {
      ...player,
      discardPile: [...player.discardPile, heatCard()],
      engineZone: player.engineZone.slice(0, 5), // Remove one
    };
    state = { ...state, players: [modifiedPlayer, state.players[1]] };

    const heatIdx = state.players[0].discardPile.findIndex(c => c.type === 'heat');
    if (heatIdx === -1) return;

    const result = executeCooldown(state, {
      type: 'cooldown',
      playerIndex: 0,
      heatIndices: [heatIdx],
    });

    expect(result.players[0].engineZone.length).toBe(modifiedPlayer.engineZone.length + 1);
  });

  it('respects cooldown limit per gear', () => {
    // Gear 1 has cooldown 3
    let state = getToReactPhase();
    const player = state.players[0];
    const modifiedPlayer = {
      ...player,
      discardPile: [heatCard(), heatCard(), heatCard(), heatCard()],
    };
    state = { ...state, players: [modifiedPlayer, state.players[1]] };

    // Trying to cool down 4 in gear 1 (max 3)
    expect(() =>
      executeCooldown(state, {
        type: 'cooldown',
        playerIndex: 0,
        heatIndices: [0, 1, 2, 3],
      }),
    ).toThrow('Cooldown limit is 3');
  });

  it('rejects non-heat cards for cooldown', () => {
    let state = getToReactPhase();
    const player = state.players[0];
    // Discard pile should have the played card, which might be a speed card
    const nonHeatIdx = player.discardPile.findIndex(c => c.type !== 'heat');
    if (nonHeatIdx === -1) return;

    expect(() =>
      executeCooldown(state, {
        type: 'cooldown',
        playerIndex: 0,
        heatIndices: [nonHeatIdx],
      }),
    ).toThrow('only cool down Heat');
  });
});

describe('executeBoost', () => {
  function getToReactPhase(gear: Gear = 2): ReturnType<typeof initGame> {
    let state = initGame(defaultConfig);
    state = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 0,
      targetGear: gear,
    });

    // Find playable cards matching gear requirement
    const player = state.players[0];
    const required = CARDS_PER_GEAR[gear];
    const playableIndices: number[] = [];
    for (let i = 0; i < player.hand.length && playableIndices.length < required; i++) {
      const c = player.hand[i];
      if (c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat')) {
        playableIndices.push(i);
      }
    }
    if (playableIndices.length < required) {
      // Force playable cards
      throw new Error('Test setup: not enough playable cards');
    }

    state = executePlayCards(state, {
      type: 'play-cards',
      playerIndex: 0,
      cardIndices: playableIndices,
    });

    return state;
  }

  it('costs 1 heat from engine zone', () => {
    const state = getToReactPhase(1);
    const rng = createRng(99);
    const engineBefore = state.players[0].engineZone.length;

    const result = executeBoost(state, { type: 'boost', playerIndex: 0 }, rng);
    expect(result.players[0].engineZone).toHaveLength(engineBefore - 1);
  });

  it('fails without heat in engine', () => {
    let state = getToReactPhase(1);
    const player = { ...state.players[0], engineZone: [] };
    state = { ...state, players: [player, state.players[1]] };

    const rng = createRng(99);
    expect(() => executeBoost(state, { type: 'boost', playerIndex: 0 }, rng)).toThrow(
      'No Heat in engine',
    );
  });

  it('increases position (flips until speed card found)', () => {
    const state = getToReactPhase(1);
    const posBefore = state.players[0].position;
    const rng = createRng(99);

    const result = executeBoost(state, { type: 'boost', playerIndex: 0 }, rng);
    // Position should increase (unless draw pile somehow has no speed cards)
    expect(result.players[0].position).toBeGreaterThanOrEqual(posBefore);
  });

  it('is available in any gear (Simon correction)', () => {
    // Test boost in gear 1 (previously might have been restricted)
    const state = getToReactPhase(1);
    const rng = createRng(99);
    // Should not throw - boost available in all gears
    expect(() => executeBoost(state, { type: 'boost', playerIndex: 0 }, rng)).not.toThrow();
  });
});

describe('endReactPhase', () => {
  it('transitions to replenish phase', () => {
    let state = initGame(defaultConfig);
    state = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 0,
      targetGear: 1,
    });
    const playableIdx = state.players[0].hand.findIndex(
      c => c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'),
    );
    state = executePlayCards(state, {
      type: 'play-cards',
      playerIndex: 0,
      cardIndices: [playableIdx],
    });

    const result = endReactPhase(state, 0);
    expect(result.phase).toBe('replenish');
  });
});

describe('executeReplenish', () => {
  function getToReplenish(): ReturnType<typeof initGame> {
    let state = initGame(defaultConfig);
    state = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 0,
      targetGear: 1,
    });
    const playableIdx = state.players[0].hand.findIndex(
      c => c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'),
    );
    state = executePlayCards(state, {
      type: 'play-cards',
      playerIndex: 0,
      cardIndices: [playableIdx],
    });
    state = endReactPhase(state, 0);
    return state;
  }

  it('replenishes hand to 7 cards', () => {
    const state = getToReplenish();
    const rng = createRng(42);
    const result = executeReplenish(state, 0, rng);
    expect(result.players[0].hand).toHaveLength(HAND_SIZE);
  });

  it('advances to next player in turn order', () => {
    const state = getToReplenish();
    const rng = createRng(42);
    const result = executeReplenish(state, 0, rng);
    expect(result.activePlayerIndex).toBe(1);
    expect(result.phase).toBe('gear-shift');
  });

  it('starts new round after last player', () => {
    let state = getToReplenish();
    const rng = createRng(42);
    state = executeReplenish(state, 0, rng);

    // Now player 1's turn - go through their turn
    state = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 1,
      targetGear: 1,
    });
    const playableIdx = state.players[1].hand.findIndex(
      c => c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'),
    );
    state = executePlayCards(state, {
      type: 'play-cards',
      playerIndex: 1,
      cardIndices: [playableIdx],
    });
    state = endReactPhase(state, 1);
    state = executeReplenish(state, 1, rng);

    expect(state.round).toBe(2);
    expect(state.activePlayerIndex).toBe(0);
    expect(state.phase).toBe('gear-shift');
  });
});

describe('Full turn cycle', () => {
  it('completes a full turn for one player: gear-shift → play → react → replenish', () => {
    let state = initGame(defaultConfig);
    const rng = createRng(99);

    // Gear shift
    state = executeGearShift(state, {
      type: 'gear-shift',
      playerIndex: 0,
      targetGear: 1,
    });
    expect(state.phase).toBe('play-cards');

    // Play cards
    const playableIdx = state.players[0].hand.findIndex(
      c => c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'),
    );
    state = executePlayCards(state, {
      type: 'play-cards',
      playerIndex: 0,
      cardIndices: [playableIdx],
    });
    expect(state.phase).toBe('react');

    // End react (no cooldown/boost)
    state = endReactPhase(state, 0);
    expect(state.phase).toBe('replenish');

    // Replenish
    state = executeReplenish(state, 0, rng);
    expect(state.players[0].hand).toHaveLength(HAND_SIZE);
    expect(state.activePlayerIndex).toBe(1); // Next player
  });
});
