import {
  AnimationClip,
  AnimationMixer,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack,
  type Object3D,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Root motion measured from a clip, in the player's local frame at the start of the move:
 * x = right (m), z = forward (m), yaw = turn (rad, + = toward the right... same sign as game yaw).
 * The game replays this path on the body and the clip plays in place, so feet never slide.
 */
export interface Motion {
  duration: number;
  /** samples at 30 Hz */
  t: Float32Array;
  x: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
}

const HZ = 30;

/**
 * Measures the hips' ground path and facing over the clip (with the character scaled to size),
 * then removes both from the clip: hips x/z locked, hips yaw cancelled. Mutates `clip`.
 */
export function extractMotion(template: Object3D, scale: number, clip: AnimationClip): Motion | null {
  const hipsTrackPos = clip.tracks.find((t) => /Hips\.position$/.test(t.name));
  const hipsTrackRot = clip.tracks.find((t) => /Hips\.quaternion$/.test(t.name));
  if (!hipsTrackRot) return null;

  const body = cloneSkinned(template);
  body.scale.setScalar(scale);
  let hips: Object3D | null = null;
  body.traverse((o) => {
    if (!hips && /Hips$/.test(o.name)) hips = o;
  });
  if (!hips) return null;
  const h = hips as Object3D;
  const mixer = new AnimationMixer(body);
  mixer.clipAction(clip).play();

  const n = Math.max(2, Math.round(clip.duration * HZ) + 1);
  const m: Motion = {
    duration: clip.duration,
    t: new Float32Array(n),
    x: new Float32Array(n),
    z: new Float32Array(n),
    yaw: new Float32Array(n),
  };
  const p = new Vector3();
  const q = new Quaternion();
  const fwdLocal = new Vector3();
  const f = new Vector3();
  let x0 = 0;
  let z0 = 0;
  let prevYaw = 0;
  let unwrap = 0;
  for (let i = 0; i < n; i++) {
    // stop just short of the end: a looping action at exactly `duration` wraps to frame 0
    const t = Math.min(clip.duration * 0.9995, i / HZ);
    mixer.setTime(t);
    body.updateMatrixWorld(true);
    h.getWorldPosition(p);
    h.getWorldQuaternion(q);
    if (i === 0) {
      // which hips axis points where the character faces (+Z) at the start
      fwdLocal.set(0, 0, 1).applyQuaternion(q.clone().invert());
      x0 = p.x;
      z0 = p.z;
    }
    f.copy(fwdLocal).applyQuaternion(q);
    let yaw = Math.atan2(f.x, f.z);
    // unwrap so spins accumulate (roulette = ~2π)
    if (i > 0) {
      const d = yaw - prevYaw;
      if (d > Math.PI) unwrap -= 2 * Math.PI;
      else if (d < -Math.PI) unwrap += 2 * Math.PI;
    }
    prevYaw = yaw;
    yaw += unwrap;
    m.t[i] = t;
    m.x[i] = -(p.x - x0); // local right = -world x at yaw 0
    m.z[i] = p.z - z0;
    m.yaw[i] = yaw;
  }
  const y0 = m.yaw[0];
  for (let i = 0; i < n; i++) m.yaw[i] -= y0;
  mixer.stopAllAction();

  // ---- strip it from the clip
  if (hipsTrackPos) {
    const v = hipsTrackPos.values;
    for (let k = 0; k < v.length; k += 3) {
      v[k] = v[0];
      v[k + 2] = v[2];
    }
  }
  // cancel yaw: q' = P⁻¹ · Ry(-yaw(t)) · P · q   (P = hips parent's world rotation)
  const parent = h.parent;
  const P = parent ? parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  const Pinv = P.clone().invert();
  const ry = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const tr = hipsTrackRot;
  const v = tr.values;
  for (let k = 0, j = 0; k < v.length; k += 4, j++) {
    const yaw = sampleArr(m, tr.times[j], m.yaw);
    ry.setFromAxisAngle(up, -yaw);
    q.set(v[k], v[k + 1], v[k + 2], v[k + 3]);
    q.premultiply(P).premultiply(ry).premultiply(Pinv);
    v[k] = q.x;
    v[k + 1] = q.y;
    v[k + 2] = q.z;
    v[k + 3] = q.w;
  }
  return m;
}

function sampleArr(_m: Motion, t: number, arr: Float32Array): number {
  const f = Math.max(0, Math.min(arr.length - 1, t * HZ));
  const i = Math.floor(f);
  const j = Math.min(arr.length - 1, i + 1);
  const a = f - i;
  return arr[i] * (1 - a) + arr[j] * a;
}

/** Sample a motion at clip time `t` into `out` (x, z, yaw). Allocation-free. */
export function sampleMotion(m: Motion, t: number, out: { x: number; z: number; yaw: number }): void {
  out.x = sampleArr(m, t, m.x);
  out.z = sampleArr(m, t, m.z);
  out.yaw = sampleArr(m, t, m.yaw);
}

/** Left/right mirror of a motion (x and yaw flip). */
export function mirrorMotion(m: Motion): Motion {
  return {
    duration: m.duration,
    t: m.t,
    x: m.x.map((v) => -v),
    z: m.z,
    yaw: m.yaw.map((v) => -v),
  };
}

/**
 * Left/right mirrored copy of a Mixamo clip: Left/Right tracks swap, rotations reflect across
 * the body's mid plane (x, -y, -z, w), hips sideways travel flips.
 */
export function mirrorClip(clip: AnimationClip, name: string): AnimationClip {
  const swap = (n: string) =>
    n.replace(/Left|Right/g, (s) => (s === 'Left' ? 'Right' : 'Left'));
  const tracks: KeyframeTrack[] = [];
  for (const tr of clip.tracks) {
    const nn = swap(tr.name);
    const v = Float32Array.from(tr.values);
    if (tr.name.endsWith('.quaternion')) {
      for (let k = 0; k < v.length; k += 4) {
        v[k + 1] = -v[k + 1];
        v[k + 2] = -v[k + 2];
      }
      tracks.push(new QuaternionKeyframeTrack(nn, Array.from(tr.times), Array.from(v)));
    } else if (tr.name.endsWith('.position')) {
      for (let k = 0; k < v.length; k += 3) v[k] = -v[k];
      tracks.push(new VectorKeyframeTrack(nn, Array.from(tr.times), Array.from(v)));
    }
  }
  return new AnimationClip(name, clip.duration, tracks);
}
