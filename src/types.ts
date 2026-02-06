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
}

// -- Game Phases --

export type GamePhase =
  | 'setup'
  | 'gear-shift'
  | 'play-cards'
  | 'react'
  | 'replenish'
  | 'finished';

// -- Race Status --

export type RaceStatus = 'setup' | 'racing' | 'finished';

// -- Game State --

export interface GameState {
  players: PlayerState[];
  round: number;
  phase: GamePhase;
  activePlayerIndex: number;
  turnOrder: number[];
  lapTarget: number;
  raceStatus: RaceStatus;
}

// -- Constants --

export const HAND_SIZE = 7;
export const STARTING_HEAT_IN_ENGINE = 6;
export const DEFAULT_STRESS_COUNT = 3;
export const MIN_GEAR: Gear = 1;
export const MAX_GEAR: Gear = 4;
