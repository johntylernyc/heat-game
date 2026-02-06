/**
 * Legend deck: 10 cards with speed and diamond values per difficulty.
 *
 * Easy (green helmet): conservative speeds, moderate diamond values
 * Medium (yellow helmet): balanced speeds and diamonds
 * Hard (red helmet): aggressive speeds, higher diamond values
 */

import type { LegendCard } from './types.js';

/**
 * The 10 Legend cards. Each card has speed/diamond values per difficulty.
 *
 * Speed: movement on straights (behind legends line)
 * Diamond: spaces-before-corner stop distance (case 1) or
 *          speed limit modifier for corner crossing (case 2)
 */
export const LEGEND_CARDS: readonly LegendCard[] = [
  { id: 1,  easy: { speed: 4, diamond: 0 }, medium: { speed: 5, diamond: 1 }, hard: { speed: 7, diamond: 2 } },
  { id: 2,  easy: { speed: 4, diamond: 1 }, medium: { speed: 6, diamond: 1 }, hard: { speed: 7, diamond: 2 } },
  { id: 3,  easy: { speed: 5, diamond: 0 }, medium: { speed: 6, diamond: 2 }, hard: { speed: 8, diamond: 1 } },
  { id: 4,  easy: { speed: 5, diamond: 1 }, medium: { speed: 7, diamond: 0 }, hard: { speed: 8, diamond: 2 } },
  { id: 5,  easy: { speed: 5, diamond: 1 }, medium: { speed: 7, diamond: 1 }, hard: { speed: 8, diamond: 3 } },
  { id: 6,  easy: { speed: 6, diamond: 0 }, medium: { speed: 7, diamond: 1 }, hard: { speed: 9, diamond: 1 } },
  { id: 7,  easy: { speed: 6, diamond: 1 }, medium: { speed: 7, diamond: 2 }, hard: { speed: 9, diamond: 2 } },
  { id: 8,  easy: { speed: 6, diamond: 1 }, medium: { speed: 8, diamond: 1 }, hard: { speed: 9, diamond: 2 } },
  { id: 9,  easy: { speed: 7, diamond: 0 }, medium: { speed: 8, diamond: 2 }, hard: { speed: 10, diamond: 1 } },
  { id: 10, easy: { speed: 7, diamond: 2 }, medium: { speed: 8, diamond: 2 }, hard: { speed: 10, diamond: 3 } },
];

export const LEGEND_DECK_SIZE = 10;
