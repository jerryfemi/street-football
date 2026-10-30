/**
 * Every tunable number lives here. Units are metres, seconds, radians.
 * World axes: +Y up. The goal sits at -Z. Attacker starts at +Z and attacks toward -Z.
 */

export const PITCH = {
  width: 14, // x extent (wall to wall)
  length: 20, // z extent (back wall to goal line)
  wallHeight: 1.1,
} as const;

export const GOAL = {
  width: 3.0,
  height: 2.0,
  depth: 1.2,
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
  /** how far ahead of the player the ball sits while dribbling */
  dribbleDistance: 0.5,
} as const;

/** Touch-based dribbling (Match.dribble). */
export const DRIBBLE = {
  /** turf drag on a dribbled ball (fraction of speed lost per second) */
  friction: 2.6,
  /** extra speed a touch gives the ball over the player's own speed */
  pushBase: 1.4,
  pushPerSpeed: 0.32,
  /** min seconds between touches */
  minTouchGap: 0.22,
  /** touch when the ball gets closer than this in front (m) */
  minAhead: 0.38,
  /** touch to recentre when the ball drifts this far sideways (m) */
  maxSide: 0.42,
  recentre: 2.2,
  /** an animated foot within this distance of the ball counts as a touch (m) */
  footContact: 0.2,
  footReachAhead: 0.85,
  maxLead: 1.7,
  /** below this speed the player is "standing on the ball" */
  standSpeed: 0.6,
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
  reach: 0.75,
  lungeSpeed: 6,
  cooldown: 1.2,
  stumbleTime: 0.7,
} as const;

export const ROUND = {
  /** seconds the attacker has to score once the ball is live */
  shotClock: 12,
  pointsToWin: 5,
  resetDelay: 2.0,
} as const;

export const CAMERA = {
  fov: 50,
  distance: 7.5,
  height: 4.6,
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
    idle: 'anims/idle.fbx',
    run: 'anims/run.fbx',
    sprint: 'anims/sprint.fbx',
    dribble: 'anims/dribble.fbx',
    receive: 'anims/receive.fbx',
    skill_stepover: 'anims/skill_stepover.fbx',
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
  lockRootMotion: ['idle', 'run', 'sprint', 'dribble', 'jockey'] as string[],
  /**
   * Optional bone renames for clips that don't use Mixamo bone names
   * (e.g. a Rokoko export without the Mixamo preset). key = source bone, value = Mixamo bone.
   * Example: { Hips: 'mixamorigHips', Spine: 'mixamorigSpine' }
   */
  boneRemap: {} as Record<string, string>,
} as const;

/** If a clip is missing, try these instead (in order). */
export const ANIM_FALLBACKS: Record<string, string[]> = {
  run: ['dribble'],
  sprint: ['run', 'dribble'],
  dribble: ['run'],
  receive: ['idle'],
  skill_stepover: ['dribble', 'run'],
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
