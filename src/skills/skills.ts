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
    duration: 0.95,
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
    protectedFor: 0.6,
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
