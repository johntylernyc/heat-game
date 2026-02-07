/**
 * OpponentPanel — displays public state for all opponents in the race.
 *
 * Shows each opponent's name, car color, position, gear, lap count,
 * and speed so players can make informed racing decisions.
 */

import type { PublicPlayerState, ClientPlayerInfo } from '../../server/types.js';

export interface OpponentPanelProps {
  opponents: PublicPlayerState[];
  playerInfo: Record<string, ClientPlayerInfo>;
  totalSpaces: number;
  lapTarget: number;
}

const CAR_COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  black: '#a1a1aa',
  white: '#f1f5f9',
};

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 12,
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.05)',
};

const headerStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: '#64748b',
  marginBottom: 4,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 8px',
  borderRadius: 6,
  background: 'rgba(255, 255, 255, 0.03)',
};

const colorDotStyle = (color: string): React.CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: CAR_COLOR_HEX[color] ?? '#64748b',
  flexShrink: 0,
});

const nameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  fontWeight: 600,
  color: '#e2e8f0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const statStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  textAlign: 'center',
  minWidth: 32,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: '#475569',
};

const statValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
};

export function OpponentPanel({ opponents, playerInfo, totalSpaces, lapTarget }: OpponentPanelProps) {
  if (opponents.length === 0) return null;

  // Sort by race progress: lap count desc, then position desc
  const sorted = [...opponents].sort((a, b) => {
    if (b.lapCount !== a.lapCount) return b.lapCount - a.lapCount;
    return b.position - a.position;
  });

  return (
    <div style={panelStyle} data-testid="opponent-panel">
      <div style={headerStyle}>Opponents</div>
      {sorted.map((opp) => {
        const info = playerInfo[opp.id];
        const displayName = info?.displayName ?? opp.id;
        const carColor = info?.carColor ?? 'black';

        return (
          <div key={opp.id} style={rowStyle} data-testid={`opponent-${opp.id}`}>
            <span style={colorDotStyle(carColor)} />
            <span style={nameStyle}>{displayName}</span>
            <div style={statStyle}>
              <div style={{ ...statValueStyle, color: '#f59e0b' }}>{opp.gear}</div>
              <div style={statLabelStyle}>Gear</div>
            </div>
            <div style={statStyle}>
              <div style={{ ...statValueStyle, color: '#3b82f6' }}>{opp.speed}</div>
              <div style={statLabelStyle}>Spd</div>
            </div>
            <div style={statStyle}>
              <div style={{ ...statValueStyle, color: '#22c55e' }}>
                {opp.lapCount}/{lapTarget}
              </div>
              <div style={statLabelStyle}>Lap</div>
            </div>
            <div style={statStyle}>
              <div style={{ ...statValueStyle, color: '#94a3b8' }}>{opp.position}</div>
              <div style={statLabelStyle}>Pos</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
