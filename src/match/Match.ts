import { Vector3 } from 'three';
import { BALL, BLOCK, DRIBBLE, GOAL, PLAYER, ROUND, SHOT, SLIDE, TACKLE } from '../config';
import type { Ball } from '../ball/Ball';
import type { DefenderAI } from '../controllers/DefenderAI';
import type { PlayerIntent } from '../controllers/types';
import { damp, forwardFromYaw, localToWorld, rightFromYaw } from '../core/math';
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
  private beatTimer = 0;
  private clock = 0;
  private lastBeatAt = 0;
  private lastTouchAt = 0;
  private beatSeen = false;
  private lastBeatX = 0.1;
  /** measured seconds between dribble beats (adapts to the clip and its playback speed) */
  private beatGap = 0.43;
  /** total ball touches (debug/telemetry) */
  touches = 0;
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
    this.clock += dt;
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

    // ---------------- automation + actions
    if (attIntent !== this.idle) this.assist(attacker, attIntent, dt);
    if (attIntent.sharpTouch && this.phase === 'live') this.sharpTouch(attacker, attIntent.sharpTouch.x, attIntent.sharpTouch.z);
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

  /**
   * The ball while someone owns it. Never glued: it always has a real position + velocity and
   * rolls with turf friction. It only changes course on TOUCHES:
   *  - dribbling: touches happen on the beats of the dribble animation (read from the clip),
   *    and each touch is sized so the ball rolls back under the foot exactly at the next beat
   *  - skills: set the ball, let the animated feet push it, then the decisive "take" touch
   *  - standing: the player steps up to the ball and traps it under the sole
   */
  private carryBall(p: Player, dt: number): void {
    const ball = this.ball;
    this.roll(dt, p.state === 'skill' ? DRIBBLE.skillFriction : DRIBBLE.friction);

    if (p.state === 'skill' && p.skill) {
      this.skillBall(p, dt);
      return;
    }
    if (p.state === 'shoot') {
      // Settle it for the strike in front of the kicking foot.
      forwardFromYaw(p.yaw, _a).multiplyScalar(0.38).add(p.pos);
      const k = damp(14, dt);
      ball.pos.x += (_a.x - ball.pos.x) * k;
      ball.pos.z += (_a.z - ball.pos.z) * k;
      ball.vel.multiplyScalar(0.5);
      return;
    }
    this.dribble(p, dt);
  }

  /** Free rolling for an owned ball (owned balls skip Ball.step's physics). */
  private roll(dt: number, friction: number): void {
    const ball = this.ball;
    const v = ball.vel;
    v.y = 0;
    ball.pos.addScaledVector(v, dt);
    ball.pos.y = BALL.radius;
    const f = Math.max(0, 1 - friction * dt);
    v.x *= f;
    v.z *= f;
  }

  /** Velocity that makes a ball (with exponential friction k) cover `dist` in `t` seconds. */
  private static launchSpeed(dist: number, t: number, k: number): number {
    return (dist * k) / Math.max(1e-3, 1 - Math.exp(-k * Math.max(0.05, t)));
  }

  /** Send the ball so it rolls to world point (tx, tz) in `t` seconds. */
  private sendBallTo(tx: number, tz: number, t: number, friction: number): void {
    const ball = this.ball;
    const dx = tx - ball.pos.x;
    const dz = tz - ball.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) {
      ball.vel.set(0, 0, 0);
      return;
    }
    const sp = Math.min(DRIBBLE.maxTouchSpeed, Match.launchSpeed(d, t, friction));
    ball.vel.set((dx / d) * sp, 0, (dz / d) * sp);
  }

  private dribble(p: Player, dt: number): void {
    const ball = this.ball;
    forwardFromYaw(p.yaw, _f);
    rightFromYaw(p.yaw, _r);
    const s = p.speed;

    // where a foot meets the ball right now
    _a.copy(p.pos).addScaledVector(_f, DRIBBLE.contactZ);
    const toContact = Math.hypot(ball.pos.x - _a.x, ball.pos.z - _a.z);

    if (s < DRIBBLE.standSpeed) {
      // Standing: ball dies on the turf and is trapped under the sole when he reaches it.
      const k = Math.max(0, 1 - DRIBBLE.trapFriction * dt);
      ball.vel.x *= k;
      ball.vel.z *= k;
      _b.copy(p.pos).addScaledVector(_f, 0.36);
      if (Math.hypot(ball.pos.x - _b.x, ball.pos.z - _b.z) < 0.22) ball.vel.multiplyScalar(0.6);
      return;
    }

    // Beat: an animated foot swinging forward through the contact line, low to the ground.
    // Read live from the skeleton, so it is in sync with whatever the legs are doing on screen.
    let beat = false;
    let nextX = -this.lastBeatX;
    if (p.hasFeet) {
      for (let k = 0; k < 2; k++) {
        const fp = p.footPos[k];
        const lz = (fp.x - p.pos.x) * _f.x + (fp.z - p.pos.z) * _f.z;
        const prev = p.prevFootZ[k];
        p.prevFootZ[k] = lz;
        if (prev < DRIBBLE.contactZ && lz >= DRIBBLE.contactZ && fp.y < DRIBBLE.footLift + 0.1) {
          // only a real touch if this foot is actually at the ball
          if (Math.hypot(fp.x - ball.pos.x, fp.z - ball.pos.z) < DRIBBLE.footReach) beat = true;
          this.beatSeen = true;
          const lx = (fp.x - p.pos.x) * _r.x + (fp.z - p.pos.z) * _r.z;
          this.lastBeatX = lx;
          nextX = -lx; // the other foot takes the next touch
        }
      }
    } else {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        beat = true;
        this.beatTimer = DRIBBLE.fallbackBeat;
      }
    }
    if (this.beatSeen) {
      this.beatSeen = false;
      const gap = this.clock - this.lastBeatAt;
      if (gap > 0.15 && gap < 1.2) this.beatGap += (gap - this.beatGap) * 0.5;
      this.lastBeatAt = this.clock;
    }
    const next = this.beatGap;

    const rx = ball.pos.x - p.pos.x;
    const rz = ball.pos.z - p.pos.z;
    const ahead = rx * _f.x + rz * _f.z;
    const urgent = ahead < 0.12; // he's running onto it - must touch now

    const ready = this.clock - this.lastTouchAt > DRIBBLE.minTouchGap;
    if (ready && ((beat && toContact < DRIBBLE.reach) || (urgent && toContact < DRIBBLE.reach + 0.2))) {
      this.lastTouchAt = this.clock;
      // Touch: aim the ball at where the foot will be at the NEXT beat.
      const t = Math.max(DRIBBLE.minBeat, next);
      _b.copy(p.pos).addScaledVector(p.vel, t).addScaledVector(_f, DRIBBLE.contactZ + 0.05).addScaledVector(_r, nextX * 0.7);
      this.sendBallTo(_b.x, _b.z, t, DRIBBLE.friction);
      this.touches++;
    }
  }

  /** Ball handling during a skill: set → animated feet → decisive take. */
  private skillBall(p: Player, dt: number): void {
    const def = p.skill!;
    const ball = this.ball;
    const t = p.skillT;
    const mx = p.skillMirror ? -1 : 1;

    // 1. SET: ease the ball onto the spot the move is built around
    if (def.set && p.stateTime < DRIBBLE.setTime) {
      // measured spot from the clip wins (the clip itself isn't mirrored, so neither is its spot)
      const spot = p.skillSpots.get(def.anim);
      if (spot) localToWorld(p.pos, p.yaw, spot.x, spot.z, _a);
      else localToWorld(p.pos, p.yaw, def.set.x * mx, def.set.z, _a);
      const k = damp(18, dt);
      ball.pos.x += (_a.x - ball.pos.x) * k;
      ball.pos.z += (_a.z - ball.pos.z) * k;
      ball.vel.multiplyScalar(0.3);
      return;
    }

    // 3. TAKE
    if (!p.skillReleased && t >= def.take.t) {
      p.skillReleased = true;
      localToWorld(p.skillOrigin, p.skillYaw, def.take.x * mx, def.take.z, _a);
      const arrive = def.take.arriveIn ?? Math.max(0.25, (1 - def.take.t) * def.duration + 0.15);
      this.sendBallTo(_a.x, _a.z, arrive, DRIBBLE.friction);
      if (def.take.chase) {
        ball.kick(p, ball.vel.x, 0, ball.vel.z);
        ball.noPickupTimer = 0.2;
        p.autoChase = 1.6;
      }
      this.touches++;
      return;
    }

    // 2. FEET: an animated foot sweeping low through the ball pushes it
    if (def.footPush && !p.skillReleased && p.hasFeet) {
      for (let i = 0; i < 2; i++) {
        const fp = p.footPos[i];
        const fv = p.footVel[i];
        if (fp.y > DRIBBLE.footLift) continue;
        const dx = ball.pos.x - fp.x;
        const dz = ball.pos.z - fp.z;
        const d = Math.hypot(dx, dz);
        if (d > DRIBBLE.footContact || d < 1e-4) continue;
        const into = (fv.x * dx + fv.z * dz) / d; // foot speed toward the ball
        if (into < 0.4) continue;
        const sp = Math.min(DRIBBLE.maxFootPush, Math.hypot(fv.x, fv.z));
        const fl = Math.hypot(fv.x, fv.z) || 1;
        ball.vel.set((fv.x / fl) * sp, 0, (fv.z / fl) * sp);
        ball.pos.x = fp.x + (dx / d) * DRIBBLE.footContact;
        ball.pos.z = fp.z + (dz / d) * DRIBBLE.footContact;
      }
      // never let a fake lose the ball
      const rx = ball.pos.x - p.pos.x;
      const rz = ball.pos.z - p.pos.z;
      const r = Math.hypot(rx, rz);
      if (r > DRIBBLE.skillLeash) {
        ball.pos.x = p.pos.x + (rx / r) * DRIBBLE.skillLeash;
        ball.pos.z = p.pos.z + (rz / r) * DRIBBLE.skillLeash;
        ball.vel.multiplyScalar(0.2);
      }
    }
  }

  /**
   * Automation layer for the human attacker, applied to his intent before he moves:
   *  - after a knock-on he sprints onto the ball by himself
   *  - while dribbling, his line bends toward the ball so he can't run away from it
   *  - no input + ball a step away: he steps up to it
   */
  private assist(p: Player, i: PlayerIntent, dt: number): void {
    const ball = this.ball;
    if (p.autoChase > 0) {
      p.autoChase -= dt;
      if (ball.owner === p || (ball.owner && ball.owner !== p)) {
        p.autoChase = 0;
      } else {
        const lead = 0.25;
        i.moveX = ball.pos.x + ball.vel.x * lead - p.pos.x;
        i.moveZ = ball.pos.z + ball.vel.z * lead - p.pos.z;
        i.sprint = true;
        return;
      }
    }
    if (ball.owner !== p || p.state !== 'free') return;
    const dx = ball.pos.x - p.pos.x;
    const dz = ball.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const inLen = Math.hypot(i.moveX, i.moveZ);
    if (inLen < 0.1) {
      if (d > 0.5) {
        const k = Math.min(1, (d - 0.35) * 1.2) * 0.55;
        i.moveX = (dx / d) * k;
        i.moveZ = (dz / d) * k;
        i.sprint = false;
      }
      return;
    }
    // bend the run toward the ball when it is drifting off his line
    const cross = Math.abs((i.moveX * dz - i.moveZ * dx) / (inLen * Math.max(d, 1e-3)));
    if (d > 0.7 && cross > 0.35) {
      const w = Math.min(0.7, (cross - 0.35) * 1.5);
      i.moveX = i.moveX / inLen * (1 - w) + (dx / d) * w;
      i.moveZ = i.moveZ / inLen * (1 - w) + (dz / d) * w;
    }
  }

  /** Sharp touch: a quick cut that knocks the ball into the new direction (Dash tap + direction). */
  private sharpTouch(p: Player, dirX: number, dirZ: number): void {
    const ball = this.ball;
    if (ball.owner !== p || p.state !== 'free') return;
    const l = Math.hypot(dirX, dirZ);
    if (l < 0.1) return;
    if (Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z) > 1.1) return;
    const nx = dirX / l;
    const nz = dirZ / l;
    p.yaw = Math.atan2(nx, nz);
    const sp = p.speed;
    p.vel.set(nx * sp * 0.7, 0, nz * sp * 0.7);
    this.sendBallTo(p.pos.x + nx * 1.6, p.pos.z + nz * 1.6, 0.45, DRIBBLE.friction);
    p.animator.play('cut', { once: true, duration: 0.45, fade: 0.06 });
    p.cutTimer = 0.45;
    this.touches++;
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
    best.autoChase = 0;
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
