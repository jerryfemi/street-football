# PannaVerse: Architecture

## One frame

```
Game.frame(time)                       (display rate, e.g. 60/120 Hz)
 ├─ accumulate dt (clamped to 0.1 s)
 ├─ while accumulator ≥ 1/60:          (fixed 60 Hz simulation)
 │    HumanController.update() → PlayerIntent (attacker)
 │    DefenderAI.update()      → PlayerIntent (defender)
 │    Match.step(dt, intents)
 │       ├─ phase logic (check / live / goal / defended / matchOver, shot clock)
 │       ├─ applyActions: intents → startSkill / startShoot / startTackle
 │       ├─ Player.update ×2   (movement, state timers, skill paths)
 │       ├─ separate players
 │       ├─ resolveKick / resolveTackle
 │       └─ ball: owned → carryBall (dribble or skill ballPath / release)
 │                loose → Ball.step (physics) → goal? → bodyBlocks → pickups
 └─ visuals: Player.updateAnimation (choose loop clip, mixer.update), Ball.sync (roll),
             FollowCamera.update, Hud, renderer.render
```

## Responsibilities

| Module | Owns | Must NOT |
|---|---|---|
| `controllers/*` | turning input/AI decisions into a `PlayerIntent` | touch the ball, score, or other players |
| `player/Player` | its own position, velocity, yaw, action state, which clip loops | decide if a tackle worked or where the ball goes |
| `match/Match` | rules, possession, ball ↔ player interactions, events to HUD | read the keyboard |
| `ball/Ball` | free-flight physics, collisions with world, goal detection | know about rules/phases |
| `player/Animator` | playing clips by name with fallbacks + crossfades | gameplay timing (it follows gameplay, never drives it) |
| `config.ts` | every number | logic |

**Gameplay drives animation, never the other way around.** A skill's duration in `skills.ts` is the truth; the clip is
time-stretched to fit (`Animator.play(..., { duration })`). This keeps the simulation deterministic and network-friendly.

## Conventions
- Units: metres, seconds, radians. +Y up. Goal at −Z (`GOAL.z = -10`). Pitch 14 × 20 m.
- Yaw θ → facing `(sin θ, 0, cos θ)`; right = `(−cos θ, 0, sin θ)`. Mixamo models face +Z at θ = 0.
- Local paths: `{ t: 0..1, x: right, z: forward }`, sampled with smoothstep per segment (`samplePath`). `mirror` flips x.
- Scratch vectors at module scope (`const _a = new Vector3()`), no allocations in step/frame code.
- Intent objects are reused and cleared each step (`clearIntent`).

## Ball ownership model
- `ball.owner = Player` → ball is **kinematic**. `Match.carryBall` places it every step:
  - in a skill with `ballPath` → follows the path (relative to where the skill started)
  - in a skill with `release` → at `release.t` the ball is kicked with a local velocity, becomes loose
  - otherwise → dribble spot in front of the feet (smoothed), with a touch rhythm
- `ball.owner = null` → `Ball.step` simulates it. `noPickupTimer` stops the last toucher re-collecting instantly.
- Pickups: nearest eligible foot within `BALL.pickupRadius` while the ball is low. Fast incoming ball + slow player → `receive` state/clip.

## Extending
- **New skill:** data only, in `skills.ts` (+ clip + key binding). `Match.carryBall` already handles paths and releases.
- **New action** (block stance, shield, slide tackle): intent field → `Player` state (+ clip) → `Match` resolution.
- **Online:** controllers become `NetworkController`s that replay remote intents; `Match.step` stays the same. Replace `Math.random()`
  in AI/shot spread with a seeded RNG before going online (both peers must agree).
- **Rapier:** replace `Ball.step` internals; keep its public API (`pos`, `vel`, `owner`, `kick`, `place`, `step` returning events).

## Known limitations (intentional for the prototype)
- Players are circles for collision (no limbs). Blocks are body-centred.
- Animations don't mirror at runtime yet (mirrored skill uses the same clip; see ANIMATION_PIPELINE).
- Tint of real models is a name-match guess on materials (`shirt|jersey|kit|...`). The floor ring always shows team colour.
- `Math.random()` used in AI and shot spread (fine offline, swap for seeded RNG online).
