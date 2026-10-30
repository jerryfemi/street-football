# Animations go here

Mixamo: **FBX Binary · 30 fps · Without Skin** (downloaded on *your* rigged character).
Rokoko: **FBX · Mixamo skeleton preset**.

Name the files exactly like this. The game plays them by these names (see `ASSETS.anims` in `src/config.ts`).

| File | What | Where to get it | Needed for |
|---|---|---|---|
| `idle.fbx` | standing, light bounce | Mixamo "Soccer Idle" / "Idle" (In Place) | everything |
| `run.fbx` | jog/run | Mixamo "Running" (In Place) | movement |
| `sprint.fbx` | fast run | Mixamo "Fast Run"/"Sprint" (In Place) | Shift |
| `dribble.fbx` | running with small touches | Mixamo "Soccer..." jog, or Rokoko | carrying the ball |
| `receive.fbx` | trap / first touch | Mixamo soccer receive/trap | receiving the check pass |
| `skill_stepover.fbx` | stepover | Rokoko (film it) | **E** |
| `skill_knockon.fbx` | push-and-go | Rokoko, or Mixamo kick variant | **R** |
| `shoot.fbx` | strike | Mixamo "Soccer Kick"/"Strike" | Space |
| `pass.fbx` | side-foot pass | Mixamo "Soccer Pass" | check ball |
| `jockey.fbx` | defensive side shuffle | Mixamo "Strafe"/"Defensive" (In Place) | defender |
| `tackle.fbx` | poke / standing tackle | Mixamo "Soccer Tackle" or Rokoko | defender |
| `stumble.fbx` | beaten / trip | Mixamo "Soccer Trip"/"Stumble" | losing a tackle |
| `celebrate.fbx` | goal celebration | Mixamo "Celebration"/"Victory" | goals |

Missing files are fine: each one falls back to a similar clip (see `ANIM_FALLBACKS` in `config.ts`).
Adding a new one? Put the file here, add a line to `ASSETS.anims`, and play it by name.
