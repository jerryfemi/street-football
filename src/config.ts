/**
 * Every tunable number lives here. Units are metres, seconds, radians.
 * World axes: +Y up. The goal sits at -Z. Attacker starts at +Z and attacks toward -Z.
 */

/**
 * Play area = one half of the futsal court art (public/models/arena.glb, 22 x 42 m).
 * Side boards are real; the back boundary is the halfway line (invisible wall).
 */
export const PITCH = {
  width: 22, // x extent (board to board)
  length: 21, // z extent (halfway line to goal line)
  wallHeight: 1.3,
} as const;

export const GOAL = {
  width: 3.1,
  height: 2.05,
  depth: 1.0,
  postRadius: 0.06,
  /** z of the goal line */
  z: -PITCH.length / 2,
} as const;

export const PLAYER = {
  height: 1.8,
  radius: 0.35,
  runSpeed: 5.0,
  sprintSpeed: 7.0,
  /** speed multiplier while carrying the ball */
  dribbleSpeedFactor: 0.88,
  accel: 22,
  decel: 16,
  /** how fast the body turns to face movement (higher = snappier) */
  turnRate: 12,
} as const;

export const BALL = {
  radius: 0.11,
  gravity: 9.81,
  groundRestitution: 0.55,
  wallRestitution: 0.6,
  postRestitution: 0.7,
  /** fraction of horizontal speed lost per second while rolling */
  rollingFriction: 0.9,
  airDrag: 0.05,
  /** how close (m, xz) a player's feet must be to collect a loose ball */
  pickupRadius: 0.6,
} as const;

/** Ball control (Match.carryBall / dribble / skillBall). */
export const DRIBBLE = {
  /** turf drag on a dribbled ball (fraction of speed lost per second) */
  friction: 2.6,
  /** drag while a skill is being performed (ball sits more) */
  skillFriction: 5,
  /** drag when standing on the ball */
  trapFriction: 6,
  /** a foot crossing this far in front of the body (m) is a dribble beat */
  contactZ: 0.28,
  /** owned ball further than this from the player = lost touch (ball goes loose, he chases it) */
  loseDistance: 2.2,
  /** turning with the ball: auto touch when the ball is within this range and off his line */
  turnReach: 1.4,
  /** ...and its direction is less than this cosine of his facing (~55°) */
  turnCos: 0.57,
  /** a beat only touches the ball if it is within this distance of the foot's contact point */
  reach: 1.0,
  /** min seconds between two dribble touches */
  minTouchGap: 0.26,
  /** the stepping foot must be this close to the ball for its beat to be a touch (m) */
  footReach: 0.6,
  /** never time a touch shorter than this (s) */
  minBeat: 0.22,
  /** beat interval when the dribble clip isn't available */
  fallbackBeat: 0.42,
  maxTouchSpeed: 14,
  /** below this speed the player is "standing on the ball" */
  standSpeed: 0.6,
  /** skills: seconds spent setting the ball at the start of a move */
  setTime: 0.14,
  /** skills: a foot lower than this (m) and closer than footContact can push the ball */
  footLift: 0.16,
  footContact: 0.2,
  maxFootPush: 5,
  /** skills: ball can never be further than this from the player during a fake (m) */
  skillLeash: 0.85,
} as const;

export const SHOT = {
  minSpeed: 9,
  maxSpeed: 24,
  /** seconds of holding the shoot key to reach full power */
  chargeTime: 0.9,
  /** delay from starting the shoot animation to boot-on-ball */
  contactTime: 0.2,
  duration: 0.6,
  maxLift: 0.35, // vertical component at full power, as a fraction of speed
} as const;

export const TACKLE = {
  duration: 0.55,
  activeFrom: 0.1,
  activeTo: 0.35,
  reach: 1.0,
  /** min seconds between two dribble touches */
  minTouchGap: 0.26,
  /** the stepping foot must be this close to the ball for its beat to be a touch (m) */
  footReach: 0.6,
  lungeSpeed: 6,
  cooldown: 1.2,
  stumbleTime: 0.7,
} as const;

/** Slide tackle: longer reach and lunge, but a long recovery if it misses. */
export const SLIDE = {
  duration: 0.9,
  activeFrom: 0.12,
  activeTo: 0.55,
  reach: 1.15,
  lungeSpeed: 9,
  missRecovery: 1.1,
} as const;

/** Defender block stance (makes the body bigger to shots). */
export const BLOCK = {
  duration: 0.8,
  /** extra body radius while blocking (m) */
  extraRadius: 0.35,
} as const;

/** Body contact (Match contact layer). */
export const CONTACT = {
  /** a tackling foot this close to the attacker's shin/foot, before the ball, is a trip (m) */
  tripReach: 0.1,
  /** closing speed (m/s) at which two bodies meeting becomes an impact, not just a nudge */
  bumpSpeed: 3.2,
  /** ball speed that knocks a player back when it hits the torso/head */
  staggerBallSpeed: 13,
  /** feet must be at least this far apart for the ball to fit between them (m) */
  minNutmegGap: 0.3,
  /** seconds after a nutmeg in which collecting the ball = panna (round win) */
  pannaWindow: 3,
  /** a loose ball faster than this can't be collected - it hits you (m/s) */
  controlSpeed: 6.5,
  /** a foot this close to a loose ball can trap it (m) */
  footPickup: 0.3,
  /** reaction time before a foot can trap a moving ball (s) */
  reactAttacker: 0.03,
  reactDefender: 0.14,
} as const;

/** Bounciness of the ball off each body part (planted feet override to ~0.1). */
export const RESTITUTION = {
  foot: 0.45,
  shin: 0.5,
  thigh: 0.35,
  torso: 0.15,
  chest: 0.2,
  head: 0.55,
} as const;

export const ROUND = {
  /** seconds the attacker has to score once the ball is live */
  shotClock: 12,
  pointsToWin: 5,
  resetDelay: 2.0,
} as const;

export const CAMERA = {
  fov: 50,
  distance: 5.6,
  height: 3.3,
  followSharpness: 5,
  lookSharpness: 7,
} as const;

/** Render budget: cap device pixel ratio so mobile GPUs don't melt (same lesson as DunkVerse). */
export const RENDER = {
  maxPixelRatio: 1.5,
  shadowMapSize: 1024,
  fixedStep: 1 / 60,
  maxFrameDt: 0.1,
} as const;

/**
 * ASSETS
 * Files live in /public. Anything missing is skipped and the game falls back
 * (placeholder body if the character is missing, fallback clip if an animation is missing).
 */
export const ASSETS = {
  /** Mixamo character downloaded "With Skin" (.fbx) or a packed .glb */
  character: 'models/player.fbx',
  /**
   * Arena art (.glb). Missing = primitive cage. `goalLineZ` is where the art's goal line sits
   * in its own coordinates; the loader shifts the model so it lines up with GOAL.z.
   */
  arena: { path: 'models/arena.glb', goalLineZ: -21 },
  /** Ball model (.glb, ~0.22 m diameter). Missing = procedural ball. */
  ball: 'models/ball.glb',
  /** Target standing height in metres; the model is auto-scaled to this. */
  targetHeight: 1.8,
  /**
   * Animation name -> file. Mixamo: FBX Binary, 30 fps, "Without Skin".
   * Rokoko: FBX exported with the Mixamo skeleton preset.
   * Rename freely, but keep the keys - code plays animations by these keys.
   */
  anims: {
    /** calm standing idle - get Mixamo "Breathing Idle" and save as idle_calm.fbx */
    idle: 'anims/idle_calm.fbx',
    /** Mixamo "Soccer Idle" (bouncy ready stance) - used until idle_calm exists */
    idle_soccer: 'anims/idle.fbx',
    /** Mixamo "Walking" (In Place) */
    walk: 'anims/walk.fbx',
    /** sharp-touch cut (Dash tap + direction) */
    cut: 'anims/rokoko/bodyfeint_running.fbx',
    run: 'anims/run.fbx',
    sprint: 'anims/sprint.fbx',
    dribble: 'anims/dribble.fbx',
    receive: 'anims/receive.fbx',
    // Rokoko video-mocap (anims/rokoko/*): retargeted on load (rotations only, hips height rescaled)
    skill_stepover: 'anims/rokoko/stepover_stationary.fbx',
    skill_stepover_side: 'anims/rokoko/stepover_side.fbx',
    skill_stepover_drag: 'anims/rokoko/stepover_drag.fbx',
    skill_stepover_moving: 'anims/rokoko/stepover_moving.fbx',
    skill_samba_roll: 'anims/rokoko/samba_roll.fbx',
    skill_samba_a: 'anims/rokoko/samba_variant_a.fbx',
    skill_samba_b: 'anims/rokoko/samba_variant_b.fbx',
    skill_elastico: 'anims/rokoko/elastico.fbx',
    skill_bodyfeint: 'anims/rokoko/bodyfeint_classic.fbx',
    skill_bodyfeint_run: 'anims/rokoko/bodyfeint_running.fbx',
    skill_drop_shoulder: 'anims/rokoko/drop_shoulder.fbx',
    block: 'anims/rokoko/defender_block.fbx',
    slide_tackle: 'anims/rokoko/slide_tackle.fbx',
    defend_stance: 'anims/rokoko/defender_stance.fbx',
    skill_knockon: 'anims/skill_knockon.fbx',
    shoot: 'anims/shoot.fbx',
    pass: 'anims/pass.fbx',
    jockey: 'anims/jockey.fbx',
    tackle: 'anims/tackle.fbx',
    stumble: 'anims/stumble.fbx',
    celebrate: 'anims/celebrate.fbx',
    // extras downloaded 2026-10-29 (not wired to controls yet)
    skill_spin: 'anims/skill_spin.fbx',
    scissor_kick: 'anims/scissor_kick.fbx',
    trick_stall: 'anims/trick_stall.fbx', // right foot
    trick_knee: 'anims/trick_knee.fbx', // right foot
    trick_stall_left: 'anims/trick_stall_left.fbx',
    trick_knee_left: 'anims/trick_knee_left.fbx',
    stumble_back: 'anims/stumble_back.fbx',
  } as Record<string, string>,
  /**
   * Clips whose hips should NOT move the character horizontally
   * (locomotion that wasn't downloaded "In Place").
   */
  lockRootMotion: ['idle', 'idle_soccer', 'walk', 'run', 'sprint', 'dribble', 'jockey'] as string[],
  /**
   * Optional [start, end] seconds to cut from a clip (drops the T-pose first frames of Rokoko
   * exports, or keeps one repetition of a drill that repeats the move).
   */
  clipRanges: {
    skill_stepover: [0.1, 1.97],
    skill_stepover_side: [0.1, 2.27],
    skill_stepover_drag: [0.1, 2.5],
    skill_stepover_moving: [0.1, 2.07],
    skill_samba_roll: [0.1, 2.13],
    skill_samba_a: [0.1, 2.37],
    skill_samba_b: [0.1, 2.83],
    skill_elastico: [0.1, 2.0],
    skill_bodyfeint: [0.1, 2.1],
    skill_bodyfeint_run: [0.1, 1.7],
    cut: [0.15, 0.9],
    skill_drop_shoulder: [0.1, 1.47],
    block: [0.1, 1.3],
    slide_tackle: [0.1, 1.17],
    defend_stance: [0.1, 1.27],
  } as Record<string, [number, number]>,
  /**
   * Optional bone renames for clips that don't use Mixamo bone names
   * (e.g. a Rokoko export without the Mixamo preset). key = source bone, value = Mixamo bone.
   * Example: { Hips: 'mixamorigHips', Spine: 'mixamorigSpine' }
   */
  boneRemap: {} as Record<string, string>,
} as const;

/** Short mocap loops that pop when they wrap - play them forward/backward instead. */
export const ANIM_PINGPONG: string[] = ['defend_stance'];

/** If a clip is missing, try these instead (in order). */
export const ANIM_FALLBACKS: Record<string, string[]> = {
  idle: ['idle_soccer'],
  walk: ['run', 'dribble'],
  cut: ['skill_bodyfeint_run', 'dribble'],
  run: ['dribble'],
  sprint: ['run', 'dribble'],
  dribble: ['run'],
  receive: ['idle'],
  skill_stepover: ['dribble', 'run'],
  skill_elastico: ['skill_stepover', 'dribble'],
  skill_bodyfeint: ['skill_stepover', 'dribble'],
  skill_drop_shoulder: ['skill_bodyfeint', 'dribble'],
  skill_samba_roll: ['skill_stepover', 'dribble'],
  skill_stepover_drag: ['skill_stepover', 'dribble'],
  block: ['defend_stance', 'idle'],
  slide_tackle: ['tackle', 'run'],
  defend_stance: ['jockey', 'idle'],
  skill_knockon: ['sprint', 'run'],
  shoot: ['pass', 'idle'],
  pass: ['shoot', 'idle'],
  jockey: ['run', 'idle'],
  tackle: ['run'],
  stumble: ['idle'],
  celebrate: ['idle'],
};

export const COLORS = {
  attackerKit: 0x38bdf8,
  defenderKit: 0xf59e0b,
  turf: 0x2f6b3a,
  asphalt: 0x23262d,
  lines: 0xf1f5f9,
  walls: 0x111827,
  sky: 0x0a0e1a,
} as const;
