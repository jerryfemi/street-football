import {
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  type AnimationAction,
  type Object3D,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { ClipEntry } from '../state/project';

const _v = new Vector3();

export class CharacterRig {
  readonly body: Object3D;
  private readonly mixer: AnimationMixer;
  private currentAction: AnimationAction | null = null;
  private currentClip: AnimationClip | null = null;
  private leftToe: Object3D | null = null;
  private rightToe: Object3D | null = null;
  private leftAnkle: Object3D | null = null;
  private rightAnkle: Object3D | null = null;

  constructor(template: Object3D, scale: number) {
    this.body = cloneSkinned(template);
    this.body.scale.setScalar(scale);

    this.body.traverse((o) => {
      if (/LeftToeBase$/i.test(o.name)) this.leftToe = o;
      if (/RightToeBase$/i.test(o.name)) this.rightToe = o;
      if (/LeftFoot$/i.test(o.name)) this.leftAnkle = o;
      if (/RightFoot$/i.test(o.name)) this.rightAnkle = o;
      o.castShadow = true;
      o.receiveShadow = true;
    });

    this.mixer = new AnimationMixer(this.body);
  }

  playClip(clip: AnimationClip, entry: ClipEntry): void {
    this.currentClip = clip;
    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    this.currentAction = action;

    // Set to in-point
    this.setTime(0, entry);
  }

  /** Time is in seconds from trimmed in-point (t = 0 corresponds to raw t = entry.in) */
  setTime(tTrimmed: number, entry: ClipEntry): void {
    if (!this.currentAction || !this.currentClip) return;
    const rawT = Math.min(entry.out, Math.max(entry.in, entry.in + tTrimmed));
    this.mixer.setTime(rawT);
    this.body.updateMatrixWorld(true);
  }

  getLeftFootPos(out: Vector3): Vector3 {
    if (this.leftToe) return this.leftToe.getWorldPosition(out);
    return out.set(-0.12, 0, 0);
  }

  getRightFootPos(out: Vector3): Vector3 {
    if (this.rightToe) return this.rightToe.getWorldPosition(out);
    return out.set(0.12, 0, 0);
  }

  getLeftAnklePos(out: Vector3): Vector3 {
    if (this.leftAnkle) return this.leftAnkle.getWorldPosition(out);
    return out.set(-0.12, 0.08, 0);
  }

  getRightAnklePos(out: Vector3): Vector3 {
    if (this.rightAnkle) return this.rightAnkle.getWorldPosition(out);
    return out.set(0.12, 0.08, 0);
  }

  getFeetCenter(out: Vector3): Vector3 {
    this.getLeftFootPos(out);
    this.getRightFootPos(_v);
    out.add(_v).multiplyScalar(0.5);
    return out;
  }
}
