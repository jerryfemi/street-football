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

/**
 * Test mode: no check-ball, no score, no DEFENDED/foul round ends, scoreboard hidden.
 * Tackles, blocks and goals still happen; a goal just hands the ball back. Set false for matches.
 */
export const FREE_PLAY = true;

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
  /** a dribble strike is a foot's forward swing peaking at least this far in front (m) */
  peakMinZ: 0.14,
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
    /**
     * Calm idle exported from Mixamo ON THIS CHARACTER. Also the rest-pose reference every other
     * clip is retargeted onto (player/retarget.ts) - keep it first and keep it.
     */
    idle: 'anims/idle_calm.fbx',
    // ---- 2026-11 mocap set (anims/v2) ----
    idle_ball: 'anims/v2/idle_with_ball.fbx',
    run: 'anims/v2/dribble_jog_loop.fbx',
    sprint: 'anims/v2/dribble_sprint_loop.fbx',
    dribble: 'anims/v2/dribble_jog_loop.fbx',
    dribble_sprint: 'anims/v2/dribble_sprint_loop.fbx',
    receive: 'anims/v2/receive_trap.fbx',
    // sharp touches / cuts (yaw is stripped on load; the game turns the body)
    cut_45_L: 'anims/v2/turn_45_L.fbx',
    cut_45_R: 'anims/v2/turn_45_R.fbx',
    cut_90_L: 'anims/v2/turn_90_L.fbx',
    cut_90_R: 'anims/v2/turn_90_R.fbx',
    // feints (mirrored "_m" versions are generated on load, see ANIM_MIRROR)
    skill_drag_back: 'anims/v2/turn_180_drag.fbx',
    skill_roulette: 'anims/v2/roulette.fbx',
    skill_rainbow: 'anims/v2/rainbow_flick.fbx',
    // shooting / passing
    shoot: 'anims/v2/shot_running.fbx',
    shoot_standing: 'anims/v2/shot_standing_mixamo.fbx',
    shoot_chip: 'anims/v2/shot_chip.fbx',
    pass: 'anims/v2/pass_short_mixamo.fbx',
    // defending
    defend_stance: 'anims/v2/defend_stance_loop_mixamo.fbx',
    jockey: 'anims/v2/jockey_back.fbx',
    jockey_L: 'anims/v2/jockey_L.fbx',
    jockey_R: 'anims/v2/jockey_R.fbx',
    jockey_back: 'anims/v2/jockey_back.fbx',
    tackle: 'anims/v2/standing_tackle.fbx',
    slide_tackle: 'anims/v2/slide_tackle.fbx',
    beaten_turn: 'anims/v2/beaten_turn.fbx',
    // reactions
    stumble: 'anims/v2/stumble_tackled.fbx',
    frustrated: 'anims/v2/frustrated.fbx',
    // extras, not wired to controls yet
    header: 'anims/v2/bonus_header.fbx',
    scissor_kick: 'anims/v2/bonus_scissor_kick.fbx',
  } as Record<string, string>,
  /**
   * Locomotion loops: their hips travel is removed (the game moves the body).
   * Clips in ANIM_MOTION keep nothing either - their travel and turn are measured and replayed.
   */
  lockRootMotion: ['idle', 'idle_ball', 'run', 'sprint', 'dribble', 'dribble_sprint', 'defend_stance', 'jockey', 'jockey_L', 'jockey_R', 'jockey_back', 'receive', 'frustrated'] as string[],
  /**
   * Optional [start, end] seconds to cut from a clip.
   */
  clipRanges: {
    tackle: [0, 0.95],
  } as Record<string, [number, number]>,
  /**
   * Optional bone renames for clips that don't use Mixamo bone names
   * (e.g. a Rokoko export without the Mixamo preset). key = source bone, value = Mixamo bone.
   * Example: { Hips: 'mixamorigHips', Spine: 'mixamorigSpine' }
   */
  boneRemap: {} as Record<string, string>,
} as const;

/** Short mocap loops that pop when they wrap - play them forward/backward instead. */
export const ANIM_PINGPONG: string[] = [];

/**
 * One-shot moves whose root travel + turn are MEASURED from the clip on load and replayed by the
 * game (Player follows the clip's own path), so feet never slide. The clip itself is played in place.
 */
export const ANIM_MOTION: string[] = [
  'cut_45_L', 'cut_45_R', 'cut_90_L', 'cut_90_R',
  'skill_drag_back', 'skill_roulette', 'skill_rainbow', 'beaten_turn',
  'shoot', 'shoot_standing', 'shoot_chip', 'pass', 'tackle', 'slide_tackle', 'stumble',
];

/** Single-sided moves: a left/right mirrored copy is built on load as `<name>_m`. */
export const ANIM_MIRROR: string[] = ['skill_drag_back', 'skill_roulette', 'skill_rainbow'];

/** If a clip is missing, try these instead (in order). */
export const ANIM_FALLBACKS: Record<string, string[]> = {
  idle_ball: ['idle'],
  walk: ['run', 'dribble'],
  run: ['dribble'],
  sprint: ['run', 'dribble'],
  dribble: ['run'],
  dribble_sprint: ['sprint', 'dribble'],
  receive: ['idle_ball', 'idle'],
  skill_knockon: ['dribble_sprint', 'sprint'],
  shoot: ['shoot_standing', 'pass', 'idle'],
  shoot_standing: ['shoot', 'pass'],
  shoot_chip: ['shoot'],
  pass: ['shoot', 'idle'],
  block: ['defend_stance', 'idle'],
  defend_stance: ['jockey', 'idle'],
  jockey: ['defend_stance', 'idle'],
  jockey_L: ['jockey'],
  jockey_R: ['jockey'],
  jockey_back: ['jockey'],
  slide_tackle: ['tackle', 'run'],
  tackle: ['run'],
  stumble: ['idle'],
  celebrate: ['idle'],
  frustrated: ['idle'],
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
