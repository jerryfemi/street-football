import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import { ANIM_FALLBACKS } from '../config';

export interface PlayOptions {
  /** crossfade seconds */
  fade?: number;
  /** play once and hold the last frame (skills, shots, tackles) */
  once?: boolean;
  /** stretch/squash so the clip lasts exactly this long (keeps animation in sync with gameplay timing) */
  duration?: number;
  timeScale?: number;
}

/**
 * Thin wrapper around THREE.AnimationMixer:
 *  - plays clips by gameplay name ("dribble", "skill_stepover", …)
 *  - resolves missing clips through ANIM_FALLBACKS
 *  - crossfades between them
 * Gameplay decides WHAT to play; this class only knows HOW.
 */
export class Animator {
  private readonly mixer: AnimationMixer | null;
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;
  private currentName = '';

  constructor(root: Object3D, clips: Map<string, AnimationClip>) {
    this.mixer = clips.size > 0 ? new AnimationMixer(root) : null;
    if (!this.mixer) return;
    for (const [name, clip] of clips) this.actions.set(name, this.mixer.clipAction(clip));
  }

  get hasClips(): boolean {
    return this.actions.size > 0;
  }

  get playing(): string {
    return this.currentName;
  }

  has(name: string): boolean {
    return this.resolve(name) !== null;
  }

  private resolve(name: string): AnimationAction | null {
    const direct = this.actions.get(name);
    if (direct) return direct;
    for (const alt of ANIM_FALLBACKS[name] ?? []) {
      const a = this.actions.get(alt);
      if (a) return a;
    }
    return this.actions.get('idle') ?? null;
  }

  play(name: string, opts: PlayOptions = {}): void {
    if (!this.mixer) return;
    if (name === this.currentName && !opts.once) return;
    const next = this.resolve(name);
    if (!next) return;
    const fade = opts.fade ?? 0.2;

    next.enabled = true;
    next.setEffectiveWeight(1);
    if (opts.once) {
      next.setLoop(LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    let ts = opts.timeScale ?? 1;
    if (opts.duration) ts = next.getClip().duration / opts.duration;
    next.setEffectiveTimeScale(ts);

    if (next !== this.current || opts.once) next.reset();
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.currentName = name;
  }

  /** Scale locomotion playback with movement speed so feet don't skate. */
  setSpeedScale(scale: number): void {
    this.current?.setEffectiveTimeScale(scale);
  }

  update(dt: number): void {
    this.mixer?.update(dt);
  }
}
