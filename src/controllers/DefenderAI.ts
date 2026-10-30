import { Vector3 } from 'three';
import { GOAL, TACKLE } from '../config';
import type { Ball } from '../ball/Ball';
import { localToWorld } from '../core/math';
import type { Player } from '../player/Player';
import type { SkillDef } from '../skills/skills';
import { clearIntent, type PlayerIntent } from './types';

const _t = new Vector3();
const _foot = new Vector3();
const GOAL_CENTER = new Vector3(0, 0, GOAL.z);

export interface DefenderTuning {
  /** metres kept between defender and ball when the attacker is close to goal */
  standOffNear: number;
  /** metres kept when the attacker is far out (defender drops off, doesn't dive in) */
  standOffFar: number;
  /** seconds the ball must stay in reach before the defender commits to a tackle */
  reaction: number;
  /** chance (0..1) to bite on a fake when close */
  biteChance: number;
  /** tackle attempts per second when in range */
  tackleRate: number;
}

export const DEFENDER_NORMAL: DefenderTuning = {
  standOffNear: 1.4,
  standOffFar: 2.8,
  reaction: 0.25,
  biteChance: 0.7,
  tackleRate: 1.6,
};

/**
 * Simple 1v1 defender:
 *  - stays goal-side of the ball, closes down, jockeys facing the ball
 *  - pokes a tackle when the ball is in reach (unless the attacker is mid-skill)
 *  - can "bite" on a fake: runs the wrong way for a moment. That's how skills win.
 */
export class DefenderAI {
  readonly intent: PlayerIntent = {
    moveX: 0, moveZ: 0, sprint: false, jockey: false, shoot: null, skill: null, tackle: false,
  };
  private biteTimer = 0;
  private inReachTime = 0;
  private readonly biteDir = new Vector3();

  constructor(
    readonly player: Player,
    private readonly opponent: Player,
    private readonly ball: Ball,
    private readonly tuning: DefenderTuning = DEFENDER_NORMAL,
  ) {}

  /** Called by Match when the attacker starts a skill. */
  onOpponentSkill(def: SkillDef, mirror: boolean): void {
    if (def.fakeSide === 0) return;
    const d = this.player.pos.distanceTo(this.opponent.pos);
    if (d > 4.5 || Math.random() > this.tuning.biteChance) return;
    const side = def.fakeSide * (mirror ? -1 : 1);
    localToWorld(this.opponent.pos, this.opponent.yaw, side, 0, _t).sub(this.opponent.pos);
    this.biteDir.copy(_t).normalize();
    this.biteTimer = 0.55;
    this.inReachTime = 0;
  }

  update(dt: number): PlayerIntent {
    const i = this.intent;
    clearIntent(i);
    const me = this.player;
    if (!me.canAct) return i;

    const ball = this.ball.pos;
    i.faceX = ball.x - me.pos.x;
    i.faceZ = ball.z - me.pos.z;

    if (this.biteTimer > 0) {
      this.biteTimer -= dt;
      i.moveX = this.biteDir.x;
      i.moveZ = this.biteDir.z;
      i.sprint = true;
      return i;
    }

    if (!this.ball.owner) {
      // Loose ball: go get it.
      i.moveX = ball.x - me.pos.x;
      i.moveZ = ball.z - me.pos.z;
      i.sprint = true;
      return i;
    }
    if (this.ball.owner === me) return i;

    // Attacker has it: get goal-side. Drop off when he's far out, tighten up near goal.
    _t.subVectors(GOAL_CENTER, ball);
    _t.y = 0;
    const toGoal = _t.length();
    const near = Math.min(1, Math.max(0, (12 - toGoal) / 6)); // 0 at 12 m out, 1 at 6 m
    const standOff = this.tuning.standOffFar + (this.tuning.standOffNear - this.tuning.standOffFar) * near;
    _t.setLength(Math.min(standOff, toGoal));
    _t.add(ball);
    const dx = _t.x - me.pos.x;
    const dz = _t.z - me.pos.z;
    const dist = Math.hypot(dx, dz);
    const arrive = Math.min(1, dist / 1.5);
    if (dist > 1e-3) {
      i.moveX = (dx / dist) * arrive;
      i.moveZ = (dz / dist) * arrive;
    }
    i.sprint = dist > 4;
    const toBall = me.pos.distanceTo(ball);
    i.jockey = toBall < 4;

    me.footPoint(_foot, 0.6);
    const inReach = _foot.distanceTo(ball) < TACKLE.reach;
    this.inReachTime = inReach ? this.inReachTime + dt : 0;
    if (this.inReachTime > this.tuning.reaction && me.tackleCooldown <= 0 && !this.opponent.isProtected) {
      if (Math.random() < this.tuning.tackleRate * dt) i.tackle = true;
    }
    return i;
  }
}
