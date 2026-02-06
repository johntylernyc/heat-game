/**
 * Client-side game board UI module.
 *
 * Provides track rendering, car movement visualization, and game state overlay
 * for the Heat: Pedal to the Metal web client.
 */

// Board (main entry point)
export type { BoardState, GameBoard } from './board.js';
export { createGameBoard, buildCarStates, buildStandings } from './board.js';

// Types
export type {
  Point,
  SpaceLayout,
  TrackLayout,
  CarState,
  MoveAnimation,
  SpinoutAnimation,
  CameraState,
  BoardConfig,
  StandingEntry,
  PhaseDisplay,
} from './types.js';
export { PLAYER_COLORS, DEFAULT_BOARD_CONFIG } from './types.js';

// Track layout
export { generateTrackLayout, interpolateTrackPosition, interpolateTrackAngle } from './track-layout.js';

// Camera
export {
  createCamera,
  fitToTrack,
  worldToScreen,
  screenToWorld,
  zoomAt,
  pan,
} from './camera.js';

// Track renderer
export { renderTrack, hitTestSpace } from './track-renderer.js';

// Car renderer
export { renderCars, renderCarAtPosition } from './car-renderer.js';

// Animation
export {
  AnimationManager,
  createMoveAnimation,
  createSpinoutAnimation,
  easeInOutCubic,
  easeOutQuad,
} from './animation.js';

// Overlay
export {
  renderStandings,
  renderPhaseIndicator,
  renderTurnOrder,
  renderLapCounters,
  renderSpaceTooltip,
  renderSlipstreamIndicator,
  getPhaseDisplay,
} from './overlay.js';
