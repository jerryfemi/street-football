# Clip Lab: Implementation Plan (for an AI coding assistant)

> Audience: Gemini (or any coding assistant) building Clip Lab from scratch.
> Owner: Oyindamola. Reviewer: Claude (will verify and correct the finished work).
> Read this whole file before writing code. Build in the milestone order at the bottom.
> When something here is ambiguous, choose the simplest option and write the decision in `clip_lab/DECISIONS.md`.

---

## 0. What Clip Lab is

A **browser tool** that turns raw motion-capture clips (Rokoko video mocap / Mixamo FBX) into
**game-ready football animation data** for PannaVerse (a Three.js 1v1 street football game).

For every clip the user can:
1. see it on the real game character, next to a ball;
2. trim it, set loops and exit points;
3. mark every **ball touch** (auto-suggested, then human-confirmed);
4. replay the ball physically from those touches to check it looks right;
5. clean it up (smooth jitter, lock planted feet, mirror L↔R, extract root motion);
6. export **one packed `player.glb`** + **one `clips.json`** that the game reads.

The game currently guesses ball contacts from noisy mocap at runtime. Clip Lab replaces guessing
with authored data. **The JSON format (§6) is the contract with the game. Do not change it without
updating the doc.**

---

## 1. Stack (fixed: do not substitute)

| Thing | Choice |
|---|---|
| Language | TypeScript (strict) |
| Rendering | three `0.186.x` (same version as `panna_verse/package.json`) |
| Build | Vite |
| UI | Plain DOM + CSS (no React/Vue). One page app. |
| GLB packing | `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions` (in browser) |
| FBX loading | `three/addons/loaders/FBXLoader.js` |
| GLB export | `three/addons/exporters/GLTFExporter.js` → then optimise with glTF-Transform |
| Persistence | IndexedDB (via a tiny wrapper, no library needed) + File System Access API for "send to game" (with download fallback) |
| Tests | `vitest` for pure logic (touch detection, mirroring, smoothing, JSON schema) |

Location: `C:\Users\jerem\StudioProjects\clip_lab\` (sibling of `panna_verse`).

### Code sharing with the game
The retargeting rules MUST match the game exactly. Copy these from `panna_verse/src` into
`clip_lab/src/shared/` at project start, and keep a header comment `// SOURCE: panna_verse/src/... - keep in sync`:
- `player/assets.ts` → functions `retargetRokoko`, `prepareClip` logic, `measureHeight`
- `physics/BodyColliders.ts` (whole file)
- `ball/Ball.ts` physics constants and `step()` logic (ball rolling/bounce)
- `config.ts` → `BALL`, `DRIBBLE`, `RESTITUTION` blocks

Do not import across folders with relative `../../panna_verse` paths. Copy and mark them.

---

## 2. Folder structure

```
clip_lab/
  index.html
  package.json  tsconfig.json  vite.config.ts
  README.md               how to run + workflow for the user
  DECISIONS.md            choices you made where this plan was silent
  src/
    main.ts               boot, wires everything
    style.css             obsidian theme (see §9)
    state/
      store.ts            single app state + subscribe(); undo/redo stack
      project.ts          Project / ClipEntry types, save/load (IndexedDB), import/export project file
    io/
      importFbx.ts        load character + clips, retarget, register ClipEntry
      exportGame.ts       build player.glb + clips.json, write to disk
      fsAccess.ts         File System Access helpers + download fallback
    shared/               copied game code (see §1)
    scene/
      Viewport.ts         renderer, camera, orbit controls, pitch patch, lights
      CharacterRig.ts     the player instance, mixer, bone lookup, foot sampling
      BallReplay.ts       simulates the ball from touch markers each frame
      Overlays.ts         foot trails, ball path, capsules, planted-foot markers, touch gizmos
    analysis/
      footTracks.ts       sample a clip → per-frame foot/toe/hips positions & velocities (local space)
      detectTouches.ts    auto-suggest touches
      detectPlanted.ts    auto-fill planted-foot intervals
      rootMotion.ts       extract hips travel → path; strip from clip
      smooth.ts           quaternion smoothing
      footLock.ts         IK-based planted-foot pinning (baked)
      mirror.ts           L↔R mirror of clip + markers
    timeline/
      Timeline.ts         canvas-drawn timeline, scrubber, zoom, tracks
      tracks/*.ts         TouchTrack, PlantedTrack, RangeTrack (protected), MarkerTrack (exit/loop/in/out)
    panels/
      ClipList.ts  Inspector.ts  TouchEditor.ts  BlendTester.ts  ExportPanel.ts  Toasts.ts
  tests/
    detectTouches.test.ts  mirror.test.ts  schema.test.ts  smooth.test.ts
```

---

## 3. Coordinate conventions (MUST match the game)

- Units: metres, seconds. +Y up.
- Character faces **+Z** at yaw 0 (Mixamo convention).
- **Local space** (used in all JSON): `x` = player's right, `z` = player's forward, origin = character root on the ground.
  - Converting a world point at yaw 0: `localX = -world.x`, `localZ = world.z`.
- Clip time `t` in JSON is **seconds from the trimmed in-point** (after trimming, not raw file time).
- Frame rate for analysis and export: **30 fps** (Rokoko/Mixamo export rate). Snap all markers to frames internally; store seconds.
- Bone names: Mixamo, sanitised by three's FBXLoader (`mixamorig:Hips` → `mixamorigHips`). Match by **suffix** (`/LeftToeBase$/`) so prefixes don't matter.

---

## 4. Data model

```ts
type Foot = 'L' | 'R';
type FootPart = 'inside' | 'outside' | 'sole' | 'laces' | 'heel' | 'toe';
type TouchType = 'set' | 'close' | 'push' | 'heavy' | 'cut' | 'drag' | 'trap' | 'flick' | 'shot' | 'pass';
type Tag = 'dribble' | 'turn' | 'skill' | 'shot' | 'pass' | 'receive' | 'defend' | 'reaction' | 'idle' | 'celebrate';
type Status = 'raw' | 'marked' | 'approved';

interface Touch {
  id: string;
  t: number;                 // seconds (trimmed)
  foot: Foot;
  part: FootPart;
  type: TouchType;
  // where the ball is at contact (local, metres). Auto-filled from the foot position at t.
  at: { x: number; z: number; y?: number };
  // where the ball should go (local, relative to the ROOT AT CONTACT TIME, not clip start)
  to?: { x: number; z: number };
  arrive?: number;           // seconds to reach `to` (default = time to next touch, else 0.45)
  lift?: number;             // initial vertical speed m/s (flicks, chips, shots)
  stay?: boolean;            // ball stays on foot (sole roll / drag): ball follows the foot until next touch
  auto?: boolean;            // created by detector and not yet edited
}

interface Interval { from: number; to: number }

interface ClipEntry {
  id: string;                // stable, = name
  name: string;              // e.g. "stepover_R" (from file name, editable)
  sourceFile: string;
  tags: Tag[];
  status: Status;
  rawDuration: number;
  in: number; out: number;   // trim (raw seconds)
  loop: null | { from: number; to: number };   // trimmed seconds
  exit?: number;             // earliest time it may blend back to jog
  entryFoot?: Foot;          // foot that must be planted/striding when this clip starts (for blending)
  fakeSide?: -1 | 0 | 1;     // skills: which way it sells
  protected?: Interval;      // skills: ball can't be tackled
  planted: { foot: Foot; from: number; to: number }[];
  touches: Touch[];
  cleanup: { smooth: number; footLock: boolean; mirroredFrom?: string };
  rootMotion: { extracted: boolean; mode: 'none' | 'xz' | 'xz+yaw' };
  notes?: string;
}

interface Project {
  version: 1;
  characterFile: string;
  clips: ClipEntry[];
  settings: { fps: 30; groundOffset: number };
}
```

Store the **raw FBX ArrayBuffers** in IndexedDB keyed by file name so a project reopens without re-dropping files. Project metadata (above) is stored separately and is also exportable as `project.cliplab.json`.

---

## 5. Retargeting (identical to the game)

Implement in `io/importFbx.ts` using the copied shared code:

1. **Character**: load FBX, `measureHeight()` from bones, scale to **1.8 m**, enable shadows, `frustumCulled = false` on skinned meshes.
2. **Reference hips**: the character's idle clip hips height if an idle is present; otherwise the template's `mixamorigHips` world Y.
3. **Each clip**:
   - Rokoko export (contains a `mixamorigReference` bone or file path tagged by user as "Rokoko"): run `retargetRokoko` → keep only `.quaternion` tracks + `mixamorigHips.position`; rescale hips height by `refY * (y / y0)` where `y0` = hips Y at frame 2 (frame 0 is often a T-pose snap).
   - Mixamo export: use as-is.
   - Auto-trim default: `in = 0.1 s` for Rokoko (drop the snap frame), `out = duration`.
4. Detect **"With Skin"** clip files (they contain a mesh): use only their animation.
5. Any bone name in a clip that doesn't exist on the character → listed in a warning toast with a "remap…" button (simple table: source bone → target bone; stored in project).

**Do NOT strip root motion at import.** Keep the hips travel; root motion is handled explicitly in §7.4.

---

## 6. Export contract: `clips.json` (THE CONTRACT)

```jsonc
{
  "format": "pannaverse-clips",
  "version": 1,
  "fps": 30,
  "character": { "height": 1.8 },
  "clips": {
    "stepover_R": {
      "duration": 1.40,                 // trimmed length (s)
      "tags": ["skill"],
      "loop": null,                     // or { "from": 0.0, "to": 0.86 }
      "exit": 1.10,
      "entryFoot": "L",
      "fakeSide": -1,
      "protected": { "from": 0.10, "to": 0.75 },
      "planted": [ { "foot": "R", "from": 0.10, "to": 0.70 } ],
      "root": {                         // present only if root motion extracted
        "mode": "xz+yaw",
        "samples": [ [0.0, 0, 0, 0], [0.033, 0.0, 0.01, 0.0] ]   // [t, x, z, yaw] local to clip start, every frame
      },
      "touches": [
        { "t": 0.08, "foot": "R", "part": "sole", "type": "set", "at": { "x": 0.0, "z": 0.30 } },
        { "t": 0.82, "foot": "R", "part": "outside", "type": "push",
          "at": { "x": 0.05, "z": 0.32 }, "to": { "x": 1.2, "z": 1.4 }, "arrive": 0.45 }
      ]
    }
  }
}
```

Rules:
- Clip key = animation name inside `player.glb` (exact match).
- All times in **seconds after trimming**; all positions **local metres** (§3).
- `to` is relative to the **root at the moment of contact** (game converts with the player's live position/yaw).
- Numbers rounded to 3 decimals. Keys in the order shown. Validate with a schema test (`tests/schema.test.ts`) before writing.

**`player.glb`**: the character mesh + skeleton + one animation per approved clip, **trimmed, cleaned, mirrored copies included, root motion removed if extracted**. Optimise with glTF-Transform: `dedup`, `prune`, `resample` (lossless key reduction), `quantize`. Target < 10 MB for ~80 clips. Animation names = clip names.

---

## 7. Analysis algorithms

All analysis runs on a **headless clone** of the character (SkeletonUtils.clone) with its own `AnimationMixer`, sampled with `mixer.setTime(t)` + `updateMatrixWorld(true)` at 30 fps. Root at origin, yaw 0. Cache results per clip (invalidate when trim/cleanup changes).

### 7.1 Foot tracks (`footTracks.ts`)
Per frame, for L and R: toe position (ToeBase), ankle position (Foot), local velocity (finite difference), speed, height (toe Y), plus hips position. Return typed arrays.

### 7.2 Touch detection (`detectTouches.ts`)
A frame `i` is a touch candidate for foot F when **all** hold:
1. **Low**: toe height `y < 0.12 m` (ankle `< 0.16`).
2. **Fast before**: horizontal toe speed over frames `i-3..i-1` averages `> 1.2 m/s` relative to hips.
3. **Sudden change**: speed drops by `> 35 %` within 2 frames **or** direction changes by `> 40°`.
4. **In front zone**: local toe position within `z ∈ [-0.2, 0.8]`, `|x| < 0.55`.
Non-max suppression: keep the strongest candidate within any 0.15 s window per foot.
Default fields: `part` = `inside` if toe moving toward body centreline, `outside` if away, `sole` if toe speed low and heel lower than toe; `type` = `close` (tag dribble), `push` (skill, last touch), `set` (first touch of a skill); `at` = toe local position projected to ground + ball radius forward offset (0.11 m along foot direction).
`to` default: the ball position needed at the **next touch** (= next touch's `at`, transformed into this touch's root frame using root motion), `arrive` = time gap. Last touch with no next: `to` = `at` + 1.2 m along foot velocity direction, `arrive` 0.45.
Mark all as `auto: true`. **Expose every threshold in a "Detection settings" popover** with Re-run.

### 7.3 Planted feet (`detectPlanted.ts`)
Foot planted when toe and ankle height `< 0.06 m` and horizontal speed `< 0.25 m/s` for ≥ 4 frames. Merge gaps < 2 frames.

### 7.4 Root motion (`rootMotion.ts`)
Extract hips XZ travel (and optional yaw from hips forward vector) per frame → `root.samples` (local to clip start). Then **subtract** it from the hips position track (and yaw from hips quaternion if `xz+yaw`) so the exported animation stays in place. The game moves the player along `root.samples`. Mode default: `xz` for skills/turns, `none` for loops (dribble loops are "in place").

### 7.5 Smoothing (`smooth.ts`)
Per bone quaternion track: centred moving average in quaternion space (normalised lerp with hemisphere check), window from slider `0..7` frames. Never smooth frames within ±2 of a touch on the touching leg's bones (UpLeg/Leg/Foot/ToeBase) to keep contact sharp. Unit test: smoothing a constant track returns the same track.

### 7.6 Foot lock (`footLock.ts`)
For each planted interval: record the toe/ankle world position at interval start; for each frame inside, solve **two-bone IK** (UpLeg-Leg-Foot) so the ankle returns to the locked position, keeping the knee's original pole direction; blend in/out over 3 frames. **Bake** the result into the clip's quaternion tracks (export carries the fix).

### 7.7 Mirror (`mirror.ts`)
Create `name_L` from `name_R` (or vice versa):
- Swap Left/Right bone tracks.
- Quaternion mirror across the YZ plane: `(x, y, z, w) → (x, -y, -z, w)`.
- Hips position: `x → -x`.
- Touches: `foot` swap, `at.x`, `to.x` negated, `part` unchanged; `fakeSide` negated; planted foot swap; root samples `x → -x`, `yaw → -yaw`.
Unit test: mirroring twice returns the original (within 1e-5).

---

## 8. Ball replay (`BallReplay.ts`)

Shows what the game will do. Each frame (driven by the timeline time, deterministic, **re-simulated from t=0** whenever time jumps backwards or markers change):
1. Start: ball at the first touch's `at` (or 0.4 m in front if none), at rest.
2. Integrate with the game's ball rules (copied): rolling friction `DRIBBLE.friction` (2.6/s), gravity, bounce.
3. At each touch time: convert `at`/`to` to world using the root (with extracted root motion applied, if any), set ball velocity so it reaches `to` in `arrive` seconds under exponential friction:
   `v0 = d * k / (1 - exp(-k * arrive))`, `k` = friction. Add `lift` to Y.
   If `stay: true` → ball follows the touching toe (offset 0.11 m along foot dir) until the next touch.
4. **Checks** (draw red warnings on the timeline + list in Inspector):
   - **Miss**: at a touch, ball centre further than `0.25 m` from the touching toe.
   - **Through leg**: ball overlaps any leg capsule (shared `BodyColliders`) when not at a touch frame.
   - **Early/late**: ball arrives at next touch's `at` with speed > 1.5 m/s relative to foot (it'd bounce off) or > 0.35 m short.
5. Toggle: "Snap ball to foot at touches" (preview of the game's leg-reach correction).

---

## 9. UI

Theme: **obsidian**. Background `#0A0E1A`, panels `#0F172A`, raised `#1E2638`, text `#FFFFFF`, secondary `#94A3B8`, accents sky `#38BDF8`, cyan `#00FFCC`, amber `#F59E0B`, red `#EF4444`. Font: system UI, 13px base. Left foot colour = sky, right foot = amber everywhere.

Layout (desktop, ≥ 1280 px wide):
```
┌──────────────┬─────────────────────────────────────┬──────────────┐
│ Clip list    │            3D viewport              │  Inspector   │
│ (search,tags,│  (orbit, view presets, overlays)    │ (clip props, │
│  status)     │                                     │  touch edit) │
├──────────────┴─────────────────────────────────────┴──────────────┤
│ Transport: ⏮ ◀| ▶ |▶ ⏭  speed  loop  frame/time  zoom             │
│ Timeline: ruler · Touches(L/R lanes) · Planted · Protected ·      │
│           Markers (in/out/loop/exit) · Warnings                   │
└───────────────────────────────────────────────────────────────────┘
```

### Viewport
- 6×6 m turf patch with lines, soft shadows, the ball.
- Orbit controls; presets: **Side (1)**, **Front (2)**, **Top (3)**, **Feet (4)** close-up following the feet.
- Overlays (toggles): foot trails (last 1 s), ball path (whole clip, dotted), capsules, planted feet (ground discs), touch gizmos (small foot-coloured rings at each touch's `at`, arrow to `to`, **draggable** on the ground plane, writes back to `to`).

### Timeline (canvas)
- Ruler in frames and seconds, zoom with Ctrl+wheel, scroll with wheel.
- **Touch lanes** (L above, R below): diamond markers; drag to move (snaps to frames); double-click empty space adds a touch at that frame for that lane; Delete removes; hollow diamond = `auto`, filled = confirmed.
- **Planted lane**: bars per foot, drag edges.
- **Protected lane**: one draggable range.
- **Markers lane**: in, out, loop start/end, exit (flags).
- **Warnings lane**: red ticks from Ball replay checks; click to jump.

### Inspector
- Clip: name, tags (chips), status (raw/marked/approved), fakeSide (L / none / R), entryFoot, root-motion mode, smoothing slider, foot-lock toggle, notes.
- Selected touch: foot, part, type (dropdowns), `at` (read-only + "re-snap to toe"), `to` x/z fields + "use next touch", `arrive`, `lift`, `stay`, "confirm" (clears `auto`).
- Buttons: Auto-detect touches (re-run), Auto-fill planted, Mirror → create L/R copy, Extract root motion.

### Keyboard (Premiere-like)
`Space` play/pause · `J`/`K`/`L` reverse/stop/forward (tap L twice = 2×) · `←`/`→` frame step · `Shift+←/→` 10 frames · `I`/`O` set in/out · `T` add touch on the foot nearest the ball · `[`/`]` previous/next touch · `Delete` remove selected · `Ctrl+Z`/`Ctrl+Shift+Z` undo/redo · `1–4` camera presets · `A` approve clip.

### Clip list
Search box, tag filter chips, status icons (grey raw / amber marked / cyan approved), count of touches and warnings per clip. Drag-drop import zone at the top ("Drop FBX files or a folder").

### Blend tester (M3, modal or bottom drawer)
- Build a chain: pick clips in order (e.g. `dribble_jog_loop ×2 → stepover_R → dribble_jog_loop`).
- Joins use the game's rule: crossfade **0.15 s** starting at the previous clip's `exit` (or loop end), only on a frame where the next clip's `entryFoot` matches the previous clip's currently-planted foot (search ±0.2 s; warn if none).
- Ball replay runs across the whole chain.
- "Next best" list: for the current frame, rank all clips by pose distance (hips height, both feet local positions/velocities, hips velocity) over their first 0.2 s. Show top 5 with scores.

### Export panel
- Lists approved clips (warn on any with replay warnings).
- Options: include mirrored, compression level.
- Buttons: **Export to folder…** (File System Access: user picks `panna_verse/public/models` once; remember handle in IndexedDB) and **Download** fallback (two files).
- Progress bar, size report, success toast with clip count.

### Toasts
Bottom-right, obsidian card, icon + message, auto-dismiss 4 s. **No `alert()` / `confirm()`** anywhere. Destructive actions use an inline confirm row.

---

## 10. Undo/redo + persistence
- Every edit goes through `store.apply(command)`; commands have `do`/`undo`. Max 200 steps.
- Autosave project metadata to IndexedDB 1 s after the last edit. Raw FBX buffers saved once on import.
- "Export project" / "Import project" (`.cliplab.json` + re-link FBX by file name).

---

## 11. Performance rules
- Only the selected clip's mixer runs; analysis uses cached typed arrays.
- No allocation in the per-frame loop (reuse vectors, same rule as the game).
- Timeline is one `<canvas>`, redrawn only on change or during playback.
- Ball replay re-simulation is O(frames) and must stay < 5 ms for a 4 s clip.
- 80 clips loaded must stay responsive: lazy-create `AnimationAction`s.

---

## 12. Milestones (build in this order; each must be fully working before the next)

### M1: Viewer + import (foundation)
- Vite/TS project, theme, three-panel layout.
- Drop character FBX + clip FBX files; retarget (§5); clip list; play/scrub/frame-step; view presets; turf + ball.
- IndexedDB persistence of files + project.
**Done when**: user drops `player.fbx` + 14 Rokoko FBX files from `panna_verse/public/anims/rokoko`, reloads the page, everything is still there, each clip plays on the character at correct height facing +Z.

### M2: Timeline + touches + replay + export (minimum useful)
- Canvas timeline with all lanes; in/out/loop/exit markers.
- Foot tracks, touch detection (§7.2), planted detection (§7.3).
- Touch editing (timeline + inspector + ground gizmo drag).
- Ball replay with warnings (§8).
- Export `player.glb` + `clips.json` (§6), schema test passing.
**Done when**: the stepover clip shows auto touches, user can edit them, ball visibly leaves and returns to the foot, export files load in a plain three.js test page with correct clip names and the JSON validates.

### M3: Cleanup + blend tester
- Smoothing, foot lock (baked), mirror, root-motion extraction.
- Blend tester + next-best list.
**Done when**: mirror twice = original (test), foot-locked clip shows no planted-foot drift > 1 cm, blend chain plays jog → stepover → jog with the ball continuous.

### M4: Polish
- Reference video sync (drop the original phone video; plays under the 3D view, offset slider).
- Batch auto-detect for all clips; filter "has warnings".
- Keyboard map overlay (`?`).

---

## 13. Acceptance checklist for the reviewer (Claude)

- [ ] `npm run build` passes (tsc strict, zero errors); `npm test` passes.
- [ ] Shared code copied with `// SOURCE:` headers, constants identical to the game.
- [ ] Conventions §3 respected (spot-check: a touch in front of the right foot has `at.x > 0`, `at.z > 0`).
- [ ] `clips.json` matches §6 exactly (keys, units, trimmed times, rounding).
- [ ] Animation names in `player.glb` == keys in `clips.json`.
- [ ] Mirror test and smoothing test present and passing.
- [ ] Replay `v0` formula matches §8 (same as `Match.launchSpeed` in the game).
- [ ] No `alert/confirm/prompt`; obsidian theme; L = sky, R = amber.
- [ ] No per-frame allocations in render loop / replay.
- [ ] Project survives reload (IndexedDB) and export/import of `.cliplab.json`.
- [ ] 80-clip stress: generate copies of existing clips, UI stays responsive.

---

## 14. What NOT to do
- Don't add a backend/server. Everything is local in the browser.
- Don't use React/Vue/Svelte/Tailwind.
- Don't change the JSON contract or coordinate conventions.
- Don't strip root motion at import time.
- Don't "fix" retargeting differently from the game. Copy it.
- Don't silently auto-approve clips; approval is always the user's click.
- Don't ship untested math (mirror, smoothing, launch speed): unit test it.
