// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { PlayArea } from '../components/PlayArea.js';
import type { Card } from '../../types.js';

describe('PlayArea', () => {
  const cards: Card[] = [
    { type: 'speed', value: 2 },
    { type: 'speed', value: 4 },
  ];

  it('shows selected card count vs required', () => {
    render(
      <PlayArea
        selectedCards={cards}
        gear={3}
        onConfirm={() => {}}
        canConfirm={false}
      />,
    );
    expect(screen.getByTestId('play-area').textContent).toContain('2/3');
  });

  it('shows "Select more" message when not enough cards', () => {
    render(
      <PlayArea
        selectedCards={[cards[0]]}
        gear={3}
        onConfirm={() => {}}
        canConfirm={false}
      />,
    );
    expect(screen.getByTestId('play-area').textContent).toContain('Select 2 more');
  });

  it('calls onConfirm when button clicked', () => {
    const onConfirm = vi.fn();
    render(
      <PlayArea
        selectedCards={cards}
        gear={2}
        onConfirm={onConfirm}
        canConfirm={true}
      />,
    );
    fireEvent.click(screen.getByTestId('confirm-play'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('disables confirm when canConfirm is false', () => {
    render(
      <PlayArea
        selectedCards={[cards[0]]}
        gear={3}
        onConfirm={() => {}}
        canConfirm={false}
      />,
    );
    expect((screen.getByTestId('confirm-play') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows locked-in state when confirmed', () => {
    render(
      <PlayArea
        selectedCards={cards}
        gear={2}
        onConfirm={() => {}}
        canConfirm={true}
        confirmed
      />,
    );
    expect(screen.getByTestId('confirm-play').textContent).toBe('Locked In');
    expect((screen.getByTestId('confirm-play') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows placeholder when no cards selected', () => {
    render(
      <PlayArea
        selectedCards={[]}
        gear={2}
        onConfirm={() => {}}
        canConfirm={false}
      />,
    );
    expect(screen.getByTestId('play-area').textContent).toContain('Select cards from your hand');
  });
});
