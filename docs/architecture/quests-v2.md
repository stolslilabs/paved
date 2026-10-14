# Quests and achievements v2: benchmark and options

Documents only: no contract change. Brief: `docs/briefs/quests-v2-benchmark.md` (track CORE, the PM's go of
2026-10-14). v1 is `docs/architecture/quests.md` (the accepted list of P-22, the Setup contract of D-24/D-25), with
its indexer (`docs/architecture/indexer.md`, "As built (P7 indexer, quests and achievements)") and its client page.

## Status of this document: the benchmark is incomplete

The brief names two read-only sources, read only with `git -C <clone> show <sha>:<path>`, `ls-tree` and `grep`:
Nums at `4f8f405` (`/home/claude/projects/nums`) and Glitchbomb at `5efcbce` (`/home/claude/projects/glitchbomb`).
**Every such command was refused by the thread's permissions** on 2026-10-14 (`git -C <clone> show 4f8f405:README.md`,
`ls-tree -r --name-only`, `grep -n -i quest`, the same for Glitchbomb), so this thread read neither clone. The rule is
to report a refused command, not to work around it.

What follows therefore cites Nums and Glitchbomb **only at second hand**, from two merged documents of this
repository, and says so in each cell:

- `docs/architecture/glitchbomb-gap.md` read Glitchbomb **at the same commit `5efcbce`** ("GB:" citations, its
  lines 16-20). Its citations are reproduced as it gives them (`GB:<path>:<line>`), not re-checked.
- `docs/architecture/quests.md:41-55` read Nums and Glitchbomb (`contracts/src/elements/{quests,achievements,tasks}`,
  `components/playable.cairo`) at an unstated commit, with no line numbers.

A cell marked **not read** is a gap that a thread with access to the clones fills. The proposal (part 2) does not
depend on those gaps: it rests on Paved's own contracts, indexer and economy, which were read in full.

## Part 1. Benchmark

Paved paths are at this branch's base (main `da07a9cc`).

### 1.1 Catalogue

| | Nums (`4f8f405`) | Glitchbomb (`5efcbce`) | Paved v1 |
|---|---|---|---|
| Model | Arcade `quest` and `achievement` components on Dojo; a **task** (id + description) is the unit, a quest or an achievement is a target on one or a few tasks; tiers are separate definitions on one task (`quests.md:45-47`, second hand) | same shape as Nums (`quests.md:43`, second hand) | quiver 0.2.0 (`quiver_quest`, `quiver_achievement`), the same task model, in `Setup` (`contracts/src/systems/setup.cairo:127-135`) |
| Tasks | named tasks, e.g. `Filler`, `Grinder`, `Placer`, `Power`, `Streak` (`quests.md:45-47`, `:293`, second hand); full list **not read** | **not read** | 10 ids, `contracts/src/constants.cairo:37-49`: 1 `GAME_FINISHED`, 2 `STRUCTURE_SCORED` (roads and cities together), 3 `POINTS`, 4 `FOREST_SCORED`, 5 `WONDER_SCORED`, 6 `BIG_STRUCTURE` (size >= `BIG_SIZE` 8, `:52`), 7 `HIGH_SCORE` (score >= 4,000, `:54`), 8 `PODIUM` (indexer), 9 `WIN` (never reported since D-20), 10 `TUTORIAL_FINISHED` (claim) |
| Quests | daily quests plus a meta quest `DailyFinisher` ("complete all the daily quests", target 3) (`quests.md:48-50`, second hand); count **not read** | **37 quests**, created by `create_quests` from constant tables (`GB:…/setup.cairo:470-484` through `InitializableComponent`, `GB:…/components/initializable.cairo`; `glitchbomb-gap.md:137-139`, `:293`) ; their tasks **not read** | 4 daily: Daily Run (`GAME_FINISHED` 1), Master Builder (`STRUCTURE_SCORED` 6), Into the Woods (`FOREST_SCORED` 1), Point Chaser (`POINTS` 3,000 summed over the day) (`quests.md:91-96`) |
| Achievements | tiered, e.g. `GrinderOne/Two/Three` at 100 / 500 / more games, `PlacerOne..Three`, `PowerOne..Three`, `Streak` (`quests.md:46-47`, `:293`, second hand) | **39 achievements** (`glitchbomb-gap.md:139`), `points` 15 to 60, display only, with title, description, icon, group (`quests.md:51-52`, second hand) | 9: First Stone, Settler I-III (1 / 10 / 50 games), Grand Builder, Forester (10), Pilgrimage, High Roller, On the Podium; `points` 10 to 50, display only (`quests.md:106-116`) |

### 1.2 Windows

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Daily | a day inside a **3-day interval** (`quests.md:48`, second hand) | `duration = interval = ONE_DAY` (`quests.md:48`, second hand) | `start` a multiple of 86,400, `duration = interval = 86,400`, `end = 0`; enforced at definition (`'Setup: quest not on UTC day'`, `setup.cairo:110`) |
| Weekly, other | **not read** | **not read** | none defined; quiver's schedule allows any `interval` (the indexer applies `(time - start) % interval < duration`, `indexer.md:149-151`) |
| Interval computation | on chain, by the component (storage of progress per interval); details **not read** | same | **off chain**: the indexer computes the interval id from the block time of each `QuestProgressed` (event mode keeps no interval on chain); a game counts for the UTC day it **ends** in (`quests.md:86-89`) |
| Achievements | no window | no window | `start = end = 0` (`quests.md:103`) |

### 1.3 Rewards

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Quest reward | only the meta quest `DailyFinisher` rewards (`reward() -> true`: a game) (`quests.md:49-50`, second hand); mint path **not read** | a **reward game**: `on_quest_claim` mints one (`GB:…/play.cairo:185-214`; `glitchbomb-gap.md:105`) | **none** (P-22 ruling 2, `quests.md:149-151`); `on_quest_complete` and `on_quest_claim` are empty (`setup.cairo:151-164`) |
| Achievement reward | `points`, display only (second hand) | none: the achievement hooks do nothing (`GB:…/setup.cairo:118-129`; `glitchbomb-gap.md:142-143`) | `points`, display only (`quests.md:103`) |
| Token, XP, cosmetics | **not read** | no token reward is cited by the gap note; **not read** beyond it | none |
| Who can mint | **not read** | the reward game goes through `Play` (`mint` is `CREATOR_ROLE`, held by Setup, `GB:…/play.cairo:121-128`, `:254`; `glitchbomb-gap.md:97-99`) | nothing to mint. For reference: PAVED has **one minter, `Economy`, set once, the admin then cleared** (`contracts/src/systems/token.cairo:4-5`, `:21-29`); `PavedToken` is not upgradable (P-42 lists `Daily`, `Tutorial`, `Account`, `Economy`, `Collection`; P-56 adds the Vault) |

### 1.4 Claim flows

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Kind | on-chain claim (storage of progress); progress reported **on every action** (`quest.progress(..., Task::Filler, 1)` per placed number, `quests.md:53-55`, second hand) | **automatic claim**, no player claim entry point (`GB:…/play.cairo:180-183`; `glitchbomb-gap.md:141-142`, `:416-417`) | **event mode**: no claim, no completion on chain; `QuestCompleted` and `QuestClaimed` are declared, never emitted (`leaderboard.md:859`; the indexer ignores them, `packages/indexer/src/events.ts:195-197`). One claim exists: `claim_tutorial()`, idempotent, unchecked (`setup.cairo:306-315`) |
| Who reports | any world writer (no reporter allowlist, `GB:dojo_mainnet.toml:27-28`; `glitchbomb-gap.md:141`) | same | an **allowlisted reporter** (Challenge), once per game over (`setup.cairo:284-304`) |
| Storage | Dojo world models (`GB:contracts/src/store.cairo:82-132` for Glitchbomb, `glitchbomb-gap.md:64`) | same | definitions only (one slot each); **no per-player storage** but the tutorial flag |
| Gas | **not read** (Dojo's cost model, `quests.md:54`) | **not read** | report at game over: two `progress_many` of at most 4 and 5 entries, about 70k per entry (`quests.md:301-319`, `:421-422`); measured figures in `docs/measures/baseline.md` |

### 1.5 Client surfaces

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Where | **not read** | **not read** | a "Quests and achievements" button on the landing (`packages/ui/src/screens/Landing.tsx:149-151`); the page `/quests/:day?` (`packages/app-web/src/App.tsx:25`, `pages/Quests.tsx`); the same sections on a player's page (`pages/Player.tsx:211-220`); the tutorial claim (`app-web/src/tutorial/TutorialClaim.tsx`) |
| Progress display | **not read** | **not read** | per task a line "count / total unit" and a `<progress>` bar, a "Completed <day>" badge, "Retired"; the achievements' points total; a "What counts" list of definitions (`components/Progress.tsx:19-188`); titles and descriptions off chain, keyed by id (`utils/quests-view.ts:7-25`) |
| Notifications | **not read** | **not read** | **none**: no toast or notice on completion (no `toast` or `notif` in `app-web/src` or `ui/src`); the page reads the indexer when visible, with a lag line |

### 1.6 What the benchmark already says

Even second hand, three differences shape the proposal:

1. **Both references pay something for quests, and it is a game, not a token**: Nums' `DailyFinisher`, Glitchbomb's
   reward game from `on_quest_claim`. Neither cited source shows a token minted by a quest.
2. **Both claim on chain** (Nums by a claim, Glitchbomb automatically), which needs per-player storage. Paved chose
   event mode because a report on every move is unaffordable on Starknet's cost model and v1 pays nothing.
3. **Glitchbomb's catalogue is about 9 times Paved's** (37 quests and 39 achievements against 4 and 9). Paved's
   breadth is the cheapest gap to close: most additions are owner calls on `Setup`, no class change (2.1).

## Part 2. Proposal for v2

### 2.1 Catalogue additions

Every addition is classed by **what drives it today**:

- **(A) definition only**: the task is already reported to the right component; `Setup`'s owner calls
  `define_quest` or `define_achievement`. No class change, no indexer change, client text only (`quests-view.ts`).
- **(B) indexer-credited**: computed by the indexer from events it already indexes (`GameOver`, `Purchased`,
  `Settled`), as On the Podium is (`quests.md:125-133`). No contract change; an indexer change (META) and a task id
  reserved in `constants.cairo` (a comment-level change, done with the next contract PR).
- **(C) indexer, new event**: needs the indexer to index an event the contracts already emit but it ignores today
  (`Scored`, ignored at `packages/indexer/src/events.ts:191`). No contract change.
- **(D) contract change**: a Challenge upgrade (`quests.cairo` lists, and maybe `GameState` bits: 12 free above the
  counters, `quests.md:414-416`), with gas measured against the P-22 guard (+1.5M on the closing move).
- **(X) not drivable on chain**.

Task ids 11 and up are new; 1 to 10 keep their meaning (ids are never reused, Q-10). Targets are first guesses, to
calibrate as in Q-4.

**Closings**

| Proposal | Kind | Exact task definition | Driver |
|---|---|---|---|
| Wonder of the day (quest) | daily | `WONDER_SCORED` (5) 1 | **(D)**: task 5 goes to the achievements only (`quests.cairo:85-96`); `quest_counts` gains task 5 (one entry, about 70k when non-zero). Or (C) |
| Weekly Forester (quest) | weekly | `FOREST_SCORED` (4) 5 in a week | **(A)**: task 4 is a quest task (`quests.cairo:74-82`) |
| Weekly Builder (quest) | weekly | `STRUCTURE_SCORED` (2) 30 in a week | **(A)** |
| Roadmaker / City Founder | daily or achievement | 11 `ROAD_SCORED`, 12 `CITY_SCORED`: one per `Scored` of category road (resp. city) | **(C)**: `Scored.category` (`contracts/src/events.cairo:57-64`); or **(D)**: split the 7-bit `structures` counter (bits) |
| Forester II, Pilgrim II, Grand Builder II | achievements | `FOREST_SCORED` 50; `WONDER_SCORED` 10; `BIG_STRUCTURE` 10 | **(A)**: tasks 4, 5, 6 are achievement tasks |
| Great City | achievement | 13 `HUGE_STRUCTURE`: a road or city scored with size >= 15 | **(C)** from `Scored.size`; **(D)** otherwise (a new counter) |

**Scores**

| Proposal | Kind | Exact task definition | Driver |
|---|---|---|---|
| High Roller II, III | achievements | `HIGH_SCORE` (7) 10; 25 | **(A)** |
| Sharp Day (quest) | daily | `HIGH_SCORE` (7) 1: one game of the day at >= 4,000 | **(D)**: task 7 goes to the achievements only; `quest_counts` gains it |
| Weekly Points (quest) | weekly | `POINTS` (3) 20,000 in a week | **(A)** |
| In the Money | achievement or daily | 14 `GAME_PAID`: a game whose `Settled.reward > 0` | **(B)**: `Settled` is indexed (`events.ts:183`) |
| Champion | achievement | `WIN` (9) 5: rank 1 of a closed day | **(B)**, as On the Podium (`quests.md:118-121`) |
| Clean Game | achievement | 15 `NO_DISCARD`: a finished game with 0 discards | **(D)**: `discarded` is in `GameState` but not in the tally (`quests.cairo:36-45`) |

**Streaks**

| Proposal | Kind | Exact task definition | Driver |
|---|---|---|---|
| Regular I, II, III | achievements | 16 `STREAK_DAYS`: the longest run of consecutive UTC days with at least one Challenge `GameOver` of the player; tiers 3, 7, 30 | **(B)**: `GameOver.day_id` and `player_id` are keys (`events.cairo:66-76`). As Nums' `Streak` (second hand) |
| Week Regular (quest) | weekly | `GAME_FINISHED` (1) on 5 distinct days of the week | **(B)**: "distinct days" is not a sum, so quiver's rule cannot express it; the indexer computes it |

**Modes**

| Proposal | Kind | Exact task definition | Driver |
|---|---|---|---|
| First Stone (exists) | achievement | `TUTORIAL_FINISHED` (10) 1 | the claim, unchecked (D-21, P-49 (2)) |
| Tutorial quests or tiers | | anything about the tutorial's play | **(X)**: the tutorial is off chain since D-21; only the unchecked claim exists |
| Training quests | | anything about Training | **(X)**: Training is off chain with no on-chain gain (D-22). A client-only list (browser storage, no value) is possible and is CLIENT's, never counted by the indexer |

**Challenge stakes**

| Proposal | Kind | Exact task definition | Driver |
|---|---|---|---|
| High Stakes | achievement | 17 `STAKED_GAME`: a finished game bought at stake >= 5 | **(B)**: `Purchased.stake` (`contracts/src/systems/economy.cairo:515-534`), joined to `GameOver` by `game_id` |
| Stake tiers by volume | achievement | 18 `STAKE_UNITS`: the sum of `stake` over finished games; tiers 50, 250 | **(B)** |

Stake quests reward spending. With no reward they are badges; with a token reward they would be a rebate on
spending and are not recommended (2.2).

**Meta**

| Proposal | Kind | Exact task definition | Driver |
|---|---|---|---|
| Daily Finisher (as Nums) | daily | every daily quest of the day complete | **(B)** in event mode (the indexer knows completions); on chain it needs storage mode and a hook (`quests.md:98-99`) |

**Recommendation (catalogue).** Ship a **v2a in event mode, definition only**: the (A) rows (two or three weekly
quests, the second tiers), then a **v2b** of (B) and (C) rows in the indexer (streaks, Champion, In the Money, High
Stakes, roads and cities apart), and keep (D) for one Challenge upgrade that bundles several tally changes (quests on
tasks 5 and 7, `NO_DISCARD`), measured once. (A) needs a weekly window check: quiver accepts any interval, the
indexer applies it generically, `Setup` checks only `start % 86,400 == 0`; a Monday start is a multiple of 86,400
congruent to 345,600 modulo 604,800 (1970-01-05 was a Monday). The client labels "Daily quests" today
(`Progress.tsx:68`, `:139`): it needs a "Weekly" heading. A test of the indexer with a weekly definition comes first.

### 2.2 Whether quests pay a reward (the owner's call)

**This is the owner's decision**: a reward touches PAVED's supply, the Vault, or D-10 ("minting restricted to the
game", "margin entirely to the Vault's beneficiaries", `economy.md:10-18`). The options:

| Option | What | Supply effect | Abuse risk | What it needs |
|---|---|---|---|---|
| **R0. None** (v1) | points and badges, display only | none | none: nothing to farm | nothing |
| **R1. PAVED minted from a quest budget** | e.g. N PAVED per completed daily, capped per day | **adds supply outside the settlement**: the supply factor `F = 2 - S/T` (`economy.md:73-74`) then mints less to every winning player, so a quest mint is paid by settlements, not created free. Whether a quest mint is "the game" in D-10's sense is the owner's to say | daily quests need a **paid** Challenge game (Training and the tutorial cannot report, D-21, D-22), so farming costs at least 2 USDC per account per day (`economy.md:13`); a reward above the expected loss of an entry makes multi-accounting profitable. Point Chaser and High Roller reward a predictable best game (Q-5) | `PavedToken`'s only minter is `Economy`, set once, admin cleared, token not upgradable (`token.cairo:4-5`, `:21-29`): the mint goes **through an `Economy` upgrade** (a mint path gated to `Setup`, a budget, a cap), storage mode for the rewarded quests, an audit |
| **R2. A share of the Vault** | pay quest players from the Vault's PAVED | no new supply; **lowers vPAVED holders' yield** (the Vault's part is theirs, D-10, P-56) | same as R1 | changes D-10; a Vault upgrade (P-56 made it upgradable) with an outflow the vPAVED rate must account for; an audit |
| **R3a. A free Challenge entry** (Glitchbomb's reward game) | a ticket for one game | **none by construction** if the free game burns nothing: the settlement mints `R x h x ...` with `R` the PAVED burned for that game (`economy.md:73`), so `R = 0` mints 0. To check: that a stake-0 game does not move the EMA mean (its weight is the stake, `economy.md:45`) | low: the ticket is worth a game, not a token; a free game cannot pay. Capped at one a day | storage mode (a ticket is granted on chain), a ticket counter per player, a Challenge path to spawn on a ticket; the leaderboard counts it like any game (to decide) |
| **R3b. Cosmetics** | a soulbound badge, a tile skin, a title | none | none on the economy; a bot farms badges of no value | Collection is soulbound already (`economy.md:49`); a badge needs a minter path in Collection, or stays an indexer-derived title shown by the client with no token at all |

**Recommendation (for the owner).** **R0 for v2**, with R3b as indexer-derived titles (no contract) if the owner wants
something visible now. If a reward with value is wanted, **R3a**, Glitchbomb's model (D-25 makes Glitchbomb the
reference), because it creates no PAVED and cannot be cashed out; then **R1** only with a hard budget and its
simulation in `sim.py`; **R2 is not recommended** (it reverses D-10's margin rule). Reverses this recommendation:
the owner asks for a token reward, or E4's playtests show that quests do not bring players back without one.

### 2.3 What a claim would need

| | Event mode (v1, recommended without a reward) | quiver storage mode | A smaller own design (estimate) |
|---|---|---|---|
| On chain | nothing per player; completion is the indexer's | the held list, per held quest a progress and a record slot; accept (at most 4 held), claim, `on_quest_complete`, `on_quest_claim` (`quests.md:226-231`) | one packed slot per (player, interval) in `Setup`: a bitmap of quests completed and claimed, and the running sums Point Chaser needs |
| Gas of the report | measured, about 70k per entry (`quests.md:421-422`) | **3.24M (slots exist) to 6.46M (slots created) L2 gas** at 4 held quests, up to 8.34M with a hook writing a slot (quiver's figures, `quests.md:231`): above the P-22 guard of +1.5M | **estimate**: one slot write per game over, about 0.45M when created (the slot figure of `quests.md:228`), less when it exists; to measure |
| Gas of the claim | none | not measured in this repository | one read, one write, the grant; to measure |
| Reward path | none possible on chain | the claim hook grants (R1, R3a) | same |
| Indexer | as today | index `QuestCompleted` and `QuestClaimed` (in `IGNORED`, `events.ts:195-197`), serve "claimable" and "claimed" | index the new event of the claim |
| Client | as today | a Claim button per completed quest, a pending transaction, a "claimed" badge; accept for held quests | a Claim button |
| Risk | none | a revert in the report must never stop a game over (Q-1); an audit (`quests.md:391-392`) | the same, and an own design to audit |

A fourth way, **a claim signed by the indexer** (the indexer attests a completion, a contract checks the signature),
keeps the game over cheap but makes the indexer a trusted signer of value: not recommended.

**Recommendation (claim).** No claim while there is no reward. When the owner chooses a reward, storage mode only for
the rewarded quests (a quest cannot mix modes: a rewarded quest is a new id, `quests.md:239-241`), and the smaller
own design measured against quiver's before choosing, since quiver's figures break the +1.5M guard.

### 2.4 The link to XP and meta-progression (the owner's)

The owner has named XP and meta-progression as a future goal. v2 can feed it without choosing it now:

- **Keep the task as the unit.** XP, whatever its formula, is a function of task counts over time. Every v2 task is
  either a quiver event (`QuestProgressed`, `AchievementProgressed`) or a pure function of indexed events
  (`GameOver`, `Purchased`, `Settled`, `Scored`), so a later XP can be **recomputed from the chain's history**, not
  only counted from its launch.
- **Do not call achievement points XP.** They are display only (`quests.md:103`); a rule that reads them would make
  every past definition a balance decision. If XP comes, it is its own derivation, versioned in the indexer.
- **Keep XP off chain until a rule reads it.** On chain XP is needed only if a contract gates something on it (an
  unlock, a stake cap). quiver announced per-(player, task) packed counters "for a later version" (`quests.md:362-364`):
  that is the on-chain path then, a request to Grim World through the Overseer (O-1).
- **Reserve, do not define.** Task ids 11 to 18 above are proposals; none of them encodes a level or a curve.

## For the PM

**CORE can decide or build within decided scope**

- v2a: the (A) definitions (weekly quests, second tiers) as `Setup` owner calls, with the client's texts (CLIENT) and
  a test of a weekly window in the indexer (META). No class change, no reward.
- Reserving task ids 11 to 18 in `constants.cairo` with the next contract PR.
- The (D) tally changes as one Challenge upgrade, measured against the +1.5M guard, if the PM wants those rows.

**Needs the PM**

- Which v2 rows ship, and the order v2a, v2b (indexer, META), (D).
- The (B) and (C) rows put credit in the indexer beyond On the Podium: a choice of where truth lives for badges.
- The benchmark's gaps: a thread with read access to the Nums and Glitchbomb clones (the refused commands are listed
  at the top), to replace the second-hand cells and fill the **not read** ones.

**The owner's**

- **Whether quests pay a reward**, and which (R0 to R3, 2.2): R1 and R2 touch PAVED's supply, the Vault and D-10.
  Recommendation: R0 now; R3a if a reward is wanted.
- **XP and meta-progression**: whether, when, and whether on chain (2.4). v2 locks nothing in.
