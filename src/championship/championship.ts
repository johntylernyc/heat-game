/**
 * Championship Mode — multi-race series state management.
 *
 * A championship is a series of 3-4 races where players accumulate points.
 * Between races, standings determine the starting grid (reverse order),
 * event cards add special rules, and players earn sponsorship cards.
 *
 * All transitions are pure functions returning new ChampionshipState.
 */

import type { TrackData } from '../track/types.js';
import type { GameState, WeatherToken, RoadConditionPlacement } from '../types.js';
import type { RaceStanding, GridOrder } from '../race.js';
import type {
  ChampionshipConfig,
  ChampionshipState,
  ChampionshipPlayerState,
  RaceResult,
  EventCard,
  SponsorshipCard,
} from './types.js';
import { setupRace, computeFinalStandings } from '../race.js';
import { drawWeatherToken } from '../weather/weather.js';
import { placeRoadConditions } from '../weather/road-conditions.js';
import {
  scoreRace,
  computeChampionshipStandings,
  getStandingsOrder,
} from './scoring.js';
import {
  drawEventCard,
  getEventLapModifier,
  getEventStressModifier,
  getEventHeatModifier,
  isReverseGridEvent,
} from './events.js';

/**
 * Initialize a new championship.
 *
 * @param config - Championship configuration (players, tracks, options)
 * @returns Initial ChampionshipState in 'pre-race' phase for race 0
 */
export function initChampionship(config: ChampionshipConfig): ChampionshipState {
  const { playerIds, tracks, seed } = config;

  if (playerIds.length < 2) {
    throw new Error('Championship requires at least 2 players');
  }
  if (tracks.length < 3 || tracks.length > 4) {
    throw new Error(`Championship requires 3-4 tracks, got ${tracks.length}`);
  }

  // Validate all tracks can support the player count
  for (const track of tracks) {
    if (playerIds.length > track.startingGrid.length) {
      throw new Error(
        `Track "${track.name}" supports up to ${track.startingGrid.length} players, got ${playerIds.length}`,
      );
    }
  }

  const players: ChampionshipPlayerState[] = playerIds.map(id => ({
    playerId: id,
    totalPoints: 0,
    raceResults: [],
    sponsorshipCards: [],
  }));

  // Draw initial event card for race 0
  const eventSeed = seed + 5000;
  const eventCard = drawEventCard([], eventSeed);

  // Draw weather if enabled
  let currentWeather: WeatherToken | null = null;
  if (config.useWeatherModule) {
    currentWeather = drawWeatherToken(seed + 6000);
  }

  // Place road conditions if enabled
  let currentRoadConditions: RoadConditionPlacement[] | null = null;
  if (config.useRoadConditions) {
    const cornerIds = tracks[0].corners.map(c => c.id);
    currentRoadConditions = placeRoadConditions(cornerIds, seed + 7000);
  }

  return {
    config,
    players,
    currentRaceIndex: 0,
    totalRaces: tracks.length,
    phase: 'pre-race',
    activeEventCard: eventCard,
    usedEventCards: eventCard ? [eventCard] : [],
    standings: playerIds, // Initial order (no standings yet)
    seed,
    currentWeather,
    currentRoadConditions,
  };
}

/**
 * Start the current race — transitions from 'pre-race' to 'racing'.
 *
 * Sets up the race GameState using the current track, event card effects,
 * weather, road conditions, and championship grid order.
 *
 * @param championship - Current championship state (must be in 'pre-race' phase)
 * @returns Object with updated championship and the new race GameState
 */
export function startRace(championship: ChampionshipState): {
  championship: ChampionshipState;
  raceState: GameState;
} {
  if (championship.phase !== 'pre-race') {
    throw new Error(`Cannot start race in phase '${championship.phase}'`);
  }

  const { config, currentRaceIndex, activeEventCard } = championship;
  const track = config.tracks[currentRaceIndex];
  const raceSeed = championship.seed + currentRaceIndex * 10000;

  // Determine laps (with event modifier)
  const baseLaps = config.lapsPerRace ?? track.defaultConfig.laps;
  const lapMod = getEventLapModifier(activeEventCard);
  const laps = Math.max(1, baseLaps + lapMod);

  // Determine stress count (with event modifier)
  const baseStress = track.defaultConfig.startingStress;
  const stressMod = getEventStressModifier(activeEventCard);
  const stressCount = Math.max(0, baseStress + stressMod);

  // Determine grid order
  let gridOrder: GridOrder;
  if (currentRaceIndex === 0) {
    // First race: random grid
    gridOrder = { type: 'random' };
  } else if (isReverseGridEvent(activeEventCard)) {
    // Reverse-grid event: leader starts first (use standings directly as grid)
    gridOrder = { type: 'championship', standings: [...championship.standings].reverse() };
  } else {
    // Normal championship: reverse standings (leader starts last)
    gridOrder = { type: 'championship', standings: championship.standings };
  }

  const raceState = setupRace({
    playerIds: config.playerIds,
    track,
    laps,
    stressCount,
    seed: raceSeed,
    gridOrder,
    weather: championship.currentWeather ?? undefined,
    roadConditions: championship.currentRoadConditions ?? undefined,
  });

  return {
    championship: { ...championship, phase: 'racing' },
    raceState,
  };
}

/**
 * Complete the current race — transitions from 'racing' to 'post-race'.
 *
 * Processes the finished race state: computes standings, awards points,
 * and prepares sponsorship card earnings.
 *
 * @param championship - Current championship state (must be in 'racing' phase)
 * @param finishedRaceState - The completed race GameState (must be 'finished')
 * @returns Updated championship in 'post-race' phase
 */
export function completeRace(
  championship: ChampionshipState,
  finishedRaceState: GameState,
): ChampionshipState {
  if (championship.phase !== 'racing') {
    throw new Error(`Cannot complete race in phase '${championship.phase}'`);
  }
  if (finishedRaceState.raceStatus !== 'finished') {
    throw new Error(`Race is not finished (status: ${finishedRaceState.raceStatus})`);
  }

  const { currentRaceIndex, activeEventCard, config } = championship;
  const track = config.tracks[currentRaceIndex];

  // Compute race results
  const raceStandings = computeFinalStandings(finishedRaceState);
  const raceResults = scoreRace(
    raceStandings,
    currentRaceIndex,
    track.id,
    activeEventCard,
  );

  // Update player states with results and points
  const updatedPlayers = championship.players.map(player => {
    const standing = raceStandings.find(s => s.playerId === player.playerId);
    if (!standing) return player;

    const result = raceResults.find(
      (_, i) => raceStandings[i].playerId === player.playerId,
    );
    if (!result) return player;

    return {
      ...player,
      totalPoints: player.totalPoints + result.points,
      raceResults: [...player.raceResults, result],
    };
  });

  // Compute new standings
  const standings = getStandingsOrder(updatedPlayers);

  return {
    ...championship,
    players: updatedPlayers,
    standings,
    phase: 'post-race',
  };
}

/**
 * Award sponsorship cards to specific players.
 *
 * Called during 'post-race' to grant cards earned during the race.
 *
 * @param championship - Current championship state (must be in 'post-race' phase)
 * @param awards - Map of playerId -> SponsorshipCard[] to award
 * @returns Updated championship with sponsorship cards added
 */
export function awardSponsorships(
  championship: ChampionshipState,
  awards: Map<string, SponsorshipCard[]>,
): ChampionshipState {
  if (championship.phase !== 'post-race') {
    throw new Error(`Cannot award sponsorships in phase '${championship.phase}'`);
  }

  const updatedPlayers = championship.players.map(player => {
    const newCards = awards.get(player.playerId);
    if (!newCards || newCards.length === 0) return player;
    return {
      ...player,
      sponsorshipCards: [...player.sponsorshipCards, ...newCards],
    };
  });

  return { ...championship, players: updatedPlayers };
}

/**
 * Advance from 'post-race' to 'between-races' or 'finished'.
 *
 * If all races are complete, transitions to 'finished'.
 * Otherwise, transitions to 'between-races'.
 *
 * @param championship - Current championship state (must be in 'post-race' phase)
 * @returns Updated championship state
 */
export function advanceAfterRace(championship: ChampionshipState): ChampionshipState {
  if (championship.phase !== 'post-race') {
    throw new Error(`Cannot advance in phase '${championship.phase}'`);
  }

  const nextRaceIndex = championship.currentRaceIndex + 1;

  if (nextRaceIndex >= championship.totalRaces) {
    return { ...championship, phase: 'finished' };
  }

  return { ...championship, phase: 'between-races' };
}

/**
 * Prepare the next race — transitions from 'between-races' to 'pre-race'.
 *
 * Advances to the next race, draws a new event card, and sets up
 * weather and road conditions for the new track.
 *
 * @param championship - Current championship state (must be in 'between-races' phase)
 * @returns Updated championship in 'pre-race' phase for the next race
 */
export function prepareNextRace(championship: ChampionshipState): ChampionshipState {
  if (championship.phase !== 'between-races') {
    throw new Error(`Cannot prepare next race in phase '${championship.phase}'`);
  }

  const nextRaceIndex = championship.currentRaceIndex + 1;
  const { config, seed } = championship;
  const nextTrack = config.tracks[nextRaceIndex];

  // Draw event card (excluding used cards)
  const usedCardIds = championship.usedEventCards.map(c => c.id);
  const eventSeed = seed + 5000 + nextRaceIndex * 100;
  const eventCard = drawEventCard(usedCardIds, eventSeed);

  // Draw weather if enabled
  let currentWeather: WeatherToken | null = null;
  if (config.useWeatherModule) {
    currentWeather = drawWeatherToken(seed + 6000 + nextRaceIndex * 100);
  }

  // Place road conditions if enabled
  let currentRoadConditions: RoadConditionPlacement[] | null = null;
  if (config.useRoadConditions) {
    const cornerIds = nextTrack.corners.map(c => c.id);
    currentRoadConditions = placeRoadConditions(
      cornerIds,
      seed + 7000 + nextRaceIndex * 100,
    );
  }

  return {
    ...championship,
    currentRaceIndex: nextRaceIndex,
    phase: 'pre-race',
    activeEventCard: eventCard,
    usedEventCards: eventCard
      ? [...championship.usedEventCards, eventCard]
      : championship.usedEventCards,
    currentWeather,
    currentRoadConditions,
  };
}

/**
 * Get the final championship results.
 *
 * @param championship - Completed championship state (must be in 'finished' phase)
 * @returns Final standings with per-race breakdown
 */
export function getChampionshipResults(championship: ChampionshipState) {
  if (championship.phase !== 'finished') {
    throw new Error(`Championship is not finished (phase: ${championship.phase})`);
  }

  return computeChampionshipStandings(championship.players);
}

/**
 * Get the champion (winner) of the championship.
 *
 * @param championship - Completed championship state
 * @returns Player ID of the champion
 */
export function getChampion(championship: ChampionshipState): string {
  const results = getChampionshipResults(championship);
  return results[0].playerId;
}
