# PannaVerse: Game Design

## The fantasy
The viral street 1v1: a small cage, one goal, a crowd filming on phones. You have the ball, he's in front of you,
and everyone's waiting to see if you can make him look silly. Every round is a few seconds of tension, then a skill, then a moment.

## The duel (current mode: "Take-On")
1. **Check ball.** Defender holds the ball and passes it to the attacker (borrowed from street ball etiquette).
2. **Live.** When the attacker controls it, the **shot clock** (12 s) starts.
3. **Attacker scores** → attacker point.
4. **Defender wins it** (tackle, interception, block + recovery) or **shot clock runs out** → defender point.
5. First to **5** wins the duel. Roles currently stay fixed (you attack, AI defends). Role swapping is in M4.

Planned special rule: **Panna** (ball through the defender's legs, then you collect it) = instant round win + humiliation celebration.

## Core mechanics

### Attacker
| Mechanic | How it works | Why it matters |
|---|---|---|
| Dribble | Ball rides ahead of the feet; distance grows with speed. Sprinting = bigger touches = easier to tackle (planned) | Speed vs control trade-off |
| Skills | Scripted animation + player path + ball path. Protected window (`protectedFor`) where tackles can't win the ball | Skills are the "attack" button of the genre |
| Fakes | Each skill has a `fakeSide`. A defender who bites runs the wrong way for ~0.5 s | Reading/baiting the defender is the mind game |
| Shot | Hold to charge, release to shoot. More power = more lift + less accuracy. Aim with left/right at release | Simple, skill-expressive |

### Defender
| Mechanic | How it works |
|---|---|
| Positioning | Stays goal-side on the ball→goal line. Drops off (2.8 m) when attacker is far, tightens (1.4 m) near goal |
| Jockey | Faces the ball, moves slower, sidesteps (needs a "defensive shuffle" clip) |
| Tackle | Lunge + active window. Wins the ball only if it's within reach of his foot and the attacker isn't protected |
| Missed tackle | He stumbles. Committing is a risk; this is what makes patience a defender skill |
| Block | A fast loose ball hitting his body deflects (shots straight at him get blocked) |
| Bite | Chance to fall for a fake (`biteChance`). Lower = harder AI |

### Balance levers (all in `config.ts` / `DefenderTuning`)
`TACKLE.reach`, `TACKLE.cooldown`, `stumbleTime`, skill `protectedFor`, defender `reaction`, `tackleRate`, `biteChance`,
`standOffNear/Far`, `SHOT` speeds and spread, `ROUND.shotClock`.

## Skill list (target)
| Skill | Sells | Beats | Loses to | Status |
|---|---|---|---|---|
| Stepover | one side | defender who bites | patient defender, tackle after protection ends | ✅ prototype |
| Knock-on | nothing (pace) | flat-footed/high defender | defender already goal-side & close | ✅ prototype |
| Body feint | one side | biting defender | n/a (cheap, short protection) | planned |
| Roulette | spin | an incoming tackle (long protection) | slow, defender can recover | planned |
| Elastico | one side, then snap the other | biting defender, big protection | needs space | planned |
| Nutmeg / Panna | through the legs | defender with a wide stance (jockeying/lunging) | upright defender | planned, special win |
| Rainbow flick | over the head | defender too tight | defender standing off | planned |

## Modes (later)
- **Take-On** (current): attack vs defend, roles swap each round (M4).
- **King of the Cage**: both attack the same goal, loose ball is anyone's.
- **Panna Battle**: points for skills, nutmegs = big points, goals = medium. Like the real panna knockout tournaments.
- **Online 1v1** (M5).

## Controls
Keyboard now (see README). Mobile (M3): left virtual stick; right side: **Shoot** (hold), **Skill** (+ stick direction picks the skill),
**Sprint**, and when defending **Tackle** / **Jockey** (hold).
