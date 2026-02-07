/**
 * Production server entry point.
 *
 * Serves the Vite-built client as static files and runs the WebSocket game
 * server on the same HTTP server.
 *
 * Usage:
 *   npm run build && npm start
 */

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
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
import {
  startGame,
  handleGameAction,
  handleReconnection,
  handleDisconnection,
} from './game-controller.js';
import type { Room, ServerMessage, ClientMessage, RoomConfig, Connection } from './types.js';
import type { ConnectionRegistry } from './game-controller.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, '../../dist/client');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const port = parseInt(process.env['PORT'] ?? '3000', 10);

// -- Server State (same pattern as ws-server.ts) --

interface Session {
  playerId: string;
  roomId: string | null;
}

interface WsConnection extends Connection {
  ws: import('ws').WebSocket;
}

const WAITING_ROOM_GRACE_PERIOD_MS = 30_000;

const state = {
  rooms: new Map<string, Room>(),
  roomsByCode: new Map<string, Room>(),
  connections: new Map<string, WsConnection>(),
  playerRooms: new Map<string, string>(),
  sessions: new Map<string, Session>(),
  playerSessions: new Map<string, string>(),
  roomCleanupTimers: new Map<string, ReturnType<typeof setTimeout>>(),
};

const registry: ConnectionRegistry = {
  getConnection(playerId: string) {
    return state.connections.get(playerId) ?? null;
  },
  broadcast(room: Room, message: ServerMessage) {
    for (const playerId of room.playerIds) {
      if (room.connectedPlayerIds.has(playerId)) {
        const conn = state.connections.get(playerId);
        if (conn && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(message));
      }
    }
  },
  sendTo(playerId: string, message: ServerMessage) {
    const conn = state.connections.get(playerId);
    if (conn && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(message));
  },
};

// -- HTTP Server (static files) --

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  let filePath = resolve(DIST_DIR, '.' + url.pathname);

  // Prevent path traversal: ensure resolved path stays within DIST_DIR
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // SPA fallback: if the file doesn't exist and it's not a file request, serve index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST_DIR, 'index.html');
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found — run `npm run build` first');
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

// -- WebSocket Server (attached to HTTP server) --

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

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

wss.on('connection', (ws) => {
  const playerId = generatePlayerId();
  const sessionToken = generateSessionToken();

  const conn: WsConnection = {
    id: playerId,
    playerId,
    roomId: null,
    ws,
    send(message: ServerMessage) {
      if (ws.readyState === 1) ws.send(JSON.stringify(message));
    },
  };

  state.connections.set(playerId, conn);
  state.sessions.set(sessionToken, { playerId, roomId: null });
  state.playerSessions.set(playerId, sessionToken);

  conn.send({ type: 'session-created', sessionToken, playerId });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;
      handleMessage(conn, message);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Invalid message';
      conn.send({ type: 'error', message: errorMsg });
    }
  });

  ws.on('close', () => handleClose(conn));
  ws.on('error', () => handleClose(conn));
});

function handleMessage(conn: WsConnection, message: ClientMessage): void {
  switch (message.type) {
    case 'create-room': {
      if (conn.roomId) { conn.send({ type: 'error', message: 'Already in a room' }); return; }
      const roomConfig: RoomConfig = {
        trackId: message.trackId,
        lapCount: message.lapCount,
        maxPlayers: Math.min(Math.max(message.maxPlayers, 2), 6),
        turnTimeoutMs: message.turnTimeoutMs ?? 60000,
      };
      const room = createRoom(conn.playerId, roomConfig, message.displayName);
      state.rooms.set(room.id, room);
      state.roomsByCode.set(room.code, room);
      state.playerRooms.set(conn.playerId, room.id);
      conn.roomId = room.id;
      const token = state.playerSessions.get(conn.playerId);
      if (token) { const s = state.sessions.get(token); if (s) s.roomId = room.id; }
      conn.send({ type: 'room-created', roomId: room.id, roomCode: room.code });
      broadcastLobbyState(room);
      break;
    }
    case 'join-room': {
      if (conn.roomId) { conn.send({ type: 'error', message: 'Already in a room' }); return; }
      const room = state.roomsByCode.get(message.roomCode.toUpperCase());
      if (!room) { conn.send({ type: 'error', message: 'Room not found' }); return; }
      const error = joinRoom(room, conn.playerId, message.displayName);
      if (error) { conn.send({ type: 'error', message: error }); return; }
      cancelRoomCleanup(room.id);
      state.playerRooms.set(conn.playerId, room.id);
      conn.roomId = room.id;
      const token = state.playerSessions.get(conn.playerId);
      if (token) { const s = state.sessions.get(token); if (s) s.roomId = room.id; }
      broadcastLobbyState(room);
      break;
    }
    case 'resume-session': {
      const session = state.sessions.get(message.sessionToken);
      if (!session) { conn.send({ type: 'error', message: 'Invalid session token' }); return; }
      const oldId = session.playerId;
      const oldConn = state.connections.get(oldId);
      if (oldConn && oldConn !== conn) state.connections.delete(oldId);
      state.connections.delete(conn.playerId);
      const nt = state.playerSessions.get(conn.playerId);
      if (nt) { state.sessions.delete(nt); state.playerSessions.delete(conn.playerId); }
      conn.playerId = oldId;
      conn.id = oldId;
      state.connections.set(oldId, conn);
      state.playerSessions.set(oldId, message.sessionToken);
      session.playerId = oldId;
      conn.send({ type: 'session-created', sessionToken: message.sessionToken, playerId: oldId });
      if (session.roomId) {
        const room = state.rooms.get(session.roomId);
        if (room && room.playerIds.includes(oldId)) {
          cancelRoomCleanup(room.id);
          conn.roomId = room.id;
          state.playerRooms.set(oldId, room.id);
          if (room.status === 'playing') { reconnectPlayer(room, oldId); handleReconnection(room, oldId, registry); }
          else if (room.status === 'waiting') { reconnectPlayer(room, oldId); broadcastLobbyState(room); }
        }
      }
      break;
    }
    case 'set-player-info': {
      const room = getRoom(conn); if (!room) return;
      const err = setPlayerInfo(room, conn.playerId, message.displayName, message.carColor);
      if (err) { conn.send({ type: 'error', message: err }); return; }
      broadcastLobbyState(room);
      break;
    }
    case 'set-ready': {
      const room = getRoom(conn); if (!room) return;
      const err = setPlayerReady(room, conn.playerId, message.ready);
      if (err) { conn.send({ type: 'error', message: err }); return; }
      broadcastLobbyState(room);
      break;
    }
    case 'update-room-config': {
      const room = getRoom(conn); if (!room) return;
      if (room.hostId !== conn.playerId) { conn.send({ type: 'error', message: 'Only the host can update room config' }); return; }
      const err = updateRoomConfig(room, { trackId: message.trackId, lapCount: message.lapCount, maxPlayers: message.maxPlayers, turnTimeoutMs: message.turnTimeoutMs });
      if (err) { conn.send({ type: 'error', message: err }); return; }
      broadcastLobbyState(room);
      break;
    }
    case 'leave-room': {
      const room = getRoom(conn); if (!room) return;
      const result = removePlayer(room, conn.playerId);
      if (result.error) { conn.send({ type: 'error', message: result.error }); return; }
      conn.roomId = null;
      state.playerRooms.delete(conn.playerId);
      const tk = state.playerSessions.get(conn.playerId);
      if (tk) { const s = state.sessions.get(tk); if (s) s.roomId = null; }
      if (room.playerIds.length > 0) broadcastLobbyState(room);
      else { cleanupRoom(room); state.rooms.delete(room.id); state.roomsByCode.delete(room.code); }
      break;
    }
    case 'start-game': {
      const room = getRoom(conn); if (!room) return;
      if (room.hostId !== conn.playerId) { conn.send({ type: 'error', message: 'Only the host can start the game' }); return; }
      if (!canStartGame(room)) { conn.send({ type: 'error', message: 'Not enough players to start' }); return; }
      startGame(room, registry);
      break;
    }
    default: {
      const room = getRoom(conn); if (!room) return;
      handleGameAction(room, conn.playerId, message, registry);
    }
  }
}

function handleClose(conn: WsConnection): void {
  const roomId = conn.roomId ?? state.playerRooms.get(conn.playerId);
  if (roomId) {
    const room = state.rooms.get(roomId);
    if (room) {
      disconnectPlayer(room, conn.playerId);
      if (room.status === 'playing') handleDisconnection(room, conn.playerId, registry);
      else if (room.status === 'waiting') broadcastLobbyState(room);
      if (allPlayersDisconnected(room) && room.status !== 'playing') {
        scheduleRoomCleanup(room);
      }
    }
  }
  state.connections.delete(conn.playerId);
  state.playerRooms.delete(conn.playerId);
}

function scheduleRoomCleanup(room: Room): void {
  cancelRoomCleanup(room.id);
  const timer = setTimeout(() => {
    state.roomCleanupTimers.delete(room.id);
    if (state.rooms.has(room.id) && allPlayersDisconnected(room) && room.status !== 'playing') {
      cleanupRoom(room); state.rooms.delete(room.id); state.roomsByCode.delete(room.code);
    }
  }, WAITING_ROOM_GRACE_PERIOD_MS);
  state.roomCleanupTimers.set(room.id, timer);
}

function cancelRoomCleanup(roomId: string): void {
  const timer = state.roomCleanupTimers.get(roomId);
  if (timer) { clearTimeout(timer); state.roomCleanupTimers.delete(roomId); }
}

function getRoom(conn: WsConnection): Room | null {
  if (!conn.roomId) { conn.send({ type: 'error', message: 'Not in a room' }); return null; }
  const room = state.rooms.get(conn.roomId);
  if (!room) { conn.send({ type: 'error', message: 'Room not found' }); return null; }
  return room;
}

function broadcastLobbyState(room: Room): void {
  if (room.status !== 'waiting') return;
  const lobby = getLobbyState(room);
  registry.broadcast(room, { type: 'lobby-state', lobby });
}

// -- Start --

httpServer.listen(port, () => {
  console.log(`Heat production server running on http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});

function shutdown() {
  console.log('\nShutting down...');
  for (const timer of state.roomCleanupTimers.values()) clearTimeout(timer);
  state.roomCleanupTimers.clear();
  for (const room of state.rooms.values()) cleanupRoom(room);
  wss.close();
  httpServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
