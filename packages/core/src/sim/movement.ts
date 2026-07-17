/**
 * Sublight movement and arc-drive rules (docs 05 §7, 10 §5). Server cells and
 * client prediction share this one implementation.
 */

import { add, dist, len, norm, scale, sub, V0, vec, type Vec3 } from '../kernel/vec.js';
import type { EntityId } from '../kernel/ids.js';

export type MovementOrder =
  | { readonly kind: 'hold' }
  | { readonly kind: 'moveTo'; readonly dest: Vec3 }
  | { readonly kind: 'approach'; readonly targetId: EntityId }
  | { readonly kind: 'orbit'; readonly targetId: EntityId; readonly rangeM: number };

export interface MobileState {
  pos: Vec3;
  vel: Vec3;
}

export interface MovementParams {
  readonly maxVelocity: number;
  /** Inertia time constant (seconds); velocity converges exponentially. */
  readonly agility: number;
  /** Stasis effects multiply commanded speed. */
  readonly velocityMul: number;
}

/** Resolve the desired velocity vector for an order. */
export function desiredVelocity(
  state: MobileState,
  order: MovementOrder,
  params: MovementParams,
  targetPos: (id: EntityId) => Vec3 | undefined,
): Vec3 {
  const speed = params.maxVelocity * params.velocityMul;
  switch (order.kind) {
    case 'hold':
      return V0;
    case 'moveTo': {
      const to = sub(order.dest, state.pos);
      const d = len(to);
      if (d < 50) return V0;
      // Ease into the destination to avoid orbit-overshoot jitter.
      const cruise = Math.min(speed, Math.max(d / 4, speed * 0.1));
      return scale(norm(to), cruise);
    }
    case 'approach': {
      const t = targetPos(order.targetId);
      if (!t) return V0;
      const to = sub(t, state.pos);
      if (len(to) < 500) return V0;
      return scale(norm(to), speed);
    }
    case 'orbit': {
      const t = targetPos(order.targetId);
      if (!t) return V0;
      const rel = sub(state.pos, t);
      const d = len(rel);
      if (d < 1) return scale(vec(1, 0, 0), speed);
      const radial = norm(rel);
      // Tangent in the horizontal plane; fall back for polar alignment.
      const up = Math.abs(radial.z) > 0.99 ? vec(1, 0, 0) : vec(0, 0, 1);
      const tangent = norm(vec(
        radial.y * up.z - radial.z * up.y,
        radial.z * up.x - radial.x * up.z,
        radial.x * up.y - radial.y * up.x,
      ));
      // Blend tangential motion with a radial correction toward the ring.
      const radialError = (d - order.rangeM) / Math.max(order.rangeM, 1);
      const correction = scale(radial, -Math.max(-1, Math.min(1, radialError)));
      return scale(norm(add(tangent, correction)), speed);
    }
  }
}

/** Integrate one tick: velocity converges exponentially toward desired. */
export function stepMovement(
  state: MobileState,
  order: MovementOrder,
  params: MovementParams,
  dtSec: number,
  targetPos: (id: EntityId) => Vec3 | undefined,
): void {
  const desired = desiredVelocity(state, order, params, targetPos);
  const blend = 1 - Math.exp(-dtSec / Math.max(params.agility, 0.1));
  state.vel = add(state.vel, scale(sub(desired, state.vel), blend));
  state.pos = add(state.pos, scale(state.vel, dtSec));
}

/** Arc-drive constants (doc 05 §7). */
export const ARC_MIN_DISTANCE_M = 150_000;
/** Ships arrive slightly short of the beacon, on the approach vector. */
export const ARC_ARRIVAL_OFFSET_M = 5_000;

export function arcSpoolSec(agility: number): number {
  return 2 + agility;
}

/** Compute the arrival position for an arc jump. */
export function arcArrivalPos(from: Vec3, to: Vec3): Vec3 {
  const back = norm(sub(from, to));
  return add(to, scale(back, ARC_ARRIVAL_OFFSET_M));
}

export function canArc(from: Vec3, to: Vec3): boolean {
  return dist(from, to) >= ARC_MIN_DISTANCE_M;
}
