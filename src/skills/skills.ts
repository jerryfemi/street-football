import type { Keyframe } from '../core/math';

/**
 * A skill = an animation + a scripted player path + a scripted ball path.
 *
 * All paths are LOCAL to the player at the moment the skill starts:
 *   x = player's right, z = player's forward, t = 0..1 of `duration`.
 * Paths are authored for the "right-footed / break right" version; pressing the
 * skill while steering left mirrors x (so the same data gives both directions).
 *
 * To add a skill:
 *   1. Get the animation (Mixamo / Rokoko) -> public/anims/skill_<id>.fbx, add it to config.ASSETS.anims
 *   2. Add a SkillDef below. Scrub the clip and match the ball path to the touches.
 *   3. Bind a key in controllers/HumanController.ts
 */
export interface SkillDef {
  id: string;
  anim: string;
  duration: number;
  playerPath: readonly Keyframe[];
  /** Ball position relative to the player's START position. Omit if the ball is released. */
  ballPath?: readonly Keyframe[];
  /** Release the ball at this normalised time with a local velocity (knock-ons, flicks). */
  release?: { t: number; vx: number; vz: number; vy?: number };
  /**
   * Which way the move SELLS to the defender, in local x (-1 = sells left, +1 = sells right, 0 = no fake).
   * Defender AI may "bite" toward this side - that's what beats them.
   */
  fakeSide: -1 | 0 | 1;
  /** Seconds during which a tackle can't win the ball (the protected part of the move). */
  protectedFor: number;
}

export const SKILLS: Record<string, SkillDef> = {
  /**
   * Stepover: leg circles the ball as if going LEFT, then the ball is taken RIGHT.
   */
  stepover: {
    id: 'stepover',
    anim: 'skill_stepover',
    duration: 1.5, // Rokoko clip is ~1.9 s; played a little faster for arcade snap
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.4, x: -0.2, z: 0.15 },
      { t: 0.65, x: 0.35, z: 0.35 },
      { t: 1, x: 1.1, z: 0.9 },
    ],
    ballPath: [
      { t: 0, x: 0, z: 0.45 },
      { t: 0.45, x: -0.05, z: 0.5 },
      { t: 0.7, x: 0.6, z: 0.8 },
      { t: 1, x: 1.35, z: 1.4 },
    ],
    fakeSide: -1,
    protectedFor: 0.9,
  },

  /** Body feint: drop the hips one way without touching the ball, then push it the other. */
  bodyfeint: {
    id: 'bodyfeint',
    anim: 'skill_bodyfeint',
    duration: 1.4,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.35, x: -0.35, z: 0.1 },
      { t: 0.6, x: -0.1, z: 0.25 },
      { t: 1, x: 1.0, z: 0.9 },
    ],
    ballPath: [
      { t: 0, x: 0, z: 0.45 },
      { t: 0.55, x: 0, z: 0.5 },
      { t: 0.75, x: 0.55, z: 0.75 },
      { t: 1, x: 1.25, z: 1.35 },
    ],
    fakeSide: -1,
    protectedFor: 0.6,
  },

  /** Drop of the shoulder: quick, short fake then a burst the other way with a big touch. */
  drop_shoulder: {
    id: 'drop_shoulder',
    anim: 'skill_drop_shoulder',
    duration: 1.0,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.4, x: -0.3, z: 0.15 },
      { t: 1, x: 0.9, z: 1.2 },
    ],
    release: { t: 0.55, vx: 3.2, vz: 5.5 },
    fakeSide: -1,
    protectedFor: 0.5,
  },

  /** Elastico: ball pushed out with the outside of the foot, then snapped back across. */
  elastico: {
    id: 'elastico',
    anim: 'skill_elastico',
    duration: 1.3,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.4, x: 0.2, z: 0.15 },
      { t: 1, x: -1.0, z: 0.9 },
    ],
    ballPath: [
      { t: 0, x: 0, z: 0.45 },
      { t: 0.35, x: 0.4, z: 0.5 },
      { t: 0.55, x: 0.25, z: 0.55 },
      { t: 0.8, x: -0.6, z: 0.85 },
      { t: 1, x: -1.25, z: 1.35 },
    ],
    fakeSide: 1,
    protectedFor: 0.9,
  },

  /** Samba roll: sole rolls the ball across the body while turning away from pressure. */
  samba_roll: {
    id: 'samba_roll',
    anim: 'skill_samba_roll',
    duration: 1.6,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.5, x: -0.45, z: 0.05 },
      { t: 1, x: -1.1, z: 0.6 },
    ],
    ballPath: [
      { t: 0, x: 0, z: 0.4 },
      { t: 0.3, x: -0.15, z: 0.35 },
      { t: 0.6, x: -0.6, z: 0.35 },
      { t: 1, x: -1.3, z: 1.0 },
    ],
    fakeSide: 1,
    protectedFor: 1.1,
  },

  /** Drag stepover: pull the ball back, step over it, go out the side. Good escape when pressed. */
  drag_stepover: {
    id: 'drag_stepover',
    anim: 'skill_stepover_drag',
    duration: 1.7,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 0.35, x: 0, z: -0.35 },
      { t: 0.7, x: 0.3, z: -0.2 },
      { t: 1, x: 1.1, z: 0.5 },
    ],
    ballPath: [
      { t: 0, x: 0, z: 0.45 },
      { t: 0.3, x: 0, z: 0.05 },
      { t: 0.65, x: 0.2, z: 0.1 },
      { t: 1, x: 1.4, z: 0.9 },
    ],
    fakeSide: -1,
    protectedFor: 1.0,
  },

  /**
   * Knock-on: push the ball diagonally past the defender and race onto it.
   * Goes right by default; hold left to knock it left.
   * Beats a defender who is square/flat-footed, loses to one already goal-side and close.
   */
  knockon: {
    id: 'knockon',
    anim: 'skill_knockon',
    duration: 0.3,
    playerPath: [
      { t: 0, x: 0, z: 0 },
      { t: 1, x: 0.5, z: 1.2 },
    ],
    release: { t: 0.35, vx: 3.0, vz: 7.0 },
    fakeSide: 0,
    protectedFor: 0.25,
  },
};
