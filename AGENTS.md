# PannaVerse: instructions for AI coding assistants

You are working on **PannaVerse**, a 3D 1v1 street football duel game (panna / FIFA Street style)
built with **Three.js + TypeScript + Vite**, running in the browser (desktop + mobile web).
Read `README.md` first, then `docs/ARCHITECTURE.md` and `docs/PLAN.md`. Pick up the first unchecked item in PLAN.md unless told otherwise.

## Stack (do not swap without being asked)
- three `0.186.x` (+ `@types/three`), TypeScript strict, Vite. ES modules only.
- No game engine on top of Three. No React/R3F. No Flutter/Flame (this is deliberately separate from DunkVerse).
- Physics is hand-rolled in `ball/Ball.ts`. Rapier (`@dimforge/rapier3d-compat`) is the planned upgrade (PLAN M4). Don't add cannon/ammo.

## Golden rules
1. **Feel lives in `src/config.ts`.** New tunables go there, not as magic numbers in logic.
2. **Controllers produce `PlayerIntent`, `Match` decides outcomes.** Never let a controller move the ball or change score.
   This is what makes online multiplayer possible later (send intents, simulate deterministically).
3. **Fixed timestep.** Gameplay code runs inside `Match.step(dt)` at `RENDER.fixedStep` (60 Hz). Rendering/animation runs per frame.
   Don't read wall-clock time or `performance.now()` in gameplay code. Use the `dt` you're given.
4. **No allocations in per-frame/per-step code.** Reuse module-level scratch vectors (`const _a = new Vector3()`), as the existing files do.
   No `new Vector3()` / arrays / closures inside `update`, `step`, `render` paths.
5. **Assets are optional.** The game must always run with zero files in `public/` (placeholder bodies, fallback clips). Never make a missing asset crash.
6. **Coordinates:** metres, +Y up, goal at **−Z**, attacker starts at **+Z**. Yaw θ faces `(sin θ, 0, cos θ)`.
   Skill/ball paths are **local**: x = player's right, z = player's forward, t = 0..1. Use helpers in `core/math.ts`.
7. **Mobile performance:** keep pixel ratio capped (`RENDER.maxPixelRatio`), one shadow-casting light, small shadow map, low-poly models,
   textures ≤ 1024 px. Target 60 fps on a mid-range phone.
8. **Never commit/deploy on your own.** Only give the commands.

## Verify before you say "done"
```bash
npm run build            # must pass: tsc --noEmit + vite build, zero errors
npm run dev              # play it: check ball → GO → stepover (E) → shoot (hold/release Space)
```
For logic changes, use the deterministic hook in the browser console (dev, or `?debug`):
`game.simPaused = true; game.advance(2.2)` then inspect `game.match.phase`, `game.ball.pos`, etc.

## Where things go
- New skill → `src/skills/skills.ts` (+ clip in `config.ASSETS.anims`, + key in `HumanController`). See `docs/ANIMATION_PIPELINE.md` → "Authoring a skill".
- New player action (e.g. block, shield, nutmeg-through-legs) → state in `Player.ts`, resolution in `Match.ts`, intent field in `controllers/types.ts`.
- New rule / mode → `Match.ts` (or a new `match/modes/*.ts` once there's more than one mode).
- UI → `ui/` + `style.css`. Palette: obsidian `#0A0E1A/#0F172A`, sky blue `#38BDF8`, neon cyan `#00FFCC`, amber `#F59E0B`, red `#EF4444`,
  slate `#94A3B8` for secondary text. No default browser alerts/popups.

## Owner context
The developer sources characters from Sketchfab, rigs/animates in **Mixamo**, and gets skill moves by filming them and running
the video through **Rokoko Vision** (free tier: ~30 s/month). **No Blender** on their machine, so prefer code-side solutions
(clip loading, bone remap, root-motion lock) over "open it in Blender" instructions.
