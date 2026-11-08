import { Vector3, type Object3D } from 'three';
import { BALL, BLOCK, CONTACT, DRIBBLE, GOAL, PLAYER, RESTITUTION, ROUND, SHOT, SLIDE, TACKLE, FREE_PLAY } from '../config';
import { closestOnSegment, segmentsCrossXZ, type BodyPart } from '../physics/BodyColliders';
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
const _c = new Vector3();
const _n = new Vector3();
const _q = new Vector3();
const _vp = new Vector3();
const _vb = new Vector3();
const _rel = new Vector3();
const _prev = new Vector3();
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
  private pannaUntil = 0;
  /** seconds the ball has been within a foot's reach, [attacker, defender] */
  private readonly reachTime = [0, 0];
  private lastNutmegAt = -9;
  private ghostUntil = -9;
  private lastImpactAt = -9;
  private lastShotAt = -9;
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
    if (FREE_PLAY) {
      // test mode: start live with the ball at his feet
      this.attacker.footPoint(_a);
      this.ball.place(_a.x, _a.z);
      this.ball.owner = this.attacker;
      this.setPhase('live');
      return;
    }
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
        // no shot clock - play freely
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

    _prev.copy(ball.pos);
    if (ball.owner) {
      const o = ball.owner;
      this.carryBall(o, dt);
      // the dribbled ball can run into the defender's legs (or slip through them)
      if (o === attacker && this.phase === 'live') {
        if (!this.ballVsBody(defender, _prev, dt)) this.checkNutmeg(_prev);
      }
      // Lost touch: ball got away from him - it's loose now and he goes after it automatically.
      if (ball.owner === o && o.state === 'free' && Math.hypot(ball.pos.x - o.pos.x, ball.pos.z - o.pos.z) > DRIBBLE.loseDistance) {
        ball.owner = null;
        ball.lastTouch = o;
        ball.noPickupTimer = 0;
        if (o === attacker) o.autoChase = 1.2;
      }
      ball.step(dt);
    } else {
      const ev = ball.step(dt);
      if (ev === 'goal' && this.phase === 'live') {
        this.score.attacker++;
        this.listener.onScore(this.score.attacker, this.score.defender);
        attacker.celebrate();
        this.endRound('goal', 'GOAL!');
      }
      // controllable balls are trapped first; only what isn't collected bounces off bodies
      this.pickups();
      if (!ball.owner) {
        let hit = false;
        const spd = Math.hypot(ball.vel.x, ball.vel.z);
        for (const p of [attacker, defender]) {
          // the player who just kicked it doesn't collide with it for a moment
          if (ball.lastTouch === p && ball.noPickupTimer > 0) continue;
          // a slow ball doesn't get "kicked" by the attacker's own running legs - he's going to trap it
          if (p === attacker && spd < CONTACT.controlSpeed) continue;
          if (p.colliders.length) hit = this.ballVsBody(p, _prev, dt) || hit;
        }
        if (!hit && ball.lastTouch === attacker) this.checkNutmeg(_prev);
        this.bodyBlocks(); // placeholder bodies only
      }
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

  private endRound(kind: 'goal' | 'defended' | 'foul', text: string): void {
    if (this.phase !== 'live') return;
    if (FREE_PLAY) {
      // test mode: no rounds, no score - a goal just gives him the ball back at the top
      if (kind === 'goal') {
        this.attacker.teleport(0, 5, Math.PI);
        this.attacker.footPoint(_a);
        this.ball.place(_a.x, _a.z);
        this.ball.owner = this.attacker;
      }
      return;
    }
    if (kind === 'foul') {
      // foul: no point either way, replay the round
      this.setPhase('defended');
      this.listener.onMessage(text, 'info');
      return;
    }
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
        const dz = lz - prev;
        const wasSwinging = p.prevFootDz[k] > 0;
        p.prevFootZ[k] = lz;
        p.prevFootDz[k] = dz;
        // the strike: the swinging foot reaches the front of its arc, low to the ground
        // (works at any playback speed, unlike a fixed line the foot may never cross)
        const peak = wasSwinging && dz <= 0 && lz > DRIBBLE.peakMinZ && fp.y < DRIBBLE.footLift + 0.12;
        // or the foot sweeping through the contact line (fast playback can skip the peak frame)
        const cross = prev < DRIBBLE.contactZ && lz >= DRIBBLE.contactZ && fp.y < DRIBBLE.footLift + 0.1;
        if (peak || cross) {
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
    // Turning: once he's facing well away from where the ball is rolling, take it with him.
    const bd = Math.hypot(rx, rz);
    if (bd > 0.2 && bd < DRIBBLE.turnReach && this.clock - this.lastTouchAt > DRIBBLE.minTouchGap && ahead / bd < DRIBBLE.turnCos) {
      this.lastTouchAt = this.clock;
      const t = Math.max(DRIBBLE.minBeat, this.beatGap);
      _b.copy(p.pos).addScaledVector(p.vel, t).addScaledVector(_f, DRIBBLE.contactZ + 0.05);
      this.sendBallTo(_b.x, _b.z, t, DRIBBLE.friction);
      this.touches++;
      return;
    }
    const urgent = ahead < 0.1 || this.clock - this.lastTouchAt > 1.1; // running onto it, or overdue

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
      const m = p.skillMotion;
      const left = p.skillDuration * (1 - t);
      if (def.take.toEnd && m) {
        // to where he will be when the move ends, just in front of his final facing
        const n = m.x.length - 1;
        localToWorld(p.skillOrigin, p.skillYaw, m.x[n], m.z[n], _a);
        const endYaw = p.skillYaw + m.yaw[n];
        const lead = def.take.lead ?? 0.45;
        _a.x += Math.sin(endYaw) * lead;
        _a.z += Math.cos(endYaw) * lead;
      } else {
        localToWorld(p.skillOrigin, p.skillYaw, def.take.x * mx, def.take.z, _a);
      }
      const arrive = def.take.arriveIn ?? Math.max(0.25, left + 0.12);
      if (def.take.lift) {
        // airborne flick: straight-line flight, gravity does the arc
        const dx = _a.x - ball.pos.x;
        const dz = _a.z - ball.pos.z;
        ball.kick(p, dx / arrive, def.take.lift, dz / arrive);
        ball.noPickupTimer = 0.35;
        p.autoChase = 1.8;
        this.touches++;
        return;
      }
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
    const along = (i.moveX * dx + i.moveZ * dz) / (inLen * Math.max(d, 1e-3));
    if (d > 0.7 && (cross > 0.35 || along < 0)) {
      const w = along < 0 ? 0.9 : Math.min(0.75, (cross - 0.35) * 1.6);
      i.moveX = i.moveX / inLen * (1 - w) + (dx / d) * w;
      i.moveZ = i.moveZ / inLen * (1 - w) + (dz / d) * w;
    }
  }

  /**
   * Sharp touch (Dash tap + direction): the cut is picked by how far the new direction is from
   * where he faces - a small push, a 45° or 90° cut, or a drag back - each a real cut animation
   * whose own footwork moves him, with the ball taken to where he ends up.
   */
  private sharpTouch(p: Player, dirX: number, dirZ: number): void {
    const ball = this.ball;
    if (ball.owner !== p || p.state !== 'free') return;
    const l = Math.hypot(dirX, dirZ);
    if (l < 0.1) return;
    if (Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z) > 1.1) return;
    const nx = dirX / l;
    const nz = dirZ / l;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const ang = Math.acos(Math.max(-1, Math.min(1, nx * fx + nz * fz))) * (180 / Math.PI);
    const right = -nx * fz + nz * fx > 0;
    const id = ang < 25 ? null : ang < 65 ? 'cut_45' : ang < 120 ? 'cut_90' : 'drag_back';
    if (id && SKILLS[id] && p.animator.has(SKILLS[id].anim)) {
      p.startSkill(SKILLS[id], !right);
      if (p === this.attacker) this.defenderAI.onOpponentSkill(SKILLS[id], !right);
      this.touches++;
      return;
    }
    // straight on: a longer push into space
    const sp = p.speed;
    p.vel.set(nx * Math.max(sp, 3), 0, nz * Math.max(sp, 3));
    this.sendBallTo(p.pos.x + nx * 1.8, p.pos.z + nz * 1.8, 0.45, DRIBBLE.friction);
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
    this.lastShotAt = this.clock;
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
    if (ball.owner !== this.attacker) return;
    const att = this.attacker;
    // Which does the tackling foot reach first: the ball or his legs?
    if (d.hasFeet && att.colliders.length) {
      const f = d.footPos[0].distanceTo(ball.pos) < d.footPos[1].distanceTo(ball.pos) ? d.footPos[0] : d.footPos[1];
      const dBall = f.distanceTo(ball.pos) - BALL.radius;
      let dLeg = Infinity;
      for (const c of att.colliders) {
        if (c.part !== 'shin' && c.part !== 'foot') continue;
        closestOnSegment(c.a, c.b, f, _c);
        dLeg = Math.min(dLeg, f.distanceTo(_c) - c.r);
      }
      if (dLeg < CONTACT.tripReach && dLeg + 0.04 < dBall) {
        this.tackleHit = true;
        forwardFromYaw(d.yaw, _b);
        att.stagger(_b.x, _b.z, 1, 'stumble');
        this.hitBone(att, 'shin', _b.x, _b.z, 1);
        ball.kick(att, ball.vel.x * 0.5 + _b.x, 0, ball.vel.z * 0.5 + _b.z);
        this.endRound('foul', 'FOUL!');
        return;
      }
    }
    if (att.isProtected) return;
    d.footPoint(_a, 0.6);
    if (_a.distanceTo(ball.pos) < reach) {
      this.tackleHit = true;
      forwardFromYaw(d.yaw, _b).multiplyScalar(3.5);
      ball.kick(d, _b.x, 0.5, _b.z);
      // got the ball first: he rides over the challenge, stumbling in the direction he was going
      this.attacker.stagger(this.attacker.vel.x || _b.x, this.attacker.vel.z || _b.z, 0.5 + this.attacker.speed / 14);
      this.endRound('defended', 'TACKLED!');
    }
  }

  /** A loose fast ball hitting a body is deflected - that's how blocks happen. */
  private bodyBlocks(): void {
    const ball = this.ball;
    if (ball.pos.y > 1.6) return;
    for (const p of [this.attacker, this.defender]) {
      if (p.colliders.length) continue; // real bodies use the capsule contact layer
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
    // too hot to control: a fast ball bounces off bodies instead (contact layer)
    if (Math.hypot(ball.vel.x, ball.vel.z) > CONTACT.controlSpeed) return;
    let best: Player | null = null;
    let bestD: number = BALL.pickupRadius;
    for (const p of [this.attacker, this.defender]) {
      if (p.state === 'stumble' || p.state === 'celebrate' || p.state === 'shoot') continue;
      if (p.state === 'skill' && !p.skillReleased) continue;
      if (ball.lastTouch === p && ball.noPickupTimer > 0) continue;
      if (p === this.defender && this.phase === 'check') continue;
      let d: number;
      if (p.hasFeet) {
        // real bodies: a FOOT has to get to it, and only after a short reaction time -
        // a ball zipping between his feet goes through before he can trap it
        d = Math.min(
          Math.hypot(p.footPos[0].x - ball.pos.x, p.footPos[0].z - ball.pos.z),
          Math.hypot(p.footPos[1].x - ball.pos.x, p.footPos[1].z - ball.pos.z),
        );
        const k = p === this.attacker ? 0 : 1;
        if (d < CONTACT.footPickup) this.reachTime[k] += 1 / 60;
        else this.reachTime[k] = 0;
        const need = p === this.attacker ? CONTACT.reactAttacker : CONTACT.reactDefender;
        const spd = Math.hypot(ball.vel.x, ball.vel.z);
        if (this.reachTime[k] < need && spd > 1.5) continue;
        if (d >= CONTACT.footPickup) {
          // also allow the classic "ball at his feet in front of him" when it's slow
          p.footPoint(_a, 0.35);
          d = Math.hypot(_a.x - ball.pos.x, _a.z - ball.pos.z);
          if (spd > 2.5) continue;
        }
      } else {
        p.footPoint(_a, 0.35);
        d = Math.hypot(_a.x - ball.pos.x, _a.z - ball.pos.z);
      }
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
    } else if (this.phase === 'live' && best === this.attacker && this.clock < this.pannaUntil) {
      // Nutmegged him AND got it back the other side: panna = instant round win.
      this.pannaUntil = 0;
      this.score.attacker++;
      this.listener.onScore(this.score.attacker, this.score.defender);
      this.attacker.celebrate();
      this.endRound('goal', 'PANNA!');
    }
  }

  /**
   * Bodies: push apart, and when they meet with real closing speed it's an IMPACT - whoever is
   * carrying less momentum into it (or is mid-skill / off balance) gets knocked back.
   */
  private separatePlayers(): void {
    const A = this.attacker;
    const B = this.defender;
    const dx = B.pos.x - A.pos.x;
    const dz = B.pos.z - A.pos.z;
    const min = PLAYER.radius * 2;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-8) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    const push = (min - d) / 2;
    A.pos.x -= nx * push;
    A.pos.z -= nz * push;
    B.pos.x += nx * push;
    B.pos.z += nz * push;

    const into = A.vel.x * nx + A.vel.z * nz; // A moving toward B
    const intoB = -(B.vel.x * nx + B.vel.z * nz); // B moving toward A
    const closing = into + intoB;
    if (closing < CONTACT.bumpSpeed || this.clock - this.lastImpactAt < 0.5) return;
    this.lastImpactAt = this.clock;
    const strength = Math.min(1, (closing - CONTACT.bumpSpeed) / 5 + 0.25);
    // balance: momentum into the contact, worse if mid-skill/shot or already stumbling
    const bal = (p: Player, m: number) => m + (p.state === 'free' ? 1 : -1.5) + (p.speed < 1.2 && p.state === 'free' ? 8 : 0);
    const loser = bal(A, into) < bal(B, intoB) ? A : B;
    const sgn = loser === A ? -1 : 1;
    this.hitBone(A, 'chest', nx, nz, strength);
    this.hitBone(B, 'chest', -nx, -nz, strength);
    if (strength > 0.45) loser.stagger(nx * sgn, nz * sgn, strength, 'stumble_back');
    else loser.vel.multiplyScalar(0.4);
    const winner = loser === A ? B : A;
    winner.vel.multiplyScalar(0.7);
  }

  // ------------------------------------------------------------------ contact layer

  /**
   * Swept ball-vs-capsules for one player. Response uses the bone's own velocity, so a lunging
   * foot fires the ball away while a planted foot kills it. Returns true if anything was hit.
   */
  private ballVsBody(p: Player, from: Vector3, dt: number): boolean {
    const ball = this.ball;
    if (!p.colliders.length || ball.pos.y > 2.2) return false;
    if (p === this.defender && this.clock < this.ghostUntil) return false; // ball already through his legs
    const R = BALL.radius;
    const dist = from.distanceTo(ball.pos);
    const steps = Math.min(10, Math.max(1, Math.ceil(dist / 0.05)));
    for (let s = 1; s <= steps; s++) {
      _q.lerpVectors(from, ball.pos, s / steps);
      for (const c of p.colliders) {
        const t = closestOnSegment(c.a, c.b, _q, _c);
        _n.subVectors(_q, _c);
        const dd = _n.length();
        if (dd >= c.r + R || dd < 1e-6) continue;
        _n.divideScalar(dd);
        // velocity of that point of the bone
        _vp.subVectors(c.a, c.pa).lerp(_vb.subVectors(c.b, c.pb), t).divideScalar(Math.max(dt, 1e-4));
        _rel.subVectors(ball.vel, _vp);
        const vn = _rel.dot(_n);
        if (vn >= 0) continue; // separating already
        const planted = _vp.length() < 0.5 && (c.part === 'foot' || c.part === 'shin');
        const e = planted ? 0.12 : RESTITUTION[c.part];
        // reflect normal part, keep most of the tangential part
        _rel.addScaledVector(_n, -(1 + e) * vn);
        _rel.multiplyScalar(0.85);
        ball.vel.copy(_vp).add(_rel);
        ball.pos.copy(_c).addScaledVector(_n, c.r + R + 0.005);
        if (ball.pos.y < R) ball.pos.y = R;
        this.onBallHitsBody(p, c.part, c.side, -vn, _n.x, _n.z, c.boneA);
        return true;
      }
    }
    return false;
  }

  /** Reaction picker for ball-on-body contact. */
  private onBallHitsBody(p: Player, part: BodyPart, _side: number, speed: number, nx: number, nz: number, bone: Object3D): void {
    const ball = this.ball;
    const owned = ball.owner;
    if (owned && owned !== p) {
      // dribbled into his legs: it's loose
      ball.owner = null;
      ball.lastTouch = p;
      ball.noPickupTimer = 0.12;
    } else if (!owned) {
      ball.lastTouch = p;
      ball.noPickupTimer = Math.max(ball.noPickupTimer, 0.1);
    }
    p.hitReact(bone, -nx, -nz, speed / 12);
    if (speed > CONTACT.staggerBallSpeed && (part === 'torso' || part === 'chest' || part === 'head')) {
      p.stagger(-nx, -nz, (speed - CONTACT.staggerBallSpeed) / 10 + 0.2, 'stumble_back');
    }
    if (this.phase === 'live' && p === this.defender && speed > 7 && this.lastShotAt > this.clock - 1.5) {
      const where = part === 'head' ? 'HEADED AWAY' : part === 'chest' || part === 'torso' ? 'CHESTED' : 'BLOCKED';
      this.listener.onMessage(where, 'bad');
    }
  }

  /**
   * Nutmeg: the ball crossed the line between the defender's feet without touching a leg,
   * low enough to go under him. Gap size comes from his actual stance.
   */
  private checkNutmeg(from: Vector3): void {
    const d = this.defender;
    const ball = this.ball;
    if (!d.hasFeet || ball.pos.y > 0.35 || this.phase !== 'live') return;
    const L = d.footPos[0];
    const Rf = d.footPos[1];
    const gap = Math.hypot(L.x - Rf.x, L.z - Rf.z);
    if (gap < CONTACT.minNutmegGap) return;
    if (!segmentsCrossXZ(from.x, from.z, ball.pos.x, ball.pos.z, L.x, L.z, Rf.x, Rf.z)) return;
    if (this.clock - this.lastNutmegAt < 1) return;
    this.lastNutmegAt = this.clock;
    this.pannaUntil = this.clock + CONTACT.pannaWindow;
    this.ghostUntil = this.clock + 0.45;
    this.listener.onMessage('NUTMEG!', 'good');
    // he has to turn round: lose balance in the ball's direction
    d.stagger(ball.vel.x || -d.vel.x, ball.vel.z || -d.vel.z, 0.55, 'stumble_back');
    if (ball.owner === this.attacker) {
      ball.owner = null;
      ball.lastTouch = this.attacker;
      ball.noPickupTimer = 0;
      this.attacker.autoChase = 1.4;
    }
  }

  /** Kick a named body part's bone (procedural hit layered over animation). */
  private hitBone(p: Player, part: BodyPart, dx: number, dz: number, strength: number): void {
    const c = p.colliders.find((k) => k.part === part);
    if (c) p.hitReact(c.boneA, dx, dz, strength);
  }

}
