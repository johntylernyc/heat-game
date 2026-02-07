/**
 * CardView — renders a single game card with rich visual identity per type.
 *
 * Visual design per type:
 * - Speed: Deep blue with white racing stripe, speedometer icon, large bold number
 * - Heat: Dark crimson with ember glow edges, flame icon, pulsing red border when in hand
 * - Stress: Electric yellow with hazard stripes, lightning bolt icon
 * - Upgrade: Emerald green with mechanical texture, gear icon, effect name
 *
 * States: default, hover (lift), selected (golden glow), disabled (desaturated)
 */

import type { Card } from '../../types.js';
import { isPlayableCard, getCardSpeedValue } from '../../cards.js';

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
  justifyContent: 'space-between',
  width: 72,
  height: 100,
  borderRadius: 8,
  borderWidth: 2,
  borderStyle: 'solid',
  borderColor: 'rgba(255,255,255,0.15)',
  cursor: 'pointer',
  fontFamily: '"Barlow Condensed", system-ui, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
  userSelect: 'none',
  position: 'relative',
  padding: '6px 4px 4px',
  overflow: 'hidden',
  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
};

/** Per-type icon characters (using simple unicode/text). */
const TYPE_ICONS: Record<Card['type'], string> = {
  speed: '\u25D4',   // circle with right half black (speedometer feel)
  heat: '\u2666',    // diamond (flame-like)
  stress: '\u26A1',  // lightning bolt
  upgrade: '\u2699', // gear
};

const typeStyles: Record<Card['type'], React.CSSProperties> = {
  speed: {
    background: 'linear-gradient(145deg, #2563eb 0%, #1d4ed8 50%, #1e3a8a 100%)',
    color: '#fff',
  },
  heat: {
    background: 'linear-gradient(145deg, #7f1d1d 0%, #991b1b 40%, #6b2121 100%)',
    color: '#fca5a5',
    opacity: 0.7,
  },
  stress: {
    background: 'linear-gradient(145deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
    color: '#fff',
  },
  upgrade: {
    background: 'linear-gradient(145deg, #059669 0%, #047857 50%, #065f46 100%)',
    color: '#fff',
  },
};

function getCardLabel(card: Card): { primary: string; secondary: string } {
  switch (card.type) {
    case 'speed':
      return { primary: String(card.value), secondary: 'SPEED' };
    case 'heat':
      return { primary: '\u2666', secondary: 'HEAT' };
    case 'stress':
      return { primary: '\u26A1', secondary: 'STRESS' };
    case 'upgrade': {
      const value = getCardSpeedValue(card);
      const label = value !== null ? String(value) : '\u2014';
      return { primary: label, secondary: card.subtype.toUpperCase() };
    }
  }
}

export function CardView({ card, selected, disabled, onClick }: CardViewProps) {
  const playable = isPlayableCard(card);
  const { primary, secondary } = getCardLabel(card);
  const isHeat = card.type === 'heat';

  const style: React.CSSProperties = {
    ...baseStyle,
    ...typeStyles[card.type],
    ...(selected && {
      borderColor: '#fbbf24',
      transform: 'translateY(-10px)',
      boxShadow: '0 6px 20px rgba(251, 191, 36, 0.5), 0 0 8px rgba(251, 191, 36, 0.3)',
    }),
    ...(disabled && {
      opacity: 0.4,
      cursor: 'not-allowed',
      pointerEvents: 'none' as const,
      filter: 'saturate(0.3)',
    }),
    ...(!playable && !disabled && {
      opacity: 0.5,
    }),
    // Heat cards in hand pulse with subtle red border
    ...(isHeat && !disabled && !selected && {
      borderColor: 'rgba(239, 68, 68, 0.6)',
      animation: 'heatPulse 2s ease-in-out infinite',
    }),
  };

  // Top-left type icon
  const iconStyle: React.CSSProperties = {
    position: 'absolute',
    top: 3,
    left: 5,
    fontSize: 10,
    opacity: 0.7,
    lineHeight: 1,
  };

  // Inner frame border
  const frameStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 3,
    borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.1)',
    pointerEvents: 'none',
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
      data-playable={playable}
    >
      {/* Inner frame */}
      <span style={frameStyle} />

      {/* Type icon (top-left) */}
      <span style={iconStyle}>{TYPE_ICONS[card.type]}</span>

      {/* Primary value */}
      <span style={{
        fontSize: card.type === 'speed' ? 30 : 22,
        lineHeight: 1,
        fontWeight: 700,
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        marginTop: card.type === 'speed' ? 4 : 0,
      }}>
        {primary}
      </span>

      {/* Type name (bottom) */}
      <span style={{
        fontSize: 9,
        opacity: 0.8,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        fontWeight: 500,
      }}>
        {secondary}
      </span>
    </button>
  );
}
