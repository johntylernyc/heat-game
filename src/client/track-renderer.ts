/**
 * Track renderer: draws the race circuit on an HTML Canvas.
 *
 * Renders the road surface, space markers, corner indicators with speed limits,
 * sector coloring, legends lines, and start/finish line.
 */

import type { CameraState, SpaceLayout, TrackLayout, BoardConfig } from './types.js';
import { DEFAULT_BOARD_CONFIG } from './types.js';
import { worldToScreen } from './camera.js';

/** Sector fill colors (subtle, semi-transparent). */
const SECTOR_COLORS = [
  'rgba(100, 149, 237, 0.08)', // cornflower blue
  'rgba(144, 238, 144, 0.08)', // light green
  'rgba(255, 182, 193, 0.08)', // light pink
  'rgba(255, 218, 185, 0.08)', // peach
  'rgba(221, 160, 221, 0.08)', // plum
];

/** Road surface color. */
const ROAD_COLOR = '#3a3a3a';
const ROAD_BORDER_COLOR = '#222222';
const SPACE_MARKER_COLOR = 'rgba(255, 255, 255, 0.25)';
const CORNER_MARKER_COLOR = '#FF6B35';
const LEGENDS_LINE_COLOR = 'rgba(147, 112, 219, 0.5)';
const START_FINISH_COLOR = '#FFFFFF';
const GRID_MARKER_COLOR = 'rgba(255, 255, 255, 0.6)';

export function renderTrack(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): void {
  renderRoadSurface(ctx, layout, camera, config);
  renderSectorHighlights(ctx, layout, camera, config);
  renderSpaceMarkers(ctx, layout, camera, config);
  renderLegendsLines(ctx, layout, camera, config);
  renderCorners(ctx, layout, camera, config);
  renderStartFinish(ctx, layout, camera, config);
  renderGridPositions(ctx, layout, camera, config);
}

/** Draw the road surface as a thick path following the circuit. */
function renderRoadSurface(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  const points = layout.pathPoints;
  if (points.length < 2) return;

  // Road border (slightly wider)
  ctx.beginPath();
  const first = worldToScreen(camera, points[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToScreen(camera, points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.lineWidth = (config.trackWidth + 4) * camera.zoom;
  ctx.strokeStyle = ROAD_BORDER_COLOR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Road surface
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToScreen(camera, points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.lineWidth = config.trackWidth * camera.zoom;
  ctx.strokeStyle = ROAD_COLOR;
  ctx.stroke();
}

/** Render subtle sector background coloring. */
function renderSectorHighlights(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  // Group spaces by sector and draw wider road segments
  const sectorSpaces = new Map<number, SpaceLayout[]>();
  for (const space of layout.spaces) {
    const list = sectorSpaces.get(space.sectorId) ?? [];
    list.push(space);
    sectorSpaces.set(space.sectorId, list);
  }

  for (const [sectorId, spaces] of sectorSpaces) {
    const color = SECTOR_COLORS[(sectorId - 1) % SECTOR_COLORS.length];
    ctx.beginPath();
    const firstSpace = worldToScreen(camera, layout.pathPoints[spaces[0].index]);
    ctx.moveTo(firstSpace.x, firstSpace.y);
    for (let i = 1; i < spaces.length; i++) {
      const p = worldToScreen(camera, layout.pathPoints[spaces[i].index]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = (config.trackWidth - 2) * camera.zoom;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** Draw small markers for each space along the track. */
function renderSpaceMarkers(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  const markerSize = 2 * camera.zoom;
  ctx.fillStyle = SPACE_MARKER_COLOR;

  for (const space of layout.spaces) {
    const p = worldToScreen(camera, layout.pathPoints[space.index]);
    // Perpendicular tick mark across the road
    const perpX = -Math.sin(space.angle);
    const perpY = Math.cos(space.angle);
    const halfWidth = (config.trackWidth / 2 - 2) * camera.zoom;

    ctx.beginPath();
    ctx.moveTo(p.x - perpX * halfWidth, p.y - perpY * halfWidth);
    ctx.lineTo(p.x + perpX * halfWidth, p.y + perpY * halfWidth);
    ctx.lineWidth = markerSize;
    ctx.strokeStyle = SPACE_MARKER_COLOR;
    ctx.stroke();
  }
}

/** Draw legends lines (subtle markers before corners). */
function renderLegendsLines(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  for (const space of layout.spaces) {
    if (!space.isLegendsLine) continue;

    const p = worldToScreen(camera, layout.pathPoints[space.index]);
    const perpX = -Math.sin(space.angle);
    const perpY = Math.cos(space.angle);
    const halfWidth = (config.trackWidth / 2) * camera.zoom;

    ctx.beginPath();
    ctx.moveTo(p.x - perpX * halfWidth, p.y - perpY * halfWidth);
    ctx.lineTo(p.x + perpX * halfWidth, p.y + perpY * halfWidth);
    ctx.lineWidth = 2 * camera.zoom;
    ctx.strokeStyle = LEGENDS_LINE_COLOR;
    ctx.setLineDash([4 * camera.zoom, 4 * camera.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Draw corner markers with speed limit labels. */
function renderCorners(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  for (const space of layout.spaces) {
    if (!space.isCorner) continue;

    const p = worldToScreen(camera, layout.pathPoints[space.index]);
    const perpX = -Math.sin(space.angle);
    const perpY = Math.cos(space.angle);
    const halfWidth = (config.trackWidth / 2) * camera.zoom;

    // Corner line across road
    ctx.beginPath();
    ctx.moveTo(p.x - perpX * halfWidth, p.y - perpY * halfWidth);
    ctx.lineTo(p.x + perpX * halfWidth, p.y + perpY * halfWidth);
    ctx.lineWidth = 3 * camera.zoom;
    ctx.strokeStyle = CORNER_MARKER_COLOR;
    ctx.stroke();

    // Speed limit badge (placed outside the track)
    const badgeX = p.x + perpX * (halfWidth + 16 * camera.zoom);
    const badgeY = p.y + perpY * (halfWidth + 16 * camera.zoom);
    const badgeRadius = 12 * camera.zoom;

    // Red circle
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#CC3333';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2 * camera.zoom;
    ctx.stroke();

    // Speed number
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${config.cornerLabelSize * camera.zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(space.cornerSpeedLimit), badgeX, badgeY);
  }
}

/** Draw the start/finish line prominently. */
function renderStartFinish(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  const sfSpace = layout.spaces.find(s => s.isStartFinish);
  if (!sfSpace) return;

  const p = worldToScreen(camera, layout.pathPoints[sfSpace.index]);
  const perpX = -Math.sin(sfSpace.angle);
  const perpY = Math.cos(sfSpace.angle);
  const halfWidth = (config.trackWidth / 2 + 4) * camera.zoom;

  // Checkered pattern (simplified as thick alternating line)
  const numChecks = 6;
  const checkSize = (halfWidth * 2) / numChecks;

  for (let i = 0; i < numChecks; i++) {
    const t = -1 + (2 * i + 1) / numChecks;
    const cx = p.x + perpX * halfWidth * t;
    const cy = p.y + perpY * halfWidth * t;

    ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#000000';
    ctx.fillRect(
      cx - checkSize / 2,
      cy - checkSize / 2,
      checkSize,
      checkSize,
    );
  }

  // "START" label
  const labelX = p.x - perpX * (halfWidth + 20 * camera.zoom);
  const labelY = p.y - perpY * (halfWidth + 20 * camera.zoom);
  ctx.fillStyle = START_FINISH_COLOR;
  ctx.font = `bold ${10 * camera.zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START / FINISH', labelX, labelY);
}

/** Draw grid position markers at the starting grid. */
function renderGridPositions(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  // Find spaces that are part of the starting grid
  // Grid positions are at specific space indices with race/off-line spots
  // We render small numbered markers at the spot positions

  // Collect grid space indices from the layout
  // Starting grid info isn't directly on SpaceLayout, but grid positions
  // are typically the spaces just before the start/finish line.
  // We'll render subtle numbered circles at the raceLine/offLine spots
  // for the first few spaces before start/finish.

  const sfSpace = layout.spaces.find(s => s.isStartFinish);
  if (!sfSpace) return;

  // Grid positions occupy spaces just before the start line
  // In the USA track, grid is at spaces 45-47
  // Render grid markers for the 3 spaces before start/finish
  const n = layout.spaces.length;
  let gridNum = 1;

  for (let offset = 1; offset <= 3; offset++) {
    const spaceIdx = (sfSpace.index - offset + n) % n;
    const space = layout.spaces[spaceIdx];

    for (const spot of ['raceLine', 'offLine'] as const) {
      const pos = worldToScreen(camera, space[spot]);
      const r = 6 * camera.zoom;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = GRID_MARKER_COLOR;
      ctx.lineWidth = 1.5 * camera.zoom;
      ctx.stroke();

      ctx.fillStyle = GRID_MARKER_COLOR;
      ctx.font = `${8 * camera.zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(gridNum), pos.x, pos.y);

      gridNum++;
    }
  }
}

/**
 * Hit-test: find which space (if any) is at the given screen coordinates.
 * Used for hover/click to show corner speed limits.
 */
export function hitTestSpace(
  layout: TrackLayout,
  camera: CameraState,
  screenX: number,
  screenY: number,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): SpaceLayout | null {
  const hitRadius = (config.trackWidth / 2) * camera.zoom;
  const hitRadiusSq = hitRadius * hitRadius;

  for (const space of layout.spaces) {
    const p = worldToScreen(camera, layout.pathPoints[space.index]);
    const dx = screenX - p.x;
    const dy = screenY - p.y;
    if (dx * dx + dy * dy <= hitRadiusSq) {
      return space;
    }
  }
  return null;
}
