import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from '../hooks/useSession.js';

describe('useSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no session exists', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.sessionToken).toBeNull();
  });

  it('stores and retrieves session token', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.setSessionToken('test-token');
    });

    expect(result.current.sessionToken).toBe('test-token');
    expect(localStorage.getItem('heat-session-token')).toBe('test-token');
  });

  it('clears all session data', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.setSessionToken('tok');
    });

    // Set active room directly in localStorage (no longer managed via React state)
    localStorage.setItem('heat-active-room', 'ROOM');

    act(() => {
      result.current.clearSession();
    });

    expect(result.current.sessionToken).toBeNull();
    expect(localStorage.getItem('heat-session-token')).toBeNull();
    expect(localStorage.getItem('heat-active-room')).toBeNull();
  });

  it('reads existing session from localStorage on mount', () => {
    localStorage.setItem('heat-session-token', 'existing-token');

    const { result } = renderHook(() => useSession());
    expect(result.current.sessionToken).toBe('existing-token');
  });
});
