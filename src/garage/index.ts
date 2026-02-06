/**
 * Garage Module — Upgrade Card Drafting
 *
 * Advanced variant where players draft upgrade cards
 * instead of using the 3 default starting upgrades.
 */

// Types
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
} from './types.js';

export {
  DRAFT_ROUNDS,
  DRAFT_ROUND_DIRECTIONS,
} from './types.js';

// Upgrade card data
export {
  GARAGE_UPGRADE_CARDS,
  ALL_GARAGE_UPGRADE_CARDS,
  fourWheelDrive3,
  fourWheelDrive4,
  brakes3or1,
  brakes4or1,
  coolingSystem3,
  coolingSystem5,
  body4,
  body6,
  rpm3,
  rpm5,
  tires3,
  tires5,
  wings6,
  wings7,
  turbocharger7,
  turbocharger8,
  fuel3,
  fuel5,
  gasPedal4,
  gasPedal6,
  suspension3,
  suspension5,
} from './upgrade-cards.js';

// Draft state machine
export type { DraftConfig, DraftPickAction } from './draft.js';
export {
  cardsPerRound,
  initDraft,
  executeDraftPick,
  getCurrentDrafter,
  getPlayerDraftedCards,
  buildDraftedDeck,
} from './draft.js';
