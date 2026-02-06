/**
 * GearSelector — visual gear indicator (1st–4th) with shift controls.
 *
 * Shows current gear, valid shift targets, and cost for each.
 * Active only during gear-shift phase.
 */

import type { Gear } from '../../types.js';
import { CARDS_PER_GEAR } from '../../types.js';

export interface GearTarget {
  gear: Gear;
  cost: 'free' | 'heat';
}

export interface GearSelectorProps {
  currentGear: Gear;
  validTargets: GearTarget[];
  onShift: (gear: Gear) => void;
  disabled?: boolean;
  confirmed?: boolean;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
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
  marginBottom: 4,
};

const gearRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
};

const gearButtonBase: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 8,
  border: '2px solid transparent',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontFamily: 'system-ui, sans-serif',
  fontWeight: 700,
  fontSize: 20,
  transition: 'all 0.15s',
};

const GEARS: Gear[] = [1, 2, 3, 4];

export function GearSelector({
  currentGear,
  validTargets,
  onShift,
  disabled,
  confirmed,
}: GearSelectorProps) {
  const targetMap = new Map(validTargets.map(t => [t.gear, t.cost]));

  return (
    <div style={containerStyle} data-testid="gear-selector">
      <div style={headerStyle}>
        Gear — {currentGear}{ordinal(currentGear)} ({CARDS_PER_GEAR[currentGear]} cards)
      </div>
      <div style={gearRowStyle} role="radiogroup" aria-label="Gear selection">
        {GEARS.map(gear => {
          const isCurrent = gear === currentGear;
          const cost = targetMap.get(gear);
          const isValid = cost !== undefined;
          const isDisabled = disabled || confirmed || !isValid;

          return (
            <button
              key={gear}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              aria-label={`${gear}${ordinal(gear)} gear${cost === 'heat' ? ' (costs 1 Heat)' : ''}`}
              style={{
                ...gearButtonBase,
                background: isCurrent ? '#2563eb' : isValid ? '#1e293b' : '#0f172a',
                color: isCurrent ? '#fff' : isValid ? '#94a3b8' : '#334155',
                borderColor: isCurrent ? '#3b82f6' : 'transparent',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled && !isCurrent ? 0.4 : 1,
              }}
              onClick={() => onShift(gear)}
              disabled={isDisabled}
              data-testid={`gear-${gear}`}
            >
              <span>{gear}</span>
              {cost === 'heat' && !isCurrent && (
                <span style={{ fontSize: 9, color: '#f87171', marginTop: 2 }}>
                  1 HEAT
                </span>
              )}
              {isCurrent && (
                <span style={{ fontSize: 9, color: '#93c5fd', marginTop: 2 }}>
                  CURRENT
                </span>
              )}
            </button>
          );
        })}
      </div>
      {confirmed && (
        <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 500 }}>
          Gear selection locked in
        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
}
