import { describe, expect, it } from 'vitest';
import {
  arcArrivalPos,
  ARC_MIN_DISTANCE_M,
  canArc,
  dist,
  entityId,
  len,
  stepMovement,
  vec,
  type MobileState,
  type MovementParams,
} from '../src/index.js';

const params: MovementParams = { maxVelocity: 300, agility: 3, velocityMul: 1 };
const noTargets = (): undefined => undefined;

describe('sublight movement', () => {
  it('moveTo converges on the destination and stops', () => {
    const state: MobileState = { pos: vec(0, 0, 0), vel: vec(0, 0, 0) };
    const dest = vec(30_000, 0, 0);
    for (let i = 0; i < 2000; i++) {
      stepMovement(state, { kind: 'moveTo', dest }, params, 0.25, noTargets);
    }
    expect(dist(state.pos, dest)).toBeLessThan(200);
    expect(len(state.vel)).toBeLessThan(30);
  });

  it('velocity never exceeds max', () => {
    const state: MobileState = { pos: vec(0, 0, 0), vel: vec(0, 0, 0) };
    for (let i = 0; i < 400; i++) {
      stepMovement(state, { kind: 'moveTo', dest: vec(1e7, 0, 0) }, params, 0.25, noTargets);
      expect(len(state.vel)).toBeLessThanOrEqual(params.maxVelocity + 1e-9);
    }
  });

  it('orbit holds near the commanded range', () => {
    const target = entityId('ent.target');
    const state: MobileState = { pos: vec(20_000, 0, 0), vel: vec(0, 0, 0) };
    const lookup = (id: typeof target): ReturnType<typeof vec> | undefined =>
      id === target ? vec(0, 0, 0) : undefined;
    for (let i = 0; i < 1500; i++) {
      stepMovement(state, { kind: 'orbit', targetId: target, rangeM: 5000 }, params, 0.25, lookup);
    }
    const r = len(state.pos);
    expect(r).toBeGreaterThan(3000);
    expect(r).toBeLessThan(8000);
    // Still moving: orbiting, not parked.
    expect(len(state.vel)).toBeGreaterThan(100);
  });

  it('stasis (velocityMul) slows commanded speed', () => {
    const state: MobileState = { pos: vec(0, 0, 0), vel: vec(0, 0, 0) };
    const webbed: MovementParams = { ...params, velocityMul: 0.5 };
    for (let i = 0; i < 200; i++) {
      stepMovement(state, { kind: 'moveTo', dest: vec(1e7, 0, 0) }, webbed, 0.25, noTargets);
    }
    expect(len(state.vel)).toBeLessThanOrEqual(150 + 1e-9);
  });
});

describe('arc drive', () => {
  it('requires minimum distance', () => {
    expect(canArc(vec(0, 0, 0), vec(ARC_MIN_DISTANCE_M - 1, 0, 0))).toBe(false);
    expect(canArc(vec(0, 0, 0), vec(ARC_MIN_DISTANCE_M, 0, 0))).toBe(true);
  });

  it('arrival lands short of the beacon on the approach vector', () => {
    const from = vec(0, 0, 0);
    const to = vec(1_000_000, 0, 0);
    const arrival = arcArrivalPos(from, to);
    expect(arrival.x).toBe(995_000);
    expect(dist(arrival, to)).toBeCloseTo(5000, 6);
  });
});
