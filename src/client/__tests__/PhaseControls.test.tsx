// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { PhaseControls } from '../components/PhaseControls.js';
import type { Card } from '../../types.js';

describe('PhaseControls', () => {
  const heatCards: { index: number; card: Card }[] = [
    { index: 2, card: { type: 'heat' } },
    { index: 5, card: { type: 'heat' } },
  ];

  it('shows cooldown controls when cooldownSlots > 0', () => {
    render(
      <PhaseControls
        gear={2}
        cooldownSlots={1}
        heatCardsInHand={heatCards}
        onCooldown={() => {}}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );
    expect(screen.getByTestId('cooldown-controls')).toBeTruthy();
  });

  it('hides cooldown when slots are 0', () => {
    render(
      <PhaseControls
        gear={3}
        cooldownSlots={0}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );
    expect(screen.queryByTestId('cooldown-controls')).toBeNull();
  });

  it('selects heat cards for cooldown', () => {
    const onCooldown = vi.fn();
    render(
      <PhaseControls
        gear={1}
        cooldownSlots={3}
        heatCardsInHand={heatCards}
        onCooldown={onCooldown}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('heat-select-2'));
    fireEvent.click(screen.getByTestId('heat-select-5'));
    fireEvent.click(screen.getByTestId('cooldown-confirm'));

    expect(onCooldown).toHaveBeenCalledWith([2, 5]);
  });

  it('limits selection to max cooldown slots', () => {
    render(
      <PhaseControls
        gear={2}
        cooldownSlots={1}
        heatCardsInHand={heatCards}
        onCooldown={() => {}}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );

    // Select first heat card
    fireEvent.click(screen.getByTestId('heat-select-2'));
    // Try to select second — should not add (max 1 slot)
    fireEvent.click(screen.getByTestId('heat-select-5'));

    expect(screen.getByTestId('cooldown-confirm').textContent).toContain('1/1');
  });

  it('shows boost controls only for 4th gear', () => {
    render(
      <PhaseControls
        gear={4}
        cooldownSlots={0}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={true}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );
    expect(screen.getByTestId('boost-controls')).toBeTruthy();
  });

  it('hides boost for non-4th gear', () => {
    render(
      <PhaseControls
        gear={3}
        cooldownSlots={0}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );
    expect(screen.queryByTestId('boost-controls')).toBeNull();
  });

  it('calls onBoost when boost button clicked', () => {
    const onBoost = vi.fn();
    render(
      <PhaseControls
        gear={4}
        cooldownSlots={0}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={true}
        hasBoosted={false}
        onBoost={onBoost}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('boost-button'));
    expect(onBoost).toHaveBeenCalledOnce();
  });

  it('disables boost when already boosted', () => {
    render(
      <PhaseControls
        gear={4}
        cooldownSlots={0}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={true}
        hasBoosted={true}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );
    expect((screen.getByTestId('boost-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('boost-button').textContent).toBe('Already Boosted');
  });

  it('shows slipstream controls when eligible', () => {
    render(
      <PhaseControls
        gear={2}
        cooldownSlots={1}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={true}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );
    expect(screen.getByTestId('slipstream-controls')).toBeTruthy();
  });

  it('calls onSlipstream with accept/decline', () => {
    const onSlipstream = vi.fn();
    render(
      <PhaseControls
        gear={2}
        cooldownSlots={0}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={true}
        onSlipstream={onSlipstream}
        onReactDone={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('slipstream-accept'));
    expect(onSlipstream).toHaveBeenCalledWith(true);
  });

  it('calls onReactDone when done button clicked', () => {
    const onReactDone = vi.fn();
    render(
      <PhaseControls
        gear={3}
        cooldownSlots={0}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={onReactDone}
      />,
    );
    fireEvent.click(screen.getByTestId('react-done'));
    expect(onReactDone).toHaveBeenCalledOnce();
  });

  it('shows no-heat message when cooldown available but no heat in hand', () => {
    render(
      <PhaseControls
        gear={1}
        cooldownSlots={3}
        heatCardsInHand={[]}
        onCooldown={() => {}}
        canBoost={false}
        hasBoosted={false}
        onBoost={() => {}}
        slipstreamEligible={false}
        onSlipstream={() => {}}
        onReactDone={() => {}}
      />,
    );
    expect(screen.getByTestId('cooldown-controls').textContent).toContain(
      'No Heat cards in hand',
    );
  });
});
