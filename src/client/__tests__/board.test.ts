import { describe, it, expect } from 'vitest';
import { buildCarStates, buildStandings } from '../board.js';
import { PLAYER_COLORS } from '../types.js';
import type { CarState } from '../types.js';

describe('buildCarStates', () => {
  const self = { id: 'alice', position: 10, lapCount: 1, gear: 3, speed: 8 };
  const opponents = [
    { id: 'bob', position: 15, lapCount: 1, gear: 2, speed: 5 },
    { id: 'carol', position: 8, lapCount: 0, gear: 4, speed: 12 },
  ];

  it('creates car states for self and opponents', () => {
    const cars = buildCarStates(self, opponents, 0, 3);
    expect(cars).toHaveLength(3);
  });

  it('assigns self the correct color', () => {
    const cars = buildCarStates(self, opponents, 0, 3);
    expect(cars[0].color).toBe(PLAYER_COLORS[0]);
    expect(cars[0].playerId).toBe('alice');
  });

  it('assigns correct player data', () => {
    const cars = buildCarStates(self, opponents, 0, 3);
    expect(cars[0].position).toBe(10);
    expect(cars[0].gear).toBe(3);
    expect(cars[0].lapCount).toBe(1);
  });

  it('assigns unique colors to opponents', () => {
    const cars = buildCarStates(self, opponents, 0, 3);
    const colors = new Set(cars.map(c => c.color));
    expect(colors.size).toBe(3);
  });

  it('handles player index 2', () => {
    const cars = buildCarStates(self, opponents, 2, 3);
    expect(cars[0].color).toBe(PLAYER_COLORS[2]);
  });
});

describe('buildStandings', () => {
  it('ranks by lap count first', () => {
    const cars: CarState[] = [
      { playerId: 'a', color: '#f00', position: 5, spot: 'raceLine', lapCount: 2, gear: 1, speed: 0 },
      { playerId: 'b', color: '#0f0', position: 40, spot: 'raceLine', lapCount: 1, gear: 1, speed: 0 },
    ];
    const standings = buildStandings(cars);
    expect(standings[0].playerId).toBe('a');
    expect(standings[0].rank).toBe(1);
    expect(standings[1].playerId).toBe('b');
    expect(standings[1].rank).toBe(2);
  });

  it('ranks by position when laps are equal', () => {
    const cars: CarState[] = [
      { playerId: 'a', color: '#f00', position: 10, spot: 'raceLine', lapCount: 1, gear: 1, speed: 0 },
      { playerId: 'b', color: '#0f0', position: 30, spot: 'raceLine', lapCount: 1, gear: 1, speed: 0 },
    ];
    const standings = buildStandings(cars);
    expect(standings[0].playerId).toBe('b');
    expect(standings[1].playerId).toBe('a');
  });

  it('handles empty cars array', () => {
    const standings = buildStandings([]);
    expect(standings).toHaveLength(0);
  });

  it('handles single car', () => {
    const cars: CarState[] = [
      { playerId: 'solo', color: '#f00', position: 5, spot: 'raceLine', lapCount: 0, gear: 1, speed: 0 },
    ];
    const standings = buildStandings(cars);
    expect(standings).toHaveLength(1);
    expect(standings[0].rank).toBe(1);
  });

  it('ranks 6 cars correctly', () => {
    const cars: CarState[] = [
      { playerId: 'a', color: '#f00', position: 5, spot: 'raceLine', lapCount: 0, gear: 1, speed: 0 },
      { playerId: 'b', color: '#0f0', position: 25, spot: 'raceLine', lapCount: 1, gear: 2, speed: 0 },
      { playerId: 'c', color: '#00f', position: 40, spot: 'raceLine', lapCount: 1, gear: 3, speed: 0 },
      { playerId: 'd', color: '#ff0', position: 15, spot: 'raceLine', lapCount: 2, gear: 4, speed: 0 },
      { playerId: 'e', color: '#f0f', position: 30, spot: 'raceLine', lapCount: 0, gear: 1, speed: 0 },
      { playerId: 'f', color: '#0ff', position: 10, spot: 'raceLine', lapCount: 1, gear: 2, speed: 0 },
    ];
    const standings = buildStandings(cars);
    expect(standings[0].playerId).toBe('d'); // 2 laps
    expect(standings[1].playerId).toBe('c'); // 1 lap, pos 40
    expect(standings[2].playerId).toBe('b'); // 1 lap, pos 25
    expect(standings[3].playerId).toBe('f'); // 1 lap, pos 10
    expect(standings[4].playerId).toBe('e'); // 0 laps, pos 30
    expect(standings[5].playerId).toBe('a'); // 0 laps, pos 5
  });
});
