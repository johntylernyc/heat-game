/**
 * Race Lifecycle Management
 *
 * Higher-level functions for managing a complete race from setup through
 * final standings:
 *   1. setupRace() — configure track, grid, decks, and initialize state
 *   2. computeFinalStandings() — rank players after race ends
 *   3. assignStartingGrid() — determine grid order (random or championship)
 */

import type { TrackData } from './track/types.js';
import type { GameState, CornerDef } from './types.js';
import { createRng, shuffle } from './deck.js';
import { type GameConfig, initGame } from './engine.js';

// -- Race Setup Configuration --

export interface RaceSetupConfig {
  /** Player IDs in arbitrary order. */
  playerIds: string[];
  /** Track to race on. */
  track: TrackData;
  /** Number of laps (1-3). Uses track default if omitted. */
  laps?: number;
  /** Override stress card count per player. Uses track default if omitted. */
  stressCount?: number;
  /** RNG seed for deterministic shuffling and grid randomization. */
  seed: number;
  /** Starting grid order. If omitted, random order is used. */
  gridOrder?: GridOrder;
}

export type GridOrder =
  | { type: 'random' }
  | { type: 'championship'; standings: string[] };

// -- Final Standings --

export interface RaceStanding {
  /** Final position (1 = winner, 2 = second, etc.) */
  position: number;
  /** Player ID */
  playerId: string;
  /** Laps completed */
  lapsCompleted: number;
  /** Final track position (absolute, higher = further ahead) */
  trackPosition: number;
}

/**
 * Set up a race: select track, assign grid, build decks, and create
 * the initial GameState ready for the first round.
 *
 * This is the primary entry point for starting a new race.
 */
export function setupRace(config: RaceSetupConfig): GameState {
  const { playerIds, track, seed } = config;
  const laps = config.laps ?? track.defaultConfig.laps;
  const stressCount = config.stressCount ?? track.defaultConfig.startingStress;

  if (playerIds.length < 2) {
    throw new Error('Need at least 2 players');
  }

  if (playerIds.length > track.startingGrid.length) {
    throw new Error(
      `Track "${track.name}" supports up to ${track.startingGrid.length} players, got ${playerIds.length}`,
    );
  }

  if (laps < 1 || laps > 3) {
    throw new Error(`Lap count must be 1-3, got ${laps}`);
  }

  // Determine grid order
  const gridOrder = config.gridOrder ?? { type: 'random' as const };
  const orderedPlayerIds = assignStartingGrid(playerIds, gridOrder, seed);

  // Map grid positions to starting space indices
  const startingPositions = orderedPlayerIds.map((_, i) => {
    const gridPos = track.startingGrid[i];
    return gridPos.spaceIndex;
  });

  // Convert track corners to CornerDef format
  const corners: CornerDef[] = track.corners.map(c => ({
    id: c.id,
    speedLimit: c.speedLimit,
    position: c.position,
  }));

  const gameConfig: GameConfig = {
    playerIds: orderedPlayerIds,
    lapTarget: laps,
    stressCount,
    seed,
    corners,
    totalSpaces: track.totalSpaces,
    startFinishLine: track.startFinishLine,
    trackId: track.id,
    startingPositions,
  };

  return initGame(gameConfig);
}

/**
 * Determine starting grid order from player IDs.
 *
 * - 'random': shuffle player order using the seed
 * - 'championship': reverse of championship standings (last place starts first/pole)
 *
 * Returns player IDs in grid order (index 0 = pole position).
 */
export function assignStartingGrid(
  playerIds: string[],
  gridOrder: GridOrder,
  seed: number,
): string[] {
  switch (gridOrder.type) {
    case 'random': {
      const rng = createRng(seed);
      return shuffle([...playerIds], rng);
    }
    case 'championship': {
      // Reverse standings: last place in standings gets pole position
      const { standings } = gridOrder;
      const reversed = [...standings].reverse();
      // Include only players in this race, maintaining reversed order
      const inRace = new Set(playerIds);
      const ordered = reversed.filter(id => inRace.has(id));
      // Any players not in standings get appended at the end
      const remaining = playerIds.filter(id => !standings.includes(id));
      return [...ordered, ...remaining];
    }
  }
}

/**
 * Compute final standings after a race has finished.
 *
 * Ranking criteria (in order):
 *   1. Laps completed (more = better)
 *   2. Track position (higher absolute position = further ahead)
 *   3. Player index in original turn order (lower = ahead, race-line tiebreak placeholder)
 *
 * Throws if the race is not in 'finished' state.
 */
export function computeFinalStandings(state: GameState): RaceStanding[] {
  if (state.raceStatus !== 'finished') {
    throw new Error(`Race is not finished (status: ${state.raceStatus})`);
  }

  const ranked = state.players
    .map((p, i) => ({
      playerId: p.id,
      lapsCompleted: p.lapCount,
      trackPosition: p.position,
      originalIndex: i,
    }))
    .sort((a, b) => {
      // More laps = better
      if (b.lapsCompleted !== a.lapsCompleted) return b.lapsCompleted - a.lapsCompleted;
      // Further ahead on track = better
      if (b.trackPosition !== a.trackPosition) return b.trackPosition - a.trackPosition;
      // Tiebreaker: lower original index (race-line placeholder)
      return a.originalIndex - b.originalIndex;
    });

  return ranked.map((entry, i) => ({
    position: i + 1,
    playerId: entry.playerId,
    lapsCompleted: entry.lapsCompleted,
    trackPosition: entry.trackPosition,
  }));
}

/**
 * Check if a GameState can be serialized and deserialized for recovery.
 * Returns a deep copy of the state (validates serializability).
 */
export function serializeRaceState(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Restore a GameState from a serialized string.
 */
export function deserializeRaceState(json: string): GameState {
  const state = JSON.parse(json) as GameState;
  // Validate essential fields are present
  if (!state.players || !Array.isArray(state.players)) {
    throw new Error('Invalid race state: missing players');
  }
  if (typeof state.round !== 'number') {
    throw new Error('Invalid race state: missing round');
  }
  if (!state.phase) {
    throw new Error('Invalid race state: missing phase');
  }
  return state;
}
