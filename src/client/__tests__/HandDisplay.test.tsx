// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { HandDisplay } from '../components/HandDisplay.js';
import type { HandCard } from '../../server/types.js';

describe('HandDisplay', () => {
  const hand: HandCard[] = [
    { type: 'speed', value: 1, playable: true },
    { type: 'speed', value: 3, playable: true },
    { type: 'heat', playable: false },
    { type: 'stress', playable: true },
    { type: 'upgrade', subtype: 'speed-5', playable: true },
  ];

  it('renders all cards in hand', () => {
    render(
      <HandDisplay cards={hand} selectedIndices={[]} onToggleCard={() => {}} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('shows card count and playable count in header', () => {
    render(
      <HandDisplay cards={hand} selectedIndices={[]} onToggleCard={() => {}} />,
    );
    const display = screen.getByTestId('hand-display');
    expect(display.textContent).toContain('5 cards');
    expect(display.textContent).toContain('4 playable');
  });

  it('calls onToggleCard with card index', () => {
    const onToggle = vi.fn();
    render(
      <HandDisplay cards={hand} selectedIndices={[]} onToggleCard={onToggle} />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it('marks heat cards as disabled', () => {
    render(
      <HandDisplay cards={hand} selectedIndices={[]} onToggleCard={() => {}} />,
    );
    const buttons = screen.getAllByRole('button');
    // Heat card at index 2
    expect((buttons[2] as HTMLButtonElement).disabled).toBe(true);
  });

  it('highlights selected cards', () => {
    render(
      <HandDisplay cards={hand} selectedIndices={[0, 1]} onToggleCard={() => {}} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[3].getAttribute('aria-pressed')).toBe('false');
  });

  it('disables all cards when disabled', () => {
    render(
      <HandDisplay cards={hand} selectedIndices={[]} onToggleCard={() => {}} disabled />,
    );
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('shows empty message when no cards', () => {
    render(
      <HandDisplay cards={[]} selectedIndices={[]} onToggleCard={() => {}} />,
    );
    expect(screen.getByText('No cards in hand')).toBeTruthy();
  });
});
