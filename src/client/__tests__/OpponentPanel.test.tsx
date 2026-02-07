// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { OpponentPanel } from '../components/OpponentPanel.js';
import type { PublicPlayerState, ClientPlayerInfo } from '../../server/types.js';

function makeOpponent(overrides: Partial<PublicPlayerState> = {}): PublicPlayerState {
  return {
    id: 'opp-1',
    gear: 2,
    position: 10,
    lapCount: 1,
    speed: 8,
    handCount: 5,
    drawPileCount: 10,
    discardPileCount: 2,
    engineZoneCount: 1,
    hasBoosted: false,
    playedCardCount: 0,
    ...overrides,
  };
}

const defaultPlayerInfo: Record<string, ClientPlayerInfo> = {
  'opp-1': { displayName: 'Alice', carColor: 'red' },
  'opp-2': { displayName: 'Bob', carColor: 'blue' },
};

describe('OpponentPanel', () => {
  it('renders nothing when no opponents', () => {
    const { container } = render(
      <OpponentPanel opponents={[]} playerInfo={{}} totalSpaces={60} lapTarget={2} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders opponent name and stats', () => {
    const opp = makeOpponent({ id: 'opp-1', gear: 3, speed: 12, lapCount: 1, position: 25 });
    render(
      <OpponentPanel
        opponents={[opp]}
        playerInfo={defaultPlayerInfo}
        totalSpaces={60}
        lapTarget={2}
      />,
    );

    expect(screen.getByTestId('opponent-panel')).toBeDefined();
    const row = screen.getByTestId('opponent-opp-1');
    expect(row.textContent).toContain('Alice');
    expect(row.textContent).toContain('3'); // gear
    expect(row.textContent).toContain('12'); // speed
    expect(row.textContent).toContain('1/2'); // lap
    expect(row.textContent).toContain('25'); // position
  });

  it('renders multiple opponents', () => {
    const opponents = [
      makeOpponent({ id: 'opp-1', position: 20 }),
      makeOpponent({ id: 'opp-2', position: 30 }),
    ];
    render(
      <OpponentPanel
        opponents={opponents}
        playerInfo={defaultPlayerInfo}
        totalSpaces={60}
        lapTarget={2}
      />,
    );

    expect(screen.getByTestId('opponent-opp-1')).toBeDefined();
    expect(screen.getByTestId('opponent-opp-2')).toBeDefined();
  });

  it('sorts opponents by race progress (lap desc, position desc)', () => {
    const opponents = [
      makeOpponent({ id: 'opp-1', lapCount: 0, position: 5 }),
      makeOpponent({ id: 'opp-2', lapCount: 1, position: 30 }),
    ];
    render(
      <OpponentPanel
        opponents={opponents}
        playerInfo={defaultPlayerInfo}
        totalSpaces={60}
        lapTarget={2}
      />,
    );

    const panel = screen.getByTestId('opponent-panel');
    const rows = panel.querySelectorAll('[data-testid^="opponent-opp-"]');
    expect(rows[0].getAttribute('data-testid')).toBe('opponent-opp-2');
    expect(rows[1].getAttribute('data-testid')).toBe('opponent-opp-1');
  });

  it('falls back to player ID when playerInfo missing', () => {
    const opp = makeOpponent({ id: 'unknown-player' });
    render(
      <OpponentPanel opponents={[opp]} playerInfo={{}} totalSpaces={60} lapTarget={2} />,
    );

    const row = screen.getByTestId('opponent-unknown-player');
    expect(row.textContent).toContain('unknown-player');
  });
});
