/**
 * Card creation helpers and starting deck composition.
 */

import type { Card, SpeedCard, HeatCard, StressCard, UpgradeCard } from './types.js';

export function speedCard(value: SpeedCard['value']): SpeedCard {
  return { type: 'speed', value };
}

export function heatCard(): HeatCard {
  return { type: 'heat' };
}

export function stressCard(): StressCard {
  return { type: 'stress' };
}

export function upgradeCard(subtype: UpgradeCard['subtype']): UpgradeCard {
  return { type: 'upgrade', subtype };
}

/**
 * Build the starting draw deck for a player.
 *
 * Composition:
 * - 12 Speed cards (3x each of values 1, 2, 3, 4)
 * - 3 Starting upgrades (1x Speed-0, 1x Speed-5, 1x starting Heat)
 * - Stress cards shuffled in (count varies by track)
 *
 * Note: Engine zone Heat cards are separate — not part of this deck.
 */
export function buildStartingDeck(stressCount: number): Card[] {
  const deck: Card[] = [];

  // 12 Speed cards: 3x each of 1, 2, 3, 4
  for (const value of [1, 2, 3, 4] as const) {
    for (let i = 0; i < 3; i++) {
      deck.push(speedCard(value));
    }
  }

  // 3 Starting upgrades
  deck.push(upgradeCard('speed-0'));
  deck.push(upgradeCard('speed-5'));
  deck.push(upgradeCard('starting-heat'));

  // Stress cards
  for (let i = 0; i < stressCount; i++) {
    deck.push(stressCard());
  }

  return deck;
}

/**
 * Build the engine zone for a player (6 Heat cards).
 */
export function buildEngineZone(): Card[] {
  return Array.from({ length: 6 }, () => heatCard());
}

/**
 * Get the effective speed value of a card when played.
 * Speed cards use their value. Upgrades have special values.
 * Heat and Stress cards cannot be played for speed directly.
 */
export function getCardSpeedValue(card: Card): number | null {
  switch (card.type) {
    case 'speed':
      return card.value;
    case 'upgrade':
      if (card.subtype === 'speed-0') return 0;
      if (card.subtype === 'speed-5') return 5;
      return null;
    default:
      return null;
  }
}
