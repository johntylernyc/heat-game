/**
 * Multiplayer infrastructure types for Heat: Pedal to the Metal.
 *
 * Defines room management, connection handling, message protocol,
 * and state partitioning for real-time multiplayer games.
 */

import type {
  Card,
  GameMode,
  GamePhase,
  GameState,
  Gear,
  PlayerState,
  RaceStatus,
} from '../types.js';

export type PhaseType = 'simultaneous' | 'sequential' | 'sequential-auto' | 'automatic';

/** A card in the player's hand annotated with playability. */
export type HandCard = Card & { playable: boolean };

// -- Room --

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'closed';

export type CarColor = 'red' | 'blue' | 'green' | 'yellow' | 'black' | 'white';

export const CAR_COLORS: CarColor[] = ['red', 'blue', 'green', 'yellow', 'black', 'white'];

export interface PlayerInfo {
  displayName: string;
  carColor: CarColor;
}

export interface RoomConfig {
  trackId: string;
  lapCount: number;
  maxPlayers: number;
  /** Turn timeout in milliseconds. 0 = no timeout. */
  turnTimeoutMs: number;
  /** RNG seed for deterministic game replay. Auto-generated if not provided. */
  seed?: number;
  /** Game mode: 'race' (default) or 'qualifying' for solo play. */
  mode?: GameMode;
}

export interface LobbyPlayer {
  playerId: string;
  displayName: string;
  carColor: CarColor;
  isReady: boolean;
  isConnected: boolean;
  isHost: boolean;
}

export interface LobbyState {
  roomId: string;
  roomCode: string;
  config: RoomConfig;
  players: LobbyPlayer[];
  canStart: boolean;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  config: RoomConfig;
  /** Player IDs in join order. Index = player index in game state. */
  playerIds: string[];
  /** Connected player IDs (subset of playerIds). */
  connectedPlayerIds: Set<string>;
  /** Player display names and car colors. */
  playerInfo: Map<string, PlayerInfo>;
  /** Player ready status. */
  readyStatus: Map<string, boolean>;
  /** Full authoritative game state. null before game starts. */
  gameState: GameState | null;
  /** RNG function for the game. */
  rng: (() => number) | null;
  /** Collected actions for current simultaneous phase. Map<playerIndex, action>. */
  pendingActions: Map<number, unknown>;
  /** Active turn timer handle, if any. */
  turnTimer: ReturnType<typeof setTimeout> | null;
  /** Timestamp when the current phase started (for latency tracking). */
  phaseStartedAt: number;
  /** Timestamp of last activity (for TTL-based cleanup). */
  lastActivityAt: number;
  createdAt: number;
}

// -- Client → Server Messages --

export interface CreateRoomMessage {
  type: 'create-room';
  trackId: string;
  lapCount: number;
  maxPlayers: number;
  turnTimeoutMs?: number;
  displayName: string;
}

export interface JoinRoomMessage {
  type: 'join-room';
  roomCode: string;
  displayName: string;
}

export interface ResumeSessionMessage {
  type: 'resume-session';
  sessionToken: string;
}

export interface SetPlayerInfoMessage {
  type: 'set-player-info';
  displayName?: string;
  carColor?: CarColor;
}

export interface SetReadyMessage {
  type: 'set-ready';
  ready: boolean;
}

export interface UpdateRoomConfigMessage {
  type: 'update-room-config';
  trackId?: string;
  lapCount?: number;
  maxPlayers?: number;
  turnTimeoutMs?: number;
}

export interface LeaveRoomMessage {
  type: 'leave-room';
}

export interface StartGameMessage {
  type: 'start-game';
}

export interface StartQualifyingMessage {
  type: 'start-qualifying';
  trackId: string;
  lapCount: number;
  displayName: string;
  carColor?: CarColor;
}

export interface GearShiftMessage {
  type: 'gear-shift';
  targetGear: Gear;
}

export interface PlayCardsMessage {
  type: 'play-cards';
  cardIndices: number[];
}

export interface ReactCooldownMessage {
  type: 'react-cooldown';
  heatIndices: number[];
}

export interface ReactBoostMessage {
  type: 'react-boost';
}

export interface ReactDoneMessage {
  type: 'react-done';
}

export interface SlipstreamMessage {
  type: 'slipstream';
  accept: boolean;
}

export interface DiscardMessage {
  type: 'discard';
  cardIndices: number[];
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | ResumeSessionMessage
  | SetPlayerInfoMessage
  | SetReadyMessage
  | UpdateRoomConfigMessage
  | LeaveRoomMessage
  | StartGameMessage
  | StartQualifyingMessage
  | GearShiftMessage
  | PlayCardsMessage
  | ReactCooldownMessage
  | ReactBoostMessage
  | ReactDoneMessage
  | SlipstreamMessage
  | DiscardMessage;

// -- Server → Client Messages --

export interface SessionCreatedMessage {
  type: 'session-created';
  sessionToken: string;
  playerId: string;
}

export interface RoomCreatedMessage {
  type: 'room-created';
  roomId: string;
  roomCode: string;
}

export interface PlayerJoinedMessage {
  type: 'player-joined';
  playerId: string;
  playerCount: number;
  maxPlayers: number;
}

export interface PlayerLeftMessage {
  type: 'player-left';
  playerId: string;
  playerCount: number;
  maxPlayers: number;
  newHostId?: string;
}

export interface LobbyStateMessage {
  type: 'lobby-state';
  lobby: LobbyState;
}

export interface GameStartedMessage {
  type: 'game-started';
  state: ClientGameState;
}

export interface PhaseChangedMessage {
  type: 'phase-changed';
  phase: GamePhase;
  state: ClientGameState;
  /** Milliseconds remaining for this phase action, if timed. */
  timeoutMs?: number;
}

export interface ActionRequiredMessage {
  type: 'action-required';
  phase: GamePhase;
  timeoutMs?: number;
}

export interface PlayerDisconnectedMessage {
  type: 'player-disconnected';
  playerId: string;
}

export interface PlayerReconnectedMessage {
  type: 'player-reconnected';
  playerId: string;
}

export interface GameOverMessage {
  type: 'game-over';
  standings: PlayerStanding[];
}

export interface ReconnectAvailableMessage {
  type: 'reconnect-available';
  roomCode: string;
  roomId: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | SessionCreatedMessage
  | RoomCreatedMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | LobbyStateMessage
  | GameStartedMessage
  | PhaseChangedMessage
  | ActionRequiredMessage
  | PlayerDisconnectedMessage
  | PlayerReconnectedMessage
  | GameOverMessage
  | ReconnectAvailableMessage
  | ErrorMessage;

// -- State Partitioning --

export interface PublicPlayerState {
  id: string;
  gear: Gear;
  position: number;
  lapCount: number;
  speed: number;
  handCount: number;
  drawPileCount: number;
  discardPileCount: number;
  engineZoneCount: number;
  hasBoosted: boolean;
  /** Number of played cards (face-down until reveal). */
  playedCardCount: number;
}

export interface PrivatePlayerState {
  id: string;
  gear: Gear;
  position: number;
  lapCount: number;
  speed: number;
  hand: HandCard[];
  drawPileCount: number;
  discardPile: Card[];
  engineZone: Card[];
  hasBoosted: boolean;
  playedCards: Card[];
  lapRounds: number[];
}

export interface ClientGameState {
  round: number;
  phase: GamePhase;
  phaseType: PhaseType;
  activePlayerIndex: number;
  turnOrder: number[];
  lapTarget: number;
  raceStatus: RaceStatus;
  mode: GameMode;
  playerIndex: number;
  self: PrivatePlayerState;
  opponents: PublicPlayerState[];
  totalSpaces: number;
}

export interface PlayerStanding {
  playerId: string;
  position: number;
  lapCount: number;
  rank: number;
}

// -- Connection Abstraction --

export interface Connection {
  id: string;
  playerId: string;
  roomId: string | null;
  send(message: ServerMessage): void;
}
