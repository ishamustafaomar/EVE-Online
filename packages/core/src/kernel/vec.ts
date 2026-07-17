/** Minimal immutable 3-vector math for simulation space (meters). */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const V0: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });

export function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len2(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function len(a: Vec3): number {
  return Math.sqrt(len2(a));
}

export function dist2(a: Vec3, b: Vec3): number {
  return len2(sub(a, b));
}

export function dist(a: Vec3, b: Vec3): number {
  return Math.sqrt(dist2(a, b));
}

/** Unit vector along `a`; returns V0 for the zero vector. */
export function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l === 0 ? V0 : scale(a, 1 / l);
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/**
 * Magnitude of the component of relative velocity perpendicular to the line of
 * sight, divided by distance — i.e. angular velocity in rad/s. Combat tracking
 * math (doc 05 §2) consumes this.
 */
export function angularVelocity(relPos: Vec3, relVel: Vec3): number {
  const d2 = len2(relPos);
  if (d2 === 0) return Infinity;
  const radial = scale(norm(relPos), dot(relVel, norm(relPos)));
  const tangential = sub(relVel, radial);
  return len(tangential) / Math.sqrt(d2);
}
