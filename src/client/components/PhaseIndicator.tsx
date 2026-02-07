/**
 * PhaseIndicator — shows current game phase with action prompt.
 *
 * Provides clear indication of what the player should do.
 * Shows waiting state when not the active player.
 */

import type { GamePhase, Gear, RaceStatus } from '../../types.js';
import { CARDS_PER_GEAR } from '../../types.js';
import type { PhaseType } from '../../server/types.js';

export interface PhaseIndicatorProps {
  phase: GamePhase;
  phaseType: PhaseType;
  gear: Gear;
  isActivePlayer: boolean;
  raceStatus: RaceStatus;
  round: number;
  speed: number;
}

const containerStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
};

const PHASE_LABELS: Record<GamePhase, string> = {
  setup: 'Setup',
  'gear-shift': 'Shift Gears',
  'play-cards': 'Play Cards',
  'reveal-and-move': 'Reveal & Move',
  adrenaline: 'Adrenaline',
  react: 'React',
  slipstream: 'Slipstream',
  'check-corner': 'Corner Check',
  discard: 'Discard',
  replenish: 'Replenish',
  finished: 'Race Over',
};

const PHASE_COLORS: Record<GamePhase, string> = {
  setup: '#64748b',
  'gear-shift': '#3b82f6',
  'play-cards': '#8b5cf6',
  'reveal-and-move': '#f59e0b',
  adrenaline: '#ef4444',
  react: '#10b981',
  slipstream: '#06b6d4',
  'check-corner': '#f97316',
  discard: '#6366f1',
  replenish: '#22c55e',
  finished: '#94a3b8',
};

function isSequentialType(phaseType: PhaseType): boolean {
  return phaseType === 'sequential' || phaseType === 'sequential-auto';
}

function getActionPrompt(phase: GamePhase, phaseType: PhaseType, gear: Gear, isActive: boolean): string {
  if (!isActive && isSequentialType(phaseType)) {
    return 'Waiting for other player...';
  }

  switch (phase) {
    case 'setup':
      return 'Waiting for game to start...';
    case 'gear-shift':
      return 'Select your gear';
    case 'play-cards':
      return `Play ${CARDS_PER_GEAR[gear]} card${CARDS_PER_GEAR[gear] > 1 ? 's' : ''}`;
    case 'reveal-and-move':
      return isActive ? 'Revealing cards...' : 'Waiting for reveal...';
    case 'adrenaline':
      return 'Adrenaline check...';
    case 'react':
      return 'Cooldown, Boost, or pass';
    case 'slipstream':
      return 'Slipstream available?';
    case 'check-corner':
      return 'Checking corner speed...';
    case 'discard':
      return 'Discard cards (optional)';
    case 'replenish':
      return 'Drawing cards...';
    case 'finished':
      return 'Race complete!';
  }
}

export function PhaseIndicator({
  phase,
  phaseType,
  gear,
  isActivePlayer,
  raceStatus,
  round,
  speed,
}: PhaseIndicatorProps) {
  const color = PHASE_COLORS[phase];
  const prompt = getActionPrompt(phase, phaseType, gear, isActivePlayer);
  const isWaiting = !isActivePlayer && isSequentialType(phaseType);

  return (
    <div
      style={{
        ...containerStyle,
        background: `${color}15`,
        border: `1px solid ${color}40`,
      }}
      data-testid="phase-indicator"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color,
            }}
          >
            {PHASE_LABELS[phase]}
          </span>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Round {round}
          </span>
          {raceStatus === 'final-round' && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#ef4444',
              padding: '1px 6px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderRadius: 3,
            }}>
              FINAL LAP
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: isWaiting ? '#64748b' : '#e2e8f0',
            fontStyle: isWaiting ? 'italic' : 'normal',
          }}
          data-testid="action-prompt"
        >
          {prompt}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {speed > 0 && (
          <div
            style={{ textAlign: 'center' }}
            data-testid="speed-display"
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>
              {speed}
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>
              Speed
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
