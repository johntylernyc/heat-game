import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App.js';

// Mock WebSocket so jsdom doesn't try to actually connect
beforeEach(() => {
  vi.stubGlobal('WebSocket', class {
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((e: unknown) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    send() {}
    close() {}
  });
});

describe('App', () => {
  it('renders Home page at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('HEAT')).toBeDefined();
    expect(screen.getByText('Pedal to the Metal')).toBeDefined();
    // "Create Game" appears as both a heading and a button — use getAllByText
    expect(screen.getAllByText('Create Game').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Join Game').length).toBeGreaterThan(0);
  });

  it('redirects unknown routes to Home', () => {
    render(
      <MemoryRouter initialEntries={['/nonexistent']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('HEAT').length).toBeGreaterThan(0);
  });
});
