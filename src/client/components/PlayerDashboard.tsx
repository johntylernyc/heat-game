/**
 * PlayerDashboard — primary interaction surface for hand management,
 * gear selection, card play, and engine monitoring.
 *
 * Composes all sub-components and manages local UI state
 * (card selection, confirmations) while delegating game actions
 * to callback props that map to WebSocket messages.
 */

import { useState, useCallback, useMemo } from 'react';
import type { Gear, GamePhase } from '../../types.js';
import { CARDS_PER_GEAR, COOLDOWN_PER_GEAR } from '../../types.js';
import { isPlayableCard } from '../../cards.js';
import type { ClientGameState } from '../../server/types.js';
import { PhaseIndicator } from './PhaseIndicator.js';
import { GearSelector } from './GearSelector.js';
import type { GearTarget } from './GearSelector.js';
import { HandDisplay } from './HandDisplay.js';
import { PlayArea } from './PlayArea.js';
import { EngineZone } from './EngineZone.js';
import { PhaseControls } from './PhaseControls.js';
import { DeckStatus } from './DeckStatus.js';

export interface PlayerDashboardProps {
  gameState: ClientGameState;
  validGearTargets: GearTarget[];
  slipstreamEligible: boolean;
  onGearShift: (targetGear: Gear) => void;
  onPlayCards: (cardIndices: number[]) => void;
  onCooldown: (heatIndices: number[]) => void;
  onBoost: () => void;
  onSlipstream: (accept: boolean) => void;
  onReactDone: () => void;
  onDiscard: (cardIndices: number[]) => void;
}

const dashboardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 16,
  maxWidth: 800,
  fontFamily: 'system-ui, sans-serif',
  color: '#e2e8f0',
  background: '#0f172a',
  borderRadius: 12,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'stretch',
};

type PhaseGroup = 'gear-shift' | 'play-cards' | 'react' | 'slipstream' | 'discard' | 'passive';

function getPhaseGroup(phase: GamePhase): PhaseGroup {
  switch (phase) {
    case 'gear-shift': return 'gear-shift';
    case 'play-cards': return 'play-cards';
    case 'react': return 'react';
    case 'slipstream': return 'slipstream';
    case 'discard': return 'discard';
    default: return 'passive';
  }
}

export function PlayerDashboard({
  gameState,
  validGearTargets,
  slipstreamEligible,
  onGearShift,
  onPlayCards,
  onCooldown,
  onBoost,
  onSlipstream,
  onReactDone,
  onDiscard,
}: PlayerDashboardProps) {
  const { self, phase, phaseType, round, raceStatus, activePlayerIndex, playerIndex } = gameState;
  const isActivePlayer = activePlayerIndex === playerIndex;
  const phaseGroup = getPhaseGroup(phase);

  // Local UI state for card selection
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const [gearConfirmed, setGearConfirmed] = useState(false);
  const [playConfirmed, setPlayConfirmed] = useState(false);

  // Reset selections when phase changes
  const [lastPhase, setLastPhase] = useState<GamePhase>(phase);
  if (phase !== lastPhase) {
    setLastPhase(phase);
    setSelectedCardIndices([]);
    setGearConfirmed(false);
    setPlayConfirmed(false);
  }

  // Card selection toggle
  const toggleCard = useCallback((index: number) => {
    if (playConfirmed) return;
    const card = self.hand[index];
    if (!card || !isPlayableCard(card)) return;

    setSelectedCardIndices(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      }
      const maxCards = CARDS_PER_GEAR[self.gear];
      if (prev.length >= maxCards) return prev;
      return [...prev, index];
    });
  }, [self.hand, self.gear, playConfirmed]);

  // Confirm card play
  const handleConfirmPlay = useCallback(() => {
    if (selectedCardIndices.length === CARDS_PER_GEAR[self.gear]) {
      setPlayConfirmed(true);
      onPlayCards(selectedCardIndices);
    }
  }, [selectedCardIndices, self.gear, onPlayCards]);

  // Gear shift with local confirmation
  const handleGearShift = useCallback((gear: Gear) => {
    setGearConfirmed(true);
    onGearShift(gear);
  }, [onGearShift]);

  // Discard phase — reuse card selection
  const handleConfirmDiscard = useCallback(() => {
    onDiscard(selectedCardIndices);
    setSelectedCardIndices([]);
  }, [selectedCardIndices, onDiscard]);

  // Heat cards in hand (for cooldown)
  const heatCardsInHand = useMemo(() =>
    self.hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.type === 'heat'),
    [self.hand],
  );

  // Selected cards for play area display
  const selectedCards = useMemo(() =>
    selectedCardIndices.map(i => self.hand[i]).filter(Boolean),
    [selectedCardIndices, self.hand],
  );

  const heatInHand = self.hand.filter(c => c.type === 'heat').length;
  const canConfirmPlay = selectedCardIndices.length === CARDS_PER_GEAR[self.gear];
  const canBoost = self.gear === 4 && !self.hasBoosted && self.engineZone.some(c => c.type === 'heat');
  const cooldownSlots = COOLDOWN_PER_GEAR[self.gear];

  return (
    <div style={dashboardStyle} data-testid="player-dashboard">
      {/* Phase Indicator */}
      <PhaseIndicator
        phase={phase}
        phaseType={phaseType}
        gear={self.gear}
        isActivePlayer={isActivePlayer}
        raceStatus={raceStatus}
        round={round}
        speed={self.speed}
      />

      {/* Top Row: Gear + Engine + Deck Status */}
      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <GearSelector
            currentGear={self.gear}
            validTargets={validGearTargets}
            onShift={handleGearShift}
            disabled={phaseGroup !== 'gear-shift'}
            confirmed={gearConfirmed}
          />
        </div>
        <div style={{ flex: 1 }}>
          <EngineZone
            engineZone={self.engineZone}
            heatInHand={heatInHand}
          />
        </div>
        <DeckStatus
          drawPileCount={self.drawPileCount}
          discardPileCount={self.discardPile.length}
        />
      </div>

      {/* Hand Display */}
      <HandDisplay
        cards={self.hand}
        selectedIndices={selectedCardIndices}
        onToggleCard={toggleCard}
        disabled={phaseGroup !== 'play-cards' && phaseGroup !== 'discard'}
      />

      {/* Play Area — visible during play-cards phase */}
      {phaseGroup === 'play-cards' && (
        <PlayArea
          selectedCards={selectedCards}
          gear={self.gear}
          onConfirm={handleConfirmPlay}
          canConfirm={canConfirmPlay}
          confirmed={playConfirmed}
        />
      )}

      {/* React Phase Controls */}
      {phaseGroup === 'react' && isActivePlayer && (
        <PhaseControls
          gear={self.gear}
          cooldownSlots={cooldownSlots}
          heatCardsInHand={heatCardsInHand}
          onCooldown={onCooldown}
          canBoost={canBoost}
          hasBoosted={self.hasBoosted}
          onBoost={onBoost}
          slipstreamEligible={false}
          onSlipstream={onSlipstream}
          onReactDone={onReactDone}
        />
      )}

      {/* Slipstream Controls */}
      {phaseGroup === 'slipstream' && isActivePlayer && slipstreamEligible && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
          }}
          data-testid="slipstream-prompt"
        >
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: 1,
            color: '#06b6d4',
            marginBottom: 8,
          }}>
            Slipstream Available — Move +2 spaces
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                background: '#0891b2',
                color: '#fff',
              }}
              onClick={() => onSlipstream(true)}
              data-testid="slipstream-accept"
            >
              Accept
            </button>
            <button
              type="button"
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                background: '#1e293b',
                color: '#94a3b8',
              }}
              onClick={() => onSlipstream(false)}
              data-testid="slipstream-decline"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Discard Phase Confirm */}
      {phaseGroup === 'discard' && (
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            style={{
              padding: '8px 24px',
              borderRadius: 6,
              border: 'none',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              background: '#6366f1',
              color: '#fff',
            }}
            onClick={handleConfirmDiscard}
            data-testid="confirm-discard"
          >
            {selectedCardIndices.length > 0
              ? `Discard ${selectedCardIndices.length} card${selectedCardIndices.length > 1 ? 's' : ''}`
              : 'Skip Discard'}
          </button>
        </div>
      )}
    </div>
  );
}
