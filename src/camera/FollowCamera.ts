import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA, GOAL, PITCH } from '../config';
import { damp } from '../core/math';

const GOAL_CENTER = new Vector3(0, 0, GOAL.z);
const _dir = new Vector3();
const _want = new Vector3();
const _look = new Vector3();

/**
 * Broadcast-style duel camera: sits behind the attacker on the goal->attacker line,
 * raised, and looks at a point between the ball and the goal so you always see
 * the defender and the target. Everything is smoothed - no snapping.
 */
export class FollowCamera {
  readonly camera: PerspectiveCamera;
  private readonly lookAt = new Vector3(0, 0.8, 0);

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200);
    this.camera.position.set(0, CAMERA.height, 12);
  }

  update(dt: number, focus: Vector3, ball: Vector3, snap = false): void {
    _dir.subVectors(focus, GOAL_CENTER);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1);
    _dir.normalize();

    _want.copy(focus).addScaledVector(_dir, CAMERA.distance);
    _want.y = CAMERA.height;

    // Keep camera safely inside the arena cage so it never clips through the perimeter fence
    const maxZ = PITCH.length / 2 - 1.2;
    const maxX = PITCH.width / 2 - 1.2;
    _want.z = Math.min(_want.z, maxZ);
    _want.x = Math.max(-maxX, Math.min(maxX, _want.x));

    _look.lerpVectors(ball, GOAL_CENTER, 0.3);
    _look.y = 0.8;

    const kf = snap ? 1 : damp(CAMERA.followSharpness, dt);
    const kl = snap ? 1 : damp(CAMERA.lookSharpness, dt);
    this.camera.position.lerp(_want, kf);
    this.lookAt.lerp(_look, kl);
    this.camera.lookAt(this.lookAt);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
