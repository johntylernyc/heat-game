/**
 * Weather and Road Condition token definitions.
 *
 * Weather: 6 tokens, 1 drawn per race, affects all players.
 * Road Conditions: 12 tokens, shuffled, 1 placed per corner.
 */

import type { WeatherToken, RoadConditionToken } from '../types.js';

/**
 * The 6 weather tokens. One is drawn randomly at race start.
 *
 * Starting effects modify deck composition before the race begins.
 * Ongoing effects apply every round during the race.
 */
export const WEATHER_TOKENS: readonly WeatherToken[] = [
  {
    type: 'freezing-cold',
    name: 'Freezing Cold',
    startingEffect: { stressMod: -1, heatInDeck: 0, heatInDiscard: 0, heatInEngine: 0 },
    ongoingEffect: { cooldownMod: 1, noCooldown: false, noSlipstream: false, slipstreamRangeMod: 0 },
  },
  {
    type: 'heavy-rain',
    name: 'Heavy Rain',
    startingEffect: { stressMod: 1, heatInDeck: 0, heatInDiscard: 0, heatInEngine: 0 },
    ongoingEffect: { cooldownMod: 0, noCooldown: false, noSlipstream: false, slipstreamRangeMod: 2 },
  },
  {
    type: 'rain',
    name: 'Rain',
    startingEffect: { stressMod: 0, heatInDeck: 3, heatInDiscard: 0, heatInEngine: 0 },
    ongoingEffect: { cooldownMod: 1, noCooldown: false, noSlipstream: false, slipstreamRangeMod: 0 },
  },
  {
    type: 'fog',
    name: 'Fog',
    startingEffect: { stressMod: 0, heatInDeck: 0, heatInDiscard: 0, heatInEngine: 1 },
    ongoingEffect: { cooldownMod: 0, noCooldown: false, noSlipstream: true, slipstreamRangeMod: 0 },
  },
  {
    type: 'cloudy',
    name: 'Cloudy',
    startingEffect: { stressMod: -1, heatInDeck: 0, heatInDiscard: 0, heatInEngine: 0 },
    ongoingEffect: { cooldownMod: 0, noCooldown: true, noSlipstream: false, slipstreamRangeMod: 0 },
  },
  {
    type: 'sunny',
    name: 'Sunny',
    startingEffect: { stressMod: 0, heatInDeck: 0, heatInDiscard: 3, heatInEngine: 0 },
    ongoingEffect: { cooldownMod: 0, noCooldown: false, noSlipstream: false, slipstreamRangeMod: 2 },
  },
];

export const WEATHER_TOKEN_COUNT = 6;

/**
 * The 12 road condition tokens. Shuffled at race start, 1 placed per corner.
 *
 * Corner mods affect the corner directly (speed limit changes, extra Heat penalty).
 * Sector mods affect the stretch leading away from the corner.
 */
export const ROAD_CONDITION_TOKENS: readonly RoadConditionToken[] = [
  // Corner mods: speed limit adjustments
  { target: 'corner', modType: 'speed-plus-1' },
  { target: 'corner', modType: 'speed-plus-1' },
  { target: 'corner', modType: 'speed-minus-1' },
  { target: 'corner', modType: 'speed-minus-1' },
  // Corner mods: overheat (extra Heat penalty when exceeding speed limit)
  { target: 'corner', modType: 'overheat' },
  { target: 'corner', modType: 'overheat' },
  // Sector mods: slipstream boost (+1 extra spaces when slipstreaming)
  { target: 'sector', modType: 'slipstream-boost' },
  { target: 'sector', modType: 'slipstream-boost' },
  // Sector mods: free boost (boost costs no Heat from engine)
  { target: 'sector', modType: 'free-boost' },
  { target: 'sector', modType: 'free-boost' },
  // Sector mods: weather sector (spinout gives +1 extra stress)
  { target: 'sector', modType: 'weather-sector' },
  { target: 'sector', modType: 'weather-sector' },
];

export const ROAD_CONDITION_TOKEN_COUNT = 12;
