import { describe, it, expect } from 'vitest';
import {
  initGame,
  executeGearShiftPhase,
  executePlayCardsPhase,
  executeRevealAndMove,
  executeAdrenaline,
  executeCooldown,
  executeBoost,
  endReactPhase,
  executeSlipstream,
  executeCheckCorner,
  executeDiscardPhase,
  executeReplenishPhase,
  computeTurnOrder,
  isClutteredHand,
  isSlipstreamEligible,
  findCornersCrossed,
} from './engine.js';
import type { GameConfig, GearSelection, CardSelection } from './engine.js';
import type { Gear, PlayerState, GameState, CornerDef } from './types.js';
import { HAND_SIZE, CARDS_PER_GEAR, COOLDOWN_PER_GEAR } from './types.js';
import { createRng } from './deck.js';
import { heatCard, speedCard, stressCard } from './cards.js';

const defaultConfig: GameConfig = {
  playerIds: ['alice', 'bob'],
  lapTarget: 2,
  stressCount: 3,
  seed: 42,
  totalSpaces: 100,
  corners: [],
};

// -- Helpers --

function findPlayableIndices(hand: PlayerState['hand'], count: number): number[] {
  const indices: number[] = [];
  for (let i = 0; i < hand.length && indices.length < count; i++) {
    const c = hand[i];
    if (c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat')) {
      indices.push(i);
    }
  }
  return indices;
}

function makeGearSelections(state: GameState, gears: Gear[]): GearSelection[] {
  return gears.map((targetGear, i) => ({ playerIndex: i, targetGear }));
}

function makeCardSelections(state: GameState): CardSelection[] {
  return state.players.map((player, i) => {
    const required = CARDS_PER_GEAR[player.gear];
    const indices = findPlayableIndices(player.hand, required);
    return { playerIndex: i, cardIndices: indices };
  });
}

/** Advance state through phases 1-2 (gear shift + play cards) */
function advanceToRevealAndMove(state: GameState, gears: Gear[] = [1, 1]): GameState {
  state = executeGearShiftPhase(state, makeGearSelections(state, gears));
  state = executePlayCardsPhase(state, makeCardSelections(state));
  return state;
}

/** Advance through phases 1-3 (gear shift + play cards + reveal all) */
function advanceToAdrenaline(state: GameState, gears: Gear[] = [1, 1]): GameState {
  const rng = createRng(99);
  state = advanceToRevealAndMove(state, gears);
  // Reveal all players in turn order
  for (const pi of state.turnOrder) {
    state = executeRevealAndMove(state, pi, rng);
  }
  return state;
}

/** Advance through phases 1-4 (through adrenaline, into react) */
function advanceToReact(state: GameState, gears: Gear[] = [1, 1]): GameState {
  state = advanceToAdrenaline(state, gears);
  state = executeAdrenaline(state);
  return state;
}

/** Advance through phases 1-5 (through react for all players, into slipstream) */
function advanceToSlipstream(state: GameState, gears: Gear[] = [1, 1]): GameState {
  state = advanceToReact(state, gears);
  for (const pi of state.turnOrder) {
    state = endReactPhase(state, pi);
  }
  return state;
}

/** Advance through phases 1-6 (through slipstream, into check-corner) */
function advanceToCheckCorner(state: GameState, gears: Gear[] = [1, 1]): GameState {
  state = advanceToSlipstream(state, gears);
  for (const pi of state.turnOrder) {
    state = executeSlipstream(state, { type: 'slipstream', playerIndex: pi, accept: false });
  }
  return state;
}

/** Advance through phases 1-7 (through check-corner, into discard) */
function advanceToDiscard(state: GameState, gears: Gear[] = [1, 1]): GameState {
  state = advanceToCheckCorner(state, gears);
  for (const pi of state.turnOrder) {
    state = executeCheckCorner(state, pi);
  }
  return state;
}

/** Advance through phases 1-8 (through discard, into replenish) */
function advanceToReplenish(state: GameState, gears: Gear[] = [1, 1]): GameState {
  state = advanceToDiscard(state, gears);
  const discardSelections = state.players.map((_, i) => ({ playerIndex: i, cardIndices: [] as number[] }));
  state = executeDiscardPhase(state, discardSelections);
  return state;
}

// -- Tests --

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

  it('initializes per-round tracking fields', () => {
    const state = initGame(defaultConfig);
    for (const p of state.players) {
      expect(p.speed).toBe(0);
      expect(p.hasBoosted).toBe(false);
      expect(p.adrenalineCooldownBonus).toBe(0);
      expect(p.playedCards).toEqual([]);
      expect(p.previousPosition).toBe(0);
    }
  });

  it('stores track configuration', () => {
    const corners: CornerDef[] = [{ id: 1, speedLimit: 3, position: 10 }];
    const state = initGame({ ...defaultConfig, corners, totalSpaces: 50 });
    expect(state.corners).toEqual(corners);
    expect(state.totalSpaces).toBe(50);
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
    expect(state1.players[0].hand).not.toEqual(state2.players[0].hand);
  });
});

describe('Phase 1: Gear Shift', () => {
  it('shifts all gears and transitions to play-cards', () => {
    const state = initGame(defaultConfig);
    const result = executeGearShiftPhase(state, [
      { playerIndex: 0, targetGear: 2 },
      { playerIndex: 1, targetGear: 1 },
    ]);
    expect(result.players[0].gear).toBe(2);
    expect(result.players[1].gear).toBe(1);
    expect(result.phase).toBe('play-cards');
  });

  it('throws if not in gear-shift phase', () => {
    const state = { ...initGame(defaultConfig), phase: 'play-cards' as const };
    expect(() =>
      executeGearShiftPhase(state, makeGearSelections(state, [1, 1])),
    ).toThrow('Expected phase');
  });

  it('throws if wrong number of selections', () => {
    const state = initGame(defaultConfig);
    expect(() =>
      executeGearShiftPhase(state, [{ playerIndex: 0, targetGear: 1 }]),
    ).toThrow('Expected gear selections from all 2');
  });

  it('throws on invalid gear shift', () => {
    const state = initGame(defaultConfig);
    expect(() =>
      executeGearShiftPhase(state, [
        { playerIndex: 0, targetGear: 4 }, // +3 from gear 1: illegal
        { playerIndex: 1, targetGear: 1 },
      ]),
    ).toThrow('invalid gear shift');
  });

  it('allows all players to stay in same gear', () => {
    const state = initGame(defaultConfig);
    const result = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));
    expect(result.players[0].gear).toBe(1);
    expect(result.players[1].gear).toBe(1);
  });
});

describe('Phase 2: Play Cards', () => {
  it('moves cards from hand to playedCards', () => {
    let state = initGame(defaultConfig);
    state = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));

    const selections = makeCardSelections(state);
    const result = executePlayCardsPhase(state, selections);

    for (let i = 0; i < result.players.length; i++) {
      const player = result.players[i];
      expect(player.playedCards).toHaveLength(CARDS_PER_GEAR[player.gear]);
      expect(player.hand).toHaveLength(HAND_SIZE - CARDS_PER_GEAR[player.gear]);
    }
  });

  it('transitions to reveal-and-move', () => {
    let state = initGame(defaultConfig);
    state = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));
    const result = executePlayCardsPhase(state, makeCardSelections(state));
    expect(result.phase).toBe('reveal-and-move');
  });

  it('sets previousPosition for each player', () => {
    let state = initGame(defaultConfig);
    state = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));
    const result = executePlayCardsPhase(state, makeCardSelections(state));
    for (const p of result.players) {
      expect(p.previousPosition).toBe(0); // All start at 0
    }
  });

  it('rejects non-playable cards (heat)', () => {
    let state = initGame(defaultConfig);
    state = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));

    // Put a heat card in hand
    const player = state.players[0];
    const modifiedPlayer = { ...player, hand: [heatCard(), ...player.hand.slice(1)] };
    state = { ...state, players: [modifiedPlayer, state.players[1]] };

    expect(() =>
      executePlayCardsPhase(state, [
        { playerIndex: 0, cardIndices: [0] },
        { playerIndex: 1, cardIndices: findPlayableIndices(state.players[1].hand, 1) },
      ]),
    ).toThrow('cannot be played');
  });

  it('rejects wrong number of cards', () => {
    let state = initGame(defaultConfig);
    state = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));

    expect(() =>
      executePlayCardsPhase(state, [
        { playerIndex: 0, cardIndices: [0, 1] }, // Gear 1 requires 1
        { playerIndex: 1, cardIndices: findPlayableIndices(state.players[1].hand, 1) },
      ]),
    ).toThrow('must play exactly 1');
  });

  it('computes turn order based on position', () => {
    let state = initGame(defaultConfig);
    // Give player 1 a head start
    const modifiedPlayers = [...state.players];
    modifiedPlayers[1] = { ...modifiedPlayers[1], position: 10 };
    state = { ...state, players: modifiedPlayers };

    state = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));
    const result = executePlayCardsPhase(state, makeCardSelections(state));

    // Player 1 is ahead, should go first
    expect(result.turnOrder[0]).toBe(1);
    expect(result.turnOrder[1]).toBe(0);
  });
});

describe('Phase 3: Reveal & Move', () => {
  it('resolves played cards and moves player', () => {
    let state = initGame(defaultConfig);
    const rng = createRng(99);
    state = advanceToRevealAndMove(state);

    const player = state.players[state.activePlayerIndex];
    const expectedSpeed = player.playedCards.reduce((sum, card) => {
      if (card.type === 'speed') return sum + card.value;
      if (card.type === 'upgrade' && card.subtype === 'speed-0') return sum;
      if (card.type === 'upgrade' && card.subtype === 'speed-5') return sum + 5;
      return sum; // Stress resolved dynamically
    }, 0);

    const activeIdx = state.activePlayerIndex;
    const result = executeRevealAndMove(state, activeIdx, rng);

    // Position should have advanced
    expect(result.players[activeIdx].position).toBeGreaterThanOrEqual(0);
    // Played cards should be cleared
    expect(result.players[activeIdx].playedCards).toEqual([]);
    // Speed should be set
    expect(result.players[activeIdx].speed).toBeGreaterThanOrEqual(0);
  });

  it('moves played cards to discard pile', () => {
    let state = initGame(defaultConfig);
    const rng = createRng(99);
    state = advanceToRevealAndMove(state);

    const activeIdx = state.activePlayerIndex;
    const playedCount = state.players[activeIdx].playedCards.length;
    const discardBefore = state.players[activeIdx].discardPile.length;

    const result = executeRevealAndMove(state, activeIdx, rng);
    expect(result.players[activeIdx].discardPile.length).toBeGreaterThanOrEqual(discardBefore + playedCount);
  });

  it('resolves stress cards by flipping from draw pile', () => {
    let state = initGame(defaultConfig);
    state = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));

    // Force player 0 to have a stress card as their played card
    const player = state.players[0];
    const modifiedPlayer: PlayerState = {
      ...player,
      hand: [stressCard(), ...player.hand.slice(1)],
    };
    state = { ...state, players: [modifiedPlayer, state.players[1]] };

    state = executePlayCardsPhase(state, [
      { playerIndex: 0, cardIndices: [0] }, // Play the stress card
      { playerIndex: 1, cardIndices: findPlayableIndices(state.players[1].hand, 1) },
    ]);

    const rng = createRng(99);
    const activeIdx = state.turnOrder[0];

    // Process reveal for the first player (whichever is active)
    const result = executeRevealAndMove(state, activeIdx, rng);
    // The stress card should have resolved to some speed value
    expect(result.players[activeIdx].speed).toBeGreaterThanOrEqual(0);
  });

  it('advances to next player in turn order', () => {
    let state = initGame(defaultConfig);
    const rng = createRng(99);
    state = advanceToRevealAndMove(state);

    const firstPlayer = state.turnOrder[0];
    const secondPlayer = state.turnOrder[1];

    const result = executeRevealAndMove(state, firstPlayer, rng);
    expect(result.activePlayerIndex).toBe(secondPlayer);
    expect(result.phase).toBe('reveal-and-move');
  });

  it('transitions to adrenaline after last player', () => {
    let state = initGame(defaultConfig);
    const rng = createRng(99);
    state = advanceToRevealAndMove(state);

    // Process all players
    for (const pi of state.turnOrder) {
      state = executeRevealAndMove(state, pi, rng);
    }
    expect(state.phase).toBe('adrenaline');
  });

  it('throws if wrong player acts', () => {
    let state = initGame(defaultConfig);
    const rng = createRng(99);
    state = advanceToRevealAndMove(state);

    const wrongPlayer = state.turnOrder[1]; // Not the active player
    expect(() => executeRevealAndMove(state, wrongPlayer, rng)).toThrow('not the active player');
  });
});

describe('Phase 4: Adrenaline', () => {
  it('grants +1 speed and +1 cooldown to last-place player', () => {
    let state = initGame(defaultConfig);
    state = advanceToAdrenaline(state);

    // Find positions before adrenaline
    const positions = state.players.map(p => p.position);
    const minPos = Math.min(...positions);
    const lastPlaceIdx = state.players.findIndex(p => p.position === minPos);

    const speedBefore = state.players[lastPlaceIdx].speed;
    const posBefore = state.players[lastPlaceIdx].position;

    const result = executeAdrenaline(state);

    expect(result.players[lastPlaceIdx].speed).toBe(speedBefore + 1);
    expect(result.players[lastPlaceIdx].position).toBe(posBefore + 1);
    expect(result.players[lastPlaceIdx].adrenalineCooldownBonus).toBe(1);
    expect(result.phase).toBe('react');
  });

  it('grants adrenaline to last 2 in 5+ player game', () => {
    const config5p: GameConfig = {
      ...defaultConfig,
      playerIds: ['a', 'b', 'c', 'd', 'e'],
    };
    let state = initGame(config5p);

    // Manually set different positions
    const players = state.players.map((p, i) => ({
      ...p,
      position: (i + 1) * 10,
      speed: (i + 1),
    }));
    state = {
      ...state,
      players,
      phase: 'adrenaline' as const,
      turnOrder: [4, 3, 2, 1, 0],
    };

    const result = executeAdrenaline(state);

    // Players 0 and 1 are last (positions 10 and 20)
    expect(result.players[0].adrenalineCooldownBonus).toBe(1);
    expect(result.players[1].adrenalineCooldownBonus).toBe(1);
    expect(result.players[2].adrenalineCooldownBonus).toBe(0);
  });

  it('transitions to react phase', () => {
    let state = initGame(defaultConfig);
    state = advanceToAdrenaline(state);
    const result = executeAdrenaline(state);
    expect(result.phase).toBe('react');
    expect(result.activePlayerIndex).toBe(result.turnOrder[0]);
  });
});

describe('Phase 5: React — Cooldown', () => {
  it('moves heat cards from hand to engine zone', () => {
    let state = advanceToReact(initGame(defaultConfig));

    // Put heat card in active player's hand
    const activeIdx = state.activePlayerIndex;
    const player = state.players[activeIdx];
    const modifiedPlayer: PlayerState = {
      ...player,
      hand: [heatCard(), ...player.hand],
      engineZone: player.engineZone.slice(0, 5),
    };
    state = {
      ...state,
      players: state.players.map((p, i) => i === activeIdx ? modifiedPlayer : p),
    };

    const heatIdx = 0;
    const engineBefore = state.players[activeIdx].engineZone.length;

    const result = executeCooldown(state, {
      type: 'cooldown',
      playerIndex: activeIdx,
      heatIndices: [heatIdx],
    });

    expect(result.players[activeIdx].engineZone.length).toBe(engineBefore + 1);
    expect(result.players[activeIdx].hand.length).toBe(modifiedPlayer.hand.length - 1);
  });

  it('respects cooldown limit per gear + adrenaline bonus', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const player = state.players[activeIdx];

    // Gear 1 = 3 cooldown, no adrenaline bonus
    const modifiedPlayer: PlayerState = {
      ...player,
      gear: 1 as Gear,
      adrenalineCooldownBonus: 0,
      hand: [heatCard(), heatCard(), heatCard(), heatCard(), ...player.hand],
    };
    state = {
      ...state,
      players: state.players.map((p, i) => i === activeIdx ? modifiedPlayer : p),
    };

    // Trying to cool down 4 in gear 1 (max 3)
    expect(() =>
      executeCooldown(state, {
        type: 'cooldown',
        playerIndex: activeIdx,
        heatIndices: [0, 1, 2, 3],
      }),
    ).toThrow('Cooldown limit is 3');
  });

  it('allows extra cooldown from adrenaline bonus', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const player = state.players[activeIdx];

    // Gear 1 = 3 cooldown + 1 adrenaline = 4
    const modifiedPlayer: PlayerState = {
      ...player,
      gear: 1 as Gear,
      adrenalineCooldownBonus: 1,
      hand: [heatCard(), heatCard(), heatCard(), heatCard(), ...player.hand],
    };
    state = {
      ...state,
      players: state.players.map((p, i) => i === activeIdx ? modifiedPlayer : p),
    };

    // Should not throw — limit is 4 with adrenaline
    expect(() =>
      executeCooldown(state, {
        type: 'cooldown',
        playerIndex: activeIdx,
        heatIndices: [0, 1, 2, 3],
      }),
    ).not.toThrow();
  });

  it('rejects non-heat cards for cooldown', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const player = state.players[activeIdx];

    // First card in hand is likely a speed card
    const nonHeatIdx = player.hand.findIndex(c => c.type !== 'heat');
    if (nonHeatIdx === -1) return;

    expect(() =>
      executeCooldown(state, {
        type: 'cooldown',
        playerIndex: activeIdx,
        heatIndices: [nonHeatIdx],
      }),
    ).toThrow('only cool down Heat');
  });
});

describe('Phase 5: React — Boost', () => {
  it('costs 1 heat from engine zone', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const rng = createRng(99);
    const engineBefore = state.players[activeIdx].engineZone.length;

    const result = executeBoost(state, { type: 'boost', playerIndex: activeIdx }, rng);
    expect(result.players[activeIdx].engineZone).toHaveLength(engineBefore - 1);
  });

  it('increases position and speed', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const rng = createRng(99);
    const posBefore = state.players[activeIdx].position;
    const speedBefore = state.players[activeIdx].speed;

    const result = executeBoost(state, { type: 'boost', playerIndex: activeIdx }, rng);
    expect(result.players[activeIdx].position).toBeGreaterThanOrEqual(posBefore);
    expect(result.players[activeIdx].speed).toBeGreaterThanOrEqual(speedBefore);
  });

  it('marks player as having boosted', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const rng = createRng(99);

    const result = executeBoost(state, { type: 'boost', playerIndex: activeIdx }, rng);
    expect(result.players[activeIdx].hasBoosted).toBe(true);
  });

  it('prevents double boost', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const rng = createRng(99);

    state = executeBoost(state, { type: 'boost', playerIndex: activeIdx }, rng);
    expect(() =>
      executeBoost(state, { type: 'boost', playerIndex: activeIdx }, rng),
    ).toThrow('Already boosted');
  });

  it('fails without heat in engine', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const player = { ...state.players[activeIdx], engineZone: [] };
    state = {
      ...state,
      players: state.players.map((p, i) => i === activeIdx ? player : p),
    };

    const rng = createRng(99);
    expect(() =>
      executeBoost(state, { type: 'boost', playerIndex: activeIdx }, rng),
    ).toThrow('No Heat in engine');
  });

  it('is available in any gear', () => {
    let state = advanceToReact(initGame(defaultConfig), [1, 1]);
    const activeIdx = state.activePlayerIndex;
    const rng = createRng(99);
    expect(() =>
      executeBoost(state, { type: 'boost', playerIndex: activeIdx }, rng),
    ).not.toThrow();
  });
});

describe('Phase 5: React — endReactPhase', () => {
  it('advances to next player in react', () => {
    let state = advanceToReact(initGame(defaultConfig));
    const firstPlayer = state.turnOrder[0];
    const secondPlayer = state.turnOrder[1];

    const result = endReactPhase(state, firstPlayer);
    expect(result.activePlayerIndex).toBe(secondPlayer);
    expect(result.phase).toBe('react');
  });

  it('transitions to slipstream after last player', () => {
    let state = advanceToReact(initGame(defaultConfig));
    for (const pi of state.turnOrder) {
      state = endReactPhase(state, pi);
    }
    expect(state.phase).toBe('slipstream');
  });
});

describe('Phase 6: Slipstream', () => {
  it('moves player +2 when accepting and eligible', () => {
    let state = advanceToSlipstream(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;

    // Place another player 1-2 spaces ahead
    const player = state.players[activeIdx];
    const otherIdx = activeIdx === 0 ? 1 : 0;
    const modifiedOther = { ...state.players[otherIdx], position: player.position + 1 };
    state = {
      ...state,
      players: state.players.map((p, i) => i === otherIdx ? modifiedOther : p),
    };

    const posBefore = state.players[activeIdx].position;
    const result = executeSlipstream(state, {
      type: 'slipstream',
      playerIndex: activeIdx,
      accept: true,
    });
    expect(result.players[activeIdx].position).toBe(posBefore + 2);
  });

  it('does not affect speed when slipstreaming', () => {
    let state = advanceToSlipstream(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const otherIdx = activeIdx === 0 ? 1 : 0;

    const player = state.players[activeIdx];
    const modifiedOther = { ...state.players[otherIdx], position: player.position + 1 };
    state = {
      ...state,
      players: state.players.map((p, i) => i === otherIdx ? modifiedOther : p),
    };

    const speedBefore = state.players[activeIdx].speed;
    const result = executeSlipstream(state, {
      type: 'slipstream',
      playerIndex: activeIdx,
      accept: true,
    });
    expect(result.players[activeIdx].speed).toBe(speedBefore);
  });

  it('throws if accepting but not eligible', () => {
    let state = advanceToSlipstream(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;

    // Move all other players far away
    const otherIdx = activeIdx === 0 ? 1 : 0;
    const modifiedOther = { ...state.players[otherIdx], position: state.players[activeIdx].position + 50 };
    state = {
      ...state,
      players: state.players.map((p, i) => i === otherIdx ? modifiedOther : p),
    };

    expect(() =>
      executeSlipstream(state, {
        type: 'slipstream',
        playerIndex: activeIdx,
        accept: true,
      }),
    ).toThrow('Not eligible');
  });

  it('allows declining slipstream', () => {
    let state = advanceToSlipstream(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const posBefore = state.players[activeIdx].position;

    const result = executeSlipstream(state, {
      type: 'slipstream',
      playerIndex: activeIdx,
      accept: false,
    });
    expect(result.players[activeIdx].position).toBe(posBefore);
  });

  it('transitions to check-corner after last player', () => {
    let state = advanceToSlipstream(initGame(defaultConfig));
    for (const pi of state.turnOrder) {
      state = executeSlipstream(state, { type: 'slipstream', playerIndex: pi, accept: false });
    }
    expect(state.phase).toBe('check-corner');
  });
});

describe('Phase 7: Check Corner', () => {
  it('does nothing with no corners on track', () => {
    let state = advanceToCheckCorner(initGame(defaultConfig));
    const activeIdx = state.activePlayerIndex;
    const posBefore = state.players[activeIdx].position;

    const result = executeCheckCorner(state, activeIdx);
    expect(result.players[activeIdx].position).toBe(posBefore);
  });

  it('pays heat penalty for overspeeding a corner', () => {
    const corners: CornerDef[] = [{ id: 1, speedLimit: 2, position: 3 }];
    const config: GameConfig = { ...defaultConfig, corners, totalSpaces: 50 };
    let state = initGame(config);

    // Manually set up for corner check
    const activeIdx = 0;
    const player: PlayerState = {
      ...state.players[activeIdx],
      previousPosition: 0,
      position: 5,
      speed: 5, // Over the limit of 2
      engineZone: [heatCard(), heatCard(), heatCard(), heatCard(), heatCard(), heatCard()],
    };
    state = {
      ...state,
      players: [player, state.players[1]],
      phase: 'check-corner' as const,
      activePlayerIndex: activeIdx,
      turnOrder: [0, 1],
    };

    const engineBefore = state.players[activeIdx].engineZone.length;
    const result = executeCheckCorner(state, activeIdx);

    // Should pay (5 - 2) = 3 Heat
    expect(result.players[activeIdx].engineZone.length).toBe(engineBefore - 3);
  });

  it('triggers spinout when heat payment insufficient', () => {
    const corners: CornerDef[] = [{ id: 1, speedLimit: 2, position: 3 }];
    const config: GameConfig = { ...defaultConfig, corners, totalSpaces: 50 };
    let state = initGame(config);

    const activeIdx = 0;
    const player: PlayerState = {
      ...state.players[activeIdx],
      previousPosition: 0,
      position: 5,
      speed: 5,
      gear: 3 as Gear,
      engineZone: [heatCard()], // Only 1 Heat, need 3
    };
    state = {
      ...state,
      players: [player, state.players[1]],
      phase: 'check-corner' as const,
      activePlayerIndex: activeIdx,
      turnOrder: [0, 1],
    };

    const result = executeCheckCorner(state, activeIdx);

    // Spinout: position before corner (3-1=2), gear reset to 1
    expect(result.players[activeIdx].position).toBe(2);
    expect(result.players[activeIdx].gear).toBe(1);
    // Should have stress cards in discard (gear 3 = 2 stress)
    const stressInDiscard = result.players[activeIdx].discardPile.filter(c => c.type === 'stress');
    expect(stressInDiscard.length).toBeGreaterThanOrEqual(2);
  });

  it('transitions to discard after all players', () => {
    let state = advanceToCheckCorner(initGame(defaultConfig));
    for (const pi of state.turnOrder) {
      state = executeCheckCorner(state, pi);
    }
    expect(state.phase).toBe('discard');
  });
});

describe('Phase 8: Discard', () => {
  it('allows discarding playable cards from hand', () => {
    let state = advanceToDiscard(initGame(defaultConfig));

    // Find a playable card in player 0's hand
    const playableIdx = state.players[0].hand.findIndex(c =>
      c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'),
    );

    if (playableIdx === -1) return; // Skip if no playable cards

    const handBefore = state.players[0].hand.length;
    const result = executeDiscardPhase(state, [
      { playerIndex: 0, cardIndices: [playableIdx] },
      { playerIndex: 1, cardIndices: [] },
    ]);
    expect(result.players[0].hand.length).toBe(handBefore - 1);
    expect(result.phase).toBe('replenish');
  });

  it('allows empty discard selections', () => {
    let state = advanceToDiscard(initGame(defaultConfig));
    const result = executeDiscardPhase(state, [
      { playerIndex: 0, cardIndices: [] },
      { playerIndex: 1, cardIndices: [] },
    ]);
    expect(result.phase).toBe('replenish');
  });

  it('rejects discarding non-playable cards', () => {
    let state = advanceToDiscard(initGame(defaultConfig));

    // Put a heat card in hand
    const player = state.players[0];
    const modifiedPlayer = { ...player, hand: [heatCard(), ...player.hand] };
    state = { ...state, players: [modifiedPlayer, state.players[1]] };

    expect(() =>
      executeDiscardPhase(state, [
        { playerIndex: 0, cardIndices: [0] },
        { playerIndex: 1, cardIndices: [] },
      ]),
    ).toThrow('can only discard playable cards');
  });
});

describe('Phase 9: Replenish', () => {
  it('replenishes all hands to 7 cards', () => {
    let state = advanceToReplenish(initGame(defaultConfig));
    const rng = createRng(42);
    const result = executeReplenishPhase(state, rng);

    for (const p of result.players) {
      expect(p.hand).toHaveLength(HAND_SIZE);
    }
  });

  it('resets per-round state', () => {
    let state = advanceToReplenish(initGame(defaultConfig));
    const rng = createRng(42);
    const result = executeReplenishPhase(state, rng);

    for (const p of result.players) {
      expect(p.speed).toBe(0);
      expect(p.hasBoosted).toBe(false);
      expect(p.adrenalineCooldownBonus).toBe(0);
      expect(p.playedCards).toEqual([]);
    }
  });

  it('increments round counter', () => {
    let state = advanceToReplenish(initGame(defaultConfig));
    const rng = createRng(42);
    const result = executeReplenishPhase(state, rng);
    expect(result.round).toBe(2);
  });

  it('transitions to gear-shift for next round', () => {
    let state = advanceToReplenish(initGame(defaultConfig));
    const rng = createRng(42);
    const result = executeReplenishPhase(state, rng);
    expect(result.phase).toBe('gear-shift');
  });

  it('detects race finish when lap target reached', () => {
    let state = advanceToReplenish(initGame({ ...defaultConfig, lapTarget: 1, totalSpaces: 10 }));

    // Move player past the finish line
    const player = { ...state.players[0], position: 15 }; // 1.5 laps on a 10-space track
    state = { ...state, players: [player, state.players[1]] };

    const rng = createRng(42);
    const result = executeReplenishPhase(state, rng);
    expect(result.phase).toBe('finished');
    expect(result.raceStatus).toBe('finished');
  });
});

describe('Turn Order', () => {
  it('orders by position descending (leader first)', () => {
    const players = [
      { position: 5 } as PlayerState,
      { position: 10 } as PlayerState,
      { position: 3 } as PlayerState,
    ];
    expect(computeTurnOrder(players)).toEqual([1, 0, 2]);
  });

  it('breaks ties by player index (lower first)', () => {
    const players = [
      { position: 5 } as PlayerState,
      { position: 5 } as PlayerState,
    ];
    expect(computeTurnOrder(players)).toEqual([0, 1]);
  });
});

describe('Cluttered Hand', () => {
  it('detects cluttered hand when too many heat cards', () => {
    const player: PlayerState = {
      id: 'test',
      gear: 2 as Gear, // Need 2 cards
      hand: [heatCard(), heatCard(), heatCard(), heatCard(), heatCard(), heatCard(), speedCard(1)],
      drawPile: [],
      discardPile: [],
      engineZone: [],
      position: 0,
      lapCount: 0,
      speed: 0,
      hasBoosted: false,
      adrenalineCooldownBonus: 0,
      playedCards: [],
      previousPosition: 0,
    };
    // Only 1 playable card but need 2 for gear 2
    expect(isClutteredHand(player)).toBe(true);
  });

  it('returns false when enough playable cards', () => {
    const player: PlayerState = {
      id: 'test',
      gear: 1 as Gear,
      hand: [speedCard(1), heatCard(), heatCard()],
      drawPile: [],
      discardPile: [],
      engineZone: [],
      position: 0,
      lapCount: 0,
      speed: 0,
      hasBoosted: false,
      adrenalineCooldownBonus: 0,
      playedCards: [],
      previousPosition: 0,
    };
    expect(isClutteredHand(player)).toBe(false);
  });

  it('handles cluttered hand in play cards phase', () => {
    let state = initGame(defaultConfig);
    state = executeGearShiftPhase(state, makeGearSelections(state, [2, 1]));

    // Force player 0 into cluttered hand: gear 2 needs 2 cards, give only 1 playable
    const player = state.players[0];
    const cluttered: PlayerState = {
      ...player,
      hand: [heatCard(), heatCard(), heatCard(), heatCard(), heatCard(), heatCard(), speedCard(1)],
    };
    state = { ...state, players: [cluttered, state.players[1]] };

    // Player 0 submits empty (cluttered), player 1 plays normally
    const result = executePlayCardsPhase(state, [
      { playerIndex: 0, cardIndices: [] },
      { playerIndex: 1, cardIndices: findPlayableIndices(state.players[1].hand, 1) },
    ]);

    // Cluttered player: gear reset to 1, no played cards
    expect(result.players[0].gear).toBe(1);
    expect(result.players[0].playedCards).toEqual([]);
    expect(result.phase).toBe('reveal-and-move');
  });
});

describe('Slipstream Eligibility', () => {
  it('eligible when another car is 1 space ahead', () => {
    expect(isSlipstreamEligible(5, [6], 100)).toBe(true);
  });

  it('eligible when another car is 2 spaces ahead', () => {
    expect(isSlipstreamEligible(5, [7], 100)).toBe(true);
  });

  it('not eligible when no car nearby', () => {
    expect(isSlipstreamEligible(5, [10], 100)).toBe(false);
  });

  it('not eligible when car is behind', () => {
    expect(isSlipstreamEligible(5, [3], 100)).toBe(false);
  });

  it('handles wrap-around', () => {
    expect(isSlipstreamEligible(99, [0], 100)).toBe(true); // 0 is 1 ahead of 99
  });
});

describe('Corner Detection', () => {
  const corners: CornerDef[] = [
    { id: 1, speedLimit: 3, position: 10 },
    { id: 2, speedLimit: 2, position: 25 },
  ];

  it('finds corners crossed in a move', () => {
    const crossed = findCornersCrossed(5, 15, corners, 50);
    expect(crossed).toHaveLength(1);
    expect(crossed[0].id).toBe(1);
  });

  it('finds multiple corners crossed', () => {
    const crossed = findCornersCrossed(5, 30, corners, 50);
    expect(crossed).toHaveLength(2);
    expect(crossed[0].id).toBe(1);
    expect(crossed[1].id).toBe(2);
  });

  it('returns empty when no corners crossed', () => {
    const crossed = findCornersCrossed(5, 8, corners, 50);
    expect(crossed).toEqual([]);
  });

  it('returns empty when no movement', () => {
    const crossed = findCornersCrossed(5, 5, corners, 50);
    expect(crossed).toEqual([]);
  });

  it('handles wrap-around', () => {
    const wrapCorners: CornerDef[] = [{ id: 1, speedLimit: 3, position: 0 }];
    const crossed = findCornersCrossed(48, 2, wrapCorners, 50);
    expect(crossed).toHaveLength(1);
  });
});

describe('Full Round Cycle', () => {
  it('completes all 9 phases and starts next round', () => {
    let state = initGame(defaultConfig);
    const rng = createRng(99);

    // Phase 1: Gear Shift
    state = executeGearShiftPhase(state, makeGearSelections(state, [1, 1]));
    expect(state.phase).toBe('play-cards');

    // Phase 2: Play Cards
    state = executePlayCardsPhase(state, makeCardSelections(state));
    expect(state.phase).toBe('reveal-and-move');

    // Phase 3: Reveal & Move (sequential)
    for (const pi of state.turnOrder) {
      state = executeRevealAndMove(state, pi, rng);
    }
    expect(state.phase).toBe('adrenaline');

    // Phase 4: Adrenaline
    state = executeAdrenaline(state);
    expect(state.phase).toBe('react');

    // Phase 5: React (all players end react)
    for (const pi of state.turnOrder) {
      state = endReactPhase(state, pi);
    }
    expect(state.phase).toBe('slipstream');

    // Phase 6: Slipstream (all decline)
    for (const pi of state.turnOrder) {
      state = executeSlipstream(state, { type: 'slipstream', playerIndex: pi, accept: false });
    }
    expect(state.phase).toBe('check-corner');

    // Phase 7: Check Corner
    for (const pi of state.turnOrder) {
      state = executeCheckCorner(state, pi);
    }
    expect(state.phase).toBe('discard');

    // Phase 8: Discard (no discards)
    state = executeDiscardPhase(state, [
      { playerIndex: 0, cardIndices: [] },
      { playerIndex: 1, cardIndices: [] },
    ]);
    expect(state.phase).toBe('replenish');

    // Phase 9: Replenish
    state = executeReplenishPhase(state, rng);
    expect(state.phase).toBe('gear-shift');
    expect(state.round).toBe(2);

    // All players should have 7 cards
    for (const p of state.players) {
      expect(p.hand).toHaveLength(HAND_SIZE);
    }
  });
});

// -- Qualifying Mode --

describe('qualifying mode', () => {
  const qualifyingConfig: GameConfig = {
    playerIds: ['solo'],
    lapTarget: 1,
    stressCount: 3,
    seed: 42,
    totalSpaces: 20,
    corners: [],
    mode: 'qualifying',
  };

  it('allows 1 player in qualifying mode', () => {
    const state = initGame(qualifyingConfig);
    expect(state.players).toHaveLength(1);
    expect(state.mode).toBe('qualifying');
    expect(state.raceStatus).toBe('qualifying');
  });

  it('still rejects 0 players in qualifying mode', () => {
    expect(() =>
      initGame({ ...qualifyingConfig, playerIds: [] }),
    ).toThrow('Need at least 1 players');
  });

  it('still rejects 1 player in race mode', () => {
    expect(() =>
      initGame({ ...qualifyingConfig, mode: 'race' }),
    ).toThrow('Need at least 2 players');
  });

  it('defaults to race mode when mode not specified', () => {
    const state = initGame(defaultConfig);
    expect(state.mode).toBe('race');
    expect(state.raceStatus).toBe('racing');
  });

  it('initializes lapRounds as empty array', () => {
    const state = initGame(qualifyingConfig);
    expect(state.players[0].lapRounds).toEqual([]);
  });

  it('tracks lap completion round in lapRounds', () => {
    // Create a state where the player has traveled enough to complete a lap
    let state = initGame({
      ...qualifyingConfig,
      totalSpaces: 10,
      lapTarget: 2,
    });

    // Manually set the player far enough to complete a lap
    state = {
      ...state,
      players: [{ ...state.players[0], position: 15 }],
      phase: 'replenish' as const,
    };

    const rng = createRng(99);
    state = executeReplenishPhase(state, rng);

    // Player should have completed 1 lap, with round 1 recorded
    expect(state.players[0].lapCount).toBe(1);
    expect(state.players[0].lapRounds).toEqual([1]);
  });

  it('runs a full round with 1 player through engine phases', () => {
    let state = initGame(qualifyingConfig);
    const rng = createRng(99);

    // Phase 1: Gear shift
    state = executeGearShiftPhase(state, [{ playerIndex: 0, targetGear: 1 }]);
    expect(state.phase).toBe('play-cards');

    // Phase 2: Play cards
    const cardIndices = findPlayableIndices(state.players[0].hand, 1);
    state = executePlayCardsPhase(state, [{ playerIndex: 0, cardIndices }]);
    expect(state.phase).toBe('reveal-and-move');

    // Phase 3: Reveal and move
    state = executeRevealAndMove(state, 0, rng);
    // With 1 player, adrenaline phase is next (controller skips it, but engine still sets it)
    expect(state.phase).toBe('adrenaline');

    // Phase 4: Adrenaline (engine still runs it — controller would skip in qualifying)
    state = executeAdrenaline(state);
    expect(state.phase).toBe('react');

    // Phase 5: React
    state = endReactPhase(state, 0);
    // With 1 player, slipstream phase is next (controller skips it)
    expect(state.phase).toBe('slipstream');

    // Phase 6: Slipstream
    state = executeSlipstream(state, { type: 'slipstream', playerIndex: 0, accept: false });
    expect(state.phase).toBe('check-corner');

    // Phase 7: Check corner
    state = executeCheckCorner(state, 0);
    expect(state.phase).toBe('discard');

    // Phase 8: Discard
    state = executeDiscardPhase(state, [{ playerIndex: 0, cardIndices: [] }]);
    expect(state.phase).toBe('replenish');

    // Phase 9: Replenish
    state = executeReplenishPhase(state, rng);
    expect(state.phase).toBe('gear-shift');
    expect(state.round).toBe(2);
    expect(state.raceStatus).toBe('qualifying');
  });
});
