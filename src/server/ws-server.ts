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
} from './room.js';
import {
  startGame,
  handleGameAction,
  handleReconnection,
  handleDisconnection,
} from './game-controller.js';

// -- Server State --

interface ServerState {
  rooms: Map<string, Room>;
  roomsByCode: Map<string, Room>;
  connections: Map<string, WsConnection>;
  playerRooms: Map<string, string>;
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
  };

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
      handleClose(state, conn, registry);
    });

    ws.on('error', () => {
      handleClose(state, conn, registry);
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

    case 'start-game':
      handleStartGame(state, conn, registry);
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

  const roomConfig: RoomConfig = {
    trackId: message.trackId,
    lapCount: message.lapCount,
    maxPlayers: Math.min(Math.max(message.maxPlayers, 2), 6),
    turnTimeoutMs: message.turnTimeoutMs ?? config.defaultTurnTimeoutMs ?? 60000,
  };

  const room = createRoom(conn.playerId, roomConfig);

  state.rooms.set(room.id, room);
  state.roomsByCode.set(room.code, room);
  state.playerRooms.set(conn.playerId, room.id);
  conn.roomId = room.id;

  conn.send({
    type: 'room-created',
    roomId: room.id,
    roomCode: room.code,
  });
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
    if (existingRoom && existingRoom.code === message.roomCode) {
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

  const error = joinRoom(room, conn.playerId);
  if (error) {
    conn.send({ type: 'error', message: error });
    return;
  }

  state.playerRooms.set(conn.playerId, room.id);
  conn.roomId = room.id;

  registry.broadcast(room, {
    type: 'player-joined',
    playerId: conn.playerId,
    playerCount: room.playerIds.length,
    maxPlayers: room.config.maxPlayers,
  });
}

function handleReconnect(
  state: ServerState,
  conn: WsConnection,
  room: Room,
  registry: ConnectionRegistry,
): void {
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
): void {
  const roomId = conn.roomId ?? state.playerRooms.get(conn.playerId);

  if (roomId) {
    const room = state.rooms.get(roomId);
    if (room) {
      disconnectPlayer(room, conn.playerId);
      handleDisconnection(room, conn.playerId, registry);

      // Clean up empty rooms
      if (allPlayersDisconnected(room) && room.status !== 'playing') {
        cleanupRoom(room);
        state.rooms.delete(room.id);
        state.roomsByCode.delete(room.code);
      }
    }
  }

  state.connections.delete(conn.playerId);
  state.playerRooms.delete(conn.playerId);
}

// -- Cleanup --

function cleanupStaleRooms(state: ServerState, maxAgeMs: number): void {
  const now = Date.now();
  for (const [id, room] of state.rooms) {
    if (room.status === 'closed') continue;
    if (allPlayersDisconnected(room) && now - room.createdAt > maxAgeMs) {
      cleanupRoom(room);
      state.rooms.delete(id);
      state.roomsByCode.delete(room.code);
    }
  }
}

// -- Helpers --

function sendJson(ws: WebSocket, data: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

let playerCounter = 0;
function generatePlayerId(): string {
  return `player-${++playerCounter}-${Math.random().toString(36).slice(2, 6)}`;
}
