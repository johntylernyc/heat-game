import { describe, it, expect } from 'vitest';
import {
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
} from '../room.js';
import type { RoomConfig } from '../types.js';

const defaultConfig: RoomConfig = {
  trackId: 'usa',
  lapCount: 2,
  maxPlayers: 4,
  turnTimeoutMs: 60000,
};

describe('generateRoomCode', () => {
  it('generates 6-character uppercase codes', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it('excludes ambiguous characters', () => {
    // Run many times to check no I, O, 0, or 1
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[IO01]/);
    }
  });
});

describe('createRoom', () => {
  it('creates a room with host as first player', () => {
    const room = createRoom('host-1', defaultConfig);

    expect(room.hostId).toBe('host-1');
    expect(room.status).toBe('waiting');
    expect(room.playerIds).toEqual(['host-1']);
    expect(room.connectedPlayerIds.has('host-1')).toBe(true);
    expect(room.gameState).toBeNull();
    expect(room.config).toEqual(defaultConfig);
    expect(room.id).toBeTruthy();
    expect(room.code).toHaveLength(6);
  });
});

describe('joinRoom', () => {
  it('adds a player to a waiting room', () => {
    const room = createRoom('host', defaultConfig);
    const err = joinRoom(room, 'player-2');

    expect(err).toBeNull();
    expect(room.playerIds).toEqual(['host', 'player-2']);
    expect(room.connectedPlayerIds.has('player-2')).toBe(true);
  });

  it('rejects join when room is full', () => {
    const room = createRoom('host', { ...defaultConfig, maxPlayers: 2 });
    joinRoom(room, 'player-2');
    const err = joinRoom(room, 'player-3');

    expect(err).toBe('Room is full');
    expect(room.playerIds).toHaveLength(2);
  });

  it('rejects join when room is not waiting', () => {
    const room = createRoom('host', defaultConfig);
    room.status = 'playing';
    const err = joinRoom(room, 'player-2');

    expect(err).toBe('Room is not accepting new players');
  });

  it('rejects duplicate player', () => {
    const room = createRoom('host', defaultConfig);
    const err = joinRoom(room, 'host');

    expect(err).toBe('Already in this room');
  });
});

describe('disconnect/reconnect', () => {
  it('marks player as disconnected', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');

    expect(disconnectPlayer(room, 'player-2')).toBe(true);
    expect(isPlayerConnected(room, 'player-2')).toBe(false);
    // Player still in playerIds
    expect(room.playerIds).toContain('player-2');
  });

  it('reconnects a disconnected player', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    disconnectPlayer(room, 'player-2');

    expect(reconnectPlayer(room, 'player-2')).toBe(true);
    expect(isPlayerConnected(room, 'player-2')).toBe(true);
  });

  it('returns false for unknown player', () => {
    const room = createRoom('host', defaultConfig);
    expect(disconnectPlayer(room, 'unknown')).toBe(false);
    expect(reconnectPlayer(room, 'unknown')).toBe(false);
  });
});

describe('getPlayerIndex', () => {
  it('returns correct index', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    joinRoom(room, 'player-3');

    expect(getPlayerIndex(room, 'host')).toBe(0);
    expect(getPlayerIndex(room, 'player-2')).toBe(1);
    expect(getPlayerIndex(room, 'player-3')).toBe(2);
    expect(getPlayerIndex(room, 'unknown')).toBe(-1);
  });
});

describe('allPlayersDisconnected', () => {
  it('returns true when all disconnected', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    disconnectPlayer(room, 'host');
    disconnectPlayer(room, 'player-2');

    expect(allPlayersDisconnected(room)).toBe(true);
  });

  it('returns false when any connected', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    disconnectPlayer(room, 'player-2');

    expect(allPlayersDisconnected(room)).toBe(false);
  });
});

describe('canStartGame', () => {
  it('requires at least 2 players and waiting status', () => {
    const room = createRoom('host', defaultConfig);
    expect(canStartGame(room)).toBe(false);

    joinRoom(room, 'player-2');
    expect(canStartGame(room)).toBe(true);

    room.status = 'playing';
    expect(canStartGame(room)).toBe(false);
  });
});

describe('setRoomStatus', () => {
  it('updates status and clears timer', () => {
    const room = createRoom('host', defaultConfig);
    room.turnTimer = setTimeout(() => {}, 1000);

    setRoomStatus(room, 'finished');
    expect(room.status).toBe('finished');
    expect(room.turnTimer).toBeNull();
  });
});

describe('cleanupRoom', () => {
  it('clears all state', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    room.turnTimer = setTimeout(() => {}, 1000);
    room.pendingActions.set(0, {});

    cleanupRoom(room);

    expect(room.status).toBe('closed');
    expect(room.pendingActions.size).toBe(0);
    expect(room.connectedPlayerIds.size).toBe(0);
    expect(room.turnTimer).toBeNull();
  });
});
