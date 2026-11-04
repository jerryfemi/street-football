import {
  AnimationClip,
  KeyframeTrack,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import type { ClipEntry, Touch } from '../state/project';

function swapBoneName(name: string): string {
  if (name.includes('Left')) {
    return name.replace('Left', 'Right');
  }
  if (name.includes('Right')) {
    return name.replace('Right', 'Left');
  }
  return name;
}

export function mirrorClip(
  sourceClip: AnimationClip,
  entry: ClipEntry,
): { clip: AnimationClip; entry: ClipEntry } {
  // Determine new ID and name
  const isRight = entry.id.endsWith('_R') || entry.name.endsWith('_R');
  const isLeft = entry.id.endsWith('_L') || entry.name.endsWith('_L');
  let newId = `${entry.id}_mirrored`;
  let newName = `${entry.name}_mirrored`;

  if (isRight) {
    newId = entry.id.replace(/_R$/, '_L');
    newName = entry.name.replace(/_R$/, '_L');
  } else if (isLeft) {
    newId = entry.id.replace(/_L$/, '_R');
    newName = entry.name.replace(/_L$/, '_R');
  }

  // 1. Mirror Animation Tracks
  const mirroredTracks: KeyframeTrack[] = [];

  for (const track of sourceClip.tracks) {
    const targetName = swapBoneName(track.name);

    if (track instanceof QuaternionKeyframeTrack) {
      const vals = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 4) {
        // Across YZ plane: (x, y, z, w) -> (x, -y, -z, w)
        vals[i] = track.values[i];
        vals[i + 1] = -track.values[i + 1];
        vals[i + 2] = -track.values[i + 2];
        vals[i + 3] = track.values[i + 3];
      }
      mirroredTracks.push(new QuaternionKeyframeTrack(targetName, track.times, vals));
    } else if (track instanceof VectorKeyframeTrack) {
      const vals = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 3) {
        // Hips position: x -> -x
        vals[i] = -track.values[i];
        vals[i + 1] = track.values[i + 1];
        vals[i + 2] = track.values[i + 2];
      }
      mirroredTracks.push(new VectorKeyframeTrack(targetName, track.times, vals));
    } else {
      mirroredTracks.push(track.clone());
    }
  }

  const mirroredAnim = new AnimationClip(newId, sourceClip.duration, mirroredTracks);

  // 2. Mirror Touches
  const mirroredTouches: Touch[] = entry.touches.map((t) => ({
    id: `touch_${t.foot === 'L' ? 'R' : 'L'}_${Math.round(t.t * 1000)}`,
    t: t.t,
    foot: t.foot === 'L' ? 'R' : 'L',
    part: t.part,
    type: t.type,
    at: {
      x: -t.at.x,
      z: t.at.z,
      y: t.at.y,
    },
    to: t.to
      ? {
          x: -t.to.x,
          z: t.to.z,
        }
      : undefined,
    arrive: t.arrive,
    lift: t.lift,
    stay: t.stay,
    auto: t.auto,
  }));

  // 3. Mirror Planted Intervals
  const mirroredPlanted = entry.planted.map((p) => ({
    foot: (p.foot === 'L' ? 'R' : 'L') as 'L' | 'R',
    from: p.from,
    to: p.to,
  }));

  // 4. Mirror Root Motion
  const mirroredRoot: ClipEntry['rootMotion'] = { ...entry.rootMotion };

  const mirroredEntry: ClipEntry = {
    ...entry,
    id: newId,
    name: newName,
    fakeSide: entry.fakeSide ? (( -entry.fakeSide ) as -1 | 0 | 1) : 0,
    entryFoot: entry.entryFoot ? (entry.entryFoot === 'L' ? 'R' : 'L') : undefined,
    touches: mirroredTouches,
    planted: mirroredPlanted,
    rootMotion: mirroredRoot,
    cleanup: {
      ...entry.cleanup,
      mirroredFrom: entry.id,
    },
  };

  return { clip: mirroredAnim, entry: mirroredEntry };
}
