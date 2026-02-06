/**
 * Types for the Garage Module — upgrade card drafting.
 *
 * The Garage is an advanced variant where players draft upgrade cards
 * instead of using the 3 default starting upgrades.
 */

// -- Upgrade Card Keywords / Effects --

/**
 * Scrap N: Discard this card and N additional cards from hand when played.
 * The effect activates, then cards are scrapped.
 */
export interface ScrapEffect {
  keyword: 'scrap';
  count: number;
}

/**
 * Super Cool N: During cooldown, move up to N extra Heat cards
 * from discard pile back to engine zone (beyond gear limit).
 */
export interface SuperCoolEffect {
  keyword: 'super-cool';
  count: number;
}

/**
 * Salvage N: When this card is discarded (e.g., after playing),
 * recover N cards from your discard pile back on top of your draw pile.
 */
export interface SalvageEffect {
  keyword: 'salvage';
  count: number;
}

/**
 * Direct Play: This card may be played from hand during the React step
 * (in addition to normal card play during Play Cards phase).
 */
export interface DirectPlayEffect {
  keyword: 'direct-play';
}

/**
 * Refresh: When this card would go to the discard pile,
 * place it on top of your draw pile instead.
 */
export interface RefreshEffect {
  keyword: 'refresh';
}

/**
 * Adjust Speed Limit: Modifies the speed limit of a corner
 * by a given amount (positive = higher limit).
 */
export interface AdjustSpeedLimitEffect {
  keyword: 'adjust-speed-limit';
  amount: number;
}

/**
 * Reduce Stress: Discard N Stress cards from hand when played.
 */
export interface ReduceStressEffect {
  keyword: 'reduce-stress';
  count: number;
}

/**
 * Slipstream Boost: Increases slipstream distance by N spaces.
 */
export interface SlipstreamBoostEffect {
  keyword: 'slipstream-boost';
  count: number;
}

export type UpgradeEffect =
  | ScrapEffect
  | SuperCoolEffect
  | SalvageEffect
  | DirectPlayEffect
  | RefreshEffect
  | AdjustSpeedLimitEffect
  | ReduceStressEffect
  | SlipstreamBoostEffect;

// -- Garage Upgrade Card --

/**
 * The 11 upgrade card categories from the Garage module.
 */
export type GarageUpgradeType =
  | '4-wheel-drive'
  | 'brakes'
  | 'cooling-system'
  | 'body'
  | 'rpm'
  | 'tires'
  | 'wings'
  | 'turbocharger'
  | 'fuel'
  | 'gas-pedal'
  | 'suspension';

/**
 * A garage upgrade card definition. Each card type may have multiple
 * variants at different power levels.
 */
export interface GarageUpgradeCard {
  type: 'upgrade';
  garageType: GarageUpgradeType;
  name: string;
  /** Primary speed value when played (null if not playable for speed). */
  speedValue: number | null;
  /** Optional alternative speed value for Brakes-type cards. */
  alternateSpeedValue?: number;
  /** Heat cost to play this card (0 if free). */
  heatCost: number;
  /** Card effects/keywords. */
  effects: UpgradeEffect[];
}

// -- Draft State --

/**
 * Direction of a draft round.
 * 'back-to-front': Last grid position picks first (rounds 1 & 3).
 * 'front-to-back': First grid position picks first (round 2).
 */
export type DraftDirection = 'back-to-front' | 'front-to-back';

/** The 3 draft rounds follow a snake pattern. */
export const DRAFT_ROUND_DIRECTIONS: readonly DraftDirection[] = [
  'back-to-front',
  'front-to-back',
  'back-to-front',
] as const;

export const DRAFT_ROUNDS = 3;

export type DraftPhase = 'dealing' | 'drafting' | 'complete';

export interface DraftPlayerState {
  playerId: string;
  /** Grid position (1 = pole). Lower = closer to front. */
  gridPosition: number;
  /** Cards this player has drafted so far (up to 3). */
  draftedCards: GarageUpgradeCard[];
}

export interface DraftState {
  phase: DraftPhase;
  /** The number of players in the draft. */
  playerCount: number;
  /** Player draft states ordered by player ID (same order as game). */
  players: DraftPlayerState[];
  /** Face-up cards available for drafting this round. */
  availableCards: GarageUpgradeCard[];
  /** Remaining shuffled pool to deal from in future rounds. */
  remainingPool: GarageUpgradeCard[];
  /** Current draft round (0-indexed, 0-2). */
  currentRound: number;
  /** Index into the current round's pick order. */
  currentPickIndex: number;
  /** Pick order for each round (indices into players array). */
  pickOrders: number[][];
  /** Cards that were not drafted (removed from play). */
  undraftedCards: GarageUpgradeCard[];
}
