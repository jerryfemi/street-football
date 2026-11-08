import { Vector3, type PerspectiveCamera } from 'three';
import { SHOT } from '../config';
import type { Input } from '../core/Input';
import type { Player } from '../player/Player';
import { clearIntent, type PlayerIntent } from './types';

const _f = new Vector3();

/**
 * Keyboard → PlayerIntent, eFootball-style: you give direction + intent, the game does the footwork.
 *
 * IN POSSESSION
 *   WASD or arrows   move / dribble (small touches are automatic)
 *   Shift (hold)     dash dribble
 *   Shift (tap)      sharp touch: cut into the held direction (45° / 90° / drag back by angle)
 *   Shift Shift + direction   FEINT COMMAND - the move is picked from the direction relative to
 *                    where he faces (and the defender):
 *                      forward          knock-on (rainbow flick over a close defender)
 *                      forward-diagonal 45° cut that way
 *                      sideways         90° cut that way
 *                      back-diagonal    roulette spinning that way
 *                      back             drag back
 *   Space hold/release  shoot (direction at release aims)
 *
 * OUT OF POSSESSION
 *   F tackle · Shift+F slide tackle · B block
 */
export class HumanController {
  readonly intent: PlayerIntent = {
    moveX: 0, moveZ: 0, sprint: false, jockey: false, shoot: null, skill: null, tackle: false,
  };
  /** 0..1 while charging a shot, -1 when not charging (HUD reads this). */
  charge = -1;

  private clock = 0;
  private shiftDownAt = -1;
  private lastTapAt = -10;
  /** a single tap waits this long in case it becomes a double tap */
  private pendingTap = -1;
  /** >0: double tap seen, waiting for the direction (seconds left) */
  private feintArmed = 0;
  private dirAtArm = { x: 0, y: 0 };

  /** Set by Game so skills can adapt to where the defender is. */
  opponent: Player | null = null;

  constructor(
    private readonly input: Input,
    private readonly camera: PerspectiveCamera,
    readonly player: Player,
  ) {}

  update(dt: number): PlayerIntent {
    this.clock += dt;
    const i = this.intent;
    clearIntent(i);
    const inp = this.input;

    // camera basis on the ground plane
    this.camera.getWorldDirection(_f);
    _f.y = 0;
    _f.normalize();
    const rx = -_f.z;
    const rz = _f.x;
    const ax = inp.axisX();
    const ay = inp.axisY();
    i.moveX = rx * ax + _f.x * ay;
    i.moveZ = rz * ax + _f.z * ay;

    // ---- Dash: hold = dash, tap = sharp touch, double tap + direction = feint command
    const shiftPressed = inp.wasPressed('ShiftLeft', 'ShiftRight');
    if (shiftPressed) this.shiftDownAt = this.clock;
    const shiftHeld = inp.isDown('ShiftLeft', 'ShiftRight');
    i.sprint = shiftHeld && this.clock - this.shiftDownAt > TAP && this.feintArmed <= 0;
    if (inp.wasReleased('ShiftLeft', 'ShiftRight') && this.clock - this.shiftDownAt < TAP) {
      if (this.clock - this.lastTapAt < DOUBLE_TAP) {
        // second tap: arm the feint command
        this.feintArmed = ARM_WINDOW;
        this.pendingTap = -1;
        this.dirAtArm.x = ax;
        this.dirAtArm.y = ay;
        this.lastTapAt = -10;
      } else {
        this.lastTapAt = this.clock;
        this.pendingTap = this.clock;
      }
    }
    // a lone tap becomes a sharp touch once the double-tap window has passed
    if (this.pendingTap >= 0 && this.clock - this.pendingTap > DOUBLE_TAP) {
      this.pendingTap = -1;
      if (ax || ay) i.sharpTouch = { x: i.moveX, z: i.moveZ };
    }
    if (this.feintArmed > 0) {
      this.feintArmed -= dt;
      // the direction counts once it is NEW input after arming (or a held one when the window ends)
      const changed = (ax !== this.dirAtArm.x || ay !== this.dirAtArm.y) && (ax || ay);
      if (changed || (this.feintArmed <= 0 && (ax || ay))) {
        this.feintArmed = 0;
        if (this.player.hasBall) i.skill = this.feint(i.moveX, i.moveZ);
      }
    }

    // on-screen feint pad
    if (inp.wasPressed('Feint') && this.player.hasBall) {
      i.skill = this.feint(rx * inp.feintX + _f.x * inp.feintY, rz * inp.feintX + _f.z * inp.feintY);
    }

    // Shot
    if (inp.isDown('Space') && this.player.hasBall) {
      this.charge = this.charge < 0 ? 0 : Math.min(1, this.charge + dt / SHOT.chargeTime);
    }
    if (inp.wasReleased('Space') && this.charge >= 0) {
      i.shoot = { power: this.charge, aimX: ax };
      this.charge = -1;
    }
    if (!this.player.hasBall && !inp.isDown('Space')) this.charge = -1;

    // Defending
    if (inp.wasPressed('KeyF')) {
      i.tackle = true;
      i.slide = shiftHeld;
    }
    if (inp.wasPressed('Slide')) {
      i.tackle = true;
      i.slide = true;
    }
    if (inp.wasPressed('KeyB')) i.block = true;
    return i;
  }

  /** Pick the feint from the world direction relative to his facing (and where the defender is). */
  private feint(wx: number, wz: number): { id: string; mirror: boolean } | null {
    const l = Math.hypot(wx, wz);
    if (l < 0.1) return null;
    const p = this.player;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const fwd = (wx * fx + wz * fz) / l;
    const right = (-wx * fz + wz * fx) / l;
    const ang = Math.acos(Math.max(-1, Math.min(1, fwd))) * (180 / Math.PI);
    const left = right < 0;
    if (ang < 25) {
      const o = this.opponent;
      if (o) {
        const dx = o.pos.x - p.pos.x;
        const dz = o.pos.z - p.pos.z;
        const dist = Math.hypot(dx, dz);
        const inFront = (dx * fx + dz * fz) / Math.max(dist, 1e-3);
        if (dist < 3.2 && inFront > 0.7) return { id: 'rainbow', mirror: false };
      }
      return { id: 'knockon', mirror: false };
    }
    if (ang < 65) return { id: 'cut_45', mirror: left };
    if (ang < 120) return { id: 'cut_90', mirror: left };
    if (ang < 160) return { id: 'roulette', mirror: left };
    return { id: 'drag_back', mirror: left };
  }
}

/** a press shorter than this is a tap (s) */
const TAP = 0.16;
/** two taps within this make a double tap (s) */
const DOUBLE_TAP = 0.26;
/** after a double tap, how long the direction is awaited (s) */
const ARM_WINDOW = 0.4;
