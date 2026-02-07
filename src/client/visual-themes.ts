/**
 * Visual themes for each base track.
 * Purely cosmetic — no gameplay impact.
 */

import type { VisualTheme } from './types.js';

/** Cactus silhouette path. */
const CACTUS_PATH = 'M0-20v20h0v-12c-3 0-5 2-5 5v7h-2v-7c0-4 3-7 7-7v-6z M4-8c3 0 5 2 5 5v3h-2v-3c0-2-1-3-3-3v-2z';
/** Cypress tree silhouette path. */
const CYPRESS_PATH = 'M0-30c-3 0-5 8-5 15s2 15 5 15 5-8 5-15-2-15-5-15z';
/** Hill silhouette path. */
const HILL_PATH = 'M-20 0q10-15 20-15 10 0 20 15z';
/** Hedge silhouette path. */
const HEDGE_PATH = 'M-12-6q0-6 6-6t6 6v6h2v-6q0-6 6-6t6 6v6h-26z';
/** Grandstand silhouette path. */
const GRANDSTAND_PATH = 'M-15 0v-20h30v20h-4v-16h-22v16z M-11-4h6v4h-6z M5-4h6v4h-6z';

const USA_THEME: VisualTheme = {
  country: 'USA',
  kerbColors: ['#CC0000', '#FFFFFF'],
  infieldColor: '#C2A66B',
  accentColor: '#CC0000',
  skyGradient: ['#87CEEB', '#D4E6F1'],
  gravelColor: '#D4A76A',
  fenceColor: '#BBBBBB',
  surroundElements: [
    { t: 0.1, offset: 80, path: CACTUS_PATH, color: '#4A7A3D', scale: 1.2 },
    { t: 0.3, offset: 90, path: CACTUS_PATH, color: '#5A8A4D', scale: 0.8 },
    { t: 0.7, offset: 85, path: GRANDSTAND_PATH, color: '#888888', scale: 1.0 },
  ],
};

const ITALY_THEME: VisualTheme = {
  country: 'Italy',
  kerbColors: ['#CC0000', '#FFFFFF'],
  infieldColor: '#3D7A3D',
  accentColor: '#CC0000',
  skyGradient: ['#6BB3E0', '#C8DFF0'],
  gravelColor: '#C4A060',
  fenceColor: '#AA8855',
  surroundElements: [
    { t: 0.15, offset: 80, path: CYPRESS_PATH, color: '#2D5A2D', scale: 1.0 },
    { t: 0.35, offset: 85, path: CYPRESS_PATH, color: '#2D5A2D', scale: 0.9 },
    { t: 0.55, offset: 75, path: CYPRESS_PATH, color: '#3D6A3D', scale: 1.1 },
    { t: 0.8, offset: 90, path: GRANDSTAND_PATH, color: '#AA7744', scale: 1.0 },
  ],
};

const FRANCE_THEME: VisualTheme = {
  country: 'France',
  kerbColors: ['#003399', '#FFFFFF'],
  infieldColor: '#7B6AA0',
  accentColor: '#003399',
  skyGradient: ['#9BB8D4', '#D4D8E0'],
  gravelColor: '#B8A080',
  fenceColor: '#999999',
  surroundElements: [
    { t: 0.2, offset: 80, path: HILL_PATH, color: '#6A5A90', scale: 1.5 },
    { t: 0.5, offset: 90, path: HILL_PATH, color: '#7B6AA0', scale: 1.2 },
    { t: 0.75, offset: 85, path: GRANDSTAND_PATH, color: '#888888', scale: 0.9 },
  ],
};

const GREAT_BRITAIN_THEME: VisualTheme = {
  country: 'Great Britain',
  kerbColors: ['#006633', '#FFFFFF'],
  infieldColor: '#2D6B2D',
  accentColor: '#006633',
  skyGradient: ['#8899AA', '#BBC4CC'],
  gravelColor: '#9A8A6A',
  fenceColor: '#666666',
  surroundElements: [
    { t: 0.1, offset: 80, path: HEDGE_PATH, color: '#1D5B1D', scale: 1.0 },
    { t: 0.3, offset: 85, path: HEDGE_PATH, color: '#2D6B2D', scale: 1.1 },
    { t: 0.6, offset: 75, path: HEDGE_PATH, color: '#1D5B1D', scale: 0.9 },
    { t: 0.85, offset: 90, path: GRANDSTAND_PATH, color: '#777777', scale: 1.0 },
  ],
};

/** Default theme for tracks without a specific theme. */
const DEFAULT_THEME: VisualTheme = {
  country: 'default',
  kerbColors: ['#CC0000', '#FFFFFF'],
  infieldColor: '#3D7A3D',
  accentColor: '#FF6B35',
  skyGradient: ['#1a1a2e', '#1a1a2e'],
  gravelColor: '#B8A060',
  fenceColor: '#888888',
  surroundElements: [],
};

const THEMES: Record<string, VisualTheme> = {
  'USA': USA_THEME,
  'Italy': ITALY_THEME,
  'France': FRANCE_THEME,
  'Great Britain': GREAT_BRITAIN_THEME,
};

/** Look up the visual theme for a track by country name. */
export function getVisualTheme(country: string): VisualTheme {
  return THEMES[country] ?? DEFAULT_THEME;
}
