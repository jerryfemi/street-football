import type { ClipEntry, Foot, FootPart, Touch, TouchType } from '../state/project';
import type { ClipFootTracks, FootTrackPoint } from './footTracks';

export interface DetectionThresholds {
  maxToeHeight: number; // default 0.12 m
  maxAnkleHeight: number; // default 0.16 m
  minPreSpeed: number; // default 1.2 m/s
  minSpeedDropPct: number; // default 0.35 (35%)
  minDirectionChangeDeg: number; // default 40 deg
  minZ: number; // -0.2 m
  maxZ: number; // 0.8 m
  maxX: number; // 0.55 m
  suppressionWindowS: number; // 0.15 s
}

export const defaultDetectionThresholds: DetectionThresholds = {
  maxToeHeight: 0.12,
  maxAnkleHeight: 0.16,
  minPreSpeed: 1.0, // generous for varying mocap speeds
  minSpeedDropPct: 0.30,
  minDirectionChangeDeg: 35,
  minZ: -0.2,
  maxZ: 0.8,
  maxX: 0.55,
  suppressionWindowS: 0.15,
};

interface Candidate {
  foot: Foot;
  frameIndex: number;
  tTrimmed: number;
  score: number;
  point: FootTrackPoint;
}

export function detectTouches(
  tracks: ClipFootTracks,
  clip: ClipEntry,
  thresholds: DetectionThresholds = defaultDetectionThresholds,
): Touch[] {
  const { points, fps } = tracks;
  const inFrame = Math.max(0, Math.floor(clip.in * fps));
  const outFrame = Math.min(points.length - 1, Math.ceil(clip.out * fps));

  const candidates: Candidate[] = [];

  for (const foot of ['L', 'R'] as const) {
    for (let i = inFrame + 3; i <= outFrame - 2; i++) {
      const cur = points[i];
      const toe = foot === 'L' ? cur.toeL : cur.toeR;
      const ankle = foot === 'L' ? cur.ankleL : cur.ankleR;

      // 1. Low check
      if (toe.y > thresholds.maxToeHeight || ankle.y > thresholds.maxAnkleHeight) {
        continue;
      }

      // 2. Front zone check
      if (toe.z < thresholds.minZ || toe.z > thresholds.maxZ || Math.abs(toe.x) > thresholds.maxX) {
        continue;
      }

      // 3. Fast before check (average speed over i-3..i-1 relative to hips)
      let sumPreSpeed = 0;
      for (let k = 1; k <= 3; k++) {
        const prevP = points[i - k];
        const prevVel = foot === 'L' ? prevP.toeVelL : prevP.toeVelR;
        // Relative to hips velocity
        const hipsVx = (cur.hips.x - prevP.hips.x) * fps;
        const hipsVz = (cur.hips.z - prevP.hips.z) * fps;
        const relVx = prevVel.x - hipsVx;
        const relVz = prevVel.z - hipsVz;
        sumPreSpeed += Math.hypot(relVx, relVz);
      }
      const avgPreSpeed = sumPreSpeed / 3;
      if (avgPreSpeed < thresholds.minPreSpeed) {
        continue;
      }

      // 4. Sudden change check (speed drop or direction change within 2 frames)
      const postP = points[Math.min(points.length - 1, i + 2)];
      const postVel = foot === 'L' ? postP.toeVelL : postP.toeVelR;

      const speedDrop = (avgPreSpeed - postVel.speedH) / Math.max(1e-3, avgPreSpeed);

      // Angle between pre-direction and post-direction
      const prevP1 = points[i - 1];
      const prevVel1 = foot === 'L' ? prevP1.toeVelL : prevP1.toeVelR;
      const dot = (prevVel1.x * postVel.x + prevVel1.z * postVel.z);
      const mag = (prevVel1.speedH * postVel.speedH) || 1e-4;
      const cosAngle = Math.max(-1, Math.min(1, dot / mag));
      const angleDeg = Math.acos(cosAngle) * (180 / Math.PI);

      if (speedDrop >= thresholds.minSpeedDropPct || angleDeg >= thresholds.minDirectionChangeDeg) {
        const score = avgPreSpeed * 2 + speedDrop * 3 + (angleDeg / 40);
        candidates.push({
          foot,
          frameIndex: i,
          tTrimmed: Math.max(0, cur.t - clip.in),
          score,
          point: cur,
        });
      }
    }
  }

  // Non-max suppression per foot
  const filteredCandidates: Candidate[] = [];
  for (const foot of ['L', 'R'] as const) {
    const footCandidates = candidates
      .filter((c) => c.foot === foot)
      .sort((a, b) => b.score - a.score);

    const kept: Candidate[] = [];
    for (const cand of footCandidates) {
      const conflict = kept.some(
        (k) => Math.abs(k.tTrimmed - cand.tTrimmed) < thresholds.suppressionWindowS,
      );
      if (!conflict) {
        kept.push(cand);
      }
    }
    filteredCandidates.push(...kept);
  }

  filteredCandidates.sort((a, b) => a.tTrimmed - b.tTrimmed);

  // Convert candidates into Touch objects with smart defaults
  const result: Touch[] = [];
  const isSkill = clip.tags.includes('skill');

  for (let idx = 0; idx < filteredCandidates.length; idx++) {
    const cand = filteredCandidates[idx];
    const toe = cand.foot === 'L' ? cand.point.toeL : cand.point.toeR;
    const ankle = cand.foot === 'L' ? cand.point.ankleL : cand.point.ankleR;
    const vel = cand.foot === 'L' ? cand.point.toeVelL : cand.point.toeVelR;

    // Determine part:
    // Moving toward center (x -> 0): inside
    // Moving away from center: outside
    // If toe speed low and heel is lower than toe: sole
    let part: FootPart = 'inside';
    const movingInward = cand.foot === 'L' ? vel.x > 0 : vel.x < 0;
    if (ankle.y <= toe.y + 0.02 && vel.speedH < 0.8) {
      part = 'sole';
    } else if (!movingInward) {
      part = 'outside';
    }

    // Determine touch type:
    // First touch of a skill is 'set', last is 'push'; regular dribble is 'close'
    let type: TouchType = 'close';
    if (isSkill) {
      if (idx === 0) type = 'set';
      else if (idx === filteredCandidates.length - 1) type = 'push';
    }

    // Ball contact point 'at': toe ground projection + 0.11 m forward offset along foot direction
    const footDirZ = 1.0;
    const footDirX = cand.foot === 'L' ? -0.15 : 0.15;
    const atX = Number((toe.x + footDirX * 0.11).toFixed(3));
    const atZ = Number((toe.z + footDirZ * 0.11).toFixed(3));

    const touch: Touch = {
      id: `touch_${cand.foot}_${Math.round(cand.tTrimmed * 1000)}`,
      t: Number(cand.tTrimmed.toFixed(3)),
      foot: cand.foot,
      part,
      type,
      at: { x: atX, z: atZ, y: 0.11 },
      auto: true,
    };

    result.push(touch);
  }

  // Second pass: fill 'to' and 'arrive' based on next touch or forward velocity
  for (let idx = 0; idx < result.length; idx++) {
    const cur = result[idx];
    const next = result[idx + 1];

    if (next) {
      cur.to = { x: next.at.x, z: next.at.z };
      cur.arrive = Number(Math.max(0.1, next.t - cur.t).toFixed(3));
    } else {
      // Last touch: project forward 1.2 m
      const forwardOffset = isSkill ? 1.4 : 0.8;
      cur.to = {
        x: Number((cur.at.x + (cur.foot === 'R' ? 0.3 : -0.3)).toFixed(3)),
        z: Number((cur.at.z + forwardOffset).toFixed(3)),
      };
      cur.arrive = 0.45;
    }
  }

  return result;
}
