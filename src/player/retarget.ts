// SOURCE: identical copy in clip_lab/src/shared/retarget.ts - keep both in sync.
//
// Rest-pose retargeting. An animation stores each bone's rotation relative to the rest pose of
// the skeleton it was authored on. Copying those rotations onto a character whose rest pose
// differs (arms at another angle, wrists/feet rolled differently) caves shoulders, bends wrists
// and turns feet. Per bone, with world-space rest rotations Ws/Wt, parent rests Wsp/Wtp and
// local rests Rs/Rt:
//
//     target world = source world · Ws⁻¹ · Wt      (same motion away from rest, in world space)
//  => q_t = C · q_s · Rs⁻¹ · C⁻¹ · Rt,   C = Wtp⁻¹ · Wsp
//
// C and the right-hand factor are constant per bone, so a clip is converted once at load.
// Hips translation is re-expressed in the target hips-parent space and scaled by leg height.
import { Quaternion, Vector3, type AnimationClip, type Bone, type Object3D } from 'three';

export interface BoneMap {
  pre: Quaternion;
  post: Quaternion;
}
export interface Retarget {
  bones: Map<string, BoneMap>;
  hips?: { name: string; c: Quaternion; srcRest: Vector3; dstRest: Vector3; scale: number };
}

const normName = (n: string) => {
  const d = n.lastIndexOf('.');
  return `${norm(n.slice(0, d))}.${n.slice(d + 1)}`;
};
const norm = (n: string) => n.replace(/^.*[:|]/, '').replace(/^mixamorig\d*/i, 'mixamorig');

interface Rest {
  local: Quaternion;
  world: Quaternion;
  parentWorld: Quaternion;
  pos: Vector3;
  parentScale: number;
  worldPos: Vector3;
}

function restPose(root: Object3D): Map<string, Rest> {
  // FBXLoader leaves bones in the file's rest transforms (Mixamo: the bind pose).
  // Don't use skeleton.pose(): it ignores the armature node's rotation/scale above the hips.
  const out = new Map<string, Rest>();
  const work = root;
  work.updateMatrixWorld(true);
  const _s = new Vector3();
  const _p = new Vector3();
  work.traverse((o) => {
    if (!(o as Bone).isBone) return;
    const world = o.getWorldQuaternion(new Quaternion());
    const parentWorld = o.parent ? o.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
    if (o.parent) o.parent.matrixWorld.decompose(_p, new Quaternion(), _s);
    else _s.set(1, 1, 1);
    out.set(norm(o.name), {
      local: o.quaternion.clone(),
      world,
      parentWorld,
      pos: o.position.clone(),
      parentScale: _s.y,
      worldPos: o.getWorldPosition(new Vector3()),
    });
  });
  return out;
}

/** Lowest bone (toe) to hips, in world units: the leg height used to scale translation. */
function hipsHeight(rest: Map<string, Rest>, hipsKey: string): number {
  const h = rest.get(hipsKey);
  if (!h) return 0;
  let low = Infinity;
  for (const [k, r] of rest) if (/(Toe|Foot)/i.test(k)) low = Math.min(low, r.worldPos.y);
  return Number.isFinite(low) ? h.worldPos.y - low : 0;
}

/**
 * Builds the conversion from a clip's own skeleton (the FBX it came in, no mesh needed)
 * to the target character. Both are left untouched (the target is posed on a clone).
 */
export function buildRetarget(source: Object3D, targetTemplate: Object3D): Retarget {
  const src = restPose(source);
  const dst = restPose(targetTemplate);

  const bones = new Map<string, BoneMap>();
  for (const [name, s] of src) {
    const t = dst.get(name);
    if (!t) continue;
    const c = t.parentWorld.clone().invert().multiply(s.parentWorld);
    const post = s.local.clone().invert().multiply(c.clone().invert()).multiply(t.local);
    bones.set(name, { pre: c, post });
  }
  const hipsKey = [...src.keys()].find((k) => /Hips$/.test(k));
  let hips: Retarget['hips'];
  if (hipsKey && dst.has(hipsKey)) {
    const s = src.get(hipsKey)!;
    const t = dst.get(hipsKey)!;
    const hs = hipsHeight(src, hipsKey) / Math.max(1e-6, s.parentScale);
    const ht = hipsHeight(dst, hipsKey) / Math.max(1e-6, t.parentScale);
    // standing hips height maps onto standing hips height (same idea as the Rokoko fix);
    // falls back to leg-length ratio when a rest height is ~0
    const c = bones.get(hipsKey)!.pre;
    const srcUp = s.pos.clone().applyQuaternion(c).y;
    const scale = Math.abs(srcUp) > 1e-6 && Math.abs(t.pos.y) > 1e-6 ? t.pos.y / srcUp : hs > 1e-6 && ht > 1e-6 ? ht / hs : 1;
    hips = { name: hipsKey, c, srcRest: s.pos.clone().applyQuaternion(c), dstRest: t.pos, scale };
  }
  return { bones, hips };
}

const _q = new Quaternion();
const _v = new Vector3();

/**
 * Converts the clip in place. Track names are normalised to the target's `mixamorig` names.
 * `standY`: the target's standing hips height in hips-track units (an idle clip's hips y).
 * When given, the clip's own standing frame maps onto it (robust to cm/m/armature-scale exports).
 */
export function applyRetarget(clip: AnimationClip, rt: Retarget, standY?: number): void {
  const hipsTrack = rt.hips ? clip.tracks.find((t) => normName(t.name) === `${rt.hips!.name}.position`) : undefined;
  let scale = rt.hips?.scale ?? 1;
  let x0 = 0;
  let z0 = 0;
  if (hipsTrack && rt.hips) {
    const v = hipsTrack.values;
    const f = v.length > 9 ? 6 : 0; // 3rd frame: first frames are often a snap from the reference pose
    _v.set(v[f], v[f + 1], v[f + 2]).applyQuaternion(rt.hips.c);
    if (standY !== undefined && Math.abs(_v.y) > 1e-6) scale = standY / _v.y;
    x0 = _v.x;
    z0 = _v.z;
  }
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const bone = norm(track.name.slice(0, dot));
    const prop = track.name.slice(dot + 1);
    track.name = `${bone}.${prop}`;
    const v = track.values;
    if (prop === 'quaternion') {
      const m = rt.bones.get(bone);
      if (!m) continue;
      for (let k = 0; k < v.length; k += 4) {
        _q.set(v[k], v[k + 1], v[k + 2], v[k + 3]);
        _q.premultiply(m.pre).multiply(m.post);
        v[k] = _q.x;
        v[k + 1] = _q.y;
        v[k + 2] = _q.z;
        v[k + 3] = _q.w;
      }
    } else if (prop === 'position' && rt.hips && bone === rt.hips.name) {
      const h = rt.hips;
      for (let k = 0; k < v.length; k += 3) {
        _v.set(v[k], v[k + 1], v[k + 2]).applyQuaternion(h.c);
        // height scales as a whole; ground travel scales relative to the rest spot
        _v.x = (_v.x - x0) * scale;
        _v.y = _v.y * scale;
        _v.z = (_v.z - z0) * scale;
        v[k] = _v.x;
        v[k + 1] = _v.y;
        v[k + 2] = _v.z;
      }
    }
  }
  // other bones' translation/scale tracks come from a different-proportioned body: drop them
  clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || (rt.hips && t.name === `${rt.hips.name}.position`));
}

