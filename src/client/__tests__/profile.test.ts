import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProfile,
  loadStats,
  loadHistory,
  createProfile,
  updateDisplayName,
  updatePreferredColor,
  recordQualifyingResult,
  recordRaceResult,
  type QualifyingResult,
  type RaceResult,
} from '../profileStore.js';

beforeEach(() => {
  localStorage.clear();
});

describe('Profile CRUD', () => {
  it('returns null when no profile exists', () => {
    expect(loadProfile()).toBeNull();
  });

  it('creates a profile with UUID and defaults', () => {
    const profile = createProfile('TestDriver');
    expect(profile.displayName).toBe('TestDriver');
    expect(profile.preferredColor).toBe('red');
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(profile.createdAt).toBeGreaterThan(0);

    // Persisted in localStorage
    const loaded = loadProfile();
    expect(loaded).toEqual(profile);
  });

  it('creates a profile with custom color', () => {
    const profile = createProfile('Racer', 'blue');
    expect(profile.preferredColor).toBe('blue');
  });

  it('updates display name', () => {
    createProfile('Original');
    const updated = updateDisplayName('NewName');
    expect(updated?.displayName).toBe('NewName');
    expect(loadProfile()?.displayName).toBe('NewName');
  });

  it('updates preferred color', () => {
    createProfile('Driver');
    const updated = updatePreferredColor('green');
    expect(updated?.preferredColor).toBe('green');
    expect(loadProfile()?.preferredColor).toBe('green');
  });

  it('returns null when updating name with no profile', () => {
    expect(updateDisplayName('Foo')).toBeNull();
  });

  it('returns null when updating color with no profile', () => {
    expect(updatePreferredColor('blue')).toBeNull();
  });
});

describe('Stats', () => {
  it('returns default stats when none exist', () => {
    const stats = loadStats();
    expect(stats.qualifyingRuns).toBe(0);
    expect(stats.racesPlayed).toBe(0);
    expect(stats.totalPoints).toBe(0);
    expect(stats.longestWinStreak).toBe(0);
  });

  it('handles corrupted stats gracefully', () => {
    localStorage.setItem('heat-stats-v1', '{invalid json');
    const stats = loadStats();
    expect(stats.qualifyingRuns).toBe(0);
  });
});

describe('Qualifying result recording', () => {
  it('increments qualifying runs', () => {
    const result: QualifyingResult = {
      type: 'qualifying-result',
      trackId: 'usa',
      lapCount: 2,
      lapTimes: [5, 4],
      bestLap: 4,
      totalTime: 9,
    };

    recordQualifyingResult(result);
    const stats = loadStats();
    expect(stats.qualifyingRuns).toBe(1);
  });

  it('records best lap time for track', () => {
    const result: QualifyingResult = {
      type: 'qualifying-result',
      trackId: 'italy',
      lapCount: 1,
      lapTimes: [6],
      bestLap: 6,
      totalTime: 6,
    };

    const { isNewBestLap } = recordQualifyingResult(result);
    expect(isNewBestLap).toBe(true);
    expect(loadStats().bestLapTimes['italy']).toBe(6);
  });

  it('only updates best if faster', () => {
    const fast: QualifyingResult = {
      type: 'qualifying-result',
      trackId: 'usa',
      lapCount: 1,
      lapTimes: [3],
      bestLap: 3,
      totalTime: 3,
    };
    const slow: QualifyingResult = {
      type: 'qualifying-result',
      trackId: 'usa',
      lapCount: 1,
      lapTimes: [7],
      bestLap: 7,
      totalTime: 7,
    };

    recordQualifyingResult(fast);
    const { isNewBestLap } = recordQualifyingResult(slow);
    expect(isNewBestLap).toBe(false);
    expect(loadStats().bestLapTimes['usa']).toBe(3);
  });

  it('records best total time per track and lap count', () => {
    const result: QualifyingResult = {
      type: 'qualifying-result',
      trackId: 'france',
      lapCount: 3,
      lapTimes: [5, 4, 6],
      bestLap: 4,
      totalTime: 15,
    };

    const { isNewBestTotal } = recordQualifyingResult(result);
    expect(isNewBestTotal).toBe(true);
    expect(loadStats().bestTotalTimes['france'][3]).toBe(15);
  });

  it('adds qualifying entry to history', () => {
    recordQualifyingResult({
      type: 'qualifying-result',
      trackId: 'usa',
      lapCount: 1,
      lapTimes: [5],
      bestLap: 5,
      totalTime: 5,
    });

    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].type).toBe('qualifying');
    expect(history[0].trackId).toBe('usa');
  });
});

describe('Race result recording', () => {
  const makeRaceResult = (position: number): RaceResult => ({
    type: 'race-result',
    trackId: 'usa',
    lapCount: 2,
    position,
    totalPlayers: 4,
    points: position === 1 ? 10 : position === 2 ? 6 : 4,
    standings: [],
    spinouts: 1,
    boostsUsed: 2,
    heatPaid: 3,
  });

  it('increments races played', () => {
    recordRaceResult(makeRaceResult(2));
    expect(loadStats().racesPlayed).toBe(1);
  });

  it('increments wins and streak for 1st place', () => {
    recordRaceResult(makeRaceResult(1));
    const stats = loadStats();
    expect(stats.racesWon).toBe(1);
    expect(stats.currentWinStreak).toBe(1);
    expect(stats.longestWinStreak).toBe(1);
  });

  it('resets current streak on non-win', () => {
    recordRaceResult(makeRaceResult(1));
    recordRaceResult(makeRaceResult(1));
    recordRaceResult(makeRaceResult(3));
    const stats = loadStats();
    expect(stats.currentWinStreak).toBe(0);
    expect(stats.longestWinStreak).toBe(2);
  });

  it('increments podium finishes for top 3', () => {
    recordRaceResult(makeRaceResult(3));
    expect(loadStats().podiumFinishes).toBe(1);
  });

  it('does not count 4th place as podium', () => {
    recordRaceResult(makeRaceResult(4));
    expect(loadStats().podiumFinishes).toBe(0);
  });

  it('accumulates points', () => {
    recordRaceResult(makeRaceResult(1)); // 10 pts
    recordRaceResult(makeRaceResult(2)); // 6 pts
    expect(loadStats().totalPoints).toBe(16);
  });

  it('tracks fun stats', () => {
    recordRaceResult(makeRaceResult(1));
    const stats = loadStats();
    expect(stats.totalSpinouts).toBe(1);
    expect(stats.totalBoostsUsed).toBe(2);
    expect(stats.totalHeatPaid).toBe(3);
  });

  it('adds race entry to history', () => {
    recordRaceResult(makeRaceResult(2));
    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].type).toBe('race');
    expect(history[0].result.position).toBe(2);
  });
});

describe('History', () => {
  it('caps at 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      recordQualifyingResult({
        type: 'qualifying-result',
        trackId: 'usa',
        lapCount: 1,
        lapTimes: [5],
        bestLap: 5,
        totalTime: 5,
      });
    }
    expect(loadHistory().length).toBeLessThanOrEqual(50);
  });

  it('newest entries are first', () => {
    recordQualifyingResult({
      type: 'qualifying-result',
      trackId: 'usa',
      lapCount: 1,
      lapTimes: [5],
      bestLap: 5,
      totalTime: 5,
    });
    recordQualifyingResult({
      type: 'qualifying-result',
      trackId: 'italy',
      lapCount: 1,
      lapTimes: [3],
      bestLap: 3,
      totalTime: 3,
    });

    const history = loadHistory();
    expect(history[0].trackId).toBe('italy');
    expect(history[1].trackId).toBe('usa');
  });

  it('handles corrupted history gracefully', () => {
    localStorage.setItem('heat-history-v1', 'not json');
    expect(loadHistory()).toEqual([]);
  });
});

describe('Profile handles corrupted data', () => {
  it('returns null for corrupted profile', () => {
    localStorage.setItem('heat-profile-v1', '{bad');
    expect(loadProfile()).toBeNull();
  });
});
