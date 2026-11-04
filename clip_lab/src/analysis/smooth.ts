import { AnimationClip, Quaternion, QuaternionKeyframeTrack } from 'three';
import type { Touch } from '../state/project';

const _qAvg = new Quaternion();

export function smoothClip(
  clip: AnimationClip,
  windowSize = 3, // frames (0..7)
  touches: Touch[] = [],
  fps = 30,
): AnimationClip {
  if (windowSize <= 0) return clip.clone();

  const cloned = clip.clone();
  const halfWindow = Math.floor(windowSize / 2);

  // Identify touching leg frames to protect contacts
  // Bone patterns for leg/foot
  const legRegex = /(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/i;

  // Touch frame intervals [touchFrame - 2, touchFrame + 2]
  const touchIntervalsL: [number, number][] = [];
  const touchIntervalsR: [number, number][] = [];

  for (const t of touches) {
    const f = Math.round(t.t * fps);
    if (t.foot === 'L') {
      touchIntervalsL.push([f - 2, f + 2]);
    } else {
      touchIntervalsR.push([f - 2, f + 2]);
    }
  }

  const isProtectedFrame = (trackName: string, frameIdx: number): boolean => {
    const isLeft = /Left/i.test(trackName);
    const isRight = /Right/i.test(trackName);
    if (!isLeft && !isRight) return false;

    const intervals = isLeft ? touchIntervalsL : touchIntervalsR;
    return intervals.some(([start, end]) => frameIdx >= start && frameIdx <= end);
  };

  for (let trackIdx = 0; trackIdx < cloned.tracks.length; trackIdx++) {
    const track = cloned.tracks[trackIdx];
    if (!(track instanceof QuaternionKeyframeTrack)) continue;

    const values = track.values;
    const times = track.times;
    const keyCount = times.length;
    if (keyCount <= 1) continue;

    const isLeg = legRegex.test(track.name);
    const newValues = new Float32Array(values.length);

    for (let i = 0; i < keyCount; i++) {
      const offset = i * 4;

      // If near a touch on a leg bone, preserve contact sharpness
      if (isLeg && isProtectedFrame(track.name, i)) {
        newValues[offset] = values[offset];
        newValues[offset + 1] = values[offset + 1];
        newValues[offset + 2] = values[offset + 2];
        newValues[offset + 3] = values[offset + 3];
        continue;
      }

      // Moving average across [i - halfWindow, i + halfWindow]
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(keyCount - 1, i + halfWindow);

      const refOffset = i * 4;
      const refX = values[refOffset];
      const refY = values[refOffset + 1];
      const refZ = values[refOffset + 2];
      const refW = values[refOffset + 3];

      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      let sumW = 0;
      let count = 0;

      for (let k = start; k <= end; k++) {
        const kOffset = k * 4;
        let kx = values[kOffset];
        let ky = values[kOffset + 1];
        let kz = values[kOffset + 2];
        let kw = values[kOffset + 3];

        // Hemisphere check relative to center frame
        const dot = refX * kx + refY * ky + refZ * kz + refW * kw;
        if (dot < 0) {
          kx = -kx;
          ky = -ky;
          kz = -kz;
          kw = -kw;
        }

        sumX += kx;
        sumY += ky;
        sumZ += kz;
        sumW += kw;
        count++;
      }

      _qAvg.set(sumX / count, sumY / count, sumZ / count, sumW / count).normalize();

      newValues[offset] = _qAvg.x;
      newValues[offset + 1] = _qAvg.y;
      newValues[offset + 2] = _qAvg.z;
      newValues[offset + 3] = _qAvg.w;
    }

    cloned.tracks[trackIdx] = new QuaternionKeyframeTrack(track.name, times, newValues);
  }

  return cloned;
}
