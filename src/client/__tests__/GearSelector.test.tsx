// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { GearSelector } from '../components/GearSelector.js';
import type { GearTarget } from '../components/GearSelector.js';
import type { Gear } from '../../types.js';

describe('GearSelector', () => {
  const baseTargets: GearTarget[] = [
    { gear: 2, cost: 'free' },
    { gear: 3, cost: 'free' },
    { gear: 4, cost: 'free' },
  ];

  it('renders all four gear buttons', () => {
    render(
      <GearSelector
        currentGear={2}
        validTargets={baseTargets}
        onShift={() => {}}
      />,
    );
    for (const g of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`gear-${g}`)).toBeTruthy();
    }
  });

  it('marks current gear as checked', () => {
    render(
      <GearSelector
        currentGear={2}
        validTargets={baseTargets}
        onShift={() => {}}
      />,
    );
    expect(screen.getByTestId('gear-2').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('gear-1').getAttribute('aria-checked')).toBe('false');
  });

  it('calls onShift with target gear', () => {
    const onShift = vi.fn();
    render(
      <GearSelector
        currentGear={2}
        validTargets={baseTargets}
        onShift={onShift}
      />,
    );
    fireEvent.click(screen.getByTestId('gear-3'));
    expect(onShift).toHaveBeenCalledWith(3);
  });

  it('disables gears not in valid targets', () => {
    render(
      <GearSelector
        currentGear={2}
        validTargets={[{ gear: 2, cost: 'free' }, { gear: 3, cost: 'free' }]}
        onShift={() => {}}
      />,
    );
    expect((screen.getByTestId('gear-1') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('gear-4') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows heat cost for paid shifts', () => {
    render(
      <GearSelector
        currentGear={2}
        validTargets={[
          { gear: 2, cost: 'free' },
          { gear: 3, cost: 'free' },
          { gear: 4, cost: 'heat' },
        ]}
        onShift={() => {}}
      />,
    );
    expect(screen.getByTestId('gear-4').textContent).toContain('1 HEAT');
  });

  it('disables all when disabled prop is true', () => {
    render(
      <GearSelector
        currentGear={2}
        validTargets={baseTargets}
        onShift={() => {}}
        disabled
      />,
    );
    for (const g of [1, 2, 3, 4]) {
      expect((screen.getByTestId(`gear-${g}`) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows confirmed message', () => {
    render(
      <GearSelector
        currentGear={2}
        validTargets={baseTargets}
        onShift={() => {}}
        confirmed
      />,
    );
    expect(screen.getByTestId('gear-selector').textContent).toContain('locked in');
  });

  it('shows cards-per-gear in header', () => {
    render(
      <GearSelector
        currentGear={3}
        validTargets={[{ gear: 3, cost: 'free' }]}
        onShift={() => {}}
      />,
    );
    expect(screen.getByTestId('gear-selector').textContent).toContain('3 cards');
  });
});
