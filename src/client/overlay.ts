/**
 * Overlay renderer: draws the HUD elements on top of the game board.
 *
 * Includes:
 * - Race position standings sidebar
 * - Lap counter per car
 * - Turn order indicator
 * - Corner speed limit tooltip on hover
 * - Slipstream visual indicator
 */

import type {
  CameraState,
  CarState,
  StandingEntry,
  PhaseDisplay,
  SpaceLayout,
  TrackLayout,
  BoardConfig,
} from './types.js';
import { DEFAULT_BOARD_CONFIG } from './types.js';
import { worldToScreen } from './camera.js';

const SIDEBAR_WIDTH = 180;
const SIDEBAR_PADDING = 12;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 32;

/** Phase display names and descriptions. */
const PHASE_LABELS: Record<string, string> = {
  'setup': 'Setup',
  'gear-shift': 'Gear Shift',
  'play-cards': 'Play Cards',
  'reveal-and-move': 'Reveal & Move',
  'adrenaline': 'Adrenaline',
  'react': 'React',
  'slipstream': 'Slipstream',
  'check-corner': 'Corner Check',
  'discard': 'Discard',
  'replenish': 'Replenish',
  'finished': 'Race Over',
};

/**
 * Render the race standings sidebar.
 */
export function renderStandings(
  ctx: CanvasRenderingContext2D,
  standings: StandingEntry[],
  canvasWidth: number,
): void {
  const x = canvasWidth - SIDEBAR_WIDTH - 10;
  const y = 10;
  const height = HEADER_HEIGHT + standings.length * ROW_HEIGHT + SIDEBAR_PADDING;

  // Background panel
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  roundRect(ctx, x, y, SIDEBAR_WIDTH, height, 8);
  ctx.fill();

  // Header
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('STANDINGS', x + SIDEBAR_PADDING, y + HEADER_HEIGHT / 2);

  // Divider
  ctx.beginPath();
  ctx.moveTo(x + SIDEBAR_PADDING, y + HEADER_HEIGHT);
  ctx.lineTo(x + SIDEBAR_WIDTH - SIDEBAR_PADDING, y + HEADER_HEIGHT);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Entries
  for (let i = 0; i < standings.length; i++) {
    const entry = standings[i];
    const rowY = y + HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2;

    // Rank
    ctx.fillStyle = '#AAA';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`P${entry.rank}`, x + SIDEBAR_PADDING + 24, rowY);

    // Color dot
    ctx.beginPath();
    ctx.arc(x + SIDEBAR_PADDING + 36, rowY, 6, 0, Math.PI * 2);
    ctx.fillStyle = entry.color;
    ctx.fill();

    // Player name (truncated)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    const displayName = entry.playerId.length > 8
      ? entry.playerId.substring(0, 8) + '...'
      : entry.playerId;
    ctx.fillText(displayName, x + SIDEBAR_PADDING + 48, rowY);

    // Lap count
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`L${entry.lapCount}`, x + SIDEBAR_WIDTH - SIDEBAR_PADDING, rowY);
  }
}

/**
 * Render the turn phase indicator.
 */
export function renderPhaseIndicator(
  ctx: CanvasRenderingContext2D,
  phase: PhaseDisplay,
  round: number,
): void {
  const x = 10;
  const y = 10;
  const width = 200;
  const height = 52;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  roundRect(ctx, x, y, width, height, 8);
  ctx.fill();

  // Round number
  ctx.fillStyle = '#888';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Round ${round}`, x + 12, y + 8);

  // Phase name
  ctx.fillStyle = phase.isActive ? '#4CAF50' : '#FFFFFF';
  ctx.font = 'bold 16px sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(phase.name, x + 12, y + height - 8);
}

/**
 * Render the turn order indicator showing which player is active.
 */
export function renderTurnOrder(
  ctx: CanvasRenderingContext2D,
  cars: CarState[],
  turnOrder: number[],
  activePlayerIndex: number,
  canvasWidth: number,
): void {
  const totalWidth = turnOrder.length * 32 + (turnOrder.length - 1) * 4;
  const x = (canvasWidth - totalWidth) / 2;
  const y = 10;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, x - 8, y - 4, totalWidth + 16, 40, 6);
  ctx.fill();

  for (let i = 0; i < turnOrder.length; i++) {
    const playerIdx = turnOrder[i];
    const car = cars[playerIdx];
    if (!car) continue;

    const cx = x + i * 36 + 16;
    const cy = y + 16;
    const isActive = playerIdx === activePlayerIndex;

    // Active player highlight
    if (isActive) {
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
    }

    // Player dot
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = car.color;
    ctx.fill();
    ctx.strokeStyle = isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.stroke();

    // Turn order number
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${isActive ? 'bold ' : ''}9px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), cx, cy);
  }
}

/**
 * Render lap counters near each car on the track.
 */
export function renderLapCounters(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  cars: CarState[],
  camera: CameraState,
  lapTarget: number,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): void {
  for (const car of cars) {
    const space = layout.spaces[car.position];
    if (!space) continue;

    const spotPos = car.spot === 'raceLine' ? space.raceLine : space.offLine;
    const screenPos = worldToScreen(camera, spotPos);

    // Position the lap counter above the car
    const labelY = screenPos.y - config.carRadius * camera.zoom - 10;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    roundRect(ctx, screenPos.x - 16, labelY - 8, 32, 16, 4);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${car.lapCount}/${lapTarget}`, screenPos.x, labelY);
  }
}

/**
 * Render a tooltip for a hovered space (shows corner info).
 */
export function renderSpaceTooltip(
  ctx: CanvasRenderingContext2D,
  space: SpaceLayout,
  screenX: number,
  screenY: number,
): void {
  if (!space.isCorner) return;

  const text = `Corner ${space.cornerId} — Speed Limit: ${space.cornerSpeedLimit}`;
  ctx.font = '13px sans-serif';
  const metrics = ctx.measureText(text);
  const width = metrics.width + 20;
  const height = 28;
  const x = screenX + 12;
  const y = screenY - height - 4;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  roundRect(ctx, x, y, width, height, 6);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 6);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 10, y + height / 2);
}

/**
 * Render slipstream visual indicator between two cars.
 */
export function renderSlipstreamIndicator(
  ctx: CanvasRenderingContext2D,
  layout: TrackLayout,
  camera: CameraState,
  behindPosition: number,
  aheadPosition: number,
  color: string,
): void {
  const behind = worldToScreen(camera, layout.pathPoints[behindPosition]);
  const ahead = worldToScreen(camera, layout.pathPoints[aheadPosition]);

  // Dashed line between the two positions
  ctx.beginPath();
  ctx.moveTo(behind.x, behind.y);
  ctx.lineTo(ahead.x, ahead.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;

  // Arrow at the ahead position
  const angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
  const arrowSize = 8;
  ctx.beginPath();
  ctx.moveTo(ahead.x, ahead.y);
  ctx.lineTo(
    ahead.x - arrowSize * Math.cos(angle - Math.PI / 6),
    ahead.y - arrowSize * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    ahead.x - arrowSize * Math.cos(angle + Math.PI / 6),
    ahead.y - arrowSize * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

/** Helper: draw a rounded rectangle path. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Convert game phase to display info.
 */
export function getPhaseDisplay(phase: string, isMyTurn: boolean): PhaseDisplay {
  return {
    name: PHASE_LABELS[phase] ?? phase,
    description: phase,
    isActive: isMyTurn,
  };
}
