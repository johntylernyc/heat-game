import { describe, it, expect } from 'vitest';
import {
  createCamera,
  fitToTrack,
  worldToScreen,
  screenToWorld,
  zoomAt,
  pan,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../camera.js';
import { generateTrackLayout } from '../track-layout.js';
import { usaTrack } from '../../track/tracks/usa.js';
import type { CameraState, Point } from '../types.js';

describe('createCamera', () => {
  it('creates a camera with default values', () => {
    const cam = createCamera();
    expect(cam.offsetX).toBe(0);
    expect(cam.offsetY).toBe(0);
    expect(cam.zoom).toBe(1.0);
  });
});

describe('fitToTrack', () => {
  it('fits the track within canvas dimensions', () => {
    const layout = generateTrackLayout(usaTrack);
    const cam = fitToTrack(layout, 1024, 768);
    expect(cam.zoom).toBeGreaterThan(0);
    expect(Number.isFinite(cam.offsetX)).toBe(true);
    expect(Number.isFinite(cam.offsetY)).toBe(true);
  });

  it('centers the track in the canvas', () => {
    const layout = generateTrackLayout(usaTrack);
    const cam = fitToTrack(layout, 1024, 768);

    // The center of the track should map to roughly the center of the canvas
    const screenCenter = worldToScreen(cam, layout.center);
    expect(Math.abs(screenCenter.x - 512)).toBeLessThan(100);
    expect(Math.abs(screenCenter.y - 384)).toBeLessThan(100);
  });

  it('respects padding', () => {
    const layout = generateTrackLayout(usaTrack);
    const cam = fitToTrack(layout, 800, 600, 100);

    // All track points should be within the padded area
    for (const p of layout.pathPoints) {
      const screen = worldToScreen(cam, p);
      expect(screen.x).toBeGreaterThan(-50);
      expect(screen.x).toBeLessThan(850);
      expect(screen.y).toBeGreaterThan(-50);
      expect(screen.y).toBeLessThan(650);
    }
  });
});

describe('worldToScreen / screenToWorld', () => {
  it('roundtrips correctly', () => {
    const cam: CameraState = { offsetX: 100, offsetY: 50, zoom: 2.0 };
    const world: Point = { x: 300, y: 200 };

    const screen = worldToScreen(cam, world);
    const back = screenToWorld(cam, screen);

    expect(Math.abs(back.x - world.x)).toBeLessThan(0.001);
    expect(Math.abs(back.y - world.y)).toBeLessThan(0.001);
  });

  it('applies zoom and offset correctly', () => {
    const cam: CameraState = { offsetX: 10, offsetY: 20, zoom: 2.0 };
    const world: Point = { x: 5, y: 5 };

    const screen = worldToScreen(cam, world);
    expect(screen.x).toBe(5 * 2.0 + 10); // 20
    expect(screen.y).toBe(5 * 2.0 + 20); // 30
  });

  it('identity at zoom 1, offset 0', () => {
    const cam: CameraState = { offsetX: 0, offsetY: 0, zoom: 1.0 };
    const world: Point = { x: 42, y: 99 };
    const screen = worldToScreen(cam, world);
    expect(screen.x).toBe(42);
    expect(screen.y).toBe(99);
  });
});

describe('zoomAt', () => {
  it('changes zoom level', () => {
    const cam = createCamera();
    const result = zoomAt(cam, { x: 400, y: 300 }, 0.5);
    expect(result.zoom).toBe(1.5);
  });

  it('preserves the screen point position', () => {
    const cam: CameraState = { offsetX: 100, offsetY: 50, zoom: 1.0 };
    const screenPoint: Point = { x: 400, y: 300 };

    // World point under the cursor before zoom
    const worldBefore = screenToWorld(cam, screenPoint);

    // Zoom in
    const newCam = zoomAt(cam, screenPoint, 0.5);

    // Same world point should still be under the cursor
    const screenAfter = worldToScreen(newCam, worldBefore);
    expect(Math.abs(screenAfter.x - screenPoint.x)).toBeLessThan(0.01);
    expect(Math.abs(screenAfter.y - screenPoint.y)).toBeLessThan(0.01);
  });

  it('clamps zoom to MIN_ZOOM', () => {
    const cam: CameraState = { offsetX: 0, offsetY: 0, zoom: 0.4 };
    const result = zoomAt(cam, { x: 0, y: 0 }, -0.5);
    expect(result.zoom).toBe(MIN_ZOOM);
  });

  it('clamps zoom to MAX_ZOOM', () => {
    const cam: CameraState = { offsetX: 0, offsetY: 0, zoom: 2.9 };
    const result = zoomAt(cam, { x: 0, y: 0 }, 0.5);
    expect(result.zoom).toBe(MAX_ZOOM);
  });
});

describe('pan', () => {
  it('moves the camera by delta', () => {
    const cam: CameraState = { offsetX: 10, offsetY: 20, zoom: 1.0 };
    const result = pan(cam, 5, -3);
    expect(result.offsetX).toBe(15);
    expect(result.offsetY).toBe(17);
    expect(result.zoom).toBe(1.0); // Zoom unchanged
  });
});
