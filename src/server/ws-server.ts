/**
 * WebSocket server for multiplayer Heat games.
 *
 * Thin adapter layer: maps WebSocket connections to the game controller.
 * Uses the `ws` library for WebSocket support.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type {
  Room,
  Connection,
  ServerMessage,
  ClientMessage,
  RoomConfig,
} from './types.js';
import type { ConnectionRegistry } from './game-controller.js';
import {
  createRoom,
  joinRoom,
  disconnectPlayer,
  reconnectPlayer,
  canStartGame,
  cleanupRoom,
  allPlayersDisconnected,
  setPlayerReady,
  setPlayerInfo,
  updateRoomConfig,
  removePlayer,
  getLobbyState,
} from './room.js';
import { baseGameTracks } from '../track/index.js';
import {
  startGame,
  handleGameAction,
  handleReconnection,
  handleDisconnection,
} from './game-controller.js';

// -- Server State --

interface Session {
  playerId: string;
  roomId: string | null;
}

interface ServerState {
  rooms: Map<string, Room>;
  roomsByCode: Map<string, Room>;
  connections: Map<string, WsConnection>;
  playerRooms: Map<string, string>;
  /** Session tokens → session data for reconnection across page refreshes. */
  sessions: Map<string, Session>;
  /** Player ID → session token (reverse lookup). */
  playerSessions: Map<string, string>;
  /** Pending cleanup timers for waiting rooms (room ID → timer handle). */
  roomCleanupTimers: Map<string, ReturnType<typeof setTimeout>>;
}

interface WsConnection extends Connection {
  ws: WebSocket;
}

export interface HeatServerConfig {
  port: number;
  /** Default turn timeout in ms. */
  defaultTurnTimeoutMs?: number;
  /** Cleanup rooms after this many ms of inactivity. 0 = no cleanup. */
  roomCleanupMs?: number;
  /** Grace period before deleting empty waiting rooms (ms). Default 30000. */
  waitingRoomGracePeriodMs?: number;
}

export interface HeatServer {
  /** The underlying WebSocket server. */
  wss: WebSocketServer;
  /** Shut down the server. */
  close(): void;
  /** Get server state for testing/monitoring. */
  getState(): Readonly<ServerState>;
}

/**
 * Create and start a Heat multiplayer WebSocket server.
 */
export function createHeatServer(config: HeatServerConfig): HeatServer {
  const state: ServerState = {
    rooms: new Map(),
    roomsByCode: new Map(),
    connections: new Map(),
    playerRooms: new Map(),
    sessions: new Map(),
    playerSessions: new Map(),
    roomCleanupTimers: new Map(),
  };

  const WAITING_ROOM_GRACE_PERIOD_MS = config.waitingRoomGracePeriodMs ?? 30_000;

  const registry: ConnectionRegistry = {
    getConnection(playerId: string) {
      return state.connections.get(playerId) ?? null;
    },

    broadcast(room: Room, message: ServerMessage) {
      for (const playerId of room.playerIds) {
        if (room.connectedPlayerIds.has(playerId)) {
          const conn = state.connections.get(playerId);
          if (conn) sendJson(conn.ws, message);
        }
      }
    },

    sendTo(playerId: string, message: ServerMessage) {
      const conn = state.connections.get(playerId);
      if (conn) sendJson(conn.ws, message);
    },
  };

  const wss = new WebSocketServer({ port: config.port });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const playerId = generatePlayerId();
    const sessionToken = generateSessionToken();

    const conn: WsConnection = {
      id: playerId,
      playerId,
      roomId: null,
      ws,
      send(message: ServerMessage) {
        sendJson(ws, message);
      },
    };

    state.connections.set(playerId, conn);
    state.sessions.set(sessionToken, { playerId, roomId: null });
    state.playerSessions.set(playerId, sessionToken);

    // Send session token to client
    conn.send({
      type: 'session-created',
      sessionToken,
      playerId,
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        handleMessage(state, conn, message, registry, config);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Invalid message';
        sendJson(ws, { type: 'error', message: errorMsg } as ServerMessage);
      }
    });

    ws.on('close', () => {
      handleClose(state, conn, registry, WAITING_ROOM_GRACE_PERIOD_MS);
    });

    ws.on('error', () => {
      handleClose(state, conn, registry, WAITING_ROOM_GRACE_PERIOD_MS);
    });
  });

  // Room cleanup interval
  let cleanupInterval: ReturnType<typeof setInterval> | null = null;
  if (config.roomCleanupMs && config.roomCleanupMs > 0) {
    cleanupInterval = setInterval(() => {
      cleanupStaleRooms(state, config.roomCleanupMs!);
    }, config.roomCleanupMs);
  }

  return {
    wss,
    close() {
      if (cleanupInterval) clearInterval(cleanupInterval);
      // Cancel all pending room cleanup timers
      for (const timer of state.roomCleanupTimers.values()) {
        clearTimeout(timer);
      }
      state.roomCleanupTimers.clear();
      // Clean up all rooms
      for (const room of state.rooms.values()) {
        cleanupRoom(room);
      }
      wss.close();
    },
    getState() {
      return state;
    },
  };
}

// -- Message Handling --

function handleMessage(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage,
  registry: ConnectionRegistry,
  config: HeatServerConfig,
): void {
  switch (message.type) {
    case 'create-room':
      handleCreateRoom(state, conn, message, registry, config);
      break;

    case 'join-room':
      handleJoinRoom(state, conn, message, registry);
      break;

    case 'resume-session':
      handleResumeSession(state, conn, message, registry);
      break;

    case 'set-player-info':
      handleSetPlayerInfo(state, conn, message, registry);
      break;

    case 'set-ready':
      handleSetReady(state, conn, message, registry);
      break;

    case 'update-room-config':
      handleUpdateRoomConfig(state, conn, message, registry);
      break;

    case 'leave-room':
      handleLeaveRoom(state, conn, registry);
      break;

    case 'start-game':
      handleStartGame(state, conn, registry);
      break;

    case 'start-qualifying':
      handleStartQualifying(state, conn, message, registry, config);
      break;

    default:
      // Game action — route to room's game controller
      handleGameActionMessage(state, conn, message, registry);
      break;
  }
}

function handleCreateRoom(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage & { type: 'create-room' },
  registry: ConnectionRegistry,
  config: HeatServerConfig,
): void {
  // Player can only be in one room at a time
  if (conn.roomId) {
    conn.send({ type: 'error', message: 'Already in a room' });
    return;
  }

  // Validate displayName
  if (typeof message.displayName !== 'string' || message.displayName.trim() === '') {
    conn.send({ type: 'error', message: 'Display name is required' });
    return;
  }

  // Validate trackId
  if (!(message.trackId in baseGameTracks)) {
    conn.send({ type: 'error', message: `Invalid track: ${message.trackId}` });
    return;
  }

  // Validate lapCount (1-3)
  if (typeof message.lapCount !== 'number' || message.lapCount < 1 || message.lapCount > 3) {
    conn.send({ type: 'error', message: 'Lap count must be between 1 and 3' });
    return;
  }

  // Validate maxPlayers (2-6)
  if (typeof message.maxPlayers !== 'number' || message.maxPlayers < 2 || message.maxPlayers > 6) {
    conn.send({ type: 'error', message: 'Max players must be between 2 and 6' });
    return;
  }

  const roomConfig: RoomConfig = {
    trackId: message.trackId,
    lapCount: message.lapCount,
    maxPlayers: message.maxPlayers,
    turnTimeoutMs: message.turnTimeoutMs ?? config.defaultTurnTimeoutMs ?? 60000,
  };

  const room = createRoom(conn.playerId, roomConfig, message.displayName);

  state.rooms.set(room.id, room);
  state.roomsByCode.set(room.code, room);
  state.playerRooms.set(conn.playerId, room.id);
  conn.roomId = room.id;

  // Update session with room info
  const token = state.playerSessions.get(conn.playerId);
  if (token) {
    const session = state.sessions.get(token);
    if (session) session.roomId = room.id;
  }

  conn.send({
    type: 'room-created',
    roomId: room.id,
    roomCode: room.code,
  });

  // Send initial lobby state
  broadcastLobbyState(state, room, registry);
}

function handleJoinRoom(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage & { type: 'join-room' },
  registry: ConnectionRegistry,
): void {
  if (conn.roomId) {
    // Check if reconnecting to same room
    const existingRoom = state.rooms.get(conn.roomId);
    if (existingRoom && existingRoom.code === message.roomCode.toUpperCase()) {
      handleReconnect(state, conn, existingRoom, registry);
      return;
    }
    conn.send({ type: 'error', message: 'Already in a room' });
    return;
  }

  const room = state.roomsByCode.get(message.roomCode.toUpperCase());
  if (!room) {
    conn.send({ type: 'error', message: 'Room not found' });
    return;
  }

  // Check if this is a reconnection (player was in the room before)
  if (room.playerIds.includes(conn.playerId)) {
    handleReconnect(state, conn, room, registry);
    return;
  }

  const error = joinRoom(room, conn.playerId, message.displayName);
  if (error) {
    conn.send({ type: 'error', message: error });
    return;
  }

  // Cancel any pending grace-period cleanup
  cancelRoomCleanup(state, room.id);

  state.playerRooms.set(conn.playerId, room.id);
  conn.roomId = room.id;

  // Update session with room info
  const token = state.playerSessions.get(conn.playerId);
  if (token) {
    const session = state.sessions.get(token);
    if (session) session.roomId = room.id;
  }

  registry.broadcast(room, {
    type: 'player-joined',
    playerId: conn.playerId,
    playerCount: room.playerIds.length,
    maxPlayers: room.config.maxPlayers,
  });

  // Broadcast updated lobby state to all players
  broadcastLobbyState(state, room, registry);
}

function handleResumeSession(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage & { type: 'resume-session' },
  registry: ConnectionRegistry,
): void {
  const session = state.sessions.get(message.sessionToken);
  if (!session) {
    conn.send({ type: 'error', message: 'Invalid session token' });
    return;
  }

  const oldPlayerId = session.playerId;

  // Duplicate resume on the same connection (e.g. network retry, client race):
  // conn.playerId was already remapped to oldPlayerId by the first resume.
  // Re-running the cleanup below would delete the *active* session, so bail out.
  if (conn.playerId === oldPlayerId) {
    conn.send({
      type: 'session-created',
      sessionToken: message.sessionToken,
      playerId: oldPlayerId,
    });
    return;
  }

  // If the old player connection is still tracked, clean it up
  const oldConn = state.connections.get(oldPlayerId);
  if (oldConn && oldConn !== conn) {
    state.connections.delete(oldPlayerId);
  }

  // Remap the connection to use the old player ID
  state.connections.delete(conn.playerId);
  // Clean up the new session that was auto-created for this connection
  const newToken = state.playerSessions.get(conn.playerId);
  if (newToken) {
    state.sessions.delete(newToken);
    state.playerSessions.delete(conn.playerId);
  }

  conn.playerId = oldPlayerId;
  conn.id = oldPlayerId;
  state.connections.set(oldPlayerId, conn);
  state.playerSessions.set(oldPlayerId, message.sessionToken);
  session.playerId = oldPlayerId;

  // Send the session info back
  conn.send({
    type: 'session-created',
    sessionToken: message.sessionToken,
    playerId: oldPlayerId,
  });

  // If player was in a room, reconnect them
  if (session.roomId) {
    const room = state.rooms.get(session.roomId);
    if (room && room.playerIds.includes(oldPlayerId)) {
      conn.roomId = room.id;
      state.playerRooms.set(oldPlayerId, room.id);

      // Cancel any pending grace-period cleanup
      cancelRoomCleanup(state, room.id);

      if (room.status === 'playing') {
        reconnectPlayer(room, oldPlayerId);
        handleReconnection(room, oldPlayerId, registry);
      } else if (room.status === 'waiting') {
        reconnectPlayer(room, oldPlayerId);
        broadcastLobbyState(state, room, registry);
        registry.broadcast(room, {
          type: 'player-reconnected',
          playerId: oldPlayerId,
        });
      }
    } else {
      // Room gone or player removed
      session.roomId = null;
    }
  }
}

function handleSetPlayerInfo(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage & { type: 'set-player-info' },
  registry: ConnectionRegistry,
): void {
  const room = getPlayerRoom(state, conn);
  if (!room) return;

  const error = setPlayerInfo(room, conn.playerId, message.displayName, message.carColor);
  if (error) {
    conn.send({ type: 'error', message: error });
    return;
  }

  broadcastLobbyState(state, room, registry);
}

function handleSetReady(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage & { type: 'set-ready' },
  registry: ConnectionRegistry,
): void {
  const room = getPlayerRoom(state, conn);
  if (!room) return;

  const error = setPlayerReady(room, conn.playerId, message.ready);
  if (error) {
    conn.send({ type: 'error', message: error });
    return;
  }

  broadcastLobbyState(state, room, registry);
}

function handleUpdateRoomConfig(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage & { type: 'update-room-config' },
  registry: ConnectionRegistry,
): void {
  const room = getPlayerRoom(state, conn);
  if (!room) return;

  if (room.hostId !== conn.playerId) {
    conn.send({ type: 'error', message: 'Only the host can update room config' });
    return;
  }

  const error = updateRoomConfig(room, {
    trackId: message.trackId,
    lapCount: message.lapCount,
    maxPlayers: message.maxPlayers,
    turnTimeoutMs: message.turnTimeoutMs,
  });
  if (error) {
    conn.send({ type: 'error', message: error });
    return;
  }

  broadcastLobbyState(state, room, registry);
}

function handleLeaveRoom(
  state: ServerState,
  conn: WsConnection,
  registry: ConnectionRegistry,
): void {
  const room = getPlayerRoom(state, conn);
  if (!room) return;

  const result = removePlayer(room, conn.playerId);
  if (result.error) {
    conn.send({ type: 'error', message: result.error });
    return;
  }

  // Clear room association
  conn.roomId = null;
  state.playerRooms.delete(conn.playerId);
  const token = state.playerSessions.get(conn.playerId);
  if (token) {
    const session = state.sessions.get(token);
    if (session) session.roomId = null;
  }

  // Notify remaining players
  if (room.playerIds.length > 0) {
    registry.broadcast(room, {
      type: 'player-left',
      playerId: conn.playerId,
      playerCount: room.playerIds.length,
      maxPlayers: room.config.maxPlayers,
      newHostId: result.newHostId,
    });
    broadcastLobbyState(state, room, registry);
  } else {
    // Room is empty, clean it up
    cleanupRoom(room);
    state.rooms.delete(room.id);
    state.roomsByCode.delete(room.code);
  }
}

function handleReconnect(
  state: ServerState,
  conn: WsConnection,
  room: Room,
  registry: ConnectionRegistry,
): void {
  // Cancel any pending grace-period cleanup
  cancelRoomCleanup(state, room.id);

  reconnectPlayer(room, conn.playerId);
  state.playerRooms.set(conn.playerId, room.id);
  conn.roomId = room.id;

  if (room.status === 'playing') {
    handleReconnection(room, conn.playerId, registry);
  }
}

function handleStartGame(
  state: ServerState,
  conn: WsConnection,
  registry: ConnectionRegistry,
): void {
  if (!conn.roomId) {
    conn.send({ type: 'error', message: 'Not in a room' });
    return;
  }

  const room = state.rooms.get(conn.roomId);
  if (!room) {
    conn.send({ type: 'error', message: 'Room not found' });
    return;
  }

  if (room.hostId !== conn.playerId) {
    conn.send({ type: 'error', message: 'Only the host can start the game' });
    return;
  }

  if (!canStartGame(room)) {
    conn.send({ type: 'error', message: 'Not enough players to start' });
    return;
  }

  startGame(room, registry);
}

function handleStartQualifying(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage & { type: 'start-qualifying' },
  registry: ConnectionRegistry,
  config: HeatServerConfig,
): void {
  if (conn.roomId) {
    conn.send({ type: 'error', message: 'Already in a room' });
    return;
  }

  const roomConfig: RoomConfig = {
    trackId: message.trackId,
    lapCount: Math.min(Math.max(message.lapCount, 1), 3),
    maxPlayers: 1,
    turnTimeoutMs: 0, // No timer in qualifying
    mode: 'qualifying',
  };

  const room = createRoom(conn.playerId, roomConfig, message.displayName);

  // Set car color if provided
  if (message.carColor) {
    setPlayerInfo(room, conn.playerId, undefined, message.carColor);
  }

  state.rooms.set(room.id, room);
  state.roomsByCode.set(room.code, room);
  state.playerRooms.set(conn.playerId, room.id);
  conn.roomId = room.id;

  // Update session with room info
  const token = state.playerSessions.get(conn.playerId);
  if (token) {
    const session = state.sessions.get(token);
    if (session) session.roomId = room.id;
  }

  conn.send({
    type: 'room-created',
    roomId: room.id,
    roomCode: room.code,
  });

  // Auto-ready and start immediately — zero friction
  setPlayerReady(room, conn.playerId, true);
  startGame(room, registry);
}

function handleGameActionMessage(
  state: ServerState,
  conn: WsConnection,
  message: ClientMessage,
  registry: ConnectionRegistry,
): void {
  if (!conn.roomId) {
    conn.send({ type: 'error', message: 'Not in a room' });
    return;
  }

  const room = state.rooms.get(conn.roomId);
  if (!room) {
    conn.send({ type: 'error', message: 'Room not found' });
    return;
  }

  handleGameAction(room, conn.playerId, message, registry);
}

// -- Disconnection --

function handleClose(
  state: ServerState,
  conn: WsConnection,
  registry: ConnectionRegistry,
  gracePeriodMs: number,
): void {
  // If the player already reconnected (e.g., via resume-session), the connections
  // map will point to the NEW connection, not this one. Skip disconnect to avoid
  // undoing the reconnection — the old WebSocket's close event fires after the
  // new connection is already established.
  const currentConn = state.connections.get(conn.playerId);
  if (currentConn && currentConn !== conn) {
    return;
  }

  const roomId = conn.roomId ?? state.playerRooms.get(conn.playerId);

  if (roomId) {
    const room = state.rooms.get(roomId);
    if (room) {
      disconnectPlayer(room, conn.playerId);

      if (room.status === 'playing') {
        handleDisconnection(room, conn.playerId, registry);
      } else if (room.status === 'waiting') {
        // In waiting room, broadcast updated lobby state
        broadcastLobbyState(state, room, registry);
      }

      // Schedule cleanup for empty waiting rooms with grace period
      if (allPlayersDisconnected(room) && room.status !== 'playing') {
        scheduleRoomCleanup(state, room, gracePeriodMs);
      }
    }
  }

  // Don't delete session — allow reconnection via resume-session
  state.connections.delete(conn.playerId);
  state.playerRooms.delete(conn.playerId);
}

// -- Grace Period --

function scheduleRoomCleanup(state: ServerState, room: Room, gracePeriodMs: number): void {
  // Cancel any existing timer for this room
  cancelRoomCleanup(state, room.id);

  const timer = setTimeout(() => {
    state.roomCleanupTimers.delete(room.id);
    // Re-check: only delete if still abandoned
    if (state.rooms.has(room.id) && allPlayersDisconnected(room) && room.status !== 'playing') {
      cleanupRoom(room);
      state.rooms.delete(room.id);
      state.roomsByCode.delete(room.code);
    }
  }, gracePeriodMs);

  state.roomCleanupTimers.set(room.id, timer);
}

function cancelRoomCleanup(state: ServerState, roomId: string): void {
  const timer = state.roomCleanupTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    state.roomCleanupTimers.delete(roomId);
  }
}

// -- Cleanup --

function cleanupStaleRooms(state: ServerState, maxAgeMs: number): void {
  const now = Date.now();
  for (const [id, room] of state.rooms) {
    if (room.status === 'closed') continue;
    const inactive = now - room.lastActivityAt > maxAgeMs;
    const abandoned = allPlayersDisconnected(room);
    if (abandoned && inactive) {
      // Clean up sessions for players in this room
      for (const playerId of room.playerIds) {
        const token = state.playerSessions.get(playerId);
        if (token) {
          state.sessions.delete(token);
          state.playerSessions.delete(playerId);
        }
        state.playerRooms.delete(playerId);
      }
      cleanupRoom(room);
      state.rooms.delete(id);
      state.roomsByCode.delete(room.code);
    }
  }
}

// -- Helpers --

function getPlayerRoom(state: ServerState, conn: WsConnection): Room | null {
  if (!conn.roomId) {
    conn.send({ type: 'error', message: 'Not in a room' });
    return null;
  }
  const room = state.rooms.get(conn.roomId);
  if (!room) {
    conn.send({ type: 'error', message: 'Room not found' });
    return null;
  }
  return room;
}

function broadcastLobbyState(state: ServerState, room: Room, registry: ConnectionRegistry): void {
  if (room.status !== 'waiting') return;
  const lobby = getLobbyState(room);
  registry.broadcast(room, { type: 'lobby-state', lobby });
}

function sendJson(ws: WebSocket, data: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

let playerCounter = 0;
function generatePlayerId(): string {
  return `player-${++playerCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function generateSessionToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
