import {
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  type Object3D,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export interface FootTrackPoint {
  t: number; // time in seconds (relative to clip start)
  // Local positions (x = right, y = height, z = forward)
  toeL: { x: number; y: number; z: number };
  toeR: { x: number; y: number; z: number };
  ankleL: { x: number; y: number; z: number };
  ankleR: { x: number; y: number; z: number };
  hips: { x: number; y: number; z: number };
  // Velocities (m/s)
  toeVelL: { x: number; y: number; z: number; speed: number; speedH: number };
  toeVelR: { x: number; y: number; z: number; speed: number; speedH: number };
  ankleVelL: { x: number; y: number; z: number; speed: number; speedH: number };
  ankleVelR: { x: number; y: number; z: number; speed: number; speedH: number };
}

export interface ClipFootTracks {
  fps: number;
  duration: number;
  frameCount: number;
  points: FootTrackPoint[];
}

const _vToeL = new Vector3();
const _vToeR = new Vector3();
const _vAnkleL = new Vector3();
const _vAnkleR = new Vector3();
const _vHips = new Vector3();

// Convert world position (at yaw 0) to character local space:
// localX = -world.x (x = right), localY = world.y (height), localZ = world.z (forward)
function toLocal(v: Vector3): { x: number; y: number; z: number } {
  return {
    x: -v.x,
    y: v.y,
    z: v.z,
  };
}

function findBone(root: Object3D, regex: RegExp): Object3D | null {
  let hit: Object3D | null = null;
  root.traverse((o) => {
    if (!hit && regex.test(o.name)) hit = o;
  });
  return hit;
}

export function sampleFootTracks(
  characterTemplate: Object3D,
  characterScale: number,
  clip: AnimationClip,
  fps = 30,
): ClipFootTracks {
  const clone = cloneSkinned(characterTemplate);
  clone.scale.setScalar(characterScale);

  const leftToe = findBone(clone, /LeftToeBase$/i);
  const rightToe = findBone(clone, /RightToeBase$/i);
  const leftAnkle = findBone(clone, /LeftFoot$/i);
  const rightAnkle = findBone(clone, /RightFoot$/i);
  const hips = findBone(clone, /Hips$/i);

  const mixer = new AnimationMixer(clone);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const dt = 1 / fps;
  const frameCount = Math.max(1, Math.round(clip.duration * fps));
  const rawPoints: Omit<FootTrackPoint, 'toeVelL' | 'toeVelR' | 'ankleVelL' | 'ankleVelR'>[] = [];

  for (let i = 0; i < frameCount; i++) {
    const t = Math.min(clip.duration, i * dt);
    mixer.setTime(t);
    clone.updateMatrixWorld(true);

    if (leftToe) leftToe.getWorldPosition(_vToeL);
    else _vToeL.set(0.12, 0, 0);

    if (rightToe) rightToe.getWorldPosition(_vToeR);
    else _vToeR.set(-0.12, 0, 0);

    if (leftAnkle) leftAnkle.getWorldPosition(_vAnkleL);
    else _vAnkleL.set(0.12, 0.08, 0);

    if (rightAnkle) rightAnkle.getWorldPosition(_vAnkleR);
    else _vAnkleR.set(-0.12, 0.08, 0);

    if (hips) hips.getWorldPosition(_vHips);
    else _vHips.set(0, 0.9, 0);

    rawPoints.push({
      t,
      toeL: toLocal(_vToeL),
      toeR: toLocal(_vToeR),
      ankleL: toLocal(_vAnkleL),
      ankleR: toLocal(_vAnkleR),
      hips: toLocal(_vHips),
    });
  }

  // Calculate finite difference velocities
  const points: FootTrackPoint[] = [];
  for (let i = 0; i < frameCount; i++) {
    const cur = rawPoints[i];
    const prev = rawPoints[Math.max(0, i - 1)];
    const next = rawPoints[Math.min(frameCount - 1, i + 1)];
    const timeDelta = Math.max(1e-4, next.t - prev.t);

    const calcVel = (
      pNext: { x: number; y: number; z: number },
      pPrev: { x: number; y: number; z: number },
    ) => {
      const vx = (pNext.x - pPrev.x) / timeDelta;
      const vy = (pNext.y - pPrev.y) / timeDelta;
      const vz = (pNext.z - pPrev.z) / timeDelta;
      const speedH = Math.hypot(vx, vz);
      const speed = Math.hypot(vx, vy, vz);
      return { x: vx, y: vy, z: vz, speed, speedH };
    };

    points.push({
      ...cur,
      toeVelL: calcVel(next.toeL, prev.toeL),
      toeVelR: calcVel(next.toeR, prev.toeR),
      ankleVelL: calcVel(next.ankleL, prev.ankleL),
      ankleVelR: calcVel(next.ankleR, prev.ankleR),
    });
  }

  return {
    fps,
    duration: clip.duration,
    frameCount,
    points,
  };
}
