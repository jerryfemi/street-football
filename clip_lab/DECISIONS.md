# Clip Lab: Decisions Log

All architectural choices and minor design clarifications made during implementation are recorded here.

## 2026-11-04 - Initial Setup (M1)
- **Vanilla DOM UI**: Components are implemented as TypeScript classes with clean DOM nodes and scoped CSS classes.
- **IndexedDB**: Implemented zero-dependency IndexedDB wrapper (`src/io/db.ts`) with stores `files` (ArrayBuffer) and `project` (JSON).
- **Three.js**: Reused Three.js v0.186.x and ES modules.


## 2026-11-04 - Claude review fixes
- **One cleanup pipeline** (`main.ts → rebuildClip`): base (retargeted once) → mirror → smooth → foot lock → root motion.
  Actions only change the entry's settings and rebuild, so smoothing no longer stacks, foot lock / root motion toggle,
  and a reload (or Load Project) rebuilds exactly what was on screen. Before, a reload dropped every cleanup and
  mirrored clips came back unmirrored.
- **Import retargets after the whole drop**: Mixamo idle in the same drop becomes the Rokoko hips reference; with no
  idle, the reference comes from the character (`templateHipsY`, hips ≈ 0.56 × 1.8 m). Without this a Rokoko clip
  rendered the character ~920 m tall.
- **`retargetRokoko` (Clip Lab copy)**: with `keepRootMotion`, hips XZ travel is rebased to the reference and scaled
  by the same ratio as height (raw Rokoko XZ sat ~370 m off origin). `keepRootMotion=false` is identical to the game.
- **Restore** measures the character height (was hard-coded scale 1 → giant character after reload).
- **Root motion samples in metres** (`hipsToMetres`, was raw FBX units) and exported in `clips.json` `root`
  (trimmed, local axes, relative to the trimmed start). Before, `root` was never written.
- **Touches are root-relative** (contract §6): `at` = toe − hips at contact (+ ball radius along the swing),
  `to` for a chained touch = next `at` moved into this touch's root frame. Replay and gizmos add the root back.
  Thresholds restored to the plan (1.2 m/s, 35 %, 40°); `minZ` 0.1 (a foot landing beside the hips is a plant)
  and NMS 0.25 s; pre-swing speed counts relative to the hips OR over the ground, contact = foot slows/turns within 2 frames (Gemini's hips velocity was divided by the wrong span). Mixamo dribble now gives clean L/R/L/R touches at z ≈ 0.22–0.28 (game `contactZ` 0.28).
- **Replay**: early/late checks added (speed vs foot > 1.5 m/s, short > 0.35 m); miss threshold 0.25 per plan.
  Through-leg check still TODO.
- **Export**: `WebIO` (NodeIO is Node-only), `quantize()` added, subclip uses project fps, keys in §6 order,
  touches sorted. 80 clips → 7.1 MB, ~2.7 s.
- **Gizmos** dispose geometry/material; dragging a touch re-simulates the replay live.
- **Load Project** goes through `store.replaceProject` (was mutating state, no save/notify).
- `shared/config.ts` is now a verbatim copy of the game's `src/config.ts` (DRIBBLE had drifted).
