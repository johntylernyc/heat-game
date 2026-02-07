/**
 * Room management for multiplayer Heat games.
 *
 * Handles room lifecycle: creation, joining, player tracking,
 * reconnection, lobby state, and cleanup.
 */

import type { Room, RoomConfig, RoomStatus, CarColor, PlayerInfo, LobbyState, LobbyPlayer } from './types.js';
import { CAR_COLORS } from './types.js';

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
export function createRoom(hostId: string, config: RoomConfig, displayName?: string): Room {
  const now = Date.now();
  const info: PlayerInfo = {
    displayName: displayName ?? 'Player 1',
    carColor: CAR_COLORS[0],
  };

  return {
    id: generateRoomId(),
    code: generateRoomCode(),
    hostId,
    status: 'waiting',
    config: { ...config },
    playerIds: [hostId],
    connectedPlayerIds: new Set([hostId]),
    playerInfo: new Map([[hostId, info]]),
    readyStatus: new Map([[hostId, false]]),
    gameState: null,
    rng: null,
    pendingActions: new Map(),
    turnTimer: null,
    phaseStartedAt: 0,
    lastActivityAt: now,
    createdAt: now,
  };
}

/**
 * Get the first car color not already taken in the room.
 */
export function getAvailableColor(room: Room): CarColor {
  const taken = new Set<CarColor>();
  for (const info of room.playerInfo.values()) {
    taken.add(info.carColor);
  }
  for (const color of CAR_COLORS) {
    if (!taken.has(color)) return color;
  }
  return CAR_COLORS[0]; // Fallback (shouldn't happen with max 6 players)
}

/**
 * Add a player to a room. Returns error string if invalid.
 */
export function joinRoom(room: Room, playerId: string, displayName?: string): string | null {
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

  const info: PlayerInfo = {
    displayName: displayName ?? `Player ${room.playerIds.length}`,
    carColor: getAvailableColor(room),
  };
  room.playerInfo.set(playerId, info);
  room.readyStatus.set(playerId, false);
  room.lastActivityAt = Date.now();

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
 * Check if enough players have joined and all are ready to start the game.
 * Requires at least 2 players (or 1 in qualifying mode) and all players marked ready.
 */
export function canStartGame(room: Room): boolean {
  if (room.status !== 'waiting') return false;
  const minPlayers = room.config.mode === 'qualifying' ? 1 : 2;
  if (room.playerIds.length < minPlayers) return false;
  return allPlayersReady(room);
}

/**
 * Check if all players in the room are marked as ready.
 */
export function allPlayersReady(room: Room): boolean {
  for (const playerId of room.playerIds) {
    if (!room.readyStatus.get(playerId)) return false;
  }
  return true;
}

/**
 * Set a player's ready status.
 */
export function setPlayerReady(room: Room, playerId: string, ready: boolean): string | null {
  if (!room.playerIds.includes(playerId)) return 'Not in this room';
  if (room.status !== 'waiting') return 'Game already started';

  room.readyStatus.set(playerId, ready);
  room.lastActivityAt = Date.now();
  return null;
}

/**
 * Set a player's display name and/or car color. Validates color uniqueness.
 */
export function setPlayerInfo(
  room: Room,
  playerId: string,
  displayName?: string,
  carColor?: CarColor,
): string | null {
  if (!room.playerIds.includes(playerId)) return 'Not in this room';
  if (room.status !== 'waiting') return 'Cannot change info after game started';

  const existing = room.playerInfo.get(playerId);
  if (!existing) return 'Player info not found';

  if (carColor !== undefined) {
    // Check color not taken by another player
    for (const [pid, info] of room.playerInfo) {
      if (pid !== playerId && info.carColor === carColor) {
        return 'Car color already taken';
      }
    }
    existing.carColor = carColor;
  }

  if (displayName !== undefined) {
    if (displayName.length === 0 || displayName.length > 20) {
      return 'Display name must be 1-20 characters';
    }
    existing.displayName = displayName;
  }

  // Un-ready the player when they change info
  room.readyStatus.set(playerId, false);
  room.lastActivityAt = Date.now();

  return null;
}

/**
 * Update room config (host only). Returns error string if invalid.
 */
export function updateRoomConfig(
  room: Room,
  updates: { trackId?: string; lapCount?: number; maxPlayers?: number; turnTimeoutMs?: number },
): string | null {
  if (room.status !== 'waiting') return 'Cannot change config after game started';

  if (updates.maxPlayers !== undefined) {
    const clamped = Math.min(Math.max(updates.maxPlayers, 2), 6);
    if (clamped < room.playerIds.length) {
      return 'Cannot reduce max players below current player count';
    }
    room.config.maxPlayers = clamped;
  }

  if (updates.trackId !== undefined) room.config.trackId = updates.trackId;
  if (updates.lapCount !== undefined) room.config.lapCount = Math.max(1, updates.lapCount);
  if (updates.turnTimeoutMs !== undefined) room.config.turnTimeoutMs = Math.max(0, updates.turnTimeoutMs);

  // Un-ready all players when config changes
  for (const playerId of room.playerIds) {
    room.readyStatus.set(playerId, false);
  }
  room.lastActivityAt = Date.now();

  return null;
}

/**
 * Remove a player from the lobby (before game starts).
 * If the host leaves, the next player becomes host.
 * Returns the new host ID if host changed, null otherwise.
 */
export function removePlayer(room: Room, playerId: string): { error?: string; newHostId?: string } {
  if (!room.playerIds.includes(playerId)) return { error: 'Not in this room' };
  if (room.status !== 'waiting') return { error: 'Cannot leave during game' };

  room.playerIds = room.playerIds.filter(id => id !== playerId);
  room.connectedPlayerIds.delete(playerId);
  room.playerInfo.delete(playerId);
  room.readyStatus.delete(playerId);
  room.lastActivityAt = Date.now();

  let newHostId: string | undefined;

  if (room.hostId === playerId && room.playerIds.length > 0) {
    newHostId = room.playerIds[0];
    room.hostId = newHostId;
    // New host is un-readied
    room.readyStatus.set(newHostId, false);
  }

  return { newHostId };
}

/**
 * Build the lobby state for broadcasting to clients.
 */
export function getLobbyState(room: Room): LobbyState {
  const players: LobbyPlayer[] = room.playerIds.map(pid => {
    const info = room.playerInfo.get(pid);
    return {
      playerId: pid,
      displayName: info?.displayName ?? 'Unknown',
      carColor: info?.carColor ?? 'red',
      isReady: room.readyStatus.get(pid) ?? false,
      isConnected: room.connectedPlayerIds.has(pid),
      isHost: pid === room.hostId,
    };
  });

  return {
    roomId: room.id,
    roomCode: room.code,
    config: { ...room.config },
    players,
    canStart: canStartGame(room),
  };
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
