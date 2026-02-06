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
  CornerDef,
} from './types.js';

export {
  HAND_SIZE,
  STARTING_HEAT_IN_ENGINE,
  DEFAULT_STRESS_COUNT,
  MIN_GEAR,
  MAX_GEAR,
  CARDS_PER_GEAR,
  COOLDOWN_PER_GEAR,
  SPINOUT_STRESS,
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
  isPlayableCard,
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

// Engine (9-phase game state machine)
export type {
  GameConfig,
  GearSelection,
  CardSelection,
  CooldownAction,
  BoostAction,
  SlipstreamAction,
  DiscardSelection,
} from './engine.js';

export {
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

// Garage module (upgrade card drafting)
export type {
  UpgradeEffect,
  ScrapEffect,
  SuperCoolEffect,
  SalvageEffect,
  DirectPlayEffect,
  RefreshEffect,
  AdjustSpeedLimitEffect,
  ReduceStressEffect,
  SlipstreamBoostEffect,
  GarageUpgradeType,
  GarageUpgradeCard,
  DraftDirection,
  DraftPhase,
  DraftPlayerState,
  DraftState,
  DraftConfig,
  DraftPickAction,
} from './garage/index.js';

export {
  DRAFT_ROUNDS,
  DRAFT_ROUND_DIRECTIONS,
  GARAGE_UPGRADE_CARDS,
  ALL_GARAGE_UPGRADE_CARDS,
  initDraft,
  executeDraftPick,
  getCurrentDrafter,
  getPlayerDraftedCards,
  buildDraftedDeck,
} from './garage/index.js';
