import { createContext, useContext, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { useWebSocket, type ConnectionStatus } from '../hooks/useWebSocket.js';
import { useGameState, type GameStoreState } from '../hooks/useGameState.js';
import type { ServerMessage, ClientMessage } from '../../server/types.js';
import { loadProfile, recordQualifyingResult, recordRaceResult } from '../profileStore.js';

const ACTIVE_ROOM_KEY = 'heat-active-room';

const ACTIVE_ROOM_KEY = 'heat-active-room';

interface WebSocketContextValue {
  status: ConnectionStatus;
  send: (message: ClientMessage) => void;
  disconnect: () => void;
  gameState: GameStoreState;
  clearError: () => void;
  reset: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { sessionToken, setSessionToken, clearSession } = useSession();
  const { state: gameState, handleServerMessage, clearError, reset } = useGameState();
  const navigate = useNavigate();

  // Track latest navigate in a ref to avoid reconnection churn.
  // Read current pathname from window.location instead of useLocation()
  // to avoid re-rendering on every navigation.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const clearSessionRef = useRef(clearSession);
  clearSessionRef.current = clearSession;

  const onMessage = useCallback((message: ServerMessage) => {
    handleServerMessage(message);

    switch (message.type) {
      case 'session-created':
        setSessionToken(message.sessionToken);
        break;

      case 'room-created':
        localStorage.setItem(ACTIVE_ROOM_KEY, message.roomCode);
        navigateRef.current(`/lobby/${message.roomCode}`);
        break;

      case 'lobby-state':
        // Persist active room to localStorage for session recovery.
        // Write directly instead of via React state to avoid triggering
        // re-renders in WebSocketProvider — the reducer already stores
        // the lobby state which is the authoritative source.
        localStorage.setItem(ACTIVE_ROOM_KEY, message.lobby.roomCode);
        // If we're on home, navigate to lobby
        if (window.location.pathname === '/') {
          navigateRef.current(`/lobby/${message.lobby.roomCode}`);
        }
        break;

      case 'game-started': {
        // Navigate to game page if not already there
        const currentPath = window.location.pathname;
        if (!currentPath.startsWith('/game/')) {
          const lobbyMatch = currentPath.match(/\/lobby\/(\w+)/);
          if (lobbyMatch) {
            navigateRef.current(`/game/${lobbyMatch[1]}`);
          }
        }
        break;
      }

      case 'phase-changed':
        // If on home page with active game, navigate to game
        if (window.location.pathname === '/') {
          // This means we reconnected into an active game from home
          const activeRoom = localStorage.getItem(ACTIVE_ROOM_KEY);
          if (activeRoom) {
            navigateRef.current(`/game/${activeRoom}`);
          }
        }
        break;

      case 'qualifying-result':
        // Record to profile stats if profile exists
        if (loadProfile()) {
          recordQualifyingResult(message);
        }
        break;

      case 'race-result':
        if (loadProfile()) {
          recordRaceResult(message);
        }
        break;

      case 'error':
        if (message.message === 'Invalid session token') {
          // Stale session - clear and recover
          clearSessionRef.current();
          if (window.location.pathname !== '/') {
            navigateRef.current('/');
          }
        }
        break;
    }
  }, [handleServerMessage, setSessionToken]);

  const { status, send, disconnect } = useWebSocket({
    sessionToken,
    onMessage,
  });

  const contextValue = useMemo(
    () => ({ status, send, disconnect, gameState, clearError, reset }),
    [status, send, disconnect, gameState, clearError, reset],
  );

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return ctx;
}
