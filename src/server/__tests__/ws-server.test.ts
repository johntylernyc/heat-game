import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createHeatServer } from '../ws-server.js';
import type { HeatServer } from '../ws-server.js';
import type { ServerMessage } from '../types.js';

const TEST_PORT = 9876;

function waitForMessage(ws: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

function waitForMessageOfType(ws: WebSocket, type: string): Promise<ServerMessage> {
  return new Promise((resolve) => {
    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      if (msg.type === type) {
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function waitForMessages(ws: WebSocket, count: number): Promise<ServerMessage[]> {
  return new Promise((resolve) => {
    const messages: ServerMessage[] = [];
    const handler = (data: WebSocket.RawData) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length >= count) {
        ws.off('message', handler);
        resolve(messages);
      }
    };
    ws.on('message', handler);
  });
}

function collectMessages(ws: WebSocket): ServerMessage[] {
  const messages: ServerMessage[] = [];
  ws.on('message', (data: WebSocket.RawData) => {
    messages.push(JSON.parse(data.toString()));
  });
  return messages;
}

/**
 * Connect and consume the initial session-created message.
 * Resolves only after session-created has been received.
 */
function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('error', reject);
    ws.once('message', () => {
      // session-created consumed, connection ready
      resolve(ws);
    });
  });
}

/**
 * Connect and return both the WebSocket and session info.
 */
function connectWithSession(port: number): Promise<{ ws: WebSocket; sessionToken: string; playerId: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('error', reject);
    ws.once('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      if (msg.type === 'session-created') {
        resolve({ ws, sessionToken: msg.sessionToken, playerId: msg.playerId });
      } else {
        reject(new Error(`Expected session-created, got ${msg.type}`));
      }
    });
  });
}

function send(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

let server: HeatServer | null = null;

afterEach(() => {
  if (server) {
    server.close();
    server = null;
  }
});

describe('WebSocket server', () => {
  it('sends session token on connect', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const { ws, sessionToken, playerId } = await connectWithSession(TEST_PORT);

    expect(sessionToken).toBeTruthy();
    expect(playerId).toBeTruthy();

    ws.close();
  });

  it('creates a room and returns room code', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const ws = await connect(TEST_PORT);

    const msgPromise = waitForMessageOfType(ws, 'room-created');
    send(ws, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const msg = await msgPromise;

    expect(msg.type).toBe('room-created');
    if (msg.type === 'room-created') {
      expect(msg.roomCode).toHaveLength(6);
      expect(msg.roomId).toBeTruthy();
    }

    ws.close();
  });

  it('allows a second player to join by room code', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    const createPromise = waitForMessageOfType(host, 'room-created');
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const created = await createPromise;

    if (created.type !== 'room-created') throw new Error('Expected room-created');

    // Both should get player-joined
    const hostJoinPromise = waitForMessageOfType(host, 'player-joined');
    const joinerJoinPromise = waitForMessageOfType(joiner, 'player-joined');
    send(joiner, { type: 'join-room', roomCode: created.roomCode, displayName: 'Bob' });

    const [hostMsg, joinerMsg] = await Promise.all([hostJoinPromise, joinerJoinPromise]);
    expect(hostMsg.type).toBe('player-joined');
    expect(joinerMsg.type).toBe('player-joined');

    if (hostMsg.type === 'player-joined') {
      expect(hostMsg.playerCount).toBe(2);
    }

    host.close();
    joiner.close();
  });

  it('broadcasts lobby state after join', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    const createPromise = waitForMessageOfType(host, 'room-created');
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    // Set up lobby-state listener BEFORE sending join (so we catch the broadcast)
    const lobbyPromise = waitForMessageOfType(host, 'lobby-state');
    send(joiner, { type: 'join-room', roomCode: created.roomCode, displayName: 'Bob' });

    const hostLobby = await lobbyPromise;
    expect(hostLobby.type).toBe('lobby-state');
    if (hostLobby.type === 'lobby-state') {
      expect(hostLobby.lobby.players).toHaveLength(2);
      expect(hostLobby.lobby.players[0].displayName).toBe('Alice');
      expect(hostLobby.lobby.players[0].isHost).toBe(true);
      expect(hostLobby.lobby.players[1].displayName).toBe('Bob');
    }

    host.close();
    joiner.close();
  });

  it('handles player ready status', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    const createPromise = waitForMessageOfType(host, 'room-created');
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    // Join
    const joinPromise = waitForMessageOfType(host, 'player-joined');
    send(joiner, { type: 'join-room', roomCode: created.roomCode, displayName: 'Bob' });
    await joinPromise;
    await delay(20);

    // Set host ready
    const lobbyPromise = waitForMessageOfType(host, 'lobby-state');
    send(host, { type: 'set-ready', ready: true });
    const lobby = await lobbyPromise;

    if (lobby.type === 'lobby-state') {
      const hostPlayer = lobby.lobby.players.find(p => p.isHost);
      expect(hostPlayer?.isReady).toBe(true);
      expect(lobby.lobby.canStart).toBe(false); // joiner not ready
    }

    host.close();
    joiner.close();
  });

  it('starts a game when host sends start-game with all ready', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    // Create room
    const createPromise = waitForMessageOfType(host, 'room-created');
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    // Join
    const joinPromise = waitForMessageOfType(host, 'player-joined');
    send(joiner, { type: 'join-room', roomCode: created.roomCode, displayName: 'Bob' });
    await joinPromise;
    await delay(20);

    // Ready up both players
    send(host, { type: 'set-ready', ready: true });
    await delay(20);
    send(joiner, { type: 'set-ready', ready: true });
    await delay(20);

    // Start
    const hostStarted = waitForMessageOfType(host, 'game-started');
    const joinerStarted = waitForMessageOfType(joiner, 'game-started');
    send(host, { type: 'start-game' });

    const [hostMsg, joinerMsg] = await Promise.all([hostStarted, joinerStarted]);

    expect(hostMsg.type).toBe('game-started');
    expect(joinerMsg.type).toBe('game-started');

    if (hostMsg.type === 'game-started') {
      expect(hostMsg.state.playerIndex).toBe(0);
      expect(hostMsg.state.self.hand).toHaveLength(7);
    }

    if (joinerMsg.type === 'game-started') {
      expect(joinerMsg.state.playerIndex).toBe(1);
      expect(joinerMsg.state.self.hand).toHaveLength(7);
    }

    host.close();
    joiner.close();
  });

  it('rejects non-host from starting the game', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    const createPromise = waitForMessageOfType(host, 'room-created');
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    const joinPromise = waitForMessageOfType(host, 'player-joined');
    send(joiner, { type: 'join-room', roomCode: created.roomCode, displayName: 'Bob' });
    await joinPromise;
    await delay(20);

    // Joiner tries to start
    const errorPromise = waitForMessageOfType(joiner, 'error');
    send(joiner, { type: 'start-game' });
    const error = await errorPromise;

    expect(error.type).toBe('error');
    if (error.type === 'error') {
      expect(error.message).toBe('Only the host can start the game');
    }

    host.close();
    joiner.close();
  });

  it('rejects room join with invalid code', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const ws = await connect(TEST_PORT);

    const msgPromise = waitForMessageOfType(ws, 'error');
    send(ws, { type: 'join-room', roomCode: 'XXXXXX', displayName: 'Test' });
    const msg = await msgPromise;

    expect(msg.type).toBe('error');
    if (msg.type === 'error') {
      expect(msg.message).toBe('Room not found');
    }

    ws.close();
  });

  it('enforces hidden information in state partitioning', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    const createPromise = waitForMessageOfType(host, 'room-created');
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    const joinPromise = waitForMessageOfType(host, 'player-joined');
    send(joiner, { type: 'join-room', roomCode: created.roomCode, displayName: 'Bob' });
    await joinPromise;
    await delay(20);

    // Ready up
    send(host, { type: 'set-ready', ready: true });
    await delay(20);
    send(joiner, { type: 'set-ready', ready: true });
    await delay(20);

    const hostStarted = waitForMessageOfType(host, 'game-started');
    const joinerStarted = waitForMessageOfType(joiner, 'game-started');
    send(host, { type: 'start-game' });

    const [hostMsg, joinerMsg] = await Promise.all([hostStarted, joinerStarted]);

    if (hostMsg.type === 'game-started' && joinerMsg.type === 'game-started') {
      // Host can see own hand
      expect(hostMsg.state.self.hand.length).toBeGreaterThan(0);
      // Host cannot see joiner's hand (opponents have handCount, not hand)
      const joinerAsOpponent = hostMsg.state.opponents[0];
      expect(joinerAsOpponent).not.toHaveProperty('hand');
      expect(joinerAsOpponent.handCount).toBe(7);

      // Joiner can see own hand
      expect(joinerMsg.state.self.hand.length).toBeGreaterThan(0);
      // Joiner cannot see host's hand
      const hostAsOpponent = joinerMsg.state.opponents[0];
      expect(hostAsOpponent).not.toHaveProperty('hand');
      expect(hostAsOpponent.handCount).toBe(7);
    }

    host.close();
    joiner.close();
  });

  it('handles player leaving the lobby', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    const createPromise = waitForMessageOfType(host, 'room-created');
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    const joinPromise = waitForMessageOfType(host, 'player-joined');
    send(joiner, { type: 'join-room', roomCode: created.roomCode, displayName: 'Bob' });
    await joinPromise;
    await delay(20);

    // Joiner leaves
    const leftPromise = waitForMessageOfType(host, 'player-left');
    send(joiner, { type: 'leave-room' });
    const leftMsg = await leftPromise;

    expect(leftMsg.type).toBe('player-left');
    if (leftMsg.type === 'player-left') {
      expect(leftMsg.playerCount).toBe(1);
    }

    host.close();
    joiner.close();
  });

  it('handles car color selection', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const ws = await connect(TEST_PORT);

    const createPromise = waitForMessageOfType(ws, 'room-created');
    send(ws, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    await createPromise;

    // Change car color
    const lobbyPromise = waitForMessageOfType(ws, 'lobby-state');
    send(ws, { type: 'set-player-info', carColor: 'green' });
    const lobby = await lobbyPromise;

    if (lobby.type === 'lobby-state') {
      expect(lobby.lobby.players[0].carColor).toBe('green');
    }

    ws.close();
  });

  it('handles room config updates by host', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const ws = await connect(TEST_PORT);

    const createPromise = waitForMessageOfType(ws, 'room-created');
    send(ws, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    await createPromise;

    // Update config
    const lobbyPromise = waitForMessageOfType(ws, 'lobby-state');
    send(ws, { type: 'update-room-config', trackId: 'italy', lapCount: 3 });
    const lobby = await lobbyPromise;

    if (lobby.type === 'lobby-state') {
      expect(lobby.lobby.config.trackId).toBe('italy');
      expect(lobby.lobby.config.lapCount).toBe(3);
    }

    ws.close();
  });

  describe('create-room input validation', () => {
    it('rejects empty displayName', async () => {
      server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
      const ws = await connect(TEST_PORT);

      const msgPromise = waitForMessageOfType(ws, 'error');
      send(ws, { type: 'create-room', trackId: 'usa', lapCount: 1, maxPlayers: 4, displayName: '' });
      const msg = await msgPromise;

      expect(msg.type).toBe('error');
      if (msg.type === 'error') {
        expect(msg.message).toBe('Display name is required');
      }

      ws.close();
    });

    it('rejects missing displayName', async () => {
      server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
      const ws = await connect(TEST_PORT);

      const msgPromise = waitForMessageOfType(ws, 'error');
      send(ws, { type: 'create-room', trackId: 'usa', lapCount: 1, maxPlayers: 4 });
      const msg = await msgPromise;

      expect(msg.type).toBe('error');
      if (msg.type === 'error') {
        expect(msg.message).toBe('Display name is required');
      }

      ws.close();
    });

    it('rejects invalid trackId', async () => {
      server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
      const ws = await connect(TEST_PORT);

      const msgPromise = waitForMessageOfType(ws, 'error');
      send(ws, { type: 'create-room', trackId: 'fake', lapCount: 1, maxPlayers: 4, displayName: 'Alice' });
      const msg = await msgPromise;

      expect(msg.type).toBe('error');
      if (msg.type === 'error') {
        expect(msg.message).toBe('Invalid track: fake');
      }

      ws.close();
    });

    it('rejects lapCount of 0', async () => {
      server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
      const ws = await connect(TEST_PORT);

      const msgPromise = waitForMessageOfType(ws, 'error');
      send(ws, { type: 'create-room', trackId: 'usa', lapCount: 0, maxPlayers: 4, displayName: 'Alice' });
      const msg = await msgPromise;

      expect(msg.type).toBe('error');
      if (msg.type === 'error') {
        expect(msg.message).toBe('Lap count must be between 1 and 3');
      }

      ws.close();
    });

    it('rejects lapCount greater than 3', async () => {
      server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
      const ws = await connect(TEST_PORT);

      const msgPromise = waitForMessageOfType(ws, 'error');
      send(ws, { type: 'create-room', trackId: 'usa', lapCount: 5, maxPlayers: 4, displayName: 'Alice' });
      const msg = await msgPromise;

      expect(msg.type).toBe('error');
      if (msg.type === 'error') {
        expect(msg.message).toBe('Lap count must be between 1 and 3');
      }

      ws.close();
    });

    it('rejects maxPlayers of 1', async () => {
      server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
      const ws = await connect(TEST_PORT);

      const msgPromise = waitForMessageOfType(ws, 'error');
      send(ws, { type: 'create-room', trackId: 'usa', lapCount: 1, maxPlayers: 1, displayName: 'Alice' });
      const msg = await msgPromise;

      expect(msg.type).toBe('error');
      if (msg.type === 'error') {
        expect(msg.message).toBe('Max players must be between 2 and 6');
      }

      ws.close();
    });

    it('rejects maxPlayers of 7', async () => {
      server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
      const ws = await connect(TEST_PORT);

      const msgPromise = waitForMessageOfType(ws, 'error');
      send(ws, { type: 'create-room', trackId: 'usa', lapCount: 1, maxPlayers: 7, displayName: 'Alice' });
      const msg = await msgPromise;

      expect(msg.type).toBe('error');
      if (msg.type === 'error') {
        expect(msg.message).toBe('Max players must be between 2 and 6');
      }

      ws.close();
    });

    it('accepts valid parameters at boundaries', async () => {
      server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
      const ws = await connect(TEST_PORT);

      const msgPromise = waitForMessageOfType(ws, 'room-created');
      send(ws, { type: 'create-room', trackId: 'italy', lapCount: 3, maxPlayers: 6, displayName: 'Alice' });
      const msg = await msgPromise;

      expect(msg.type).toBe('room-created');

      ws.close();
    });
  });

  it('supports session resumption', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const { ws: ws1, sessionToken, playerId } = await connectWithSession(TEST_PORT);

    // Create a room
    const createPromise = waitForMessageOfType(ws1, 'room-created');
    send(ws1, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4, displayName: 'Alice' });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    // Disconnect
    ws1.close();
    await delay(50);

    // Reconnect with new WebSocket
    const ws2 = await connect(TEST_PORT);

    // Resume session
    const resumePromise = waitForMessageOfType(ws2, 'session-created');
    send(ws2, { type: 'resume-session', sessionToken });
    const resumed = await resumePromise;

    if (resumed.type === 'session-created') {
      expect(resumed.playerId).toBe(playerId);
      expect(resumed.sessionToken).toBe(sessionToken);
    }

    ws2.close();
  });
});
