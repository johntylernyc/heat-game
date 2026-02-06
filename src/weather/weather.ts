/**
 * Weather system: drawing tokens and applying effects.
 *
 * Weather affects all players for the entire race:
 * - Starting effects modify deck composition (stress count, Heat placement)
 * - Ongoing effects modify cooldown, slipstream, and other mechanics each round
 */

import type { Card, Gear, PlayerState, WeatherToken } from '../types.js';
import { COOLDOWN_PER_GEAR } from '../types.js';
import { heatCard } from '../cards.js';
import { shuffle, createRng } from '../deck.js';
import { WEATHER_TOKENS } from './tokens.js';

/**
 * Draw a random weather token for the race.
 * Shuffles all 6 tokens and returns the first one.
 */
export function drawWeatherToken(seed: number): WeatherToken {
  const rng = createRng(seed);
  const shuffled = shuffle([...WEATHER_TOKENS], rng);
  return shuffled[0];
}

/**
 * Get the effective stress count after weather modification.
 * Ensures stress count never drops below 0.
 */
export function getWeatherStressCount(
  baseStress: number,
  weather: WeatherToken,
): number {
  return Math.max(0, baseStress + weather.startingEffect.stressMod);
}

/**
 * Apply weather starting effects to a player's deck composition.
 * Adds Heat cards to draw pile, discard pile, or engine zone as specified.
 *
 * Note: Stress count modification is handled separately via getWeatherStressCount
 * at deck build time.
 */
export function applyWeatherToPlayer(
  player: PlayerState,
  weather: WeatherToken,
  rng: () => number,
): PlayerState {
  const effect = weather.startingEffect;
  let drawPile = player.drawPile;
  let discardPile = player.discardPile;
  let engineZone = player.engineZone;

  if (effect.heatInDeck > 0) {
    const cards: Card[] = Array.from({ length: effect.heatInDeck }, () => heatCard());
    drawPile = shuffle([...drawPile, ...cards], rng);
  }

  if (effect.heatInDiscard > 0) {
    const cards: Card[] = Array.from({ length: effect.heatInDiscard }, () => heatCard());
    discardPile = [...discardPile, ...cards];
  }

  if (effect.heatInEngine > 0) {
    const cards: Card[] = Array.from({ length: effect.heatInEngine }, () => heatCard());
    engineZone = [...engineZone, ...cards];
  }

  if (drawPile === player.drawPile && discardPile === player.discardPile && engineZone === player.engineZone) {
    return player;
  }

  return { ...player, drawPile, discardPile, engineZone };
}

/**
 * Get effective cooldown slots for a gear, considering weather effects.
 * Adrenaline bonus is added separately by the caller.
 */
export function getEffectiveCooldown(
  gear: Gear,
  weather?: WeatherToken,
): number {
  if (weather?.ongoingEffect.noCooldown) return 0;
  const base = COOLDOWN_PER_GEAR[gear];
  const mod = weather?.ongoingEffect.cooldownMod ?? 0;
  return Math.max(0, base + mod);
}

/**
 * Check if slipstream is allowed under current weather.
 */
export function isSlipstreamAllowedByWeather(weather?: WeatherToken): boolean {
  if (!weather) return true;
  return !weather.ongoingEffect.noSlipstream;
}

/**
 * Get effective slipstream range considering weather.
 * Default range is 2 (eligible if 1-2 spaces behind another car).
 */
export function getEffectiveSlipstreamRange(weather?: WeatherToken): number {
  const base = 2;
  if (!weather) return base;
  return base + weather.ongoingEffect.slipstreamRangeMod;
}
