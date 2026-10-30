import { Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type Object3D, type Scene } from 'three';
import { BLOCK, GOAL, PITCH, PLAYER, SHOT, SLIDE, TACKLE } from '../config';
import type { PlayerIntent } from '../controllers/types';
import { angleDelta, clamp, forwardFromYaw, localToWorld, samplePath, yawFromDir } from '../core/math';
import type { SkillDef } from '../skills/skills';
import { Animator } from './Animator';
import { instantiateBody, type CharacterAsset } from './assets';

export type Role = 'attacker' | 'defender';
export type PlayerState = 'free' | 'skill' | 'shoot' | 'tackle' | 'stumble' | 'celebrate' | 'receive' | 'block';

const _v = new Vector3();
const _p = { x: 0, z: 0 };

/**
 * One footballer: movement, facing, action state, animation choice.
 * Ball interaction (possession, kicks, tackles succeeding) is resolved by Match,
 * which reads the public state here.
 */
export class Player {
  readonly root = new Group();
  readonly pos: Vector3;
  readonly vel = new Vector3();
  yaw = 0;
  state: PlayerState = 'free';
  stateTime = 0;
  hasBall = false;
  tackleCooldown = 0;
  /** current tackle is a slide */
  sliding = false;

  // skill
  skill: SkillDef | null = null;
  skillMirror = false;
  readonly skillOrigin = new Vector3();
  skillYaw = 0;
  skillReleased = false;

  // shot
  shot: { speed: number; aimX: number; lift: number } | null = null;
  kickDone = false;

  readonly animator: Animator;
  private readonly body: Object3D;
  private readonly isPlaceholder: boolean;
  private stridePhase = 0;
  /** [left, right] toe/foot bones of the real model (empty for placeholders) */
  private readonly feet: Object3D[] = [];

  constructor(
    scene: Scene,
    asset: CharacterAsset,
    readonly role: Role,
    readonly kitColor: number,
  ) {
    const { body, isPlaceholder } = instantiateBody(asset, kitColor);
    this.body = body;
    this.isPlaceholder = isPlaceholder;
    this.root.add(body);

    // Team ring on the floor - readable from any camera angle, independent of the model's textures.
    const ring = new Mesh(
      new RingGeometry(0.38, 0.48, 32),
      new MeshBasicMaterial({ color: kitColor, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.root.add(ring);

    for (const side of ['Left', 'Right']) {
      let found: Object3D | undefined;
      body.traverse((o) => {
        if (!found && new RegExp(`${side}ToeBase$`).test(o.name)) found = o;
      });
      body.traverse((o) => {
        if (!found && new RegExp(`${side}Foot$`).test(o.name)) found = o;
      });
      if (found) this.feet.push(found);
    }
    if (this.feet.length !== 2) this.feet.length = 0;

    this.pos = this.root.position;
    this.animator = new Animator(body, asset.clips);
    scene.add(this.root);
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Normalised progress through the current skill (0..1). */
  get skillT(): number {
    return this.skill ? clamp(this.stateTime / this.skill.duration, 0, 1) : 0;
  }

  get isProtected(): boolean {
    return this.state === 'skill' && !!this.skill && this.stateTime < this.skill.protectedFor;
  }

  get canAct(): boolean {
    return this.state === 'free' || this.state === 'receive';
  }

  /** Where the feet meet the ball: a point just in front of the player. */
  footPoint(out: Vector3, ahead = 0.45): Vector3 {
    forwardFromYaw(this.yaw, out).multiplyScalar(ahead);
    return out.add(this.pos);
  }

  /** World position of foot i (0 = left, 1 = right) from the animated skeleton. False if unavailable. */
  footWorld(i: number, out: Vector3): boolean {
    const f = this.feet[i];
    if (!f) return false;
    out.setFromMatrixPosition(f.matrixWorld);
    return true;
  }

  teleport(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.setState('free');
    this.skill = null;
    this.shot = null;
    this.tackleCooldown = 0;
  }

  setState(s: PlayerState): void {
    this.state = s;
    this.stateTime = 0;
  }

  // ---------------------------------------------------------------- actions

  startSkill(def: SkillDef, mirror: boolean): void {
    this.skill = def;
    this.skillMirror = mirror;
    this.skillOrigin.copy(this.pos);
    this.skillYaw = this.yaw;
    this.skillReleased = false;
    this.setState('skill');
    this.animator.play(def.anim, { once: true, duration: def.duration, fade: 0.1 });
    // Mirroring the animation itself needs a mirrored clip (see docs/ANIMATION_PIPELINE.md).
  }

  startShoot(power: number, aimX: number): void {
    const speed = SHOT.minSpeed + (SHOT.maxSpeed - SHOT.minSpeed) * power;
    this.shot = { speed, aimX, lift: SHOT.maxLift * power * power };
    this.kickDone = false;
    this.setState('shoot');
    this.animator.play('shoot', { once: true, duration: SHOT.duration, fade: 0.08 });
  }

  startTackle(): void {
    if (this.tackleCooldown > 0) return;
    this.tackleCooldown = TACKLE.cooldown;
    this.sliding = false;
    this.setState('tackle');
    this.animator.play('tackle', { once: true, duration: TACKLE.duration, fade: 0.08 });
  }

  startSlide(): void {
    if (this.tackleCooldown > 0) return;
    this.tackleCooldown = TACKLE.cooldown + SLIDE.missRecovery;
    this.sliding = true;
    this.setState('tackle');
    this.animator.play('slide_tackle', { once: true, duration: SLIDE.duration, fade: 0.06 });
  }

  startBlock(): void {
    this.setState('block');
    this.animator.play('block', { once: true, duration: BLOCK.duration, fade: 0.08 });
  }

  stumble(): void {
    this.setState('stumble');
    this.animator.play('stumble', { once: true, duration: TACKLE.stumbleTime, fade: 0.1 });
  }

  celebrate(): void {
    this.setState('celebrate');
    this.animator.play('celebrate', { fade: 0.25 });
  }

  // ---------------------------------------------------------------- simulation

  update(dt: number, intent: PlayerIntent): void {
    this.stateTime += dt;
    if (this.tackleCooldown > 0) this.tackleCooldown -= dt;

    switch (this.state) {
      case 'free':
      case 'receive':
        this.locomotion(dt, intent);
        if (this.state === 'receive' && this.stateTime > 0.35) this.setState('free');
        break;
      case 'skill':
        this.followSkillPath(dt);
        if (this.skill && this.stateTime >= this.skill.duration) {
          // carry some momentum out of the move
          forwardFromYaw(this.yaw, this.vel).multiplyScalar(PLAYER.runSpeed * 0.6);
          this.skill = null;
          this.setState('free');
        }
        break;
      case 'shoot':
        this.brake(dt, 10);
        if (this.stateTime >= SHOT.duration) this.setState('free');
        break;
      case 'tackle': {
        const dur = this.sliding ? SLIDE.duration : TACKLE.duration;
        const k = Math.max(0, 1 - this.stateTime / dur);
        forwardFromYaw(this.yaw, this.vel).multiplyScalar((this.sliding ? SLIDE.lungeSpeed : TACKLE.lungeSpeed) * k);
        this.pos.addScaledVector(this.vel, dt);
        if (this.stateTime >= dur) this.setState('free');
        break;
      }
      case 'block': {
        this.brake(dt, 14);
        if (this.stateTime >= BLOCK.duration) this.setState('free');
        break;
      }
      case 'stumble':
        this.brake(dt, 6);
        if (this.stateTime >= TACKLE.stumbleTime) this.setState('free');
        break;
      case 'celebrate':
        this.brake(dt, 4);
        break;
    }

    this.confine();
    this.root.rotation.y = this.yaw;
  }

  private locomotion(dt: number, intent: PlayerIntent): void {
    let max = intent.sprint ? PLAYER.sprintSpeed : PLAYER.runSpeed;
    if (this.hasBall) max *= PLAYER.dribbleSpeedFactor;
    if (intent.jockey) max *= 0.75;

    const len = Math.hypot(intent.moveX, intent.moveZ);
    const tx = len > 1 ? intent.moveX / len : intent.moveX;
    const tz = len > 1 ? intent.moveZ / len : intent.moveZ;
    const targetX = tx * max;
    const targetZ = tz * max;

    const dvx = targetX - this.vel.x;
    const dvz = targetZ - this.vel.z;
    const dv = Math.hypot(dvx, dvz);
    const rate = (len > 0.05 ? PLAYER.accel : PLAYER.decel) * dt;
    if (dv <= rate) {
      this.vel.x = targetX;
      this.vel.z = targetZ;
    } else {
      this.vel.x += (dvx / dv) * rate;
      this.vel.z += (dvz / dv) * rate;
    }
    this.pos.addScaledVector(this.vel, dt);

    // Facing
    let fx = 0;
    let fz = 0;
    if (intent.faceX !== undefined && intent.faceZ !== undefined) {
      fx = intent.faceX;
      fz = intent.faceZ;
    } else if (this.speed > 0.3) {
      fx = this.vel.x;
      fz = this.vel.z;
    }
    if (fx !== 0 || fz !== 0) {
      const want = yawFromDir(fx, fz);
      this.yaw += angleDelta(this.yaw, want) * Math.min(1, PLAYER.turnRate * dt);
    }
  }

  private followSkillPath(dt: number): void {
    const def = this.skill!;
    const t = this.skillT;
    samplePath(def.playerPath, t, _p);
    const x = this.skillMirror ? -_p.x : _p.x;
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    localToWorld(this.skillOrigin, this.skillYaw, x, _p.z, _v);
    this.pos.x = _v.x;
    this.pos.z = _v.z;
    // velocity is only used for facing/animation; keep it meaningful
    this.vel.set(this.pos.x - prevX, 0, this.pos.z - prevZ).multiplyScalar(1 / Math.max(dt, 1e-4));
  }

  private brake(dt: number, decel: number): void {
    const s = this.speed;
    if (s < 1e-3) return;
    const ns = Math.max(0, s - decel * dt);
    this.vel.multiplyScalar(ns / s);
    this.pos.addScaledVector(this.vel, dt);
  }

  private confine(): void {
    const m = PLAYER.radius;
    this.pos.x = clamp(this.pos.x, -PITCH.width / 2 + m, PITCH.width / 2 - m);
    this.pos.z = clamp(this.pos.z, GOAL.z + m, PITCH.length / 2 - m);
  }

  // ---------------------------------------------------------------- visuals

  /** Pick the looping animation for free movement; one-shot actions set their own. */
  updateAnimation(dt: number, jockey: boolean): void {
    if (this.state === 'free') {
      const s = this.speed;
      let name: string;
      let ref: number;
      if (s < 0.4) {
        name = jockey ? 'defend_stance' : 'idle';
        ref = 0;
      } else if (jockey) {
        name = 'jockey';
        ref = 2.5;
      } else if (this.hasBall) {
        name = 'dribble';
        ref = PLAYER.runSpeed * PLAYER.dribbleSpeedFactor;
      } else if (s > PLAYER.runSpeed * 1.1) {
        name = 'sprint';
        ref = PLAYER.sprintSpeed;
      } else {
        name = 'run';
        ref = PLAYER.runSpeed;
      }
      this.animator.play(name);
      if (ref > 0) this.animator.setSpeedScale(clamp(s / ref, 0.6, 1.4));
    }
    this.animator.update(dt);
    if (this.isPlaceholder) this.animatePlaceholder(dt);
  }

  /** Swinging legs for the capsule placeholder so movement reads before real art exists. */
  private animatePlaceholder(dt: number): void {
    const s = this.speed;
    this.stridePhase += dt * (4 + s * 2.2);
    const amp = Math.min(0.9, s * 0.15);
    const l = this.body.getObjectByName('legL');
    const r = this.body.getObjectByName('legR');
    if (l && r) {
      let a = Math.sin(this.stridePhase) * amp;
      if (this.state === 'shoot') a = Math.sin(Math.min(1, this.stateTime / SHOT.duration) * Math.PI) * 1.4;
      if (this.state === 'tackle') a = 1.2;
      l.rotation.x = a;
      r.rotation.x = this.state === 'shoot' || this.state === 'tackle' ? 0 : -a;
    }
    this.body.position.y = this.state === 'celebrate' ? Math.abs(Math.sin(this.stateTime * 8)) * 0.4 : 0;
  }
}
