import { useState, useCallback } from 'react';

const SESSION_TOKEN_KEY = 'heat-session-token';
const ACTIVE_ROOM_KEY = 'heat-active-room';

/**
 * Manages the session token (React state + localStorage).
 *
 * Active room tracking was moved out of React state and into direct
 * localStorage reads/writes to avoid unnecessary re-renders in
 * WebSocketProvider that cascaded to all context consumers.
 */
export function useSession() {
  const [sessionToken, setSessionTokenState] = useState<string | null>(
    () => localStorage.getItem(SESSION_TOKEN_KEY),
  );

  const setSessionToken = useCallback((token: string | null) => {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
    setSessionTokenState(token);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(ACTIVE_ROOM_KEY);
    setSessionTokenState(null);
  }, []);

  return { sessionToken, setSessionToken, clearSession };
}
