import type { ClipEntry, Foot } from '../state/project';
import type { ClipFootTracks } from './footTracks';

export interface PlantedInterval {
  foot: Foot;
  from: number; // trimmed time in seconds
  to: number; // trimmed time in seconds
}

export function detectPlanted(
  tracks: ClipFootTracks,
  clip: ClipEntry,
  maxHeight = 0.06,
  maxSpeedH = 0.25,
  minFrames = 4,
  maxMergeGapFrames = 2,
): PlantedInterval[] {
  const { points, fps } = tracks;
  const inFrame = Math.max(0, Math.floor(clip.in * fps));
  const outFrame = Math.min(points.length - 1, Math.ceil(clip.out * fps));

  const result: PlantedInterval[] = [];

  for (const foot of ['L', 'R'] as const) {
    const isPlanted = new Array<boolean>(outFrame - inFrame + 1).fill(false);

    for (let i = inFrame; i <= outFrame; i++) {
      const p = points[i];
      const toe = foot === 'L' ? p.toeL : p.toeR;
      const ankle = foot === 'L' ? p.ankleL : p.ankleR;
      const vel = foot === 'L' ? p.toeVelL : p.toeVelR;

      if (toe.y <= maxHeight && ankle.y <= maxHeight + 0.05 && vel.speedH <= maxSpeedH) {
        isPlanted[i - inFrame] = true;
      }
    }

    // Merge short gaps (< maxMergeGapFrames)
    let gapStart = -1;
    for (let i = 0; i < isPlanted.length; i++) {
      if (!isPlanted[i]) {
        if (gapStart === -1) gapStart = i;
      } else {
        if (gapStart !== -1) {
          const gapLen = i - gapStart;
          if (gapLen <= maxMergeGapFrames && gapStart > 0) {
            for (let g = gapStart; g < i; g++) {
              isPlanted[g] = true;
            }
          }
          gapStart = -1;
        }
      }
    }

    // Extract contiguous intervals of length >= minFrames
    let intervalStart = -1;
    for (let i = 0; i <= isPlanted.length; i++) {
      const active = i < isPlanted.length && isPlanted[i];
      if (active) {
        if (intervalStart === -1) intervalStart = i;
      } else {
        if (intervalStart !== -1) {
          const len = i - intervalStart;
          if (len >= minFrames) {
            const fromSec = Number(((intervalStart) / fps).toFixed(3));
            const toSec = Number(((i - 1) / fps).toFixed(3));
            result.push({
              foot,
              from: fromSec,
              to: toSec,
            });
          }
          intervalStart = -1;
        }
      }
    }
  }

  result.sort((a, b) => a.from - b.from);
  return result;
}

