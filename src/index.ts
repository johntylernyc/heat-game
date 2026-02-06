/**
 * Heat: Pedal to the Metal — Core Game Engine
 *
 * Public API surface for the game state machine and rules engine.
 */

// Track
export {
  Track,
  baseGameTracks,
  usaTrack,
  italyTrack,
  franceTrack,
  greatBritainTrack,
} from "./track/index.js";
export type {
  Corner,
  GridPosition,
  LegendsLine,
  RaceConfig,
  Sector,
  SpotPosition,
  TrackData,
} from "./track/index.js";

// Types
export type {
  Card,
  CardType,
  SpeedCard,
  HeatCard,
  StressCard,
  UpgradeCard,
  UpgradeSubtype,
  Gear,
  PlayerState,
  GamePhase,
  RaceStatus,
  GameState,
} from './types.js';

export {
  HAND_SIZE,
  STARTING_HEAT_IN_ENGINE,
  DEFAULT_STRESS_COUNT,
  MIN_GEAR,
  MAX_GEAR,
  CARDS_PER_GEAR,
  COOLDOWN_PER_GEAR,
} from './types.js';

// Cards
export {
  speedCard,
  heatCard,
  stressCard,
  upgradeCard,
  buildStartingDeck,
  buildEngineZone,
  getCardSpeedValue,
} from './cards.js';

// Deck management
export {
  createRng,
  shuffle,
  drawCards,
  replenishHand,
  discardFromHand,
} from './deck.js';

// Gear
export type { ShiftResult } from './gear.js';
export { shiftGear, getValidGearTargets } from './gear.js';

// Engine (game state machine)
export type {
  GameConfig,
  GearShiftAction,
  PlayCardsAction,
  CooldownAction,
  BoostAction,
} from './engine.js';

export {
  initGame,
  executeGearShift,
  executePlayCards,
  executeCooldown,
  executeBoost,
  endReactPhase,
  executeReplenish,
} from './engine.js';
