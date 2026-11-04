// SOURCE: panna_verse/src/ball/Ball.ts - keep in sync
import { Vector3 } from 'three';
import { BALL } from './config';

export class BallSim {
  readonly pos = new Vector3(0, BALL.radius, 0);
  readonly vel = new Vector3();

  place(x: number, z: number, y: number = BALL.radius): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
  }

  step(dt: number): void {
    const r = BALL.radius;
    const p = this.pos;
    const v = this.vel;

    v.y -= BALL.gravity * dt;
    const drag = 1 - BALL.airDrag * dt;
    v.multiplyScalar(drag);
    p.addScaledVector(v, dt);

    // Ground bounce and rolling friction
    if (p.y < r) {
      p.y = r;
      if (v.y < -0.6) v.y = -v.y * BALL.groundRestitution;
      else v.y = 0;
    }
    if (p.y <= r + 1e-3) {
      const f = Math.max(0, 1 - BALL.rollingFriction * dt);
      v.x *= f;
      v.z *= f;
      if (v.x * v.x + v.z * v.z < 0.0025) v.x = v.z = 0;
    }
  }
}

