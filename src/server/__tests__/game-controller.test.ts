import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Room, ServerMessage, Connection, RoomConfig } from '../types.js';
import type { ConnectionRegistry } from '../game-controller.js';
import {
  startGame,
  handleGameAction,
  handleReconnection,
  handleDisconnection,
  isStaleAction,
} from '../game-controller.js';
import { getPhaseType } from '../state-partition.js';
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

  it('passes track config to engine state', () => {
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);

    startGame(room, registry);

    const state = room.gameState!;
    // USA track: 48 spaces, 3 corners, start/finish at 0
    expect(state.totalSpaces).toBe(48);
    expect(state.startFinishLine).toBe(0);
    expect(state.trackId).toBe('usa');
    expect(state.corners).toHaveLength(3);
    expect(state.corners[0]).toEqual({ id: 1, speedLimit: 5, position: 16 });
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

  it('silently ignores stale action type for the phase', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    const conn = connections.get('player-0')!;
    const msgsBefore = conn.messages.length;

    // Send play-cards during gear-shift — a known game action but wrong phase
    handleGameAction(room, 'player-0', { type: 'play-cards', cardIndices: [0] }, registry);

    // Should be silently ignored (no error, no new messages)
    const errors = getMessagesByType(conn, 'error');
    expect(errors).toHaveLength(0);
    expect(conn.messages.length).toBe(msgsBefore);
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

describe('reconnection race condition (ht-vlkj)', () => {
  it('stale disconnect after reconnection should not trigger phase advancement', () => {
    // Reproduces ht-vlkj: player reconnects via resume-session, then old
    // WebSocket fires close event. The stale disconnection should not undo the
    // reconnection or trigger allPlayersActed → premature phase execution.
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // We're in gear-shift phase (simultaneous)
    expect(room.gameState!.phase).toBe('gear-shift');

    // Simulate: player-1 disconnects (page refresh — old WS closes)
    disconnectPlayer(room, 'player-1');

    // Before the old WS close handler runs, player-1 reconnects via resume-session
    reconnectPlayer(room, 'player-1');
    handleReconnection(room, 'player-1', registry);

    // Player is back, but old WS close event fires AFTER reconnection.
    // In the buggy code, this would call disconnectPlayer + handleDisconnection again,
    // removing the player and potentially triggering allPlayersActed().
    //
    // The fix prevents handleClose from running when the connection has been superseded.
    // But at the game-controller level, we can verify the invariant: if player-1 is
    // connected, the phase should NOT advance with only player-0's action.

    // Player-0 submits gear-shift
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 1 }, registry);

    // Phase should NOT have advanced — player-1 hasn't acted
    expect(room.gameState!.phase).toBe('gear-shift');

    // Player-1 submits — NOW it should advance
    handleGameAction(room, 'player-1', { type: 'gear-shift', targetGear: 1 }, registry);
    expect(room.gameState!.phase).toBe('play-cards');
  });

  it('stale disconnect of ALL players should not auto-execute phase with defaults', () => {
    // The worst case of ht-vlkj: all players refresh simultaneously.
    // Without the fix, all players get disconnected by stale close handlers,
    // allPlayersActed() returns true (no connected players), and the phase
    // executes with all default actions.
    const room = createTestRoom(3);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    expect(room.gameState!.phase).toBe('gear-shift');

    // All 3 players disconnect and immediately reconnect (page refresh)
    for (let i = 0; i < 3; i++) {
      disconnectPlayer(room, `player-${i}`);
      reconnectPlayer(room, `player-${i}`);
    }

    // All 3 players should be connected
    for (let i = 0; i < 3; i++) {
      expect(room.connectedPlayerIds.has(`player-${i}`)).toBe(true);
    }

    // If stale handleDisconnection were called for all, allPlayersActed would
    // return true with empty pendingActions. Verify phase didn't advance:
    expect(room.gameState!.phase).toBe('gear-shift');
    expect(room.pendingActions.size).toBe(0);
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

describe('stale action handling', () => {
  it('isStaleAction returns true for known action in wrong phase', () => {
    expect(isStaleAction('slipstream', { type: 'react-done' } as any)).toBe(true);
    expect(isStaleAction('gear-shift', { type: 'react-done' } as any)).toBe(true);
    expect(isStaleAction('discard', { type: 'slipstream', accept: true } as any)).toBe(true);
  });

  it('isStaleAction returns false for valid action in correct phase', () => {
    expect(isStaleAction('react', { type: 'react-done' } as any)).toBe(false);
    expect(isStaleAction('react', { type: 'react-cooldown', heatIndices: [] } as any)).toBe(false);
    expect(isStaleAction('slipstream', { type: 'slipstream', accept: true } as any)).toBe(false);
    expect(isStaleAction('gear-shift', { type: 'gear-shift', targetGear: 2 } as any)).toBe(false);
  });

  it('isStaleAction returns false for unknown action types', () => {
    // Unknown action types are NOT stale — they should still produce errors
    expect(isStaleAction('react', { type: 'start-game' } as any)).toBe(false);
    expect(isStaleAction('gear-shift', { type: 'leave-room' } as any)).toBe(false);
  });

  it('silently ignores stale react-done arriving during slipstream phase', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force game to slipstream phase
    room.gameState!.phase = 'slipstream';
    room.gameState!.activePlayerIndex = 0;
    room.gameState!.turnOrder = [0, 1];

    const conn1 = connections.get('player-1')!;
    const msgsBefore = conn1.messages.length;

    // Player 1 sends stale react-done from previous phase
    handleGameAction(room, 'player-1', { type: 'react-done' }, registry);

    // Should be silently ignored — no error message
    const errors = getMessagesByType(conn1, 'error');
    expect(errors).toHaveLength(0);
    expect(conn1.messages.length).toBe(msgsBefore);

    // Phase should not have changed
    expect(room.gameState!.phase).toBe('slipstream');
  });

  it('silently ignores stale slipstream arriving during discard phase', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force game to discard phase
    room.gameState!.phase = 'discard';

    const conn0 = connections.get('player-0')!;
    const msgsBefore = conn0.messages.length;

    // Player 0 sends stale slipstream from previous phase
    handleGameAction(room, 'player-0', { type: 'slipstream', accept: true }, registry);

    const errors = getMessagesByType(conn0, 'error');
    expect(errors).toHaveLength(0);
    expect(conn0.messages.length).toBe(msgsBefore);
    expect(room.gameState!.phase).toBe('discard');
  });

  it('silently ignores stale action during automatic phase', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force game to adrenaline (automatic) phase
    room.gameState!.phase = 'adrenaline';

    const conn0 = connections.get('player-0')!;
    const msgsBefore = conn0.messages.length;

    // Player sends stale react-done during automatic phase
    handleGameAction(room, 'player-0', { type: 'react-done' }, registry);

    const errors = getMessagesByType(conn0, 'error');
    expect(errors).toHaveLength(0);
    expect(conn0.messages.length).toBe(msgsBefore);
  });

  it('silently ignores stale action during sequential-auto phase', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force game to reveal-and-move (sequential-auto) phase
    room.gameState!.phase = 'reveal-and-move';
    room.gameState!.activePlayerIndex = 0;

    const conn1 = connections.get('player-1')!;
    const msgsBefore = conn1.messages.length;

    // Player sends stale gear-shift during sequential-auto phase
    handleGameAction(room, 'player-1', { type: 'gear-shift', targetGear: 2 }, registry);

    const errors = getMessagesByType(conn1, 'error');
    expect(errors).toHaveLength(0);
    expect(conn1.messages.length).toBe(msgsBefore);
  });
});

describe('simultaneous phase error routing (ht-fcyn)', () => {
  it('sends gear-shift error to the offending player, not the batch trigger', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    expect(room.gameState!.phase).toBe('gear-shift');

    // Player 0 submits invalid gear shift (jump from 1 to 4 = +3, too far)
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 4 as any }, registry);

    // Player 0 should get the error (their action was invalid)
    const p0Errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(p0Errors.length).toBeGreaterThan(0);
    expect((p0Errors[0] as any).message).toContain('gear shift');

    // Player 1 should NOT get any error
    const p1Errors = getMessagesByType(connections.get('player-1')!, 'error');
    expect(p1Errors).toHaveLength(0);

    // Phase should still be gear-shift (player 0's action was rejected)
    expect(room.gameState!.phase).toBe('gear-shift');
  });

  it('sends play-cards error to the offending player, not the batch trigger', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Advance to play-cards
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 1 }, registry);
    handleGameAction(room, 'player-1', { type: 'gear-shift', targetGear: 1 }, registry);
    expect(room.gameState!.phase).toBe('play-cards');

    // Clear messages from gear-shift phase
    connections.get('player-0')!.messages = [];
    connections.get('player-1')!.messages = [];

    // Player 0 submits invalid card index (out of range)
    handleGameAction(room, 'player-0', { type: 'play-cards', cardIndices: [99] }, registry);

    // Player 0 should get the error
    const p0Errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(p0Errors.length).toBeGreaterThan(0);
    expect((p0Errors[0] as any).message).toContain('Invalid hand index');

    // Player 1 should NOT get any error
    const p1Errors = getMessagesByType(connections.get('player-1')!, 'error');
    expect(p1Errors).toHaveLength(0);

    // Phase should still be play-cards (player 0's action was rejected)
    expect(room.gameState!.phase).toBe('play-cards');
  });

  it('allows offending player to resubmit after error', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Player 0 submits invalid gear shift
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 4 as any }, registry);
    expect(room.gameState!.phase).toBe('gear-shift');

    // Player 0 resubmits with valid gear
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 2 }, registry);

    // Player 1 submits valid gear
    handleGameAction(room, 'player-1', { type: 'gear-shift', targetGear: 2 }, registry);

    // Should advance past gear-shift
    expect(room.gameState!.phase).toBe('play-cards');
  });

  it('rejects invalid action without storing it in pendingActions', () => {
    const room = createTestRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // Player 0 submits invalid gear shift
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 4 as any }, registry);

    // Invalid action should NOT be stored
    expect(room.pendingActions.has(0)).toBe(false);
  });

  it('sends discard error to the correct player', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force to discard phase
    room.gameState!.phase = 'discard';
    room.pendingActions.clear();

    connections.get('player-0')!.messages = [];
    connections.get('player-1')!.messages = [];

    // Player 0 submits invalid discard (out of range index)
    handleGameAction(room, 'player-0', { type: 'discard', cardIndices: [99] }, registry);

    // Player 0 gets the error
    const p0Errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(p0Errors.length).toBeGreaterThan(0);

    // Player 1 gets no error
    const p1Errors = getMessagesByType(connections.get('player-1')!, 'error');
    expect(p1Errors).toHaveLength(0);
  });

  it('does not send error to innocent last-submitter when batch would have failed', () => {
    const room = createTestRoom(3);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Player 0 submits invalid gear (error goes to player 0 immediately)
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 4 as any }, registry);
    const p0Errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(p0Errors.length).toBeGreaterThan(0);

    // Player 1 submits valid gear
    handleGameAction(room, 'player-1', { type: 'gear-shift', targetGear: 2 }, registry);

    // Player 2 submits valid gear (would be last to trigger batch)
    handleGameAction(room, 'player-2', { type: 'gear-shift', targetGear: 2 }, registry);

    // Player 2 should NOT get any error
    const p2Errors = getMessagesByType(connections.get('player-2')!, 'error');
    expect(p2Errors).toHaveLength(0);

    // Phase should NOT advance — player 0's action was rejected, they haven't resubmitted
    expect(room.gameState!.phase).toBe('gear-shift');
  });
});

describe('submission-time content validation (ht-uhxf)', () => {
  it('rejects ±2 shift when no heat in engine', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Empty the engine zone
    room.gameState!.players[0] = {
      ...room.gameState!.players[0],
      engineZone: [],
    };

    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 3 }, registry);

    const errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects wrong card count for gear', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Advance to play-cards at gear 1
    for (const pid of room.playerIds) {
      handleGameAction(room, pid, { type: 'gear-shift', targetGear: 1 }, registry);
    }
    expect(room.gameState!.phase).toBe('play-cards');

    // Gear 1 requires 1 card, but submit 2
    handleGameAction(room, 'player-0', { type: 'play-cards', cardIndices: [0, 1] }, registry);

    const errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unplayable card selection', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Advance to play-cards
    for (const pid of room.playerIds) {
      handleGameAction(room, pid, { type: 'gear-shift', targetGear: 1 }, registry);
    }

    // Put a heat card at index 0
    room.gameState!.players[0] = {
      ...room.gameState!.players[0],
      hand: [{ type: 'heat' }, ...room.gameState!.players[0].hand.slice(1)],
    };

    handleGameAction(room, 'player-0', { type: 'play-cards', cardIndices: [0] }, registry);

    const errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects duplicate card indices', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Shift to gear 2 (requires 2 cards)
    for (const pid of room.playerIds) {
      handleGameAction(room, pid, { type: 'gear-shift', targetGear: 2 }, registry);
    }

    // Submit same index twice
    handleGameAction(room, 'player-0', { type: 'play-cards', cardIndices: [0, 0] }, registry);

    const errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects discarding unplayable card', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force to discard phase
    room.gameState!.phase = 'discard';
    room.gameState!.players[0] = {
      ...room.gameState!.players[0],
      hand: [{ type: 'heat' }, { type: 'speed', value: 3 }],
    };

    handleGameAction(room, 'player-0', { type: 'discard', cardIndices: [0] }, registry);

    const errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows valid discard of playable card', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    room.gameState!.phase = 'discard';
    room.gameState!.players[0] = {
      ...room.gameState!.players[0],
      hand: [{ type: 'speed', value: 3 }, { type: 'heat' }],
    };

    handleGameAction(room, 'player-0', { type: 'discard', cardIndices: [0] }, registry);

    // Should be stored, no error
    const errors = getMessagesByType(connections.get('player-0')!, 'error');
    expect(errors).toHaveLength(0);
    expect(room.pendingActions.has(0)).toBe(true);
  });
});

describe('check-corner recovery (ht-rcak)', () => {
  it('recovers when executeCheckCorner throws instead of soft-locking', () => {
    const room = createTestRoom(2);
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force game to slipstream phase with player 1 as the last player.
    // After the last slipstream, advancePhase routes to check-corner (sequential-auto).
    // We sabotage the state so that executeCheckCorner throws.
    room.gameState = {
      ...room.gameState!,
      phase: 'slipstream',
      activePlayerIndex: 0,
      turnOrder: [0],
    };

    // Corrupt activePlayerIndex for check-corner to force assertActivePlayer
    // to throw. advanceSequentialPhase will transition to check-corner with
    // turnOrder[0] = 0 as activePlayerIndex, but we set turnOrder to empty
    // after the slipstream executes so the engine sees an inconsistency.
    // Actually, let's use a simpler approach: set a state where the corner
    // check encounters a null/undefined that causes a throw.
    //
    // Simplest: force a bad turnOrder so advanceSequentialPhase produces
    // a state where activePlayerIndex is out-of-range, causing assertActivePlayer
    // to fail in executeCheckCorner's while-loop iteration.

    // Set player 0's position past a corner with impossible state.
    // We'll force the state machine into check-corner with an invalid
    // activePlayerIndex by manipulating turnOrder.
    const state = room.gameState!;
    room.gameState = {
      ...state,
      phase: 'check-corner',
      activePlayerIndex: 99, // Invalid player index
      turnOrder: [99],       // Force bad state
    };

    // The game is stuck at check-corner. Trigger advancePhase via reconnection
    // path — but first, verify the direct fix: executeSequentialAutoPhase
    // must recover. We can trigger it by routing through a slipstream action
    // that advances to check-corner.

    // Reset to slipstream so the action handler triggers the check-corner auto-phase
    room.gameState = {
      ...room.gameState!,
      phase: 'slipstream',
      activePlayerIndex: 0,
      turnOrder: [0],
      // Give player 0 a position that would need corner checking
      players: state.players.map((p, i) => ({
        ...p,
        position: i === 0 ? 20 : 0,
        previousPosition: 0,
        speed: 20,
      })),
    };

    // Sabotage: set corners to contain a malformed entry that will throw
    // during check-corner processing (position type error)
    room.gameState!.corners = [
      { id: 1, speedLimit: 5, position: 10 },
    ];

    // Empty the engine zone so paying heat fails with an index error
    room.gameState!.players = room.gameState!.players.map(p => ({
      ...p,
      engineZone: [],
    }));

    // Player 0 accepts slipstream, which leads to check-corner auto-phase.
    // The corner check will attempt to debit heat from an empty engine zone,
    // but actually that triggers the spinout path, not a throw.
    // Let's use a more direct approach: poison the corners array.
    room.gameState!.corners = [
      null as any, // This will throw when accessing .position
    ];

    // The slipstream action will trigger advancePhase → executeSequentialAutoPhase
    // → executeCheckCorner which will throw on the null corner.
    // With the fix, it should recover to discard phase instead of throwing.
    handleGameAction(room, 'player-0', { type: 'slipstream', accept: false }, registry);

    // Game should have recovered to discard (or beyond), NOT stuck at check-corner
    expect(room.gameState!.phase).not.toBe('check-corner');
    expect(room.gameState!.phase).not.toBe('slipstream');
    expect(room.status).toBe('playing');
  });

  it('recovers from check-corner error during qualifying mode', () => {
    // Qualifying mode also routes through check-corner after react-done → skip slipstream
    const qualConfig: RoomConfig = {
      trackId: 'usa',
      lapCount: 2,
      maxPlayers: 1,
      turnTimeoutMs: 0,
      mode: 'qualifying',
    };

    const room = createRoom('solo-player', qualConfig, 'Solo Racer');
    const { registry, connections } = createMockRegistry(room);
    startGame(room, registry);

    // Force to react phase
    room.gameState = {
      ...room.gameState!,
      phase: 'react',
      activePlayerIndex: 0,
      turnOrder: [0],
      players: room.gameState!.players.map(p => ({
        ...p,
        position: 20,
        previousPosition: 0,
        speed: 20,
      })),
    };

    // Poison corners to force a throw in executeCheckCorner
    room.gameState!.corners = [null as any];

    // react-done → skips slipstream (qualifying) → check-corner → THROW → recover
    handleGameAction(room, 'solo-player', { type: 'react-done' }, registry);

    // Should NOT be stuck at check-corner
    expect(room.gameState!.phase).not.toBe('check-corner');
    expect(room.status).toBe('playing');
  });
});

describe('timeout handling (ht-h9i4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createTimedRoom(playerCount: number = 2): Room {
    const room = createRoom('player-0', { ...defaultConfig, turnTimeoutMs: 5000 });
    for (let i = 1; i < playerCount; i++) {
      joinRoom(room, `player-${i}`);
    }
    return room;
  }

  it('does not crash when timeout fires during play-cards with no pending actions', () => {
    const room = createTimedRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // Advance to play-cards
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 1 }, registry);
    handleGameAction(room, 'player-1', { type: 'gear-shift', targetGear: 1 }, registry);
    expect(room.gameState!.phase).toBe('play-cards');

    // Let timeout fire with NO pending play-cards actions
    // This was the crash: handleTimeout → executeSimultaneousPhase → engine
    // throw → re-throw escaped setTimeout → process crash
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();

    // Game should still be playable (phase restarted or advanced)
    expect(room.status).toBe('playing');
  });

  it('does not crash when timeout fires during gear-shift with no pending actions', () => {
    const room = createTimedRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);
    expect(room.gameState!.phase).toBe('gear-shift');

    // Let timeout fire with no pending actions
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(room.status).toBe('playing');
  });

  it('advances phase when timeout fires and defaults are valid', () => {
    const room = createTimedRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // Only player-0 submits gear shift
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 2 }, registry);
    expect(room.gameState!.phase).toBe('gear-shift');

    // Timeout fills default for player-1 (keep gear) and executes
    vi.advanceTimersByTime(5000);
    expect(room.gameState!.phase).toBe('play-cards');
  });

  it('does not crash when disconnection triggers simultaneous phase execution', () => {
    const room = createTimedRoom(2);
    const { registry } = createMockRegistry(room);
    startGame(room, registry);

    // Player 0 acts during gear-shift
    handleGameAction(room, 'player-0', { type: 'gear-shift', targetGear: 1 }, registry);

    // Player 1 disconnects — triggers allPlayersActed + executeSimultaneousPhase
    disconnectPlayer(room, 'player-1');
    expect(() => handleDisconnection(room, 'player-1', registry)).not.toThrow();
    expect(room.status).toBe('playing');
  });
});

describe('qualifying mode', () => {
  const qualifyingConfig: RoomConfig = {
    trackId: 'usa',
    lapCount: 1,
    maxPlayers: 1,
    turnTimeoutMs: 0,
    mode: 'qualifying',
  };

  function createQualifyingRoom(): Room {
    return createRoom('solo-player', qualifyingConfig, 'Solo Racer');
  }

  it('starts a qualifying game with 1 player', () => {
    const room = createQualifyingRoom();
    const { registry, connections } = createMockRegistry(room);

    startGame(room, registry);

    expect(room.gameState).not.toBeNull();
    expect(room.gameState!.mode).toBe('qualifying');
    expect(room.gameState!.raceStatus).toBe('qualifying');
    expect(room.gameState!.players).toHaveLength(1);

    // Player should have received game-started
    const conn = connections.get('solo-player')!;
    const startedMsgs = getMessagesByType(conn, 'game-started');
    expect(startedMsgs.length).toBeGreaterThanOrEqual(1);
  });

  it('skips adrenaline and slipstream in qualifying mode', () => {
    const room = createQualifyingRoom();
    const { registry, connections } = createMockRegistry(room);

    startGame(room, registry);

    const conn = connections.get('solo-player')!;

    // Phase 1: Gear shift
    handleGameAction(room, 'solo-player', {
      type: 'gear-shift',
      targetGear: 1,
    }, registry);

    // Phase 2: Play cards (need to pick valid cards)
    const player = room.gameState!.players[0];
    const playableIdx = player.hand.findIndex(c =>
      c.type === 'speed' || (c.type === 'upgrade' && c.subtype !== 'starting-heat'),
    );
    handleGameAction(room, 'solo-player', {
      type: 'play-cards',
      cardIndices: [playableIdx],
    }, registry);

    // After reveal-and-move (auto) and adrenaline (should be skipped),
    // we should be at react phase
    expect(room.gameState!.phase).toBe('react');

    // React: skip
    handleGameAction(room, 'solo-player', { type: 'react-done' }, registry);

    // After react, slipstream should be skipped, goes to check-corner (auto),
    // then discard
    expect(room.gameState!.phase).toBe('discard');

    // Discard: skip
    handleGameAction(room, 'solo-player', {
      type: 'discard',
      cardIndices: [],
    }, registry);

    // After discard → replenish (auto) → gear-shift (round 2)
    expect(room.gameState!.phase).toBe('gear-shift');
    expect(room.gameState!.round).toBe(2);

    // Never saw adrenaline or slipstream phases in broadcast messages
    const phaseChanges = getMessagesByType(conn, 'phase-changed') as Array<{ phase: string }>;
    const phasesSeenByPlayer = phaseChanges.map(m => m.phase);
    expect(phasesSeenByPlayer).not.toContain('adrenaline');
    expect(phasesSeenByPlayer).not.toContain('slipstream');
  });

  it('includes mode in client game state', () => {
    const room = createQualifyingRoom();
    const { registry, connections } = createMockRegistry(room);

    startGame(room, registry);

    const conn = connections.get('solo-player')!;
    const startedMsg = getMessagesByType(conn, 'game-started')[0] as { state: { mode: string } };
    expect(startedMsg.state.mode).toBe('qualifying');
  });
});
