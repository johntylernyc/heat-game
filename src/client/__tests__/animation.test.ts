import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  easeInOutCubic,
  easeOutQuad,
  createMoveAnimation,
  createSpinoutAnimation,
  updateAnimation,
  getMoveAnimationPosition,
  getSpinoutAnimationPosition,
} from '../animation.js';
import { generateTrackLayout } from '../track-layout.js';
import { usaTrack } from '../../track/tracks/usa.js';

describe('easeInOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('returns 0.5 at t=0.5', () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const val = easeInOutCubic(t);
      expect(val).toBeGreaterThanOrEqual(prev - 0.001);
      prev = val;
    }
  });
});

describe('easeOutQuad', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutQuad(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeOutQuad(1)).toBe(1);
  });

  it('decelerates (second half slower)', () => {
    const first = easeOutQuad(0.5) - easeOutQuad(0);
    const second = easeOutQuad(1) - easeOutQuad(0.5);
    expect(first).toBeGreaterThan(second);
  });
});

describe('createMoveAnimation', () => {
  it('creates animation with correct initial state', () => {
    const anim = createMoveAnimation('player1', 5, 15, 600);
    expect(anim.playerId).toBe('player1');
    expect(anim.fromPosition).toBe(5);
    expect(anim.toPosition).toBe(15);
    expect(anim.progress).toBe(0);
    expect(anim.duration).toBe(600);
    expect(anim.startTime).toBeGreaterThan(0);
  });
});

describe('createSpinoutAnimation', () => {
  it('creates spinout with correct initial state', () => {
    const anim = createSpinoutAnimation('player1', 16, 3, 800);
    expect(anim.playerId).toBe('player1');
    expect(anim.cornerPosition).toBe(16);
    expect(anim.slideBack).toBe(3);
    expect(anim.progress).toBe(0);
    expect(anim.duration).toBe(800);
  });
});

describe('updateAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true while in progress', () => {
    const anim = createMoveAnimation('p1', 0, 10, 1000);
    vi.advanceTimersByTime(500);
    const still = updateAnimation(anim);
    expect(still).toBe(true);
    expect(anim.progress).toBeCloseTo(0.5, 1);
  });

  it('returns false when complete', () => {
    const anim = createMoveAnimation('p1', 0, 10, 1000);
    vi.advanceTimersByTime(1500);
    const still = updateAnimation(anim);
    expect(still).toBe(false);
    expect(anim.progress).toBe(1);
  });

  it('clamps progress to 1', () => {
    const anim = createMoveAnimation('p1', 0, 10, 100);
    vi.advanceTimersByTime(500);
    updateAnimation(anim);
    expect(anim.progress).toBe(1);
  });
});

describe('getMoveAnimationPosition', () => {
  const layout = generateTrackLayout(usaTrack);

  it('returns start position at progress 0', () => {
    const anim = createMoveAnimation('p1', 5, 15, 1000);
    anim.progress = 0;
    const pos = getMoveAnimationPosition(anim, layout);
    const expected = layout.pathPoints[5];
    // At progress 0, eased progress is also 0
    expect(Math.abs(pos.x - expected.x)).toBeLessThan(1);
    expect(Math.abs(pos.y - expected.y)).toBeLessThan(1);
  });

  it('returns end position at progress 1', () => {
    const anim = createMoveAnimation('p1', 5, 15, 1000);
    anim.progress = 1;
    const pos = getMoveAnimationPosition(anim, layout);
    const expected = layout.pathPoints[15];
    expect(Math.abs(pos.x - expected.x)).toBeLessThan(1);
    expect(Math.abs(pos.y - expected.y)).toBeLessThan(1);
  });

  it('returns a point between start and end at mid-progress', () => {
    const anim = createMoveAnimation('p1', 0, 20, 1000);
    anim.progress = 0.5;
    const pos = getMoveAnimationPosition(anim, layout);
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });
});

describe('getSpinoutAnimationPosition', () => {
  const layout = generateTrackLayout(usaTrack);

  it('returns a valid position in phase 1', () => {
    const anim = createSpinoutAnimation('p1', 16, 3, 1000);
    anim.progress = 0.2;
    const pos = getSpinoutAnimationPosition(anim, layout);
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });

  it('returns a valid position in phase 2', () => {
    const anim = createSpinoutAnimation('p1', 16, 3, 1000);
    anim.progress = 0.7;
    const pos = getSpinoutAnimationPosition(anim, layout);
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });

  it('returns valid positions at boundaries', () => {
    const anim = createSpinoutAnimation('p1', 16, 3, 1000);

    anim.progress = 0;
    let pos = getSpinoutAnimationPosition(anim, layout);
    expect(Number.isFinite(pos.x)).toBe(true);

    anim.progress = 0.4;
    pos = getSpinoutAnimationPosition(anim, layout);
    expect(Number.isFinite(pos.x)).toBe(true);

    anim.progress = 1;
    pos = getSpinoutAnimationPosition(anim, layout);
    expect(Number.isFinite(pos.x)).toBe(true);
  });
});
