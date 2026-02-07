/**
 * HandDisplay — shows all cards in the player's hand.
 *
 * Cards are selectable by clicking. Selected cards are highlighted.
 * Heat cards are visually marked as unplayable.
 */

import type { Card } from '../../types.js';
import { CardView } from './CardView.js';

export interface HandDisplayProps {
  cards: Card[];
  playableIndices: number[];
  selectedIndices: number[];
  onToggleCard: (index: number) => void;
  disabled?: boolean;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  padding: 12,
  minHeight: 124,
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

export function HandDisplay({
  cards,
  playableIndices,
  selectedIndices,
  onToggleCard,
  disabled,
}: HandDisplayProps) {
  const playableSet = new Set(playableIndices);

  return (
    <div data-testid="hand-display">
      <div style={headerStyle}>
        Hand ({cards.length} cards, {playableIndices.length} playable)
      </div>
      <div style={containerStyle} role="group" aria-label="Cards in hand">
        {cards.map((card, index) => (
          <CardView
            key={index}
            card={card}
            selected={selectedIndices.includes(index)}
            disabled={disabled || !playableSet.has(index)}
            onClick={() => onToggleCard(index)}
          />
        ))}
        {cards.length === 0 && (
          <div style={{ color: '#64748b', fontStyle: 'italic', padding: 16 }}>
            No cards in hand
          </div>
        )}
      </div>
    </div>
  );
}
