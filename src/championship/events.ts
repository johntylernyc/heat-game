/**
 * Championship event cards — random events drawn before each race.
 *
 * Each race in a championship draws one event card that applies
 * a special rule or modifier for that race. Used cards are not redrawn.
 */

import type { EventCard } from './types.js';
import { createRng } from '../deck.js';

// -- Event Card Pool --

export const EVENT_CARDS: EventCard[] = [
  {
    id: 'evt-extra-heat-2',
    name: 'Engine Strain',
    description: 'All players start with 2 extra Heat cards in their draw pile.',
    effect: { type: 'extra-heat', amount: 2 },
  },
  {
    id: 'evt-extra-heat-3',
    name: 'Overheating Conditions',
    description: 'All players start with 3 extra Heat cards in their draw pile.',
    effect: { type: 'extra-heat', amount: 3 },
  },
  {
    id: 'evt-reduced-laps',
    name: 'Sprint Race',
    description: 'This race is 1 lap shorter (minimum 1 lap).',
    effect: { type: 'reduced-laps' },
  },
  {
    id: 'evt-reverse-grid',
    name: 'Reverse Grid',
    description: 'Starting grid is reversed from championship order (leader starts first instead of last).',
    effect: { type: 'reverse-grid' },
  },
  {
    id: 'evt-extra-stress-1',
    name: 'Rough Track',
    description: 'All players start with 1 extra Stress card.',
    effect: { type: 'extra-stress', amount: 1 },
  },
  {
    id: 'evt-extra-stress-2',
    name: 'Debris on Track',
    description: 'All players start with 2 extra Stress cards.',
    effect: { type: 'extra-stress', amount: 2 },
  },
  {
    id: 'evt-bonus-leader-4',
    name: 'Winner Takes More',
    description: 'The race winner earns 4 extra championship points.',
    effect: { type: 'bonus-points-leader', amount: 4 },
  },
  {
    id: 'evt-double-points',
    name: 'Double Points Race',
    description: 'All championship points for this race are doubled.',
    effect: { type: 'double-points' },
  },
];

/**
 * Draw a random event card from unused cards.
 *
 * @param usedCardIds - IDs of cards already used in previous races
 * @param seed - RNG seed for deterministic draw
 * @returns Drawn event card, or null if all cards have been used
 */
export function drawEventCard(
  usedCardIds: string[],
  seed: number,
): EventCard | null {
  const usedSet = new Set(usedCardIds);
  const available = EVENT_CARDS.filter(c => !usedSet.has(c.id));
  if (available.length === 0) return null;

  const rng = createRng(seed);
  const index = Math.floor(rng() * available.length);
  return { ...available[index] };
}

/**
 * Get the lap modifier from an event card.
 * Returns 0 for non-lap-modifying events, -1 for 'reduced-laps'.
 */
export function getEventLapModifier(event: EventCard | null): number {
  if (!event) return 0;
  return event.effect.type === 'reduced-laps' ? -1 : 0;
}

/**
 * Get the extra stress modifier from an event card.
 */
export function getEventStressModifier(event: EventCard | null): number {
  if (!event) return 0;
  return event.effect.type === 'extra-stress' ? event.effect.amount : 0;
}

/**
 * Get the extra heat modifier from an event card.
 */
export function getEventHeatModifier(event: EventCard | null): number {
  if (!event) return 0;
  return event.effect.type === 'extra-heat' ? event.effect.amount : 0;
}

/**
 * Check if the event reverses the normal championship grid order.
 * Normally, championship grid is reverse standings (leader starts last).
 * With 'reverse-grid' event, leader starts first (normal standings order).
 */
export function isReverseGridEvent(event: EventCard | null): boolean {
  if (!event) return false;
  return event.effect.type === 'reverse-grid';
}
