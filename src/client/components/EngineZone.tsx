/**
 * EngineZone — displays Heat cards in the engine and heat stuck in hand.
 *
 * Shows engine heat count and visual indicator for heat in hand.
 */

import type { Card } from '../../types.js';

export interface EngineZoneProps {
  engineZone: Card[];
  heatInHand: number;
}

const containerStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.05)',
};

const headerStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  color: '#94a3b8',
  marginBottom: 8,
};

const meterStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
};

const heatPipBase: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
};

export function EngineZone({ engineZone, heatInHand }: EngineZoneProps) {
  const heatCount = engineZone.filter(c => c.type === 'heat').length;

  return (
    <div style={containerStyle} data-testid="engine-zone">
      <div style={headerStyle}>Engine</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            Heat in Engine
          </div>
          <div style={meterStyle} aria-label={`${heatCount} heat cards in engine`}>
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                style={{
                  ...heatPipBase,
                  background: i < heatCount ? '#991b1b' : '#1e293b',
                  color: i < heatCount ? '#f87171' : '#334155',
                }}
                data-testid={`engine-pip-${i}`}
              >
                {i < heatCount ? '🔥' : '·'}
              </div>
            ))}
            <span
              style={{ marginLeft: 8, fontSize: 14, fontWeight: 600, color: '#f87171' }}
              data-testid="engine-heat-count"
            >
              {heatCount}/6
            </span>
          </div>
        </div>

        {heatInHand > 0 && (
          <div
            style={{
              fontSize: 12,
              color: '#fbbf24',
              fontWeight: 500,
              padding: '4px 8px',
              background: 'rgba(251, 191, 36, 0.1)',
              borderRadius: 4,
            }}
            data-testid="heat-in-hand-warning"
          >
            {heatInHand} Heat card{heatInHand > 1 ? 's' : ''} stuck in hand
          </div>
        )}
      </div>
    </div>
  );
}
