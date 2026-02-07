/**
 * Multiplayer server infrastructure for Heat: Pedal to the Metal.
 *
 * Provides WebSocket-based real-time multiplayer with:
 *   - Room management (create, join, reconnect)
 *   - Game lobby with player identity, ready status, and config
 *   - Session persistence for reconnection across page refreshes
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
  allPlayersReady,
  setPlayerReady,
  setPlayerInfo,
  updateRoomConfig,
  removePlayer,
  getLobbyState,
  getAvailableColor,
  setRoomStatus,
  cleanupRoom,
  generateRoomCode,
  generateRoomId,
} from './room.js';

// Game controller
export type { ConnectionRegistry } from './game-controller.js';
export {
  startGame,
  handleGameAction,
  handleReconnection,
  handleDisconnection,
} from './game-controller.js';

// State partitioning
export {
  partitionState,
  buildPrivateState,
  buildPublicState,
  computeStandings,
  getPhaseType,
} from './state-partition.js';

// Types
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
  CreateRoomMessage,
  JoinRoomMessage,
  ResumeSessionMessage,
  SetPlayerInfoMessage,
  SetReadyMessage,
  UpdateRoomConfigMessage,
  LeaveRoomMessage,
  StartGameMessage,
  GearShiftMessage,
  PlayCardsMessage,
  ReactCooldownMessage,
  ReactBoostMessage,
  ReactDoneMessage,
  SlipstreamMessage,
  DiscardMessage,
  SessionCreatedMessage,
  RoomCreatedMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  LobbyStateMessage,
  GameStartedMessage,
  PhaseChangedMessage,
  ActionRequiredMessage,
  PlayerDisconnectedMessage,
  PlayerReconnectedMessage,
  GameOverMessage,
  ReconnectAvailableMessage,
  ErrorMessage,
  PublicPlayerState,
  PrivatePlayerState,
  HandCard,
  ClientGameState,
  ClientPlayerInfo,
  PlayerStanding,
  PhaseType,
} from './types.js';

export { CAR_COLORS } from './types.js';
