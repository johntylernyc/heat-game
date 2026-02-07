import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile.js';
import type { CarColor } from '../../server/types.js';
import { CAR_COLORS } from '../../server/types.js';
import type { GameHistoryEntry } from '../profile.js';

const TRACKS: Record<string, string> = {
  usa: 'USA',
  italy: 'Italy',
  france: 'France',
  'great-britain': 'Great Britain',
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
    background: '#0f172a',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: '600px',
    marginBottom: '2rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold' as const,
    color: '#ff6b35',
  },
  backBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  card: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '1.5rem',
    width: '100%',
    maxWidth: '600px',
    marginBottom: '1rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 'bold' as const,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.85rem',
    color: '#64748b',
  },
  input: {
    width: '100%',
    padding: '0.6rem',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#0f3460',
    color: '#e0e0e0',
    fontSize: '1rem',
    marginBottom: '0.75rem',
    outline: 'none',
  },
  colorRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
    marginBottom: '0.75rem',
  },
  colorSwatch: (color: string, selected: boolean) => ({
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: color,
    border: selected ? '3px solid #ff6b35' : '3px solid transparent',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  }),
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
  },
  statItem: {
    background: '#0f3460',
    borderRadius: '8px',
    padding: '0.75rem',
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold' as const,
    color: '#e0e0e0',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#64748b',
    textTransform: 'uppercase' as const,
  },
  bestGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
  },
  bestItem: {
    background: '#0f3460',
    borderRadius: '8px',
    padding: '0.75rem',
    textAlign: 'center' as const,
  },
  bestTrack: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    marginBottom: '0.25rem',
  },
  bestTime: {
    fontSize: '1.25rem',
    fontWeight: 'bold' as const,
    color: '#2ecc71',
  },
  historyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.6rem 0',
    borderBottom: '1px solid #1e293b',
  },
  historyType: (type: string) => ({
    fontSize: '0.7rem',
    fontWeight: 'bold' as const,
    color: type === 'qualifying' ? '#ff6b35' : '#3b82f6',
    textTransform: 'uppercase' as const,
    background: type === 'qualifying' ? 'rgba(255,107,53,0.15)' : 'rgba(59,130,246,0.15)',
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
  }),
  filterRow: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  filterBtn: (active: boolean) => ({
    padding: '0.3rem 0.75rem',
    borderRadius: '6px',
    border: 'none',
    background: active ? '#ff6b35' : '#1e293b',
    color: active ? '#fff' : '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.8rem',
  }),
  empty: {
    color: '#475569',
    fontSize: '0.9rem',
    textAlign: 'center' as const,
    padding: '1rem 0',
  },
} as const;

const COLOR_HEX: Record<CarColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  black: '#374151',
  white: '#d1d5db',
};

export function Profile() {
  const navigate = useNavigate();
  const { profile, stats, history, create, setName, setColor } = useProfile();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.displayName ?? '');
  const [setupColor, setSetupColor] = useState<CarColor>('red');
  const [typeFilter, setTypeFilter] = useState<'all' | 'qualifying' | 'race'>('all');
  const [trackFilter, setTrackFilter] = useState<string>('all');

  // First-visit: show profile setup form
  if (!profile) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Set Up Profile</h1>
          <button style={styles.backBtn} onClick={() => navigate('/')}>Back</button>
        </div>
        <div style={styles.card}>
          <p style={styles.sectionTitle}>Choose a driver name</p>
          <label style={styles.label}>Display Name</label>
          <input
            style={styles.input}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            autoFocus
          />
          <label style={styles.label}>Car Color</label>
          <div style={styles.colorRow}>
            {CAR_COLORS.map((c) => (
              <div
                key={c}
                style={styles.colorSwatch(COLOR_HEX[c], c === setupColor)}
                onClick={() => setSetupColor(c)}
                title={c}
              />
            ))}
          </div>
          <button
            style={{ ...styles.backBtn, width: '100%', marginTop: '1rem', background: '#ff6b35', color: '#fff', border: 'none', padding: '0.75rem', fontWeight: 'bold', fontSize: '1rem', borderRadius: '8px', cursor: 'pointer' }}
            onClick={() => {
              const name = nameInput.trim();
              if (name) {
                create(name, setupColor);
              }
            }}
            disabled={!nameInput.trim()}
          >
            Create Profile
          </button>
        </div>
      </div>
    );
  }

  const winRate = stats.racesPlayed > 0
    ? Math.round((stats.racesWon / stats.racesPlayed) * 100)
    : 0;

  const filteredHistory = history.filter((e) => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (trackFilter !== 'all' && e.trackId !== trackFilter) return false;
    return true;
  });

  const handleNameSave = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== profile.displayName) {
      setName(trimmed);
    }
    setEditingName(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Driver Profile</h1>
        <button style={styles.backBtn} onClick={() => navigate('/')}>Back to Home</button>
      </div>

      {/* Identity card */}
      <div style={styles.card}>
        <p style={styles.sectionTitle}>Identity</p>
        <label style={styles.label}>Display Name</label>
        {editingName ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              style={{ ...styles.input, flex: 1, marginBottom: 0 }}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={20}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
            />
            <button
              style={{ ...styles.backBtn, color: '#2ecc71', borderColor: '#2ecc71' }}
              onClick={handleNameSave}
            >
              Save
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: '#e0e0e0', fontSize: '1.1rem' }}>{profile.displayName}</span>
            <button
              style={{ ...styles.backBtn, fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
              onClick={() => { setNameInput(profile.displayName); setEditingName(true); }}
            >
              Edit
            </button>
          </div>
        )}
        <label style={styles.label}>Preferred Car Color</label>
        <div style={styles.colorRow}>
          {CAR_COLORS.map((c) => (
            <div
              key={c}
              style={styles.colorSwatch(COLOR_HEX[c], c === profile.preferredColor)}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Overall stats */}
      <div style={styles.card}>
        <p style={styles.sectionTitle}>Career Stats</p>
        <div style={styles.statGrid}>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats.racesPlayed}</div>
            <div style={styles.statLabel}>Races</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{winRate}%</div>
            <div style={styles.statLabel}>Win Rate</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats.qualifyingRuns}</div>
            <div style={styles.statLabel}>Qualifying Runs</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats.totalPoints}</div>
            <div style={styles.statLabel}>Total Points</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats.podiumFinishes}</div>
            <div style={styles.statLabel}>Podiums</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats.longestWinStreak}</div>
            <div style={styles.statLabel}>Best Streak</div>
          </div>
        </div>
      </div>

      {/* Qualifying bests */}
      <div style={styles.card}>
        <p style={styles.sectionTitle}>Qualifying Bests</p>
        <div style={styles.bestGrid}>
          {Object.entries(TRACKS).map(([id, name]) => {
            const best = stats.bestLapTimes[id];
            return (
              <div key={id} style={styles.bestItem}>
                <div style={styles.bestTrack}>{name}</div>
                <div style={best !== undefined ? styles.bestTime : { ...styles.bestTime, color: '#475569' }}>
                  {best !== undefined ? `${best} rnd${best !== 1 ? 's' : ''}` : '--'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Game history */}
      <div style={styles.card}>
        <p style={styles.sectionTitle}>Recent History</p>
        <div style={styles.filterRow}>
          {(['all', 'qualifying', 'race'] as const).map((f) => (
            <button key={f} style={styles.filterBtn(typeFilter === f)} onClick={() => setTypeFilter(f)}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <select
            style={{ ...styles.filterBtn(false), background: '#1e293b', color: '#94a3b8', border: 'none' }}
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
          >
            <option value="all">All Tracks</option>
            {Object.entries(TRACKS).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        {filteredHistory.length === 0 ? (
          <p style={styles.empty}>No games yet. Go race!</p>
        ) : (
          filteredHistory.slice(0, 20).map((entry, i) => (
            <HistoryRow key={i} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function HistoryRow({ entry }: { entry: GameHistoryEntry }) {
  const trackName = TRACKS[entry.trackId] ?? entry.trackId;
  const date = new Date(entry.timestamp).toLocaleDateString();

  return (
    <div style={styles.historyRow}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={styles.historyType(entry.type)}>{entry.type}</span>
        <span style={{ color: '#e0e0e0', fontSize: '0.9rem' }}>{trackName}</span>
      </div>
      <div style={{ textAlign: 'right' as const }}>
        {entry.type === 'qualifying' ? (
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Best: {entry.result.bestLap > 0 ? `${entry.result.bestLap} rnds` : '--'}
          </span>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            P{entry.result.position} / {entry.result.totalPlayers}
          </span>
        )}
        <div style={{ color: '#475569', fontSize: '0.75rem' }}>{date}</div>
      </div>
    </div>
  );
}
