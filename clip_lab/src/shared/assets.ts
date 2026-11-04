// SOURCE: panna_verse/src/player/assets.ts - keep in sync
import {
  AnimationClip,
  Box3,
  type Bone,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three';

/**
 * Standing height in the model's units. Skinned meshes often report an empty Box3,
 * so prefer the skeleton (lowest bone -> HeadTop_End), then fall back to geometry bounds.
 */
export function measureHeight(root: Object3D): number {
  let minY = Infinity;
  let maxY = -Infinity;
  const p = new Vector3();
  root.traverse((o) => {
    if ((o as Bone).isBone) {
      o.getWorldPosition(p);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  });
  if (maxY - minY > 1e-3) return (maxY - minY) * 1.04;
  const box = new Box3();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    if (m.geometry.boundingBox) {
      box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    }
  });
  return box.isEmpty() ? 0 : box.getSize(p).y;
}

/**
 * Rokoko "Mixamo preset" exports share bone names with the character but not its units/proportions:
 * keep only rotations, drop the extra Reference bone, and rescale hip height to this character
 * (using the idle clip's hips height as the reference).
 */
export function retargetRokoko(clip: AnimationClip, idle?: AnimationClip, keepRootMotion = true): void {
  clip.tracks = clip.tracks.filter(
    (t) => !t.name.startsWith('mixamorigReference') && (t.name.endsWith('.quaternion') || t.name === 'mixamorigHips.position'),
  );
  const hips = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
  if (!hips) return;
  const ref = idle?.tracks.find((t) => t.name === 'mixamorigHips.position')?.values;
  const rx = ref ? ref[0] : 0;
  const ry = ref ? ref[1] : hips.values[1];
  const rz = ref ? ref[2] : 0;
  const v = hips.values;
  // Rokoko's first frame is often a snap from the reference pose; use the 3rd frame as standing height
  const y0 = v.length > 9 ? v[7] : v[1];
  for (let k = 0; k < v.length; k += 3) {
    if (!keepRootMotion) {
      v[k] = rx;
      v[k + 2] = rz;
    }
    v[k + 1] = ry * (v[k + 1] / (y0 || 1));
  }
}

/** Rename and optionally remap bone names. */
export function prepareClip(clip: AnimationClip, name: string, boneRemap: Record<string, string> = {}): AnimationClip {
  clip.name = name;
  if (Object.keys(boneRemap).length > 0) {
    for (const track of clip.tracks) {
      const dot = track.name.indexOf('.');
      const bone = track.name.slice(0, dot);
      if (boneRemap[bone]) track.name = boneRemap[bone] + track.name.slice(dot);
    }
  }
  return clip;
}

