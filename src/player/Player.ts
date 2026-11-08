import { Group, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3, type Object3D, type Scene } from 'three';
import { buildColliders, type Capsule } from '../physics/BodyColliders';
import { BLOCK, GOAL, PITCH, PLAYER, SHOT, SLIDE, TACKLE } from '../config';
import type { PlayerIntent } from '../controllers/types';
import { angleDelta, clamp, forwardFromYaw, localToWorld, samplePath, yawFromDir } from '../core/math';
import type { SkillDef } from '../skills/skills';
import { Animator } from './Animator';
import { instantiateBody, type CharacterAsset } from './assets';
import { sampleMotion, type Motion } from './motion';

export type Role = 'attacker' | 'defender';
export type PlayerState = 'free' | 'skill' | 'shoot' | 'tackle' | 'stumble' | 'celebrate' | 'receive' | 'block';

const _v = new Vector3();
const _q = new Quaternion();
const _p = { x: 0, z: 0 };
const _m = { x: 0, z: 0, yaw: 0 };

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
  /** capsules on the animated bones (empty for placeholder bodies) */
  readonly colliders: Capsule[];
  private collidersPrimed = false;
  /** how long the current stumble/stagger lasts */
  private stumbleFor: number = TACKLE.stumbleTime;
  /** procedural hit springs layered on top of the animation */
  private readonly springs: { bone: Object3D; axis: Vector3; angle: number; vel: number }[] = [];
  private readonly isPlaceholder: boolean;
  private stridePhase = 0;
  /** [left, right] toe/foot bones of the real model (empty for placeholders) */
  private readonly feet: Object3D[] = [];
  /** world positions/velocities of the feet, refreshed every simulation step */
  readonly footPos = [new Vector3(), new Vector3()];
  readonly footVel = [new Vector3(), new Vector3()];
  private feetPrimed = false;
  /** >0: the game is steering this player onto a loose ball he just knocked on (seconds left) */
  autoChase = 0;
  /** last local forward offset of each foot (dribble beat detection) */
  readonly prevFootZ = [0, 0];
  /** last forward step of each foot (dribble strike = end of the forward swing) */
  readonly prevFootDz = [0, 0];
  /** >0 while a sharp-touch cut animation plays over normal locomotion */
  cutTimer = 0;
  /** dribble touch timing read from the animation (shared, from the asset) */
  readonly contacts: CharacterAsset['dribbleContacts'];
  readonly skillSpots: CharacterAsset['skillSpots'];
  /** measured root motion of the move being played (null = hand-authored playerPath) */
  skillMotion: Motion | null = null;
  /** length of the current skill (the clip's own length for measured moves) */
  skillDuration = 1;
  private readonly motions: CharacterAsset['motions'];
  private readonly refSpeed: CharacterAsset['refSpeed'];

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

    this.colliders = isPlaceholder ? [] : buildColliders(body);
    this.contacts = asset.dribbleContacts;
    this.skillSpots = asset.skillSpots;
    this.motions = asset.motions;
    this.refSpeed = asset.refSpeed;
    this.pos = this.root.position;
    this.animator = new Animator(body, asset.clips);
    scene.add(this.root);
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Normalised progress through the current skill (0..1). */
  get skillT(): number {
    return this.skill ? clamp(this.stateTime / this.skillDuration, 0, 1) : 0;
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

  /** Animated feet positions + velocities (call after the pose was updated for this step). */
  sampleFeet(dt: number): void {
    if (this.feet.length !== 2) return;
    for (let i = 0; i < 2; i++) {
      _v.setFromMatrixPosition(this.feet[i].matrixWorld);
      if (this.feetPrimed) this.footVel[i].subVectors(_v, this.footPos[i]).divideScalar(Math.max(dt, 1e-4));
      this.footPos[i].copy(_v);
    }
    this.feetPrimed = true;
    for (const c of this.colliders) {
      c.pa.copy(c.a);
      c.pb.copy(c.b);
      c.a.setFromMatrixPosition(c.boneA.matrixWorld);
      c.b.setFromMatrixPosition(c.boneB.matrixWorld);
      if (!this.collidersPrimed) {
        c.pa.copy(c.a);
        c.pb.copy(c.b);
      }
    }
    this.collidersPrimed = true;
  }

  /**
   * Knock the player off balance: pushed along (dx, dz), for longer the harder the hit.
   * `anim` picks the reaction clip (stumble forward, stumble back, fall).
   */
  stagger(dx: number, dz: number, strength: number, anim = 'stumble'): void {
    const l = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, Math.max(0, strength));
    this.setState('stumble');
    this.skill = null;
    this.stumbleFor = 0.25 + 0.75 * k;
    this.vel.set((dx / l) * (1 + 3 * k), 0, (dz / l) * (1 + 3 * k));
    this.animator.play(anim, { once: true, duration: this.stumbleFor + 0.1, fade: 0.08 });
  }

  /**
   * Procedural hit: rotate a bone away from the impact and let it spring back, layered over
   * whatever clip is playing - so every contact looks a little different.
   */
  hitReact(bone: Object3D, dirX: number, dirZ: number, strength: number): void {
    // axis perpendicular to the push, in the bone's parent space
    _v.set(dirZ, 0, -dirX).normalize();
    bone.parent?.getWorldQuaternion(_q).invert();
    if (bone.parent) _v.applyQuaternion(_q);
    const existing = this.springs.find((s) => s.bone === bone);
    const kick = Math.min(1, strength) * 9;
    if (existing) {
      existing.axis.copy(_v);
      existing.vel += kick;
    } else this.springs.push({ bone, axis: _v.clone(), angle: 0, vel: kick });
  }

  private applySprings(dt: number): void {
    for (let i = this.springs.length - 1; i >= 0; i--) {
      const s = this.springs[i];
      s.vel += (-160 * s.angle - 14 * s.vel) * dt;
      s.angle += s.vel * dt;
      if (Math.abs(s.angle) < 1e-3 && Math.abs(s.vel) < 1e-2) {
        this.springs.splice(i, 1);
        continue;
      }
      _q.setFromAxisAngle(s.axis, s.angle);
      s.bone.quaternion.premultiply(_q);
    }
  }

  get hasFeet(): boolean {
    return this.feet.length === 2;
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
    // the clip that actually plays: "_R" moves have a real "_L" twin, others a generated "_m" mirror
    // clips authored going LEFT: the plain clip is the left version
    if (def.clipSide === -1) mirror = !mirror;
    this.skillMirror = mirror;
    let anim = def.anim;
    if (mirror) anim = /_R$/.test(anim) ? anim.replace(/_R$/, '_L') : `${anim}_m`;
    if (!this.animator.has(anim) || (mirror && !this.animator.hasExact(anim))) anim = def.anim;
    this.skillMotion = def.measured ? this.motions.get(anim) ?? null : null;
    this.skillDuration = this.skillMotion ? this.skillMotion.duration : def.duration;
    this.setState('skill');
    this.animator.play(anim, { once: true, duration: this.skillDuration, fade: 0.08 });
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
    this.stumbleFor = TACKLE.stumbleTime;
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
        if (this.skill && this.stateTime >= this.skillDuration) {
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
        if (this.stateTime >= this.stumbleFor) this.setState('free');
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
    if (this.skillMotion) {
      // replay the clip's own root path + turn: the feet stay where the animation plants them
      sampleMotion(this.skillMotion, Math.min(this.stateTime, this.skillDuration), _m);
      const prevX = this.pos.x;
      const prevZ = this.pos.z;
      localToWorld(this.skillOrigin, this.skillYaw, _m.x, _m.z, _v);
      this.pos.x = _v.x;
      this.pos.z = _v.z;
      this.yaw = this.skillYaw + _m.yaw;
      this.vel.set(this.pos.x - prevX, 0, this.pos.z - prevZ).multiplyScalar(1 / Math.max(dt, 1e-4));
      return;
    }
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
    const x = clamp(this.pos.x, -PITCH.width / 2 + m, PITCH.width / 2 - m);
    const z = clamp(this.pos.z, GOAL.z + m, PITCH.length / 2 - m);
    if (x !== this.pos.x) this.vel.x = 0;
    if (z !== this.pos.z) this.vel.z = 0;
    this.pos.x = x;
    this.pos.z = z;
  }


  // ---------------------------------------------------------------- visuals

  /** Pick the looping animation for free movement; one-shot actions set their own. */
  updateAnimation(dt: number, jockey: boolean): void {
    if (this.cutTimer > 0) this.cutTimer -= dt;
    if (this.state === 'free' && this.cutTimer <= 0) {
      const s = this.speed;
      let name: string;
      if (s < 0.4) {
        name = jockey ? 'defend_stance' : 'idle';
      } else if (jockey) {
        // pick the shuffle from the direction he's moving relative to where he faces
        const fx = Math.sin(this.yaw);
        const fz = Math.cos(this.yaw);
        const fwd = this.vel.x * fx + this.vel.z * fz;
        const right = -this.vel.x * fz + this.vel.z * fx;
        if (Math.abs(right) > Math.abs(fwd)) name = right > 0 ? 'jockey_R' : 'jockey_L';
        else name = fwd < 0 ? 'jockey_back' : 'defend_stance';
      } else if (this.hasBall) {
        name = s > PLAYER.runSpeed * 0.92 ? 'dribble_sprint' : 'dribble';
      } else {
        name = s > PLAYER.runSpeed * 0.92 ? 'sprint' : 'run';
      }
      this.animator.play(name);
      // play locomotion at the clip's own ground speed -> no foot sliding
      const ref = this.refSpeed.get(this.animator.playingClip) ?? 0;
      if (ref > 0.3) this.animator.setSpeedScale(clamp(s / ref, 0.5, 1.6));
      else this.animator.setSpeedScale(1);
    }
    this.animator.update(dt);
    if (this.springs.length) this.applySprings(dt);
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
