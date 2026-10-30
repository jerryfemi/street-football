import { Vector3 } from 'three';
import { BALL, BLOCK, DRIBBLE, GOAL, PLAYER, ROUND, SHOT, SLIDE, TACKLE } from '../config';
import type { Ball } from '../ball/Ball';
import type { DefenderAI } from '../controllers/DefenderAI';
import type { PlayerIntent } from '../controllers/types';
import { damp, forwardFromYaw, localToWorld, rightFromYaw, samplePath } from '../core/math';
import type { Player } from '../player/Player';
import { SKILLS } from '../skills/skills';

export type Phase = 'check' | 'live' | 'goal' | 'defended' | 'matchOver';

export interface MatchListener {
  onMessage(text: string, tone: 'info' | 'good' | 'bad'): void;
  onScore(attacker: number, defender: number): void;
}

const _a = new Vector3();
const _b = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const _p = { x: 0, z: 0 };
const ORIGIN = new Vector3();

/**
 * Rules of a street 1v1 duel + every ball/player interaction:
 *
 *   CHECK    defender holds the ball, passes it to the attacker ("check ball")
 *   LIVE     attacker receives -> shot clock runs. Goal = attacker point.
 *            Defender wins the ball / shot clock expires = defender point.
 *   GOAL / DEFENDED   short pause, then reset. First to ROUND.pointsToWin.
 *
 * Players only express intent; this class decides what actually happens to the ball.
 */
export class Match {
  phase: Phase = 'check';
  phaseTime = 0;
  shotClock: number = ROUND.shotClock;
  readonly score = { attacker: 0, defender: 0 };
  private touchCooldown = 0;
  private lastFoot = 1;
  private tackleHit = false;
  private missedTackle = false;
  private readonly idle: PlayerIntent = {
    moveX: 0, moveZ: 0, sprint: false, jockey: false, shoot: null, skill: null, tackle: false,
  };

  constructor(
    private readonly ball: Ball,
    readonly attacker: Player,
    readonly defender: Player,
    private readonly defenderAI: DefenderAI,
    private readonly listener: MatchListener,
  ) {
    this.resetRound();
  }

  resetRound(): void {
    this.attacker.teleport(0, 5, Math.PI); // facing the goal (-Z)
    this.defender.teleport(0, -2.5, 0); // facing the attacker (+Z)
    this.defender.footPoint(_a);
    this.ball.place(_a.x, _a.z);
    this.ball.owner = this.defender;
    this.shotClock = ROUND.shotClock;
    this.setPhase('check');
    this.listener.onMessage('CHECK BALL', 'info');
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  step(dt: number, attIntent: PlayerIntent, defIntent: PlayerIntent): void {
    this.phaseTime += dt;
    const { attacker, defender, ball } = this;

    // ---------------- phase logic
    let defI = defIntent;
    switch (this.phase) {
      case 'check':
        defI = this.idle;
        if (ball.owner === defender && this.phaseTime > 0.9) this.checkPass();
        break;
      case 'live':
        this.shotClock -= dt;
        if (this.shotClock <= 0) this.endRound('defended', 'SHOT CLOCK!');
        break;
      case 'goal':
      case 'defended':
        attIntent = this.idle;
        defI = this.idle;
        if (this.phaseTime > ROUND.resetDelay) {
          if (this.score.attacker >= ROUND.pointsToWin || this.score.defender >= ROUND.pointsToWin) {
            const won = this.score.attacker > this.score.defender;
            this.listener.onMessage(won ? 'YOU WIN THE DUEL' : 'DEFENDER WINS', won ? 'good' : 'bad');
            this.setPhase('matchOver');
          } else {
            this.resetRound();
          }
        }
        break;
      case 'matchOver':
        attIntent = this.idle;
        defI = this.idle;
        if (this.phaseTime > 3) {
          this.score.attacker = this.score.defender = 0;
          this.listener.onScore(0, 0);
          this.resetRound();
        }
        break;
    }

    attacker.hasBall = ball.owner === attacker;
    defender.hasBall = ball.owner === defender;

    // ---------------- actions
    this.applyActions(attacker, attIntent);
    if (this.phase === 'live') this.applyActions(defender, defI);

    // ---------------- movement
    attacker.update(dt, attIntent);
    defender.update(dt, defI);
    if (this.missedTackle && defender.state === 'free') {
      this.missedTackle = false;
      defender.stumble(); // committing and missing costs you
    }
    this.separatePlayers();

    // ---------------- ball
    this.resolveKick(attacker);
    this.resolveKick(defender);
    this.resolveTackle();

    if (ball.owner) {
      this.carryBall(ball.owner, dt);
      ball.step(dt);
    } else {
      const ev = ball.step(dt);
      if (ev === 'goal' && this.phase === 'live') {
        this.score.attacker++;
        this.listener.onScore(this.score.attacker, this.score.defender);
        attacker.celebrate();
        this.endRound('goal', 'GOAL!');
      }
      this.bodyBlocks();
      this.pickups();
    }
  }

  private applyActions(p: Player, intent: PlayerIntent): void {
    if (!p.canAct) return;
    if (intent.skill && p.hasBall && this.phase === 'live') {
      const def = SKILLS[intent.skill.id];
      if (def) {
        p.startSkill(def, intent.skill.mirror);
        if (p === this.attacker) this.defenderAI.onOpponentSkill(def, intent.skill.mirror);
      }
    } else if (intent.shoot && p.hasBall && this.phase === 'live') {
      p.startShoot(intent.shoot.power, intent.shoot.aimX);
    } else if (intent.block && !p.hasBall && this.phase === 'live') {
      p.startBlock();
    } else if (intent.tackle && !p.hasBall && this.phase === 'live') {
      if (intent.slide) p.startSlide();
      else p.startTackle();
      if (p.state === 'tackle') this.tackleHit = false;
    }
  }

  private checkPass(): void {
    const { defender, attacker, ball } = this;
    defender.animator.play('pass', { once: true, duration: 0.5, fade: 0.1 });
    _a.subVectors(attacker.pos, ball.pos).setY(0).normalize().multiplyScalar(7.5);
    ball.kick(defender, _a.x, 0, _a.z);
  }

  private endRound(kind: 'goal' | 'defended', text: string): void {
    if (this.phase !== 'live') return;
    if (kind === 'defended') {
      this.score.defender++;
      this.listener.onScore(this.score.attacker, this.score.defender);
    }
    this.setPhase(kind);
    this.listener.onMessage(text, kind === 'goal' ? 'good' : 'bad');
  }

  /** Kinematic ball while someone owns it: dribble offset, or the skill's scripted path. */
  private carryBall(p: Player, dt: number): void {
    const ball = this.ball;
    const skill = p.state === 'skill' ? p.skill : null;

    if (skill?.ballPath) {
      samplePath(skill.ballPath, p.skillT, _p);
      localToWorld(p.skillOrigin, p.skillYaw, p.skillMirror ? -_p.x : _p.x, _p.z, _a);
      ball.pos.set(_a.x, BALL.radius, _a.z);
      return;
    }
    if (skill?.release && !p.skillReleased && p.skillT >= skill.release.t) {
      p.skillReleased = true;
      const vx = p.skillMirror ? -skill.release.vx : skill.release.vx;
      localToWorld(ORIGIN, p.skillYaw, vx, skill.release.vz, _a);
      ball.kick(p, _a.x, skill.release.vy ?? 0, _a.z);
      ball.noPickupTimer = 0.25;
      return;
    }

    if (p.state === 'shoot') {
      // Set the ball for the strike: settle it just in front of the kicking foot.
      forwardFromYaw(p.yaw, _a).multiplyScalar(0.35).add(p.pos);
      const k = damp(16, dt);
      ball.pos.x += (_a.x - ball.pos.x) * k;
      ball.pos.z += (_a.z - ball.pos.z) * k;
      ball.pos.y = BALL.radius;
      ball.vel.set(0, 0, 0);
      return;
    }
    this.dribble(p, dt);
  }

  /**
   * Touch-based dribbling. The ball is NOT glued to the player: each touch knocks it ahead
   * with real velocity, it rolls and slows on the turf, the player catches up and touches again.
   * Touches fire when an animated foot actually sweeps into the ball (so they line up with the
   * dribble clip), or when the ball falls too close / drifts sideways (safety net).
   * Faster = bigger touches = more of a gap for a defender to nick it.
   */
  private dribble(p: Player, dt: number): void {
    const ball = this.ball;
    const v = ball.vel;
    forwardFromYaw(p.yaw, _f);
    rightFromYaw(p.yaw, _r);

    // roll
    ball.pos.addScaledVector(v, dt);
    ball.pos.y = BALL.radius;
    v.y = 0;
    const fr = Math.max(0, 1 - DRIBBLE.friction * dt);
    v.x *= fr;
    v.z *= fr;
    if (this.touchCooldown > 0) this.touchCooldown -= dt;

    const rx = ball.pos.x - p.pos.x;
    const rz = ball.pos.z - p.pos.z;
    const ahead = rx * _f.x + rz * _f.z;
    const side = rx * _r.x + rz * _r.z;
    const s = p.speed;

    if (s < DRIBBLE.standSpeed) {
      // Standing on the ball: it settles just in front of the stronger foot.
      _a.copy(p.pos).addScaledVector(_f, 0.4).addScaledVector(_r, 0.09 * this.lastFoot);
      if (Math.hypot(_a.x - ball.pos.x, _a.z - ball.pos.z) > 0.6) {
        // Stopped with the ball still running on: let it die on the turf (never roll it back to him).
        const k = Math.max(0, 1 - 4 * dt);
        v.x *= k;
        v.z *= k;
        return;
      }
      v.x += ((_a.x - ball.pos.x) * 28 - v.x * 9) * dt;
      v.z += ((_a.z - ball.pos.z) * 28 - v.z * 9) * dt;
      return;
    }

    // never let the ball end up under/behind the player
    if (ahead < 0.15) ball.pos.addScaledVector(_f, 0.15 - ahead);

    let touch = ahead < DRIBBLE.minAhead + s * 0.02 || Math.abs(side) > DRIBBLE.maxSide;
    let foot = -this.lastFoot;
    if (!touch && ahead < DRIBBLE.footReachAhead) {
      // animated foot contact
      for (let i = 0; i < 2; i++) {
        if (p.footWorld(i, _b) && Math.hypot(_b.x - ball.pos.x, _b.z - ball.pos.z) < DRIBBLE.footContact) {
          touch = true;
          foot = i === 0 ? -1 : 1;
          break;
        }
      }
    }

    if (touch && this.touchCooldown <= 0) {
      this.lastFoot = foot;
      const push = DRIBBLE.pushBase + s * DRIBBLE.pushPerSpeed;
      v.x = p.vel.x + _f.x * push - _r.x * side * DRIBBLE.recentre + _r.x * foot * 0.2;
      v.z = p.vel.z + _f.z * push - _r.z * side * DRIBBLE.recentre + _r.z * foot * 0.2;
      this.touchCooldown = DRIBBLE.minTouchGap;
    }

    // leash: a dribble touch never runs away from you completely
    if (ahead > DRIBBLE.maxLead) {
      const along = v.x * _f.x + v.z * _f.z;
      const excess = along - Math.min(s, along);
      if (excess > 0) {
        v.x -= _f.x * excess;
        v.z -= _f.z * excess;
      }
    }
  }

  private resolveKick(p: Player): void {
    if (p.state !== 'shoot' || p.kickDone || !p.shot || p.stateTime < SHOT.contactTime) return;
    p.kickDone = true;
    if (this.ball.owner !== p) return;
    const { speed, aimX, lift } = p.shot;
    // Aim at a point on the goal line, slightly randomised (more power = less accuracy).
    const spread = 0.25 + speed * 0.012;
    const tx = aimX * (GOAL.width / 2 - 0.35) + (Math.random() - 0.5) * spread;
    const ty = 0.3 + lift * 3;
    _a.set(tx - this.ball.pos.x, 0, GOAL.z - this.ball.pos.z).normalize();
    const vy = lift * speed + ty * 0.5;
    this.ball.kick(p, _a.x * speed, vy, _a.z * speed);
  }

  private resolveTackle(): void {
    const d = this.defender;
    if (d.state !== 'tackle' || this.tackleHit) return;
    const from = d.sliding ? SLIDE.activeFrom : TACKLE.activeFrom;
    const to = d.sliding ? SLIDE.activeTo : TACKLE.activeTo;
    const reach = d.sliding ? SLIDE.reach : TACKLE.reach;
    if (d.stateTime < from) return;
    if (d.stateTime > to) {
      this.tackleHit = true;
      this.missedTackle = true;
      return;
    }
    const ball = this.ball;
    if (ball.owner !== this.attacker || this.attacker.isProtected) return;
    d.footPoint(_a, 0.6);
    if (_a.distanceTo(ball.pos) < reach) {
      this.tackleHit = true;
      forwardFromYaw(d.yaw, _b).multiplyScalar(3.5);
      ball.kick(d, _b.x, 0.5, _b.z);
      this.attacker.stumble();
      this.endRound('defended', 'TACKLED!');
    }
  }

  /** A loose fast ball hitting a body is deflected - that's how blocks happen. */
  private bodyBlocks(): void {
    const ball = this.ball;
    if (ball.pos.y > 1.6) return;
    for (const p of [this.attacker, this.defender]) {
      if (ball.lastTouch === p && ball.noPickupTimer > 0) continue;
      const dx = ball.pos.x - p.pos.x;
      const dz = ball.pos.z - p.pos.z;
      const r = PLAYER.radius + BALL.radius + (p.state === 'block' ? BLOCK.extraRadius : 0);
      const d2 = dx * dx + dz * dz;
      const speed = Math.hypot(ball.vel.x, ball.vel.z);
      if (d2 < r * r && d2 > 1e-8 && speed > 6) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const vn = ball.vel.x * nx + ball.vel.z * nz;
        if (vn < 0) {
          ball.vel.x -= 1.4 * vn * nx;
          ball.vel.z -= 1.4 * vn * nz;
          ball.vel.multiplyScalar(0.5);
          ball.pos.x = p.pos.x + nx * r;
          ball.pos.z = p.pos.z + nz * r;
          ball.lastTouch = p;
          ball.noPickupTimer = 0.15;
          if (p === this.defender && this.phase === 'live') this.listener.onMessage('BLOCKED', 'bad');
        }
      }
    }
  }

  private pickups(): void {
    const ball = this.ball;
    if (ball.pos.y > 0.6) return;
    let best: Player | null = null;
    let bestD: number = BALL.pickupRadius;
    for (const p of [this.attacker, this.defender]) {
      if (p.state === 'stumble' || p.state === 'celebrate' || p.state === 'shoot') continue;
      if (p.state === 'skill' && !p.skillReleased) continue;
      if (ball.lastTouch === p && ball.noPickupTimer > 0) continue;
      if (p === this.defender && this.phase === 'check') continue;
      p.footPoint(_a, 0.35);
      const d = Math.hypot(_a.x - ball.pos.x, _a.z - ball.pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;

    const incoming = Math.hypot(ball.vel.x, ball.vel.z);
    ball.owner = best;
    ball.lastTouch = best;
    ball.vel.multiplyScalar(0.2); // cushioned first touch
    ball.vel.y = 0;
    if (best.state === 'skill') {
      best.skill = null;
      best.setState('free');
    }
    if (incoming > 5 && best.speed < 2 && best.canAct) {
      best.setState('receive');
      best.animator.play('receive', { once: true, duration: 0.5, fade: 0.1 });
    }

    if (this.phase === 'check' && best === this.attacker) {
      this.setPhase('live');
      this.listener.onMessage('GO!', 'info');
    } else if (this.phase === 'live' && best === this.defender) {
      this.endRound('defended', 'DEFENDED!');
    }
  }

  private separatePlayers(): void {
    const a = this.attacker.pos;
    const b = this.defender.pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const min = PLAYER.radius * 2;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
  }
}
