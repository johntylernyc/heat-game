/**
 * Game Board: main orchestrator for the track rendering and car movement UI.
 *
 * Creates a Canvas element, manages the render loop, and coordinates
 * track rendering, car rendering, animations, camera, and overlays.
 */

import type { TrackData } from '../track/types.js';
import type {
  BoardConfig,
  CameraState,
  CarState,
  StandingEntry,
  SpaceLayout,
  TrackLayout,
  VisualTheme,
} from './types.js';
import { DEFAULT_BOARD_CONFIG, PLAYER_COLORS } from './types.js';
import { generateTrackLayout } from './track-layout.js';
import {
  createCamera,
  fitToTrack,
  attachCameraControls,
} from './camera.js';
import { renderTrack, hitTestSpace } from './track-renderer.js';
import { renderCars, renderCarAtPosition } from './car-renderer.js';
import { AnimationManager } from './animation.js';
import {
  renderStandings,
  renderPhaseIndicator,
  renderTurnOrder,
  renderLapCounters,
  renderSpaceTooltip,
  renderSlipstreamIndicator,
  getPhaseDisplay,
} from './overlay.js';
import { getVisualTheme } from './visual-themes.js';

export interface BoardState {
  cars: CarState[];
  phase: string;
  round: number;
  activePlayerIndex: number;
  turnOrder: number[];
  lapTarget: number;
  standings: StandingEntry[];
  myPlayerIndex: number;
  /** Slipstream indicator: [behindPosition, aheadPosition, color] or null. */
  slipstream: [number, number, string] | null;
}

export interface GameBoard {
  /** Update the board with new game state. */
  update(state: BoardState): void;
  /** Trigger a move animation for a player. */
  animateMove(playerId: string, from: number, to: number): void;
  /** Trigger a spinout animation for a player. */
  animateSpinout(playerId: string, cornerPos: number, slideBack: number): void;
  /** Resize the board to fit the container. */
  resize(width: number, height: number): void;
  /** Destroy the board and clean up resources. */
  destroy(): void;
  /** Get the canvas element. */
  getCanvas(): HTMLCanvasElement;
  /** Get the current track layout. */
  getLayout(): TrackLayout;
}

/**
 * Create a game board instance attached to a container element.
 */
export function createGameBoard(
  container: HTMLElement,
  trackData: TrackData,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): GameBoard {
  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  // Generate track layout
  const layout = generateTrackLayout(trackData, config);

  // Visual theme
  const theme: VisualTheme = getVisualTheme(trackData.country);

  // Camera
  let camera: CameraState = createCamera();

  // Animation
  const animations = new AnimationManager();

  // State
  let currentState: BoardState = {
    cars: [],
    phase: 'setup',
    round: 0,
    activePlayerIndex: -1,
    turnOrder: [],
    lapTarget: 1,
    standings: [],
    myPlayerIndex: -1,
    slipstream: null,
  };

  // Hover state
  let hoveredSpace: SpaceLayout | null = null;
  let mouseX = 0;
  let mouseY = 0;

  // Render scheduling
  let needsRender = true;
  let renderFrameId = 0;

  function requestRender() {
    needsRender = true;
    if (!renderFrameId) {
      renderFrameId = requestAnimationFrame(renderLoop);
    }
  }

  function renderLoop() {
    renderFrameId = 0;
    if (needsRender || animations.hasActiveAnimations()) {
      render();
      needsRender = false;
    }
    if (animations.hasActiveAnimations()) {
      renderFrameId = requestAnimationFrame(renderLoop);
    }
  }

  // Animation frame callback
  animations.setFrameCallback(requestRender);

  // Camera controls
  const cleanupCamera = attachCameraControls(
    canvas,
    () => camera,
    (c) => { camera = c; },
    requestRender,
  );

  // Mouse hover for tooltips
  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    const space = hitTestSpace(layout, camera, mouseX, mouseY, config);
    if (space !== hoveredSpace) {
      hoveredSpace = space;
      requestRender();
    }
  }
  canvas.addEventListener('mousemove', onMouseMove);

  // Initial sizing
  function resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera = fitToTrack(layout, width, height);
    requestRender();
  }

  // Use container dimensions
  const containerRect = container.getBoundingClientRect();
  resize(containerRect.width, containerRect.height);

  // Responsive resize
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        resize(width, height);
      }
    }
  });
  resizeObserver.observe(container);

  /** Main render function. */
  function render() {
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background (themed if available, else default)
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Track (with visual theme)
    renderTrack(ctx, layout, camera, config, theme);

    // Cars
    const { cars } = currentState;
    const activePlayerId = currentState.activePlayerIndex >= 0 && currentState.activePlayerIndex < cars.length
      ? cars[currentState.activePlayerIndex]?.playerId ?? null
      : null;

    // Render non-animating cars normally
    const staticCars = cars.filter(c => !animations.isAnimating(c.playerId));
    renderCars(ctx, layout, staticCars, camera, activePlayerId, config);

    // Render animating cars at their animated positions
    for (const car of cars) {
      const animPos = animations.getAnimatedPosition(car.playerId, layout);
      if (animPos) {
        renderCarAtPosition(
          ctx, animPos, car, camera,
          car.playerId === activePlayerId, config,
        );
      }
    }

    // Slipstream indicator
    if (currentState.slipstream) {
      const [behind, ahead, color] = currentState.slipstream;
      renderSlipstreamIndicator(ctx, layout, camera, behind, ahead, color);
    }

    // Lap counters
    renderLapCounters(ctx, layout, staticCars, camera, currentState.lapTarget, config);

    // Overlays (screen-space, not affected by camera)
    const phaseDisplay = getPhaseDisplay(
      currentState.phase,
      currentState.activePlayerIndex === currentState.myPlayerIndex,
    );
    renderPhaseIndicator(ctx, phaseDisplay, currentState.round);

    if (currentState.standings.length > 0) {
      renderStandings(ctx, currentState.standings, width);
    }

    if (currentState.turnOrder.length > 0) {
      renderTurnOrder(
        ctx, cars, currentState.turnOrder,
        currentState.activePlayerIndex, width,
      );
    }

    // Tooltip
    if (hoveredSpace) {
      renderSpaceTooltip(ctx, hoveredSpace, mouseX, mouseY);
    }
  }

  return {
    update(state: BoardState) {
      currentState = state;
      requestRender();
    },

    animateMove(playerId: string, from: number, to: number) {
      animations.animateMove(playerId, from, to, config.moveDurationMs);
    },

    animateSpinout(playerId: string, cornerPos: number, slideBack: number) {
      animations.animateSpinout(playerId, cornerPos, slideBack, config.spinoutDurationMs);
    },

    resize,

    destroy() {
      animations.clear();
      cleanupCamera();
      canvas.removeEventListener('mousemove', onMouseMove);
      resizeObserver.disconnect();
      if (renderFrameId) cancelAnimationFrame(renderFrameId);
      container.removeChild(canvas);
    },

    getCanvas() { return canvas; },
    getLayout() { return layout; },
  };
}

/**
 * Build CarState array from client game state.
 * Maps player data to rendering-ready car states with colors.
 */
export function buildCarStates(
  selfPlayer: { id: string; position: number; lapCount: number; gear: number; speed: number },
  opponents: Array<{ id: string; position: number; lapCount: number; gear: number; speed: number }>,
  playerIndex: number,
  totalPlayers: number,
): CarState[] {
  const cars: CarState[] = [];

  // Self
  cars.push({
    playerId: selfPlayer.id,
    color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
    position: selfPlayer.position,
    spot: 'raceLine', // Default to raceLine; the engine doesn't track spot
    lapCount: selfPlayer.lapCount,
    gear: selfPlayer.gear,
    speed: selfPlayer.speed,
  });

  // Opponents
  let opponentColorIdx = 0;
  for (const opp of opponents) {
    // Skip our own color index
    let colorIdx = opponentColorIdx;
    if (colorIdx >= playerIndex) colorIdx++;
    cars.push({
      playerId: opp.id,
      color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
      position: opp.position,
      spot: 'raceLine',
      lapCount: opp.lapCount,
      gear: opp.gear,
      speed: opp.speed,
    });
    opponentColorIdx++;
  }

  return cars;
}

/**
 * Build standings from car states, sorted by lap count then position.
 */
export function buildStandings(cars: CarState[]): StandingEntry[] {
  const sorted = [...cars].sort((a, b) => {
    if (b.lapCount !== a.lapCount) return b.lapCount - a.lapCount;
    return b.position - a.position;
  });

  return sorted.map((car, i) => ({
    rank: i + 1,
    playerId: car.playerId,
    color: car.color,
    lapCount: car.lapCount,
    position: car.position,
    gear: car.gear,
  }));
}
