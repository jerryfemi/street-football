# PannaVerse: Animation Pipeline (no Blender required)

The idea: **one rigged character + many animation files that share its Mixamo skeleton.**
The game loads the character once and plays any clip on it by name. Nothing has to be "merged" in an editor.

---

## 1. Character (Sketchfab → Mixamo)
1. Download a footballer from Sketchfab as FBX (low-poly is better for mobile; aim < 20k triangles, textures ≤ 1024 px).
2. mixamo.com → **Upload Character** (a .zip with the FBX + textures keeps textures). Place the markers if asked. T-pose is ideal.
   If it fails or looks broken, the model's existing rig is fighting Mixamo. Ask an AI assistant to strip the armature, or pick another model.
3. Download **FBX Binary · With Skin** → `public/models/player.fbx`.

The loader auto-scales the model to `ASSETS.targetHeight` (1.8 m), so centimetre-scale Mixamo files are fine.

## 2. Mixamo animations
For each animation: select it on **your** character → Download → **FBX Binary · 30 fps · Without Skin**.

- Tick **In Place** for loops (idle, run, sprint, dribble, jockey). Code moves the player; the clip moves the legs.
  If you forget, it's listed in `ASSETS.lockRootMotion` and the loader removes the horizontal hip drift anyway.
- Leave **In Place off** for moves where the body travels (receive-and-turn tricks, stepovers). But note gameplay
  still moves the player via the skill's `playerPath`, so for skills either is fine. Pick whichever looks better.
- Useful searches: `soccer`, `goalkeeper`, `strafe`, `side step`, `defensive`, `kick`, `trip`, `fall`, `celebration`, `juggle`.

Save with the **exact names** from `public/anims/README.md` (e.g. `dribble.fbx`, `skill_stepover.fbx`).

## 3. Skill moves from video (Rokoko Vision)
Free tier ≈ **30 seconds of video per month** (enough for 6–10 skills at 2–5 s each). FBX export only.

**Filming checklist**
- One person in frame, full body head-to-toe, tripod, front or ¾ angle, camera at knee–hip height
- 60 fps, bright even light, fitted clothes (knees visible)
- Hold a neutral pose ~1 s before and after the move (clean blend in/out)
- For defensive moves (block, poke tackle, slide), film the defender alone against an imaginary attacker
- Trim the clip to just the move before uploading. You pay in seconds

**Export:** FBX, choose the **Mixamo** skeleton preset if offered → `public/anims/skill_<name>.fbx`.
You only upload the video. Your character never goes into Rokoko.

**If the clip doesn't play on your character** (it freezes, or the body twists): the bone names don't match.
Open the browser console; the loader logs clip names. Then fill `ASSETS.boneRemap` in `config.ts`, e.g.
`{ Hips: 'mixamorigHips', Spine: 'mixamorigSpine', LeftUpLeg: 'mixamorigLeftUpLeg', ... }`.
Bone names from FBX lose the `:`, so `mixamorig:Hips` becomes `mixamorigHips`.

## 4. Authoring a skill (code side)
A skill is **animation + scripted player path + scripted ball path** (`src/skills/skills.ts`).

1. Add the clip: `ASSETS.anims.skill_roulette = 'anims/skill_roulette.fbx'`.
2. Find the touch times: play the clip (or the Mixamo preview) and note *when* the foot touches the ball, as a fraction of the clip
   (e.g. touches at 0.3 and 0.7 of the move).
3. Write the `SkillDef`:
   - `duration`: how long the move takes in gameplay (the clip is stretched to fit).
   - `playerPath`: where the player's body goes (local x = right, z = forward).
   - `ballPath`: where the ball is at each touch time (keyframes at those fractions), **or** `release` if the move ends with the ball
     being pushed away (knock-on, flick).
   - `fakeSide`: which way it sells (−1 left, +1 right, 0 none).
   - `protectedFor`: seconds a tackle can't win the ball.
4. Bind a key in `HumanController` (later: skill button + stick direction).
5. Test: `game.simPaused = true; game.advance(…)` in the console, or just play it.

The ball path doesn't have to match the foot perfectly at first; it needs to *feel* right. Tune by eye.

## 5. Left/right versions (mirroring)
The code mirrors the **paths** when you hold left, but the **clip** still plays the right-footed version.
Options, in order of effort:
1. Live with it for the prototype (fast moves hide it).
2. Download/film the mirrored move separately → `skill_stepover_L.fbx`, and pick it in `Player.startSkill` when `mirror` is true.
3. Runtime mirror: generate a mirrored clip by swapping Left/Right bone tracks and negating the X/Y/Z quaternion components as needed (good AI-assistant task).

## 6. Shipping: pack everything into one GLB
Many FBX files = many requests and slower loads. Before release, pack character + all clips into **one compressed `player.glb`**
(clip names = the keys in `ASSETS.anims`), then set `ASSETS.character = 'models/player.glb'`. The loader already reads clips from
the GLB by name and skips the separate files. Packing can be done with Blender headless (an AI assistant can do this for you in the cloud)
or `gltf-transform` CLI for compression.

## 7. Environment
Replace `world/Pitch.ts` primitives with a Sketchfab street court/cage when ready:
load the GLB in `buildPitch`, keep invisible gameplay bounds from `PITCH`/`GOAL`, and scale/position the art to match those numbers.
Keep the goal posts as gameplay collision even if the art has its own goal.
