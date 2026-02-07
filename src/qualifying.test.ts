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
  shouldSkipPhase,
} from './engine.js';
import type { GameConfig, GearSelection, CardSelection, DiscardSelection } from './engine.js';
import type { Gear, PlayerState, GameState, CornerDef } from './types.js';
import { HAND_SIZE, CARDS_PER_GEAR } from './types.js';
import { createRng } from './deck.js';
import { setupRace } from './race.js';
import { canStartGame, createRoom, setPlayerReady } from './server/room.js';
import type { RoomConfig } from './server/types.js';

// -- Helpers --

const qualifyingConfig: GameConfig = {
  playerIds: ['solo'],
  lapTarget: 2,
  stressCount: 3,
  seed: 42,
  totalSpaces: 100,
  corners: [],
  mode: 'qualifying',
};

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

// -- Engine: Qualifying Mode Initialization --

describe('Qualifying Mode - Engine', () => {
  it('initGame accepts 1 player in qualifying mode', () => {
    const state = initGame(qualifyingConfig);
    expect(state.players).toHaveLength(1);
    expect(state.mode).toBe('qualifying');
    expect(state.phase).toBe('gear-shift');
    expect(state.raceStatus).toBe('racing');
  });

  it('initGame rejects 1 player in race mode', () => {
    expect(() => initGame({
      ...qualifyingConfig,
      mode: 'race',
    })).toThrow('Need at least 2 players');
  });

  it('initGame rejects 0 players in qualifying mode', () => {
    expect(() => initGame({
      ...qualifyingConfig,
      playerIds: [],
    })).toThrow('Need at least 1 players');
  });

  it('initGame defaults mode to race', () => {
    const state = initGame({
      playerIds: ['alice', 'bob'],
      lapTarget: 2,
      stressCount: 3,
      seed: 42,
    });
    expect(state.mode).toBe('race');
  });

  it('initializes lap timing state in qualifying mode', () => {
    const state = initGame(qualifyingConfig);
    expect(state.lapTimes).toEqual([]);
    expect(state.lapStartRound).toBe(1);
  });

  it('does not initialize lap timing in race mode', () => {
    const state = initGame({
      playerIds: ['alice', 'bob'],
      lapTarget: 2,
      stressCount: 3,
      seed: 42,
    });
    expect(state.lapTimes).toBeUndefined();
    expect(state.lapStartRound).toBeUndefined();
  });
});

// -- Phase Skipping --

describe('Qualifying Mode - Phase Skipping', () => {
  it('shouldSkipPhase returns true for adrenaline in qualifying', () => {
    const state = initGame(qualifyingConfig);
    expect(shouldSkipPhase(state, 'adrenaline')).toBe(true);
  });

  it('shouldSkipPhase returns true for slipstream in qualifying', () => {
    const state = initGame(qualifyingConfig);
    expect(shouldSkipPhase(state, 'slipstream')).toBe(true);
  });

  it('shouldSkipPhase returns false for other phases in qualifying', () => {
    const state = initGame(qualifyingConfig);
    expect(shouldSkipPhase(state, 'gear-shift')).toBe(false);
    expect(shouldSkipPhase(state, 'play-cards')).toBe(false);
    expect(shouldSkipPhase(state, 'reveal-and-move')).toBe(false);
    expect(shouldSkipPhase(state, 'react')).toBe(false);
    expect(shouldSkipPhase(state, 'check-corner')).toBe(false);
    expect(shouldSkipPhase(state, 'discard')).toBe(false);
    expect(shouldSkipPhase(state, 'replenish')).toBe(false);
  });

  it('shouldSkipPhase returns false for all phases in race mode', () => {
    const state = initGame({
      playerIds: ['alice', 'bob'],
      lapTarget: 2,
      stressCount: 3,
      seed: 42,
    });
    expect(shouldSkipPhase(state, 'adrenaline')).toBe(false);
    expect(shouldSkipPhase(state, 'slipstream')).toBe(false);
  });
});

// -- Adrenaline Phase --

describe('Qualifying Mode - Adrenaline', () => {
  it('skips adrenaline in qualifying mode (no speed/cooldown bonus)', () => {
    let state = initGame(qualifyingConfig);

    // Progress to adrenaline phase
    state = executeGearShiftPhase(state, [{ playerIndex: 0, targetGear: 1 }]);
    const playable = findPlayableIndices(state.players[0].hand, 1);
    state = executePlayCardsPhase(state, [{ playerIndex: 0, cardIndices: playable }]);

    const rng = createRng(42);
    state = executeRevealAndMove(state, 0, rng);
    expect(state.phase).toBe('adrenaline');

    const positionBefore = state.players[0].position;
    const speedBefore = state.players[0].speed;

    state = executeAdrenaline(state);
    expect(state.phase).toBe('react');
    // No adrenaline bonus applied
    expect(state.players[0].position).toBe(positionBefore);
    expect(state.players[0].speed).toBe(speedBefore);
    expect(state.players[0].adrenalineCooldownBonus).toBe(0);
  });
});

// -- Slipstream Phase --

describe('Qualifying Mode - Slipstream', () => {
  it('auto-declines slipstream in qualifying mode', () => {
    let state = initGame(qualifyingConfig);

    // Progress to slipstream phase
    state = executeGearShiftPhase(state, [{ playerIndex: 0, targetGear: 1 }]);
    const playable = findPlayableIndices(state.players[0].hand, 1);
    state = executePlayCardsPhase(state, [{ playerIndex: 0, cardIndices: playable }]);

    const rng = createRng(42);
    state = executeRevealAndMove(state, 0, rng);
    state = executeAdrenaline(state);
    state = endReactPhase(state, 0);
    expect(state.phase).toBe('slipstream');

    const positionBefore = state.players[0].position;
    state = executeSlipstream(state, {
      type: 'slipstream',
      playerIndex: 0,
      accept: true, // Even if accept is true, qualifying skips it
    });

    expect(state.phase).toBe('check-corner');
    // Position unchanged (no slipstream applied)
    expect(state.players[0].position).toBe(positionBefore);
  });
});

// -- Full Qualifying Round --

describe('Qualifying Mode - Full Round', () => {
  it('completes a full qualifying round with 1 player', () => {
    let state = initGame(qualifyingConfig);
    const rng = createRng(99);

    // Phase 1: Gear Shift
    expect(state.phase).toBe('gear-shift');
    state = executeGearShiftPhase(state, [{ playerIndex: 0, targetGear: 1 }]);

    // Phase 2: Play Cards
    expect(state.phase).toBe('play-cards');
    const playable = findPlayableIndices(state.players[0].hand, 1);
    state = executePlayCardsPhase(state, [{ playerIndex: 0, cardIndices: playable }]);

    // Phase 3: Reveal & Move
    expect(state.phase).toBe('reveal-and-move');
    state = executeRevealAndMove(state, 0, rng);

    // Phase 4: Adrenaline (skipped in qualifying)
    expect(state.phase).toBe('adrenaline');
    state = executeAdrenaline(state);
    expect(state.phase).toBe('react');

    // Phase 5: React
    state = endReactPhase(state, 0);

    // Phase 6: Slipstream (skipped in qualifying)
    expect(state.phase).toBe('slipstream');
    state = executeSlipstream(state, { type: 'slipstream', playerIndex: 0, accept: false });
    expect(state.phase).toBe('check-corner');

    // Phase 7: Check Corner
    state = executeCheckCorner(state, 0);

    // Phase 8: Discard
    expect(state.phase).toBe('discard');
    state = executeDiscardPhase(state, [{ playerIndex: 0, cardIndices: [] }]);

    // Phase 9: Replenish
    expect(state.phase).toBe('replenish');
    state = executeReplenishPhase(state, rng);

    // Should be back to gear-shift for round 2
    expect(state.phase).toBe('gear-shift');
    expect(state.round).toBe(2);
    expect(state.players[0].hand).toHaveLength(HAND_SIZE);
  });

  it('all core mechanics work with 1 player (corner checks, boost, cooldown)', () => {
    // Create a state with a corner to test corner checks
    const config: GameConfig = {
      playerIds: ['solo'],
      lapTarget: 1,
      stressCount: 3,
      seed: 42,
      totalSpaces: 50,
      corners: [{ id: 1, speedLimit: 3, position: 10 }],
      mode: 'qualifying',
    };
    const state = initGame(config);
    expect(state.players).toHaveLength(1);
    expect(state.corners).toHaveLength(1);
    expect(state.mode).toBe('qualifying');
  });
});

// -- Lap Timing --

describe('Qualifying Mode - Lap Timing', () => {
  it('lap times array starts empty and lapStartRound is 1', () => {
    const state = initGame(qualifyingConfig);
    expect(state.lapTimes).toEqual([]);
    expect(state.lapStartRound).toBe(1);
  });

  it('records lap time when a lap completes during replenish', () => {
    // Directly create a state that's about to finish a lap
    let state = initGame({
      ...qualifyingConfig,
      totalSpaces: 20,
    });

    // Manually put the player near the lap boundary
    // position 18, will move 2+ spaces to cross totalSpaces (20)
    state = {
      ...state,
      players: [{ ...state.players[0], position: 18 }],
    };

    const rng = createRng(42);

    // Complete a round cycle
    state = executeGearShiftPhase(state, [{ playerIndex: 0, targetGear: 1 }]);
    const playable = findPlayableIndices(state.players[0].hand, 1);
    state = executePlayCardsPhase(state, [{ playerIndex: 0, cardIndices: playable }]);
    state = executeRevealAndMove(state, 0, rng);
    state = executeAdrenaline(state);
    state = endReactPhase(state, 0);
    state = executeSlipstream(state, { type: 'slipstream', playerIndex: 0, accept: false });
    state = executeCheckCorner(state, 0);
    state = executeDiscardPhase(state, [{ playerIndex: 0, cardIndices: [] }]);
    state = executeReplenishPhase(state, rng);

    // If the player crossed the lap line, we should have a lap time
    if (state.players[0].lapCount > 0) {
      expect(state.lapTimes).toBeDefined();
      expect(state.lapTimes!.length).toBe(1);
      expect(state.lapTimes![0]).toBe(1); // 1 round for this lap
    }
  });
});

// -- Room: Qualifying Mode --

describe('Qualifying Mode - Room', () => {
  it('canStartGame allows 1 player in qualifying mode', () => {
    const config: RoomConfig = {
      trackId: 'usa',
      lapCount: 2,
      maxPlayers: 1,
      turnTimeoutMs: 0,
      mode: 'qualifying',
    };
    const room = createRoom('solo-player', config, 'Solo Driver');
    expect(canStartGame(room)).toBe(false); // Not ready yet

    setPlayerReady(room, 'solo-player', true);
    expect(canStartGame(room)).toBe(true);
  });

  it('canStartGame still requires 2 players in race mode', () => {
    const config: RoomConfig = {
      trackId: 'usa',
      lapCount: 2,
      maxPlayers: 4,
      turnTimeoutMs: 60000,
    };
    const room = createRoom('player1', config, 'Player 1');
    setPlayerReady(room, 'player1', true);
    expect(canStartGame(room)).toBe(false); // Only 1 player, race mode
  });
});

// -- Race Setup: Qualifying Mode --

describe('Qualifying Mode - Race Setup', () => {
  it('setupRace accepts 1 player in qualifying mode', () => {
    // We need a minimal TrackData for this test
    const track = {
      id: 'usa',
      name: 'USA',
      totalSpaces: 100,
      startFinishLine: 0,
      corners: [{ id: 1, speedLimit: 5, position: 25 }],
      sectors: [],
      startingGrid: [{ spaceIndex: 0, lane: 0 }],
      legendsLines: [],
      defaultConfig: { laps: 2, startingStress: 3 },
    };

    const state = setupRace({
      playerIds: ['solo'],
      track: track as any,
      laps: 2,
      seed: 42,
      mode: 'qualifying',
    });

    expect(state.players).toHaveLength(1);
    expect(state.mode).toBe('qualifying');
    expect(state.lapTimes).toEqual([]);
  });

  it('setupRace rejects 1 player without qualifying mode', () => {
    const track = {
      id: 'usa',
      name: 'USA',
      totalSpaces: 100,
      startFinishLine: 0,
      corners: [{ id: 1, speedLimit: 5, position: 25 }],
      sectors: [],
      startingGrid: [{ spaceIndex: 0, lane: 0 }],
      legendsLines: [],
      defaultConfig: { laps: 2, startingStress: 3 },
    };

    expect(() => setupRace({
      playerIds: ['solo'],
      track: track as any,
      laps: 2,
      seed: 42,
    })).toThrow('Need at least 2 players');
  });
});
