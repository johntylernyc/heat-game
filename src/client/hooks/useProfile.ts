import { useState, useCallback } from 'react';
import type { CarColor } from '../../server/types.js';
import {
  loadProfile,
  loadStats,
  loadHistory,
  createProfile,
  updateDisplayName,
  updatePreferredColor,
  type PlayerProfile,
  type PlayerStats,
  type GameHistoryEntry,
} from '../profileStore.js';

export function useProfile() {
  const [profile, setProfile] = useState<PlayerProfile | null>(() => loadProfile());
  const [stats, setStats] = useState<PlayerStats>(() => loadStats());
  const [history, setHistory] = useState<GameHistoryEntry[]>(() => loadHistory());

  const create = useCallback((displayName: string, preferredColor?: CarColor) => {
    const p = createProfile(displayName, preferredColor);
    setProfile(p);
    return p;
  }, []);

  const setName = useCallback((name: string) => {
    const p = updateDisplayName(name);
    if (p) setProfile(p);
  }, []);

  const setColor = useCallback((color: CarColor) => {
    const p = updatePreferredColor(color);
    if (p) setProfile(p);
  }, []);

  const refresh = useCallback(() => {
    setProfile(loadProfile());
    setStats(loadStats());
    setHistory(loadHistory());
  }, []);

  return { profile, stats, history, create, setName, setColor, refresh };
}
