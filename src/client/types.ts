/**
 * Client-side rendering types for Heat game board UI.
 */

/** 2D point in world coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** A space on the track with its 2D layout position and direction. */
export interface SpaceLayout {
  /** Space index (0-based). */
  index: number;
  /** Center position of the race-line spot. */
  raceLine: Point;
  /** Center position of the off-line spot. */
  offLine: Point;
  /** Direction angle in radians (tangent to the track path). */
  angle: number;
  /** Whether this space is a corner position. */
  isCorner: boolean;
  /** Corner speed limit if this is a corner space. */
  cornerSpeedLimit?: number;
  /** Corner ID if this is a corner space. */
  cornerId?: number;
  /** Whether this space has a legends line. */
  isLegendsLine: boolean;
  /** Whether this is the start/finish line. */
  isStartFinish: boolean;
  /** Sector ID this space belongs to. */
  sectorId: number;
}

/** Full 2D layout for a track. */
export interface TrackLayout {
  /** All space layouts in order. */
  spaces: SpaceLayout[];
  /** Track center for camera positioning. */
  center: Point;
  /** Bounding box of the track layout. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Track path as ordered center-line points for drawing the road. */
  pathPoints: Point[];
}

/** Car rendering state. */
export interface CarState {
  playerId: string;
  color: string;
  position: number;
  spot: 'raceLine' | 'offLine';
  lapCount: number;
  gear: number;
  speed: number;
}

/** Animation target for a car movement. */
export interface MoveAnimation {
  playerId: string;
  fromPosition: number;
  toPosition: number;
  /** Progress 0-1. */
  progress: number;
  /** Duration in milliseconds. */
  duration: number;
  startTime: number;
}

/** Spinout animation state. */
export interface SpinoutAnimation {
  playerId: string;
  cornerPosition: number;
  /** How many spaces to slide back. */
  slideBack: number;
  progress: number;
  duration: number;
  startTime: number;
}

/** Camera state for pan/zoom. */
export interface CameraState {
  /** Offset in screen pixels. */
  offsetX: number;
  offsetY: number;
  /** Zoom level (1.0 = default). */
  zoom: number;
}

/** Player color palette. */
export const PLAYER_COLORS: readonly string[] = [
  '#E63946', // red
  '#457B9D', // blue
  '#2A9D8F', // teal
  '#E9C46A', // yellow
  '#F4A261', // orange
  '#264653', // dark blue
] as const;

/** Board rendering configuration. */
export interface BoardConfig {
  /** Width of the track road in world units. */
  trackWidth: number;
  /** Radius of car tokens in world units. */
  carRadius: number;
  /** Spacing between race-line and off-line spots. */
  spotOffset: number;
  /** Space between adjacent space markers along the track. */
  spaceSize: number;
  /** Font size for corner speed labels. */
  cornerLabelSize: number;
  /** Animation duration for normal movement in ms. */
  moveDurationMs: number;
  /** Animation duration for spinout in ms. */
  spinoutDurationMs: number;
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  trackWidth: 40,
  carRadius: 12,
  spotOffset: 14,
  spaceSize: 30,
  cornerLabelSize: 14,
  moveDurationMs: 600,
  spinoutDurationMs: 800,
};

/** Standing entry for the sidebar. */
export interface StandingEntry {
  rank: number;
  playerId: string;
  color: string;
  lapCount: number;
  position: number;
  gear: number;
}

/** Phase display info. */
export interface PhaseDisplay {
  name: string;
  description: string;
  isActive: boolean;
}
