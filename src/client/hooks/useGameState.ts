import { useReducer, useCallback } from 'react';
import type {
  ServerMessage,
  ClientGameState,
  LobbyState,
  PlayerStanding,
} from '../../server/types.js';

export type AppPhase = 'home' | 'lobby' | 'playing' | 'finished';

export interface GameStoreState {
  /** Current phase of the application. */
  appPhase: AppPhase;
  /** Our player ID assigned by the server. */
  playerId: string | null;
  /** Current session token. */
  sessionToken: string | null;
  /** Room code we're in. */
  roomCode: string | null;
  /** Lobby state (when in lobby). */
  lobby: LobbyState | null;
  /** Full game state from server (when playing). */
  gameState: ClientGameState | null;
  /** Final standings from the server (when finished). */
  standings: PlayerStanding[] | null;
  /** Last error from server. */
  error: string | null;
}

const initialState: GameStoreState = {
  appPhase: 'home',
  playerId: null,
  sessionToken: null,
  roomCode: null,
  lobby: null,
  gameState: null,
  standings: null,
  error: null,
};

type Action =
  | { type: 'SESSION_CREATED'; playerId: string; sessionToken: string }
  | { type: 'ROOM_CREATED'; roomCode: string }
  | { type: 'LOBBY_STATE'; lobby: LobbyState }
  | { type: 'GAME_STARTED'; state: ClientGameState }
  | { type: 'PHASE_CHANGED'; state: ClientGameState }
  | { type: 'GAME_OVER'; standings: PlayerStanding[] }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };

function reducer(state: GameStoreState, action: Action): GameStoreState {
  switch (action.type) {
    case 'SESSION_CREATED':
      return { ...state, playerId: action.playerId, sessionToken: action.sessionToken };
    case 'ROOM_CREATED':
      return { ...state, roomCode: action.roomCode, appPhase: 'lobby' };
    case 'LOBBY_STATE':
      return { ...state, lobby: action.lobby, appPhase: 'lobby' };
    case 'GAME_STARTED':
      return { ...state, gameState: action.state, appPhase: 'playing', error: null };
    case 'PHASE_CHANGED':
      return { ...state, gameState: action.state };
    case 'GAME_OVER':
      return { ...state, appPhase: 'finished', standings: action.standings };
    case 'ERROR':
      return { ...state, error: action.message };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

export function useGameState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'session-created':
        dispatch({ type: 'SESSION_CREATED', playerId: message.playerId, sessionToken: message.sessionToken });
        break;
      case 'room-created':
        dispatch({ type: 'ROOM_CREATED', roomCode: message.roomCode });
        break;
      case 'lobby-state':
        dispatch({ type: 'LOBBY_STATE', lobby: message.lobby });
        break;
      case 'game-started':
        dispatch({ type: 'GAME_STARTED', state: message.state });
        break;
      case 'phase-changed':
        dispatch({ type: 'PHASE_CHANGED', state: message.state });
        break;
      case 'game-over':
        dispatch({ type: 'GAME_OVER', standings: message.standings });
        break;
      case 'error':
        dispatch({ type: 'ERROR', message: message.message });
        break;
    }
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { state, handleServerMessage, clearError, reset };
}
