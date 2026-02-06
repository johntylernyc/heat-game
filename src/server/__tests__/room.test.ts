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
  it('requires at least 2 players, waiting status, and all ready', () => {
    const room = createRoom('host', defaultConfig);
    expect(canStartGame(room)).toBe(false);

    joinRoom(room, 'player-2');
    // Not ready yet
    expect(canStartGame(room)).toBe(false);

    // Mark both players ready
    setPlayerReady(room, 'host', true);
    setPlayerReady(room, 'player-2', true);
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

// -- Lobby Features --

describe('player info', () => {
  it('assigns default display name and auto-assigns car color', () => {
    const room = createRoom('host', defaultConfig, 'Alice');
    const hostInfo = room.playerInfo.get('host');
    expect(hostInfo?.displayName).toBe('Alice');
    expect(hostInfo?.carColor).toBe('red');

    joinRoom(room, 'player-2', 'Bob');
    const p2Info = room.playerInfo.get('player-2');
    expect(p2Info?.displayName).toBe('Bob');
    expect(p2Info?.carColor).toBe('blue'); // Next available color
  });

  it('auto-assigns display name if not provided', () => {
    const room = createRoom('host', defaultConfig);
    expect(room.playerInfo.get('host')?.displayName).toBe('Player 1');

    joinRoom(room, 'player-2');
    expect(room.playerInfo.get('player-2')?.displayName).toBe('Player 2');
  });
});

describe('setPlayerInfo', () => {
  it('updates display name', () => {
    const room = createRoom('host', defaultConfig, 'Alice');
    const err = setPlayerInfo(room, 'host', 'AliceNew');
    expect(err).toBeNull();
    expect(room.playerInfo.get('host')?.displayName).toBe('AliceNew');
  });

  it('updates car color', () => {
    const room = createRoom('host', defaultConfig);
    const err = setPlayerInfo(room, 'host', undefined, 'green');
    expect(err).toBeNull();
    expect(room.playerInfo.get('host')?.carColor).toBe('green');
  });

  it('rejects duplicate car color', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    // host has 'red', player-2 has 'blue'
    const err = setPlayerInfo(room, 'player-2', undefined, 'red');
    expect(err).toBe('Car color already taken');
  });

  it('allows same player to keep their own color', () => {
    const room = createRoom('host', defaultConfig);
    const err = setPlayerInfo(room, 'host', undefined, 'red');
    expect(err).toBeNull();
  });

  it('rejects invalid display name length', () => {
    const room = createRoom('host', defaultConfig);
    expect(setPlayerInfo(room, 'host', '')).toBe('Display name must be 1-20 characters');
    expect(setPlayerInfo(room, 'host', 'A'.repeat(21))).toBe('Display name must be 1-20 characters');
  });

  it('un-readies player when info changes', () => {
    const room = createRoom('host', defaultConfig);
    setPlayerReady(room, 'host', true);
    expect(room.readyStatus.get('host')).toBe(true);

    setPlayerInfo(room, 'host', 'NewName');
    expect(room.readyStatus.get('host')).toBe(false);
  });

  it('rejects changes after game started', () => {
    const room = createRoom('host', defaultConfig);
    room.status = 'playing';
    expect(setPlayerInfo(room, 'host', 'New')).toBe('Cannot change info after game started');
  });
});

describe('setPlayerReady', () => {
  it('sets and unsets ready status', () => {
    const room = createRoom('host', defaultConfig);
    expect(room.readyStatus.get('host')).toBe(false);

    setPlayerReady(room, 'host', true);
    expect(room.readyStatus.get('host')).toBe(true);

    setPlayerReady(room, 'host', false);
    expect(room.readyStatus.get('host')).toBe(false);
  });

  it('rejects unknown player', () => {
    const room = createRoom('host', defaultConfig);
    expect(setPlayerReady(room, 'unknown', true)).toBe('Not in this room');
  });

  it('rejects after game started', () => {
    const room = createRoom('host', defaultConfig);
    room.status = 'playing';
    expect(setPlayerReady(room, 'host', true)).toBe('Game already started');
  });
});

describe('allPlayersReady', () => {
  it('returns true when all ready', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    setPlayerReady(room, 'host', true);
    setPlayerReady(room, 'player-2', true);
    expect(allPlayersReady(room)).toBe(true);
  });

  it('returns false when any not ready', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    setPlayerReady(room, 'host', true);
    expect(allPlayersReady(room)).toBe(false);
  });
});

describe('updateRoomConfig', () => {
  it('updates track and lap count', () => {
    const room = createRoom('host', defaultConfig);
    const err = updateRoomConfig(room, { trackId: 'italy', lapCount: 3 });
    expect(err).toBeNull();
    expect(room.config.trackId).toBe('italy');
    expect(room.config.lapCount).toBe(3);
  });

  it('clamps maxPlayers to 2-6', () => {
    const room = createRoom('host', defaultConfig);
    updateRoomConfig(room, { maxPlayers: 1 });
    expect(room.config.maxPlayers).toBe(2);

    updateRoomConfig(room, { maxPlayers: 10 });
    expect(room.config.maxPlayers).toBe(6);
  });

  it('rejects reducing maxPlayers below current player count', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'p2');
    joinRoom(room, 'p3');
    const err = updateRoomConfig(room, { maxPlayers: 2 });
    expect(err).toBe('Cannot reduce max players below current player count');
  });

  it('un-readies all players on config change', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'p2');
    setPlayerReady(room, 'host', true);
    setPlayerReady(room, 'p2', true);

    updateRoomConfig(room, { lapCount: 5 });
    expect(room.readyStatus.get('host')).toBe(false);
    expect(room.readyStatus.get('p2')).toBe(false);
  });

  it('rejects after game started', () => {
    const room = createRoom('host', defaultConfig);
    room.status = 'playing';
    expect(updateRoomConfig(room, { lapCount: 5 })).toBe('Cannot change config after game started');
  });
});

describe('removePlayer', () => {
  it('removes player from lobby', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    const result = removePlayer(room, 'player-2');
    expect(result.error).toBeUndefined();
    expect(room.playerIds).toEqual(['host']);
    expect(room.playerInfo.has('player-2')).toBe(false);
    expect(room.readyStatus.has('player-2')).toBe(false);
  });

  it('transfers host when host leaves', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    joinRoom(room, 'player-3');

    const result = removePlayer(room, 'host');
    expect(result.newHostId).toBe('player-2');
    expect(room.hostId).toBe('player-2');
  });

  it('rejects during game', () => {
    const room = createRoom('host', defaultConfig);
    room.status = 'playing';
    expect(removePlayer(room, 'host').error).toBe('Cannot leave during game');
  });

  it('rejects unknown player', () => {
    const room = createRoom('host', defaultConfig);
    expect(removePlayer(room, 'unknown').error).toBe('Not in this room');
  });
});

describe('getAvailableColor', () => {
  it('returns first untaken color', () => {
    const room = createRoom('host', defaultConfig);
    expect(getAvailableColor(room)).toBe('blue'); // red is taken by host
  });

  it('skips taken colors', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'p2');
    joinRoom(room, 'p3');
    // red, blue, green taken (by host, p2, p3)
    expect(getAvailableColor(room)).toBe('yellow');
  });
});

describe('getLobbyState', () => {
  it('builds complete lobby state', () => {
    const room = createRoom('host', defaultConfig, 'Alice');
    joinRoom(room, 'player-2', 'Bob');
    setPlayerReady(room, 'host', true);

    const lobby = getLobbyState(room);
    expect(lobby.roomCode).toBe(room.code);
    expect(lobby.roomId).toBe(room.id);
    expect(lobby.config.trackId).toBe('usa');
    expect(lobby.players).toHaveLength(2);

    const host = lobby.players[0];
    expect(host.playerId).toBe('host');
    expect(host.displayName).toBe('Alice');
    expect(host.carColor).toBe('red');
    expect(host.isReady).toBe(true);
    expect(host.isHost).toBe(true);
    expect(host.isConnected).toBe(true);

    const p2 = lobby.players[1];
    expect(p2.playerId).toBe('player-2');
    expect(p2.displayName).toBe('Bob');
    expect(p2.isReady).toBe(false);
    expect(p2.isHost).toBe(false);

    expect(lobby.canStart).toBe(false); // p2 not ready
  });

  it('reports canStart when all ready', () => {
    const room = createRoom('host', defaultConfig);
    joinRoom(room, 'player-2');
    setPlayerReady(room, 'host', true);
    setPlayerReady(room, 'player-2', true);

    expect(getLobbyState(room).canStart).toBe(true);
  });
});
