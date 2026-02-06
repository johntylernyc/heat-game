/**
 * Sponsorship cards — earned by pressing corners or slipstreaming across corners.
 *
 * Press Corner: passing a corner at speed 2+ over the speed limit.
 * Slipstream Across Corner: slipstreaming across a corner boundary.
 *
 * Max 1 sponsorship per corner per lap per player.
 * Sponsorship cards are single-use upgrades consumed in a future race.
 */

import type { SponsorshipCard, SponsorshipEarning } from './types.js';
import type { GameState, CornerDef } from '../types.js';
import { createRng } from '../deck.js';

// -- Sponsorship Card Pool --

export const SPONSORSHIP_CARDS: SponsorshipCard[] = [
  {
    id: 'sp-extra-cooldown',
    name: 'Pit Crew Excellence',
    description: 'Gain +1 cooldown slot for one race.',
    effect: { type: 'extra-cooldown', amount: 1 },
  },
  {
    id: 'sp-reduce-heat-1',
    name: 'Heat Shield',
    description: 'Reduce corner heat cost by 1 for one corner.',
    effect: { type: 'reduce-heat-cost', amount: 1 },
  },
  {
    id: 'sp-extra-speed-1',
    name: 'Turbo Boost',
    description: 'Gain +1 speed for one round.',
    effect: { type: 'extra-speed', amount: 1 },
  },
  {
    id: 'sp-free-shift',
    name: 'Smooth Operator',
    description: 'One free 2-gear shift (no heat cost).',
    effect: { type: 'free-gear-shift' },
  },
  {
    id: 'sp-slipstream-range',
    name: 'Aero Advantage',
    description: 'Gain +1 slipstream range for one round.',
    effect: { type: 'extra-slipstream-range', amount: 1 },
  },
  {
    id: 'sp-stress-shield',
    name: 'Nerve of Steel',
    description: 'Prevent 1 stress card from a spinout.',
    effect: { type: 'stress-shield' },
  },
];

/**
 * Draw a random sponsorship card from the pool.
 * Uses a deterministic RNG based on the seed.
 */
export function drawSponsorshipCard(seed: number): SponsorshipCard {
  const rng = createRng(seed);
  const index = Math.floor(rng() * SPONSORSHIP_CARDS.length);
  return { ...SPONSORSHIP_CARDS[index] };
}

/**
 * Check if a player pressed a corner (speed 2+ over the speed limit).
 *
 * @param speed - Player's speed this round (cards + boost + adrenaline, NOT slipstream)
 * @param speedLimit - Corner's effective speed limit
 * @returns true if pressed (speed >= speedLimit + 2)
 */
export function isPressCorner(speed: number, speedLimit: number): boolean {
  return speed >= speedLimit + 2;
}

/**
 * Check if a player slipstreamed across a corner boundary.
 *
 * A player slipstreams across a corner if their position before slipstream
 * was before the corner and their position after slipstream is at or past it.
 *
 * @param positionBeforeSlipstream - Player position before slipstream
 * @param positionAfterSlipstream - Player position after slipstream
 * @param cornerPosition - Corner position on the track
 * @param totalSpaces - Total track spaces (for wrapping)
 * @returns true if slipstream crossed the corner
 */
export function isSlipstreamAcrossCorner(
  positionBeforeSlipstream: number,
  positionAfterSlipstream: number,
  cornerPosition: number,
  totalSpaces: number,
): boolean {
  // Normalize positions for circular track
  const from = positionBeforeSlipstream % totalSpaces;
  const to = positionAfterSlipstream % totalSpaces;
  const corner = cornerPosition % totalSpaces;

  if (from <= to) {
    // No wrapping: corner must be in (from, to]
    return corner > from && corner <= to;
  } else {
    // Wrapping: corner in (from, totalSpaces) or [0, to]
    return corner > from || corner <= to;
  }
}

/**
 * Evaluate sponsorship eligibility after a race completes.
 *
 * Scans the race result to determine which players earned sponsorship cards.
 * In a real implementation, this would track per-round corner crossings.
 * Here we provide a simplified evaluation based on final race state.
 *
 * For the championship module, sponsorship tracking happens during race
 * execution via checkSponsorshipEarnings().
 *
 * @param state - Finished race GameState
 * @param corners - Corner definitions
 * @param earnedCorners - Map of cornerId -> Set of playerIds who already earned on this corner/lap
 * @param seed - RNG seed for card drawing
 * @returns Array of sponsorship earnings
 */
export function checkSponsorshipEarnings(
  playerSpeed: number,
  playerId: string,
  cornersCrossed: CornerDef[],
  earnedCorners: Map<string, Set<string>>,
  lapNumber: number,
  seed: number,
): SponsorshipEarning[] {
  const earnings: SponsorshipEarning[] = [];

  for (const corner of cornersCrossed) {
    const key = `${corner.id}-${lapNumber}`;
    const earned = earnedCorners.get(key) ?? new Set();

    if (earned.has(playerId)) continue; // Max 1 per corner per lap
    if (!isPressCorner(playerSpeed, corner.speedLimit)) continue;

    const cardSeed = seed + corner.id * 100 + lapNumber * 1000;
    const card = drawSponsorshipCard(cardSeed);
    earnings.push({
      playerId,
      cornerId: corner.id,
      lapNumber,
      reason: 'press-corner',
      card,
    });
    earned.add(playerId);
    earnedCorners.set(key, earned);
  }

  return earnings;
}

/**
 * Remove a sponsorship card from a player's collection (single-use consumption).
 *
 * @param cards - Current sponsorship cards
 * @param cardIndex - Index of the card to consume
 * @returns New array without the consumed card
 */
export function consumeSponsorshipCard(
  cards: SponsorshipCard[],
  cardIndex: number,
): SponsorshipCard[] {
  if (cardIndex < 0 || cardIndex >= cards.length) {
    throw new Error(`Invalid sponsorship card index: ${cardIndex}`);
  }
  return [...cards.slice(0, cardIndex), ...cards.slice(cardIndex + 1)];
}
