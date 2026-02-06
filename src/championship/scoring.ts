/**
 * Championship scoring — point calculation and standings computation.
 *
 * Scoring formula (championship doubled):
 *   Last place: 2 points, each higher position +2
 *   6 players: 1st=12, 2nd=10, 3rd=8, 4th=6, 5th=4, 6th=2
 *   4 players: 1st=8, 2nd=6, 3rd=4, 4th=2
 */

import type { RaceStanding } from '../race.js';
import type {
  ChampionshipPlayerState,
  ChampionshipStanding,
  RaceResult,
  EventCard,
} from './types.js';

/**
 * Calculate championship points for a finishing position.
 *
 * @param position - Finishing position (1-based: 1 = winner)
 * @param playerCount - Total number of players in the race
 * @returns Points awarded
 */
export function calculatePoints(position: number, playerCount: number): number {
  if (position < 1 || position > playerCount) {
    throw new Error(`Invalid position ${position} for ${playerCount} players`);
  }
  // Last place = 2, each higher position +2
  // position 1 = playerCount * 2, position 2 = (playerCount - 1) * 2, ...
  return (playerCount - position + 1) * 2;
}

/**
 * Apply event card modifier to base points.
 * Currently supports 'double-points' and 'bonus-points-leader'.
 */
export function applyEventPointModifier(
  basePoints: number,
  position: number,
  eventCard: EventCard | null,
): number {
  if (!eventCard) return basePoints;

  switch (eventCard.effect.type) {
    case 'double-points':
      return basePoints * 2;
    case 'bonus-points-leader':
      return position === 1 ? basePoints + eventCard.effect.amount : basePoints;
    default:
      return basePoints;
  }
}

/**
 * Score a completed race and produce RaceResult entries for each player.
 *
 * @param raceStandings - Final standings from computeFinalStandings()
 * @param raceIndex - Index of this race in the championship (0-based)
 * @param trackId - Track ID for this race
 * @param eventCard - Active event card (may modify points)
 * @returns RaceResult per player
 */
export function scoreRace(
  raceStandings: RaceStanding[],
  raceIndex: number,
  trackId: string,
  eventCard: EventCard | null,
): RaceResult[] {
  const playerCount = raceStandings.length;
  return raceStandings.map(standing => {
    const basePoints = calculatePoints(standing.position, playerCount);
    const points = applyEventPointModifier(basePoints, standing.position, eventCard);
    return {
      raceIndex,
      trackId,
      position: standing.position,
      points,
    };
  });
}

/**
 * Compute championship standings from player states.
 *
 * Ranking criteria:
 *   1. Total points (descending)
 *   2. Best single-race finish (lower position = better)
 *   3. Original player order (stable sort)
 *
 * @returns Ordered standings with rank, player ID, total points, and per-race breakdown
 */
export function computeChampionshipStandings(
  players: ChampionshipPlayerState[],
): ChampionshipStanding[] {
  const sorted = [...players].sort((a, b) => {
    // More points = better
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    // Best single race finish (lower position = better)
    const bestA = Math.min(...a.raceResults.map(r => r.position), Infinity);
    const bestB = Math.min(...b.raceResults.map(r => r.position), Infinity);
    if (bestA !== bestB) return bestA - bestB;
    return 0;
  });

  return sorted.map((p, i) => ({
    rank: i + 1,
    playerId: p.playerId,
    totalPoints: p.totalPoints,
    racePoints: p.raceResults.map(r => r.points),
  }));
}

/**
 * Get player IDs in championship order (best to worst).
 * Used for grid reversal in subsequent races.
 */
export function getStandingsOrder(players: ChampionshipPlayerState[]): string[] {
  return computeChampionshipStandings(players).map(s => s.playerId);
}
