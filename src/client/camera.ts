/**
 * Camera system for pan/zoom on the game board.
 *
 * Converts between world coordinates (track space) and screen coordinates
 * (canvas pixels). Supports mouse drag panning, scroll wheel zoom, and
 * touch gestures for tablet support.
 */

import type { CameraState, Point, TrackLayout } from './types.js';

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 3.0;
export const ZOOM_STEP = 0.1;

export function createCamera(): CameraState {
  return { offsetX: 0, offsetY: 0, zoom: 1.0 };
}

/**
 * Fit the camera to show the full track within the given canvas dimensions.
 */
export function fitToTrack(
  layout: TrackLayout,
  canvasWidth: number,
  canvasHeight: number,
  padding: number = 60,
): CameraState {
  const { bounds } = layout;
  const trackWidth = bounds.maxX - bounds.minX;
  const trackHeight = bounds.maxY - bounds.minY;

  const scaleX = (canvasWidth - 2 * padding) / trackWidth;
  const scaleY = (canvasHeight - 2 * padding) / trackHeight;
  const zoom = Math.min(scaleX, scaleY);

  // Center the track in the canvas
  const offsetX = canvasWidth / 2 - layout.center.x * zoom;
  const offsetY = canvasHeight / 2 - layout.center.y * zoom;

  return { offsetX, offsetY, zoom };
}

/** Convert a world point to screen (canvas) coordinates. */
export function worldToScreen(camera: CameraState, world: Point): Point {
  return {
    x: world.x * camera.zoom + camera.offsetX,
    y: world.y * camera.zoom + camera.offsetY,
  };
}

/** Convert a screen point to world coordinates. */
export function screenToWorld(camera: CameraState, screen: Point): Point {
  return {
    x: (screen.x - camera.offsetX) / camera.zoom,
    y: (screen.y - camera.offsetY) / camera.zoom,
  };
}

/** Apply a zoom change centered on a screen point. */
export function zoomAt(
  camera: CameraState,
  screenPoint: Point,
  delta: number,
): CameraState {
  const newZoom = clampZoom(camera.zoom + delta);
  const ratio = newZoom / camera.zoom;

  return {
    zoom: newZoom,
    offsetX: screenPoint.x - (screenPoint.x - camera.offsetX) * ratio,
    offsetY: screenPoint.y - (screenPoint.y - camera.offsetY) * ratio,
  };
}

/** Apply a pan (drag) offset. */
export function pan(camera: CameraState, dx: number, dy: number): CameraState {
  return {
    ...camera,
    offsetX: camera.offsetX + dx,
    offsetY: camera.offsetY + dy,
  };
}

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/**
 * Attach mouse/touch event handlers for camera interaction.
 * Returns a cleanup function to remove the listeners.
 */
export function attachCameraControls(
  canvas: HTMLCanvasElement,
  getCamera: () => CameraState,
  setCamera: (c: CameraState) => void,
  requestRender: () => void,
): () => void {
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  function onMouseDown(e: MouseEvent) {
    if (e.button === 0 || e.button === 1) {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    setCamera(pan(getCamera(), dx, dy));
    requestRender();
  }

  function onMouseUp() {
    isDragging = false;
    canvas.style.cursor = 'grab';
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const screenPoint: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setCamera(zoomAt(getCamera(), screenPoint, delta));
    requestRender();
  }

  // Touch support for tablet
  let lastTouchDist = 0;
  let lastTouchCenter: Point = { x: 0, y: 0 };

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      isDragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      lastTouchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  }

  function onTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      setCamera(pan(getCamera(), dx, dy));
      requestRender();
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const rect = canvas.getBoundingClientRect();
      const center: Point = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
      if (lastTouchDist > 0) {
        const scaleDelta = (dist - lastTouchDist) * 0.005;
        setCamera(zoomAt(getCamera(), center, scaleDelta));
        requestRender();
      }
      lastTouchDist = dist;
      lastTouchCenter = center;
    }
  }

  function onTouchEnd() {
    isDragging = false;
    lastTouchDist = 0;
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);

  canvas.style.cursor = 'grab';

  return () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('mouseleave', onMouseUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
  };
}
