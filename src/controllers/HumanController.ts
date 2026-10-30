import { Vector3, type PerspectiveCamera } from 'three';
import { SHOT } from '../config';
import type { Input } from '../core/Input';
import type { Player } from '../player/Player';
import { clearIntent, type PlayerIntent } from './types';

const _f = new Vector3();

/**
 * Keyboard -> PlayerIntent, camera-relative (W always means "up the screen").
 *
 *  WASD / Arrows  move          Shift  sprint
 *  Space (hold)   charge shot, release to shoot (steer left/right to aim)
 *  E              stepover (hold A/Left to break the other way)
 *  R              knock-on (push and run; hold A/Left to go left)
 *  F              tackle (when defending)
 */
export class HumanController {
  readonly intent: PlayerIntent = {
    moveX: 0, moveZ: 0, sprint: false, jockey: false, shoot: null, skill: null, tackle: false,
  };
  /** 0..1 while charging a shot, -1 when not charging (HUD reads this). */
  charge = -1;

  constructor(
    private readonly input: Input,
    private readonly camera: PerspectiveCamera,
    readonly player: Player,
  ) {}

  update(dt: number): PlayerIntent {
    const i = this.intent;
    clearIntent(i);
    const inp = this.input;

    // camera basis on the ground plane
    this.camera.getWorldDirection(_f);
    _f.y = 0;
    _f.normalize();
    const rx = -_f.z; // right = (-fz, 0, fx) for a camera looking along f
    const rz = _f.x;
    const ax = inp.axisX();
    const ay = inp.axisY();
    i.moveX = rx * ax + _f.x * ay;
    i.moveZ = rz * ax + _f.z * ay;
    i.sprint = inp.isDown('ShiftLeft', 'ShiftRight');

    // Shot charge
    if (inp.isDown('Space') && this.player.hasBall) {
      this.charge = this.charge < 0 ? 0 : Math.min(1, this.charge + dt / SHOT.chargeTime);
    }
    if (inp.wasReleased('Space') && this.charge >= 0) {
      i.shoot = { power: this.charge, aimX: ax };
      this.charge = -1;
    }
    if (!this.player.hasBall && !inp.isDown('Space')) this.charge = -1;

    if (inp.wasPressed('KeyE')) i.skill = { id: 'stepover', mirror: ax < 0 };
    if (inp.wasPressed('KeyR')) i.skill = { id: 'knockon', mirror: ax < 0 };
    if (inp.wasPressed('KeyF')) i.tackle = true;
    return i;
  }
}
