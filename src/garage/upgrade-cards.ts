/**
 * Garage upgrade card definitions.
 *
 * All 11 upgrade card types with their variants and effects.
 * Card data matches the Heat: Pedal to the Metal Garage module.
 */

import type { GarageUpgradeCard, GarageUpgradeType } from './types.js';

function card(
  garageType: GarageUpgradeType,
  name: string,
  props: Omit<GarageUpgradeCard, 'type' | 'garageType' | 'name'>,
): GarageUpgradeCard {
  return { type: 'upgrade', garageType, name, ...props };
}

// -- 1. 4 Wheel Drive --
// Stress alternative: provides speed with a cooldown cost.

export const fourWheelDrive3 = card('4-wheel-drive', '4 Wheel Drive (3)', {
  speedValue: 3,
  heatCost: 0,
  effects: [{ keyword: 'super-cool', count: 1 }],
});

export const fourWheelDrive4 = card('4-wheel-drive', '4 Wheel Drive (4)', {
  speedValue: 4,
  heatCost: 0,
  effects: [{ keyword: 'super-cool', count: 1 }],
});

// -- 2. Brakes --
// Choose between two speed values when revealed.

export const brakes3or1 = card('brakes', 'Brakes (3/1)', {
  speedValue: 3,
  alternateSpeedValue: 1,
  heatCost: 0,
  effects: [],
});

export const brakes4or1 = card('brakes', 'Brakes (4/1)', {
  speedValue: 4,
  alternateSpeedValue: 1,
  heatCost: 0,
  effects: [],
});

// -- 3. Cooling System --
// Provides cooldown effect when played.

export const coolingSystem3 = card('cooling-system', 'Cooling System (3)', {
  speedValue: 3,
  heatCost: 0,
  effects: [{ keyword: 'super-cool', count: 3 }],
});

export const coolingSystem5 = card('cooling-system', 'Cooling System (5)', {
  speedValue: 5,
  heatCost: 0,
  effects: [{ keyword: 'super-cool', count: 1 }],
});

// -- 4. Body --
// Speed + discard Stress cards from hand.

export const body4 = card('body', 'Body (4)', {
  speedValue: 4,
  heatCost: 0,
  effects: [{ keyword: 'reduce-stress', count: 1 }],
});

export const body6 = card('body', 'Body (6)', {
  speedValue: 6,
  heatCost: 0,
  effects: [{ keyword: 'reduce-stress', count: 1 }],
});

// -- 5. R.P.M. --
// Increases slipstream distance.

export const rpm3 = card('rpm', 'R.P.M. (3)', {
  speedValue: 3,
  heatCost: 0,
  effects: [{ keyword: 'slipstream-boost', count: 2 }],
});

export const rpm5 = card('rpm', 'R.P.M. (5)', {
  speedValue: 5,
  heatCost: 0,
  effects: [{ keyword: 'slipstream-boost', count: 1 }],
});

// -- 6. Tires --
// Speed limit modification or cooldown.

export const tires3 = card('tires', 'Tires (3)', {
  speedValue: 3,
  heatCost: 0,
  effects: [{ keyword: 'adjust-speed-limit', amount: 2 }],
});

export const tires5 = card('tires', 'Tires (5)', {
  speedValue: 5,
  heatCost: 0,
  effects: [{ keyword: 'adjust-speed-limit', amount: 1 }],
});

// -- 7. Wings --
// Speed limit boost requiring heat payment.

export const wings6 = card('wings', 'Wings (6)', {
  speedValue: 6,
  heatCost: 1,
  effects: [{ keyword: 'adjust-speed-limit', amount: 1 }],
});

export const wings7 = card('wings', 'Wings (7)', {
  speedValue: 7,
  heatCost: 1,
  effects: [],
});

// -- 8. Turbocharger --
// High speed with Heat cost + Scrap.

export const turbocharger7 = card('turbocharger', 'Turbocharger (7)', {
  speedValue: 7,
  heatCost: 1,
  effects: [{ keyword: 'scrap', count: 1 }],
});

export const turbocharger8 = card('turbocharger', 'Turbocharger (8)', {
  speedValue: 8,
  heatCost: 2,
  effects: [{ keyword: 'scrap', count: 1 }],
});

// -- 9. Fuel --
// Salvage (recover from discard to deck).

export const fuel3 = card('fuel', 'Fuel (3)', {
  speedValue: 3,
  heatCost: 0,
  effects: [{ keyword: 'salvage', count: 2 }],
});

export const fuel5 = card('fuel', 'Fuel (5)', {
  speedValue: 5,
  heatCost: 0,
  effects: [{ keyword: 'salvage', count: 1 }],
});

// -- 10. Gas Pedal --
// Direct Play during React step.

export const gasPedal4 = card('gas-pedal', 'Gas Pedal (4)', {
  speedValue: 4,
  heatCost: 0,
  effects: [{ keyword: 'direct-play' }],
});

export const gasPedal6 = card('gas-pedal', 'Gas Pedal (6)', {
  speedValue: 6,
  heatCost: 1,
  effects: [{ keyword: 'direct-play' }],
});

// -- 11. Suspension --
// Refresh (return to deck top instead of discard).

export const suspension3 = card('suspension', 'Suspension (3)', {
  speedValue: 3,
  heatCost: 0,
  effects: [{ keyword: 'refresh' }],
});

export const suspension5 = card('suspension', 'Suspension (5)', {
  speedValue: 5,
  heatCost: 0,
  effects: [{ keyword: 'refresh' }],
});

/**
 * All garage upgrade cards grouped by type.
 * Each type has 2 variants (lower and higher power).
 */
export const GARAGE_UPGRADE_CARDS: Record<GarageUpgradeType, GarageUpgradeCard[]> = {
  '4-wheel-drive': [fourWheelDrive3, fourWheelDrive4],
  'brakes': [brakes3or1, brakes4or1],
  'cooling-system': [coolingSystem3, coolingSystem5],
  'body': [body4, body6],
  'rpm': [rpm3, rpm5],
  'tires': [tires3, tires5],
  'wings': [wings6, wings7],
  'turbocharger': [turbocharger7, turbocharger8],
  'fuel': [fuel3, fuel5],
  'gas-pedal': [gasPedal4, gasPedal6],
  'suspension': [suspension3, suspension5],
};

/**
 * Flat array of all 22 garage upgrade cards (11 types x 2 variants).
 */
export const ALL_GARAGE_UPGRADE_CARDS: GarageUpgradeCard[] = Object.values(
  GARAGE_UPGRADE_CARDS,
).flat();
