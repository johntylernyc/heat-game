import { useState, useCallback } from 'react';

const SESSION_TOKEN_KEY = 'heat-session-token';
const ACTIVE_ROOM_KEY = 'heat-active-room';

export interface SessionInfo {
  sessionToken: string | null;
  activeRoom: string | null;
}

export function useSession() {
  const [sessionToken, setSessionTokenState] = useState<string | null>(
    () => localStorage.getItem(SESSION_TOKEN_KEY),
  );
  const [activeRoom, setActiveRoomState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_ROOM_KEY),
  );

  const setSessionToken = useCallback((token: string | null) => {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
    setSessionTokenState(token);
  }, []);

  const setActiveRoom = useCallback((roomCode: string | null) => {
    if (roomCode) {
      localStorage.setItem(ACTIVE_ROOM_KEY, roomCode);
    } else {
      localStorage.removeItem(ACTIVE_ROOM_KEY);
    }
    setActiveRoomState(roomCode);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(ACTIVE_ROOM_KEY);
    setSessionTokenState(null);
    setActiveRoomState(null);
  }, []);

  return { sessionToken, activeRoom, setSessionToken, setActiveRoom, clearSession };
}
