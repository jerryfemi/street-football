# PannaVerse

3D **1v1 street football duels** in the browser. One cage, one goal, two players.
The defender checks the ball, you pass it back, and then it's on: take him on, humiliate him, score.

Built with **Three.js + TypeScript + Vite**. No Flutter, no Flame. It's a separate project from DunkVerse.

> Status: **playable prototype**. Placeholder capsule players, a full duel loop (check ball → live → goal/defended → first to 5),
> dribbling, stepover + knock-on skills, charged shots, a defender AI that jockeys, tackles, blocks and can *bite* on fakes.
> Drop your Mixamo character and animations into `public/` and they replace the placeholders automatically.

---

## Run it

Requires Node 20.19+ (Node 22/24 recommended).

```bash
npm install
npm run dev        # http://localhost:5173  (also on your LAN, for testing on your phone)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

## Controls (keyboard, for now)

| Key | Action |
|---|---|
| **W A S D** / arrows | move (camera-relative) |
| **Shift** | sprint |
| **Space** (hold, release) | charge + shoot. Hold A/D while releasing to aim left/right |
| **E / Q / C / V / G / X** | stepover / body feint / elastico / samba roll / drop shoulder / drag stepover. Hold **A** to mirror |
| **R** | knock-on: push it past him and run. Hold **A** to go left |
| **F** / **Shift+F** / **B** | tackle / slide tackle / block (when you're defending; AI defends for now) |

Touch controls are on the plan (see `docs/PLAN.md`, M3).

## Adding your player + animations

1. Character rigged in Mixamo, downloaded **FBX Binary, With Skin** → `public/models/player.fbx`
2. Animations downloaded **FBX Binary, 30 fps, Without Skin** → `public/anims/<name>.fbx`
   (names like `idle.fbx`, `run.fbx`, `dribble.fbx`, `skill_stepover.fbx`, ... see `public/anims/README.md`)
3. Refresh. The console prints which clips loaded. Anything missing uses a fallback.

Full pipeline (Mixamo, Rokoko video mocap, naming, mirroring, packing to GLB): **`docs/ANIMATION_PIPELINE.md`**.

## Project map

```
src/
  main.ts                  entry
  config.ts                every tunable number + asset list  ← start here when tweaking feel
  core/Game.ts             renderer, scene, fixed-step loop, wiring
  core/Input.ts            keyboard with pressed/released edges
  core/math.ts             yaw/local-space helpers, keyframe path sampling
  world/Pitch.ts           cage, lines, boards, goal + net (primitives, no assets)
  ball/Ball.ts             ball physics: bounce, roll, boards, posts, crossbar, net, goal detection
  player/Player.ts         movement, facing, action states (skill/shoot/tackle/stumble...), anim choice
  player/Animator.ts       AnimationMixer wrapper: play by name, fallbacks, crossfades
  player/assets.ts         loads character + clips (FBX or GLB), placeholder bodies, root-motion lock
  skills/skills.ts         skill definitions = anim + player path + ball path + fake side
  controllers/types.ts     PlayerIntent (what a player wants to do; network-friendly)
  controllers/HumanController.ts   keyboard → intent
  controllers/DefenderAI.ts        AI defender → intent
  match/Match.ts           duel rules + all ball/player interactions (dribble, kicks, tackles, blocks, pickups)
  camera/FollowCamera.ts   broadcast-style follow cam
  ui/Hud.ts + style.css    score, shot clock, messages, power bar
docs/
  PLAN.md                  milestones + checklist
  GAME_DESIGN.md           the duel format, mechanics, modes
  ARCHITECTURE.md          how the code fits together, conventions
  ANIMATION_PIPELINE.md    getting skills from Mixamo / Rokoko into the game
AGENTS.md                  instructions for AI coding assistants (Gemini, Claude, etc.)
```

## Debugging

Open `http://localhost:5173/` (dev) or add `?debug` to a production URL, then in the browser console:

```js
game.match.score            // { attacker, defender }
game.simPaused = true       // freeze the real-time loop
game.advance(1.5)           // run 1.5 s of simulation instantly (deterministic testing)
game.attacker.pos, game.ball.pos, game.defender.state
```
