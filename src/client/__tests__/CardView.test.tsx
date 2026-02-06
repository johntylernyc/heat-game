// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { CardView } from '../components/CardView.js';
import type { Card } from '../../types.js';

describe('CardView', () => {
  const speedCard: Card = { type: 'speed', value: 3 };
  const heatCard: Card = { type: 'heat' };
  const stressCard: Card = { type: 'stress' };
  const upgradeCard: Card = { type: 'upgrade', subtype: 'speed-5' };

  it('renders a speed card with value prominently', () => {
    render(<CardView card={speedCard} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('3');
    expect(button.textContent).toContain('SPEED');
    expect(button.getAttribute('data-card-type')).toBe('speed');
  });

  it('renders a heat card as unplayable', () => {
    render(<CardView card={heatCard} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('data-card-type')).toBe('heat');
    expect(button.getAttribute('data-playable')).toBe('false');
  });

  it('renders a stress card', () => {
    render(<CardView card={stressCard} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('data-card-type')).toBe('stress');
    expect(button.getAttribute('data-playable')).toBe('true');
  });

  it('renders an upgrade card with speed value', () => {
    render(<CardView card={upgradeCard} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('5');
    expect(button.getAttribute('data-card-type')).toBe('upgrade');
  });

  it('shows selected state', () => {
    render(<CardView card={speedCard} selected />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows unselected state', () => {
    render(<CardView card={speedCard} selected={false} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<CardView card={speedCard} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop is true', () => {
    const onClick = vi.fn();
    render(<CardView card={speedCard} disabled onClick={onClick} />);
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('has correct aria-label for speed card', () => {
    render(<CardView card={speedCard} />);
    expect(screen.getByLabelText('speed card value 3')).toBeTruthy();
  });

  it('has correct aria-label for heat card', () => {
    render(<CardView card={heatCard} />);
    expect(screen.getByLabelText('heat card')).toBeTruthy();
  });
});
