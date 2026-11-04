// SOURCE: panna_verse/src/config.ts - keep in sync

export const BALL = {
  radius: 0.11,
  gravity: 9.81,
  groundRestitution: 0.55,
  wallRestitution: 0.6,
  postRestitution: 0.7,
  rollingFriction: 0.9,
  airDrag: 0.05,
  pickupRadius: 0.6,
  dribbleDistance: 0.5,
} as const;

export const DRIBBLE = {
  friction: 2.6,
  pushBase: 1.4,
  pushPerSpeed: 0.32,
  minTouchGap: 0.22,
  minAhead: 0.38,
  maxSide: 0.42,
  recentre: 2.2,
  footContact: 0.2,
  footReachAhead: 0.85,
  maxLead: 1.7,
  standSpeed: 0.6,
  setTime: 0.18,
  minBeat: 0.28,
  trapFriction: 6,
  contactZ: 0.28,
  loseDistance: 2.2,
  turnReach: 1.4,
  turnCos: 0.57,
  reach: 1.0,
} as const;

export const RESTITUTION = {
  foot: 0.45,
  shin: 0.5,
  thigh: 0.35,
  torso: 0.15,
  chest: 0.2,
  head: 0.55,
} as const;

export const CONTACT = {
  tripReach: 0.1,
  bumpSpeed: 3.2,
  staggerBallSpeed: 13,
  minNutmegGap: 0.3,
  pannaWindow: 3,
  controlSpeed: 6.5,
  footPickup: 0.3,
  reactAttacker: 0.03,
  reactDefender: 0.14,
} as const;

export const ASSETS = {
  targetHeight: 1.8,
} as const;

