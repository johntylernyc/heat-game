// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { PhaseIndicator } from '../components/PhaseIndicator.js';

describe('PhaseIndicator', () => {
  it('shows gear-shift phase label and prompt', () => {
    render(
      <PhaseIndicator
        phase="gear-shift"
        phaseType="simultaneous"
        gear={2}
        isActivePlayer={true}
        raceStatus="racing"
        round={1}
        speed={0}
      />,
    );
    const indicator = screen.getByTestId('phase-indicator');
    expect(indicator.textContent).toContain('Shift Gears');
    expect(screen.getByTestId('action-prompt').textContent).toBe('Select your gear');
  });

  it('shows play-cards prompt with correct card count', () => {
    render(
      <PhaseIndicator
        phase="play-cards"
        phaseType="simultaneous"
        gear={3}
        isActivePlayer={true}
        raceStatus="racing"
        round={2}
        speed={0}
      />,
    );
    expect(screen.getByTestId('action-prompt').textContent).toBe('Play 3 cards');
  });

  it('shows singular form for 1st gear', () => {
    render(
      <PhaseIndicator
        phase="play-cards"
        phaseType="simultaneous"
        gear={1}
        isActivePlayer={true}
        raceStatus="racing"
        round={1}
        speed={0}
      />,
    );
    expect(screen.getByTestId('action-prompt').textContent).toBe('Play 1 card');
  });

  it('shows waiting state for sequential phases when not active', () => {
    render(
      <PhaseIndicator
        phase="react"
        phaseType="sequential"
        gear={2}
        isActivePlayer={false}
        raceStatus="racing"
        round={1}
        speed={0}
      />,
    );
    expect(screen.getByTestId('action-prompt').textContent).toBe(
      'Waiting for other player...',
    );
  });

  it('shows react prompt when active', () => {
    render(
      <PhaseIndicator
        phase="react"
        phaseType="sequential"
        gear={2}
        isActivePlayer={true}
        raceStatus="racing"
        round={1}
        speed={0}
      />,
    );
    expect(screen.getByTestId('action-prompt').textContent).toBe(
      'Cooldown, Boost, or pass',
    );
  });

  it('shows round number', () => {
    render(
      <PhaseIndicator
        phase="gear-shift"
        phaseType="simultaneous"
        gear={2}
        isActivePlayer={true}
        raceStatus="racing"
        round={5}
        speed={0}
      />,
    );
    expect(screen.getByTestId('phase-indicator').textContent).toContain('Round 5');
  });

  it('shows FINAL LAP indicator', () => {
    render(
      <PhaseIndicator
        phase="gear-shift"
        phaseType="simultaneous"
        gear={2}
        isActivePlayer={true}
        raceStatus="final-round"
        round={3}
        speed={0}
      />,
    );
    expect(screen.getByTestId('phase-indicator').textContent).toContain('FINAL LAP');
  });

  it('shows speed when > 0', () => {
    render(
      <PhaseIndicator
        phase="reveal-and-move"
        phaseType="sequential-auto"
        gear={3}
        isActivePlayer={true}
        raceStatus="racing"
        round={2}
        speed={8}
      />,
    );
    const speedDisplay = screen.getByTestId('speed-display');
    expect(speedDisplay.textContent).toContain('8');
  });

  it('hides speed when 0', () => {
    render(
      <PhaseIndicator
        phase="gear-shift"
        phaseType="simultaneous"
        gear={2}
        isActivePlayer={true}
        raceStatus="racing"
        round={1}
        speed={0}
      />,
    );
    expect(screen.queryByTestId('speed-display')).toBeNull();
  });

  it('shows race complete for finished phase', () => {
    render(
      <PhaseIndicator
        phase="finished"
        phaseType="automatic"
        gear={2}
        isActivePlayer={true}
        raceStatus="finished"
        round={10}
        speed={0}
      />,
    );
    expect(screen.getByTestId('action-prompt').textContent).toBe('Race complete!');
  });
});
