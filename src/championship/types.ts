/**
 * Championship Mode type definitions.
 *
 * A championship is a multi-race series (3-4 races) where players
 * accumulate points across races. Between races, players may draft
 * upgrades and face random event cards.
 */

import type { TrackData } from '../track/types.js';
import type { GameState, WeatherToken, RoadConditionPlacement } from '../types.js';
import type { RaceStanding } from '../race.js';

// -- Championship Configuration --

export interface ChampionshipConfig {
  /** Player IDs participating in the championship. */
  playerIds: string[];
  /** Tracks for each race (3-4 tracks). */
  tracks: TrackData[];
  /** Optional lap override per race (uses track default if omitted). */
  lapsPerRace?: number;
  /** RNG seed for deterministic outcomes. */
  seed: number;
  /** Enable Garage Module (upgrade drafting before each race). */
  useGarageModule?: boolean;
  /** Enable Weather Module (random weather per race). */
  useWeatherModule?: boolean;
  /** Enable Road Conditions (random road conditions per race). */
  useRoadConditions?: boolean;
}

// -- Championship Phases --

export type ChampionshipPhase =
  | 'pre-race'       // Draw event card, set up weather/road, draft upgrades
  | 'racing'         // Race in progress (delegated to engine)
  | 'post-race'      // Score results, award sponsorships, update standings
  | 'between-races'  // Display standings, prepare next race
  | 'finished';      // Championship complete

// -- Scoring --

export interface RaceResult {
  /** Index of the race in the championship (0-based). */
  raceIndex: number;
  /** Track ID for this race. */
  trackId: string;
  /** Finishing position (1 = winner). */
  position: number;
  /** Points scored in this race. */
  points: number;
}

export interface ChampionshipPlayerState {
  playerId: string;
  /** Total championship points across all races. */
  totalPoints: number;
  /** Per-race results. */
  raceResults: RaceResult[];
  /** Sponsorship cards earned (single-use). */
  sponsorshipCards: SponsorshipCard[];
}

// -- Championship Standings --

export interface ChampionshipStanding {
  /** Championship rank (1 = leader). */
  rank: number;
  playerId: string;
  totalPoints: number;
  /** Per-race points breakdown. */
  racePoints: number[];
}

// -- Sponsorship Cards --

export type SponsorshipEffect =
  | { type: 'extra-cooldown'; amount: number }
  | { type: 'reduce-heat-cost'; amount: number }
  | { type: 'extra-speed'; amount: number }
  | { type: 'free-gear-shift' }
  | { type: 'extra-slipstream-range'; amount: number }
  | { type: 'stress-shield' };

export interface SponsorshipCard {
  id: string;
  name: string;
  description: string;
  effect: SponsorshipEffect;
}

/** Record of how a sponsorship was earned. */
export interface SponsorshipEarning {
  playerId: string;
  cornerId: number;
  lapNumber: number;
  reason: 'press-corner' | 'slipstream-across-corner';
  card: SponsorshipCard;
}

// -- Event Cards --

export type EventEffect =
  | { type: 'extra-heat'; amount: number }
  | { type: 'reduced-laps' }
  | { type: 'reverse-grid' }
  | { type: 'extra-stress'; amount: number }
  | { type: 'bonus-points-leader'; amount: number }
  | { type: 'double-points' };

export interface EventCard {
  id: string;
  name: string;
  description: string;
  effect: EventEffect;
}

// -- Championship State --

export interface ChampionshipState {
  config: ChampionshipConfig;
  players: ChampionshipPlayerState[];
  /** Index of the current race (0-based). */
  currentRaceIndex: number;
  /** Total number of races in the series. */
  totalRaces: number;
  /** Current championship phase. */
  phase: ChampionshipPhase;
  /** Active event card for the current race (drawn in pre-race). */
  activeEventCard: EventCard | null;
  /** All event cards used so far (not redrawn). */
  usedEventCards: EventCard[];
  /** Current championship standings (player IDs, best to worst). */
  standings: string[];
  /** RNG seed (offset per race for independence). */
  seed: number;
  /** Weather token for the current race (if weather module enabled). */
  currentWeather: WeatherToken | null;
  /** Road conditions for the current race (if road conditions enabled). */
  currentRoadConditions: RoadConditionPlacement[] | null;
}
