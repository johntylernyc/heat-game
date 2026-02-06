/**
 * Multiplayer infrastructure types for Heat: Pedal to the Metal.
 *
 * Defines room management, connection handling, message protocol,
 * and state partitioning for real-time multiplayer games.
 */

import type {
  Card,
  GamePhase,
  GameState,
  Gear,
  PlayerState,
  RaceStatus,
} from '../types.js';

// -- Room --

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'closed';

export interface RoomConfig {
  trackId: string;
  lapCount: number;
  maxPlayers: number;
  /** Turn timeout in milliseconds. 0 = no timeout. */
  turnTimeoutMs: number;
  /** RNG seed for deterministic game replay. Auto-generated if not provided. */
  seed?: number;
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
  createdAt: number;
}

// -- Client → Server Messages --

export interface CreateRoomMessage {
  type: 'create-room';
  trackId: string;
  lapCount: number;
  maxPlayers: number;
  turnTimeoutMs?: number;
}

export interface JoinRoomMessage {
  type: 'join-room';
  roomCode: string;
}

export interface StartGameMessage {
  type: 'start-game';
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
  | StartGameMessage
  | GearShiftMessage
  | PlayCardsMessage
  | ReactCooldownMessage
  | ReactBoostMessage
  | ReactDoneMessage
  | SlipstreamMessage
  | DiscardMessage;

// -- Server → Client Messages --

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

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | RoomCreatedMessage
  | PlayerJoinedMessage
  | GameStartedMessage
  | PhaseChangedMessage
  | ActionRequiredMessage
  | PlayerDisconnectedMessage
  | PlayerReconnectedMessage
  | GameOverMessage
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
  hand: Card[];
  drawPileCount: number;
  discardPile: Card[];
  engineZone: Card[];
  hasBoosted: boolean;
  playedCards: Card[];
}

export interface ClientGameState {
  round: number;
  phase: GamePhase;
  activePlayerIndex: number;
  turnOrder: number[];
  lapTarget: number;
  raceStatus: RaceStatus;
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
