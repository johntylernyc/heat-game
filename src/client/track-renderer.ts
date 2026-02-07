/**
 * Track renderer: draws the race circuit on an HTML Canvas.
 *
 * Renders a multi-layer track surface with:
 * - Textured asphalt with lane markings
 * - Red-white rumble strip kerbs at corners
 * - Corner braking zone shading
 * - Green grass infield and outfield
 * - Gravel trap patches at corner exits
 * - Enhanced start/finish checkered pattern
 * - Staggered 2-wide grid boxes
 * - Corner speed limit diamond signs with chevron markers
 * - Sector coloring
 * - Legends lines
 * - Track-specific visual themes with surround elements
 */

import type { CameraState, SpaceLayout, TrackLayout, BoardConfig, VisualTheme, Point } from './types.js';
import { DEFAULT_BOARD_CONFIG } from './types.js';
import { worldToScreen } from './camera.js';

/** Sector fill colors (subtle, semi-transparent). */
const SECTOR_COLORS = [
  'rgba(100, 149, 237, 0.08)',
  'rgba(144, 238, 144, 0.08)',
  'rgba(255, 182, 193, 0.08)',
  'rgba(255, 218, 185, 0.08)',
  'rgba(221, 160, 221, 0.08)',
];

const ROAD_COLOR = '#3a3a3a';
const ROAD_BORDER_COLOR = '#222222';
const SPACE_MARKER_COLOR = 'rgba(255, 255, 255, 0.25)';
const LEGENDS_LINE_COLOR = 'rgba(147, 112, 219, 0.5)';
const START_FINISH_COLOR = '#FFFFFF';
const GRID_MARKER_COLOR = 'rgba(255, 255, 255, 0.6)';

/** Cached asphalt noise pattern (generated once). */
let asphaltPattern: CanvasPattern | null = null;

function getAsphaltPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (asphaltPattern) return asphaltPattern;

  const size = 64;
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  const octx = offscreen.getContext('2d');
  if (!octx) return null;

  // Base asphalt
  octx.fillStyle = '#3a3a3a';
  octx.fillRect(0, 0, size, size);

  // Subtle noise
  const imageData = octx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 12;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  octx.putImageData(imageData, 0, 0);

  asphaltPattern = ctx.createPattern(offscreen, 'repeat');
  return asphaltPattern;
}

export function renderTrack(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
  theme?: VisualTheme,
): void {
  if (theme) {
    renderBackground(ctx, layout, camera, config, theme);
    renderSurroundElements(ctx, layout, camera, config, theme);
  }
  renderRoadSurface(ctx, layout, camera, config);
  renderSectorHighlights(ctx, layout, camera, config);
  renderCenterLine(ctx, layout, camera, config);
  renderEdgeLines(ctx, layout, camera, config);
  renderBrakingZones(ctx, layout, camera, config);
  renderKerbs(ctx, layout, camera, config, theme);
  renderSpaceMarkers(ctx, layout, camera, config);
  renderLegendsLines(ctx, layout, camera, config);
  renderGravelTraps(ctx, layout, camera, config, theme);
  renderCorners(ctx, layout, camera, config, theme);
  renderStartFinish(ctx, layout, camera, config);
  renderGridPositions(ctx, layout, camera, config);
  if (theme) {
    renderFence(ctx, layout, camera, config, theme);
  }
}

/** Draw grass background and infield area. */
function renderBackground(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  _config: BoardConfig,
  theme: VisualTheme,
): void {
  const width = ctx.canvas.width / (window.devicePixelRatio || 1);
  const height = ctx.canvas.height / (window.devicePixelRatio || 1);

  // Sky/background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, theme.skyGradient[0]);
  grad.addColorStop(1, theme.skyGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Grass fill covering the full area
  ctx.fillStyle = theme.infieldColor;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1.0;
}

/** Draw decorative surround elements outside the track. */
function renderSurroundElements(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
  theme: VisualTheme,
): void {
  const n = layout.spaces.length;
  for (const elem of theme.surroundElements) {
    const spaceIdx = Math.floor(elem.t * n) % n;
    const space = layout.spaces[spaceIdx];
    if (!space) continue;

    const p = worldToScreen(camera, layout.pathPoints[spaceIdx]);
    const perpX = -Math.sin(space.angle);
    const perpY = Math.cos(space.angle);
    const offset = elem.offset * camera.zoom;

    const ex = p.x + perpX * offset;
    const ey = p.y + perpY * offset;

    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(camera.zoom * elem.scale, camera.zoom * elem.scale);
    ctx.fillStyle = elem.color;

    const path = new Path2D(elem.path);
    ctx.fill(path);
    ctx.restore();
  }
}

/** Draw the road surface as a thick path with noise texture. */
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
  ctx.lineWidth = (config.trackWidth + 6) * camera.zoom;
  ctx.strokeStyle = ROAD_BORDER_COLOR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Road surface with texture
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToScreen(camera, points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.lineWidth = config.trackWidth * camera.zoom;

  const pattern = getAsphaltPattern(ctx);
  ctx.strokeStyle = pattern ?? ROAD_COLOR;
  ctx.stroke();
}

/** Render subtle sector background coloring. */
function renderSectorHighlights(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
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

/** Draw white dashed center line between race-line and off-line. */
function renderCenterLine(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  _config: BoardConfig,
): void {
  const points = layout.pathPoints;
  if (points.length < 2) return;

  ctx.beginPath();
  const first = worldToScreen(camera, points[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToScreen(camera, points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.lineWidth = 1.5 * camera.zoom;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.setLineDash([8 * camera.zoom, 6 * camera.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Draw solid white edge lines on both sides of the road. */
function renderEdgeLines(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  const halfWidth = config.trackWidth / 2;

  for (const side of [-1, 1]) {
    ctx.beginPath();
    let started = false;
    for (const space of layout.spaces) {
      const p = layout.pathPoints[space.index];
      const perpX = -Math.sin(space.angle) * halfWidth * side;
      const perpY = Math.cos(space.angle) * halfWidth * side;
      const screenP = worldToScreen(camera, {
        x: p.x + perpX,
        y: p.y + perpY,
      });
      if (!started) {
        ctx.moveTo(screenP.x, screenP.y);
        started = true;
      } else {
        ctx.lineTo(screenP.x, screenP.y);
      }
    }
    ctx.closePath();
    ctx.lineWidth = 1.5 * camera.zoom;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.stroke();
  }
}

/** Draw braking zone shading on the 3-4 spaces before each corner. */
function renderBrakingZones(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  const n = layout.spaces.length;
  const brakingSpaces = 3;

  for (const space of layout.spaces) {
    if (!space.isCorner) continue;

    for (let offset = 1; offset <= brakingSpaces; offset++) {
      const idx = (space.index - offset + n) % n;
      const brakeSpace = layout.spaces[idx];
      const p = worldToScreen(camera, layout.pathPoints[idx]);
      const perpX = -Math.sin(brakeSpace.angle);
      const perpY = Math.cos(brakeSpace.angle);
      const halfWidth = (config.trackWidth / 2 - 2) * camera.zoom;

      const alpha = 0.08 * (1 - (offset - 1) / brakingSpaces);
      ctx.beginPath();
      ctx.moveTo(p.x - perpX * halfWidth, p.y - perpY * halfWidth);
      ctx.lineTo(p.x + perpX * halfWidth, p.y + perpY * halfWidth);
      ctx.lineWidth = config.trackWidth * 0.8 * camera.zoom;
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
}

/** Draw red-white rumble strip kerbs on the inside of each corner. */
function renderKerbs(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
  theme?: VisualTheme,
): void {
  const n = layout.spaces.length;
  const kerbColor1 = theme?.kerbColors[0] ?? '#CC0000';
  const kerbColor2 = theme?.kerbColors[1] ?? '#FFFFFF';

  for (const space of layout.spaces) {
    if (!space.isCorner) continue;

    // Render kerbs at the corner and 1 space on each side
    for (let offset = -1; offset <= 1; offset++) {
      const idx = (space.index + offset + n) % n;
      const kerbSpace = layout.spaces[idx];
      const p = worldToScreen(camera, layout.pathPoints[idx]);
      const perpX = -Math.sin(kerbSpace.angle);
      const perpY = Math.cos(kerbSpace.angle);
      const halfWidth = (config.trackWidth / 2) * camera.zoom;

      // Inner side of corner (alternate colors)
      const kerbWidth = 4 * camera.zoom;
      const kerbX = p.x - perpX * (halfWidth + kerbWidth / 2);
      const kerbY = p.y - perpY * (halfWidth + kerbWidth / 2);

      ctx.beginPath();
      ctx.arc(kerbX, kerbY, kerbWidth, 0, Math.PI * 2);
      ctx.fillStyle = (idx + offset) % 2 === 0 ? kerbColor1 : kerbColor2;
      ctx.fill();
    }
  }
}

/** Draw gravel trap patches at corner exits. */
function renderGravelTraps(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
  theme?: VisualTheme,
): void {
  const n = layout.spaces.length;
  const gravelColor = theme?.gravelColor ?? '#B8A060';

  for (const space of layout.spaces) {
    if (!space.isCorner) continue;

    // Draw gravel at 1-2 spaces after the corner exit (outside)
    for (let offset = 1; offset <= 2; offset++) {
      const idx = (space.index + offset) % n;
      const gravelSpace = layout.spaces[idx];
      const p = worldToScreen(camera, layout.pathPoints[idx]);
      const perpX = -Math.sin(gravelSpace.angle);
      const perpY = Math.cos(gravelSpace.angle);
      const halfWidth = (config.trackWidth / 2 + 6) * camera.zoom;

      ctx.beginPath();
      ctx.ellipse(
        p.x + perpX * halfWidth,
        p.y + perpY * halfWidth,
        8 * camera.zoom,
        5 * camera.zoom,
        gravelSpace.angle,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = gravelColor;
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }
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

/** Draw corner markers with diamond speed limit signs and chevrons. */
function renderCorners(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
  theme?: VisualTheme,
): void {
  const accentColor = theme?.accentColor ?? '#FF6B35';

  for (const space of layout.spaces) {
    if (!space.isCorner) continue;

    const p = worldToScreen(camera, layout.pathPoints[space.index]);
    const perpX = -Math.sin(space.angle);
    const perpY = Math.cos(space.angle);
    const halfWidth = (config.trackWidth / 2) * camera.zoom;

    // Corner line across road (accent color)
    ctx.beginPath();
    ctx.moveTo(p.x - perpX * halfWidth, p.y - perpY * halfWidth);
    ctx.lineTo(p.x + perpX * halfWidth, p.y + perpY * halfWidth);
    ctx.lineWidth = 3 * camera.zoom;
    ctx.strokeStyle = accentColor;
    ctx.stroke();

    // Apex marker on road surface
    ctx.beginPath();
    ctx.arc(p.x - perpX * halfWidth * 0.3, p.y - perpY * halfWidth * 0.3, 3 * camera.zoom, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Diamond-shaped speed limit sign (placed outside the track)
    const signX = p.x + perpX * (halfWidth + 18 * camera.zoom);
    const signY = p.y + perpY * (halfWidth + 18 * camera.zoom);
    const signSize = 14 * camera.zoom;

    // Diamond background
    ctx.beginPath();
    ctx.moveTo(signX, signY - signSize);
    ctx.lineTo(signX + signSize, signY);
    ctx.lineTo(signX, signY + signSize);
    ctx.lineTo(signX - signSize, signY);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#CC3333';
    ctx.lineWidth = 2 * camera.zoom;
    ctx.stroke();

    // Speed number in diamond
    ctx.fillStyle = '#CC3333';
    ctx.font = `bold ${config.cornerLabelSize * camera.zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(space.cornerSpeedLimit), signX, signY);

    // Red-white chevron sign on the outside of the corner
    const chevronX = p.x + perpX * (halfWidth + 36 * camera.zoom);
    const chevronY = p.y + perpY * (halfWidth + 36 * camera.zoom);
    const chevronW = 10 * camera.zoom;
    const chevronH = 6 * camera.zoom;

    ctx.save();
    ctx.translate(chevronX, chevronY);
    ctx.rotate(space.angle);

    // Three chevron stripes
    for (let ci = -1; ci <= 1; ci++) {
      ctx.fillStyle = ci % 2 === 0 ? '#CC0000' : '#FFFFFF';
      ctx.fillRect(-chevronW / 2, ci * chevronH - chevronH / 2, chevronW, chevronH);
    }
    ctx.restore();
  }
}

/** Draw the start/finish line as a full-width checkered pattern. */
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

  // Full-width checkered pattern
  const numChecksWide = 8;
  const numChecksDeep = 2;
  const checkSize = (halfWidth * 2) / numChecksWide;
  const trackDirX = Math.cos(sfSpace.angle);
  const trackDirY = Math.sin(sfSpace.angle);

  for (let row = 0; row < numChecksDeep; row++) {
    for (let col = 0; col < numChecksWide; col++) {
      const t = -1 + (2 * col + 1) / numChecksWide;
      const cx = p.x + perpX * halfWidth * t + trackDirX * (row - 0.5) * checkSize;
      const cy = p.y + perpY * halfWidth * t + trackDirY * (row - 0.5) * checkSize;

      ctx.fillStyle = (row + col) % 2 === 0 ? '#FFFFFF' : '#000000';

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sfSpace.angle);
      ctx.fillRect(-checkSize / 2, -checkSize / 2, checkSize, checkSize);
      ctx.restore();
    }
  }

  // "START / FINISH" label
  const labelX = p.x - perpX * (halfWidth + 20 * camera.zoom);
  const labelY = p.y - perpY * (halfWidth + 20 * camera.zoom);
  ctx.fillStyle = START_FINISH_COLOR;
  ctx.font = `bold ${10 * camera.zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START / FINISH', labelX, labelY);

  // Start light gantry (horizontal bar above track)
  const gantryX = p.x + perpX * 0;
  const gantryY = p.y - 30 * camera.zoom;
  const gantryW = halfWidth * 1.6;
  const lightR = 4 * camera.zoom;

  ctx.fillStyle = '#333333';
  ctx.fillRect(gantryX - gantryW / 2, gantryY - lightR * 1.5, gantryW, lightR * 3);

  // 5 lights (all off = dark red)
  for (let li = 0; li < 5; li++) {
    const lx = gantryX - gantryW / 2 + (gantryW / 6) * (li + 1);
    ctx.beginPath();
    ctx.arc(lx, gantryY, lightR, 0, Math.PI * 2);
    ctx.fillStyle = '#440000';
    ctx.fill();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Draw grid position markers — staggered 2-wide boxes. */
function renderGridPositions(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
): void {
  const sfSpace = layout.spaces.find(s => s.isStartFinish);
  if (!sfSpace) return;

  const n = layout.spaces.length;
  let gridNum = 1;

  for (let offset = 1; offset <= 3; offset++) {
    const spaceIdx = (sfSpace.index - offset + n) % n;
    const space = layout.spaces[spaceIdx];

    for (const spot of ['raceLine', 'offLine'] as const) {
      const pos = worldToScreen(camera, space[spot]);
      const boxW = 10 * camera.zoom;
      const boxH = 14 * camera.zoom;

      // Grid box outline
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(space.angle);
      ctx.strokeStyle = GRID_MARKER_COLOR;
      ctx.lineWidth = 1.5 * camera.zoom;
      ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);
      ctx.restore();

      // Grid number
      ctx.fillStyle = GRID_MARKER_COLOR;
      ctx.font = `${8 * camera.zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(gridNum), pos.x, pos.y);

      gridNum++;
    }
  }
}

/** Draw a thin fence line on the outside edge of the track. */
function renderFence(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  config: BoardConfig,
  theme: VisualTheme,
): void {
  const halfWidth = config.trackWidth / 2 + 3;

  // Outside fence (positive perpendicular direction)
  ctx.beginPath();
  let started = false;
  for (const space of layout.spaces) {
    const p = layout.pathPoints[space.index];
    const perpX = -Math.sin(space.angle) * halfWidth;
    const perpY = Math.cos(space.angle) * halfWidth;
    const screenP = worldToScreen(camera, { x: p.x + perpX, y: p.y + perpY });
    if (!started) {
      ctx.moveTo(screenP.x, screenP.y);
      started = true;
    } else {
      ctx.lineTo(screenP.x, screenP.y);
    }
  }
  ctx.closePath();
  ctx.lineWidth = 1 * camera.zoom;
  ctx.strokeStyle = theme.fenceColor;
  ctx.globalAlpha = 0.4;
  ctx.setLineDash([3 * camera.zoom, 6 * camera.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;
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
