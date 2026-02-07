// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { HandDisplay } from '../components/HandDisplay.js';
import type { Card } from '../../types.js';

describe('HandDisplay', () => {
  const hand: Card[] = [
    { type: 'speed', value: 1 },
    { type: 'speed', value: 3 },
    { type: 'heat' },
    { type: 'stress' },
    { type: 'upgrade', subtype: 'speed-5' },
  ];
  // Indices 0,1,3,4 are playable; index 2 (heat) is not
  const playableIndices = [0, 1, 3, 4];

  it('renders all cards in hand', () => {
    render(
      <HandDisplay cards={hand} playableIndices={playableIndices} selectedIndices={[]} onToggleCard={() => {}} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('shows card count and playable count in header', () => {
    render(
      <HandDisplay cards={hand} playableIndices={playableIndices} selectedIndices={[]} onToggleCard={() => {}} />,
    );
    const display = screen.getByTestId('hand-display');
    expect(display.textContent).toContain('5 cards');
    expect(display.textContent).toContain('4 playable');
  });

  it('calls onToggleCard with card index', () => {
    const onToggle = vi.fn();
    render(
      <HandDisplay cards={hand} playableIndices={playableIndices} selectedIndices={[]} onToggleCard={onToggle} />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it('marks heat cards as disabled', () => {
    render(
      <HandDisplay cards={hand} playableIndices={playableIndices} selectedIndices={[]} onToggleCard={() => {}} />,
    );
    const buttons = screen.getAllByRole('button');
    // Heat card at index 2
    expect((buttons[2] as HTMLButtonElement).disabled).toBe(true);
  });

  it('highlights selected cards', () => {
    render(
      <HandDisplay cards={hand} playableIndices={playableIndices} selectedIndices={[0, 1]} onToggleCard={() => {}} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[3].getAttribute('aria-pressed')).toBe('false');
  });

  it('disables all cards when disabled', () => {
    render(
      <HandDisplay cards={hand} playableIndices={playableIndices} selectedIndices={[]} onToggleCard={() => {}} disabled />,
    );
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button: HTMLElement) => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('shows empty message when no cards', () => {
    render(
      <HandDisplay cards={[]} playableIndices={[]} selectedIndices={[]} onToggleCard={() => {}} />,
    );
    expect(screen.getByText('No cards in hand')).toBeTruthy();
  });
});
