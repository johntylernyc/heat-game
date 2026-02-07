import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useGameState } from '../hooks/useGameState.js';
import type { ServerMessage } from '../../server/types.js';

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
    fontSize: '3rem',
    fontWeight: 'bold' as const,
    marginBottom: '0.5rem',
    color: '#ff6b35',
  },
  subtitle: {
    fontSize: '1.2rem',
    color: '#888',
    marginBottom: '3rem',
  },
  card: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '2rem',
    width: '100%',
    maxWidth: '400px',
    marginBottom: '1rem',
  },
  heading: {
    fontSize: '1.3rem',
    marginBottom: '1rem',
    color: '#e0e0e0',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.9rem',
    color: '#aaa',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#0f3460',
    color: '#e0e0e0',
    fontSize: '1rem',
    marginBottom: '1rem',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#0f3460',
    color: '#e0e0e0',
    fontSize: '1rem',
    marginBottom: '1rem',
    outline: 'none',
  },
  row: {
    display: 'flex',
    gap: '1rem',
  },
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
  buttonSecondary: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #ff6b35',
    background: 'transparent',
    color: '#ff6b35',
    fontSize: '1rem',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  rejoinBanner: {
    background: '#2a3d60',
    borderRadius: '12px',
    padding: '1rem 2rem',
    marginBottom: '2rem',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center' as const,
  },
  error: {
    color: '#ff4444',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  divider: {
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center' as const,
    margin: '0.5rem 0',
    color: '#555',
  },
} as const;

const TRACKS = [
  { id: 'usa', name: 'USA' },
  { id: 'italy', name: 'Italy' },
  { id: 'france', name: 'France' },
  { id: 'great-britain', name: 'Great Britain' },
];

export function Home() {
  const navigate = useNavigate();
  const { sessionToken, activeRoom, setSessionToken, setActiveRoom } = useSession();
  const { state: gameState, handleServerMessage } = useGameState();

  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [trackId, setTrackId] = useState('usa');
  const [lapCount, setLapCount] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [error, setError] = useState<string | null>(null);
  // Track whether we're waiting for a qualifying game to start (skip lobby)
  const qualifyingPending = useRef(false);
  const qualifyingRoomCode = useRef<string | null>(null);

  const onMessage = (message: ServerMessage) => {
    handleServerMessage(message);

    if (message.type === 'session-created') {
      setSessionToken(message.sessionToken);
    } else if (message.type === 'room-created') {
      setActiveRoom(message.roomCode);
      if (qualifyingPending.current) {
        // Qualifying: store room code, wait for game-started
        qualifyingRoomCode.current = message.roomCode;
      } else {
        navigate(`/lobby/${message.roomCode}`);
      }
    } else if (message.type === 'lobby-state') {
      setActiveRoom(message.lobby.roomCode);
      navigate(`/lobby/${message.lobby.roomCode}`);
    } else if (message.type === 'game-started' || message.type === 'phase-changed') {
      // Direct to game — for qualifying or reconnection
      const roomCode = qualifyingRoomCode.current ?? activeRoom;
      if (roomCode) {
        qualifyingPending.current = false;
        qualifyingRoomCode.current = null;
        navigate(`/game/${roomCode}`);
      }
    } else if (message.type === 'error') {
      qualifyingPending.current = false;
      qualifyingRoomCode.current = null;
      setError(message.message);
    }
  };

  const { status, send } = useWebSocket({
    sessionToken,
    onMessage,
  });

  const connected = status === 'connected';

  const handleCreate = () => {
    if (!displayName.trim()) {
      setError('Enter a display name');
      return;
    }
    setError(null);
    send({
      type: 'create-room',
      trackId,
      lapCount,
      maxPlayers,
      displayName: displayName.trim(),
    });
  };

  const handleJoin = () => {
    if (!displayName.trim()) {
      setError('Enter a display name');
      return;
    }
    if (!joinCode.trim()) {
      setError('Enter a room code');
      return;
    }
    setError(null);
    send({
      type: 'join-room',
      roomCode: joinCode.trim().toUpperCase(),
      displayName: displayName.trim(),
    });
  };

  const handleQualifying = () => {
    const name = displayName.trim() || 'Solo Racer';
    setError(null);
    qualifyingPending.current = true;
    send({
      type: 'start-qualifying',
      trackId,
      lapCount,
      displayName: name,
    });
  };

  const handleRejoin = () => {
    if (activeRoom) {
      // Navigate to lobby — the server will redirect to game if it's in progress
      navigate(`/lobby/${activeRoom}`);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>HEAT</h1>
      <p style={styles.subtitle}>Pedal to the Metal</p>

      {!connected && (
        <p style={{ color: '#ffaa00', marginBottom: '1rem' }}>
          {status === 'connecting' || status === 'reconnecting' ? 'Connecting to server...' : 'Disconnected from server'}
        </p>
      )}

      {activeRoom && (
        <div style={styles.rejoinBanner}>
          <p>You have an active game in room <strong>{activeRoom}</strong></p>
          <button style={{ ...styles.button, marginTop: '0.75rem' }} onClick={handleRejoin}>
            Rejoin Game
          </button>
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {/* Display Name */}
      <div style={{ ...styles.card, marginBottom: '1.5rem' }}>
        <label style={styles.label}>Display Name</label>
        <input
          style={styles.input}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your name"
          maxLength={20}
        />
      </div>

      {/* Qualifying Laps */}
      <div style={{ ...styles.card, borderLeft: '3px solid #ff6b35' }}>
        <h2 style={styles.heading}>Qualifying Laps</h2>
        <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Solo practice — learn tracks and master mechanics
        </p>
        <label style={styles.label}>Track</label>
        <select style={styles.select} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          {TRACKS.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <label style={styles.label}>Laps</label>
        <select style={styles.select} value={lapCount} onChange={(e) => setLapCount(Number(e.target.value))}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button style={styles.button} onClick={handleQualifying} disabled={!connected}>
          Start Qualifying
        </button>
      </div>

      <p style={styles.divider}>or</p>

      {/* Create Game */}
      <div style={styles.card}>
        <h2 style={styles.heading}>Create Game</h2>
        <label style={styles.label}>Track</label>
        <select style={styles.select} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          {TRACKS.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Laps</label>
            <select style={styles.select} value={lapCount} onChange={(e) => setLapCount(Number(e.target.value))}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Players</label>
            <select style={styles.select} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <button style={styles.button} onClick={handleCreate} disabled={!connected}>
          Create Game
        </button>
      </div>

      <p style={styles.divider}>or</p>

      {/* Join Game */}
      <div style={styles.card}>
        <h2 style={styles.heading}>Join Game</h2>
        <label style={styles.label}>Room Code</label>
        <input
          style={styles.input}
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="e.g. ABCD"
          maxLength={6}
        />
        <button style={styles.buttonSecondary} onClick={handleJoin} disabled={!connected}>
          Join Game
        </button>
      </div>
    </div>
  );
}
