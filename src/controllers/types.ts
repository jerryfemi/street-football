/**
 * What a player WANTS to do this step. Produced by a controller (human keyboard/touch,
 * AI, or later a network peer) and consumed by Player/Match.
 *
 * Keeping this a plain serialisable object is deliberate: online multiplayer can send
 * intents instead of positions.
 */
export interface PlayerIntent {
  /** Desired world-space move direction (x, z), length 0..1. */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  /** Optional world-space direction to face (defenders face the ball while jockeying). */
  faceX?: number;
  faceZ?: number;
  jockey: boolean;
  /** Released the shoot button this step. power 0..1, aimX -1..1 (left/right of goal). */
  shoot: { power: number; aimX: number } | null;
  skill: { id: string; mirror: boolean } | null;
  tackle: boolean;
  /** Tackle as a slide (longer reach, long recovery on a miss). */
  slide?: boolean;
  /** Drop into a blocking stance (vs an incoming shot). */
  block?: boolean;
}

export function emptyIntent(): PlayerIntent {
  return { moveX: 0, moveZ: 0, sprint: false, jockey: false, shoot: null, skill: null, tackle: false };
}

export function clearIntent(i: PlayerIntent): void {
  i.moveX = 0;
  i.moveZ = 0;
  i.sprint = false;
  i.faceX = undefined;
  i.faceZ = undefined;
  i.jockey = false;
  i.shoot = null;
  i.skill = null;
  i.tackle = false;
  i.slide = false;
  i.block = false;
}
