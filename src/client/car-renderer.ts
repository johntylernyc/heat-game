/**
 * Car renderer: draws car tokens on the track at their current positions.
 *
 * Handles:
 * - Car tokens in player colors at specific space/spot positions
 * - Visual offset when multiple cars share adjacent spaces
 * - Current player highlight
 * - Gear indicator on each car
 */

import type { CameraState, CarState, TrackLayout, BoardConfig, Point } from './types.js';
import { DEFAULT_BOARD_CONFIG } from './types.js';
import { worldToScreen } from './camera.js';

/**
 * Render all car tokens on the track.
 */
export function renderCars(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  cars: CarState[],
  camera: CameraState,
  activePlayerId: string | null,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): void {
  // Sort cars so the active player renders on top
  const sorted = [...cars].sort((a, b) => {
    if (a.playerId === activePlayerId) return 1;
    if (b.playerId === activePlayerId) return -1;
    return 0;
  });

  // Detect collisions (multiple cars on same space) for offset
  const occupancy = buildOccupancyMap(cars);

  for (const car of sorted) {
    const space = layout.spaces[car.position];
    if (!space) continue;

    const spotPos = car.spot === 'raceLine' ? space.raceLine : space.offLine;

    // Apply collision offset if multiple cars at same space+spot
    const key = `${car.position}:${car.spot}`;
    const carsAtSpot = occupancy.get(key) ?? [];
    const offset = computeCollisionOffset(
      car, carsAtSpot, space.angle, config.carRadius, camera.zoom,
    );

    const worldPos: Point = {
      x: spotPos.x + offset.x,
      y: spotPos.y + offset.y,
    };
    const screenPos = worldToScreen(camera, worldPos);
    const isActive = car.playerId === activePlayerId;

    renderCarToken(ctx, screenPos, car, isActive, config.carRadius * camera.zoom);
  }
}

/**
 * Render a single car at an animated position (for movement animation).
 */
export function renderCarAtPosition(
  ctx: CanvasRenderingContext2D,
  worldPos: Point,
  car: CarState,
  camera: CameraState,
  isActive: boolean,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): void {
  const screenPos = worldToScreen(camera, worldPos);
  renderCarToken(ctx, screenPos, car, isActive, config.carRadius * camera.zoom);
}

/** Draw a single car token. */
function renderCarToken(
  ctx: CanvasRenderingContext2D,
  pos: Point,
  car: CarState,
  isActive: boolean,
  radius: number,
): void {
  // Glow for active player
  if (isActive) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();
  }

  // Car body (filled circle)
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = car.color;
  ctx.fill();

  // Border
  ctx.strokeStyle = isActive ? '#FFFFFF' : 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = isActive ? 2.5 : 1.5;
  ctx.stroke();

  // Gear number in the center
  ctx.fillStyle = getContrastColor(car.color);
  ctx.font = `bold ${radius * 0.9}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(car.gear), pos.x, pos.y);
}

/** Build a map of space:spot → list of cars for collision detection. */
function buildOccupancyMap(cars: CarState[]): Map<string, CarState[]> {
  const map = new Map<string, CarState[]>();
  for (const car of cars) {
    const key = `${car.position}:${car.spot}`;
    const list = map.get(key) ?? [];
    list.push(car);
    map.set(key, list);
  }
  return map;
}

/**
 * Compute a small offset for a car when multiple cars share the same spot.
 * Cars are nudged along the track direction so they don't overlap.
 */
function computeCollisionOffset(
  car: CarState,
  carsAtSpot: CarState[],
  trackAngle: number,
  carRadius: number,
  _zoom: number,
): Point {
  if (carsAtSpot.length <= 1) return { x: 0, y: 0 };

  const idx = carsAtSpot.indexOf(car);
  if (idx < 0) return { x: 0, y: 0 };

  // Spread along the track direction
  const spread = carRadius * 0.8;
  const centerOffset = (carsAtSpot.length - 1) / 2;
  const t = (idx - centerOffset) * spread;

  return {
    x: Math.cos(trackAngle) * t,
    y: Math.sin(trackAngle) * t,
  };
}

/** Get a contrasting text color (black or white) for a given background. */
function getContrastColor(hexColor: string): string {
  // Parse hex color
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Luminance calculation
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
