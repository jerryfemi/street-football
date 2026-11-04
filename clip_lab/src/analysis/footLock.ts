import {
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  type Object3D,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { PlantedInterval } from './detectPlanted';

const _vHip = new Vector3();
const _vKnee = new Vector3();
const _vAnkle = new Vector3();

function findBone(root: Object3D, regex: RegExp): Object3D | null {
  let hit: Object3D | null = null;
  root.traverse((o) => {
    if (!hit && regex.test(o.name)) hit = o;
  });
  return hit;
}

/**
 * Solves analytical 2-bone IK (hip -> knee -> ankle) in 3D.
 * Rotates hip bone to point towards target while maintaining knee flexion plane.
 */
function solveTwoBoneIK(
  hip: Object3D,
  knee: Object3D,
  ankle: Object3D,
  targetPos: Vector3,
  weight = 1.0,
): void {
  hip.getWorldPosition(_vHip);
  knee.getWorldPosition(_vKnee);
  ankle.getWorldPosition(_vAnkle);

  // Current direction and target direction from hip
  const currentDir = _vAnkle.clone().sub(_vHip).normalize();
  const targetDir = targetPos.clone().sub(_vHip).normalize();

  // Rotation to align hip-ankle vector with hip-target vector
  const rotAlign = new Quaternion().setFromUnitVectors(currentDir, targetDir);

  if (weight < 1.0) {
    rotAlign.slerp(new Quaternion(), 1.0 - weight);
  }

  hip.quaternion.premultiply(rotAlign);
  hip.updateMatrixWorld(true);
}

export function applyFootLock(
  characterTemplate: Object3D,
  characterScale: number,
  clip: AnimationClip,
  intervals: PlantedInterval[],
  fps = 30,
): AnimationClip {
  if (intervals.length === 0) return clip.clone();

  const clone = cloneSkinned(characterTemplate);
  clone.scale.setScalar(characterScale);

  const bones = {
    leftHip: findBone(clone, /LeftUpLeg$/i),
    leftKnee: findBone(clone, /LeftLeg$/i),
    leftAnkle: findBone(clone, /LeftFoot$/i),
    rightHip: findBone(clone, /RightUpLeg$/i),
    rightKnee: findBone(clone, /RightLeg$/i),
    rightAnkle: findBone(clone, /RightFoot$/i),
  };

  if (!bones.leftHip || !bones.rightHip) return clip.clone();

  const mixer = new AnimationMixer(clone);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const dt = 1 / fps;
  const frameCount = Math.max(1, Math.round(clip.duration * fps));

  // Pre-record locked target positions at interval start
  const lockedTargets = new Map<PlantedInterval, Vector3>();
  for (const interval of intervals) {
    mixer.setTime(interval.from);
    clone.updateMatrixWorld(true);
    const ankle = interval.foot === 'L' ? bones.leftAnkle : bones.rightAnkle;
    if (ankle) {
      const pos = new Vector3();
      ankle.getWorldPosition(pos);
      lockedTargets.set(interval, pos);
    }
  }

  // Sample and solve IK frame by frame, saving bone quaternions
  const leftHipQuats: Quaternion[] = [];
  const rightHipQuats: Quaternion[] = [];

  for (let i = 0; i < frameCount; i++) {
    const t = Math.min(clip.duration, i * dt);
    mixer.setTime(t);
    clone.updateMatrixWorld(true);

    for (const interval of intervals) {
      if (t >= interval.from && t <= interval.to) {
        const target = lockedTargets.get(interval);
        if (target) {
          // 3-frame blend in and blend out
          const blendIn = Math.min(1.0, (t - interval.from) / (3 * dt));
          const blendOut = Math.min(1.0, (interval.to - t) / (3 * dt));
          const weight = Math.min(blendIn, blendOut);

          if (interval.foot === 'L' && bones.leftHip && bones.leftKnee && bones.leftAnkle) {
            solveTwoBoneIK(bones.leftHip, bones.leftKnee, bones.leftAnkle, target, weight);
          } else if (interval.foot === 'R' && bones.rightHip && bones.rightKnee && bones.rightAnkle) {
            solveTwoBoneIK(bones.rightHip, bones.rightKnee, bones.rightAnkle, target, weight);
          }
        }
      }
    }

    if (bones.leftHip) leftHipQuats.push(bones.leftHip.quaternion.clone());
    if (bones.rightHip) rightHipQuats.push(bones.rightHip.quaternion.clone());
  }

  // Bake back into new animation clip
  const baked = clip.clone();
  const times = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) times[i] = i * dt;

  for (let trackIdx = 0; trackIdx < baked.tracks.length; trackIdx++) {
    const track = baked.tracks[trackIdx];
    if (/LeftUpLeg\.quaternion$/i.test(track.name) && bones.leftHip) {
      const vals = new Float32Array(frameCount * 4);
      for (let i = 0; i < frameCount; i++) {
        const q = leftHipQuats[i];
        vals[i * 4] = q.x;
        vals[i * 4 + 1] = q.y;
        vals[i * 4 + 2] = q.z;
        vals[i * 4 + 3] = q.w;
      }
      baked.tracks[trackIdx] = new QuaternionKeyframeTrack(track.name, times, vals);
    } else if (/RightUpLeg\.quaternion$/i.test(track.name) && bones.rightHip) {
      const vals = new Float32Array(frameCount * 4);
      for (let i = 0; i < frameCount; i++) {
        const q = rightHipQuats[i];
        vals[i * 4] = q.x;
        vals[i * 4 + 1] = q.y;
        vals[i * 4 + 2] = q.z;
        vals[i * 4 + 3] = q.w;
      }
      baked.tracks[trackIdx] = new QuaternionKeyframeTrack(track.name, times, vals);
    }
  }

  return baked;
}
