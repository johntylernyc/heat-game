/**
 * CardView — renders a single game card with visual distinction by type.
 *
 * Speed cards show value prominently.
 * Heat cards are visually "dead" (dark/red).
 * Stress cards are visually distinct (yellow/warning).
 * Upgrade cards show subtype.
 */

import type { Card } from '../../types.js';
import { getCardSpeedValue } from '../../cards.js';

export interface CardViewProps {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: 72,
  height: 100,
  borderRadius: 8,
  border: '2px solid transparent',
  cursor: 'pointer',
  fontFamily: 'system-ui, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  transition: 'transform 0.15s, border-color 0.15s',
  userSelect: 'none',
  position: 'relative',
};

const typeStyles: Record<Card['type'], React.CSSProperties> = {
  speed: {
    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    color: '#fff',
  },
  heat: {
    background: 'linear-gradient(135deg, #6b2121, #991b1b)',
    color: '#f87171',
    opacity: 0.7,
  },
  stress: {
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#fff',
  },
  upgrade: {
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff',
  },
};

function getCardLabel(card: Card): { primary: string; secondary: string } {
  switch (card.type) {
    case 'speed':
      return { primary: String(card.value), secondary: 'SPEED' };
    case 'heat':
      return { primary: '🔥', secondary: 'HEAT' };
    case 'stress':
      return { primary: '⚡', secondary: 'STRESS' };
    case 'upgrade': {
      const value = getCardSpeedValue(card);
      const label = value !== null ? String(value) : '—';
      return { primary: label, secondary: card.subtype.toUpperCase() };
    }
  }
}

export function CardView({ card, selected, disabled, onClick }: CardViewProps) {
  const { primary, secondary } = getCardLabel(card);

  const style: React.CSSProperties = {
    ...baseStyle,
    ...typeStyles[card.type],
    ...(selected && {
      borderColor: '#fbbf24',
      transform: 'translateY(-8px)',
      boxShadow: '0 4px 12px rgba(251, 191, 36, 0.4)',
    }),
    ...(disabled && {
      opacity: 0.4,
      cursor: 'not-allowed',
      pointerEvents: 'none' as const,
    }),
  };

  return (
    <button
      type="button"
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${card.type} card${card.type === 'speed' ? ` value ${card.value}` : ''}`}
      aria-pressed={selected}
      data-card-type={card.type}
      data-playable={!disabled}
    >
      <span style={{ fontSize: card.type === 'speed' ? 28 : 20, lineHeight: 1 }}>
        {primary}
      </span>
      <span style={{ fontSize: 10, marginTop: 4, opacity: 0.8, letterSpacing: 1 }}>
        {secondary}
      </span>
    </button>
  );
}
