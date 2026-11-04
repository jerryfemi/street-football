import {
  AnimationClip,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';

export interface RootSample {
  t: number;
  x: number;
  z: number;
  yaw: number;
}

export interface RootMotionResult {
  clip: AnimationClip;
  samples: [number, number, number, number][]; // [t, x, z, yaw]
}

const _qHips = new Quaternion();

export function extractRootMotion(
  clip: AnimationClip,
  mode: 'none' | 'xz' | 'xz+yaw' = 'xz',
): RootMotionResult {
  if (mode === 'none') {
    return {
      clip: clip.clone(),
      samples: [],
    };
  }

  const cloned = clip.clone();
  let hipsPosTrackIdx = -1;
  let hipsRotTrackIdx = -1;

  for (let i = 0; i < cloned.tracks.length; i++) {
    const name = cloned.tracks[i].name;
    if (/Hips\.position$/i.test(name)) {
      hipsPosTrackIdx = i;
    } else if (/Hips\.quaternion$/i.test(name)) {
      hipsRotTrackIdx = i;
    }
  }

  if (hipsPosTrackIdx === -1) {
    return { clip: cloned, samples: [] };
  }

  const posTrack = cloned.tracks[hipsPosTrackIdx] as VectorKeyframeTrack;
  const times = posTrack.times;
  const posValues = posTrack.values;
  const keyCount = times.length;

  // Initial offset at t=0
  const startX = posValues[0];
  const startZ = posValues[2];

  const samples: [number, number, number, number][] = [];
  const newPosValues = new Float32Array(posValues.length);

  for (let i = 0; i < keyCount; i++) {
    const offset = i * 3;
    const curX = posValues[offset];
    const curY = posValues[offset + 1];
    const curZ = posValues[offset + 2];

    // Travel relative to clip start
    const deltaX = curX - startX;
    const deltaZ = curZ - startZ;

    // Hips yaw calculation if requested
    let yaw = 0;
    if (mode === 'xz+yaw' && hipsRotTrackIdx !== -1) {
      const rotTrack = cloned.tracks[hipsRotTrackIdx] as QuaternionKeyframeTrack;
      const rOffset = i * 4;
      _qHips.set(
        rotTrack.values[rOffset],
        rotTrack.values[rOffset + 1],
        rotTrack.values[rOffset + 2],
        rotTrack.values[rOffset + 3],
      );
      // Forward vector from quaternion
      const forward = new Vector3(0, 0, 1).applyQuaternion(_qHips);
      yaw = Math.atan2(forward.x, forward.z);
    }

    samples.push([
      Number(times[i].toFixed(4)),
      Number(deltaX.toFixed(4)),
      Number(deltaZ.toFixed(4)),
      Number(yaw.toFixed(4)),
    ]);

    // Subtract root motion so hip stays in place at (startX, curY, startZ)
    newPosValues[offset] = startX;
    newPosValues[offset + 1] = curY;
    newPosValues[offset + 2] = startZ;
  }

  cloned.tracks[hipsPosTrackIdx] = new VectorKeyframeTrack(posTrack.name, times, newPosValues);

  return {
    clip: cloned,
    samples,
  };
}
