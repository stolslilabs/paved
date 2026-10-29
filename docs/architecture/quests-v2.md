# Quests and achievements v2: benchmark and options

> History note: `packages/app-web`, which this document names, was removed in P-70; see git history.

Documents only: no contract change. Brief: `docs/briefs/quests-v2-benchmark.md` (track CORE, the PM's go of
2026-10-14). v1 is `docs/architecture/quests.md` (the accepted list of P-22, the Setup contract of D-24/D-25), with
its indexer (`docs/architecture/indexer.md`, "As built (P7 indexer, quests and achievements)") and its client page.

**v2a: built in #423** (the (A) definitions, shipped by the fresh deployment: `quests.md`, "As built: v2a, definitions only").

## Sources and how they are cited

- **Nums** at commit `4f8f405`, cited `N:<path>:<line>` from the repository root.
- **Glitchbomb** at commit `5efcbce`, cited `GB:<path>:<line>` from the repository root.
- Both were read from an export of the clones at those commits (`git archive`): `contracts/`, `client/src/`, `docs/`
  and the root documents. The exports do not hold the Cartridge `quest` and `achievement` packages: Nums and Glitchbomb
  depend on them (`N:contracts/Scarb.toml:50-51`, `GB:contracts/Scarb.toml:16-33`), so how those packages store
  progress, compute an interval id on chain or check a claim is **not in the export**. Where that matters, the clients'
  mirror of the rule is cited instead.
- **Paved** at this branch's base (main `da07a9cc`), cited by path from the repository root.

## Part 1. Benchmark

### 1.1 Catalogue

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Model | Cartridge `quest` / `achievement` on Dojo. A task (a short-string id and a description) is the unit; a quest or an achievement is a target on one task | same | quiver 0.2.0 (`quiver_quest`, `quiver_achievement`), the same task model, in `Setup` (`contracts/src/systems/setup.cairo:127-135`) |
| Tasks | **22** (`N:contracts/src/elements/tasks/index.cairo:12-38`, ids `:107-135`): Filler, Power, Trigger, Master (defined, never used), Grinder, Claimer, Chainer I-III, Reference I-VII (place 21, 42, 404, 777, 911, 420, 69), Filler XVI-XVIII, Streaker I-III (`N:…/tasks/*.cairo:3-71`) | **88** (`GB:contracts/src/elements/tasks/index.cairo:11-114`, ids `:315-407`), in 12 groups: conqueror, scorer, multiplier, shopper, moonrock, composer, sequencer, brinker, loyalty, level, bag, puller (`GB:…/tasks/<group>.cairo`) | **10** (`contracts/src/constants.cairo:37-49`): 1 `GAME_FINISHED`, 2 `STRUCTURE_SCORED`, 3 `POINTS`, 4 `FOREST_SCORED`, 5 `WONDER_SCORED`, 6 `BIG_STRUCTURE` (size >= 8), 7 `HIGH_SCORE` (>= 4,000), 8 `PODIUM` (indexer), 9 `WIN` (unused since D-20), 10 `TUTORIAL_FINISHED` (claim) |
| Quests | **10** (`N:contracts/src/elements/quests/index.cairo:11`, `:19-31`): 3 Placer (Filler 20 / 30 / 40), 3 Power (4 / 6 / 8), 3 Trigger (6 / 9 / 12) (`N:…/quests/{placer,power,trigger}.cairo:6-94`), and **Compliance**, the daily finisher: complete 3 quests (`N:…/quests/finisher.cairo:5-31`) | **37** (`GB:contracts/src/elements/quests/index.cairo:11`, `:41-86`): five lists of 7 (Easy One, Easy Two, Medium One, Medium Two, Hard), e.g. Triple Take (`CLIMBER_3` 1), Warming Up (`LOYALTY` 3), Golden Parachute (`CASH_OUT_180` 1) (`GB:…/quests/*.cairo`), and two finishers: **Daily Grind** (3 quests) and **Clean Sweep** (5) (`GB:…/quests/finisher.cairo:19-75`) | **4** daily: Daily Run (`GAME_FINISHED` 1), Master Builder (`STRUCTURE_SCORED` 6), Into the Woods (`FOREST_SCORED` 1), Point Chaser (`POINTS` 3,000 summed over the day) (`quests.md:91-96`) |
| Achievements | **31** (`N:contracts/src/elements/achievements/index.cairo:8`, `:20-53`): 8 tiered groups of 3 (Claimer, Grinder, Streak, Chainer, Filler, Placer, Power, Trapper; e.g. Grinder at 100 / 500 / 1,000 games, `N:…/achievements/grinder.cairo:15-76`), and 7 **hidden** "Numbers" (`N:…/achievements/reference.cairo:15-176`); points 10 to 80 | **39** (`GB:contracts/src/elements/achievements/index.cairo:8`, `:20-70`), 9 groups, none hidden, points 15 to 100, 1,675 in all; tiers by volume, e.g. Loyalty at 500 / 1,000 / 2,500 / 5,000 / 10,000 games (`GB:…/achievements/loyalty.cairo:6-126`) | **9** (`quests.md:106-116`): First Stone, Settler I-III (1 / 10 / 50 games), Grand Builder, Forester (10), Pilgrimage, High Roller, On the Podium; points 10 to 50 |
| Kinds of task | per action (a slot filled, a power used, a trap), single-game feats (16 slots), volumes (games, tokens claimed), easter eggs | per action (orbs pulled), single-pull, single-level and single-game feats, end states (cash out with 1 health), volumes | per finished game only: counts of closings, the score, thresholds |

### 1.2 Windows

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Daily | each quest lasts one day in a **3-day interval** (`duration = ONE_DAY`, `interval = THREE_DAYS`), with starts 0, 1 or 2 days, so **3 quests are live each day**, one per family; the finisher has `duration = interval = ONE_DAY` (`N:…/quests/index.cairo:12-14`; the quest files above) | each quest lasts one day in a **7-day interval** with starts 0 to 6 days, so **5 are live each day** (2 easy, 2 medium, 1 hard) and the schedule repeats weekly; the finishers are always live (`GB:…/quests/index.cairo:16-36`) | every quest `start` a multiple of 86,400, `duration = interval = 86,400`: the 4 quests are the same every day (`quests.md:86-89`; `'Setup: quest not on UTC day'`, `setup.cairo:110`) |
| Weekly, other | none | none beyond the weekly rotation | none |
| Interval id | on chain in the package (not in export); the client mirrors it: active when `(now - start) % interval < duration`, id `floor((now - start) / interval)` (`N:client/src/models/quest.ts:481-500`) | same rule in the client (`GB:client/src/models/quest.ts:438-456`) | the same rule, applied **off chain** by the indexer to each event's block time (`indexer.md:149-151`); a game counts for the UTC day it ends in |
| Achievements | no window (`N:contracts/src/components/playable.cairo:59-68`) | no window (`GB:contracts/src/components/initializable.cairo:41-50`) | no window |

### 1.3 Rewards

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Which quests pay | **only the finisher** (`reward()` true for `DailyFinisher` only, `N:…/quests/index.cairo:79-84`); every quest's `rewards` metadata is empty | **only the two finishers** (`GB:…/quests/index.cairo:188-190`) | none (P-22 ruling 2, `quests.md:149-151`); the hooks are empty (`setup.cairo:151-164`) |
| What it pays | **one free game**: `on_quest_claim` calls `Play.mint(player, 1)`, a soulbound game NFT and a game at multiplier 1x, price 0 (`N:contracts/src/systems/play.cairo:160-200`) | **one free game per finisher**, so up to two a day: `Collection.reward(player, soulbound)` in a reserved id range, then a game at stake 1x, price 0, that does not progress the quests (`GB:contracts/src/systems/play.cairo:185-214`) | nothing |
| Does the free game pay tokens | **yes, newly minted NUMS**: at finish `Rewarder::amount(level, 1, slot_count, multiplier)` (`N:contracts/src/helpers/rewarder.cairo:90-94`), paid by `token.reward`, which mints (`N:contracts/src/components/playable.cairo:387`, `N:contracts/src/systems/token.cairo:117-120`); at 1x the supply and burn multipliers of paid games are not applied | **yes, newly minted GLITCH**: at finish `Rewarder::amount(moonrocks, stake)`, from 0 below 65 moon rocks to 1,000 GLITCH (`GB:contracts/src/helpers/rewarder.cairo:8-55`, `:108-113`), minted by `token.reward` (`GB:contracts/src/components/playable.cairo:658-661`, `GB:contracts/src/systems/token.cairo:113-119`); the free game also feeds the score EMA with weight 1 (`GB:…/playable.cairo:652-656`) | — |
| Budget, cap | no quest budget and no cap beyond one free game a day; the reward is new supply (`N:docs/pages/token/index.mdx:93`) | no budget or global cap; at most two free games a player a day, at most 1,000 GLITCH each | — |
| Who can mint | the game is minted by `Play`'s `CREATOR_ROLE` (Play itself and Setup, `N:…/play.cairo:114-117`, `:181`); NUMS by `MINTER_ROLE`, held by Play (`N:…/token.cairo:75-76`) | the game NFT by `MINTER_ROLE` held by Play (`GB:contracts/src/systems/collection.cairo:131`, `:273`); GLITCH by Play (`GB:…/token.cairo:72`) | PAVED has **one minter, `Economy`**, set once, the admin then cleared (`contracts/src/systems/token.cairo:4-5`, `:21-29`); `PavedToken` is not upgradable (P-42, P-56) |
| Achievements | pay nothing: hooks empty (`N:…/play.cairo:120-131`), `rewards` empty; points display only | pay nothing: hooks empty (`GB:…/play.cairo:131-142`, `GB:contracts/src/systems/setup.cairo:118-129`); points display only | points display only (`quests.md:103`) |

### 1.4 Claim flows

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Kind | **automatic**: `on_quest_complete` adds one to the finisher for every completed quest, and when the completed quest pays it calls `quest.claim` at once (`N:…/play.cairo:140-159`) | **automatic**, the same pattern (`GB:…/play.cairo:151-184`) | **event mode**: no completion and no claim on chain; `QuestCompleted` and `QuestClaimed` are declared, never emitted (`leaderboard.md:859`; ignored by the indexer, `packages/indexer/src/events.ts:195-197`). One claim: `claim_tutorial()`, idempotent, unchecked (`setup.cairo:306-315`) |
| Player claim entry point | none: only the internal layer is embedded (`N:…/play.cairo:60-61`); the client has `quest_claim` wrappers that match no contract entry point and are used nowhere (`N:client/src/hooks/actions.ts:314-367`) | none (`GB:…/play.cairo:9-25`, `:63-65`); quests that do not pay stay unclaimed | none for quests |
| Where progress is reported | **on every action**: `set` (place a number) reports Filler and Trigger to the quests and up to seven tasks to the achievements; `apply` (a power) reports Power (`N:contracts/src/components/playable.cairo:127-246`, `:278-340`) | **on every action**: `create`, every `pull`, `cash_out`, `enter`, `buy`, `exit` (`GB:contracts/src/components/playable.cairo:91-94`, `:176-560`) | **once per game over**, from an allowlisted reporter (Challenge), two `progress_many` (`setup.cairo:284-304`) |
| Per-player storage | the package's models: completion per (player, quest, interval) with `unclaimed`, advancement per (player, quest, task, interval) with a count (`N:contracts/Scarb.toml:24-33`; fields from `N:client/src/models/quest.ts:503-591`) | the same models (`GB:contracts/Scarb.toml:16-33`; `GB:contracts/src/tests/test_quest_rewards.cairo:57-112`) | none (the tutorial flag apart); definitions one slot each |
| Gas | not in export (Dojo appchain; Glitchbomb's quest reward runs on its appchain, `GB:…/play.cairo:196-201`) | not in export | about 70k L2 gas per reported entry (`quests.md:301-319`, `:421-422`); quiver storage mode measured at 3.24M to 6.46M per report (`quests.md:231`) |

### 1.5 Client surfaces

| | Nums | Glitchbomb | Paved v1 |
|---|---|---|---|
| Where | header icons for quests and achievements, a "Quests" item in the settings menu, a quest scene and an achievement scene on the home page (`N:client/src/components/containers/header.tsx:149-160`, `N:client/src/pages/index.tsx:540-562`) | header buttons opening a quest modal and an achievement modal (`GB:client/src/pages/index.tsx:636-679`) | a landing button (`packages/ui/src/screens/Landing.tsx:149-151`), the page `/quests/:day?` (`packages/app-web/src/App.tsx:25`), the same sections on a player's page (`pages/Player.tsx:211-220`), the tutorial claim (`app-web/src/tutorial/TutorialClaim.tsx`) |
| Progress display | a count of completed quests, a **countdown to the window's end**, cards with a bar and "count of total", struck through when done; the finisher hidden and shown as a **gift** ("FREE GAME 1x") (`N:client/src/components/scenes/quest.tsx:33-102`, `N:…/elements/quest-gift.tsx:24-66`, `N:…/elements/quest-card.tsx:37-111`); achievements "Earned" and "Remaining", hidden ones as "Hidden" (`N:client/src/components/containers/achievements.tsx:53-136`) | the same: count, countdown, cards with "count of total", finishers as gift nodes in the quest track (`GB:client/src/components/scenes/quest.tsx:69-116`, `GB:client/src/hooks/build-quest-nodes.ts:8-32`) | per task "count / total unit" and a bar, a "Completed <day>" badge, the points total, the list of definitions (`app-web/src/components/Progress.tsx:19-188`); no countdown |
| Notifications | **toasts** on quest completed, quest claimed, achievement (title and points) and free game, from `QuestCompleted` / `QuestClaimed` events less than 30 s old; a ping on new items (`N:client/src/hooks/toasters.tsx:97-214`, `N:client/src/hooks/notifications.ts:50-127`) | **toasts**: quest completed and claimed, achievement, "Free Game Added" (`GB:client/src/components/modules/quest-notifier.tsx:29-83`, `…/free-game-notifier.tsx:24-62`, `…/achievement-notifier.tsx:16-46`) | **none** |
| Data source | Torii: the package's models and events, with live subscriptions (`N:client/src/context/quests.tsx:174-277`) | Torii, the same (`GB:client/src/contexts/quests.tsx:256-273`) | Paved's indexer, read when the page is visible |

### 1.6 What the benchmark says

1. **Both references pay quests with a game, and that game mints tokens.** The free game of Nums and of Glitchbomb
   plays at 1x, costs nothing, and pays newly minted NUMS or GLITCH by the normal reward table, with no quest budget.
   Only the finisher pays (one a day in Nums, two in Glitchbomb). The single quests pay nothing.
2. **Both claim automatically**, inside the completion hook, with no player claim and no claim button. That needs
   the package's per-player storage, and progress reported on every action, which Dojo's cost model allows and
   Starknet's does not (Paved's report is once per game).
3. **Breadth comes from rotation**, not only from a long list: 3 live quests a day from 10 (Nums), 5 from 37
   (Glitchbomb), by start offsets inside a multi-day interval.
4. **Toasts and a countdown** are the client surfaces Paved lacks.

## Part 2. Proposal for v2

### 2.1 Catalogue additions

Every addition is classed by **what drives it today**:

- **(A) definition only**: the task is already reported to the right component; `Setup`'s owner calls
  `define_quest` or `define_achievement`. No class change, no indexer change, client text only (`quests-view.ts`).
- **(B) indexer-credited**: computed by the indexer from events it already indexes (`GameOver`, `Purchased`,
  `Settled`), as On the Podium is (`quests.md:125-133`). No contract change; an indexer change (META) and a task id
  reserved in `constants.cairo` (with the next contract PR).
- **(C) indexer, new event**: the indexer indexes an event the contracts already emit but it ignores (`Scored`,
  `packages/indexer/src/events.ts:191`). No contract change.
- **(D) contract change**: a Challenge upgrade (`quests.cairo` lists, maybe `GameState` bits: 12 free above the
  counters, `quests.md:414-416`), measured against the P-22 guard (+1.5M on the closing move).
- **(X) not drivable on chain**.

Task ids 11 and up are new; 1 to 10 keep their meaning (Q-10). Targets are first guesses, to calibrate (Q-4).

**Rotation (new from the benchmark)**

| Proposal | Kind | Exact definition | Driver |
|---|---|---|---|
| A rotating daily set | daily | quests on tasks 2, 3, 4 at several targets, each with `duration` 86,400, `interval` k x 86,400 and `start` offset by 0 to k-1 days, so a different set is live each day (Glitchbomb's 7-day scheme) | **(A)**: `Setup` checks only `start % 86,400 == 0` (`setup.cairo:110`), and the indexer's rule is generic (`indexer.md:149-151`). The client lists the quests "active at some second" of a day (`indexer.md:529-531`): to test with an offset definition |

**Closings**

| Proposal | Kind | Exact definition | Driver |
|---|---|---|---|
| Wonder of the day | daily | `WONDER_SCORED` (5) 1 | **(D)**: task 5 goes to the achievements only (`quests.cairo:85-96`); `quest_counts` gains it. Or (C) |
| Weekly Forester, Weekly Builder | weekly | `FOREST_SCORED` (4) 5; `STRUCTURE_SCORED` (2) 30, in a week | **(A)**: quest tasks (`quests.cairo:74-82`) |
| Roadmaker, City Founder | daily or achievement | 11 `ROAD_SCORED`, 12 `CITY_SCORED`: one per `Scored` of category road (resp. city) | **(C)** from `Scored.category` (`contracts/src/events.cairo:57-64`); or **(D)** |
| Forester II, Pilgrim II, Grand Builder II | achievements | `FOREST_SCORED` 50; `WONDER_SCORED` 10; `BIG_STRUCTURE` 10 | **(A)** |
| Great City | achievement | 13 `HUGE_STRUCTURE`: a road or city of size >= 15 | **(C)** from `Scored.size`; **(D)** otherwise |

**Scores**

| Proposal | Kind | Exact definition | Driver |
|---|---|---|---|
| High Roller II, III | achievements | `HIGH_SCORE` (7) 10; 25 | **(A)** |
| Sharp Day | daily | `HIGH_SCORE` (7) 1 | **(D)**: task 7 goes to the achievements only |
| Weekly Points | weekly | `POINTS` (3) 20,000 in a week | **(A)** |
| In the Money | achievement or daily | 14 `GAME_PAID`: a game whose `Settled.reward > 0` | **(B)** (`events.ts:183`) |
| Champion | achievement | `WIN` (9) 5: rank 1 of a closed day | **(B)**, as On the Podium |
| Clean Game | achievement | 15 `NO_DISCARD`: a finished game with 0 discards | **(D)**: `discarded` is not in the tally (`quests.cairo:36-45`) |

**Volumes (Nums' Grinder, Glitchbomb's Loyalty)**

| Proposal | Kind | Exact definition | Driver |
|---|---|---|---|
| Settler IV, V | achievements | `GAME_FINISHED` (1) 250; 1,000 | **(A)** |

**Streaks**

| Proposal | Kind | Exact definition | Driver |
|---|---|---|---|
| Regular I, II, III | achievements | 16 `STREAK_DAYS`: the longest run of consecutive UTC days with a Challenge `GameOver` of the player; 3, 7, 30 | **(B)** from `GameOver.day_id` (`events.cairo:66-76`). Nums' "Streak" is a run of numbers in a game, not of days |
| Week Regular | weekly | `GAME_FINISHED` on 5 distinct days of a week | **(B)**: not a sum, so not quiver's rule |

**Modes**

| Proposal | Kind | Exact definition | Driver |
|---|---|---|---|
| First Stone (exists) | achievement | `TUTORIAL_FINISHED` (10) 1 | the claim, unchecked (D-21, P-49 (2)) |
| Tutorial quests or tiers | | the tutorial's play | **(X)**: off chain since D-21 |
| Training quests | | Training's play | **(X)**: off chain, no on-chain gain (D-22). A client-only list (browser storage, no value) is CLIENT's, never counted by the indexer |

**Challenge stakes**

| Proposal | Kind | Exact definition | Driver |
|---|---|---|---|
| High Stakes | achievement | 17 `STAKED_GAME`: a finished game bought at stake >= 5 | **(B)**: `Purchased.stake` (`contracts/src/systems/economy.cairo:515-534`) joined to `GameOver` by `game_id` |
| Stake volume | achievement | 18 `STAKE_UNITS`: the sum of `stake` over finished games; 50, 250 | **(B)** |

Stake tasks reward spending: badges only, never a token reward (2.2).

**Meta**

| Proposal | Kind | Exact definition | Driver |
|---|---|---|---|
| Daily Finisher (both references) | daily | complete 3 of the day's quests | **(B)** in event mode (the indexer knows completions); on chain it needs storage mode and a completion hook, as in both references (`N:…/play.cairo:140-159`, `GB:…/play.cairo:151-184`) |

**Hidden achievements** (Nums' "Numbers", `N:…/achievements/reference.cairo:15-176`) need no contract: the title is
off chain, so the client can hide one until it is reached.

**Recommendation (catalogue).** **v2a in event mode, definitions only**: the rotation, two or three weekly quests,
the higher tiers; then **v2b** in the indexer (streaks, Champion, In the Money, stake badges, roads and cities apart,
a finisher shown as a badge); and **(D)** as one Challenge upgrade that bundles the tally changes (tasks 5 and 7 to the
quests, `NO_DISCARD`), measured once. The client adds a "Weekly" heading (`Progress.tsx:68`, `:139`), a countdown
and completion toasts, the two surfaces both references have. Changed by the benchmark: the rotation and the
client's countdown and toasts are new.

### 2.2 Whether quests pay a reward (the owner's call)

**This is the owner's decision**: a reward touches PAVED's supply, the Vault, or D-10 ("minting restricted to the
game", "margin entirely to the Vault's beneficiaries", `economy.md:10-18`).

| Option | What | Supply effect | Abuse risk | What it needs |
|---|---|---|---|---|
| **R0. None** (v1) | points and badges, display only | none | none | nothing |
| **R1. PAVED from a quest budget** | N PAVED per completed quest, capped | new supply outside the settlement; the supply factor `F = 2 - S/T` (`economy.md:73-74`) then mints less to every winner | daily quests need a **paid** Challenge game (Training and the tutorial cannot report), so farming costs at least 2 USDC per account a day (`economy.md:13`); a reward above an entry's expected loss makes multi-accounting pay; Point Chaser and High Roller reward a predictable best game (Q-5) | `PavedToken`'s only minter is `Economy`, set once, token not upgradable (`token.cairo:4-5`, `:21-29`): the mint goes **through an `Economy` upgrade**, storage mode for the rewarded quests, an audit |
| **R2. A share of the Vault** | quest players paid from the Vault's PAVED | no new supply; lowers vPAVED holders' yield | as R1 | reverses D-10's margin rule; a Vault upgrade; an audit |
| **R3a. A free game that pays (Nums, Glitchbomb)** | the finisher grants one free Challenge game at stake 1, which settles like any game | **new PAVED with no burn**: Paved's settlement mints `R x h(score / mean) x boost x F`, where `R` is the PAVED burned for the game (`economy.md:73`), so a free game needs a nominal `R` (for example a stake-1 burn quote), at most `H x R` with `H = 5`. Both references pay this way, with no budget (1.3) | bounded per player (one or two a day), but a free game that can pay is worth farming by many accounts; each account still pays at least one entry a day to complete the quests | storage mode and a completion hook in `Setup` that grants a ticket; a Challenge path to spawn on a ticket and an `Economy` settlement with a nominal `R` (an `Economy` and a Challenge upgrade); whether the free game feeds the mean (Glitchbomb's does, weight 1); an audit |
| **R3b. A free game that does not pay** | the same ticket, settled with `R = 0`: it mints nothing (`economy.md:73`) | none | none on the economy: a free play has no cash value | storage mode, the ticket, the spawn path; `Economy` unchanged if a stake-0 game settles to 0 (to check, and that it does not move the mean, `economy.md:45`) |
| **R3c. Cosmetics** | a badge, a title, a tile skin | none | none on the economy | indexer-derived titles shown by the client (no contract), or a minter path in the soulbound `Collection` |

**Recommendation (for the owner).** **R0 for v2**, with R3c as indexer-derived titles if something visible is wanted
now. If a reward with value is wanted, **R3a is the references' model** and the one D-25 points to, but it is a mint:
it needs a cap, its simulation in `sim.py` (free games added to the 200-a-day run), and the owner's reading of D-10.
R3b is the no-supply variant, at the price of a reward with no value. R1 is a direct mint and R2 reverses D-10: not
recommended.

**What changed against the first draft of this document.** It said that a free entry, "Glitchbomb's model", mints no
PAVED. That holds for Paved's settlement only if the free game burns nothing, and then the game pays nothing. The
references' free game **does** mint (1.3): so the free game is now two options, R3a (the references', a bounded mint)
and R3b (no mint, no value), and the recommendation names R3a as a mint that needs a cap and a simulation, not a
supply-neutral reward.

### 2.3 What a claim would need

| | Event mode (v1) | quiver storage mode | A smaller own design (estimate) |
|---|---|---|---|
| On chain | nothing per player | held list, per held quest a progress and a record slot; accept (at most 4 held), claim, `on_quest_complete`, `on_quest_claim` (`quests.md:226-231`) | one packed slot per (player, interval) in `Setup`: completed and claimed bits, and the running sums Point Chaser needs |
| Gas of the report | about 70k per entry | **3.24M to 6.46M L2 gas** at 4 held, up to 8.34M with a hook writing a slot (`quests.md:231`): above the +1.5M guard | **estimate**: one slot write per game over, about 0.45M when created (`quests.md:228`); to measure |
| Claim | none | automatic in the hook (as both references) or by the player | automatic, in the report |
| Indexer | as today | index `QuestCompleted` and `QuestClaimed` (`events.ts:195-197`) | index the new event |
| Client | as today | a toast on completion and on the reward; no claim button if the claim is automatic | the same |
| Risk | none | a revert in the report must never stop a game over (Q-1); an audit | the same, and an own design to audit |

A claim **signed by the indexer** keeps the game over cheap but makes the indexer a trusted signer of value: not
recommended.

**Recommendation (claim).** No claim while there is no reward. With a reward, storage mode only for the rewarded
quest, which is the finisher, as in both references (a quest cannot mix modes: a new id, `quests.md:239-241`).
The claim is **automatic in the completion hook**, as in Nums and Glitchbomb, so there is no claim button; and the
smaller own design is measured against quiver's first, since quiver's figures break the guard. Changed by the
benchmark: the first draft proposed a Claim button; both references claim automatically.

### 2.4 The link to XP and meta-progression (the owner's)

Neither reference has XP: achievement points are display only in both (1.3). v2 can feed a future XP without
choosing it:

- **Keep the task as the unit.** Every v2 task is a quiver event or a pure function of indexed events, so an XP can
  be **recomputed from the chain's history**.
- **Do not call achievement points XP.** A rule that reads them would turn every past definition into a balance
  decision. If XP comes, it is its own derivation, versioned in the indexer.
- **Keep XP off chain until a rule reads it.** On chain XP is needed only if a contract gates on it; quiver announced
  per-(player, task) counters "for a later version" (`quests.md:362-364`), a request to Grim World (O-1).
- **Reserve, do not define.** Task ids 11 to 18 are proposals; none encodes a level or a curve.

## For the PM

**CORE can decide or build within decided scope**

- v2a: the (A) definitions (the rotation, weekly quests, higher tiers) as `Setup` owner calls, with the client's texts
  (CLIENT) and a test of offset and weekly windows in the indexer (META). No class change, no reward.
- Ruled by the PM on 2026-10-14: **four dailies a day**, Daily Run plus the three rotating ones; v1's quests 2 to 4 are not defined by the fresh deployment and their ids stay unused (`quests.md`, "Four dailies a day"). Revised by the owner below (2026-10-28, #869).
- Ruled by the owner on 2026-10-28 (#869, the fourth review #858): **five dailies a day, two milestones (3: 10, 5: 15)**.
  - Five dailies: Daily Run plus four rotating ones (#869 open point 2's default: one more family in the rotation). In the mock
    (`packages/app/src/data/mock/dailies.ts`, added by the mock's indexer overlay) the fourth family is `GAME_FINISHED`
    2 / 3 / 4, ids 17 to 19, offsets 0 / 1 / 2 days in the same 3-day interval; the contracts' definitions and ids are #738's.
  - **A daily pays nothing on its own**, and **the day has no "all done" bonus** (`QUEST_BONUS_COBBLES` keeps only the
    week's 60). The day pays at two milestones instead: **3 dailies done give 10 Cobbles, 5 give 15**, 25 a day in all, each
    claimed once a UTC day with a tap once reached (#869 open point 3's default).
  - The rules are game-core's (`packages/game-core/src/rules/quests.ts`: `DAILY_QUESTS`, `DAILY_MILESTONES`,
    `dailyMilestoneRefusal`, `dailyMilestoneStates`); the mock ledger serves the read (`dailyMilestones`) and the claim
    (`claimDailyMilestone(day, step)`, refused until the day's dailies done reach the milestone) until the contracts have
    them (#738).
  - Unchanged: the weekly quests (their Cobbles and the week's bonus of 60, #869 open point 1's default) and the lifetime
    quests' Cobbles.
- Reserving task ids 11 to 18 in `constants.cairo` with the next contract PR.
- The (D) tally changes as one Challenge upgrade, measured against the +1.5M guard, if the PM wants those rows.

**Needs the PM**

- Which v2 rows ship, and the order v2a, v2b (META), (D); the client's toasts and countdown (CLIENT).
- The (B) and (C) rows put credit in the indexer beyond On the Podium: where truth lives for badges.

**The owner's**

- **Whether quests pay a reward**, and which (R0 to R3c, 2.2). R1, R2 and R3a touch PAVED's supply, the Vault or
  D-10; R3a is the references' model and is a mint. Recommendation: R0 now; if a reward is wanted, R3a with a cap and
  a simulation, or R3b for a reward with no supply effect.
- **XP and meta-progression**: whether, when, and whether on chain (2.4). v2 locks nothing in.
