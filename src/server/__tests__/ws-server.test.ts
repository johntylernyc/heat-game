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

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function send(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
}

let server: HeatServer | null = null;

afterEach(() => {
  if (server) {
    server.close();
    server = null;
  }
});

describe('WebSocket server', () => {
  it('creates a room and returns room code', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const ws = await connect(TEST_PORT);

    const msgPromise = waitForMessage(ws);
    send(ws, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4 });
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

    const createPromise = waitForMessage(host);
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4 });
    const created = await createPromise;

    if (created.type !== 'room-created') throw new Error('Expected room-created');

    // Both host and joiner get player-joined
    const hostJoinPromise = waitForMessage(host);
    const joinerJoinPromise = waitForMessage(joiner);
    send(joiner, { type: 'join-room', roomCode: created.roomCode });

    const [hostMsg, joinerMsg] = await Promise.all([hostJoinPromise, joinerJoinPromise]);
    expect(hostMsg.type).toBe('player-joined');
    expect(joinerMsg.type).toBe('player-joined');

    if (hostMsg.type === 'player-joined') {
      expect(hostMsg.playerCount).toBe(2);
    }

    host.close();
    joiner.close();
  });

  it('starts a game when host sends start-game', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    // Create room
    const createPromise = waitForMessage(host);
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4 });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    // Join
    const joinPromise = waitForMessage(host);
    send(joiner, { type: 'join-room', roomCode: created.roomCode });
    await joinPromise;

    // Start
    const hostMsgs = waitForMessages(host, 2); // game-started + phase-changed
    const joinerMsgs = waitForMessages(joiner, 2);
    send(host, { type: 'start-game' });

    const [hostResults, joinerResults] = await Promise.all([hostMsgs, joinerMsgs]);

    const hostStarted = hostResults.find(m => m.type === 'game-started');
    const joinerStarted = joinerResults.find(m => m.type === 'game-started');

    expect(hostStarted).toBeDefined();
    expect(joinerStarted).toBeDefined();

    if (hostStarted?.type === 'game-started') {
      expect(hostStarted.state.playerIndex).toBe(0);
      expect(hostStarted.state.self.hand).toHaveLength(7);
    }

    if (joinerStarted?.type === 'game-started') {
      expect(joinerStarted.state.playerIndex).toBe(1);
      expect(joinerStarted.state.self.hand).toHaveLength(7);
    }

    host.close();
    joiner.close();
  });

  it('rejects non-host from starting the game', async () => {
    server = createHeatServer({ port: TEST_PORT, defaultTurnTimeoutMs: 0 });
    const host = await connect(TEST_PORT);
    const joiner = await connect(TEST_PORT);

    const createPromise = waitForMessage(host);
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4 });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    const joinPromise = waitForMessage(host);
    const joinerJoinPromise = waitForMessage(joiner);
    send(joiner, { type: 'join-room', roomCode: created.roomCode });
    await joinPromise;
    await joinerJoinPromise; // Consume the player-joined broadcast

    // Joiner tries to start
    const errorPromise = waitForMessage(joiner);
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

    const msgPromise = waitForMessage(ws);
    send(ws, { type: 'join-room', roomCode: 'XXXXXX' });
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

    const createPromise = waitForMessage(host);
    send(host, { type: 'create-room', trackId: 'usa', lapCount: 2, maxPlayers: 4 });
    const created = await createPromise;
    if (created.type !== 'room-created') throw new Error('Expected room-created');

    const joinPromise = waitForMessage(host);
    send(joiner, { type: 'join-room', roomCode: created.roomCode });
    await joinPromise;

    const hostMsgs = waitForMessages(host, 2);
    const joinerMsgs = waitForMessages(joiner, 2);
    send(host, { type: 'start-game' });

    const [hostResults, joinerResults] = await Promise.all([hostMsgs, joinerMsgs]);
    const hostStarted = hostResults.find(m => m.type === 'game-started');
    const joinerStarted = joinerResults.find(m => m.type === 'game-started');

    if (hostStarted?.type === 'game-started' && joinerStarted?.type === 'game-started') {
      // Host can see own hand
      expect(hostStarted.state.self.hand.length).toBeGreaterThan(0);
      // Host cannot see joiner's hand (opponents have handCount, not hand)
      const joinerAsOpponent = hostStarted.state.opponents[0];
      expect(joinerAsOpponent).not.toHaveProperty('hand');
      expect(joinerAsOpponent.handCount).toBe(7);

      // Joiner can see own hand
      expect(joinerStarted.state.self.hand.length).toBeGreaterThan(0);
      // Joiner cannot see host's hand
      const hostAsOpponent = joinerStarted.state.opponents[0];
      expect(hostAsOpponent).not.toHaveProperty('hand');
      expect(hostAsOpponent.handCount).toBe(7);
    }

    host.close();
    joiner.close();
  });
});
