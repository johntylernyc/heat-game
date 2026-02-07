/**
 * Player profile, stats, and game history — all localStorage-backed.
 *
 * Keys are versioned (`heat-profile-v1`, etc.) so future schema changes
 * can migrate without data loss.
 */

import type { CarColor } from '../server/types.js';

// -- Profile --

export interface PlayerProfile {
  id: string;
  displayName: string;
  preferredColor: CarColor;
  createdAt: number;
}

// -- Stats --

export interface PlayerStats {
  // Qualifying
  qualifyingRuns: number;
  bestLapTimes: Record<string, number>;       // trackId → best lap time (rounds)
  bestTotalTimes: Record<string, Record<number, number>>; // trackId → lapCount → best total

  // Multiplayer
  racesPlayed: number;
  racesWon: number;
  podiumFinishes: number;
  totalPoints: number;

  // Fun stats
  totalSpinouts: number;
  totalBoostsUsed: number;
  totalHeatPaid: number;
  longestWinStreak: number;
  currentWinStreak: number;
}

// -- History --

export interface GameHistoryEntry {
  type: 'qualifying' | 'race';
  trackId: string;
  lapCount: number;
  timestamp: number;
  result: {
    position?: number;
    totalPlayers?: number;
    bestLap: number;
    totalTime: number;
  };
}

// -- Result messages (server → client) --

export interface QualifyingResult {
  type: 'qualifying-result';
  trackId: string;
  lapCount: number;
  lapTimes: number[];
  bestLap: number;
  totalTime: number;
}

export interface RaceResult {
  type: 'race-result';
  trackId: string;
  lapCount: number;
  position: number;
  totalPlayers: number;
  points: number;
  standings: { profileId: string; displayName: string; position: number }[];
  // Fun stats from the server for this race
  spinouts: number;
  boostsUsed: number;
  heatPaid: number;
}

// -- Storage keys --

const PROFILE_KEY = 'heat-profile-v1';
const STATS_KEY = 'heat-stats-v1';
const HISTORY_KEY = 'heat-history-v1';
const HISTORY_MAX = 50;

// -- Default values --

function defaultStats(): PlayerStats {
  return {
    qualifyingRuns: 0,
    bestLapTimes: {},
    bestTotalTimes: {},
    racesPlayed: 0,
    racesWon: 0,
    podiumFinishes: 0,
    totalPoints: 0,
    totalSpinouts: 0,
    totalBoostsUsed: 0,
    totalHeatPaid: 0,
    longestWinStreak: 0,
    currentWinStreak: 0,
  };
}

// -- Read --

export function loadProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as PlayerProfile) : null;
  } catch {
    return null;
  }
}

export function loadStats(): PlayerStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? { ...defaultStats(), ...(JSON.parse(raw) as Partial<PlayerStats>) } : defaultStats();
  } catch {
    return defaultStats();
  }
}

export function loadHistory(): GameHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as GameHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

// -- Write --

export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function saveStats(stats: PlayerStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function saveHistory(history: GameHistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
}

// -- Profile lifecycle --

function generateId(): string {
  return crypto.randomUUID();
}

export function createProfile(displayName: string, preferredColor: CarColor = 'red'): PlayerProfile {
  const profile: PlayerProfile = {
    id: generateId(),
    displayName,
    preferredColor,
    createdAt: Date.now(),
  };
  saveProfile(profile);
  return profile;
}

export function updateDisplayName(name: string): PlayerProfile | null {
  const profile = loadProfile();
  if (!profile) return null;
  profile.displayName = name;
  saveProfile(profile);
  return profile;
}

export function updatePreferredColor(color: CarColor): PlayerProfile | null {
  const profile = loadProfile();
  if (!profile) return null;
  profile.preferredColor = color;
  saveProfile(profile);
  return profile;
}

// -- Stats updates --

export function recordQualifyingResult(result: QualifyingResult): { isNewBestLap: boolean; isNewBestTotal: boolean } {
  const stats = loadStats();
  stats.qualifyingRuns++;

  const prevBestLap = stats.bestLapTimes[result.trackId];
  const isNewBestLap = prevBestLap === undefined || result.bestLap < prevBestLap;
  if (isNewBestLap) {
    stats.bestLapTimes[result.trackId] = result.bestLap;
  }

  if (!stats.bestTotalTimes[result.trackId]) {
    stats.bestTotalTimes[result.trackId] = {};
  }
  const prevBestTotal = stats.bestTotalTimes[result.trackId][result.lapCount];
  const isNewBestTotal = prevBestTotal === undefined || result.totalTime < prevBestTotal;
  if (isNewBestTotal) {
    stats.bestTotalTimes[result.trackId][result.lapCount] = result.totalTime;
  }

  saveStats(stats);

  // Add to history
  const history = loadHistory();
  history.unshift({
    type: 'qualifying',
    trackId: result.trackId,
    lapCount: result.lapCount,
    timestamp: Date.now(),
    result: {
      bestLap: result.bestLap,
      totalTime: result.totalTime,
    },
  });
  saveHistory(history);

  return { isNewBestLap, isNewBestTotal };
}

export function recordRaceResult(result: RaceResult): void {
  const stats = loadStats();
  stats.racesPlayed++;

  if (result.position === 1) {
    stats.racesWon++;
    stats.currentWinStreak++;
    if (stats.currentWinStreak > stats.longestWinStreak) {
      stats.longestWinStreak = stats.currentWinStreak;
    }
  } else {
    stats.currentWinStreak = 0;
  }

  if (result.position <= 3) {
    stats.podiumFinishes++;
  }

  stats.totalPoints += result.points;
  stats.totalSpinouts += result.spinouts;
  stats.totalBoostsUsed += result.boostsUsed;
  stats.totalHeatPaid += result.heatPaid;

  saveStats(stats);

  // Add to history
  const history = loadHistory();
  history.unshift({
    type: 'race',
    trackId: result.trackId,
    lapCount: result.lapCount,
    timestamp: Date.now(),
    result: {
      position: result.position,
      totalPlayers: result.totalPlayers,
      bestLap: 0, // Not tracked for races yet
      totalTime: 0,
    },
  });
  saveHistory(history);
}
