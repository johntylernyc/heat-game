import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from '../hooks/useGameState.js';
import type { ServerMessage, ClientGameState } from '../../server/types.js';

const mockGameState: ClientGameState = {
  round: 1,
  phase: 'gear-shift',
  activePlayerIndex: 0,
  turnOrder: [0, 1],
  lapTarget: 1,
  raceStatus: 'racing',
  playerIndex: 0,
  self: {
    id: 'p1',
    gear: 1,
    position: 0,
    lapCount: 0,
    speed: 0,
    hand: [],
    drawPileCount: 5,
    discardPile: [],
    engineZone: [],
    hasBoosted: false,
    playedCards: [],
  },
  opponents: [],
  totalSpaces: 50,
};

describe('useGameState', () => {
  it('starts in home phase with null state', () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.state.appPhase).toBe('home');
    expect(result.current.state.gameState).toBeNull();
    expect(result.current.state.playerId).toBeNull();
  });

  it('handles session-created message', () => {
    const { result } = renderHook(() => useGameState());
    const msg: ServerMessage = { type: 'session-created', playerId: 'p1', sessionToken: 'tok' };

    act(() => {
      result.current.handleServerMessage(msg);
    });

    expect(result.current.state.playerId).toBe('p1');
    expect(result.current.state.sessionToken).toBe('tok');
  });

  it('handles room-created message', () => {
    const { result } = renderHook(() => useGameState());
    const msg: ServerMessage = { type: 'room-created', roomId: 'r1', roomCode: 'ABCD' };

    act(() => {
      result.current.handleServerMessage(msg);
    });

    expect(result.current.state.roomCode).toBe('ABCD');
    expect(result.current.state.appPhase).toBe('lobby');
  });

  it('handles game-started message', () => {
    const { result } = renderHook(() => useGameState());
    const msg: ServerMessage = { type: 'game-started', state: mockGameState };

    act(() => {
      result.current.handleServerMessage(msg);
    });

    expect(result.current.state.appPhase).toBe('playing');
    expect(result.current.state.gameState).toBe(mockGameState);
  });

  it('handles phase-changed message', () => {
    const { result } = renderHook(() => useGameState());
    const started: ServerMessage = { type: 'game-started', state: mockGameState };
    const updated = { ...mockGameState, phase: 'play-cards' as const, round: 2 };
    const changed: ServerMessage = { type: 'phase-changed', phase: 'play-cards', state: updated };

    act(() => {
      result.current.handleServerMessage(started);
      result.current.handleServerMessage(changed);
    });

    expect(result.current.state.gameState?.phase).toBe('play-cards');
    expect(result.current.state.gameState?.round).toBe(2);
  });

  it('handles game-over message', () => {
    const { result } = renderHook(() => useGameState());

    act(() => {
      result.current.handleServerMessage({ type: 'game-started', state: mockGameState });
      result.current.handleServerMessage({ type: 'game-over', standings: [] });
    });

    expect(result.current.state.appPhase).toBe('finished');
  });

  it('handles error message and clears it', () => {
    const { result } = renderHook(() => useGameState());

    act(() => {
      result.current.handleServerMessage({ type: 'error', message: 'Room full' });
    });

    expect(result.current.state.error).toBe('Room full');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.state.error).toBeNull();
  });

  it('resets state', () => {
    const { result } = renderHook(() => useGameState());

    act(() => {
      result.current.handleServerMessage({ type: 'session-created', playerId: 'p1', sessionToken: 'tok' });
      result.current.handleServerMessage({ type: 'game-started', state: mockGameState });
    });

    expect(result.current.state.appPhase).toBe('playing');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.appPhase).toBe('home');
    expect(result.current.state.playerId).toBeNull();
    expect(result.current.state.gameState).toBeNull();
  });
});
