import { Vector3, type PerspectiveCamera } from 'three';
import { SHOT } from '../config';
import type { Input } from '../core/Input';
import type { Player } from '../player/Player';
import { clearIntent, type PlayerIntent } from './types';

const _f = new Vector3();

type Flick = 'L' | 'R' | 'U' | 'D';

/**
 * Keyboard → PlayerIntent, eFootball-style: you give direction + intent, the game does the footwork.
 *
 * IN POSSESSION
 *   WASD             move / dribble (small touches are automatic)
 *   Shift (hold)     dash dribble - bigger touches, faster
 *   Shift (tap)      sharp touch: quick cut into the WASD direction
 *   Space hold/release  shoot (WASD at release aims)
 *   Arrow keys = the "skill stick" (flicks are read relative to where the player faces):
 *     ← / →          stepover, going that way
 *     ↑              knock-on (auto: drop-shoulder burst if the defender is right in front)
 *     ↓              drag stepover (goes to the side you're holding, default right)
 *     ←← / →→        body feint, going that way
 *     ← → / → ←      elastico, finishing in the second direction
 *     ↓ then ← / →   samba roll toward that side
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
  private readonly flicks: { d: Flick; t: number }[] = [];
  private shiftDownAt = -1;

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

    // Dash: hold = dash dribble, quick tap = sharp touch
    if (inp.wasPressed('ShiftLeft', 'ShiftRight')) this.shiftDownAt = this.clock;
    const shiftHeld = inp.isDown('ShiftLeft', 'ShiftRight');
    i.sprint = shiftHeld && this.clock - this.shiftDownAt > 0.16;
    if (inp.wasReleased('ShiftLeft', 'ShiftRight') && this.clock - this.shiftDownAt < 0.16 && (ax || ay)) {
      i.sharpTouch = { x: i.moveX, z: i.moveZ };
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

    // Skill stick
    if (inp.wasPressed('ArrowLeft')) this.pushFlick('L', rx, rz, -1, 0);
    if (inp.wasPressed('ArrowRight')) this.pushFlick('R', rx, rz, 1, 0);
    if (inp.wasPressed('ArrowUp')) this.pushFlick('U', rx, rz, 0, 1);
    if (inp.wasPressed('ArrowDown')) this.pushFlick('D', rx, rz, 0, -1);
    i.skill = this.readGesture(ax);

    // Defending
    if (inp.wasPressed('KeyF')) {
      i.tackle = true;
      i.slide = shiftHeld;
    }
    if (inp.wasPressed('KeyB')) i.block = true;
    return i;
  }

  /** Convert a screen-space arrow into the player's own frame (left/right/forward/back). */
  private pushFlick(_screen: Flick, rx: number, rz: number, sx: number, sy: number): void {
    const wx = rx * sx + _f.x * sy;
    const wz = rz * sx + _f.z * sy;
    const yaw = this.player.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const fwd = wx * fx + wz * fz;
    const right = -(wx * Math.cos(yaw)) + wz * Math.sin(yaw); // dot with right = (-cos, 0, sin)
    let d: Flick;
    if (Math.abs(fwd) >= Math.abs(right)) d = fwd >= 0 ? 'U' : 'D';
    else d = right >= 0 ? 'R' : 'L';
    this.flicks.push({ d, t: this.clock });
    if (this.flicks.length > 3) this.flicks.shift();
  }

  /** Two-flick combos resolve instantly; single flicks wait a moment in case a combo follows. */
  private readGesture(ax: number): { id: string; mirror: boolean } | null {
    const f = this.flicks;
    if (f.length === 0) return null;
    const last = f[f.length - 1];
    if (f.length >= 2) {
      const prev = f[f.length - 2];
      if (last.t - prev.t < 0.32) {
        const a = prev.d;
        const b = last.d;
        f.length = 0;
        if ((a === 'L' && b === 'R') || (a === 'R' && b === 'L')) return { id: 'elastico', mirror: b === 'L' };
        if (a === 'D' && (b === 'L' || b === 'R')) return { id: 'samba_roll', mirror: b === 'R' };
        if (a === b && (a === 'L' || a === 'R')) return { id: 'bodyfeint', mirror: a === 'L' };
        return this.single(b, ax);
      }
    }
    if (this.clock - last.t < 0.18) return null; // wait for a possible second flick
    f.length = 0;
    return this.single(last.d, ax);
  }

  private single(d: Flick, ax: number): { id: string; mirror: boolean } {
    switch (d) {
      case 'L':
        return { id: 'stepover', mirror: true };
      case 'R':
        return { id: 'stepover', mirror: false };
      case 'D':
        return { id: 'drag_stepover', mirror: ax < 0 };
      case 'U': {
        // Automation: defender right in front and close → drop-shoulder burst instead of a plain knock-on
        const o = this.opponent;
        const p = this.player;
        if (o) {
          const dx = o.pos.x - p.pos.x;
          const dz = o.pos.z - p.pos.z;
          const dist = Math.hypot(dx, dz);
          const inFront = (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / Math.max(dist, 1e-3);
          if (dist < 2.6 && inFront > 0.6) return { id: 'drop_shoulder', mirror: ax < 0 };
        }
        return { id: 'knockon', mirror: ax < 0 };
      }
    }
  }
}
