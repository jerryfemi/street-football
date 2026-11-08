# PannaVerse: 3-a-side + "ball at the feet" plan

Written 2026-11-08 after reviewing the free-play recording. Build in the order given; each step is playable.

---

## 0. What the recording shows (why it looks dead)

1. **The ball is not part of the stride.** Touches happen about once per stride (one foot only). Between touches the
   ball rolls ahead on its own physics at a different speed from the player, so it drifts 0.1 → 0.5 m away and back.
   It reads as "player running next to a ball", not "player carrying a ball".
2. **One arm stretched out.** We have no plain run/sprint clips, so running uses the *dribble* loops.
   `dribble_sprint_loop` has an arm thrown forward for balance with the ball. Every run without the ball inherits it.
3. **Restless legs at idle.** The standing-with-ball idle (`idle_with_ball`) keeps rolling the ball under its sole.
   It's fixed now: the calm idle plays whenever he's standing. The fidget clip should be a rare one-off (see §5).
4. **Speed mismatch.** The game runs at 4.4 m/s with the ball while the jog clip moves at 3.06 m/s, so the clip is played
   1.4× faster. That makes the legs look frantic and the feet reach less far forward.
5. **The camera** swings and clips into the cage near walls. It is a chase camera made for 1v1, not for reading play.

---

## 1. Fix "the player is a stranger to the ball" (do this before 3-a-side)

### 1a. Contact-pinned dribbling (the main fix)
Physics only takes over when the ball is *not* being dribbled. While dribbling, the ball's position comes from the
animation's own foot contacts:

- Clip Lab already finds each touch in a dribble clip: frame, foot, and contact point relative to the hips.
  Export those to `clips.json` and load them in the game (`contacts[clip] = [{phase, foot, x, z}]`).
- At every contact phase, the ball is **placed** on the toe of that foot. It is not pushed by a beat detector.
- Between contact *i* and contact *i+1*, the ball's position is interpolated on the ground. It goes from contact *i*
  (world, where it was struck) to the predicted world position of contact *i+1*, which is the player's current position
  plus velocity times the time to the next contact, plus that contact's local offset. Use ease-out, so the ball leaves
  the boot fast and slows into the next touch, like grass friction does.
- Result: the ball is *always* exactly where the next boot will meet it. It cannot drift away and cannot be "chased".
  Turning: when the stick direction changes, the next contact's predicted position moves with it, so the ball bends
  with the run.
- Rolling spin already follows travel distance, so the ball visibly rolls.
- Fallback to physics (loose ball) only when: a defender's foot or body touches it, he shoots/passes, he does a
  knock-on, or he turns more than about 120° in one touch.

### 1b. Get the right clips (no amount of code fixes a wrong clip)
From Mixamo, downloaded on our character with In Place off:
- **Running** and **Sprint** (plain, no ball), to replace the dribble loops for off-ball running. This fixes the arm.
- **Soccer dribble** variants at three speeds, so the playback rate stays within 0.85×–1.15×:
  - walk-dribble about 1.5 m/s
  - jog-dribble about 3 m/s (have it)
  - fast-dribble about 4.5 m/s
- Set the game's dribble speeds to the clips' measured speeds. Don't speed clips up by more than 15%.

### 1c. Foot IK at contact (polish)
For the 2–3 frames around a touch, a two-bone IK nudges the touching foot onto the ball's real position (by 5–10 cm at
most). This hides any small mismatch and makes contact pixel-perfect.

### 1d. First touch / receive
When a pass arrives, pick the receive clip, then place the ball on the receiving foot at the clip's contact frame
(same contact data as 1a). The ball dies at the feet instead of bouncing near him.

---

## 2. 3-a-side structure

- Teams: 3 v 3 (2 outfield + 1 keeper, or 3 outfield with small goals; start with 3 outfield and small goals).
- `Team` class: players[], side (+1/−1), formation, `cursor` (index of the human-controlled player).
- Every non-cursor player gets a `TeammateAI` (attacking or defending brain). The opponents are 3 AI players.
- `Match` stops being 1v1:
  - possession is `ball.owner` (a player); `team = owner.team`
  - tackles and pickups check every opposing player
  - contact layer loops over all bodies
- Intents stay the same, so online play later just sends 3 intents per team.

### Free-play first
`FREE_PLAY = true` in `config.ts` (done): no check-ball, no score, no round messages, scoreboard hidden.
Goals hand the ball back. Keep it on until 3-a-side feels good, then add rules (§7).

---

## 3. Off-ball movement: teammates adapt to the cursor player

A small positional system, run every 0.2 s (not every frame):

**Attacking (we have the ball)**
- **Support triangle:** keep the two teammates at about 6–9 m from the ball carrier, one ahead-wide and one
  behind-wide, so there is always a forward option and a safe back option.
  - Wide teammate: go to the far side of the defender marking the carrier.
  - Deep teammate: stay 4–6 m behind the carrier, in the passing lane.
- **Pass lanes:** for each candidate spot (sample 8 points on a ring around the ideal position), score it on:
  - distance to the nearest defender (open)
  - the ball path from carrier to spot not crossing a defender (clear lane)
  - progress toward goal
  - staying inside the pitch and not on top of a teammate
  Move to the best spot. This is what makes them "show for the ball".
- **Runs in behind:** when the carrier faces goal and a teammate's marker is flat-footed, that teammate sprints
  diagonally behind the defence (a "through-ball run"). Cancel it if offside-like spacing isn't useful in a cage; keep it simple.
- **Shooting position:** a teammate near the box drifts to the edge of a defender's shadow, facing goal at an
  angle (so a pass gives a first-time shot).

**Defending (they have the ball)**
- Nearest player to the ball **presses** (jockey, current DefenderAI).
- Second nearest **covers**: sits goal-side, 3–4 m behind the presser, between ball and goal.
- Third **marks** the most dangerous free opponent, staying between him and goal and leaning into his pass lane.
- Re-assign roles when the ball moves past a player or changes hands.

**Shape rules for both:** never closer than 3 m to a teammate; respect the walls; slow-jog into position (don't
sprint unless chasing a loose ball or making a run). That makes the movement look calm and intentional.

---

## 4. Cursor (player) switching

- **Auto (default):**
  - In defence, the cursor moves to the player best placed to win the ball. Score each player on distance to the
    ball's position 0.4 s ahead, plus a bonus for being goal-side.
  - In attack, the cursor follows the ball: whoever receives it.
- **Manual:** **Q** (or an on-screen SWITCH button) cycles to the next best candidate. Keep the cursor fixed for
  0.5 s after a manual switch so it doesn't jump back.
- **Pass = switch:** when you pass, the cursor goes to the receiver when the ball arrives (eFootball behaviour).
- Show a cyan ring under the cursor player plus a small arrow over his head. The next-switch candidate gets a faint ring.

**Passing controls (needed for 3-a-side)**
- **E:** ground pass toward the teammate closest to the stick direction (an assisted cone of ±35°).
- **R:** through ball into the space in front of him.
- **Space:** stays shoot.
- Pass power is automatic from the distance, with a little lead on a moving receiver.

---

## 5. Animation rules (so nobody looks restless or robotic)

- **Idle:** calm idle loops. Every 6–10 s at random, play ONE fidget (ball roll, look around) and return to calm.
- **Off-ball run:** plain run/sprint clips (§1b), never the dribble loops.
- **Scanning:** teammates without the ball turn their head toward the ball (head bone look-at, ≤ 60°). It's cheap,
  and it makes them look alive.
- **Locomotion blending:** blend idle → walk → jog → sprint by speed (two clips at once, weights by speed), instead
  of hard switching.
- **Turning on the spot:** use the turn clips when the stick changes direction by more than 100° while slow.

---

## 6. Dynamic wide camera

- **Framing:** fit everyone who matters, i.e. the ball, the cursor player, and the nearest opponent and nearest teammate.
  Compute their bounding box on the ground and choose the distance so it fills about 70% of the screen. Clamp between a
  close distance (1v1 moments) and a wide distance (whole half).
- **Angle:** a broadcast-style high side angle (about 35–40° down), looking across the pitch toward the goal you
  attack. Only follow the ball's x/z with smoothing (critically damped spring, about 0.4 s). Don't rotate with the
  player, so the controls stay stable.
- **Look-ahead:** shift the camera target toward where the ball is going (ball velocity × 0.3 s).
- **Inside the cage:** the camera stays inside the arena bounds with a margin, and lifts higher instead of clipping
  through walls. This builds on the clamp in `FollowCamera.ts`.
- **Moments:** zoom in slightly for skills and nutmegs, and pull back on long passes and shots.
- **Option:** keep the current chase camera as "1v1 cam" in settings.

---

## 7. Rules later (when we want a game again)

- First to N goals, or a 3-minute half. Kick-off after a goal from the centre.
- Ball out → boards keep it in play (cage), so there are no throw-ins.
- Fouls → indirect free kick at the spot.
- Panna (nutmeg + collect) = 2 points.
- Bring the scoreboard back (flip `FREE_PLAY`).

---

## 8. Build order

1. Plain run/sprint + 3 dribble speeds from Mixamo; locomotion blending (§1b, §5).
2. Contact-pinned dribbling + foot IK (§1a, §1c). Re-test: the ball should never be more than ~0.6 m away, and every
   touch should sit on a boot.
3. Wide camera (§6).
4. Team/Match refactor to N players, passing (E/R), receive (§1d, §2, §4).
5. Teammate + opponent positioning AI (§3), cursor switching (§4).
6. Rules (§7).
