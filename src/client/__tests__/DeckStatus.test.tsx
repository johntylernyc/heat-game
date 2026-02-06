// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { DeckStatus } from '../components/DeckStatus.js';

describe('DeckStatus', () => {
  it('shows draw pile count', () => {
    render(<DeckStatus drawPileCount={12} discardPileCount={3} />);
    expect(screen.getByTestId('draw-count').textContent).toBe('12');
  });

  it('shows discard pile count', () => {
    render(<DeckStatus drawPileCount={5} discardPileCount={8} />);
    expect(screen.getByTestId('discard-count').textContent).toBe('8');
  });

  it('shows zero counts', () => {
    render(<DeckStatus drawPileCount={0} discardPileCount={0} />);
    expect(screen.getByTestId('draw-count').textContent).toBe('0');
    expect(screen.getByTestId('discard-count').textContent).toBe('0');
  });
});
