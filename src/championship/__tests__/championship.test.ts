import { describe, it, expect } from 'vitest';
import { usaTrack } from '../../track/tracks/usa.js';
import { italyTrack } from '../../track/tracks/italy.js';
import { franceTrack } from '../../track/tracks/france.js';
import { greatBritainTrack } from '../../track/tracks/great-britain.js';
import type { GameState, PlayerState } from '../../types.js';
import type { RaceStanding } from '../../race.js';
import type {
  ChampionshipConfig,
  ChampionshipState,
  ChampionshipPlayerState,
  EventCard,
  SponsorshipCard,
} from '../types.js';
import {
  initChampionship,
  startRace,
  completeRace,
  awardSponsorships,
  advanceAfterRace,
  prepareNextRace,
  getChampionshipResults,
  getChampion,
} from '../championship.js';
import {
  calculatePoints,
  applyEventPointModifier,
  scoreRace,
  computeChampionshipStandings,
  getStandingsOrder,
} from '../scoring.js';
import {
  SPONSORSHIP_CARDS,
  drawSponsorshipCard,
  isPressCorner,
  isSlipstreamAcrossCorner,
  consumeSponsorshipCard,
} from '../sponsorship.js';
import {
  EVENT_CARDS,
  drawEventCard,
  getEventLapModifier,
  getEventStressModifier,
  getEventHeatModifier,
  isReverseGridEvent,
} from '../events.js';

// -- Test Helpers --

function makePlayerIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `player-${i + 1}`);
}

function makeConfig(overrides?: Partial<ChampionshipConfig>): ChampionshipConfig {
  return {
    playerIds: makePlayerIds(4),
    tracks: [usaTrack, italyTrack, franceTrack],
    seed: 42,
    ...overrides,
  };
}

/** Create a mock finished GameState for testing. */
function makeFinishedRaceState(playerIds: string[]): GameState {
  const players: PlayerState[] = playerIds.map((id, i) => ({
    id,
    gear: 1 as const,
    hand: [],
    drawPile: [],
    discardPile: [],
    engineZone: [],
    position: (playerIds.length - i) * 10, // Higher position = better
    lapCount: 1,
    speed: 0,
    hasBoosted: false,
    adrenalineCooldownBonus: 0,
    playedCards: [],
    previousPosition: 0,
  }));

  return {
    players,
    round: 5,
    phase: 'finished',
    activePlayerIndex: 0,
    turnOrder: playerIds.map((_, i) => i),
    lapTarget: 1,
    raceStatus: 'finished',
    corners: usaTrack.corners.map(c => ({
      id: c.id,
      speedLimit: c.speedLimit,
      position: c.position,
    })),
    totalSpaces: usaTrack.totalSpaces,
    startFinishLine: usaTrack.startFinishLine,
    trackId: usaTrack.id,
  };
}

// =============================================
// Scoring Tests
// =============================================

describe('Championship Scoring', () => {
  describe('calculatePoints', () => {
    it('awards correct points for 6-player race', () => {
      expect(calculatePoints(1, 6)).toBe(12);
      expect(calculatePoints(2, 6)).toBe(10);
      expect(calculatePoints(3, 6)).toBe(8);
      expect(calculatePoints(4, 6)).toBe(6);
      expect(calculatePoints(5, 6)).toBe(4);
      expect(calculatePoints(6, 6)).toBe(2);
    });

    it('awards correct points for 4-player race', () => {
      expect(calculatePoints(1, 4)).toBe(8);
      expect(calculatePoints(2, 4)).toBe(6);
      expect(calculatePoints(3, 4)).toBe(4);
      expect(calculatePoints(4, 4)).toBe(2);
    });

    it('awards correct points for 2-player race', () => {
      expect(calculatePoints(1, 2)).toBe(4);
      expect(calculatePoints(2, 2)).toBe(2);
    });

    it('last place always gets 2 points', () => {
      for (let n = 2; n <= 6; n++) {
        expect(calculatePoints(n, n)).toBe(2);
      }
    });

    it('first place always gets playerCount * 2', () => {
      for (let n = 2; n <= 6; n++) {
        expect(calculatePoints(1, n)).toBe(n * 2);
      }
    });

    it('throws for invalid position', () => {
      expect(() => calculatePoints(0, 4)).toThrow('Invalid position');
      expect(() => calculatePoints(5, 4)).toThrow('Invalid position');
    });
  });

  describe('applyEventPointModifier', () => {
    it('returns base points when no event card', () => {
      expect(applyEventPointModifier(10, 1, null)).toBe(10);
    });

    it('doubles points for double-points event', () => {
      const event: EventCard = {
        id: 'test',
        name: 'Double Points',
        description: '',
        effect: { type: 'double-points' },
      };
      expect(applyEventPointModifier(10, 1, event)).toBe(20);
      expect(applyEventPointModifier(6, 3, event)).toBe(12);
    });

    it('adds bonus for leader in bonus-points-leader event', () => {
      const event: EventCard = {
        id: 'test',
        name: 'Bonus',
        description: '',
        effect: { type: 'bonus-points-leader', amount: 4 },
      };
      expect(applyEventPointModifier(10, 1, event)).toBe(14);
      expect(applyEventPointModifier(8, 2, event)).toBe(8); // Not leader
    });

    it('returns base points for non-scoring events', () => {
      const event: EventCard = {
        id: 'test',
        name: 'Extra Heat',
        description: '',
        effect: { type: 'extra-heat', amount: 2 },
      };
      expect(applyEventPointModifier(10, 1, event)).toBe(10);
    });
  });

  describe('scoreRace', () => {
    it('scores all players correctly', () => {
      const standings: RaceStanding[] = [
        { position: 1, playerId: 'p1', lapsCompleted: 1, trackPosition: 60 },
        { position: 2, playerId: 'p2', lapsCompleted: 1, trackPosition: 55 },
        { position: 3, playerId: 'p3', lapsCompleted: 1, trackPosition: 50 },
        { position: 4, playerId: 'p4', lapsCompleted: 1, trackPosition: 45 },
      ];

      const results = scoreRace(standings, 0, 'usa', null);
      expect(results).toHaveLength(4);
      expect(results[0].points).toBe(8);  // 1st of 4
      expect(results[1].points).toBe(6);  // 2nd of 4
      expect(results[2].points).toBe(4);  // 3rd of 4
      expect(results[3].points).toBe(2);  // 4th of 4
      expect(results[0].raceIndex).toBe(0);
      expect(results[0].trackId).toBe('usa');
    });
  });

  describe('computeChampionshipStandings', () => {
    it('ranks players by total points descending', () => {
      const players: ChampionshipPlayerState[] = [
        { playerId: 'p1', totalPoints: 10, raceResults: [{ raceIndex: 0, trackId: 'usa', position: 2, points: 10 }], sponsorshipCards: [] },
        { playerId: 'p2', totalPoints: 16, raceResults: [{ raceIndex: 0, trackId: 'usa', position: 1, points: 16 }], sponsorshipCards: [] },
        { playerId: 'p3', totalPoints: 6, raceResults: [{ raceIndex: 0, trackId: 'usa', position: 3, points: 6 }], sponsorshipCards: [] },
      ];

      const standings = computeChampionshipStandings(players);
      expect(standings[0].playerId).toBe('p2');
      expect(standings[0].rank).toBe(1);
      expect(standings[1].playerId).toBe('p1');
      expect(standings[1].rank).toBe(2);
      expect(standings[2].playerId).toBe('p3');
      expect(standings[2].rank).toBe(3);
    });

    it('breaks ties by best single race finish', () => {
      const players: ChampionshipPlayerState[] = [
        { playerId: 'p1', totalPoints: 12, raceResults: [
          { raceIndex: 0, trackId: 'usa', position: 2, points: 6 },
          { raceIndex: 1, trackId: 'italy', position: 2, points: 6 },
        ], sponsorshipCards: [] },
        { playerId: 'p2', totalPoints: 12, raceResults: [
          { raceIndex: 0, trackId: 'usa', position: 1, points: 8 },
          { raceIndex: 1, trackId: 'italy', position: 3, points: 4 },
        ], sponsorshipCards: [] },
      ];

      const standings = computeChampionshipStandings(players);
      // p2 has a 1st place finish (better best-finish than p1's 2nd)
      expect(standings[0].playerId).toBe('p2');
      expect(standings[1].playerId).toBe('p1');
    });

    it('provides per-race point breakdown', () => {
      const players: ChampionshipPlayerState[] = [
        { playerId: 'p1', totalPoints: 14, raceResults: [
          { raceIndex: 0, trackId: 'usa', position: 1, points: 8 },
          { raceIndex: 1, trackId: 'italy', position: 2, points: 6 },
        ], sponsorshipCards: [] },
      ];

      const standings = computeChampionshipStandings(players);
      expect(standings[0].racePoints).toEqual([8, 6]);
    });
  });

  describe('getStandingsOrder', () => {
    it('returns player IDs in points order', () => {
      const players: ChampionshipPlayerState[] = [
        { playerId: 'p1', totalPoints: 6, raceResults: [{ raceIndex: 0, trackId: 'usa', position: 3, points: 6 }], sponsorshipCards: [] },
        { playerId: 'p2', totalPoints: 10, raceResults: [{ raceIndex: 0, trackId: 'usa', position: 1, points: 10 }], sponsorshipCards: [] },
        { playerId: 'p3', totalPoints: 8, raceResults: [{ raceIndex: 0, trackId: 'usa', position: 2, points: 8 }], sponsorshipCards: [] },
      ];

      expect(getStandingsOrder(players)).toEqual(['p2', 'p3', 'p1']);
    });
  });
});

// =============================================
// Sponsorship Tests
// =============================================

describe('Sponsorship Cards', () => {
  describe('drawSponsorshipCard', () => {
    it('returns a valid sponsorship card', () => {
      const card = drawSponsorshipCard(42);
      expect(card.id).toBeDefined();
      expect(card.name).toBeDefined();
      expect(card.effect).toBeDefined();
    });

    it('is deterministic with same seed', () => {
      const card1 = drawSponsorshipCard(42);
      const card2 = drawSponsorshipCard(42);
      expect(card1.id).toBe(card2.id);
    });

    it('varies with different seeds', () => {
      // Try multiple seeds to find different results
      const cards = new Set<string>();
      for (let seed = 0; seed < 100; seed++) {
        cards.add(drawSponsorshipCard(seed).id);
      }
      expect(cards.size).toBeGreaterThan(1);
    });
  });

  describe('isPressCorner', () => {
    it('returns true when speed is 2+ over limit', () => {
      expect(isPressCorner(5, 3)).toBe(true);  // 5 >= 3+2
      expect(isPressCorner(6, 3)).toBe(true);  // 6 >= 3+2
      expect(isPressCorner(10, 4)).toBe(true); // 10 >= 4+2
    });

    it('returns false when speed is less than 2 over limit', () => {
      expect(isPressCorner(4, 3)).toBe(false); // 4 < 3+2
      expect(isPressCorner(3, 3)).toBe(false); // 3 < 3+2
      expect(isPressCorner(1, 3)).toBe(false); // 1 < 3+2
    });

    it('returns false when speed equals limit + 1', () => {
      expect(isPressCorner(4, 3)).toBe(false);
    });
  });

  describe('isSlipstreamAcrossCorner', () => {
    it('detects slipstream across corner (no wrap)', () => {
      expect(isSlipstreamAcrossCorner(15, 20, 18, 50)).toBe(true);
    });

    it('returns false when slipstream does not cross corner', () => {
      expect(isSlipstreamAcrossCorner(15, 17, 18, 50)).toBe(false);
    });

    it('handles wrap-around at track end', () => {
      // Position wraps from 48 to 2 on a 50-space track, corner at 0
      expect(isSlipstreamAcrossCorner(48, 2, 0, 50)).toBe(true);
    });

    it('returns false for wrap-around that misses corner', () => {
      expect(isSlipstreamAcrossCorner(48, 2, 25, 50)).toBe(false);
    });
  });

  describe('consumeSponsorshipCard', () => {
    it('removes card at specified index', () => {
      const cards: SponsorshipCard[] = [
        SPONSORSHIP_CARDS[0],
        SPONSORSHIP_CARDS[1],
        SPONSORSHIP_CARDS[2],
      ];

      const result = consumeSponsorshipCard(cards, 1);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(SPONSORSHIP_CARDS[0].id);
      expect(result[1].id).toBe(SPONSORSHIP_CARDS[2].id);
    });

    it('throws for invalid index', () => {
      expect(() => consumeSponsorshipCard([], 0)).toThrow('Invalid sponsorship card index');
      expect(() => consumeSponsorshipCard([SPONSORSHIP_CARDS[0]], -1)).toThrow('Invalid sponsorship card index');
    });
  });
});

// =============================================
// Event Card Tests
// =============================================

describe('Event Cards', () => {
  describe('drawEventCard', () => {
    it('draws a card when pool is not exhausted', () => {
      const card = drawEventCard([], 42);
      expect(card).not.toBeNull();
      expect(card!.id).toBeDefined();
    });

    it('excludes used cards', () => {
      const usedIds = EVENT_CARDS.slice(0, EVENT_CARDS.length - 1).map(c => c.id);
      const card = drawEventCard(usedIds, 42);
      expect(card).not.toBeNull();
      // The drawn card should be the only remaining one
      expect(usedIds).not.toContain(card!.id);
    });

    it('returns null when all cards are used', () => {
      const allUsed = EVENT_CARDS.map(c => c.id);
      const card = drawEventCard(allUsed, 42);
      expect(card).toBeNull();
    });

    it('is deterministic with same seed and used cards', () => {
      const card1 = drawEventCard([], 42);
      const card2 = drawEventCard([], 42);
      expect(card1!.id).toBe(card2!.id);
    });
  });

  describe('getEventLapModifier', () => {
    it('returns 0 for null event', () => {
      expect(getEventLapModifier(null)).toBe(0);
    });

    it('returns -1 for reduced-laps event', () => {
      const event: EventCard = {
        id: 'test',
        name: 'Sprint',
        description: '',
        effect: { type: 'reduced-laps' },
      };
      expect(getEventLapModifier(event)).toBe(-1);
    });

    it('returns 0 for non-lap events', () => {
      const event: EventCard = {
        id: 'test',
        name: 'Extra Heat',
        description: '',
        effect: { type: 'extra-heat', amount: 2 },
      };
      expect(getEventLapModifier(event)).toBe(0);
    });
  });

  describe('getEventStressModifier', () => {
    it('returns stress amount for extra-stress event', () => {
      const event: EventCard = {
        id: 'test',
        name: 'Rough',
        description: '',
        effect: { type: 'extra-stress', amount: 2 },
      };
      expect(getEventStressModifier(event)).toBe(2);
    });

    it('returns 0 for non-stress events', () => {
      expect(getEventStressModifier(null)).toBe(0);
    });
  });

  describe('getEventHeatModifier', () => {
    it('returns heat amount for extra-heat event', () => {
      const event: EventCard = {
        id: 'test',
        name: 'Heat',
        description: '',
        effect: { type: 'extra-heat', amount: 3 },
      };
      expect(getEventHeatModifier(event)).toBe(3);
    });

    it('returns 0 for non-heat events', () => {
      expect(getEventHeatModifier(null)).toBe(0);
    });
  });

  describe('isReverseGridEvent', () => {
    it('returns true for reverse-grid event', () => {
      const event: EventCard = {
        id: 'test',
        name: 'Reverse',
        description: '',
        effect: { type: 'reverse-grid' },
      };
      expect(isReverseGridEvent(event)).toBe(true);
    });

    it('returns false for null or other events', () => {
      expect(isReverseGridEvent(null)).toBe(false);
    });
  });
});

// =============================================
// Championship Lifecycle Tests
// =============================================

describe('Championship Lifecycle', () => {
  describe('initChampionship', () => {
    it('creates championship with correct initial state', () => {
      const config = makeConfig();
      const cs = initChampionship(config);

      expect(cs.players).toHaveLength(4);
      expect(cs.currentRaceIndex).toBe(0);
      expect(cs.totalRaces).toBe(3);
      expect(cs.phase).toBe('pre-race');
      expect(cs.standings).toEqual(config.playerIds);
    });

    it('initializes all players with 0 points', () => {
      const cs = initChampionship(makeConfig());
      for (const player of cs.players) {
        expect(player.totalPoints).toBe(0);
        expect(player.raceResults).toEqual([]);
        expect(player.sponsorshipCards).toEqual([]);
      }
    });

    it('draws an event card for the first race', () => {
      const cs = initChampionship(makeConfig());
      expect(cs.activeEventCard).not.toBeNull();
      expect(cs.usedEventCards).toHaveLength(1);
    });

    it('sets weather when weather module enabled', () => {
      const cs = initChampionship(makeConfig({ useWeatherModule: true }));
      expect(cs.currentWeather).not.toBeNull();
    });

    it('sets road conditions when enabled', () => {
      const cs = initChampionship(makeConfig({ useRoadConditions: true }));
      expect(cs.currentRoadConditions).not.toBeNull();
      expect(cs.currentRoadConditions!.length).toBeGreaterThan(0);
    });

    it('rejects fewer than 2 players', () => {
      expect(() => initChampionship(makeConfig({ playerIds: ['solo'] }))).toThrow(
        'at least 2 players',
      );
    });

    it('rejects fewer than 3 tracks', () => {
      expect(() =>
        initChampionship(makeConfig({ tracks: [usaTrack, italyTrack] })),
      ).toThrow('3-4 tracks');
    });

    it('rejects more than 4 tracks', () => {
      expect(() =>
        initChampionship(
          makeConfig({
            tracks: [usaTrack, italyTrack, franceTrack, greatBritainTrack, usaTrack],
          }),
        ),
      ).toThrow('3-4 tracks');
    });

    it('accepts 4 tracks', () => {
      const cs = initChampionship(
        makeConfig({
          tracks: [usaTrack, italyTrack, franceTrack, greatBritainTrack],
        }),
      );
      expect(cs.totalRaces).toBe(4);
    });

    it('validates track capacity for player count', () => {
      expect(() =>
        initChampionship(makeConfig({ playerIds: makePlayerIds(20) })),
      ).toThrow('supports up to');
    });
  });

  describe('startRace', () => {
    it('transitions from pre-race to racing', () => {
      const cs = initChampionship(makeConfig());
      const { championship, raceState } = startRace(cs);

      expect(championship.phase).toBe('racing');
      expect(raceState.phase).toBe('gear-shift');
      expect(raceState.raceStatus).toBe('racing');
    });

    it('sets up race on the correct track', () => {
      const config = makeConfig();
      const cs = initChampionship(config);
      const { raceState } = startRace(cs);

      expect(raceState.trackId).toBe(usaTrack.id);
      expect(raceState.totalSpaces).toBe(usaTrack.totalSpaces);
    });

    it('uses random grid for first race', () => {
      const cs = initChampionship(makeConfig());
      const { raceState } = startRace(cs);

      // Players should be present (order may vary due to shuffle)
      const playerIds = raceState.players.map(p => p.id).sort();
      expect(playerIds).toEqual(makePlayerIds(4).sort());
    });

    it('throws if not in pre-race phase', () => {
      const cs = initChampionship(makeConfig());
      const { championship } = startRace(cs);
      // championship is now in 'racing' phase
      expect(() => startRace(championship)).toThrow("Cannot start race in phase 'racing'");
    });

    it('applies weather when module enabled', () => {
      const cs = initChampionship(makeConfig({ useWeatherModule: true }));
      const { raceState } = startRace(cs);
      expect(raceState.weather).toBeDefined();
    });

    it('applies road conditions when enabled', () => {
      const cs = initChampionship(makeConfig({ useRoadConditions: true }));
      const { raceState } = startRace(cs);
      expect(raceState.roadConditions).toBeDefined();
    });
  });

  describe('completeRace', () => {
    it('transitions from racing to post-race with updated points', () => {
      const config = makeConfig();
      const cs = initChampionship(config);
      const { championship } = startRace(cs);
      const finishedState = makeFinishedRaceState(config.playerIds);

      const result = completeRace(championship, finishedState);

      expect(result.phase).toBe('post-race');

      // Check that points were awarded
      const totalPoints = result.players.reduce((sum, p) => sum + p.totalPoints, 0);
      expect(totalPoints).toBeGreaterThan(0);

      // Check each player has a race result
      for (const player of result.players) {
        expect(player.raceResults).toHaveLength(1);
        expect(player.raceResults[0].raceIndex).toBe(0);
      }
    });

    it('updates standings based on race results', () => {
      const config = makeConfig();
      const cs = initChampionship(config);
      const { championship } = startRace(cs);
      const finishedState = makeFinishedRaceState(config.playerIds);

      const result = completeRace(championship, finishedState);

      // First player in finished state has highest position, should be first in standings
      expect(result.standings[0]).toBe('player-1');
    });

    it('throws if race state is not finished', () => {
      const config = makeConfig();
      const cs = initChampionship(config);
      const { championship } = startRace(cs);
      const unfinishedState = {
        ...makeFinishedRaceState(config.playerIds),
        raceStatus: 'racing' as const,
      };

      expect(() => completeRace(championship, unfinishedState)).toThrow('Race is not finished');
    });

    it('throws if not in racing phase', () => {
      const cs = initChampionship(makeConfig());
      const finishedState = makeFinishedRaceState(makePlayerIds(4));

      expect(() => completeRace(cs, finishedState)).toThrow("Cannot complete race in phase 'pre-race'");
    });
  });

  describe('awardSponsorships', () => {
    it('adds sponsorship cards to players', () => {
      const config = makeConfig();
      const cs = initChampionship(config);
      const { championship } = startRace(cs);
      const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));

      const awards = new Map<string, SponsorshipCard[]>();
      awards.set('player-1', [SPONSORSHIP_CARDS[0]]);
      awards.set('player-3', [SPONSORSHIP_CARDS[1], SPONSORSHIP_CARDS[2]]);

      const result = awardSponsorships(postRace, awards);

      const p1 = result.players.find(p => p.playerId === 'player-1')!;
      expect(p1.sponsorshipCards).toHaveLength(1);

      const p3 = result.players.find(p => p.playerId === 'player-3')!;
      expect(p3.sponsorshipCards).toHaveLength(2);

      // Player-2 should have no cards
      const p2 = result.players.find(p => p.playerId === 'player-2')!;
      expect(p2.sponsorshipCards).toHaveLength(0);
    });

    it('throws if not in post-race phase', () => {
      const cs = initChampionship(makeConfig());
      expect(() => awardSponsorships(cs, new Map())).toThrow("Cannot award sponsorships in phase 'pre-race'");
    });
  });

  describe('advanceAfterRace', () => {
    it('transitions to between-races if more races remain', () => {
      const config = makeConfig();
      const cs = initChampionship(config);
      const { championship } = startRace(cs);
      const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));

      const result = advanceAfterRace(postRace);
      expect(result.phase).toBe('between-races');
    });

    it('transitions to finished after last race', () => {
      const config = makeConfig();
      let cs = initChampionship(config);

      // Simulate 3 races
      for (let i = 0; i < 3; i++) {
        const { championship } = startRace(cs);
        const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));
        cs = advanceAfterRace(postRace);

        if (i < 2) {
          expect(cs.phase).toBe('between-races');
          cs = prepareNextRace(cs);
        }
      }

      expect(cs.phase).toBe('finished');
    });

    it('throws if not in post-race phase', () => {
      const cs = initChampionship(makeConfig());
      expect(() => advanceAfterRace(cs)).toThrow("Cannot advance in phase 'pre-race'");
    });
  });

  describe('prepareNextRace', () => {
    it('advances to next race with new event card', () => {
      const config = makeConfig();
      const cs = initChampionship(config);
      const { championship } = startRace(cs);
      const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));
      const betweenRaces = advanceAfterRace(postRace);

      const result = prepareNextRace(betweenRaces);

      expect(result.currentRaceIndex).toBe(1);
      expect(result.phase).toBe('pre-race');
      // Should have drawn a new event card
      expect(result.usedEventCards.length).toBeGreaterThanOrEqual(1);
    });

    it('draws new weather for next race when enabled', () => {
      const config = makeConfig({ useWeatherModule: true });
      const cs = initChampionship(config);
      const { championship } = startRace(cs);
      const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));
      const betweenRaces = advanceAfterRace(postRace);

      const result = prepareNextRace(betweenRaces);
      expect(result.currentWeather).not.toBeNull();
    });

    it('throws if not in between-races phase', () => {
      const cs = initChampionship(makeConfig());
      expect(() => prepareNextRace(cs)).toThrow("Cannot prepare next race in phase 'pre-race'");
    });
  });

  describe('getChampionshipResults', () => {
    it('returns final standings after championship is finished', () => {
      const config = makeConfig();
      let cs = initChampionship(config);

      // Run all 3 races
      for (let i = 0; i < 3; i++) {
        const { championship } = startRace(cs);
        const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));
        cs = advanceAfterRace(postRace);
        if (i < 2) {
          cs = prepareNextRace(cs);
        }
      }

      expect(cs.phase).toBe('finished');
      const results = getChampionshipResults(cs);

      expect(results).toHaveLength(4);
      expect(results[0].rank).toBe(1);
      expect(results[3].rank).toBe(4);

      // Each player should have 3 race results
      for (const standing of results) {
        expect(standing.racePoints).toHaveLength(3);
      }
    });

    it('throws if championship is not finished', () => {
      const cs = initChampionship(makeConfig());
      expect(() => getChampionshipResults(cs)).toThrow('Championship is not finished');
    });
  });

  describe('getChampion', () => {
    it('returns the player with most points', () => {
      const config = makeConfig();
      let cs = initChampionship(config);

      // Run all 3 races (player-1 always wins in our mock)
      for (let i = 0; i < 3; i++) {
        const { championship } = startRace(cs);
        const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));
        cs = advanceAfterRace(postRace);
        if (i < 2) {
          cs = prepareNextRace(cs);
        }
      }

      expect(getChampion(cs)).toBe('player-1');
    });
  });
});

// =============================================
// Full Championship Flow
// =============================================

describe('Full Championship Integration', () => {
  it('completes a 3-race championship with cumulative scoring', () => {
    const config = makeConfig();
    let cs = initChampionship(config);

    let totalPointsPerRace: number[] = [];

    for (let i = 0; i < 3; i++) {
      expect(cs.phase).toBe('pre-race');
      expect(cs.currentRaceIndex).toBe(i);

      const { championship, raceState } = startRace(cs);
      expect(championship.phase).toBe('racing');
      expect(raceState.trackId).toBe(config.tracks[i].id);

      const finished = makeFinishedRaceState(config.playerIds);
      const postRace = completeRace(championship, finished);
      expect(postRace.phase).toBe('post-race');

      // Track cumulative points
      const raceTotal = postRace.players.reduce((sum, p) => sum + p.totalPoints, 0);
      totalPointsPerRace.push(raceTotal);

      cs = advanceAfterRace(postRace);

      if (i < 2) {
        expect(cs.phase).toBe('between-races');
        cs = prepareNextRace(cs);
      }
    }

    expect(cs.phase).toBe('finished');

    // Points should accumulate across races
    expect(totalPointsPerRace[1]).toBeGreaterThan(totalPointsPerRace[0]);
    expect(totalPointsPerRace[2]).toBeGreaterThan(totalPointsPerRace[1]);

    const results = getChampionshipResults(cs);
    expect(results).toHaveLength(4);
    // Total points should be sum of all race points
    for (const standing of results) {
      const sum = standing.racePoints.reduce((a, b) => a + b, 0);
      expect(standing.totalPoints).toBe(sum);
    }
  });

  it('completes a 4-race championship', () => {
    const config = makeConfig({
      tracks: [usaTrack, italyTrack, franceTrack, greatBritainTrack],
    });
    let cs = initChampionship(config);
    expect(cs.totalRaces).toBe(4);

    for (let i = 0; i < 4; i++) {
      const { championship } = startRace(cs);
      const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));
      cs = advanceAfterRace(postRace);
      if (i < 3) {
        cs = prepareNextRace(cs);
      }
    }

    expect(cs.phase).toBe('finished');
    const results = getChampionshipResults(cs);
    expect(results[0].racePoints).toHaveLength(4);
  });

  it('maintains starting grid reversal for subsequent races', () => {
    const config = makeConfig();
    let cs = initChampionship(config);

    // Race 1
    const { championship } = startRace(cs);
    const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));
    cs = advanceAfterRace(postRace);
    cs = prepareNextRace(cs);

    // Standings should reflect race 1 results
    expect(cs.standings[0]).toBe('player-1'); // winner

    // Race 2: championship grid order means leader starts last
    const { raceState: race2State } = startRace(cs);

    // The race is set up with championship standings (reverse order).
    // player-1 (leader) should start further back.
    const p1Index = race2State.players.findIndex(p => p.id === 'player-1');
    const p4Index = race2State.players.findIndex(p => p.id === 'player-4');
    // In championship mode, last place (player-4) gets pole (index 0)
    // and leader (player-1) starts last
    expect(p4Index).toBeLessThan(p1Index);
  });

  it('does not reuse event cards across races', () => {
    const config = makeConfig();
    let cs = initChampionship(config);

    const seenEventIds = new Set<string>();
    if (cs.activeEventCard) seenEventIds.add(cs.activeEventCard.id);

    for (let i = 0; i < 3; i++) {
      const { championship } = startRace(cs);
      const postRace = completeRace(championship, makeFinishedRaceState(config.playerIds));
      cs = advanceAfterRace(postRace);
      if (i < 2) {
        cs = prepareNextRace(cs);
        if (cs.activeEventCard) {
          // Event card should not be a repeat
          expect(seenEventIds.has(cs.activeEventCard.id)).toBe(false);
          seenEventIds.add(cs.activeEventCard.id);
        }
      }
    }
  });
});
