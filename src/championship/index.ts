/**
 * Championship Module — Multi-race series with point accumulation.
 */

// Types
export type {
  ChampionshipConfig,
  ChampionshipPhase,
  ChampionshipState,
  ChampionshipPlayerState,
  ChampionshipStanding,
  RaceResult,
  SponsorshipCard,
  SponsorshipEffect,
  SponsorshipEarning,
  EventCard,
  EventEffect,
} from './types.js';

// Championship lifecycle
export {
  initChampionship,
  startRace,
  completeRace,
  awardSponsorships,
  advanceAfterRace,
  prepareNextRace,
  getChampionshipResults,
  getChampion,
} from './championship.js';

// Scoring
export {
  calculatePoints,
  applyEventPointModifier,
  scoreRace,
  computeChampionshipStandings,
  getStandingsOrder,
} from './scoring.js';

// Sponsorship cards
export {
  SPONSORSHIP_CARDS,
  drawSponsorshipCard,
  isPressCorner,
  isSlipstreamAcrossCorner,
  checkSponsorshipEarnings,
  consumeSponsorshipCard,
} from './sponsorship.js';

// Event cards
export {
  EVENT_CARDS,
  drawEventCard,
  getEventLapModifier,
  getEventStressModifier,
  getEventHeatModifier,
  isReverseGridEvent,
} from './events.js';
