/**
 * Car renderer: draws top-down car sprites on the track.
 *
 * Handles:
 * - Top-down SVG car silhouettes in player colors with directional rotation
 * - Pre-rendered offscreen canvases per player color for performance
 * - Visual offset when multiple cars share adjacent spaces
 * - Active player glow highlight
 * - Gear indicator on each car
 * - Boost speed lines and spinout rotation states
 */

import type { CameraState, CarState, TrackLayout, BoardConfig, Point } from './types.js';
import { DEFAULT_BOARD_CONFIG } from './types.js';
import { worldToScreen } from './camera.js';

/** Car sprite dimensions in world units. */
const CAR_LENGTH = 24;
const CAR_WIDTH = 12;

/** Pre-rendered car sprite cache: color → canvas. */
const carSpriteCache = new Map<string, HTMLCanvasElement>();

/**
 * Generate a pre-rendered car sprite for a given color.
 * The sprite faces right (angle=0) and is centered at its origin.
 */
function getCarSprite(color: string, scale: number): HTMLCanvasElement {
  const key = `${color}_${scale.toFixed(1)}`;
  const cached = carSpriteCache.get(key);
  if (cached) return cached;

  const w = Math.ceil(CAR_LENGTH * scale) + 4;
  const h = Math.ceil(CAR_WIDTH * scale) + 4;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const cx = w / 2;
  const cy = h / 2;
  const halfL = (CAR_LENGTH * scale) / 2;
  const halfW = (CAR_WIDTH * scale) / 2;

  // Main body — rounded rectangle
  const bodyR = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(cx - halfL + bodyR, cy - halfW);
  ctx.lineTo(cx + halfL - bodyR * 2, cy - halfW);
  // Front nose taper
  ctx.quadraticCurveTo(cx + halfL, cy - halfW * 0.4, cx + halfL, cy);
  ctx.quadraticCurveTo(cx + halfL, cy + halfW * 0.4, cx + halfL - bodyR * 2, cy + halfW);
  ctx.lineTo(cx - halfL + bodyR, cy + halfW);
  ctx.quadraticCurveTo(cx - halfL, cy + halfW, cx - halfL, cy + halfW - bodyR);
  ctx.lineTo(cx - halfL, cy - halfW + bodyR);
  ctx.quadraticCurveTo(cx - halfL, cy - halfW, cx - halfL + bodyR, cy - halfW);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Contrasting center stripe
  const stripe = getContrastColor(color);
  ctx.fillStyle = stripe;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(cx - halfL * 0.3, cy - halfW * 0.15, halfL * 0.6, halfW * 0.3);
  ctx.globalAlpha = 1.0;

  // Front wing
  ctx.fillStyle = darken(color, 0.2);
  ctx.fillRect(cx + halfL * 0.7, cy - halfW * 1.0, 2 * scale, halfW * 2.0);

  // Rear wing
  ctx.fillRect(cx - halfL * 0.9, cy - halfW * 1.0, 2 * scale, halfW * 2.0);

  // 4 wheels (dark rectangles)
  ctx.fillStyle = '#222222';
  const wheelW = 3 * scale;
  const wheelH = 2 * scale;
  // Front-left
  ctx.fillRect(cx + halfL * 0.45, cy - halfW - wheelH * 0.3, wheelW, wheelH);
  // Front-right
  ctx.fillRect(cx + halfL * 0.45, cy + halfW - wheelH * 0.7, wheelW, wheelH);
  // Rear-left
  ctx.fillRect(cx - halfL * 0.55, cy - halfW - wheelH * 0.3, wheelW, wheelH);
  // Rear-right
  ctx.fillRect(cx - halfL * 0.55, cy + halfW - wheelH * 0.7, wheelW, wheelH);

  carSpriteCache.set(key, canvas);
  return canvas;
}

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

    renderCarSprite(ctx, screenPos, car, isActive, config.carRadius * camera.zoom, space.angle);
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
  angle?: number,
): void {
  const screenPos = worldToScreen(camera, worldPos);
  renderCarSprite(ctx, screenPos, car, isActive, config.carRadius * camera.zoom, angle ?? 0);
}

/** Draw a single car as a rotated sprite. */
function renderCarSprite(
  ctx: CanvasRenderingContext2D,
  pos: Point,
  car: CarState,
  isActive: boolean,
  radius: number,
  angle: number,
): void {
  const scale = radius / (CAR_WIDTH / 2);

  // Glow for active player
  if (isActive) {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, radius * 1.5, radius * 1.2, angle, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Draw pre-rendered car sprite
  const sprite = getCarSprite(car.color, scale);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  ctx.restore();

  // Gear number centered on car
  ctx.fillStyle = getContrastColor(car.color);
  ctx.font = `bold ${radius * 0.7}px sans-serif`;
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
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/** Darken a hex color by a factor (0-1). */
function darken(hexColor: string, factor: number): string {
  const hex = hexColor.replace('#', '');
  const r = Math.round(parseInt(hex.substring(0, 2), 16) * (1 - factor));
  const g = Math.round(parseInt(hex.substring(2, 4), 16) * (1 - factor));
  const b = Math.round(parseInt(hex.substring(4, 6), 16) * (1 - factor));
  return `rgb(${r},${g},${b})`;
}
