# PannaVerse: Plan

Start small, make one move feel great, then widen. Each milestone ends with something you can play.
Tick boxes as you go so whoever picks this up next (you, Gemini, Claude) knows where things stand.

---

## M0: Foundation ✅ (done 2026-10-29)
- [x] Vite + TypeScript + Three.js project, strict TS, builds clean
- [x] Street cage pitch, boards, goal with net (primitives, no assets needed)
- [x] Ball physics: gravity, bounce, rolling friction, boards, posts, crossbar, net, goal detection
- [x] Player movement (accel/decel, sprint, smooth turning), placeholder capsule bodies with team rings
- [x] Asset loader: Mixamo FBX character + per-animation FBX files, fallbacks, root-motion lock, bone remap hook
- [x] Duel loop: check ball → live → goal / defended / shot clock → first to 5
- [x] Dribbling (ball rides the feet with touch rhythm), charged + aimed shot
- [x] Skills: stepover (fake + break, mirrorable), knock-on (release + chase)
- [x] Defender AI: goal-side positioning, drop-off vs press, jockey, tackle with reaction time, bites on fakes
- [x] Body blocks (fast ball deflects off players), tackles, stumbles, missed-tackle penalty
- [x] Follow camera, HUD (score, shot clock, messages, power bar)
- [x] Debug hook: `game.simPaused` / `game.advance(s)`

## M1: Your character in the game (next)
- [ ] Drop rigged Mixamo player into `public/models/player.fbx`; check scale, facing, shadows
- [ ] Download from Mixamo (Without Skin, 30 fps): idle, run, sprint, a dribble-ish jog, soccer pass, soccer kick/shoot,
      receive/trap, tackle, fall/stumble, celebration, defensive shuffle (jockey). Name them per `public/anims/README.md`
- [ ] Tune `ANIM` speed scaling so feet don't skate (Player.updateAnimation `ref` speeds)
- [ ] Line up `SHOT.contactTime` with the frame the boot hits the ball in your shoot clip
- [ ] Give the two players different looks (second Sketchfab model, or kit colour swap on the shirt material)
- [ ] Replace primitive pitch with a Sketchfab street cage/court (keep `PITCH`/`GOAL` dimensions matching the art)

## M2: First real skill moves (Rokoko)
- [ ] Film stepover, body feint, roulette, nutmeg fake, elastico (60 fps, full body, tripod, 1 person, still pose before/after)
- [ ] Rokoko Vision → FBX (Mixamo skeleton preset) → `public/anims/skill_*.fbx`
- [ ] Author each skill's `playerPath` + `ballPath` to match the touches (see ANIMATION_PIPELINE → "Authoring a skill")
- [ ] Mirrored clips for left-side versions (or a runtime mirror; see pipeline doc)
- [ ] Add skills: roulette (spin away from tackle), nutmeg / panna (ball through defender's legs: special win condition!), elastico, rainbow flick
- [ ] Skill input: hold a "skill" button + direction (like FIFA Street's right stick), so you don't need one key per skill

## M3: Mobile + game feel
- [ ] Touch controls: virtual joystick (left), Shoot (hold), Skill, Sprint buttons (right). Feed the same `Input` API
- [ ] Camera polish: pull back on sprint, slight zoom on skills, shake on post hits, slow-mo on panna/nutmeg
- [ ] Audio: ball touches, kick, post clank, net swish, crowd "OHHH" on skills. Use the Web Audio API with preloaded buffers
- [ ] Particles: turf kick-up, net ripple on goals
- [ ] Panna = instant win of the round + big HUD moment
- [ ] Difficulty levels (tune `DefenderTuning`: biteChance, reaction, tackleRate)

## M4: Play as the defender + better physics
- [ ] Swap roles each round (you defend, AI attacks). Needs an `AttackerAI`
- [ ] Human defending: jockey (hold), poke tackle, slide tackle, block stance
- [ ] Rapier physics for ball ↔ player bodies, spin/curve on shots, proper net
- [ ] Mode: **King of the Cage**: both players can attack, loose ball is anyone's, first to N

## M5: Online 1v1
- [ ] Lobby + match codes (Firebase like DunkVerse, or a small WebSocket server)
- [ ] Send `PlayerIntent` per tick, deterministic `Match.step`, host-authoritative to start
- [ ] Rematch, stats, highlight replay of the winning skill

---

## Notes / decisions log
- 2026-10-29: Chose Three.js + TS over Flutter/Flame for full 3D + Mixamo/GLB ecosystem. Kept DunkVerse lessons:
  fixed timestep, no per-frame allocations, DPR cap 1.5.
- 2026-10-29: Skills are **animation + scripted ball path**, not physics. Physics only takes over when the ball is released.
- 2026-10-29: Balance check (scripted bot, 12 trials each): running straight in + shooting mostly gets defended;
  stepover then straight shot scores ~9/12. Good starting point; tune via `DefenderTuning` + `TACKLE`.
