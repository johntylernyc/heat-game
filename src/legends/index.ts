export type {
  LegendDifficulty,
  LegendCardValues,
  LegendCard,
  LegendCarState,
  LegendState,
  LegendConfig,
} from './types.js';

export { LEGEND_CARDS, LEGEND_DECK_SIZE } from './cards.js';

export type { LegendMoveResult } from './movement.js';
export {
  getCardValues,
  findNextCorner,
  isBetweenLineAndCorner,
  moveLegend,
} from './movement.js';

export {
  initLegends,
  flipLegendCard,
  discardCurrentCard,
  executeLegendRound,
  anyLegendFinished,
  getLegendStandings,
} from './legends.js';
