/**
 * Core type definitions for Heat: Pedal to the Metal game engine.
 */

// -- Card Types --

export type CardType = 'speed' | 'heat' | 'stress' | 'upgrade';

export type UpgradeSubtype = 'speed-0' | 'speed-5' | 'starting-heat';

export interface SpeedCard {
  type: 'speed';
  value: 1 | 2 | 3 | 4;
}

export interface HeatCard {
  type: 'heat';
}

export interface StressCard {
  type: 'stress';
}

export interface UpgradeCard {
  type: 'upgrade';
  subtype: UpgradeSubtype;
}

export type Card = SpeedCard | HeatCard | StressCard | UpgradeCard;

// -- Gear --

export type Gear = 1 | 2 | 3 | 4;

/** Number of cards played per gear. */
export const CARDS_PER_GEAR: Record<Gear, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
};

/** Cooldown slots available in React phase per gear. */
export const COOLDOWN_PER_GEAR: Record<Gear, number> = {
  1: 3,
  2: 1,
  3: 0,
  4: 0,
};

/** Stress cards awarded during spinout, by gear. */
export const SPINOUT_STRESS: Record<Gear, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
};

// -- Corner Definition (embedded in game state) --

export interface CornerDef {
  id: number;
  speedLimit: number;
  position: number;
}

// -- Player State --

export interface PlayerState {
  id: string;
  gear: Gear;
  hand: Card[];
  drawPile: Card[];
  discardPile: Card[];
  engineZone: Card[];
  position: number;
  lapCount: number;
  /** Speed value this round (cards + boost + adrenaline, NOT slipstream). */
  speed: number;
  /** Whether this player has used boost this round. */
  hasBoosted: boolean;
  /** Extra cooldown slots granted by Adrenaline this round. */
  adrenalineCooldownBonus: number;
  /** Cards played face-down, pending resolution in reveal-and-move. */
  playedCards: Card[];
  /** Position before this round's movement (for corner checks). */
  previousPosition: number;
}

// -- Game Phases --

export type GamePhase =
  | 'setup'
  | 'gear-shift'
  | 'play-cards'
  | 'reveal-and-move'
  | 'adrenaline'
  | 'react'
  | 'slipstream'
  | 'check-corner'
  | 'discard'
  | 'replenish'
  | 'finished';

// -- Race Status --

export type RaceStatus = 'setup' | 'racing' | 'final-round' | 'finished';

// -- Game State --

export interface GameState {
  players: PlayerState[];
  round: number;
  phase: GamePhase;
  activePlayerIndex: number;
  turnOrder: number[];
  lapTarget: number;
  raceStatus: RaceStatus;
  /** Track corner definitions for corner speed checks. */
  corners: CornerDef[];
  /** Total number of spaces on the track loop. */
  totalSpaces: number;
  /** Space index of the start/finish line. */
  startFinishLine: number;
  /** Track ID for serialization/identification. */
  trackId: string;
  /** Active weather token for this race (undefined = no weather). */
  weather?: WeatherToken;
  /** Road conditions placed at corners (undefined = no road conditions). */
  roadConditions?: RoadConditionPlacement[];
}

// -- Weather --

export type WeatherType =
  | 'freezing-cold'
  | 'heavy-rain'
  | 'rain'
  | 'fog'
  | 'cloudy'
  | 'sunny';

export interface WeatherStartingEffect {
  /** Stress count modifier (positive = more stress, negative = less). */
  stressMod: number;
  /** Heat cards added to draw pile. */
  heatInDeck: number;
  /** Heat cards added to discard pile. */
  heatInDiscard: number;
  /** Extra Heat cards added to engine zone. */
  heatInEngine: number;
}

export interface WeatherOngoingEffect {
  /** Extra cooldown slots in all gears. */
  cooldownMod: number;
  /** Whether cooldown is completely disabled. */
  noCooldown: boolean;
  /** Whether slipstream is completely disabled. */
  noSlipstream: boolean;
  /** Extra slipstream range (added to default 2). */
  slipstreamRangeMod: number;
}

export interface WeatherToken {
  type: WeatherType;
  name: string;
  startingEffect: WeatherStartingEffect;
  ongoingEffect: WeatherOngoingEffect;
}

// -- Road Conditions --

export type CornerModType = 'speed-plus-1' | 'speed-minus-1' | 'overheat';
export type SectorModType = 'slipstream-boost' | 'free-boost' | 'weather-sector';

export interface CornerMod {
  target: 'corner';
  modType: CornerModType;
}

export interface SectorMod {
  target: 'sector';
  modType: SectorModType;
}

export type RoadConditionToken = CornerMod | SectorMod;

export interface RoadConditionPlacement {
  cornerId: number;
  token: RoadConditionToken;
}

// -- Constants --

export const HAND_SIZE = 7;
export const STARTING_HEAT_IN_ENGINE = 6;
export const DEFAULT_STRESS_COUNT = 3;
export const MIN_GEAR: Gear = 1;
export const MAX_GEAR: Gear = 4;
