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
    expect(result.current.activeRoom).toBeNull();
  });

  it('stores and retrieves session token', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.setSessionToken('test-token');
    });

    expect(result.current.sessionToken).toBe('test-token');
    expect(localStorage.getItem('heat-session-token')).toBe('test-token');
  });

  it('stores and retrieves active room', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.setActiveRoom('ABCD');
    });

    expect(result.current.activeRoom).toBe('ABCD');
    expect(localStorage.getItem('heat-active-room')).toBe('ABCD');
  });

  it('clears all session data', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.setSessionToken('tok');
      result.current.setActiveRoom('ROOM');
    });

    act(() => {
      result.current.clearSession();
    });

    expect(result.current.sessionToken).toBeNull();
    expect(result.current.activeRoom).toBeNull();
    expect(localStorage.getItem('heat-session-token')).toBeNull();
    expect(localStorage.getItem('heat-active-room')).toBeNull();
  });

  it('reads existing session from localStorage on mount', () => {
    localStorage.setItem('heat-session-token', 'existing-token');
    localStorage.setItem('heat-active-room', 'WXYZ');

    const { result } = renderHook(() => useSession());
    expect(result.current.sessionToken).toBe('existing-token');
    expect(result.current.activeRoom).toBe('WXYZ');
  });
});
