import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useGameState } from '../hooks/useGameState.js';
import { PlayerDashboard } from '../components/PlayerDashboard.js';
import type { ServerMessage } from '../../server/types.js';
import type { Gear } from '../../types.js';
import { isSlipstreamEligible } from '../../engine.js';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100vh',
    background: '#0f172a',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1.5rem',
    background: '#1e293b',
    borderBottom: '1px solid #334155',
  },
  roomLabel: {
    color: '#ff6b35',
    fontWeight: 'bold' as const,
    fontSize: '0.9rem',
    letterSpacing: '0.1em',
  },
  connectionDot: (connected: boolean) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: connected ? '#2ecc71' : '#ff4444',
    display: 'inline-block',
    marginRight: '0.5rem',
  }),
  gameArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  boardPlaceholder: {
    width: '100%',
    maxWidth: '900px',
    height: '300px',
    background: '#16213e',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555',
    fontSize: '1.2rem',
    marginBottom: '1rem',
  },
  dashboardArea: {
    width: '100%',
    maxWidth: '900px',
    display: 'flex',
    justifyContent: 'center',
  },
  waiting: {
    textAlign: 'center' as const,
    color: '#888',
    fontSize: '1.2rem',
    padding: '4rem',
  },
  gameOver: {
    textAlign: 'center' as const,
    padding: '3rem',
  },
  gameOverTitle: {
    fontSize: '2rem',
    fontWeight: 'bold' as const,
    color: '#ff6b35',
    marginBottom: '1rem',
  },
  backButton: {
    padding: '0.75rem 2rem',
    borderRadius: '8px',
    border: 'none',
    background: '#ff6b35',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    marginTop: '2rem',
  },
  standingsTable: {
    width: '100%',
    maxWidth: '500px',
    margin: '1.5rem auto',
    borderCollapse: 'collapse' as const,
  },
  standingsHeader: {
    color: '#94a3b8',
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid #334155',
    textAlign: 'left' as const,
  },
  standingsRow: (isFirst: boolean) => ({
    background: isFirst ? 'rgba(255, 107, 53, 0.1)' : 'transparent',
    borderBottom: '1px solid #1e293b',
  }),
  standingsCell: {
    padding: '0.75rem 1rem',
    color: '#e2e8f0',
    fontSize: '0.95rem',
  },
  rankCell: (rank: number) => ({
    padding: '0.75rem 1rem',
    fontWeight: 'bold' as const,
    fontSize: '1.1rem',
    color: rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#cd7f32' : '#e2e8f0',
  }),
};

export function Game() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { sessionToken, setSessionToken, setActiveRoom } = useSession();
  const { state: gameState, handleServerMessage } = useGameState();

  const onMessage = (message: ServerMessage) => {
    handleServerMessage(message);

    if (message.type === 'session-created') {
      setSessionToken(message.sessionToken);
    }
  };

  const { status, send } = useWebSocket({
    sessionToken,
    onMessage,
  });

  const connected = status === 'connected';
  const gs = gameState.gameState;
  const appPhase = gameState.appPhase;
  const standings = gameState.standings;
  const lobbyPlayers = gameState.lobby?.players;

  const handleBackToHome = () => {
    setActiveRoom(null);
    navigate('/');
  };

  // Game over screen
  if (appPhase === 'finished') {
    const displayName = (playerId: string) => {
      const lp = lobbyPlayers?.find((p) => p.playerId === playerId);
      return lp?.displayName ?? playerId;
    };

    return (
      <div style={styles.container}>
        <div style={styles.gameOver}>
          <p style={styles.gameOverTitle}>Race Complete!</p>
          {standings && standings.length > 0 ? (
            <table style={styles.standingsTable}>
              <thead>
                <tr>
                  <th style={styles.standingsHeader}>Pos</th>
                  <th style={styles.standingsHeader}>Driver</th>
                  <th style={styles.standingsHeader}>Laps</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr key={s.playerId} style={styles.standingsRow(s.rank === 1)}>
                    <td style={styles.rankCell(s.rank)}>{s.rank}</td>
                    <td style={styles.standingsCell}>{displayName(s.playerId)}</td>
                    <td style={styles.standingsCell}>{s.lapCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#aaa', marginBottom: '1rem' }}>
              No standings data available.
            </p>
          )}
          <button style={styles.backButton} onClick={handleBackToHome}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Waiting for game state
  if (!gs) {
    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <span style={styles.roomLabel}>{roomCode}</span>
          <span>
            <span style={styles.connectionDot(connected)} />
            {connected ? 'Connected' : 'Reconnecting...'}
          </span>
        </div>
        <div style={styles.waiting}>
          <p>Waiting for game state...</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {status === 'connecting' || status === 'reconnecting'
              ? 'Connecting to server...'
              : 'Connected. Waiting for game data.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Top Bar */}
      <div style={styles.topBar}>
        <span style={styles.roomLabel}>{roomCode}</span>
        <span style={{ color: '#aaa', fontSize: '0.85rem' }}>
          Round {gs.round} &middot; {gs.phase.replace(/-/g, ' ')}
        </span>
        <span>
          <span style={styles.connectionDot(connected)} />
          {connected ? 'Connected' : 'Reconnecting...'}
        </span>
      </div>

      {/* Game Area */}
      <div style={styles.gameArea}>
        {/* Board placeholder — future canvas integration */}
        <div style={styles.boardPlaceholder}>
          Track board (canvas rendering goes here)
        </div>

        {/* Player Dashboard */}
        <div style={styles.dashboardArea}>
          <PlayerDashboard
            gameState={gs}
            validGearTargets={computeValidGearTargets(gs.self.gear)}
            slipstreamEligible={isSlipstreamEligible(
              gs.self.position,
              gs.opponents.map(opp => opp.position),
              gs.totalSpaces,
            )}
            onGearShift={(targetGear: Gear) => send({ type: 'gear-shift', targetGear })}
            onPlayCards={(cardIndices: number[]) => send({ type: 'play-cards', cardIndices })}
            onCooldown={(heatIndices: number[]) => send({ type: 'react-cooldown', heatIndices })}
            onBoost={() => send({ type: 'react-boost' })}
            onSlipstream={(accept: boolean) => send({ type: 'slipstream', accept })}
            onReactDone={() => send({ type: 'react-done' })}
            onDiscard={(cardIndices: number[]) => send({ type: 'discard', cardIndices })}
          />
        </div>
      </div>
    </div>
  );
}

/** Compute valid gear targets based on current gear. */
function computeValidGearTargets(currentGear: Gear): Array<{ gear: Gear; cost: 'free' | 'heat' }> {
  const targets: Array<{ gear: Gear; cost: 'free' | 'heat' }> = [];
  const gears: Gear[] = [1, 2, 3, 4];

  for (const g of gears) {
    const diff = Math.abs(g - currentGear);
    if (diff <= 1) targets.push({ gear: g, cost: 'free' });
    else if (diff === 2) targets.push({ gear: g, cost: 'heat' });
    // diff > 2: not reachable
  }

  return targets;
}
