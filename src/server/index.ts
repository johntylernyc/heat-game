/**
 * Multiplayer server infrastructure for Heat: Pedal to the Metal.
 *
 * Provides WebSocket-based real-time multiplayer with:
 *   - Room management (create, join, reconnect)
 *   - Authoritative game server (validates all actions)
 *   - Hidden information enforcement (per-client state partitioning)
 *   - Turn timer with auto-advance
 *   - Disconnected player auto-play
 */

// Server
export type { HeatServerConfig, HeatServer } from './ws-server.js';
export { createHeatServer } from './ws-server.js';

// Room management
export {
  createRoom,
  joinRoom,
  disconnectPlayer,
  reconnectPlayer,
  getPlayerIndex,
  isPlayerConnected,
  allPlayersDisconnected,
  canStartGame,
  setRoomStatus,
  cleanupRoom,
  generateRoomCode,
  generateRoomId,
} from './room.js';

// Game controller
export type { ConnectionRegistry, PhaseType } from './game-controller.js';
export {
  startGame,
  handleGameAction,
  handleReconnection,
  handleDisconnection,
  getPhaseType,
} from './game-controller.js';

// State partitioning
export {
  partitionState,
  buildPrivateState,
  buildPublicState,
  computeStandings,
} from './state-partition.js';

// Types
export type {
  Room,
  RoomConfig,
  RoomStatus,
  Connection,
  ClientMessage,
  ServerMessage,
  CreateRoomMessage,
  JoinRoomMessage,
  StartGameMessage,
  GearShiftMessage,
  PlayCardsMessage,
  ReactCooldownMessage,
  ReactBoostMessage,
  ReactDoneMessage,
  SlipstreamMessage,
  DiscardMessage,
  RoomCreatedMessage,
  PlayerJoinedMessage,
  GameStartedMessage,
  PhaseChangedMessage,
  ActionRequiredMessage,
  PlayerDisconnectedMessage,
  PlayerReconnectedMessage,
  GameOverMessage,
  ErrorMessage,
  PublicPlayerState,
  PrivatePlayerState,
  ClientGameState,
  PlayerStanding,
} from './types.js';
