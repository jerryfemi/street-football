import {
  Box3,
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Scene,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BALL, GOAL, PITCH } from '../config';
import type { Player } from '../player/Player';

export type BallEvent = 'goal' | 'post' | null;

const _axis = new Vector3();
const _delta = new Vector3();
const _q = new Quaternion();
const UP = new Vector3(0, 1, 0);

/**
 * Simple hand-rolled ball physics (gravity, bounce, rolling friction, boards, posts, net).
 * Enough for arcade football. Swap for Rapier when we need player-body collisions or spin/curve.
 *
 * While `owner` is set the ball is kinematic: Match places it every step (dribble / skill paths).
 */
export class Ball {
  readonly mesh: Mesh;
  readonly pos = new Vector3(0, BALL.radius, 0);
  readonly vel = new Vector3();
  owner: Player | null = null;
  /** Player who last touched it (for "who kicked it out" style rules later). */
  lastTouch: Player | null = null;
  /** Seconds before `lastTouch` may collect it again (stops instant re-pickup after a kick). */
  noPickupTimer = 0;
  private readonly lastPos = new Vector3();
  private inGoal = false;

  constructor(scene: Scene) {
    const mat = new MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.45 });
    this.mesh = new Mesh(new SphereGeometry(BALL.radius, 24, 16), mat);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.sync();
  }

  /** Swap the procedural sphere for a real ball model (kept as a child so physics/rolling stay the same). */
  async loadModel(path: string): Promise<void> {
    try {
      const g = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + path);
      const model = g.scene;
      const size = new Box3().setFromObject(model).getSize(new Vector3());
      const s = (BALL.radius * 2) / Math.max(size.x, size.y, size.z, 1e-6);
      model.scale.setScalar(s);
      model.traverse((o) => {
        if ((o as Mesh).isMesh) o.castShadow = true;
      });
      this.mesh.add(model);
      (this.mesh.material as MeshStandardMaterial).visible = false;
    } catch {
      console.info(`[assets] no ball model at public/${path} (using procedural ball)`);
    }
  }

  place(x: number, z: number): void {
    this.pos.set(x, BALL.radius, z);
    this.vel.set(0, 0, 0);
    this.owner = null;
    this.inGoal = false;
    this.lastPos.copy(this.pos);
    this.sync();
  }

  kick(by: Player, vx: number, vy: number, vz: number): void {
    this.owner = null;
    this.lastTouch = by;
    this.noPickupTimer = 0.3;
    this.vel.set(vx, vy, vz);
  }

  /** Integrate free flight. Returns an event if something notable happened. */
  step(dt: number): BallEvent {
    if (this.noPickupTimer > 0) this.noPickupTimer -= dt;
    if (this.owner) return null;

    const r = BALL.radius;
    const p = this.pos;
    const v = this.vel;
    let event: BallEvent = null;

    v.y -= BALL.gravity * dt;
    const drag = 1 - BALL.airDrag * dt;
    v.multiplyScalar(drag);
    p.addScaledVector(v, dt);

    // Ground
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

    const hw = PITCH.width / 2;
    const hl = PITCH.length / 2;
    const gw = GOAL.width / 2;

    // Side boards
    if (p.x < -hw + r) {
      p.x = -hw + r;
      v.x = Math.abs(v.x) * BALL.wallRestitution;
    } else if (p.x > hw - r) {
      p.x = hw - r;
      v.x = -Math.abs(v.x) * BALL.wallRestitution;
    }
    // Back board
    if (p.z > hl - r) {
      p.z = hl - r;
      v.z = -Math.abs(v.z) * BALL.wallRestitution;
    }

    // Goal end
    const inMouth = Math.abs(p.x) < gw - r && p.y < GOAL.height - r;
    if (this.inGoal) {
      // Inside the net: soft walls, kill energy
      const zb = GOAL.z - GOAL.depth + r;
      if (p.z < zb) {
        p.z = zb;
        v.z = Math.abs(v.z) * 0.15;
        v.x *= 0.5;
      }
      if (Math.abs(p.x) > gw - r) {
        p.x = Math.sign(p.x) * (gw - r);
        v.x *= -0.2;
      }
      if (p.y > GOAL.height - r) {
        p.y = GOAL.height - r;
        v.y = -Math.abs(v.y) * 0.2;
      }
    } else if (p.z < GOAL.z + r && !inMouth) {
      // End boards (outside the goal mouth) or the outside of the net
      p.z = GOAL.z + r;
      v.z = Math.abs(v.z) * BALL.wallRestitution;
    } else if (p.z < GOAL.z - r && inMouth) {
      this.inGoal = true;
      event = 'goal';
    }

    if (this.collidePosts()) event = event ?? 'post';
    return event;
  }

  private collidePosts(): boolean {
    const r = BALL.radius + GOAL.postRadius;
    const p = this.pos;
    const v = this.vel;
    let hit = false;
    // Vertical posts (circle in xz)
    if (p.y < GOAL.height + BALL.radius) {
      for (const px of [-GOAL.width / 2, GOAL.width / 2]) {
        const dx = p.x - px;
        const dz = p.z - GOAL.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          p.x = px + nx * r;
          p.z = GOAL.z + nz * r;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= (1 + BALL.postRestitution) * vn * nx;
            v.z -= (1 + BALL.postRestitution) * vn * nz;
            hit = true;
          }
        }
      }
    }
    // Crossbar (circle in yz)
    if (Math.abs(p.x) < GOAL.width / 2) {
      const dy = p.y - GOAL.height;
      const dz = p.z - GOAL.z;
      const d2 = dy * dy + dz * dz;
      if (d2 < r * r && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const ny = dy / d;
        const nz = dz / d;
        p.y = GOAL.height + ny * r;
        p.z = GOAL.z + nz * r;
        const vn = v.y * ny + v.z * nz;
        if (vn < 0) {
          v.y -= (1 + BALL.postRestitution) * vn * ny;
          v.z -= (1 + BALL.postRestitution) * vn * nz;
          hit = true;
        }
      }
    }
    return hit;
  }

  /** Copy simulation state to the mesh, rolling it based on how far it travelled. */
  sync(): void {
    _delta.subVectors(this.pos, this.lastPos);
    _delta.y = 0;
    const dist = _delta.length();
    if (dist > 1e-5) {
      _axis.crossVectors(UP, _delta).normalize();
      _q.setFromAxisAngle(_axis, dist / BALL.radius);
      this.mesh.quaternion.premultiply(_q);
    }
    this.lastPos.copy(this.pos);
    this.mesh.position.copy(this.pos);
  }
}

/** Procedural panel texture so the ball visibly rolls without any downloaded asset. */
function makeBallTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f8fafc';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#0f172a';
  const spots: [number, number, number][] = [
    [32, 32, 14], [96, 64, 16], [160, 32, 14], [224, 64, 16],
    [32, 100, 12], [160, 100, 12], [96, 8, 8], [224, 8, 8],
  ];
  for (const [x, y, s] of spots) {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    }
    g.closePath();
    g.fill();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
