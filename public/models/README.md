# Character models go here

- `player.fbx`: your Mixamo-rigged character, downloaded **FBX Binary · With Skin**.
  (Or `player.glb` once everything is packed; then change `ASSETS.character` in `src/config.ts`.)

No file here = the game uses capsule placeholder players, so you can keep building gameplay without art.

Keep source/raw downloads (Sketchfab zips, original FBX) in `art/raw/` (git-ignored), not here. Everything in `public/` ships to players.
