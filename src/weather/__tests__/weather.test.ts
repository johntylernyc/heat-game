import { describe, it, expect } from 'vitest';
import {
  WEATHER_TOKENS,
  WEATHER_TOKEN_COUNT,
  ROAD_CONDITION_TOKENS,
  ROAD_CONDITION_TOKEN_COUNT,
} from '../tokens.js';
import {
  drawWeatherToken,
  getWeatherStressCount,
  applyWeatherToPlayer,
  getEffectiveCooldown,
  isSlipstreamAllowedByWeather,
  getEffectiveSlipstreamRange,
} from '../weather.js';
import {
  placeRoadConditions,
  getEffectiveSpeedLimit,
  getCornerOverheatPenalty,
  findSectorStartCorner,
  isInFreeBoostSector,
  getSlipstreamSectorBonus,
  isInWeatherSector,
} from '../road-conditions.js';
import type {
  PlayerState,
  Gear,
  WeatherToken,
  CornerDef,
  RoadConditionPlacement,
} from '../../types.js';
import { createRng } from '../../deck.js';
import { buildStartingDeck, buildEngineZone } from '../../cards.js';
import { setupRace } from '../../race.js';
import { usaTrack } from '../../track/tracks/usa.js';
import {
  executeCooldown,
  executeSlipstream,
  executeCheckCorner,
  executeBoost,
  initGame,
  executeGearShiftPhase,
  executePlayCardsPhase,
  executeRevealAndMove,
  executeAdrenaline,
  endReactPhase,
  isSlipstreamEligible,
} from '../../engine.js';
import { HAND_SIZE, COOLDOWN_PER_GEAR } from '../../types.js';
import { drawCards, shuffle } from '../../deck.js';

// -- Test helpers --

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'test-player',
    gear: 1 as Gear,
    hand: [],
    drawPile: [],
    discardPile: [],
    engineZone: buildEngineZone(),
    position: 0,
    lapCount: 0,
    speed: 0,
    hasBoosted: false,
    adrenalineCooldownBonus: 0,
    playedCards: [],
    previousPosition: 0,
    ...overrides,
  };
}

function findWeather(type: string): WeatherToken {
  const token = WEATHER_TOKENS.find(t => t.type === type);
  if (!token) throw new Error(`Unknown weather type: ${type}`);
  return token;
}

const testCorners: CornerDef[] = [
  { id: 1, speedLimit: 5, position: 16 },
  { id: 2, speedLimit: 3, position: 28 },
  { id: 3, speedLimit: 4, position: 39 },
];

// -- Token Definitions --

describe('Weather Tokens', () => {
  it('defines exactly 6 weather tokens', () => {
    expect(WEATHER_TOKENS).toHaveLength(WEATHER_TOKEN_COUNT);
    expect(WEATHER_TOKEN_COUNT).toBe(6);
  });

  it('has all 6 weather types', () => {
    const types = WEATHER_TOKENS.map(t => t.type);
    expect(types).toContain('freezing-cold');
    expect(types).toContain('heavy-rain');
    expect(types).toContain('rain');
    expect(types).toContain('fog');
    expect(types).toContain('cloudy');
    expect(types).toContain('sunny');
  });

  it('each token has a name', () => {
    for (const token of WEATHER_TOKENS) {
      expect(token.name.length).toBeGreaterThan(0);
    }
  });

  it('each token has starting and ongoing effects', () => {
    for (const token of WEATHER_TOKENS) {
      expect(token.startingEffect).toBeDefined();
      expect(token.ongoingEffect).toBeDefined();
    }
  });
});

describe('Road Condition Tokens', () => {
  it('defines exactly 12 road condition tokens', () => {
    expect(ROAD_CONDITION_TOKENS).toHaveLength(ROAD_CONDITION_TOKEN_COUNT);
    expect(ROAD_CONDITION_TOKEN_COUNT).toBe(12);
  });

  it('has 6 corner mods and 6 sector mods', () => {
    const cornerMods = ROAD_CONDITION_TOKENS.filter(t => t.target === 'corner');
    const sectorMods = ROAD_CONDITION_TOKENS.filter(t => t.target === 'sector');
    expect(cornerMods).toHaveLength(6);
    expect(sectorMods).toHaveLength(6);
  });

  it('has correct corner mod distribution', () => {
    const cornerMods = ROAD_CONDITION_TOKENS.filter(t => t.target === 'corner');
    const speedPlus = cornerMods.filter(t => t.modType === 'speed-plus-1');
    const speedMinus = cornerMods.filter(t => t.modType === 'speed-minus-1');
    const overheat = cornerMods.filter(t => t.modType === 'overheat');
    expect(speedPlus).toHaveLength(2);
    expect(speedMinus).toHaveLength(2);
    expect(overheat).toHaveLength(2);
  });

  it('has correct sector mod distribution', () => {
    const sectorMods = ROAD_CONDITION_TOKENS.filter(t => t.target === 'sector');
    const slipstream = sectorMods.filter(t => t.modType === 'slipstream-boost');
    const freeBoost = sectorMods.filter(t => t.modType === 'free-boost');
    const weather = sectorMods.filter(t => t.modType === 'weather-sector');
    expect(slipstream).toHaveLength(2);
    expect(freeBoost).toHaveLength(2);
    expect(weather).toHaveLength(2);
  });
});

// -- Weather Drawing --

describe('drawWeatherToken', () => {
  it('returns a valid weather token', () => {
    const token = drawWeatherToken(42);
    expect(WEATHER_TOKENS).toContainEqual(token);
  });

  it('is deterministic with same seed', () => {
    const token1 = drawWeatherToken(42);
    const token2 = drawWeatherToken(42);
    expect(token1).toEqual(token2);
  });

  it('different seeds can produce different tokens', () => {
    const results = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      results.add(drawWeatherToken(seed).type);
    }
    // With 100 seeds and 6 tokens, we should see multiple types
    expect(results.size).toBeGreaterThan(1);
  });
});

// -- Weather Starting Effects --

describe('getWeatherStressCount', () => {
  it('reduces stress for Freezing Cold (-1)', () => {
    const weather = findWeather('freezing-cold');
    expect(getWeatherStressCount(3, weather)).toBe(2);
  });

  it('increases stress for Heavy Rain (+1)', () => {
    const weather = findWeather('heavy-rain');
    expect(getWeatherStressCount(3, weather)).toBe(4);
  });

  it('no change for Rain (0)', () => {
    const weather = findWeather('rain');
    expect(getWeatherStressCount(3, weather)).toBe(3);
  });

  it('clamps to 0 (never negative)', () => {
    const weather = findWeather('freezing-cold');
    expect(getWeatherStressCount(0, weather)).toBe(0);
  });
});

describe('applyWeatherToPlayer', () => {
  it('Rain adds 3 Heat cards to draw pile', () => {
    const weather = findWeather('rain');
    const rng = createRng(42);
    const deck = buildStartingDeck(3);
    const player = makePlayer({
      drawPile: deck,
    });

    const updated = applyWeatherToPlayer(player, weather, rng);
    const heatInDraw = updated.drawPile.filter(c => c.type === 'heat').length;
    const originalHeat = deck.filter(c => c.type === 'heat').length;
    expect(heatInDraw).toBe(originalHeat + 3);
  });

  it('Sunny adds 3 Heat cards to discard pile', () => {
    const weather = findWeather('sunny');
    const rng = createRng(42);
    const player = makePlayer();

    const updated = applyWeatherToPlayer(player, weather, rng);
    const heatInDiscard = updated.discardPile.filter(c => c.type === 'heat').length;
    expect(heatInDiscard).toBe(3);
  });

  it('Fog adds 1 Heat card to engine zone', () => {
    const weather = findWeather('fog');
    const rng = createRng(42);
    const player = makePlayer(); // 6 Heat in engine

    const updated = applyWeatherToPlayer(player, weather, rng);
    expect(updated.engineZone).toHaveLength(7);
    expect(updated.engineZone.every(c => c.type === 'heat')).toBe(true);
  });

  it('returns unchanged player for no-effect weather', () => {
    const weather = findWeather('freezing-cold'); // Only stressMod, no Heat placement
    const rng = createRng(42);
    const player = makePlayer();

    const updated = applyWeatherToPlayer(player, weather, rng);
    expect(updated).toBe(player); // Same reference, no change
  });
});

// -- Weather Ongoing Effects --

describe('getEffectiveCooldown', () => {
  it('returns base cooldown when no weather', () => {
    expect(getEffectiveCooldown(1 as Gear)).toBe(COOLDOWN_PER_GEAR[1]);
    expect(getEffectiveCooldown(2 as Gear)).toBe(COOLDOWN_PER_GEAR[2]);
    expect(getEffectiveCooldown(3 as Gear)).toBe(COOLDOWN_PER_GEAR[3]);
    expect(getEffectiveCooldown(4 as Gear)).toBe(COOLDOWN_PER_GEAR[4]);
  });

  it('adds +1 cooldown for Freezing Cold', () => {
    const weather = findWeather('freezing-cold');
    expect(getEffectiveCooldown(1 as Gear, weather)).toBe(4); // 3 + 1
    expect(getEffectiveCooldown(2 as Gear, weather)).toBe(2); // 1 + 1
    expect(getEffectiveCooldown(3 as Gear, weather)).toBe(1); // 0 + 1
    expect(getEffectiveCooldown(4 as Gear, weather)).toBe(1); // 0 + 1
  });

  it('adds +1 cooldown for Rain', () => {
    const weather = findWeather('rain');
    expect(getEffectiveCooldown(1 as Gear, weather)).toBe(4); // 3 + 1
  });

  it('returns 0 for Cloudy (no cooldown)', () => {
    const weather = findWeather('cloudy');
    expect(getEffectiveCooldown(1 as Gear, weather)).toBe(0);
    expect(getEffectiveCooldown(2 as Gear, weather)).toBe(0);
    expect(getEffectiveCooldown(3 as Gear, weather)).toBe(0);
    expect(getEffectiveCooldown(4 as Gear, weather)).toBe(0);
  });

  it('never returns negative', () => {
    for (const gear of [1, 2, 3, 4] as Gear[]) {
      for (const weather of WEATHER_TOKENS) {
        expect(getEffectiveCooldown(gear, weather)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('isSlipstreamAllowedByWeather', () => {
  it('returns true when no weather', () => {
    expect(isSlipstreamAllowedByWeather()).toBe(true);
  });

  it('returns true for most weather types', () => {
    expect(isSlipstreamAllowedByWeather(findWeather('sunny'))).toBe(true);
    expect(isSlipstreamAllowedByWeather(findWeather('rain'))).toBe(true);
    expect(isSlipstreamAllowedByWeather(findWeather('heavy-rain'))).toBe(true);
    expect(isSlipstreamAllowedByWeather(findWeather('freezing-cold'))).toBe(true);
    expect(isSlipstreamAllowedByWeather(findWeather('cloudy'))).toBe(true);
  });

  it('returns false for Fog', () => {
    expect(isSlipstreamAllowedByWeather(findWeather('fog'))).toBe(false);
  });
});

describe('getEffectiveSlipstreamRange', () => {
  it('returns 2 when no weather', () => {
    expect(getEffectiveSlipstreamRange()).toBe(2);
  });

  it('returns 4 for Heavy Rain (+2)', () => {
    expect(getEffectiveSlipstreamRange(findWeather('heavy-rain'))).toBe(4);
  });

  it('returns 4 for Sunny (+2)', () => {
    expect(getEffectiveSlipstreamRange(findWeather('sunny'))).toBe(4);
  });

  it('returns 2 for Rain (no slipstream mod)', () => {
    expect(getEffectiveSlipstreamRange(findWeather('rain'))).toBe(2);
  });
});

// -- Road Condition Placement --

describe('placeRoadConditions', () => {
  it('places one token per corner', () => {
    const cornerIds = [1, 2, 3];
    const placements = placeRoadConditions(cornerIds, 42);
    expect(placements).toHaveLength(3);
    expect(placements.map(p => p.cornerId)).toEqual([1, 2, 3]);
  });

  it('is deterministic with same seed', () => {
    const cornerIds = [1, 2, 3];
    const p1 = placeRoadConditions(cornerIds, 42);
    const p2 = placeRoadConditions(cornerIds, 42);
    expect(p1).toEqual(p2);
  });

  it('different seeds can produce different placements', () => {
    const cornerIds = [1, 2, 3];
    const p1 = placeRoadConditions(cornerIds, 1);
    const p2 = placeRoadConditions(cornerIds, 999);
    const types1 = p1.map(p => `${p.token.target}:${p.token.modType}`).join(',');
    const types2 = p2.map(p => `${p.token.target}:${p.token.modType}`).join(',');
    // With different seeds, placement should differ (with very high probability)
    expect(types1).not.toBe(types2);
  });

  it('each placement has a valid token', () => {
    const cornerIds = [1, 2, 3, 4, 5];
    const placements = placeRoadConditions(cornerIds, 42);
    for (const p of placements) {
      expect(['corner', 'sector']).toContain(p.token.target);
      if (p.token.target === 'corner') {
        expect(['speed-plus-1', 'speed-minus-1', 'overheat']).toContain(p.token.modType);
      } else {
        expect(['slipstream-boost', 'free-boost', 'weather-sector']).toContain(p.token.modType);
      }
    }
  });
});

// -- Effective Speed Limits --

describe('getEffectiveSpeedLimit', () => {
  const corner: CornerDef = { id: 1, speedLimit: 5, position: 16 };

  it('returns base speed limit when no road conditions', () => {
    expect(getEffectiveSpeedLimit(corner)).toBe(5);
    expect(getEffectiveSpeedLimit(corner, undefined)).toBe(5);
  });

  it('returns base speed limit when corner has no condition', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 2, token: { target: 'corner', modType: 'speed-plus-1' } },
    ];
    expect(getEffectiveSpeedLimit(corner, placements)).toBe(5);
  });

  it('adds +1 for speed-plus-1', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'speed-plus-1' } },
    ];
    expect(getEffectiveSpeedLimit(corner, placements)).toBe(6);
  });

  it('subtracts -1 for speed-minus-1', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'speed-minus-1' } },
    ];
    expect(getEffectiveSpeedLimit(corner, placements)).toBe(4);
  });

  it('clamps speed limit to minimum 1', () => {
    const slowCorner: CornerDef = { id: 1, speedLimit: 1, position: 16 };
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'speed-minus-1' } },
    ];
    expect(getEffectiveSpeedLimit(slowCorner, placements)).toBe(1);
  });

  it('returns base for overheat (speed limit unchanged)', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'overheat' } },
    ];
    expect(getEffectiveSpeedLimit(corner, placements)).toBe(5);
  });

  it('ignores sector mods', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'sector', modType: 'free-boost' } },
    ];
    expect(getEffectiveSpeedLimit(corner, placements)).toBe(5);
  });
});

// -- Overheat Penalty --

describe('getCornerOverheatPenalty', () => {
  it('returns 0 when no road conditions', () => {
    expect(getCornerOverheatPenalty(1)).toBe(0);
  });

  it('returns 0 when corner has no condition', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 2, token: { target: 'corner', modType: 'overheat' } },
    ];
    expect(getCornerOverheatPenalty(1, placements)).toBe(0);
  });

  it('returns 1 for overheat condition', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'overheat' } },
    ];
    expect(getCornerOverheatPenalty(1, placements)).toBe(1);
  });

  it('returns 0 for non-overheat corner mods', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'speed-plus-1' } },
    ];
    expect(getCornerOverheatPenalty(1, placements)).toBe(0);
  });

  it('returns 0 for sector mods', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'sector', modType: 'free-boost' } },
    ];
    expect(getCornerOverheatPenalty(1, placements)).toBe(0);
  });
});

// -- Sector Detection --

describe('findSectorStartCorner', () => {
  const corners = testCorners;
  const totalSpaces = 48;

  it('returns corner 1 for position in sector after corner 1', () => {
    expect(findSectorStartCorner(17, corners, totalSpaces)).toBe(1);
    expect(findSectorStartCorner(20, corners, totalSpaces)).toBe(1);
    expect(findSectorStartCorner(28, corners, totalSpaces)).toBe(1);
  });

  it('returns corner 2 for position in sector after corner 2', () => {
    expect(findSectorStartCorner(29, corners, totalSpaces)).toBe(2);
    expect(findSectorStartCorner(35, corners, totalSpaces)).toBe(2);
    expect(findSectorStartCorner(39, corners, totalSpaces)).toBe(2);
  });

  it('returns corner 3 for position in sector after corner 3 (wrapping)', () => {
    expect(findSectorStartCorner(40, corners, totalSpaces)).toBe(3);
    expect(findSectorStartCorner(47, corners, totalSpaces)).toBe(3);
    expect(findSectorStartCorner(0, corners, totalSpaces)).toBe(3);
    expect(findSectorStartCorner(10, corners, totalSpaces)).toBe(3);
    expect(findSectorStartCorner(16, corners, totalSpaces)).toBe(3);
  });

  it('returns null for empty corners', () => {
    expect(findSectorStartCorner(10, [], totalSpaces)).toBeNull();
  });
});

// -- Sector Effects --

describe('isInFreeBoostSector', () => {
  const corners = testCorners;
  const totalSpaces = 48;

  it('returns false when no road conditions', () => {
    expect(isInFreeBoostSector(20, corners, totalSpaces)).toBe(false);
  });

  it('returns true when in a free-boost sector', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'sector', modType: 'free-boost' } },
    ];
    expect(isInFreeBoostSector(20, corners, totalSpaces, placements)).toBe(true);
  });

  it('returns false when in a different sector', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 2, token: { target: 'sector', modType: 'free-boost' } },
    ];
    // Position 20 is in sector after corner 1, not corner 2
    expect(isInFreeBoostSector(20, corners, totalSpaces, placements)).toBe(false);
  });

  it('returns false for corner mods', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'speed-plus-1' } },
    ];
    expect(isInFreeBoostSector(20, corners, totalSpaces, placements)).toBe(false);
  });
});

describe('getSlipstreamSectorBonus', () => {
  const corners = testCorners;
  const totalSpaces = 48;

  it('returns 0 when no road conditions', () => {
    expect(getSlipstreamSectorBonus(20, corners, totalSpaces)).toBe(0);
  });

  it('returns 1 when in a slipstream-boost sector', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'sector', modType: 'slipstream-boost' } },
    ];
    expect(getSlipstreamSectorBonus(20, corners, totalSpaces, placements)).toBe(1);
  });

  it('returns 0 in a sector without slipstream-boost', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'sector', modType: 'free-boost' } },
    ];
    expect(getSlipstreamSectorBonus(20, corners, totalSpaces, placements)).toBe(0);
  });
});

describe('isInWeatherSector', () => {
  const corners = testCorners;
  const totalSpaces = 48;

  it('returns true when in a weather-sector', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 2, token: { target: 'sector', modType: 'weather-sector' } },
    ];
    expect(isInWeatherSector(30, corners, totalSpaces, placements)).toBe(true);
  });

  it('returns false when not in a weather-sector', () => {
    const placements: RoadConditionPlacement[] = [
      { cornerId: 2, token: { target: 'sector', modType: 'weather-sector' } },
    ];
    expect(isInWeatherSector(20, corners, totalSpaces, placements)).toBe(false);
  });
});

// -- isSlipstreamEligible with range --

describe('isSlipstreamEligible with range', () => {
  it('default range is 2', () => {
    expect(isSlipstreamEligible(10, [12], 48)).toBe(true);
    expect(isSlipstreamEligible(10, [13], 48)).toBe(false);
  });

  it('extended range of 4 includes further cars', () => {
    expect(isSlipstreamEligible(10, [14], 48, 4)).toBe(true);
    expect(isSlipstreamEligible(10, [13], 48, 4)).toBe(true);
    expect(isSlipstreamEligible(10, [15], 48, 4)).toBe(false);
  });
});

// -- Race Setup Integration --

describe('setupRace with weather', () => {
  it('applies weather stress modification', () => {
    const weather = findWeather('freezing-cold'); // -1 stress
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      weather,
    });

    // Default stress is 3, Freezing Cold reduces by 1 → 2
    for (const player of state.players) {
      const allCards = [...player.hand, ...player.drawPile, ...player.discardPile];
      const stressCards = allCards.filter(c => c.type === 'stress');
      expect(stressCards).toHaveLength(2);
    }
  });

  it('applies weather Heat in deck (Rain)', () => {
    const weather = findWeather('rain');
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      weather,
    });

    // Rain adds 3 Heat to draw pile
    for (const player of state.players) {
      const allCards = [...player.hand, ...player.drawPile, ...player.discardPile];
      const heatCards = allCards.filter(c => c.type === 'heat');
      expect(heatCards).toHaveLength(3); // 3 from Rain (engine Heat is separate)
    }
  });

  it('applies weather Heat in discard (Sunny)', () => {
    const weather = findWeather('sunny');
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      weather,
    });

    for (const player of state.players) {
      const heatInDiscard = player.discardPile.filter(c => c.type === 'heat');
      expect(heatInDiscard).toHaveLength(3);
    }
  });

  it('applies weather Heat in engine (Fog)', () => {
    const weather = findWeather('fog');
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      weather,
    });

    for (const player of state.players) {
      expect(player.engineZone).toHaveLength(7); // 6 base + 1 from Fog
    }
  });

  it('stores weather in game state', () => {
    const weather = findWeather('rain');
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      weather,
    });

    expect(state.weather).toEqual(weather);
  });

  it('no weather means undefined in state', () => {
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
    });

    expect(state.weather).toBeUndefined();
  });
});

describe('setupRace with road conditions', () => {
  it('places road conditions when useRoadConditions is true', () => {
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      useRoadConditions: true,
    });

    expect(state.roadConditions).toBeDefined();
    expect(state.roadConditions).toHaveLength(usaTrack.corners.length);
  });

  it('uses pre-determined road conditions when provided', () => {
    const customConditions: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'speed-plus-1' } },
      { cornerId: 2, token: { target: 'sector', modType: 'free-boost' } },
      { cornerId: 3, token: { target: 'corner', modType: 'overheat' } },
    ];

    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      roadConditions: customConditions,
    });

    expect(state.roadConditions).toEqual(customConditions);
  });

  it('no road conditions by default', () => {
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
    });

    expect(state.roadConditions).toBeUndefined();
  });
});

// -- Engine Integration Tests --

describe('engine integration: weather cooldown', () => {
  it('Cloudy weather prevents cooldown', () => {
    const weather = findWeather('cloudy');
    const rng = createRng(42);
    const deck = shuffle(buildStartingDeck(3), rng);
    const player = makePlayer({
      id: 'p1',
      gear: 1 as Gear,
      hand: [{ type: 'heat' }, { type: 'heat' }, ...deck.slice(0, 5)],
      drawPile: deck.slice(5),
    });

    const state = {
      players: [player, makePlayer({ id: 'p2' })],
      round: 1,
      phase: 'react' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners: [],
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      weather,
    };

    // Should throw because cooldown limit is 0 under Cloudy weather
    expect(() =>
      executeCooldown(state, { type: 'cooldown', playerIndex: 0, heatIndices: [0] }),
    ).toThrow(/Cooldown limit is 0/);
  });

  it('Freezing Cold weather adds +1 cooldown', () => {
    const weather = findWeather('freezing-cold');
    const player = makePlayer({
      id: 'p1',
      gear: 2 as Gear, // Base cooldown = 1
      hand: [
        { type: 'heat' }, { type: 'heat' }, // 2 heat cards
        { type: 'speed', value: 1 }, { type: 'speed', value: 2 },
        { type: 'speed', value: 3 }, { type: 'speed', value: 4 },
        { type: 'speed', value: 1 },
      ],
      drawPile: [],
    });

    const state = {
      players: [player, makePlayer({ id: 'p2' })],
      round: 1,
      phase: 'react' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners: [],
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      weather,
    };

    // Gear 2 base = 1, +1 from weather = 2 cooldown slots
    const result = executeCooldown(state, {
      type: 'cooldown',
      playerIndex: 0,
      heatIndices: [0, 1], // Cool 2 heat cards
    });
    expect(result.players[0].hand).toHaveLength(5); // 7 - 2
    expect(result.players[0].engineZone).toHaveLength(8); // 6 + 2
  });
});

describe('engine integration: weather slipstream', () => {
  it('Fog weather prevents slipstream', () => {
    const weather = findWeather('fog');
    const player = makePlayer({ id: 'p1', position: 10, speed: 5 });
    const other = makePlayer({ id: 'p2', position: 11 });

    const state = {
      players: [player, other],
      round: 1,
      phase: 'slipstream' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners: [],
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      weather,
    };

    expect(() =>
      executeSlipstream(state, { type: 'slipstream', playerIndex: 0, accept: true }),
    ).toThrow('Slipstream is disabled by weather');
  });

  it('Heavy Rain weather extends slipstream range to 4', () => {
    const weather = findWeather('heavy-rain');
    const player = makePlayer({ id: 'p1', position: 10, speed: 5 });
    const other = makePlayer({ id: 'p2', position: 14 }); // 4 spaces ahead

    const state = {
      players: [player, other],
      round: 1,
      phase: 'slipstream' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners: [],
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      weather,
    };

    // 4 spaces ahead is within the extended range of 4
    const result = executeSlipstream(state, {
      type: 'slipstream',
      playerIndex: 0,
      accept: true,
    });
    expect(result.players[0].position).toBe(12); // 10 + 2
  });
});

describe('engine integration: road condition corner checks', () => {
  it('speed-plus-1 raises effective speed limit', () => {
    const corner: CornerDef = { id: 1, speedLimit: 3, position: 10 };
    const roadConditions: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'speed-plus-1' } },
    ];

    const player = makePlayer({
      id: 'p1',
      speed: 4, // Would exceed base limit of 3, but effective is 4
      position: 12,
      previousPosition: 5,
    });

    const state = {
      players: [player, makePlayer({ id: 'p2' })],
      round: 1,
      phase: 'check-corner' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners: [corner],
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      roadConditions,
    };

    const result = executeCheckCorner(state, 0);
    // Speed 4 == effective limit 4 → no Heat penalty
    expect(result.players[0].engineZone).toHaveLength(6); // Unchanged
  });

  it('overheat adds +1 extra Heat penalty', () => {
    const corner: CornerDef = { id: 1, speedLimit: 3, position: 10 };
    const roadConditions: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'corner', modType: 'overheat' } },
    ];

    const player = makePlayer({
      id: 'p1',
      speed: 4, // Exceeds by 1, but overheat adds +1 → pay 2
      position: 12,
      previousPosition: 5,
    });

    const state = {
      players: [player, makePlayer({ id: 'p2' })],
      round: 1,
      phase: 'check-corner' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners: [corner],
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      roadConditions,
    };

    const result = executeCheckCorner(state, 0);
    // Overspeed 1 + overheat 1 = 2 Heat paid
    expect(result.players[0].engineZone).toHaveLength(4); // 6 - 2
    expect(result.players[0].discardPile).toHaveLength(2);
  });
});

describe('engine integration: road condition sector effects', () => {
  it('free-boost sector allows boost without paying Heat', () => {
    const corners = testCorners;
    const roadConditions: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'sector', modType: 'free-boost' } },
    ];
    const rng = createRng(42);

    const player = makePlayer({
      id: 'p1',
      position: 20, // In sector after corner 1 (position 16-28)
      speed: 5,
      drawPile: [
        { type: 'speed', value: 3 },
        { type: 'speed', value: 2 },
        { type: 'heat' },
      ],
    });

    const state = {
      players: [player, makePlayer({ id: 'p2' })],
      round: 1,
      phase: 'react' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners,
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      roadConditions,
    };

    const result = executeBoost(state, { type: 'boost', playerIndex: 0 }, rng);
    // Engine zone should be unchanged (no Heat paid for boost)
    expect(result.players[0].engineZone).toHaveLength(6);
    expect(result.players[0].hasBoosted).toBe(true);
  });

  it('slipstream-boost sector adds +1 to slipstream distance', () => {
    const corners = testCorners;
    const roadConditions: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'sector', modType: 'slipstream-boost' } },
    ];

    const player = makePlayer({
      id: 'p1',
      position: 20, // In sector after corner 1
      speed: 5,
    });
    const other = makePlayer({
      id: 'p2',
      position: 21, // 1 space ahead
    });

    const state = {
      players: [player, other],
      round: 1,
      phase: 'slipstream' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners,
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      roadConditions,
    };

    const result = executeSlipstream(state, {
      type: 'slipstream',
      playerIndex: 0,
      accept: true,
    });
    // Normal slipstream = 2, + 1 sector bonus = 3
    expect(result.players[0].position).toBe(23); // 20 + 3
  });

  it('weather-sector adds +1 stress on spinout', () => {
    const corner: CornerDef = { id: 1, speedLimit: 3, position: 10 };
    const roadConditions: RoadConditionPlacement[] = [
      { cornerId: 1, token: { target: 'sector', modType: 'weather-sector' } },
    ];

    const player = makePlayer({
      id: 'p1',
      gear: 2 as Gear, // Spinout stress: 1
      speed: 10, // Way over limit
      position: 15,
      previousPosition: 5,
      engineZone: [], // No Heat to pay → spinout
    });

    const state = {
      players: [player, makePlayer({ id: 'p2' })],
      round: 1,
      phase: 'check-corner' as const,
      activePlayerIndex: 0,
      turnOrder: [0, 1],
      lapTarget: 1,
      raceStatus: 'racing' as const,
      corners: [corner],
      totalSpaces: 48,
      startFinishLine: 0,
      trackId: 'test',
      roadConditions,
    };

    const result = executeCheckCorner(state, 0);
    // Gear 2 spinout = 1 stress + 1 weather-sector = 2 stress cards
    const stressCards = result.players[0].discardPile.filter(c => c.type === 'stress');
    expect(stressCards).toHaveLength(2);
    expect(result.players[0].gear).toBe(1); // Reset to 1st
  });
});

// -- Combined Weather + Road Conditions --

describe('combined weather and road conditions', () => {
  it('setupRace applies both weather and road conditions', () => {
    const weather = findWeather('rain');
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      weather,
      useRoadConditions: true,
    });

    expect(state.weather).toEqual(weather);
    expect(state.roadConditions).toBeDefined();
    expect(state.roadConditions).toHaveLength(3);
  });

  it('Heavy Rain stress increase + road conditions', () => {
    const weather = findWeather('heavy-rain'); // +1 stress
    const state = setupRace({
      playerIds: ['p1', 'p2'],
      track: usaTrack,
      seed: 42,
      weather,
      roadConditions: [
        { cornerId: 1, token: { target: 'corner', modType: 'speed-minus-1' } },
        { cornerId: 2, token: { target: 'sector', modType: 'slipstream-boost' } },
        { cornerId: 3, token: { target: 'corner', modType: 'overheat' } },
      ],
    });

    // Default stress = 3 + 1 = 4
    for (const player of state.players) {
      const allCards = [...player.hand, ...player.drawPile, ...player.discardPile];
      const stressCards = allCards.filter(c => c.type === 'stress');
      expect(stressCards).toHaveLength(4);
    }

    // Verify road conditions stored
    expect(state.roadConditions).toHaveLength(3);
    expect(state.roadConditions![0].token.modType).toBe('speed-minus-1');
  });
});
