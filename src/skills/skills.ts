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
  duration: number;
  playerPath: readonly Keyframe[];
  /** where the ball is set at the start of the move (local) */
  set?: { x: number; z: number };
  /** let animated feet push the ball during the move */
  footPush: boolean;
  /** the decisive touch */
  take: { t: number; x: number; z: number; chase?: boolean; arriveIn?: number };
  /** which way it SELLS to the defender (-1 left, +1 right, 0 none) */
  fakeSide: -1 | 0 | 1;
  /** seconds a tackle can't win the ball */
  protectedFor: number;
}

export const SKILLS: Record<string, SkillDef> = {
  /** Stepover: leg circles over the ball selling LEFT, ball taken RIGHT. */
  stepover: {
    id: 'stepover',
    anim: 'skill_stepover',
    duration: 1.25,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.6, x: -0.1, z: 0.15 },
      { t: 1, x: 0.8, z: 0.9 },
    ],
    set: { x: 0.0, z: 0.28 },
    footPush: true,
    take: { t: 0.68, x: 1.15, z: 1.5 },
    fakeSide: -1,
    protectedFor: 0.75,
  },

  /** Body feint: hips dip left, no touch, then the ball is pushed right. */
  bodyfeint: {
    id: 'bodyfeint',
    anim: 'skill_bodyfeint',
    duration: 1.2,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.4, x: -0.3, z: 0.1 },
      { t: 1, x: 0.8, z: 0.9 },
    ],
    set: { x: 0, z: 0.32 },
    footPush: false,
    take: { t: 0.62, x: 1.1, z: 1.5 },
    fakeSide: -1,
    protectedFor: 0.55,
  },

  /** Elastico: outside of the left foot pushes it out, then snaps it back across to the right. */
  elastico: {
    id: 'elastico',
    anim: 'skill_elastico',
    duration: 1.15,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.35, x: -0.15, z: 0.1 },
      { t: 1, x: 0.85, z: 0.85 },
    ],
    set: { x: -0.25, z: 0.2 },
    footPush: true,
    take: { t: 0.5, x: 1.1, z: 1.4 },
    fakeSide: -1,
    protectedFor: 0.8,
  },

  /** Samba roll: sole rolls it across the body, player spins away to the left. */
  samba_roll: {
    id: 'samba_roll',
    anim: 'skill_samba_roll',
    duration: 1.5,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.5, x: -0.4, z: 0.05 },
      { t: 1, x: -1.0, z: 0.5 },
    ],
    set: { x: 0, z: 0.22 },
    footPush: true,
    take: { t: 0.55, x: -1.25, z: 1.0 },
    fakeSide: 1,
    protectedFor: 1.0,
  },

  /** Drop of the shoulder: short dip left, then a big touch right and away. */
  drop_shoulder: {
    id: 'drop_shoulder',
    anim: 'skill_drop_shoulder',
    duration: 0.95,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.45, x: -0.25, z: 0.15 },
      { t: 1, x: 0.8, z: 1.1 },
    ],
    set: { x: 0, z: 0.38 },
    footPush: false,
    take: { t: 0.55, x: 1.6, z: 2.6, chase: true, arriveIn: 0.7 },
    fakeSide: -1,
    protectedFor: 0.5,
  },

  /** Drag stepover: sole drags it back, step over, out to the right. Escape when pressed. */
  drag_stepover: {
    id: 'drag_stepover',
    anim: 'skill_stepover_drag',
    duration: 1.5,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.4, x: 0, z: -0.3 },
      { t: 1, x: 0.9, z: 0.3 },
    ],
    set: { x: 0.05, z: 0.15 },
    footPush: true,
    take: { t: 0.72, x: 1.3, z: 0.7 },
    fakeSide: -1,
    protectedFor: 0.9,
  },

  /** Knock-on: push it past him diagonally and the player sprints onto it automatically. */
  knockon: {
    id: 'knockon',
    anim: 'skill_knockon',
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
