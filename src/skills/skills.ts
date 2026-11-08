import type { Keyframe } from '../core/math';

/**
 * A skill = animation + where the BODY goes + how the BALL is handled. The ball is NOT scripted
 * frame by frame. It goes through three phases:
 *
 *   1. SET   - first ~0.15 s: the ball is eased to `set`, the spot the clip's feet work around
 *              (between the feet for stepovers, outside the left foot for an elastico...)
 *   2. FEET  - during the move the ball only moves when an ANIMATED FOOT actually sweeps through
 *              it (Match reads the toe bones), otherwise it sits / rolls. So the fake happens
 *              around a real ball, and pushes come from real feet.
 *   3. TAKE  - at `take.t` the game plays the decisive touch: the ball is sent to `take` (local
 *              point) timed to arrive as the player gets there. `chase: true` = the ball is
 *              released and the player automatically sprints onto it (knock-ons).
 *
 * Local coordinates: x = player's right, z = player's forward, t = 0..1 of `duration`.
 * Authored "breaking right"; mirror = break left (x is flipped).
 */
export interface SkillDef {
  id: string;
  anim: string;
  /** seconds; for measured moves (`measured`) the clip's own length is used instead */
  duration: number;
  /** hand-authored body path (ignored when the clip's measured root motion is available) */
  playerPath: readonly Keyframe[];
  /**
   * Use the clip's measured root motion (travel + turn) for the body. The mirrored move plays
   * the generated `<anim>_m` clip with the path flipped.
   */
  measured?: boolean;
  /** which side the clip itself goes (+1 right, -1 left): picks plain vs mirrored for a wanted side */
  clipSide?: -1 | 1;
  /** where the ball is set at the start of the move (local) */
  set?: { x: number; z: number };
  /** let animated feet push the ball during the move */
  footPush: boolean;
  /**
   * The decisive touch at `t` (0..1). x/z = local target. With `measured`, `toEnd` sends it to
   * where the player will be when the move ends, `lead` metres in front of his final facing.
   * `lift` = upward speed (m/s) for flicks over the defender.
   */
  take: { t: number; x: number; z: number; chase?: boolean; arriveIn?: number; toEnd?: boolean; lead?: number; lift?: number };
  /** which way it SELLS to the defender (-1 left, +1 right, 0 none) */
  fakeSide: -1 | 0 | 1;
  /** seconds a tackle can't win the ball */
  protectedFor: number;
}

/** Cuts/turns: measured clips, ball taken with him to where he ends up. Authored to the RIGHT. */
function cut(id: string, anim: string, t: number): SkillDef {
  return {
    id,
    anim,
    duration: 0.8,
    playerPath: [{ t: 0, x: 0, z: 0 }, { t: 1, x: 0.6, z: 0.8 }],
    measured: true,
    clipSide: 1,
    footPush: false,
    take: { t, x: 0.8, z: 1.0, toEnd: true, lead: 0.45 },
    fakeSide: 0,
    protectedFor: 0.3,
  };
}

export const SKILLS: Record<string, SkillDef> = {
  cut_45: cut('cut_45', 'cut_45_R', 0.3),
  cut_90: cut('cut_90', 'cut_90_R', 0.3),

  /** Drag back: sole pulls it back and he turns away with it (escape when pressed). */
  drag_back: {
    id: 'drag_back',
    anim: 'skill_drag_back',
    duration: 2.15,
    playerPath: [{ t: 0, x: 0, z: 0 }, { t: 1, x: 0, z: -0.5 }],
    measured: true,
    clipSide: -1,
    set: { x: 0, z: 0.3 },
    footPush: true,
    take: { t: 0.4, x: 0, z: -1, toEnd: true, lead: 0.45 },
    fakeSide: 0,
    protectedFor: 0.9,
  },

  /** Roulette: 360° spin over the ball, rolling it across his body away from the defender. */
  roulette: {
    id: 'roulette',
    anim: 'skill_roulette',
    duration: 1.27,
    playerPath: [{ t: 0, x: 0, z: 0 }, { t: 1, x: 0.6, z: 1.2 }],
    measured: true,
    clipSide: -1,
    set: { x: 0, z: 0.3 },
    footPush: true,
    take: { t: 0.62, x: 0.6, z: 1.6, toEnd: true, lead: 0.45 },
    fakeSide: -1,
    protectedFor: 0.95,
  },

  /** Rainbow flick: heel flicks it up over his head and over the defender; he chases it. */
  rainbow: {
    id: 'rainbow',
    anim: 'skill_rainbow',
    duration: 1.32,
    playerPath: [{ t: 0, x: 0, z: 0 }, { t: 1, x: 0, z: 0.3 }],
    measured: true,
    clipSide: 1,
    set: { x: 0, z: 0.15 },
    footPush: false,
    take: { t: 0.72, x: 0, z: 3.4, chase: true, arriveIn: 0.95, lift: 4.6 },
    fakeSide: 0,
    protectedFor: 1.0,
  },

  /** Knock-on: push it past him and sprint onto it automatically. */
  knockon: {
    id: 'knockon',
    anim: 'dribble_sprint',
    duration: 0.3,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 1, x: 0.3, z: 0.8 },
    ],
    footPush: false,
    take: { t: 0.2, x: 1.4, z: 5.0, chase: true, arriveIn: 0.9 },
    fakeSide: 0,
    protectedFor: 0.25,
  },
};
