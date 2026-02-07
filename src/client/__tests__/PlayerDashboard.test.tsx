// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { PlayerDashboard } from '../components/PlayerDashboard.js';
import type { ClientGameState, PrivatePlayerState, HandCard } from '../../server/types.js';
import type { Gear } from '../../types.js';
import type { GearTarget } from '../components/GearSelector.js';

function makePrivateState(overrides: Partial<PrivatePlayerState> = {}): PrivatePlayerState {
  return {
    id: 'player-1',
    gear: 2 as Gear,
    position: 10,
    lapCount: 0,
    speed: 0,
    hand: [
      { type: 'speed', value: 1, playable: true },
      { type: 'speed', value: 3, playable: true },
      { type: 'speed', value: 4, playable: true },
      { type: 'heat', playable: false },
      { type: 'stress', playable: true },
      { type: 'upgrade', subtype: 'speed-5', playable: true },
      { type: 'speed', value: 2, playable: true },
    ] as HandCard[],
    drawPileCount: 8,
    discardPile: [],
    engineZone: Array.from({ length: 6 }, () => ({ type: 'heat' as const })),
    hasBoosted: false,
    playedCards: [],
    ...overrides,
  };
}

function makeGameState(
  overrides: Partial<ClientGameState> = {},
  selfOverrides: Partial<PrivatePlayerState> = {},
): ClientGameState {
  return {
    round: 1,
    phase: 'gear-shift',
    phaseType: 'simultaneous' as const,
    activePlayerIndex: 0,
    turnOrder: [0, 1],
    lapTarget: 2,
    raceStatus: 'racing',
    playerIndex: 0,
    self: makePrivateState(selfOverrides),
    opponents: [
      {
        id: 'player-2',
        gear: 2 as Gear,
        position: 8,
        lapCount: 0,
        speed: 0,
        handCount: 7,
        drawPileCount: 8,
        discardPileCount: 0,
        engineZoneCount: 6,
        hasBoosted: false,
        playedCardCount: 0,
      },
    ],
    totalSpaces: 48,
    ...overrides,
  };
}

const defaultGearTargets: GearTarget[] = [
  { gear: 1, cost: 'free' },
  { gear: 2, cost: 'free' },
  { gear: 3, cost: 'free' },
];

const defaultCallbacks = {
  onGearShift: vi.fn(),
  onPlayCards: vi.fn(),
  onCooldown: vi.fn(),
  onBoost: vi.fn(),
  onSlipstream: vi.fn(),
  onReactDone: vi.fn(),
  onDiscard: vi.fn(),
};

describe('PlayerDashboard', () => {
  it('renders the dashboard', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('player-dashboard')).toBeTruthy();
  });

  it('shows phase indicator', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('phase-indicator')).toBeTruthy();
    expect(screen.getByTestId('phase-indicator').textContent).toContain('Shift Gears');
  });

  it('shows gear selector', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('gear-selector')).toBeTruthy();
  });

  it('shows engine zone with heat count', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('engine-zone')).toBeTruthy();
    expect(screen.getByTestId('engine-heat-count').textContent).toBe('6/6');
  });

  it('shows hand display with all cards', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('hand-display')).toBeTruthy();
    expect(screen.getByTestId('hand-display').textContent).toContain('7 cards');
  });

  it('shows deck status with draw and discard counts', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('deck-status')).toBeTruthy();
    expect(screen.getByTestId('draw-count').textContent).toBe('8');
  });

  it('enables gear selector only during gear-shift phase', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    // During gear-shift, valid gear buttons should be enabled
    expect((screen.getByTestId('gear-1') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('gear-3') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables gear selector during play-cards phase', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState({ phase: 'play-cards' })}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    // All gear buttons should be disabled during play-cards
    for (const g of [1, 2, 3, 4]) {
      expect((screen.getByTestId(`gear-${g}`) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('calls onGearShift when gear selected', () => {
    const onGearShift = vi.fn();
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
        onGearShift={onGearShift}
      />,
    );
    fireEvent.click(screen.getByTestId('gear-3'));
    expect(onGearShift).toHaveBeenCalledWith(3);
  });

  it('shows play area during play-cards phase', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState({ phase: 'play-cards' })}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('play-area')).toBeTruthy();
  });

  it('hides play area during gear-shift phase', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState({ phase: 'gear-shift' })}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.queryByTestId('play-area')).toBeNull();
  });

  it('shows react phase controls when active and in react phase', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState(
          { phase: 'react', activePlayerIndex: 0 },
          { gear: 1 },
        )}
        validGearTargets={[]}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('phase-controls')).toBeTruthy();
  });

  it('hides react controls when not active player', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState({ phase: 'react', activePlayerIndex: 1 })}
        validGearTargets={[]}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.queryByTestId('phase-controls')).toBeNull();
  });

  it('shows slipstream prompt during slipstream phase when eligible', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState({ phase: 'slipstream', activePlayerIndex: 0 })}
        validGearTargets={[]}
        slipstreamEligible={true}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('slipstream-prompt')).toBeTruthy();
  });

  it('hides slipstream when not eligible', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState({ phase: 'slipstream', activePlayerIndex: 0 })}
        validGearTargets={[]}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.queryByTestId('slipstream-prompt')).toBeNull();
  });

  it('shows discard confirm during discard phase', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState({ phase: 'discard' })}
        validGearTargets={[]}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('confirm-discard')).toBeTruthy();
  });

  it('shows heat-in-hand warning when heat cards in hand', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState()}
        validGearTargets={defaultGearTargets}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    expect(screen.getByTestId('heat-in-hand-warning')).toBeTruthy();
    expect(screen.getByTestId('heat-in-hand-warning').textContent).toContain(
      '1 Heat card stuck in hand',
    );
  });

  it('shows speed display during movement', () => {
    render(
      <PlayerDashboard
        gameState={makeGameState(
          { phase: 'reveal-and-move' },
          { speed: 7 },
        )}
        validGearTargets={[]}
        slipstreamEligible={false}
        {...defaultCallbacks}
      />,
    );
    const speedDisplay = screen.getByTestId('speed-display');
    expect(speedDisplay.textContent).toContain('7');
  });
});
