/**
 * Heat: Pedal to the Metal — Core Game Engine
 *
 * Public API surface for the game state machine, rules engine,
 * and multiplayer infrastructure.
 */

// Track
export {
  Track,
  baseGameTracks,
  usaTrack,
  italyTrack,
  franceTrack,
  greatBritainTrack,
} from "./track/index.js";
export type {
  Corner,
  GridPosition,
  LegendsLine,
  RaceConfig,
  Sector,
  SpotPosition,
  TrackData,
} from "./track/index.js";

// Types
export type {
  Card,
  CardType,
  SpeedCard,
  HeatCard,
  StressCard,
  UpgradeCard,
  UpgradeSubtype,
  Gear,
  PlayerState,
  GamePhase,
  RaceStatus,
  GameState,
  CornerDef,
  WeatherType,
  WeatherStartingEffect,
  WeatherOngoingEffect,
  WeatherToken,
  CornerModType,
  SectorModType,
  CornerMod,
  SectorMod,
  RoadConditionToken,
  RoadConditionPlacement,
} from './types.js';

export {
  HAND_SIZE,
  STARTING_HEAT_IN_ENGINE,
  DEFAULT_STRESS_COUNT,
  MIN_GEAR,
  MAX_GEAR,
  CARDS_PER_GEAR,
  COOLDOWN_PER_GEAR,
  SPINOUT_STRESS,
} from './types.js';

// Cards
export {
  speedCard,
  heatCard,
  stressCard,
  upgradeCard,
  buildStartingDeck,
  buildEngineZone,
  getCardSpeedValue,
  isPlayableCard,
} from './cards.js';

// Deck management
export {
  createRng,
  shuffle,
  drawCards,
  replenishHand,
  discardFromHand,
} from './deck.js';

// Gear
export type { ShiftResult } from './gear.js';
export { shiftGear, getValidGearTargets } from './gear.js';

// Engine (9-phase game state machine)
export type {
  GameConfig,
  GearSelection,
  CardSelection,
  CooldownAction,
  BoostAction,
  SlipstreamAction,
  DiscardSelection,
} from './engine.js';

export {
  initGame,
  executeGearShiftPhase,
  executePlayCardsPhase,
  executeRevealAndMove,
  executeAdrenaline,
  executeCooldown,
  executeBoost,
  endReactPhase,
  executeSlipstream,
  executeCheckCorner,
  executeDiscardPhase,
  executeReplenishPhase,
  computeTurnOrder,
  isClutteredHand,
  isSlipstreamEligible,
  findCornersCrossed,
} from './engine.js';

// Garage module (upgrade card drafting)
export type {
  UpgradeEffect,
  ScrapEffect,
  SuperCoolEffect,
  SalvageEffect,
  DirectPlayEffect,
  RefreshEffect,
  AdjustSpeedLimitEffect,
  ReduceStressEffect,
  SlipstreamBoostEffect,
  GarageUpgradeType,
  GarageUpgradeCard,
  DraftDirection,
  DraftPhase,
  DraftPlayerState,
  DraftState,
  DraftConfig,
  DraftPickAction,
} from './garage/index.js';

export {
  DRAFT_ROUNDS,
  DRAFT_ROUND_DIRECTIONS,
  GARAGE_UPGRADE_CARDS,
  ALL_GARAGE_UPGRADE_CARDS,
  initDraft,
  executeDraftPick,
  getCurrentDrafter,
  getPlayerDraftedCards,
  buildDraftedDeck,
} from './garage/index.js';

// Legends (AI) system
export type {
  LegendDifficulty,
  LegendCardValues,
  LegendCard,
  LegendCarState,
  LegendState,
  LegendConfig,
  LegendMoveResult,
} from './legends/index.js';

export {
  LEGEND_CARDS,
  LEGEND_DECK_SIZE,
  getCardValues,
  findNextCorner,
  isBetweenLineAndCorner,
  moveLegend,
  initLegends,
  flipLegendCard,
  discardCurrentCard,
  executeLegendRound,
  anyLegendFinished,
  getLegendStandings,
} from './legends/index.js';

// Race lifecycle management
export type {
  RaceSetupConfig,
  GridOrder,
  RaceStanding,
} from './race.js';

export {
  setupRace,
  assignStartingGrid,
  computeFinalStandings,
  serializeRaceState,
  deserializeRaceState,
} from './race.js';

// Multiplayer server infrastructure
export type {
  HeatServerConfig,
  HeatServer,
} from './server/index.js';

export {
  createHeatServer,
} from './server/index.js';

export type {
  Room,
  RoomConfig,
  RoomStatus,
  CarColor,
  PlayerInfo,
  LobbyPlayer,
  LobbyState,
  Connection,
  ClientMessage,
  ServerMessage,
  ClientGameState,
  PublicPlayerState,
  PrivatePlayerState,
  PlayerStanding,
  PhaseType,
  ConnectionRegistry,
} from './server/index.js';

export {
  CAR_COLORS,
  createRoom,
  joinRoom,
  disconnectPlayer,
  reconnectPlayer,
  getPlayerIndex,
  isPlayerConnected,
  canStartGame,
  allPlayersReady,
  setPlayerReady,
  setPlayerInfo,
  updateRoomConfig,
  removePlayer,
  getLobbyState,
  getAvailableColor,
  startGame,
  handleGameAction,
  handleReconnection,
  handleDisconnection,
  getPhaseType,
  partitionState,
  buildPrivateState,
  buildPublicState,
  computeStandings,
} from './server/index.js';

// Weather & Road Conditions
export {
  WEATHER_TOKENS,
  WEATHER_TOKEN_COUNT,
  ROAD_CONDITION_TOKENS,
  ROAD_CONDITION_TOKEN_COUNT,
  drawWeatherToken,
  getWeatherStressCount,
  applyWeatherToPlayer,
  getEffectiveCooldown,
  isSlipstreamAllowedByWeather,
  getEffectiveSlipstreamRange,
  placeRoadConditions,
  getEffectiveSpeedLimit,
  getCornerOverheatPenalty,
  findSectorStartCorner,
  hasSectorEffect,
  isInFreeBoostSector,
  getSlipstreamSectorBonus,
  isInWeatherSector,
} from './weather/index.js';

// Client-side game board UI
export type {
  BoardState,
  GameBoard,
  Point,
  SpaceLayout,
  TrackLayout,
  CarState,
  MoveAnimation,
  SpinoutAnimation,
  CameraState,
  BoardConfig,
  StandingEntry,
  PhaseDisplay,
} from './client/index.js';

export {
  createGameBoard,
  buildCarStates,
  buildStandings,
  generateTrackLayout,
  interpolateTrackPosition,
  interpolateTrackAngle,
  createCamera,
  fitToTrack,
  worldToScreen,
  screenToWorld,
  zoomAt,
  pan,
  renderTrack,
  hitTestSpace,
  renderCars,
  renderCarAtPosition,
  AnimationManager,
  createMoveAnimation,
  createSpinoutAnimation,
  easeInOutCubic,
  easeOutQuad,
  renderStandings,
  renderPhaseIndicator,
  renderTurnOrder,
  renderLapCounters,
  renderSpaceTooltip,
  renderSlipstreamIndicator,
  getPhaseDisplay,
  PLAYER_COLORS,
  DEFAULT_BOARD_CONFIG,
} from './client/index.js';
