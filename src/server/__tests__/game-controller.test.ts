import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Room, ServerMessage, Connection, RoomConfig } from '../types.js';
import type { ConnectionRegistry } from '../game-controller.js';
import {
  startGame,
  handleGameAction,
  handleReconnection,
  handleDisconnection,
  getPhaseType,
} from '../game-controller.js';
import { createRoom, joinRoom, disconnectPlayer, reconnectPlayer } from '../room.js';

const defaultConfig: RoomConfig = {
  trackId: 'usa',
  lapCount: 2,
  maxPlayers: 4,
  turnTimeoutMs: 0, // No timer for tests
};

// -- Test Helpers --

interface MockConnection extends Connection {
  messages: ServerMessage[];
}

function createMockRegistry(room: Room): {
  registry: ConnectionRegistry;
  connections: Map<string, MockConnection>;
} {
  const connections = new Map<string, MockConnection>();

  for (const playerId of room.playerIds) {
    connections.set(playerId, {
      id: playerId,
      playerId,
      roomId: room.id,
      messages: [],
      send(msg: ServerMessage) {
        this.messages.push(msg);
      },
    });
  }

  const registry: ConnectionRegistry = {
    getConnection(playerId: string) {
      return connections.get(playerId) ?? null;
    },
    broadcast(room: Room, message: ServerMessage) {
      for (const pid of room.playerIds) {
        if (room.connectedPlayerIds.has(pid)) {
          connections.get(pid)?.messages.push(message);
        }
      }
    },
    sendTo(playerId: string, message: ServerMessage) {
      connections.get(playerId)?.messages.push(message);
    },
  };

  return { registry, connections };
}

function createTestRoom(playerCount: number = 2): Room {
  const room = createRoom('player-0', { ...defaultConfig });
  for (let i = 1; i < playerCount; i++) {
    joinRoom(room, `player-${i}`);
  }
  return room;
}

function getLastMessage(conn: MockConnection): ServerMessage {
  return conn.messages[conn.messages.length - 1];
}

function getMessagesByType(conn: MockConnection, type: string): ServerMessage[] {
  return conn.messages.filter(m => m.type === type);
}

describe('getPhaseType', () => {
  it('classifies phases correctly', () => {
    expect(getPhaseType('gear-shift')).toBe('simultaneous');
    expect(getPhaseType('play-cards')).toBe('simultaneous');
    expect(getPhaseType('discard')).toBe('simultaneous');

    expect(getPhaseType('reveal-and-move')).toBe('sequential-auto');
    expect(getPhaseType('react')).toBe('sequential');
    expect(getPhaseType('slipstream')).toBe('sequential');
    expect(getPhaseType('check-corner')).toBe('sequential-auto');

    expect(getPhaseType('adrenaline')).toBe('automatic');
    expect(getPhaseType('replenish')).toBe('automatic');
  });
});

describe('startGame', () => {
  it('initializes game and sends personalized state to each player', () => {
    const room = createTestRoom(3);
    const { registry, connections } = createMockRegistry(room);

    startGame(room, registry);

    expect(room.status).toBe('playing');
    expect(room.gameState).not.toBeNull();
    expect(room.gameState!.phase).toBe('gear-shift');

    // Each player gets a game-started message with their view
    for (let i = 0; i < 3; i++) {
      const conn = connections.get(`player-${i}`)!;
      const started = conn.messages.find(m => m.type === 'game-started');
      expect(started).toBeDefined();

      if (started && started.type === 'game-started') {
        expect(started.state.playerIndex).toBe(i);
        expect(started.state.self.id).toBe(`player-${i}`);
        expect(started.state.self.hand).toHaveLength(7);
      }
    }
  });

  it('also sends phase-changed for the first phase', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);

    startGame(room, registry);

    const conn = connections.get('player-0')!;
    const phaseChanged = conn.messages.find(m => m.type === 'phase-changed');
    expect(phaseChanged).toBeDefined();
    if (phaseChanged && phaseChanged.type === 'phase-changed') {
      expect(phaseChanged.phase).toBe('gear-shift');
    }
  });
});

describe('simultaneous phase: gear-shift', () => {
  it('advances when all players submit gear selections', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Both players shift gear
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 2 }, registry);
    handleGameAction(room, 'player-1', { type: 'gear-shift', targetGear: 2 }, registry);

    // Should advance to play-cards
    expect(room.gameState!.phase).toBe('play-cards');
  });

  it('does not advance until all connected players act', () => {
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 2 }, registry);

    // Only one player acted — still in gear-shift
    expect(room.gameState!.phase).toBe('gear-shift');
  });

  it('uses default action for disconnected players', () => {
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // Player 1 disconnects
    disconnectPlayer(room, 'player-1');

    // Player 0 acts — should advance since player 1 is disconnected
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 2 }, registry);

    expect(room.gameState!.phase).toBe('play-cards');
    // Disconnected player keeps current gear (default)
    expect(room.gameState!.players[1].gear).toBe(1);
  });

  it('rejects wrong action type for the phase', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Send play-cards during gear-shift
    handleGameAction(room, 'player-0', { type: 'play-cards', cardIndices: [0] }, registry);

    const errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('simultaneous phase: play-cards', () => {
  function advanceToPlayCards(room: Room, registry: ConnectionRegistry) {
    startGame(room, registry);
    for (const pid of room.playerIds) {
      handleGameAction(room, pid, { type: 'gear-shift', targetGear: 1 }, registry);
    }
  }

  it('advances through play-cards to reveal-and-move', () => {
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);
    advanceToPlayCards(room, registry);

    expect(room.gameState!.phase).toBe('play-cards');

    // Each player in gear 1 must play 1 card
    const p0Hand = room.gameState!.players[0].hand;
    const p1Hand = room.gameState!.players[1].hand;

    // Find first playable card for each
    const p0Idx = p0Hand.findIndex(c => c.type === 'speed' || c.type === 'stress' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'));
    const p1Idx = p1Hand.findIndex(c => c.type === 'speed' || c.type === 'stress' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'));

    handleGameAction(room, 'player-0', { type: 'play-cards', cardIndices: [p0Idx] }, registry);
    handleGameAction(room, 'player-1', { type: 'play-cards', cardIndices: [p1Idx] }, registry);

    // Should advance past play-cards. The automatic phases (reveal-and-move is sequential
    // but with default auto-play it advances through multiple phases)
    expect(room.gameState!.phase).not.toBe('play-cards');
  });
});

describe('sequential phase handling', () => {
  it('rejects actions from non-active player', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force game to a sequential phase for testing
    room.gameState!.phase = 'react';
    room.gameState!.activePlayerIndex = 0;

    handleGameAction(room, 'player-1', { type: 'react-done' }, registry);

    const errors = getMessagesByType(connections.get('player-1')!, 'error');
    expect(errors.some(e => e.type === 'error' && e.message === 'Not your turn')).toBe(true);
  });
});

describe('game action validation', () => {
  it('rejects actions when no game in progress', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);

    // Don't start the game
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 2 }, registry);

    const errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(errors.some(e => e.type === 'error' && e.message === 'Game not in progress')).toBe(true);
  });

  it('rejects actions from non-player', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);

    // Add a connection for an outside player
    const outsider: MockConnection = {
      id: 'outsider',
      playerId: 'outsider',
      roomId: room.id,
      messages: [],
      send(msg) { this.messages.push(msg); },
    };
    (connections as Map<string, MockConnection>).set('outsider', outsider);

    startGame(room, registry);
    handleGameAction(room, 'outsider', { type: 'gear-shift', targetGear: 2 }, registry);

    expect(outsider.messages.some(m => m.type === 'error')).toBe(true);
  });
});

describe('reconnection', () => {
  it('sends current state on reconnect', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    disconnectPlayer(room, 'player-1');
    reconnectPlayer(room, 'player-1');

    // Clear messages
    const conn = connections.get('player-1')!;
    conn.messages = [];

    handleReconnection(room, 'player-1', registry);

    const phaseMsg = conn.messages.find(m => m.type === 'phase-changed');
    expect(phaseMsg).toBeDefined();
    if (phaseMsg && phaseMsg.type === 'phase-changed') {
      expect(phaseMsg.state.playerIndex).toBe(1);
      expect(phaseMsg.state.self.id).toBe('player-1');
    }
  });

  it('broadcasts reconnection to other players', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    disconnectPlayer(room, 'player-1');
    reconnectPlayer(room, 'player-1');

    const conn0 = connections.get('player-0')!;
    conn0.messages = [];

    handleReconnection(room, 'player-1', registry);

    const reconnectMsg = conn0.messages.find(m => m.type === 'player-reconnected');
    expect(reconnectMsg).toBeDefined();
  });
});

describe('disconnection', () => {
  it('broadcasts disconnection', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    const conn0 = connections.get('player-0')!;
    conn0.messages = [];

    handleDisconnection(room, 'player-1', registry);

    const disconnectMsg = conn0.messages.find(m => m.type === 'player-disconnected');
    expect(disconnectMsg).toBeDefined();
  });

  it('auto-plays active player if they disconnect during sequential phase', () => {
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // Force to react phase (sequential-input). Player 1 is active, only player in turn order.
    room.gameState!.phase = 'react';
    room.gameState!.activePlayerIndex = 1;
    room.gameState!.turnOrder = [1];

    disconnectPlayer(room, 'player-1');
    handleDisconnection(room, 'player-1', registry);

    // Should have auto-played (end react) and advanced past react
    expect(room.gameState!.phase).not.toBe('react');
  });

  it('advances simultaneous phase when disconnected player was the last holdout', () => {
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // Player 0 acts
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 1 }, registry);
    expect(room.gameState!.phase).toBe('gear-shift');

    // Player 1 disconnects before acting
    disconnectPlayer(room, 'player-1');
    handleDisconnection(room, 'player-1', registry);

    // Should advance past gear-shift
    expect(room.gameState!.phase).not.toBe('gear-shift');
  });
});

describe('full round flow', () => {
  it('completes a round from gear-shift through replenish', () => {
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // Gear shift (simultaneous)
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 1 }, registry);
    handleGameAction(room, 'player-1', { type: 'gear-shift', targetGear: 1 }, registry);
    expect(room.gameState!.phase).toBe('play-cards');

    // Play cards (simultaneous) — gear 1 = 1 card each
    const p0Hand = room.gameState!.players[0].hand;
    const p1Hand = room.gameState!.players[1].hand;

    const findPlayable = (hand: any[]) =>
      hand.findIndex((c: any) =>
        c.type === 'speed' || c.type === 'stress' ||
        (c.type === 'upgrade' && c.subtype !== 'starting-heat')
      );

    handleGameAction(room, 'player-0', { type: 'play-cards', cardIndices: [findPlayable(p0Hand)] }, registry);
    handleGameAction(room, 'player-1', { type: 'play-cards', cardIndices: [findPlayable(p1Hand)] }, registry);

    // After play-cards, the game controller auto-advances through:
    // reveal-and-move (sequential-auto: processes all players automatically)
    // adrenaline (automatic)
    // Then stops at react (sequential-input: needs player input)
    expect(room.gameState!.phase).toBe('react');
  });
});
