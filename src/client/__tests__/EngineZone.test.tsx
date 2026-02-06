// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { EngineZone } from '../components/EngineZone.js';
import type { Card } from '../../types.js';

describe('EngineZone', () => {
  const fullEngine: Card[] = Array.from({ length: 6 }, () => ({ type: 'heat' as const }));
  const partialEngine: Card[] = Array.from({ length: 3 }, () => ({ type: 'heat' as const }));

  it('renders engine zone', () => {
    render(<EngineZone engineZone={fullEngine} heatInHand={0} />);
    expect(screen.getByTestId('engine-zone')).toBeTruthy();
  });

  it('shows correct heat count for full engine', () => {
    render(<EngineZone engineZone={fullEngine} heatInHand={0} />);
    expect(screen.getByTestId('engine-heat-count').textContent).toBe('6/6');
  });

  it('shows correct heat count for partial engine', () => {
    render(<EngineZone engineZone={partialEngine} heatInHand={0} />);
    expect(screen.getByTestId('engine-heat-count').textContent).toBe('3/6');
  });

  it('shows heat-in-hand warning when heat is stuck', () => {
    render(<EngineZone engineZone={fullEngine} heatInHand={2} />);
    const warning = screen.getByTestId('heat-in-hand-warning');
    expect(warning.textContent).toContain('2 Heat cards stuck in hand');
  });

  it('does not show warning when no heat in hand', () => {
    render(<EngineZone engineZone={fullEngine} heatInHand={0} />);
    expect(screen.queryByTestId('heat-in-hand-warning')).toBeNull();
  });

  it('renders 6 pip indicators', () => {
    render(<EngineZone engineZone={partialEngine} heatInHand={0} />);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`engine-pip-${i}`)).toBeTruthy();
    }
  });

  it('singular form for 1 heat card', () => {
    render(<EngineZone engineZone={fullEngine} heatInHand={1} />);
    const warning = screen.getByTestId('heat-in-hand-warning');
    expect(warning.textContent).toBe('1 Heat card stuck in hand');
  });
});
