# Quests and achievements (P7, design)

Design of Paved's daily quests and achievements, built on Grim World's `quiver_quest` and `quiver_achievement`.
Documents only: no code and no dependency is added by this PR. The list in the next section is **accepted (P-22, 2026-10-07)**, with the design choices below; the rest of the
document says how it will be built.

Rules that bind this design (`docs/programme/DECISIONS.md` O-1, `docs/programme/OPERATIONS.md`): quiver comes **by
pinned published version on scarbs.xyz only, never git or path**; what Paved needs from quiver goes to the Overseer
as a request to Grim World, never as a PR to quiver; golden games stay identical; every gameplay test carries a gas
budget; toolchain Scarb 2.20.1 / snforge 0.64.0.

Sources read: `contracts/src/components/playable.cairo`, `tutoriable.cairo`, `hostable.cairo`, `systems/daily.cairo`,
`events.cairo`, `leaderboard.cairo`, `models/game.cairo`, `store.cairo`, `structure/assessment.cairo`,
`structure/forest.cairo`, `constants.cairo`, `docs/measures/baseline.md`, `docs/architecture/leaderboard.md`,
`docs/architecture/indexer.md`; quiver (read only, clone `/home/claude/projects/quiver`, and the published packages
as Scarb downloaded them): the two READMEs, `CHANGELOG.md`, `GAS.md`, `Scarb.toml`; Nums and Glitchbomb (read only,
`contracts/src/elements/{quests,achievements,tasks}`, `components/playable.cairo`).

## What Nums and Glitchbomb do

Both are Dojo games using the Arcade `quest` and `achievement` components, with the same shape.

- **Tasks are the unit.** A task is an identifier plus a description (`Task::Filler`, `Task::Grinder`, ...). A quest
  or an achievement is a target on one task (or a few). Tiers are separate definitions on one task (Nums:
  `GrinderOne/Two/Three` on the task `Grinder` at 100 / 500 / more games; `PlacerOne..Three`, `PowerOne..Three`).
- **Daily quests** have `duration = interval = ONE_DAY` (Glitchbomb), or a day inside a 3-day interval (Nums), and no
  reward, but a meta quest: Nums' `DailyFinisher` ("complete all the daily quests", target 3) is the only one that
  rewards (`reward() -> true`, a game). Glitchbomb grants reward games from the quest callback.
- **Achievements** carry `points` (15 to 60 in Glitchbomb), a title, a description, an icon and a group; `points` is
  display only.
- **Progress is reported on every action** (`quest.progress(..., Task::Filler, 1)` in Nums' `set`, one call per
  placed number). That is affordable on Dojo's cost model. It is not on Paved's: see "Cost" below. Paved reports
  **once per game**.

## The list (accepted, P-22, 2026-10-07)

Everything below is derived from what the contracts already compute: the score, the `Scored` events (category, size,
points), the game-over data (`score`, `built`, `discarded`, tournament rank returned by `Leaderboard::submit`), and
the mode. Nothing needs a new rule of the game. **Targets are first guesses**, to be calibrated (see "Risks").

### Tasks

A task id is a non-zero `u32` that the package treats as opaque. The game owns these constants
(`contracts/src/constants.cairo`, at implementation).

| Id | Task | One unit is |
|---|---|---|
| 1 | `GAME_FINISHED` | A Daily game over (any, ranked in its tournament or not) |
| 2 | `STRUCTURE_SCORED` | A `Scored` event of a road or a city |
| 3 | `POINTS` | A point of a finished game's score (reported once, the game's final score) |
| 4 | `FOREST_SCORED` | A `Scored` event of a forest, that is a Woodsman or a Herdsman scoring (the event is emitted per character, even with 0 points) |
| 5 | `WONDER_SCORED` | A `Scored` event of a wonder |
| 6 | `BIG_STRUCTURE` | A road or a city scored with size of at least `BIG_SIZE` (8, to calibrate) |
| 7 | `HIGH_SCORE` | A finished Daily game with a score of at least `HIGH_SCORE` (4,000, to calibrate) |
| 8 | `PODIUM` | A place in the top 3 of a closed day's tournament. **Not reported by the contract** (see "On the Podium" below) |
| 9 | `WIN` | A finished Daily game that took rank 1 |
| 10 | `TUTORIAL_FINISHED` | A Tutorial game over |

Tutorial games count for task 10 only: the tutorial is free, so it must not feed dailies, which are tied to the paid
Daily.

### Daily quests (4)

Schedule of each: `start` a multiple of 86,400 (so a day rolls over at 00:00 UTC, exactly where Paved's tournament id
`timestamp / 86400` rolls over), `end = 0`, `duration = interval = 86,400`, no prerequisite. The count is per UTC day,
summed over the player's games that **end** that day (a game over after midnight counts for the day it ends in). Each
is reachable in one Daily game, so a player is not pushed to buy several entries.

| Id | Title | Description | Condition (task, target) | Reset | Reward |
|---|---|---|---|---|---|
| 1 | Daily Run | Finish today's Daily. | `GAME_FINISHED` 1 | each UTC day | none |
| 2 | Master Builder | Score six roads and cities in a day. | `STRUCTURE_SCORED` 6 | each UTC day | none |
| 3 | Into the Woods | Score a forest with your Woodsman or Herdsman. | `FOREST_SCORED` 1 | each UTC day | none |
| 4 | Point Chaser | Collect 3,000 points in a day: the **sum of the scores of the day's finished Daily games**, not a single game. | `POINTS` 3,000, summed over the day's finished Daily games | each UTC day | none |

Not proposed for v1: a Nums-style finisher ("complete the four", +1 task reported from the claim hook). It needs
storage mode and a reward to mean anything (see "Quest mode").

### Achievements (9)

No window (`start = end = 0`); `points` is display only. The three `Settler` tiers are three achievements on the same
task, as the package intends.

| Id | Title | Description | Condition (task, target) | Points |
|---|---|---|---|---|
| 1 | First Stone | Finish the Tutorial. | `TUTORIAL_FINISHED` 1 | 10 |
| 2 | Settler I | Finish a Daily game. | `GAME_FINISHED` 1 | 10 |
| 3 | Settler II | Finish 10 Daily games. | `GAME_FINISHED` 10 | 20 |
| 4 | Settler III | Finish 50 Daily games. | `GAME_FINISHED` 50 | 40 |
| 5 | Grand Builder | Score a road or a city of 8 tiles or more. | `BIG_STRUCTURE` 1 | 20 |
| 6 | Forester | Score 10 forests. | `FOREST_SCORED` 10 | 20 |
| 7 | Pilgrimage | Score a wonder. | `WONDER_SCORED` 1 | 30 |
| 8 | High Roller | Finish a Daily game with 4,000 points or more. | `HIGH_SCORE` 1 | 30 |
| 9 | On the Podium | Take a place in the top 3 of a day's tournament. | `PODIUM` 1, reported by the indexer | 50 |

A tenth, `Champion` (`WIN` 5), is left out to keep the list at nine; task 9 is defined and reported anyway, because it
costs nothing (below) and lets the ruling add it without a contract change.

### On the Podium (orchestrator's choice under P-22)

The contract cannot know a final rank before the day ends: a later game can push a player out of the top 3. So
`PODIUM` is **reported by the indexer**, not by the game-over report: after the day ends, the indexer reads the
contract's `tournament` view of that day, at a served head whose timestamp is past the day's `end_time` (the same
read as the D-P6-5 cross-check, `docs/architecture/indexer.md`), and credits each player holding a rank 1 to 3.
It is exact (the view is the contract's own ranking), never early, and does not depend on the player doing anything.
Why not at `claim`: a player in the top 3 who never claims would never get the achievement. Consequence for the
contract: the game-over report carries tasks 1 to 7 and 9 only, at most 8 entries; task 8 stays defined for the
achievement and is credited off the contract's report path (the indexer applies it as it applies windows).

### What the ruling decided

1. The list, its titles and its targets: accepted as in the tables above.
2. **Rewards: none in v1.** Achievement points are shown, never read by a rule; dailies give nothing. A reward
   (a free Daily entry, `$TILE`) belongs with P8, which owns the economy and its audit. Reverse: the PM wants a reward
   now; then quests move to storage mode (below) and the reward is granted from the claim hook.
3. Quest mode, achievements in event mode (the package has no other), and the integration shape (below).

## How Paved integrates quiver

### Which version, and from where

| | `quiver_quest` | `quiver_achievement` |
|---|---|---|
| Published on scarbs.xyz | yes: versions 0.1.0 and **0.2.0** | yes: versions 0.1.0 and **0.2.0** |
| Checksum of 0.2.0 (registry index) | `sha256:15f0a3710a47...` | `sha256:a66de3292e92...` |
| Cairo / `starknet` required | `cairo-version ^2.20.0`, `starknet ^2.20.0` | same |
| `snforge_std` | `^0.64.0`, dev only (not a consumer's dependency) | same |
| Edition of the published manifest | `2024_07` | `2024_07` |
| Licence | MIT | MIT |
| Other dependencies | none | none |

How this was checked, on 2026-10-07: the registry index of both packages
(`https://scarbs.xyz/api/v1/index/qu/iv/<name>.json`) lists the two versions each, and Scarb downloaded 0.2.0 of both
into its registry cache. **Provenance (confirmed by Grim World):** both
0.2.0 packages on scarbs.xyz are built from quiver commit `2e6bb77392335a5420b2ff331f072f66f265c16f`, tags
`quiver_quest-v0.2.0` and `quiver_achievement-v0.2.0`. quiver main's `STATUS.md` says published. An earlier reading
of this document said "unpublished": that came from a stale local clone, 19 commits behind its remote, and was wrong.

**Toolchain against Paved's.** Paved is Scarb 2.20.1 (Cairo 2.20.0) / snforge 0.64.0 exact, package edition `2023_11`
(`contracts/Scarb.toml`). quiver 0.2.0 is built with the same compiler and snforge (its ARC-10), and its published
manifest says edition `2024_07`; an edition is a property of a crate, so a `2023_11` consumer is allowed, and this
was tried rather than assumed. A scratch package, edition `2023_11`, `starknet = "2.20.1"`,
`quiver_quest = "=0.2.0"`, `quiver_achievement = "=0.2.0"`, importing both components, resolved and built with
Scarb 2.20.1 (`RAYON_NUM_THREADS=1`, capped at 8 GB): `Finished` in 4.35 s, peak 675 MB, no error. The same scratch
package refused to resolve under Scarb 2.19.4 (`required Cairo version ^2.20.0`), which is the reason the toolchain
bump (P3) came first. Nothing of the contracts was built against it: the real build and `snforge` come with the
implementation.

**Pin (O-1).** `quiver_quest` and `quiver_achievement` are pinned **exactly `=0.2.0`** in `contracts/Scarb.toml`, so a later
0.2.x is a deliberate PR; `contracts/Scarb.lock` is committed and records the checksums. No `git`, no `path`. A
breaking release is announced by Grim World to the Overseer (O-1).

### Shape: embedded in the game contracts, internal layer only

The recommended shape follows the usage example of both READMEs ("this consumer ... exposes only the views and calls
the internal layer from its own entrypoints, after its own checks"):

- `Daily` embeds `QuestComponent` and `AchievementComponent` (`#[flat]` events, like its other components),
  `AchievementViewImpl` and `QuestViewImpl` (views only), and the **internal impls**. It does **not** embed the
  external `QuestImpl` / `AchievementImpl`: no `progress` entrypoint exists for a client or another contract.
- `Tutorial` embeds the two components too, but only to emit task 10. Progress reads no definition (the achievement
  package says so: "reads no definition there"), so the definitions live in `Daily` only and `Tutorial` stores
  nothing for this.
- Tracking: `TrackAll` for both, because the indexer reads definitions from `AchievementDefined` / `QuestDefined`.
- A separate `Quests` contract that `Daily` and `Tutorial` call as registered reporters is the alternative. It keeps
  quiver out of the game classes and gives one registry and one event source, at the price of a cross-contract call on
  the game-over path, a reporter check (one storage read), a new deployed contract, a new ABI and a new line in
  `deployments/<network>.json`. It is the fallback if the class size or the review of the game classes asks for it.
  Recommendation: embedded, because it is the cheapest and cannot fail on a registry (see "Risks").

### Access control

| Action | Who | How |
|---|---|---|
| `define`, `retire` (quests and achievements) | the `Daily` owner (`OwnableComponent`, already there) | New owner-only entrypoints `define_quest`, `define_achievement`, `retire_quest`, `retire_achievement` that check the owner and call the internal layer. A definition is created once and a retired one cannot be redefined (package rule). |
| `progress`, `progress_many` | **the game flow only** | Called from `PlayableComponent` / `TutoriableComponent` through the internal layer. No external entrypoint, no reporter registry, so no client can emit progress. |
| `accept`, `abandon`, `claim` | nobody in v1 | Event-mode quests have no acceptance and no claim. In storage mode they would be `authorize_player(caller, player_id)` with the caller equal to the player's account. |

`player_id` is the account address as a felt (`get_caller_address().into()`), the same id the other events use, so the
indexer joins quest and achievement events with `GameOver` on one key.

### Quest mode: event for v1, storage later

`progress` takes a `Mode` per call.

| | `Mode::Event` (proposed for v1) | `Mode::Storage` |
|---|---|---|
| Reads and writes | none | the player's held list, and per held quest a progress and a record slot (created: 474,106 snforge / about 453,500 network per slot) |
| Events | `QuestProgressed { player_id, task_id, count }` per merged non-zero entry | `QuestCompleted` per completion, plus the hooks |
| Acceptance, claim, hooks | none: the indexer applies the daily window and the sum | yes: accept (at most 4 held), claim, `on_quest_complete`, `on_quest_claim` |
| Cost of the report at game over | see "Cost" | measured by quiver at `MAX_HELD` = 4: 3,244,843 (slots existing) to 6,460,843 (slots created) L2 gas, up to 1.37M per held quest; with a hook writing a slot, 8.34M |

Event mode fits a proposal with no reward: a daily quest is "done" when the indexer sums the day's `QuestProgressed`
to the target. Its cost is the cost of the achievements', with no per-player state. It does not stop a player from
"completing" a quest in the UI only: since nothing is claimed on chain, there is nothing to cheat. **Storage mode is
chosen the day a quest must grant something on chain** (P8): the cost is then 3.2M to 6.5M L2 gas on the closing move,
about +45 % to +90 % of today's worst move, which is a decision to take with the economy, not now.

Mixing modes on one quest is forbidden by the package ("progress in one mode is invisible to the other"), so the
choice is per quest and a quest defined for event mode that later needs a reward is retired and redefined under a new
id.

A daily quest in event mode needs its window enforced by the indexer, not the package: `QuestDefined` carries
`start`, `end`, `duration`, `interval`, and the indexer takes the event's block timestamp.

## Where progress is recorded in the game flow

### The shape: counters in the game, one report at game over

Reporting on every scoring move would add a call to moves that today cost 5.9 M to 7.3 M (the open simple move's
ceiling is 5,869,212, the worst case's 7,325,796: `contracts/tests/gas.cairo`). Paved instead **counts in the game and
reports once, when the game is over**:

- `Game` gains four small counters, kept in `GameState` (below): structures scored (task 2), forests scored (4),
  wonders scored (5), big structures scored (6).
- `assess` (`models/game.cairo`) today returns whether a structure scored; it is the place that sees every scoring
  (`assess_generic`, `assess_wonder`, `assess_forest` in `structure/`, each emitting `Scored`). Each of the three adds
  one to the right counter next to the `add_score` it already calls. No new storage access: the counters ride in the
  game state that every move already rewrites.
- At game over, one helper in `PlayableComponent`, next to `end_in_tournament` and called from the same three places
  (`discard`, `surrender`, `build`: today `if game.is_over() { end_in_tournament(...) }`), builds the report from the
  game and from the rank that `end_in_tournament` now keeps (`Leaderboard::submit` already returns it, 1 to 3 or 0,
  and the call site ignores it today), and makes **one `progress_many` per component** (quest, achievement), each with
  at most 8 entries (the package bound is 16 per call, one call per player per transaction).
- `TutoriableComponent` does the same at its own game over with the single entry of task 10.

| Call site | File | Report |
|---|---|---|
| `build` game over | `components/playable.cairo` | tasks 1 to 7 and 9 from the game and the rank |
| `discard` game over | `components/playable.cairo` | same |
| `surrender` game over | `components/playable.cairo` | same |
| Tutorial game over (three sites) | `components/tutoriable.cairo` | task 10 |

A game that is never finished reports nothing: that is by design (a daily is "finish today's game" first), and a
player who wants their partial scoring to count can `surrender`.

**Storage of the counters.** `GameState` is two felts: the seed, and one word with the 128-bit deck bitmap
(`tiles`) in its low half and, in its high half, `tile_count`, `score`, `discarded`, `built`, `over`, `held_tile`,
`characters` (88 of the 128 bits; `store.cairo` `set_game_state`). The felt252 bound leaves about 35 of the high bits,
and the four counters need about 23 (7 + 6 + 4 + 6, saturating). **No new slot, so no new 0.45M storage write**; the
layout of `GameState` changes (`docs/architecture/native-storage.md` is updated by the implementation), the public
views do not (they build their own structs, `public-interface.md`), and nothing is deployed on a public network, so
there is nothing to migrate. To confirm at implementation: the exact bit budget, and that a `Game` with four more
fields does not move the gas of the moves beyond measurement noise.

**Alternative without a layout change.** Make the call on each move whose `assess` returned a scoring, with the
tally of that move. No counters and no `GameState` change, but every scoring move pays a report (0.3 M to 0.5 M,
estimate) and a game reports as often as it scores. Not recommended; it is the fallback if the bit budget does not hold.

### What the report does not need from the contracts

Everything above is in the game state. A "streak" (days in a row) is not on the list: Nums has `Streak` achievements,
but a streak is the indexer's to compute from the daily `GAME_FINISHED` events and is left out of v1.

## Cost

**Gas guard (P-22).** If the measured cost on the closing move goes above **+1.5 M L2 gas**, the implementation
comes back to the project manager before merging.

**Estimates, not measures.** quiver measured its own calls through a dispatcher with snforge (`GAS.md` of 0.2.0):

| Call | L2 gas |
|---|---|
| `quest.progress`, event mode, 1 entry | 212,366 (baseline deployed) |
| `achievement.progress`, 1 entry | 213,636 |
| `progress_many` worst, 16 entries, 16 events (both packages) | 1,821,093 to 1,835,803 |
| Grim World's result transaction, 8 tasks in two calls | 838,408 |
| Per extra distinct entry | about 69,000 |

From these, for Paved:

| | Estimate | Basis |
|---|---|---|
| Every move that is not a game over | about 0: the counters are bits of a word that is already written; a few additions per scoring | no storage access added, no call |
| A game over | +0.4 M to +1.4 M L2 gas, on top of the closing move | two `progress_many` of up to 8 entries each, from 2 x ~0.21 M (1 entry) to 2 x ~0.65 M (8 entries); the internal layer skips the dispatcher and the reporter read the figures above include, so it is likely lower |
| Against the closing move today | +5 % to +19 % of the worst move's ceiling (7.33 M); the leaderboard update alone is 0.18 M to 0.52 M | `contracts/tests/gas.cairo` ceilings |
| Storage per player | none | event mode, nothing keyed by a player |
| Storage for the definitions | 4 quests + 9 achievements, one task each: one slot each (`define` 1 task: 722,550 / 701,944 network for an achievement) | one-off, admin, in a few transactions (the package caps a transaction near 25 single-task definitions under its 20 M rule) |
| Class size | to measure: two components in `Daily` and `Tutorial` | |

**How it will be measured** (the method of `docs/architecture/leaderboard.md` "Effect on gas"): a bench test that
ends a game with the report against the same game without it (whole-test snforge L2 gas, difference), for a game
over that scores, one that does not, and the Tutorial's; `contracts/tests/gas.cairo` scenarios a0 to j keep their
ceilings, and the figures of the non-final moves must not move beyond the noise of the existing ceilings (+5 %);
a new ceiling for the closing move with the report; the numbers recorded in `docs/measures/baseline.md`. Golden games
stay identical (the score does not change); they gain assertions on the emitted `AchievementProgressed` /
`QuestProgressed` events of the full-deck game and of the forest cases. Memory: measure first,
`prlimit --as=8589934592 -- /usr/bin/time -v snforge test <filter>`, as `AGENTS.md` says.

## Events the indexer reads

All are emitted by `Daily` (and task 10 by `Tutorial`); the indexer of `docs/architecture/indexer.md` adds them to
the events it already watches, filtered by emitter address.

| Event | Fields | Used for |
|---|---|---|
| `QuestDefined` | quest id, schedule (`start`, `end`, `duration`, `interval`), tasks, conditions | the board of the day, the target |
| `QuestProgressed` | `player_id`, `task_id`, `count` | the day's sum per player and quest |
| `AchievementDefined` | achievement id, window, tasks, `points` | the list, the targets |
| `AchievementProgressed` | `player_id`, `task_id`, `count` | the tiers reached |
| `QuestRetired`, `AchievementRetired` | id | stop counting |

Which fields are keys and which are data is the package's ABI; the indexer takes it from the regenerated
`contracts/abis/Daily.json`. The rule the indexer computes is the package's: sum the counts of a task whose block time
is in the window and before a retirement, saturate at the target, a tier once reached is kept. The indexer stays
display only and rebuildable from the chain.

Titles, descriptions, icons and the order of the list are **not on chain** (the packages store ids, tasks, targets,
windows, points): they live in the client or in the indexer's config, keyed by id.

## What Paved needs from quiver (list for the Overseer, to forward to Grim World)

Nothing blocks the proposal: both packages are published, build on Paved's toolchain, and cover the list in event
mode. Two requests, none a PR to quiver (the provenance one is answered, above):

1. **An API guarantee on the game-over path.** That `progress_many` through the internal layer, with at most 16
   entries, non-zero task ids and non-zero counts, **cannot revert** in event mode, for the life of 0.2.x. The
   READMEs state "progress never reverts for a quest-level reason" for storage mode and bound the entries; Paved
   wants it stated for event mode as a guarantee, because a revert there would stop a game from ending. **Open:
   until Grim World answers, the implementation guards the call itself** (Q-1).
2. **A note for later:** the achievement storage design ("per-task counters, one packed slot per (player, task)")
   announced "for a later version". Paved needs it only if a rule of a contract has to read an achievement (a P8
   reward gated by a title); it is not needed for this proposal.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| Q-1 | **A revert in the report stops a game from ending** (and skips the leaderboard submit). | The internal layer checks no caller and no reporter; the only failures are the bounds (more than 16 entries, task id 0), which the code cannot reach (8 fixed entries, constant ids); zero counts are dropped, not refused. Order of the game-over path: `end_in_tournament` first, report after, so the ranking is written before anything of quiver runs. A test of the game over with every counter at its maximum. Guarantee asked of quiver (request 1, open). **Until Grim World answers whether event-mode `progress_many` can revert within its bounds, the implementation guards the call so that a game over never fails because of quests**: the entries are built from constants and counters clamped to their field widths, their number (at most 8 against the bound of 16), the non-zero task ids and the dropped zero counts are checked before the call, and a test ends a game with every counter at its maximum and with every count zero, and asserts the game over, the ranking and the `GameOver` event happen. The separate-contract shape is worse here: a failing external call needs a catchable failure, which is **to confirm on the network version** before choosing it. |
| Q-2 | **The closing move costs +0.4 M to +1.4 M** and the class grows. | Measured before merge with the method above; ceilings recorded; the alternative of reporting per scoring move is worse. If the cost is not accepted, achievements only (one call) halves it. |
| Q-3 | **`GameState` layout change** touches goldens and tests that build a `Game`. | Counters are not part of the score: goldens stay identical (never edited). Done in its own PR with the baseline gas of the non-final moves. Nothing is deployed on a public network. |
| Q-4 | **Targets are guesses.** 3,000 points a day, 4,000 for High Roller, `BIG_SIZE` 8, six structures: the only reference is the greedy bot of the full-deck golden (3,554 points over 38 tiles). | Calibrate before defining, from the golden bot, a few scripted games and the first devnet plays. A definition cannot be edited, only retired and replaced: calibrate before the definitions go to a shared network. |
| Q-5 | **Bots and a predictable daily seed** (R-4, D-3): a player can precompute the day's best game, so `HIGH_SCORE`, `PODIUM`, `WIN` and the point quest say little about skill. | No reward in v1, so nothing to farm. Revisit with the seed's own fix before P8 gives anything a value. |
| Q-6 | **Day boundary.** A game that starts one UTC day and ends the next ranks in no tournament (`tournament_id` 0) but still reports. | By design: quests count the day a game ends. A quest whose `start` is not a multiple of 86,400 would roll over at another hour: the package does not check it, so the definition script asserts it and a test checks it against `TournamentImpl::compute_id`. |
| Q-7 | **Event mode trusts the emitter.** Anyone could deploy a contract emitting a look-alike `AchievementProgressed`. | The indexer filters by the `Daily` and `Tutorial` addresses of `deployments/<network>.json`. |
| Q-8 | **A published breaking release** or a re-publish under the same version. | Exact pin and committed lock (checksum); O-1's announcement path; the first build in CI would fail on a changed checksum. |
| Q-9 | **Edition `2024_07` dependency of an `2023_11` package.** It builds today (scratch package, Scarb 2.20.1). | Re-run at implementation on the real package, and again at every toolchain bump. |
| Q-10 | **Definitions cannot be changed** once defined (a retired id cannot return). | Ids are never reused; titles and descriptions are off chain and can change; the ruling is final for the targets. |

## Implementation order (after the ruling)

1. Pin, build, embed (no counters yet): the two components in `Daily` and `Tutorial`, owner entrypoints, `define`
   script and a regenerated `contracts/abis`; tests of access and of the definitions. One PR.
2. Counters in `GameState`, the report at game over with the guard of Q-1 (inputs bounded and checked before the call,
   with its test), tests (events of the golden games), the gas bench and the
   ceilings. One PR; the figures replace the estimates of this document.
3. Indexer: the events above and the read API (quests of the day with progress, achievements and tiers), by the
   META track, then the client by the CLIENT track.

An audit is not planned for 1 and 2 (events only, no money, no player-writable state); one is planned if the ruling
moves quests to storage mode with a reward.

## As built (P7 contracts)

What the contracts PR (`feat: P7 quests and achievements on quiver 0.2.0 (contracts)`) does, and where it differs
from the design above. Figures are L2 gas, measured on Linux with `contracts/tests/gas.cairo` (the call alone,
`get_available_gas()` right before and after), pinned toolchain.

- **Dependencies.** `quiver_quest = "=0.2.0"` and `quiver_achievement = "=0.2.0"` in `contracts/Scarb.toml`, checksums in
  `contracts/Scarb.lock`. Both build under the `2023_11` edition of the package.
- **Daily** embeds both components (`TrackAll`, views and internal layer only) and the owner-only
  `IDailyQuests`: `define_quest`, `retire_quest`, `define_achievement`, `retire_achievement`. A recurring quest
  must start on a multiple of 86,400 (`'Daily: quest not on UTC day'`, Q-6). **Tutorial** embeds the achievement
  component only, to report task 10 (a quest component there would emit a `QuestProgressed` for a task no quest uses; accepted by the orchestrator);
  it has no views and no definitions.
- **Counters.** `Game` gains one field, `counts: u32`, holding `structures` (7 bits), `forests` (6), `wonders` (4) and
  `big` (6), saturating, read with `structures()`, `forests()`, `wonders()`, `big()`. It sits at bit 88 of the high
  half of the `GameState` word (23 bits, up to bit 111 of 123): no new slot. `Store::set_builder` keeps it.
- **Report.** `PlayableComponent` returns the tally as one `u128` at game over (0 when the game is not over, so a
  move that does not end the game pays nothing for it), after `end_in_tournament` (which now returns the rank) and
  after `GameOver`; `Daily` makes one `progress_many` per component from `paved::quests`, with its own list: the
  quests get tasks 1 to 4 (at most 4 entries), the achievements tasks 1, 4, 5, 6, 7 and 9 (at most 6). Zero counts
  are dropped. Tutorial reports task 10 with one `progress`. The design's single list of 8 entries is split because
  each entry is an event (about 70k).
- **No runtime guard (ruling P-23).** `progress_many` reverts in event mode only on more than 16 entries or a task id
  0; both are decided by the array built from constants. `paved::quests::tests` proves the bounds on every shape of
  report, for both lists (rank 0 to 3, scores around the thresholds, counters at 0, 1, 15 and at their maximum), and
  `e2e::quests` ends a game with every counter at its maximum and with every count zero and asserts the game over,
  the ranking and `GameOver`.
- **Definitions** are not made by the contracts' constructor: the accepted list is defined with the entrypoints above
  (`e2e::quests::define_accepted_list` is the list as calls). The script that does it on a network belongs with the
  deploy task.
- **Class sizes** (dev profile, `casm = true` in a scratch copy, main `b4d0c74` against this PR; felts of the Sierra
  program and of the CASM bytecode):

  | | Sierra before | Sierra after | CASM before | CASM after | Entrypoints |
  |---|---|---|---|---|---|
  | `Daily` | 39,958 | 53,180 (+33 %) | 80,568 | 103,162 (+28 %) | 19 -> 33 |
  | `Tutorial` | 37,076 | 38,612 (+4 %) | 75,165 | 78,098 (+4 %) | 14 -> 14 |
- **Event order.** At a game over the order is `GameOver`, the quest events, then the achievement events
  (`e2e::quests::test_quests_game_over_every_counter_at_maximum`, from `spy.get_events()`).
