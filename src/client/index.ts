/**
 * Client-side UI module for Heat: Pedal to the Metal.
 *
 * Provides track rendering, car movement visualization, game state overlay,
 * and React components for the player dashboard.
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

// Player Dashboard Components
export { CardView } from './components/CardView.js';
export type { CardViewProps } from './components/CardView.js';

export { HandDisplay } from './components/HandDisplay.js';
export type { HandDisplayProps } from './components/HandDisplay.js';

export { PlayArea } from './components/PlayArea.js';
export type { PlayAreaProps } from './components/PlayArea.js';

export { GearSelector } from './components/GearSelector.js';
export type { GearSelectorProps, GearTarget } from './components/GearSelector.js';

export { EngineZone } from './components/EngineZone.js';
export type { EngineZoneProps } from './components/EngineZone.js';

export { PhaseControls } from './components/PhaseControls.js';
export type { PhaseControlsProps } from './components/PhaseControls.js';

export { PhaseIndicator } from './components/PhaseIndicator.js';
export type { PhaseIndicatorProps } from './components/PhaseIndicator.js';

export { DeckStatus } from './components/DeckStatus.js';
export type { DeckStatusProps } from './components/DeckStatus.js';

export { PlayerDashboard } from './components/PlayerDashboard.js';
export type { PlayerDashboardProps } from './components/PlayerDashboard.js';
