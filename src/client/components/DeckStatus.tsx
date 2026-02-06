/**
 * DeckStatus — shows draw pile and discard pile counts.
 */

export interface DeckStatusProps {
  drawPileCount: number;
  discardPileCount: number;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  padding: 12,
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.05)',
};

const pileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
};

const countStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  color: '#64748b',
};

export function DeckStatus({ drawPileCount, discardPileCount }: DeckStatusProps) {
  return (
    <div style={containerStyle} data-testid="deck-status">
      <div style={pileStyle}>
        <span style={{ ...countStyle, color: '#3b82f6' }} data-testid="draw-count">
          {drawPileCount}
        </span>
        <span style={labelStyle}>Draw</span>
      </div>
      <div style={pileStyle}>
        <span style={{ ...countStyle, color: '#94a3b8' }} data-testid="discard-count">
          {discardPileCount}
        </span>
        <span style={labelStyle}>Discard</span>
      </div>
    </div>
  );
}
