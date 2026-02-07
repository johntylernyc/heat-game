/**
 * Animation system for car movement on the game board.
 *
 * Handles:
 * - Smooth movement along the track path
 * - Spinout animation (car slides backward)
 * - Slipstream visual indicator
 * - Easing functions for natural-looking motion
 */

import type {
  MoveAnimation,
  SpinoutAnimation,
  TrackLayout,
  Point,
} from './types.js';
import { DEFAULT_BOARD_CONFIG } from './types.js';
import { interpolateTrackPosition, interpolateTrackAngle } from './track-layout.js';

/** Easing: ease-in-out cubic for natural acceleration/deceleration. */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Easing: ease-out for deceleration (spinout). */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Create a movement animation. */
export function createMoveAnimation(
  playerId: string,
  fromPosition: number,
  toPosition: number,
  duration: number = DEFAULT_BOARD_CONFIG.moveDurationMs,
): MoveAnimation {
  return {
    playerId,
    fromPosition,
    toPosition,
    progress: 0,
    duration,
    startTime: Date.now(),
  };
}

/** Create a spinout animation (car slides backward from corner). */
export function createSpinoutAnimation(
  playerId: string,
  cornerPosition: number,
  slideBack: number,
  duration: number = DEFAULT_BOARD_CONFIG.spinoutDurationMs,
): SpinoutAnimation {
  return {
    playerId,
    cornerPosition,
    slideBack,
    progress: 0,
    duration,
    startTime: Date.now(),
  };
}

/**
 * Update animation progress based on elapsed time.
 * Returns true if animation is still in progress.
 */
export function updateAnimation(anim: MoveAnimation | SpinoutAnimation): boolean {
  const elapsed = Date.now() - anim.startTime;
  anim.progress = Math.min(1, elapsed / anim.duration);
  return anim.progress < 1;
}

/**
 * Get the current world position for a move animation.
 */
export function getMoveAnimationPosition(
  anim: MoveAnimation,
  layout: TrackLayout,
): Point {
  const easedProgress = easeInOutCubic(anim.progress);
  return interpolateTrackPosition(
    layout,
    anim.fromPosition,
    anim.toPosition,
    easedProgress,
  );
}

/**
 * Get the current world position for a spinout animation.
 *
 * Phase 1 (0-0.4): Car advances to corner position
 * Phase 2 (0.4-1.0): Car slides backward from corner
 */
export function getSpinoutAnimationPosition(
  anim: SpinoutAnimation,
  layout: TrackLayout,
): Point {
  const n = layout.spaces.length;

  if (anim.progress < 0.4) {
    // Phase 1: advance to corner
    const subProgress = easeInOutCubic(anim.progress / 0.4);
    return interpolateTrackPosition(
      layout,
      anim.cornerPosition,
      anim.cornerPosition,
      subProgress,
    );
  }

  // Phase 2: slide backward
  const subProgress = easeOutQuad((anim.progress - 0.4) / 0.6);
  const slideDistance = anim.slideBack * subProgress;
  const backPosition = (anim.cornerPosition - Math.round(slideDistance) + n) % n;

  return interpolateTrackPosition(
    layout,
    anim.cornerPosition,
    backPosition,
    1,
  );
}

/**
 * Animation manager: tracks active animations and drives the render loop.
 */
export class AnimationManager {
  private moveAnimations: Map<string, MoveAnimation> = new Map();
  private spinoutAnimations: Map<string, SpinoutAnimation> = new Map();
  private animFrameId: number = 0;
  private onFrame: (() => void) | null = null;

  /** Set the callback invoked each animation frame. */
  setFrameCallback(cb: () => void): void {
    this.onFrame = cb;
  }

  /** Start a move animation for a player. */
  animateMove(
    playerId: string,
    fromPosition: number,
    toPosition: number,
    duration?: number,
  ): void {
    this.moveAnimations.set(
      playerId,
      createMoveAnimation(playerId, fromPosition, toPosition, duration),
    );
    this.startLoop();
  }

  /** Start a spinout animation for a player. */
  animateSpinout(
    playerId: string,
    cornerPosition: number,
    slideBack: number,
    duration?: number,
  ): void {
    this.spinoutAnimations.set(
      playerId,
      createSpinoutAnimation(playerId, cornerPosition, slideBack, duration),
    );
    this.startLoop();
  }

  /** Get the animated world position for a player, or null if not animating. */
  getAnimatedPosition(playerId: string, layout: TrackLayout): Point | null {
    const move = this.moveAnimations.get(playerId);
    if (move) {
      return getMoveAnimationPosition(move, layout);
    }

    const spinout = this.spinoutAnimations.get(playerId);
    if (spinout) {
      return getSpinoutAnimationPosition(spinout, layout);
    }

    return null;
  }

  /** Get the animated angle for a player, or null if not animating. */
  getAnimatedAngle(playerId: string, layout: TrackLayout): number | null {
    const move = this.moveAnimations.get(playerId);
    if (move) {
      return interpolateTrackAngle(layout, move.fromPosition, move.toPosition, easeInOutCubic(move.progress));
    }

    const spinout = this.spinoutAnimations.get(playerId);
    if (spinout) {
      const n = layout.spaces.length;
      if (spinout.progress < 0.4) {
        return layout.spaces[spinout.cornerPosition].angle;
      }
      const subProgress = easeOutQuad((spinout.progress - 0.4) / 0.6);
      const slideDistance = spinout.slideBack * subProgress;
      const backPosition = (spinout.cornerPosition - Math.round(slideDistance) + n) % n;
      // Spinout: add rotation for visual effect
      return layout.spaces[backPosition].angle + Math.PI * subProgress;
    }

    return null;
  }

  /** Check if a player is currently animating. */
  isAnimating(playerId: string): boolean {
    return this.moveAnimations.has(playerId) || this.spinoutAnimations.has(playerId);
  }

  /** Check if any animation is active. */
  hasActiveAnimations(): boolean {
    return this.moveAnimations.size > 0 || this.spinoutAnimations.size > 0;
  }

  /** Update all animations, removing completed ones. */
  update(): void {
    for (const [id, anim] of this.moveAnimations) {
      if (!updateAnimation(anim)) {
        this.moveAnimations.delete(id);
      }
    }
    for (const [id, anim] of this.spinoutAnimations) {
      if (!updateAnimation(anim)) {
        this.spinoutAnimations.delete(id);
      }
    }
  }

  /** Clear all animations. */
  clear(): void {
    this.moveAnimations.clear();
    this.spinoutAnimations.clear();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  private startLoop(): void {
    if (this.animFrameId) return;
    const loop = () => {
      this.update();
      this.onFrame?.();
      if (this.hasActiveAnimations()) {
        this.animFrameId = requestAnimationFrame(loop);
      } else {
        this.animFrameId = 0;
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }
}
