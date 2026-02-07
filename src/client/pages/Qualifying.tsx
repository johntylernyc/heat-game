import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useGameState } from '../hooks/useGameState.js';
import type { ServerMessage, CarColor } from '../../server/types.js';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '2rem',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 'bold' as const,
    marginBottom: '0.5rem',
    color: '#ff6b35',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#888',
    marginBottom: '2rem',
    textAlign: 'center' as const,
    maxWidth: '400px',
  },
  card: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '2rem',
    width: '100%',
    maxWidth: '450px',
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.9rem',
    color: '#aaa',
  },
  trackGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  trackCard: (selected: boolean) => ({
    padding: '1rem',
    borderRadius: '8px',
    border: selected ? '2px solid #ff6b35' : '2px solid #334155',
    background: selected ? 'rgba(255, 107, 53, 0.1)' : '#0f3460',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'border-color 0.2s',
  }),
  trackName: {
    color: '#e0e0e0',
    fontWeight: 'bold' as const,
    fontSize: '1rem',
    marginBottom: '0.25rem',
  },
  trackDesc: {
    color: '#888',
    fontSize: '0.75rem',
  },
  row: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#0f3460',
    color: '#e0e0e0',
    fontSize: '1rem',
    outline: 'none',
  },
  colorSwatch: (color: string, selected: boolean) => ({
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: color,
    border: selected ? '3px solid #fff' : '3px solid transparent',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  }),
  button: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: '#ff6b35',
    color: '#fff',
    fontSize: '1.1rem',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  backLink: {
    color: '#888',
    fontSize: '0.9rem',
    cursor: 'pointer',
    marginTop: '1rem',
    background: 'none',
    border: 'none',
    textDecoration: 'underline',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
} as const;

const TRACKS = [
  { id: 'usa', name: 'USA', desc: 'Long straights, tight turns' },
  { id: 'italy', name: 'Italy', desc: 'Long straight, tight corners' },
  { id: 'france', name: 'France', desc: 'Balanced layout' },
  { id: 'great-britain', name: 'Great Britain', desc: 'Multiple low-speed corners' },
];

const COLOR_MAP: Record<CarColor, string> = {
  red: '#e74c3c',
  blue: '#3498db',
  green: '#2ecc71',
  yellow: '#f1c40f',
  black: '#2c3e50',
  white: '#ecf0f1',
};

const CAR_COLORS: CarColor[] = ['red', 'blue', 'green', 'yellow', 'black', 'white'];

export function Qualifying() {
  const navigate = useNavigate();
  const { sessionToken, setSessionToken, setActiveRoom } = useSession();
  const { handleServerMessage } = useGameState();

  const [trackId, setTrackId] = useState('usa');
  const [lapCount, setLapCount] = useState(2);
  const [carColor, setCarColor] = useState<CarColor>('red');
  const [error, setError] = useState<string | null>(null);

  const onMessage = (message: ServerMessage) => {
    handleServerMessage(message);

    if (message.type === 'session-created') {
      setSessionToken(message.sessionToken);
    } else if (message.type === 'room-created') {
      setActiveRoom(message.roomCode);
      // Auto-ready and auto-start for qualifying (solo)
      send({ type: 'set-player-info', carColor });
      send({ type: 'set-ready', ready: true });
      send({ type: 'start-game' });
      navigate(`/game/${message.roomCode}`);
    } else if (message.type === 'error') {
      setError(message.message);
    }
  };

  const { status, send } = useWebSocket({
    sessionToken,
    onMessage,
  });

  const connected = status === 'connected';

  const handleStart = () => {
    setError(null);
    send({
      type: 'create-room',
      trackId,
      lapCount,
      maxPlayers: 1,
      displayName: 'Driver',
      mode: 'qualifying',
    });
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Qualifying Laps</h1>
      <p style={styles.subtitle}>
        Run solo qualifying sessions to learn tracks, practice heat management,
        and master game mechanics before jumping into multiplayer.
      </p>

      {!connected && (
        <p style={{ color: '#ffaa00', marginBottom: '1rem' }}>
          {status === 'connecting' || status === 'reconnecting' ? 'Connecting to server...' : 'Disconnected from server'}
        </p>
      )}

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.card}>
        {/* Track Selection */}
        <label style={styles.label}>Select Track</label>
        <div style={styles.trackGrid}>
          {TRACKS.map((t) => (
            <div
              key={t.id}
              style={styles.trackCard(trackId === t.id)}
              onClick={() => setTrackId(t.id)}
            >
              <p style={styles.trackName}>{t.name}</p>
              <p style={styles.trackDesc}>{t.desc}</p>
            </div>
          ))}
        </div>

        {/* Laps and Color */}
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Laps</label>
            <select
              style={styles.select}
              value={lapCount}
              onChange={(e) => setLapCount(Number(e.target.value))}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Car Color</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {CAR_COLORS.map((c) => (
                <div
                  key={c}
                  style={styles.colorSwatch(COLOR_MAP[c], carColor === c)}
                  onClick={() => setCarColor(c)}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          style={{ ...styles.button, opacity: connected ? 1 : 0.5 }}
          onClick={handleStart}
          disabled={!connected}
        >
          Start Qualifying
        </button>
      </div>

      <button style={styles.backLink} onClick={() => navigate('/')}>
        Back to Home
      </button>
    </div>
  );
}
