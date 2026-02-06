/**
 * PhaseControls — Cooldown, Boost, and Slipstream controls.
 *
 * During the React phase:
 * - Cooldown: select Heat cards from hand to return to engine
 * - Boost (4th gear): spend 1 Heat from engine for extra speed
 * - Slipstream: opt in/out when eligible
 */

import type { Card, Gear } from '../../types.js';
import { COOLDOWN_PER_GEAR } from '../../types.js';
import { useState } from 'react';

export interface PhaseControlsProps {
  gear: Gear;
  cooldownSlots: number;
  heatCardsInHand: { index: number; card: Card }[];
  onCooldown: (heatIndices: number[]) => void;
  canBoost: boolean;
  hasBoosted: boolean;
  onBoost: () => void;
  slipstreamEligible: boolean;
  onSlipstream: (accept: boolean) => void;
  onReactDone: () => void;
  disabled?: boolean;
}

const sectionStyle: React.CSSProperties = {
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

const actionButtonBase: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  transition: 'background 0.15s',
};

export function PhaseControls({
  gear,
  cooldownSlots,
  heatCardsInHand,
  onCooldown,
  canBoost,
  hasBoosted,
  onBoost,
  slipstreamEligible,
  onSlipstream,
  onReactDone,
  disabled,
}: PhaseControlsProps) {
  const [selectedHeatIndices, setSelectedHeatIndices] = useState<number[]>([]);
  const maxCooldown = cooldownSlots;

  const toggleHeatCard = (index: number) => {
    setSelectedHeatIndices(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      }
      if (prev.length >= maxCooldown) return prev;
      return [...prev, index];
    });
  };

  const handleCooldown = () => {
    onCooldown(selectedHeatIndices);
    setSelectedHeatIndices([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="phase-controls">
      {/* Cooldown */}
      {maxCooldown > 0 && (
        <div style={sectionStyle} data-testid="cooldown-controls">
          <div style={headerStyle}>
            Cooldown — Return up to {maxCooldown} Heat to Engine
          </div>
          {heatCardsInHand.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {heatCardsInHand.map(({ index }) => (
                  <button
                    key={index}
                    type="button"
                    style={{
                      ...actionButtonBase,
                      background: selectedHeatIndices.includes(index) ? '#991b1b' : '#1e293b',
                      color: selectedHeatIndices.includes(index) ? '#fca5a5' : '#94a3b8',
                      border: selectedHeatIndices.includes(index)
                        ? '1px solid #f87171'
                        : '1px solid #334155',
                    }}
                    onClick={() => toggleHeatCard(index)}
                    disabled={disabled}
                    aria-pressed={selectedHeatIndices.includes(index)}
                    data-testid={`heat-select-${index}`}
                  >
                    Heat #{index}
                  </button>
                ))}
              </div>
              <button
                type="button"
                style={{
                  ...actionButtonBase,
                  background: selectedHeatIndices.length > 0 ? '#2563eb' : '#334155',
                  color: selectedHeatIndices.length > 0 ? '#fff' : '#64748b',
                  cursor: selectedHeatIndices.length > 0 ? 'pointer' : 'not-allowed',
                }}
                onClick={handleCooldown}
                disabled={disabled || selectedHeatIndices.length === 0}
                data-testid="cooldown-confirm"
              >
                Cool Down ({selectedHeatIndices.length}/{maxCooldown})
              </button>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>
              No Heat cards in hand to cool down
            </div>
          )}
        </div>
      )}

      {/* Boost (4th gear only) */}
      {gear === 4 && (
        <div style={sectionStyle} data-testid="boost-controls">
          <div style={headerStyle}>Boost — Spend 1 Heat from Engine</div>
          <button
            type="button"
            style={{
              ...actionButtonBase,
              background: canBoost && !hasBoosted ? '#dc2626' : '#334155',
              color: canBoost && !hasBoosted ? '#fff' : '#64748b',
              cursor: canBoost && !hasBoosted ? 'pointer' : 'not-allowed',
            }}
            onClick={onBoost}
            disabled={disabled || !canBoost || hasBoosted}
            data-testid="boost-button"
          >
            {hasBoosted ? 'Already Boosted' : canBoost ? 'Boost!' : 'No Heat to Boost'}
          </button>
        </div>
      )}

      {/* Slipstream */}
      {slipstreamEligible && (
        <div style={sectionStyle} data-testid="slipstream-controls">
          <div style={headerStyle}>Slipstream — Move +2 spaces</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{
                ...actionButtonBase,
                background: '#2563eb',
                color: '#fff',
              }}
              onClick={() => onSlipstream(true)}
              disabled={disabled}
              data-testid="slipstream-accept"
            >
              Accept Slipstream
            </button>
            <button
              type="button"
              style={{
                ...actionButtonBase,
                background: '#1e293b',
                color: '#94a3b8',
              }}
              onClick={() => onSlipstream(false)}
              disabled={disabled}
              data-testid="slipstream-decline"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Done with React Phase */}
      <button
        type="button"
        style={{
          ...actionButtonBase,
          background: '#059669',
          color: '#fff',
          padding: '10px 24px',
        }}
        onClick={onReactDone}
        disabled={disabled}
        data-testid="react-done"
      >
        Done with React Phase
      </button>
    </div>
  );
}
