/**
 * Room management for multiplayer Heat games.
 *
 * Handles room lifecycle: creation, joining, player tracking,
 * reconnection, and cleanup.
 */

import type { Room, RoomConfig, RoomStatus } from './types.js';

/**
 * Generate a short room code (6 uppercase alphanumeric chars).
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Generate a unique room ID.
 */
export function generateRoomId(): string {
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new room with the given configuration.
 */
export function createRoom(hostId: string, config: RoomConfig): Room {
  return {
    id: generateRoomId(),
    code: generateRoomCode(),
    hostId,
    status: 'waiting',
    config,
    playerIds: [hostId],
    connectedPlayerIds: new Set([hostId]),
    gameState: null,
    rng: null,
    pendingActions: new Map(),
    turnTimer: null,
    phaseStartedAt: 0,
    createdAt: Date.now(),
  };
}

/**
 * Add a player to a room. Returns error string if invalid.
 */
export function joinRoom(room: Room, playerId: string): string | null {
  if (room.status !== 'waiting') {
    return 'Room is not accepting new players';
  }

  if (room.playerIds.length >= room.config.maxPlayers) {
    return 'Room is full';
  }

  if (room.playerIds.includes(playerId)) {
    return 'Already in this room';
  }

  room.playerIds.push(playerId);
  room.connectedPlayerIds.add(playerId);
  return null;
}

/**
 * Mark a player as disconnected (but keep them in the game).
 */
export function disconnectPlayer(room: Room, playerId: string): boolean {
  if (!room.playerIds.includes(playerId)) return false;
  room.connectedPlayerIds.delete(playerId);
  return true;
}

/**
 * Reconnect a player who was in the room.
 */
export function reconnectPlayer(room: Room, playerId: string): boolean {
  if (!room.playerIds.includes(playerId)) return false;
  room.connectedPlayerIds.add(playerId);
  return true;
}

/**
 * Get the player index for a given player ID.
 */
export function getPlayerIndex(room: Room, playerId: string): number {
  return room.playerIds.indexOf(playerId);
}

/**
 * Check if a player is connected.
 */
export function isPlayerConnected(room: Room, playerId: string): boolean {
  return room.connectedPlayerIds.has(playerId);
}

/**
 * Check if all players are disconnected.
 */
export function allPlayersDisconnected(room: Room): boolean {
  return room.connectedPlayerIds.size === 0;
}

/**
 * Check if enough players have joined to start the game.
 * Requires at least 2 players.
 */
export function canStartGame(room: Room): boolean {
  return room.status === 'waiting' && room.playerIds.length >= 2;
}

/**
 * Update room status.
 */
export function setRoomStatus(room: Room, status: RoomStatus): void {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  room.status = status;
}

/**
 * Clean up a room: clear timers and reset state.
 */
export function cleanupRoom(room: Room): void {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  room.status = 'closed';
  room.pendingActions.clear();
  room.connectedPlayerIds.clear();
}
