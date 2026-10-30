import { Vector3 } from 'three';

/**
 * Facing convention: yaw θ means the body faces (sin θ, 0, cos θ).
 * This matches Object3D.rotation.y and Mixamo models (which face +Z at rest).
 * Local skill/ball paths use x = player's right, z = player's forward.
 */

export function forwardFromYaw(yaw: number, out: Vector3): Vector3 {
  return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}

export function rightFromYaw(yaw: number, out: Vector3): Vector3 {
  // forward × up
  return out.set(-Math.cos(yaw), 0, Math.sin(yaw));
}

/** Convert a local (x = right, z = forward) offset into world space, written into `out`. */
export function localToWorld(origin: Vector3, yaw: number, lx: number, lz: number, out: Vector3): Vector3 {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  // right = (-c, 0, s), forward = (s, 0, c)
  return out.set(origin.x - c * lx + s * lz, origin.y, origin.z + s * lx + c * lz);
}

export function yawFromDir(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Frame-rate independent smoothing factor for lerping toward a target. */
export function damp(sharpness: number, dt: number): number {
  return 1 - Math.exp(-sharpness * dt);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface Keyframe {
  /** normalised time 0..1 */
  t: number;
  x: number;
  z: number;
}

/** Sample a keyframed local path at normalised time t (linear with smoothstep easing per segment). */
export function samplePath(path: readonly Keyframe[], t: number, out: { x: number; z: number }): void {
  if (t <= path[0].t) {
    out.x = path[0].x;
    out.z = path[0].z;
    return;
  }
  for (let i = 1; i < path.length; i++) {
    const b = path[i];
    if (t <= b.t) {
      const a = path[i - 1];
      let u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      u = u * u * (3 - 2 * u);
      out.x = a.x + (b.x - a.x) * u;
      out.z = a.z + (b.z - a.z) * u;
      return;
    }
  }
  const last = path[path.length - 1];
  out.x = last.x;
  out.z = last.z;
}
