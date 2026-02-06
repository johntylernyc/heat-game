import { describe, it, expect } from 'vitest';
import {
  setupRace,
  assignStartingGrid,
  computeFinalStandings,
  serializeRaceState,
  deserializeRaceState,
  type RaceSetupConfig,
  type GridOrder,
} from './race.js';
import { usaTrack } from './track/tracks/usa.js';
import { italyTrack } from './track/tracks/italy.js';
import type { GameState, PlayerState, Gear } from './types.js';
import { HAND_SIZE, STARTING_HEAT_IN_ENGINE } from './types.js';

// -- Test helpers --

function makePlayerIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `player-${i + 1}`);
}

// -- setupRace --

describe('setupRace', () => {
  it('creates initial state with correct player count', () => {
    const state = setupRace({
      playerIds: makePlayerIds(3),
      track: usaTrack,
      seed: 42,
    });

    expect(state.players).toHaveLength(3);
    expect(state.raceStatus).toBe('racing');
    expect(state.phase).toBe('gear-shift');
    expect(state.round).toBe(1);
  });

  it('uses track default lap count when not specified', () => {
    const state = setupRace({
      playerIds: makePlayerIds(2),
      track: usaTrack,
      seed: 42,
    });

    expect(state.lapTarget).toBe(usaTrack.defaultConfig.laps);
  });

  it('allows overriding lap count', () => {
    const state = setupRace({
      playerIds: makePlayerIds(2),
      track: usaTrack,
      laps: 3,
      seed: 42,
    });

    expect(state.lapTarget).toBe(3);
  });

  it('uses track default stress count', () => {
    const state = setupRace({
      playerIds: makePlayerIds(2),
      track: usaTrack,
      seed: 42,
    });

    // Each player's deck should contain the default stress count
    for (const player of state.players) {
      const totalCards = [
        ...player.hand,
        ...player.drawPile,
        ...player.discardPile,
      ];
      const stressCards = totalCards.filter(c => c.type === 'stress');
      expect(stressCards).toHaveLength(usaTrack.defaultConfig.startingStress);
    }
  });

  it('places players at track grid positions', () => {
    const state = setupRace({
      playerIds: makePlayerIds(4),
      track: usaTrack,
      seed: 42,
    });

    // All players should be at valid grid positions from the track
    const gridSpaces = usaTrack.startingGrid.map(g => g.spaceIndex);
    for (const player of state.players) {
      expect(gridSpaces).toContain(player.position);
    }
  });

  it('sets up correct track metadata in state', () => {
    const state = setupRace({
      playerIds: makePlayerIds(2),
      track: usaTrack,
      seed: 42,
    });

    expect(state.totalSpaces).toBe(usaTrack.totalSpaces);
    expect(state.startFinishLine).toBe(usaTrack.startFinishLine);
    expect(state.trackId).toBe(usaTrack.id);
    expect(state.corners).toHaveLength(usaTrack.corners.length);
  });

  it('initializes player decks correctly', () => {
    const state = setupRace({
      playerIds: makePlayerIds(3),
      track: usaTrack,
      seed: 42,
    });

    for (const player of state.players) {
      // Starting hand of 7 cards
      expect(player.hand).toHaveLength(HAND_SIZE);

      // Engine zone has 6 Heat cards
      expect(player.engineZone).toHaveLength(STARTING_HEAT_IN_ENGINE);
      expect(player.engineZone.every(c => c.type === 'heat')).toBe(true);

      // Gear starts at 1st
      expect(player.gear).toBe(1);

      // No cards played yet
      expect(player.playedCards).toHaveLength(0);
      expect(player.discardPile).toHaveLength(0);
    }
  });

  it('throws for fewer than 2 players', () => {
    expect(() =>
      setupRace({
        playerIds: ['solo'],
        track: usaTrack,
        seed: 42,
      }),
    ).toThrow('Need at least 2 players');
  });

  it('throws for more players than grid positions', () => {
    // USA track has 6 grid positions
    expect(() =>
      setupRace({
        playerIds: makePlayerIds(7),
        track: usaTrack,
        seed: 42,
      }),
    ).toThrow(/supports up to 6 players/);
  });

  it('throws for invalid lap count', () => {
    expect(() =>
      setupRace({
        playerIds: makePlayerIds(2),
        track: usaTrack,
        laps: 0,
        seed: 42,
      }),
    ).toThrow('Lap count must be 1-3');

    expect(() =>
      setupRace({
        playerIds: makePlayerIds(2),
        track: usaTrack,
        laps: 4,
        seed: 42,
      }),
    ).toThrow('Lap count must be 1-3');
  });

  it('uses random grid order by default', () => {
    // Two different seeds should produce different grid orders (with high probability)
    const state1 = setupRace({
      playerIds: makePlayerIds(4),
      track: usaTrack,
      seed: 1,
    });

    const state2 = setupRace({
      playerIds: makePlayerIds(4),
      track: usaTrack,
      seed: 999,
    });

    const ids1 = state1.players.map(p => p.id);
    const ids2 = state2.players.map(p => p.id);

    // Different seeds should produce different player orderings
    // (extremely unlikely to be the same)
    expect(ids1).not.toEqual(ids2);
  });

  it('supports championship grid order (reverse standings)', () => {
    const playerIds = ['alice', 'bob', 'carol', 'dave'];
    // Championship standings: alice 1st, bob 2nd, carol 3rd, dave 4th
    // Grid order should be reversed: dave pole, carol 2nd, bob 3rd, alice 4th
    const state = setupRace({
      playerIds,
      track: usaTrack,
      seed: 42,
      gridOrder: {
        type: 'championship',
        standings: ['alice', 'bob', 'carol', 'dave'],
      },
    });

    expect(state.players[0].id).toBe('dave');  // pole
    expect(state.players[1].id).toBe('carol');
    expect(state.players[2].id).toBe('bob');
    expect(state.players[3].id).toBe('alice'); // back
  });

  it('deterministic with same seed', () => {
    const config: RaceSetupConfig = {
      playerIds: makePlayerIds(4),
      track: usaTrack,
      seed: 42,
    };

    const state1 = setupRace(config);
    const state2 = setupRace(config);

    // Player order should be the same
    expect(state1.players.map(p => p.id)).toEqual(state2.players.map(p => p.id));
    // Positions should be the same
    expect(state1.players.map(p => p.position)).toEqual(state2.players.map(p => p.position));
  });

  it('works with different tracks', () => {
    const state = setupRace({
      playerIds: makePlayerIds(3),
      track: italyTrack,
      seed: 42,
    });

    expect(state.totalSpaces).toBe(italyTrack.totalSpaces);
    expect(state.trackId).toBe('italy');
    expect(state.corners).toHaveLength(italyTrack.corners.length);
  });
});

// -- assignStartingGrid --

describe('assignStartingGrid', () => {
  const playerIds = ['alice', 'bob', 'carol', 'dave'];

  it('shuffles for random grid order', () => {
    const order = assignStartingGrid(playerIds, { type: 'random' }, 42);

    // Should contain all player IDs
    expect([...order].sort()).toEqual([...playerIds].sort());

    // With seed 42 and 4 players, the shuffle should produce a different
    // order than the original (verifying it actually shuffled)
    // We just verify all IDs are present — the determinism test below
    // ensures different seeds can produce different results
  });

  it('is deterministic with same seed', () => {
    const order1 = assignStartingGrid(playerIds, { type: 'random' }, 42);
    const order2 = assignStartingGrid(playerIds, { type: 'random' }, 42);
    expect(order1).toEqual(order2);
  });

  it('reverses championship standings', () => {
    const standings = ['alice', 'bob', 'carol', 'dave'];
    const order = assignStartingGrid(
      playerIds,
      { type: 'championship', standings },
      42,
    );

    expect(order).toEqual(['dave', 'carol', 'bob', 'alice']);
  });

  it('handles partial championship standings', () => {
    // Only 3 of 4 players have standings
    const standings = ['alice', 'bob', 'carol'];
    const order = assignStartingGrid(
      playerIds,
      { type: 'championship', standings },
      42,
    );

    // carol, bob, alice (reversed standings) + dave (no standings, appended)
    expect(order).toEqual(['carol', 'bob', 'alice', 'dave']);
  });
});

// -- computeFinalStandings --

describe('computeFinalStandings', () => {
  function makeFinishedState(
    playerData: Array<{ id: string; position: number; lapCount: number }>,
  ): GameState {
    return {
      players: playerData.map((p) => ({
        id: p.id,
        gear: 1 as Gear,
        hand: [],
        drawPile: [],
        discardPile: [],
        engineZone: [],
        position: p.position,
        lapCount: p.lapCount,
        speed: 0,
        hasBoosted: false,
        adrenalineCooldownBonus: 0,
        playedCards: [],
        previousPosition: 0,
      })),
      round: 5,
      phase: 'finished',
      activePlayerIndex: 0,
      turnOrder: [0, 1, 2],
      lapTarget: 2,
      raceStatus: 'finished',
      corners: [],
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'usa',
    };
  }

  it('ranks by laps completed (descending)', () => {
    const state = makeFinishedState([
      { id: 'alice', position: 30, lapCount: 1 },
      { id: 'bob', position: 100, lapCount: 2 },
      { id: 'carol', position: 50, lapCount: 2 },
    ]);

    const standings = computeFinalStandings(state);

    expect(standings[0].playerId).toBe('bob');    // 2 laps, pos 100
    expect(standings[1].playerId).toBe('carol');  // 2 laps, pos 50
    expect(standings[2].playerId).toBe('alice');  // 1 lap
  });

  it('uses track position as tiebreaker within same lap count', () => {
    const state = makeFinishedState([
      { id: 'alice', position: 105, lapCount: 2 },
      { id: 'bob', position: 110, lapCount: 2 },
      { id: 'carol', position: 98, lapCount: 2 },
    ]);

    const standings = computeFinalStandings(state);

    expect(standings[0].playerId).toBe('bob');    // pos 110
    expect(standings[1].playerId).toBe('alice');  // pos 105
    expect(standings[2].playerId).toBe('carol');  // pos 98
  });

  it('uses player index as final tiebreaker', () => {
    const state = makeFinishedState([
      { id: 'alice', position: 100, lapCount: 2 },
      { id: 'bob', position: 100, lapCount: 2 },
    ]);

    const standings = computeFinalStandings(state);

    // Same laps and position, lower index wins
    expect(standings[0].playerId).toBe('alice');
    expect(standings[1].playerId).toBe('bob');
  });

  it('assigns correct position numbers (1-based)', () => {
    const state = makeFinishedState([
      { id: 'alice', position: 100, lapCount: 2 },
      { id: 'bob', position: 90, lapCount: 2 },
      { id: 'carol', position: 80, lapCount: 1 },
    ]);

    const standings = computeFinalStandings(state);

    expect(standings[0].position).toBe(1);
    expect(standings[1].position).toBe(2);
    expect(standings[2].position).toBe(3);
  });

  it('includes laps and track position in results', () => {
    const state = makeFinishedState([
      { id: 'alice', position: 105, lapCount: 2 },
    ]);

    const standings = computeFinalStandings(state);

    expect(standings[0]).toEqual({
      position: 1,
      playerId: 'alice',
      lapsCompleted: 2,
      trackPosition: 105,
    });
  });

  it('throws if race is not finished', () => {
    const state = makeFinishedState([
      { id: 'alice', position: 50, lapCount: 1 },
    ]);
    state.raceStatus = 'racing';

    expect(() => computeFinalStandings(state)).toThrow('Race is not finished');
  });
});

// -- Serialization --

describe('serializeRaceState / deserializeRaceState', () => {
  it('round-trips a race state', () => {
    const state = setupRace({
      playerIds: makePlayerIds(3),
      track: usaTrack,
      seed: 42,
    });

    const json = serializeRaceState(state);
    const restored = deserializeRaceState(json);

    expect(restored).toEqual(state);
  });

  it('produces valid JSON', () => {
    const state = setupRace({
      playerIds: makePlayerIds(2),
      track: usaTrack,
      seed: 42,
    });

    const json = serializeRaceState(state);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('throws for invalid JSON', () => {
    expect(() => deserializeRaceState('not-json')).toThrow();
  });

  it('throws for missing players', () => {
    expect(() => deserializeRaceState('{"round": 1, "phase": "gear-shift"}')).toThrow(
      'missing players',
    );
  });

  it('throws for missing round', () => {
    expect(() => deserializeRaceState('{"players": [], "phase": "gear-shift"}')).toThrow(
      'missing round',
    );
  });

  it('throws for missing phase', () => {
    expect(() => deserializeRaceState('{"players": [], "round": 1}')).toThrow(
      'missing phase',
    );
  });
});

// -- Integration: full race setup with grid positions --

describe('race setup integration', () => {
  it('players start at distinct grid positions', () => {
    const state = setupRace({
      playerIds: makePlayerIds(4),
      track: usaTrack,
      seed: 42,
    });

    const positions = state.players.map(p => p.position);
    // Players should start at grid positions from the track data
    // USA track grid: positions 47, 47, 46, 46 (paired)
    for (const pos of positions) {
      const isGridPos = usaTrack.startingGrid.some(g => g.spaceIndex === pos);
      expect(isGridPos).toBe(true);
    }
  });

  it('previousPosition matches starting position', () => {
    const state = setupRace({
      playerIds: makePlayerIds(3),
      track: usaTrack,
      seed: 42,
    });

    for (const player of state.players) {
      expect(player.previousPosition).toBe(player.position);
    }
  });

  it('corners from track are in state', () => {
    const state = setupRace({
      playerIds: makePlayerIds(2),
      track: usaTrack,
      seed: 42,
    });

    expect(state.corners).toEqual(
      usaTrack.corners.map(c => ({
        id: c.id,
        speedLimit: c.speedLimit,
        position: c.position,
      })),
    );
  });
});
