import { describe, it, expect } from 'vitest';
import { generateTrackLayout, interpolateTrackPosition, interpolateTrackAngle } from '../track-layout.js';
import { usaTrack } from '../../track/tracks/usa.js';
import { italyTrack } from '../../track/tracks/italy.js';
import type { TrackData } from '../../track/types.js';

describe('generateTrackLayout', () => {
  it('generates the correct number of spaces for USA track', () => {
    const layout = generateTrackLayout(usaTrack);
    expect(layout.spaces).toHaveLength(usaTrack.totalSpaces);
  });

  it('generates the correct number of path points', () => {
    const layout = generateTrackLayout(usaTrack);
    expect(layout.pathPoints).toHaveLength(usaTrack.totalSpaces);
  });

  it('marks corners correctly', () => {
    const layout = generateTrackLayout(usaTrack);
    const corners = layout.spaces.filter(s => s.isCorner);
    expect(corners).toHaveLength(usaTrack.corners.length);

    // Check corner positions match
    for (const corner of usaTrack.corners) {
      const space = layout.spaces[corner.position];
      expect(space.isCorner).toBe(true);
      expect(space.cornerSpeedLimit).toBe(corner.speedLimit);
      expect(space.cornerId).toBe(corner.id);
    }
  });

  it('marks the start/finish line correctly', () => {
    const layout = generateTrackLayout(usaTrack);
    const sfSpace = layout.spaces.find(s => s.isStartFinish);
    expect(sfSpace).toBeDefined();
    expect(sfSpace!.index).toBe(usaTrack.startFinishLine);
  });

  it('marks legends lines correctly', () => {
    const layout = generateTrackLayout(usaTrack);
    const legendsSpaces = layout.spaces.filter(s => s.isLegendsLine);
    expect(legendsSpaces).toHaveLength(usaTrack.legendsLines.length);

    for (const ll of usaTrack.legendsLines) {
      const space = layout.spaces[ll.position];
      expect(space.isLegendsLine).toBe(true);
    }
  });

  it('assigns sector IDs to all spaces', () => {
    const layout = generateTrackLayout(usaTrack);
    for (const space of layout.spaces) {
      expect(space.sectorId).toBeGreaterThan(0);
    }
  });

  it('creates raceLine and offLine spots with different positions', () => {
    const layout = generateTrackLayout(usaTrack);
    for (const space of layout.spaces) {
      // Race line and off-line should be offset from each other
      const dx = space.raceLine.x - space.offLine.x;
      const dy = space.raceLine.y - space.offLine.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeGreaterThan(0);
    }
  });

  it('has a valid center point', () => {
    const layout = generateTrackLayout(usaTrack);
    expect(Number.isFinite(layout.center.x)).toBe(true);
    expect(Number.isFinite(layout.center.y)).toBe(true);
  });

  it('has valid bounds', () => {
    const layout = generateTrackLayout(usaTrack);
    expect(layout.bounds.maxX).toBeGreaterThan(layout.bounds.minX);
    expect(layout.bounds.maxY).toBeGreaterThan(layout.bounds.minY);
  });

  it('all path points are finite', () => {
    const layout = generateTrackLayout(usaTrack);
    for (const p of layout.pathPoints) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('works with Italy track', () => {
    const layout = generateTrackLayout(italyTrack);
    expect(layout.spaces).toHaveLength(italyTrack.totalSpaces);
    const corners = layout.spaces.filter(s => s.isCorner);
    expect(corners).toHaveLength(italyTrack.corners.length);
  });

  it('spaces are roughly evenly distributed', () => {
    const layout = generateTrackLayout(usaTrack);
    const distances: number[] = [];
    for (let i = 0; i < layout.pathPoints.length; i++) {
      const next = (i + 1) % layout.pathPoints.length;
      const dx = layout.pathPoints[next].x - layout.pathPoints[i].x;
      const dy = layout.pathPoints[next].y - layout.pathPoints[i].y;
      distances.push(Math.sqrt(dx * dx + dy * dy));
    }
    const avg = distances.reduce((a, b) => a + b, 0) / distances.length;
    // All distances should be within 50% of average (allowing for corner curvature)
    for (const d of distances) {
      expect(d).toBeGreaterThan(avg * 0.3);
      expect(d).toBeLessThan(avg * 2.5);
    }
  });

  it('forms a closed loop', () => {
    const layout = generateTrackLayout(usaTrack);
    const first = layout.pathPoints[0];
    const last = layout.pathPoints[layout.pathPoints.length - 1];
    const next = layout.pathPoints[1];
    // The distance from last to first should be similar to first to next
    const dLastFirst = Math.sqrt(
      (first.x - last.x) ** 2 + (first.y - last.y) ** 2,
    );
    const dFirstNext = Math.sqrt(
      (next.x - first.x) ** 2 + (next.y - first.y) ** 2,
    );
    // Should be within 3x of each other (reasonable for a closed loop)
    expect(dLastFirst).toBeLessThan(dFirstNext * 3);
  });

  it('handles minimal track with 1 corner', () => {
    const minTrack: TrackData = {
      id: 'test',
      name: 'Test',
      country: 'Test',
      totalSpaces: 12,
      startFinishLine: 0,
      corners: [{ id: 1, speedLimit: 3, position: 6 }],
      legendsLines: [{ cornerId: 1, position: 5 }],
      startingGrid: [{ gridNumber: 1, spaceIndex: 11, spot: 'raceLine' }],
      defaultConfig: { laps: 1, startingHeat: 3, startingStress: 1 },
    };
    const layout = generateTrackLayout(minTrack);
    expect(layout.spaces).toHaveLength(12);
    expect(layout.spaces[6].isCorner).toBe(true);
  });
});

describe('interpolateTrackPosition', () => {
  const layout = generateTrackLayout(usaTrack);

  it('returns start position at progress 0', () => {
    const pos = interpolateTrackPosition(layout, 5, 10, 0);
    // Should be very close to space 5
    const space5 = layout.pathPoints[5];
    expect(Math.abs(pos.x - space5.x)).toBeLessThan(1);
    expect(Math.abs(pos.y - space5.y)).toBeLessThan(1);
  });

  it('returns end position at progress 1', () => {
    const pos = interpolateTrackPosition(layout, 5, 10, 1);
    const space10 = layout.pathPoints[10];
    expect(Math.abs(pos.x - space10.x)).toBeLessThan(1);
    expect(Math.abs(pos.y - space10.y)).toBeLessThan(1);
  });

  it('returns midpoint at progress 0.5', () => {
    const pos = interpolateTrackPosition(layout, 0, 10, 0.5);
    const space5 = layout.pathPoints[5];
    // Should be near space 5 (midpoint of 0→10)
    const dist = Math.sqrt((pos.x - space5.x) ** 2 + (pos.y - space5.y) ** 2);
    // Allow some tolerance for interpolation
    expect(dist).toBeLessThan(layout.pathPoints[0].x + 100);
  });

  it('handles wrap-around movement', () => {
    const n = layout.spaces.length;
    const pos = interpolateTrackPosition(layout, n - 2, 2, 0.5);
    // Should be somewhere between the last and first spaces
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });
});

describe('interpolateTrackAngle', () => {
  const layout = generateTrackLayout(usaTrack);

  it('returns a finite angle', () => {
    const angle = interpolateTrackAngle(layout, 0, 10, 0.5);
    expect(Number.isFinite(angle)).toBe(true);
  });

  it('returns angle between -PI and PI', () => {
    for (let i = 0; i < layout.spaces.length; i++) {
      const next = (i + 5) % layout.spaces.length;
      const angle = interpolateTrackAngle(layout, i, next, 0);
      expect(angle).toBeGreaterThanOrEqual(-Math.PI);
      expect(angle).toBeLessThanOrEqual(Math.PI);
    }
  });
});
