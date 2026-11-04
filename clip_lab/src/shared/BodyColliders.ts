// SOURCE: panna_verse/src/physics/BodyColliders.ts - keep in sync
import { Vector3, type Object3D } from 'three';

/**
 * Invisible capsules glued to the animated skeleton. They are what the ball and other players
 * actually hit, so the animation decides what's possible: a wide jockey stance leaves a gap
 * between the shins, an upright stance closes it, a lunging foot is a moving obstacle.
 *
 * Updated every simulation step from bone world positions (Player.sampleBody).
 */
export type BodyPart = 'thigh' | 'shin' | 'foot' | 'torso' | 'chest' | 'head';

export interface Capsule {
  part: BodyPart;
  side: -1 | 0 | 1; // -1 left, +1 right, 0 centre
  r: number;
  a: Vector3;
  b: Vector3;
  /** previous step's endpoints (for point velocity) */
  pa: Vector3;
  pb: Vector3;
  boneA: Object3D;
  boneB: Object3D;
}

/** [part, side, boneA suffix, boneB suffix, radius] */
const LAYOUT: [BodyPart, -1 | 0 | 1, string, string, number][] = [
  ['thigh', -1, 'LeftUpLeg', 'LeftLeg', 0.085],
  ['shin', -1, 'LeftLeg', 'LeftFoot', 0.06],
  ['foot', -1, 'LeftFoot', 'LeftToeBase', 0.055],
  ['thigh', 1, 'RightUpLeg', 'RightLeg', 0.085],
  ['shin', 1, 'RightLeg', 'RightFoot', 0.06],
  ['foot', 1, 'RightFoot', 'RightToeBase', 0.055],
  ['torso', 0, 'Hips', 'Spine2', 0.16],
  ['chest', 0, 'Spine2', 'Neck', 0.17],
  ['head', 0, 'Head', 'HeadTop_End', 0.11],
];

export function buildColliders(body: Object3D): Capsule[] {
  const find = (suffix: string): Object3D | undefined => {
    let hit: Object3D | undefined;
    const re = new RegExp(`${suffix}$`);
    body.traverse((o) => {
      if (!hit && re.test(o.name)) hit = o;
    });
    return hit;
  };
  const out: Capsule[] = [];
  for (const [part, side, sa, sb, r] of LAYOUT) {
    const boneA = find(sa);
    const boneB = find(sb);
    if (!boneA || !boneB) continue;
    out.push({ part, side, r, a: new Vector3(), b: new Vector3(), pa: new Vector3(), pb: new Vector3(), boneA, boneB });
  }
  return out;
}

const _ab = new Vector3();
const _ap = new Vector3();

/** Closest point on segment ab to p, written to out. Returns the segment parameter t (0..1). */
export function closestOnSegment(a: Vector3, b: Vector3, p: Vector3, out: Vector3): number {
  _ab.subVectors(b, a);
  const len2 = _ab.lengthSq();
  let t = len2 > 1e-10 ? _ap.subVectors(p, a).dot(_ab) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.copy(a).addScaledVector(_ab, t);
  return t;
}

/** 2D segment intersection on the ground plane (x, z). */
export function segmentsCrossXZ(
  p1x: number, p1z: number, p2x: number, p2z: number,
  q1x: number, q1z: number, q2x: number, q2z: number,
): boolean {
  const d1x = p2x - p1x;
  const d1z = p2z - p1z;
  const d2x = q2x - q1x;
  const d2z = q2z - q1z;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const ex = q1x - p1x;
  const ez = q1z - p1z;
  const t = (ex * d2z - ez * d2x) / den;
  const u = (ex * d1z - ez * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

