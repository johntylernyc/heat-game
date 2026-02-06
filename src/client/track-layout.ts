/**
 * Track layout generator: converts abstract TrackData into 2D coordinates.
 *
 * Generates a closed circuit path and distributes spaces along it,
 * creating a top-down view of the race track.
 */

import type { TrackData } from '../track/types.js';
import type { Point, SpaceLayout, TrackLayout, BoardConfig } from './types.js';
import { DEFAULT_BOARD_CONFIG } from './types.js';

/**
 * Generate a 2D layout for a track.
 *
 * Uses a rounded-rectangle base shape scaled to the track's number of spaces.
 * Corners in the track data naturally fall at their space positions along
 * this path, creating a convincing circuit layout.
 */
export function generateTrackLayout(
  trackData: TrackData,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): TrackLayout {
  const pathPoints = generateCircuitPath(trackData.totalSpaces, config.spaceSize);
  const spaces = layoutSpaces(pathPoints, trackData, config);

  const allPoints = spaces.flatMap(s => [s.raceLine, s.offLine]);
  const bounds = computeBounds(allPoints);
  const center: Point = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  return { spaces, center, bounds, pathPoints };
}

/**
 * Generate a closed circuit path as a rounded rectangle.
 * Returns one point per space, evenly distributed along the perimeter.
 */
function generateCircuitPath(totalSpaces: number, spaceSize: number): Point[] {
  // Calculate perimeter to fit all spaces
  const perimeter = totalSpaces * spaceSize;

  // Rounded rectangle proportions: ~2:1 aspect ratio
  // P = 2*(w + h) - (8 - 2*pi)*r for a rounded rect
  // Simplify: use straight + arc segments
  const cornerRadius = spaceSize * 2.5;
  const arcLength = cornerRadius * Math.PI / 2; // quarter circle per corner
  const totalArcLength = 4 * arcLength;
  const totalStraightLength = perimeter - totalArcLength;

  // Distribute straight length among 4 sides with 2:1 ratio
  // long sides get 2 parts, short sides get 1 part => 6 parts total
  const partLength = totalStraightLength / 6;
  const longSide = partLength * 2;
  const shortSide = partLength;

  // Build path segments
  const segments = buildRoundedRectSegments(longSide, shortSide, cornerRadius);

  // Sample points along the path
  return samplePathPoints(segments, totalSpaces, perimeter);
}

interface PathSegment {
  type: 'line' | 'arc';
  length: number;
  /** For line: start and end points. */
  start?: Point;
  end?: Point;
  /** For arc: center, radius, start angle, end angle. */
  center?: Point;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

function buildRoundedRectSegments(
  longSide: number,
  shortSide: number,
  radius: number,
): PathSegment[] {
  // Layout: bottom-left corner at origin, going clockwise
  // Bottom straight (left to right)
  // Bottom-right arc
  // Right straight (bottom to top)
  // Top-right arc
  // Top straight (right to left)
  // Top-left arc
  // Left straight (top to bottom)
  // Bottom-left arc

  const w = longSide + 2 * radius;
  const h = shortSide + 2 * radius;

  const segments: PathSegment[] = [
    // Bottom straight
    {
      type: 'line',
      length: longSide,
      start: { x: radius, y: 0 },
      end: { x: radius + longSide, y: 0 },
    },
    // Bottom-right arc
    {
      type: 'arc',
      length: radius * Math.PI / 2,
      center: { x: radius + longSide, y: radius },
      radius,
      startAngle: -Math.PI / 2,
      endAngle: 0,
    },
    // Right straight
    {
      type: 'line',
      length: shortSide,
      start: { x: w, y: radius },
      end: { x: w, y: radius + shortSide },
    },
    // Top-right arc
    {
      type: 'arc',
      length: radius * Math.PI / 2,
      center: { x: radius + longSide, y: radius + shortSide },
      radius,
      startAngle: 0,
      endAngle: Math.PI / 2,
    },
    // Top straight
    {
      type: 'line',
      length: longSide,
      start: { x: radius + longSide, y: h },
      end: { x: radius, y: h },
    },
    // Top-left arc
    {
      type: 'arc',
      length: radius * Math.PI / 2,
      center: { x: radius, y: radius + shortSide },
      radius,
      startAngle: Math.PI / 2,
      endAngle: Math.PI,
    },
    // Left straight
    {
      type: 'line',
      length: shortSide,
      start: { x: 0, y: radius + shortSide },
      end: { x: 0, y: radius },
    },
    // Bottom-left arc
    {
      type: 'arc',
      length: radius * Math.PI / 2,
      center: { x: radius, y: radius },
      radius,
      startAngle: Math.PI,
      endAngle: 3 * Math.PI / 2,
    },
  ];

  return segments;
}

function samplePathPoints(
  segments: PathSegment[],
  numPoints: number,
  perimeter: number,
): Point[] {
  // Build cumulative distance table for each segment start
  const segStarts: number[] = [0];
  for (let i = 0; i < segments.length; i++) {
    segStarts.push(segStarts[i] + segments[i].length);
  }

  const points: Point[] = [];
  const spacing = perimeter / numPoints;
  let segIdx = 0;

  for (let i = 0; i < numPoints; i++) {
    const targetDist = i * spacing;

    // Advance to the segment containing this distance
    while (segIdx < segments.length - 1 && segStarts[segIdx + 1] <= targetDist) {
      segIdx++;
    }

    const seg = segments[segIdx];
    const localDist = targetDist - segStarts[segIdx];
    const localT = Math.max(0, Math.min(1, localDist / seg.length));

    points.push(sampleSegmentPoint(seg, localT));
  }

  return points;
}

function sampleSegmentPoint(seg: PathSegment, t: number): Point {
  if (seg.type === 'line') {
    return {
      x: seg.start!.x + (seg.end!.x - seg.start!.x) * t,
      y: seg.start!.y + (seg.end!.y - seg.start!.y) * t,
    };
  }
  // Arc
  const angle = seg.startAngle! + (seg.endAngle! - seg.startAngle!) * t;
  return {
    x: seg.center!.x + seg.radius! * Math.cos(angle),
    y: seg.center!.y + seg.radius! * Math.sin(angle),
  };
}

/**
 * Create SpaceLayout entries from path points and track data.
 */
function layoutSpaces(
  pathPoints: Point[],
  trackData: TrackData,
  config: BoardConfig,
): SpaceLayout[] {
  const n = pathPoints.length;
  const cornerPositions = new Map(
    trackData.corners.map(c => [c.position, c]),
  );
  const legendsLinePositions = new Set(
    trackData.legendsLines.map(l => l.position),
  );

  // Derive sector for each space
  const sectorMap = buildSectorMap(trackData);

  return pathPoints.map((point, i) => {
    const prev = pathPoints[(i - 1 + n) % n];
    const next = pathPoints[(i + 1) % n];
    const angle = Math.atan2(next.y - prev.y, next.x - prev.x);

    // Perpendicular direction for spot offset
    const perpX = -Math.sin(angle) * config.spotOffset;
    const perpY = Math.cos(angle) * config.spotOffset;

    const corner = cornerPositions.get(i);

    return {
      index: i,
      raceLine: { x: point.x + perpX, y: point.y + perpY },
      offLine: { x: point.x - perpX, y: point.y - perpY },
      angle,
      isCorner: corner !== undefined,
      cornerSpeedLimit: corner?.speedLimit,
      cornerId: corner?.id,
      isLegendsLine: legendsLinePositions.has(i),
      isStartFinish: i === trackData.startFinishLine,
      sectorId: sectorMap.get(i) ?? 1,
    };
  });
}

function buildSectorMap(trackData: TrackData): Map<number, number> {
  const map = new Map<number, number>();
  const corners = trackData.corners;
  if (corners.length === 0) {
    for (let i = 0; i < trackData.totalSpaces; i++) map.set(i, 1);
    return map;
  }

  for (let ci = 0; ci < corners.length; ci++) {
    const start = corners[ci].position;
    const end = corners[(ci + 1) % corners.length].position;
    const sectorId = ci + 1;

    if (start < end) {
      for (let s = start; s <= end; s++) map.set(s, sectorId);
    } else {
      // Wraps around
      for (let s = start; s < trackData.totalSpaces; s++) map.set(s, sectorId);
      for (let s = 0; s <= end; s++) map.set(s, sectorId);
    }
  }

  return map;
}

function computeBounds(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Get the center-line point for a given fractional position along the track.
 * Used for smooth animation interpolation.
 */
export function interpolateTrackPosition(
  layout: TrackLayout,
  fromSpace: number,
  toSpace: number,
  progress: number,
): Point {
  const n = layout.spaces.length;

  // Calculate forward distance (handling wrap-around)
  let forwardDist = toSpace - fromSpace;
  if (forwardDist < 0) forwardDist += n;

  // Current interpolated space (fractional)
  const currentFrac = (fromSpace + forwardDist * progress) % n;
  const baseIdx = Math.floor(currentFrac);
  const frac = currentFrac - baseIdx;
  const nextIdx = (baseIdx + 1) % n;

  const p0 = layout.pathPoints[baseIdx];
  const p1 = layout.pathPoints[nextIdx];

  return {
    x: p0.x + (p1.x - p0.x) * frac,
    y: p0.y + (p1.y - p0.y) * frac,
  };
}

/**
 * Get the interpolated angle for animation.
 */
export function interpolateTrackAngle(
  layout: TrackLayout,
  fromSpace: number,
  toSpace: number,
  progress: number,
): number {
  const n = layout.spaces.length;
  let forwardDist = toSpace - fromSpace;
  if (forwardDist < 0) forwardDist += n;

  const currentFrac = (fromSpace + forwardDist * progress) % n;
  const baseIdx = Math.floor(currentFrac);

  return layout.spaces[baseIdx].angle;
}
