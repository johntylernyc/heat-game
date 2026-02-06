/**
 * PlayArea — shows cards selected for play with a confirm button.
 *
 * Enforces correct card count for the current gear.
 * Confirm button locks in selection during simultaneous phases.
 */

import type { Card, Gear } from '../../types.js';
import { CARDS_PER_GEAR } from '../../types.js';
import { CardView } from './CardView.js';

export interface PlayAreaProps {
  selectedCards: Card[];
  gear: Gear;
  onConfirm: () => void;
  canConfirm: boolean;
  confirmed?: boolean;
}

const containerStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px dashed rgba(255, 255, 255, 0.15)',
};

const cardsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  minHeight: 100,
  alignItems: 'center',
  justifyContent: 'center',
};

const headerStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  color: '#94a3b8',
  marginBottom: 8,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 24px',
  borderRadius: 6,
  border: 'none',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  transition: 'background 0.15s',
};

export function PlayArea({
  selectedCards,
  gear,
  onConfirm,
  canConfirm,
  confirmed,
}: PlayAreaProps) {
  const required = CARDS_PER_GEAR[gear];
  const count = selectedCards.length;

  return (
    <div style={containerStyle} data-testid="play-area">
      <div style={headerStyle}>
        <span>
          Play Area — {count}/{required} cards
        </span>
        {count !== required && (
          <span style={{ color: '#f59e0b', fontSize: 11 }}>
            Select {required - count} more
          </span>
        )}
      </div>
      <div style={cardsRowStyle}>
        {selectedCards.map((card, i) => (
          <CardView key={i} card={card} disabled />
        ))}
        {count === 0 && (
          <div style={{ color: '#475569', fontStyle: 'italic' }}>
            Select cards from your hand
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <button
          type="button"
          style={{
            ...buttonStyle,
            background: canConfirm ? '#2563eb' : '#334155',
            color: canConfirm ? '#fff' : '#64748b',
            cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}
          onClick={onConfirm}
          disabled={!canConfirm || confirmed}
          data-testid="confirm-play"
        >
          {confirmed ? 'Locked In' : 'Confirm Selection'}
        </button>
      </div>
    </div>
  );
}
