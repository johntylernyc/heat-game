import { useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../providers/WebSocketProvider.js';

const ACTIVE_ROOM_KEY = 'heat-active-room';
import { PlayerDashboard } from '../components/PlayerDashboard.js';
import { OpponentPanel } from '../components/OpponentPanel.js';
import type { ClientGameState, QualifyingResultMessage, RaceResultMessage } from '../../server/types.js';
import type { Gear } from '../../types.js';
import { isSlipstreamEligible } from '../../engine.js';
import { loadStats } from '../profile.js';
import { createGameBoard, buildCarStates, buildStandings } from '../board.js';
import type { GameBoard } from '../board.js';
import { PLAYER_COLORS } from '../types.js';
import { baseGameTracks } from '../../track/tracks/index.js';

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
  boardContainer: {
    width: '100%',
    maxWidth: '900px',
    height: '400px',
    borderRadius: '12px',
    overflow: 'hidden',
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
    marginTop: '1rem',
  },
  lapTimer: {
    background: '#1e293b',
    borderRadius: '8px',
    padding: '0.75rem 1.5rem',
    marginBottom: '1rem',
    display: 'flex',
    gap: '2rem',
    alignItems: 'center',
  },
  lapTimerLabel: {
    color: '#888',
    fontSize: '0.8rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  lapTimerValue: {
    color: '#e0e0e0',
    fontSize: '1.1rem',
    fontWeight: 'bold' as const,
  },
  lapBreakdown: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '1.5rem 2rem',
    width: '100%',
    maxWidth: '400px',
    marginTop: '1rem',
  },
  lapRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderBottom: '1px solid #1e293b',
    color: '#ccc',
    fontSize: '0.95rem',
  },
  bestLap: {
    color: '#2ecc71',
    fontWeight: 'bold' as const,
  },
  buttonRow: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
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
  newPb: {
    color: '#fbbf24',
    fontWeight: 'bold' as const,
    fontSize: '1rem',
    marginTop: '0.5rem',
  },
  pbComparison: {
    color: '#94a3b8',
    fontSize: '0.85rem',
    marginTop: '0.25rem',
  },
  raceStats: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '1rem 1.5rem',
    width: '100%',
    maxWidth: '400px',
    margin: '1rem auto',
  },
  raceStatsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.35rem 0',
    color: '#94a3b8',
    fontSize: '0.85rem',
  },
};

export function Game() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { status, send, gameState } = useWebSocketContext();

  const connected = status === 'connected';
  const gs = gameState.gameState;
  const appPhase = gameState.appPhase;
  const standings = gameState.standings;
  const lobbyPlayers = gameState.lobby?.players;
  const isQualifying = gs?.mode === 'qualifying';
  const qualifyingResult = gameState.qualifyingResult;
  const raceResult = gameState.raceResult;

  // Board canvas refs
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<GameBoard | null>(null);

  // Resolve track data from game state (lobby may not be populated in all flows)
  const trackId = gs?.trackId;
  const trackData = trackId ? baseGameTracks[trackId] ?? null : null;

  // Create/destroy board when track data becomes available
  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container || !trackData) return;

    const board = createGameBoard(container, trackData);
    boardRef.current = board;

    return () => {
      board.destroy();
      boardRef.current = null;
    };
  }, [trackData]);

  // Update board with game state on every change
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !gs) return;

    const totalPlayers = 1 + gs.opponents.length;
    const cars = buildCarStates(gs.self, gs.opponents, gs.playerIndex, totalPlayers);
    const carStandings = buildStandings(cars);

    // Slipstream indicator: show when player is eligible during slipstream phase
    let slipstream: [number, number, string] | null = null;
    if (gs.phase === 'slipstream') {
      for (const opp of gs.opponents) {
        const spacesAhead = (opp.position - gs.self.position + gs.totalSpaces) % gs.totalSpaces;
        if (spacesAhead >= 1 && spacesAhead <= 2) {
          slipstream = [gs.self.position, opp.position, PLAYER_COLORS[gs.playerIndex % PLAYER_COLORS.length]];
          break;
        }
      }
    }

    board.update({
      cars,
      phase: gs.phase,
      round: gs.round,
      activePlayerIndex: gs.activePlayerIndex,
      turnOrder: gs.turnOrder,
      lapTarget: gs.lapTarget,
      standings: carStandings,
      myPlayerIndex: gs.playerIndex,
      slipstream,
    });
  }, [gs]);

  const handleBackToHome = () => {
    localStorage.removeItem(ACTIVE_ROOM_KEY);
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
          <p style={styles.gameOverTitle}>
            {isQualifying ? 'Qualifying Complete!' : 'Race Complete!'}
          </p>
          {isQualifying && gs ? (
            <QualifyingResults gameState={gs} result={qualifyingResult} />
          ) : standings && standings.length > 0 ? (
            <>
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
              {raceResult && (
                <RaceResultSummary result={raceResult} />
              )}
            </>
          ) : (
            <p style={{ color: '#aaa', marginBottom: '1rem' }}>
              No standings data available.
            </p>
          )}
          <div style={styles.buttonRow}>
            <button style={styles.backButton} onClick={handleBackToHome}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Waiting for game state
  if (!gs) {
    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <span style={styles.roomLabel}>
            {isQualifying ? 'QUALIFYING' : roomCode}
          </span>
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
        <span style={styles.roomLabel}>
          {isQualifying ? 'QUALIFYING' : roomCode}
        </span>
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
        {/* Qualifying Lap Timer */}
        {isQualifying && <LapTimer gameState={gs} />}

        {/* Game board canvas */}
        <div ref={boardContainerRef} style={styles.boardContainer} />

        {/* Opponent Info */}
        <div style={styles.dashboardArea}>
          <OpponentPanel
            opponents={gs.opponents}
            playerInfo={gs.playerInfo}
            totalSpaces={gs.totalSpaces}
            lapTarget={gs.lapTarget}
          />
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

/** Lap timer panel for qualifying mode — shows personal best from profile. */
function LapTimer({ gameState: gs }: { gameState: ClientGameState }) {
  const { self, lapTarget, round } = gs;
  const currentLapRounds = round - (self.lapRounds.length > 0 ? self.lapRounds[self.lapRounds.length - 1] : 0);
  const bestLap = self.lapRounds.length > 0
    ? Math.min(...self.lapRounds.map((r, i) => r - (i > 0 ? self.lapRounds[i - 1] : 0)))
    : null;

  // Load personal best from profile for comparison
  const stats = loadStats();
  const trackId = (gs as ClientGameState & { trackId?: string }).trackId;
  const personalBest = trackId ? stats.bestLapTimes[trackId] : undefined;

  return (
    <div style={styles.lapTimer}>
      <div>
        <div style={styles.lapTimerLabel}>Lap</div>
        <div style={styles.lapTimerValue}>
          {Math.min(self.lapCount + 1, lapTarget)} / {lapTarget}
        </div>
      </div>
      <div>
        <div style={styles.lapTimerLabel}>Current</div>
        <div style={styles.lapTimerValue}>{currentLapRounds} rnd{currentLapRounds !== 1 ? 's' : ''}</div>
      </div>
      {bestLap !== null && (
        <div>
          <div style={styles.lapTimerLabel}>Best</div>
          <div style={{ ...styles.lapTimerValue, color: '#2ecc71' }}>
            {bestLap} rnd{bestLap !== 1 ? 's' : ''}
          </div>
        </div>
      )}
      {personalBest !== undefined && (
        <div>
          <div style={styles.lapTimerLabel}>PB</div>
          <div style={{ ...styles.lapTimerValue, color: '#fbbf24' }}>
            {personalBest} rnd{personalBest !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

/** Qualifying results with per-lap breakdown and PB comparison. */
function QualifyingResults({ gameState: gs, result }: { gameState: ClientGameState; result: QualifyingResultMessage | null }) {
  const { self } = gs;
  const lapTimes = self.lapRounds.map((r, i) => r - (i > 0 ? self.lapRounds[i - 1] : 0));
  const bestIdx = lapTimes.length > 0 ? lapTimes.indexOf(Math.min(...lapTimes)) : -1;
  const totalRounds = self.lapRounds.length > 0 ? self.lapRounds[self.lapRounds.length - 1] : 0;

  // Check personal best comparison
  const stats = loadStats();
  const trackId = result?.trackId;
  const currentBestLap = lapTimes.length > 0 ? Math.min(...lapTimes) : null;
  const previousBestLap = trackId ? stats.bestLapTimes[trackId] : undefined;

  // If the result was already recorded, the current stats reflect the updated value.
  // A new PB means the stats best equals the current best (since it was just recorded).
  const isNewPB = currentBestLap !== null && previousBestLap !== undefined && currentBestLap <= previousBestLap;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <p style={{ color: '#aaa', marginBottom: '0.5rem' }}>
        {self.lapCount} lap{self.lapCount !== 1 ? 's' : ''} in {totalRounds} round{totalRounds !== 1 ? 's' : ''}
      </p>
      {isNewPB && (
        <p style={styles.newPb}>New Personal Best!</p>
      )}
      {previousBestLap !== undefined && !isNewPB && currentBestLap !== null && (
        <p style={styles.pbComparison}>
          {currentBestLap - previousBestLap} round{Math.abs(currentBestLap - previousBestLap) !== 1 ? 's' : ''} off your best
        </p>
      )}
      {lapTimes.length > 0 && (
        <div style={styles.lapBreakdown}>
          <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Lap Breakdown
          </p>
          {lapTimes.map((time, i) => (
            <div key={i} style={styles.lapRow}>
              <span>Lap {i + 1}</span>
              <span style={i === bestIdx ? styles.bestLap : undefined}>
                {time} round{time !== 1 ? 's' : ''}
                {i === bestIdx && lapTimes.length > 1 ? ' (best)' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Race result summary showing points earned. */
function RaceResultSummary({ result }: { result: RaceResultMessage }) {
  return (
    <div style={styles.raceStats}>
      <div style={styles.raceStatsRow}>
        <span>Points earned</span>
        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>+{result.points}</span>
      </div>
      <div style={styles.raceStatsRow}>
        <span>Your position</span>
        <span>P{result.position} / {result.totalPlayers}</span>
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
