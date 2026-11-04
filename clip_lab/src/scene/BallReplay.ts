import { Vector3 } from 'three';
import type { ClipEntry } from '../state/project';
import { BALL, DRIBBLE } from '../shared/config';
import type { ClipFootTracks } from '../analysis/footTracks';

export interface ReplayWarning {
  id: string;
  type: 'miss' | 'through_leg' | 'speed_error' | 'short';
  t: number; // trimmed seconds
  message: string;
}

export interface BallTrajectorySample {
  t: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface ReplayResult {
  samples: BallTrajectorySample[];
  warnings: ReplayWarning[];
}

const _pos = new Vector3();

export class BallReplay {
  private samples: BallTrajectorySample[] = [];
  private warnings: ReplayWarning[] = [];

  simulate(clip: ClipEntry, tracks?: ClipFootTracks): ReplayResult {
    const dur = Math.max(0.1, clip.out - clip.in);
    const dt = 1 / 60; // 60 Hz simulation for high fidelity
    const totalSteps = Math.ceil(dur / dt);

    const touches = [...clip.touches].sort((a, b) => a.t - b.t);
    const warnings: ReplayWarning[] = [];
    const samples: BallTrajectorySample[] = [];

    // 1. Initial ball state: first touch's 'at', or 0.4 m in front if none
    let bx = 0;
    let by: number = BALL.radius;
    let bz = 0.4;
    let bvx = 0;
    let bvy = 0;
    let bvz = 0;

    // Root (hips ground point, local axes) at a trimmed time; zero without tracks.
    // Touch 'at'/'to' are relative to the root at contact (contract §6).
    const rootAt = (tt: number): { x: number; z: number } => {
      if (!tracks || tracks.points.length === 0) return { x: 0, z: 0 };
      const i = Math.min(tracks.points.length - 1, Math.max(0, Math.round((clip.in + tt) * tracks.fps)));
      return tracks.points[i].hips;
    };

    if (touches.length > 0) {
      // Local x is converted to world coords for viewport: world.x = -localX, world.z = localZ
      const r0 = rootAt(touches[0].t);
      bx = -(touches[0].at.x + r0.x);
      by = touches[0].at.y ?? BALL.radius;
      bz = touches[0].at.z + r0.z;
    }

    let touchIdx = 0;
    const k = DRIBBLE.friction; // 2.6 /s
    let isStaying = false;
    let activeStayFoot: 'L' | 'R' = 'R';

    for (let step = 0; step <= totalSteps; step++) {
      const t = step * dt;

      // Check if a touch triggers at this time step
      while (touchIdx < touches.length && touches[touchIdx].t <= t) {
        const touch = touches[touchIdx];

        // Convert touch 'at' & 'to' (local) to world coords:
        const root = rootAt(touch.t);
        const atWorldX = -(touch.at.x + root.x);
        const atWorldZ = touch.at.z + root.z;
        const atWorldY = Math.max(BALL.radius, touch.at.y ?? BALL.radius);

        const toWorldX = touch.to ? -(touch.to.x + root.x) : atWorldX;
        const toWorldZ = touch.to ? touch.to.z + root.z : atWorldZ + 0.8;

        // Warning Check 1: Miss distance from touching toe if foot tracks available
        if (tracks && tracks.points.length > 0) {
          const frameIdx = Math.min(
            tracks.points.length - 1,
            Math.max(0, Math.round((clip.in + touch.t) * tracks.fps)),
          );
          const p = tracks.points[frameIdx];
          const toe = touch.foot === 'L' ? p.toeL : p.toeR;
          const toeWorldX = -toe.x;
          const toeWorldZ = toe.z;
          const distToToe = Math.hypot(bx - toeWorldX, bz - toeWorldZ);
          if (touchIdx > 0) {
            // Early/late: the ball reaches this touch too fast for the foot, or stops short of it
            const tv = touch.foot === 'L' ? p.toeVelL : p.toeVelR;
            const relSpeed = Math.hypot(bvx + tv.x, bvz - tv.z); // toe vel is local: world.x = -local.x
            if (relSpeed > 1.5) {
              warnings.push({
                id: `warn_speed_${touch.id}`,
                type: 'speed_error',
                t: touch.t,
                message: `Ball arrives at ${relSpeed.toFixed(2)} m/s relative to the foot (> 1.5, it would bounce off)`,
              });
            }
            const short = Math.hypot(bx - atWorldX, bz - atWorldZ);
            if (short > 0.35) {
              warnings.push({
                id: `warn_short_${touch.id}`,
                type: 'short',
                t: touch.t,
                message: `Ball is ${short.toFixed(2)} m from this touch's contact point (> 0.35)`,
              });
            }
          }
          if (distToToe > 0.25) {
            warnings.push({
              id: `warn_miss_${touch.id}`,
              type: 'miss',
              t: touch.t,
              message: `Touch ${touch.foot} is ${distToToe.toFixed(2)}m from toe (expected < 0.25m)`,
            });
          }
        }

        // Snap ball to contact position
        bx = atWorldX;
        by = atWorldY;
        bz = atWorldZ;

        if (touch.stay) {
          isStaying = true;
          activeStayFoot = touch.foot;
          bvx = 0;
          bvy = 0;
          bvz = 0;
        } else {
          isStaying = false;
          const arrive = Math.max(0.1, touch.arrive ?? 0.45);
          const dx = toWorldX - atWorldX;
          const dz = toWorldZ - atWorldZ;
          const distH = Math.hypot(dx, dz);

          if (distH > 1e-4) {
            // Speed needed to cover distH in arrive seconds with exponential decay:
            // v0 = distH * k / (1 - exp(-k * arrive))
            const expFactor = 1 - Math.exp(-k * arrive);
            const v0H = (distH * k) / Math.max(1e-4, expFactor);
            const dirX = dx / distH;
            const dirZ = dz / distH;
            bvx = dirX * v0H;
            bvz = dirZ * v0H;
          } else {
            bvx = 0;
            bvz = 0;
          }

          bvy = touch.lift ?? 0;
        }

        touchIdx++;
      }

      // If stay is active, follow the foot if tracks are provided
      if (isStaying && tracks && tracks.points.length > 0) {
        const frameIdx = Math.min(
          tracks.points.length - 1,
          Math.max(0, Math.round((clip.in + t) * tracks.fps)),
        );
        const p = tracks.points[frameIdx];
        const toe = activeStayFoot === 'L' ? p.toeL : p.toeR;
        bx = -toe.x;
        bz = toe.z + 0.11;
        by = BALL.radius;
        bvx = 0;
        bvy = 0;
        bvz = 0;
      } else {
        // Integrate physics: friction + gravity + bounce
        // Horizontal friction
        const speedH = Math.hypot(bvx, bvz);
        if (speedH > 1e-4) {
          const decay = Math.exp(-k * dt);
          bvx *= decay;
          bvz *= decay;
        }

        // Vertical gravity
        if (by > BALL.radius || bvy > 0) {
          bvy -= BALL.gravity * dt;
        }

        bx += bvx * dt;
        by += bvy * dt;
        bz += bvz * dt;

        // Ground bounce
        if (by <= BALL.radius) {
          by = BALL.radius;
          if (bvy < -1.0) {
            bvy = -bvy * BALL.groundRestitution;
          } else {
            bvy = 0;
          }
        }
      }

      samples.push({
        t: Number(t.toFixed(4)),
        x: bx,
        y: by,
        z: bz,
        vx: bvx,
        vy: bvy,
        vz: bvz,
      });
    }

    this.samples = samples;
    this.warnings = warnings;
    return { samples, warnings };
  }

  sampleAt(t: number, out: Vector3 = _pos): Vector3 {
    if (this.samples.length === 0) {
      return out.set(0, BALL.radius, 0.4);
    }
    if (t <= this.samples[0].t) {
      const s = this.samples[0];
      return out.set(s.x, s.y, s.z);
    }
    const last = this.samples[this.samples.length - 1];
    if (t >= last.t) {
      return out.set(last.x, last.y, last.z);
    }

    // Binary search for surrounding samples
    let low = 0;
    let high = this.samples.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.samples[mid].t < t) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const s1 = this.samples[Math.max(0, low - 1)];
    const s2 = this.samples[Math.min(this.samples.length - 1, low)];
    const span = Math.max(1e-4, s2.t - s1.t);
    const alpha = Math.max(0, Math.min(1, (t - s1.t) / span));

    out.set(
      s1.x + (s2.x - s1.x) * alpha,
      s1.y + (s2.y - s1.y) * alpha,
      s1.z + (s2.z - s1.z) * alpha,
    );
    return out;
  }

  getSamples(): BallTrajectorySample[] {
    return this.samples;
  }

  getWarnings(): ReplayWarning[] {
    return this.warnings;
  }
}
