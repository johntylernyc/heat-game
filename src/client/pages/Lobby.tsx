import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { useWebSocketContext } from '../providers/WebSocketProvider.js';
import type { CarColor, LobbyPlayer } from '../../server/types.js';

const CAR_COLORS: CarColor[] = ['red', 'blue', 'green', 'yellow', 'black', 'white'];

const COLOR_HEX: Record<CarColor, string> = {
  red: '#e74c3c',
  blue: '#3498db',
  green: '#2ecc71',
  yellow: '#f1c40f',
  black: '#555',
  white: '#ecf0f1',
};

const LOBBY_TIMEOUT_MS = 5000;

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '2rem',
    minHeight: '100vh',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
  },
  roomCode: {
    fontSize: '2rem',
    fontWeight: 'bold' as const,
    color: '#ff6b35',
    letterSpacing: '0.3em',
  },
  hint: {
    color: '#888',
    fontSize: '0.9rem',
    marginTop: '0.25rem',
  },
  card: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '1.5rem',
    width: '100%',
    maxWidth: '500px',
    marginBottom: '1rem',
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 0',
    borderBottom: '1px solid #1e2f4f',
  },
  colorDot: (color: string) => ({
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: color,
    border: '2px solid #fff3',
    flexShrink: 0 as const,
  }),
  playerName: {
    flex: 1,
    fontSize: '1.1rem',
  },
  badge: (ready: boolean) => ({
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    background: ready ? '#2ecc71' : '#555',
    color: ready ? '#000' : '#999',
  }),
  hostBadge: {
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    background: '#ff6b35',
    color: '#fff',
    marginRight: '0.5rem',
  },
  colorPicker: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  colorButton: (color: string, selected: boolean) => ({
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: color,
    border: selected ? '3px solid #fff' : '3px solid transparent',
    cursor: 'pointer',
    outline: 'none',
  }),
  button: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: '#ff6b35',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed' as const,
  },
  readyButton: (isReady: boolean) => ({
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: isReady ? '#2ecc71' : '#555',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    marginBottom: '0.75rem',
  }),
  config: {
    fontSize: '0.9rem',
    color: '#aaa',
    marginBottom: '0.5rem',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.9rem',
    marginBottom: '1rem',
    textAlign: 'center' as const,
  },
  disconnected: {
    color: '#ff4444',
    fontStyle: 'italic' as const,
    fontSize: '0.85rem',
  },
  backLink: {
    color: '#888',
    fontSize: '0.9rem',
    marginTop: '1rem',
    textDecoration: 'none',
  },
  errorState: {
    textAlign: 'center' as const,
    padding: '3rem',
  },
} as const;

export function Lobby() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { setActiveRoom } = useSession();
  const { status, send, gameState } = useWebSocketContext();

  const [timedOut, setTimedOut] = useState(false);

  const lobby = gameState.lobby;

  // Set active room from URL params
  useEffect(() => {
    if (roomCode) {
      setActiveRoom(roomCode);
    }
  }, [roomCode, setActiveRoom]);

  // Lobby timeout: if connected but no lobby state after LOBBY_TIMEOUT_MS, show error
  useEffect(() => {
    if (lobby || status !== 'connected') {
      setTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      if (!lobby) setTimedOut(true);
    }, LOBBY_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [lobby, status]);

  // If room not found error or timeout, show error state
  if (timedOut || (gameState.error === 'Room not found')) {
    return (
      <div style={styles.container}>
        <div style={styles.errorState}>
          <p style={{ fontSize: '1.5rem', color: '#ff4444', marginBottom: '1rem' }}>
            Room not found or expired
          </p>
          <p style={{ color: '#888', marginBottom: '2rem' }}>
            The room may have been closed or the link may be invalid.
          </p>
          <button
            style={styles.button}
            onClick={() => {
              setActiveRoom(null);
              navigate('/');
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const playerId = gameState.playerId;
  const isHost = lobby?.players.some((p) => p.playerId === playerId && p.isHost) ?? false;
  const myPlayer = lobby?.players.find((p) => p.playerId === playerId);
  const myColor = myPlayer?.carColor;
  const isReady = myPlayer?.isReady ?? false;
  const takenColors = new Set(
    lobby?.players.filter((p) => p.playerId !== playerId).map((p) => p.carColor) ?? [],
  );

  const handleColorSelect = (color: CarColor) => {
    if (takenColors.has(color)) return;
    send({ type: 'set-player-info', carColor: color });
  };

  const handleReady = () => {
    send({ type: 'set-ready', ready: !isReady });
  };

  const handleStart = () => {
    send({ type: 'start-game' });
  };

  const handleLeave = () => {
    send({ type: 'leave-room' });
    setActiveRoom(null);
    navigate('/');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>Room Code</p>
        <p style={styles.roomCode}>{roomCode}</p>
        <p style={styles.hint}>Share this code with friends</p>
      </div>

      {gameState.error && gameState.error !== 'Room not found' && (
        <p style={styles.error}>{gameState.error}</p>
      )}

      {/* Game Config */}
      {lobby && (
        <div style={styles.card}>
          <p style={styles.config}>
            Track: <strong>{lobby.config.trackId.toUpperCase()}</strong> &middot;{' '}
            Laps: <strong>{lobby.config.lapCount}</strong> &middot;{' '}
            Players: <strong>{lobby.players.length}/{lobby.config.maxPlayers}</strong>
          </p>
        </div>
      )}

      {/* Color Picker */}
      <div style={styles.card}>
        <p style={{ marginBottom: '0.75rem', color: '#aaa', fontSize: '0.9rem' }}>Choose your car color</p>
        <div style={styles.colorPicker}>
          {CAR_COLORS.map((color) => (
            <button
              key={color}
              style={{
                ...styles.colorButton(COLOR_HEX[color], color === myColor),
                opacity: takenColors.has(color) ? 0.3 : 1,
              }}
              onClick={() => handleColorSelect(color)}
              disabled={takenColors.has(color)}
              aria-label={color}
            />
          ))}
        </div>
      </div>

      {/* Players */}
      <div style={styles.card}>
        <h3 style={{ marginBottom: '0.5rem' }}>Players</h3>
        {lobby?.players.map((player: LobbyPlayer) => (
          <div key={player.playerId} style={styles.playerRow}>
            <div style={styles.colorDot(COLOR_HEX[player.carColor])} />
            <span style={styles.playerName}>
              {player.displayName}
              {player.playerId === playerId && ' (you)'}
            </span>
            {player.isHost && <span style={styles.hostBadge}>Host</span>}
            {!player.isConnected && <span style={styles.disconnected}>offline</span>}
            <span style={styles.badge(player.isReady)}>{player.isReady ? 'Ready' : 'Not Ready'}</span>
          </div>
        ))}
        {!lobby && <p style={{ color: '#888' }}>Connecting...</p>}
      </div>

      {/* Actions */}
      <div style={{ width: '100%', maxWidth: '500px' }}>
        <button style={styles.readyButton(isReady)} onClick={handleReady}>
          {isReady ? 'Unready' : 'Ready Up'}
        </button>

        {isHost && (
          <button
            style={{
              ...styles.button,
              ...(lobby?.canStart ? {} : styles.buttonDisabled),
              marginBottom: '0.75rem',
            }}
            onClick={handleStart}
            disabled={!lobby?.canStart}
          >
            Start Game
          </button>
        )}

        <button
          style={{ ...styles.button, background: '#333', marginTop: '0.5rem' }}
          onClick={handleLeave}
        >
          Leave Room
        </button>
      </div>

      <Link to="/" style={styles.backLink}>Back to Home</Link>
    </div>
  );
}
