# Story mode on chain (#546, #548, design and as built)

Track CORE's Cairo architecture of Story mode, from the owner's amendments on #546 (2026-10-19, campaigns; amendment 2, level
counts) and the owner's decisions on #548 (2026-10-19, Cobbles per star, levels in storage, unpermissioned verification).
Nothing is deployed and nothing is wired to the client: the client plays Story mode on the device first (#546, PVD-38
STORY-CAMPAIGNS); the wiring task adds the end screen's call and the indexer's tables later (section 9).

Code: `contracts/src/systems/story.cairo` (the `Story` system), `ISetupStory::credit_story` in
`contracts/src/systems/setup.cairo` (the payment), tests `contracts/src/tests/story.cairo`.

## 1. Summary

- **A new system, `Story`**, holds the campaigns, the levels, the players' stars and best scores, and replays the runs. It is
  ownable and upgradeable like `Challenge` and `Setup`. It embeds the engine `Challenge` plays (one copy of the move code),
  so it could not go in `Setup` (P-64) nor in `Challenge` (79 % of the CASM cap already).
- **The levels are in storage**, keyed by campaign id and level id, set by the owner (`set_campaign`, `set_level`) and
  correctable or extendable later by the same calls. Nothing hard-codes a level count: a campaign stores its own (1 to 64).
- **A run is submitted whole at its end, in one transaction, free and unpermissioned**: `submit_run(campaign_id,
  level_index, moves)` by any account for itself, each move `{ discard, orientation, x, y }`: the shape the client records
  (PVD-38, #575, `StorySubmission` in `packages/game-core/src/story/progress.ts`). The chain replays the moves on the level's fixed deck, rejects an illegal move, scores
  the run, derives the stars, keeps the best, and pays the stars newly gained.
- **Cobbles: 5, 10 and 15 for the first, second and third star of a level** (30 per level, 1,500 over 50 levels), paid once
  per star, level and account, on `Setup`'s existing ledger (`accounts`, `CobblesClaimed` with a new `kind` 3). No second
  ledger.
- **Measured** (VPS, test profile): one submission of a 38-tile level costs **160,617,110 L2 gas**, of the whole deck (72
  tiles) **322,189,372**: 14.5 % and 29.0 % of the 1.11 x 10^9 a transaction may use. `Story` is **58,650 CASM felts, 71.6 %**
  of the cap; `Setup` goes from 38,722 to **39,861 CASM, 48.7 %** (under P-64's 50 % review point: no split).

## 2. Models and storage

All of it is `Story`'s storage, packed as the other systems pack theirs (`docs/architecture/native-storage.md`): one felt per
key where it fits, fields at fixed bit offsets.

| Model | Key | Value (bits) | Written by |
|---|---|---|---|
| Campaign | `campaign_id: u8` | `level_count` [0, 8) · `unlock_average` [8, 16) | `set_campaign` |
| Level header | `(campaign_id, level_id)` | plan count [0, 8) · placed count [8, 16) · target `u32` [16, 48); the starter tile in the high half [128, 208) | `set_level` |
| Level plans | `(campaign_id, level_id, page: u8)` | 31 plan codes per page, a byte each, the first drawn in the lowest byte | `set_level` |
| Level placed tiles | `(campaign_id, level_id, index: u8)` | plan [0, 8) · orientation [8, 16) · x [16, 48) · y [48, 80) | `set_level` |
| Player progress | `(player_id, campaign_id)` | **2 bits per level**: level `l`'s best stars at bits `2(l - 1)`, in the low 128 bits (64 levels); their sum `u16` in the high half | `submit_run` |
| Best score | `(player_id, campaign_id, level_id)` | `u32` | `submit_run` |
| `setup` | | the `Setup` that pays | constructor, `set_setup` |

- **Campaign**: its number of levels (1 to `MAX_LEVELS` = 64) and its unlock rule, `unlock_average`: the stars per level the
  player must hold over every level of the campaigns before it (the owner's rule is 2). Campaigns are numbered from 1 with
  no gap (`set_campaign` refuses `c` unless `c - 1` exists). `level_count` 0 reads as "no campaign".
- **Level**: the plans drawn after the starter, in draw order (1 to `MAX_TILES` = 72: the whole base deck is 71 after the
  starter's card), the starter tile, up to `MAX_PLACED` = 16 tiles written before the first draw (Tutorial level 10 places 5
  around its wonder), and the **target**, the 3-star score: the optimum for a solved deck, the best known score for a long
  one (the client plan's rule; the owner raises it with `set_level` when a better line is found). A level never set has
  target 0 and refuses runs (`'Story: no level'`).
- **Coordinates** are the game's: the usual starter, `RFFFRFCFR` facing South, is at (`CENTER`, `CENTER`) =
  (2,147,483,647, 2,147,483,647); the client plan writes them relative to it (`x + CENTER`). Plans and orientations are the
  codes of `types/plan.cairo` (1 `CCCCCCCCC` to 19 `WFFFFFFFR`) and `types/orientation.cairo` (1 North to 4 West).
- **The games** the runs are replayed in live in `PavedStorage` (`paved::store`, the node `selector!("paved")`), in
  `Story`'s own storage, one new game id per run (`game_count`); `Challenge`'s games are untouched.

Sizes: the 50 levels planned take about 50 x 3 to 4 slots (header, 1 to 3 plan pages, placed tiles where any); a player
takes one slot per campaign played and one per level played.

## 3. The owner's calls (the initialisation phase, and corrections later)

```
set_campaign(campaign_id: u8, level_count: u8, unlock_average: u8)            // CampaignSet
set_level(campaign_id: u8, level_id: u8, plans: Span<u8>, starter: StoryTile,
          placed: Span<StoryTile>, target: u32)                                // LevelSet
set_setup(setup: ContractAddress)                                              // SetupSet
StoryTile { plan: u8, orientation: u8, x: u32, y: u32 }
```

- Owner only (`'Ownable: caller is not owner'`), checked: the campaign exists, `level_id` in 1 to its `level_count`, 1 to
  72 plans, each a real plan code (`'Story: invalid plan'`), tiles with an orientation 1 to 4 and a position whose 8
  neighbours fit in `u32`, placed tiles on distinct positions and not on the starter (`'Story: invalid tile'`), a non-zero
  target. The edges of the placed tiles are not checked against each other or the starter (a written board, as the
  client's `placed` and the Cairo tests write them): the level's author makes them fit, and the parity test of the
  wiring task replays every level.
- **Correction**: `set_level` again rewrites the level (its plans, starter, placed tiles, target); `set_campaign` again
  changes a campaign's count or rule (a lower count makes the levels above it unplayable; their stars stay held). A
  player's best stars and best score are kept through a correction: **a star paid stays paid**, and a later run is judged
  against the new definition (a lower target can make a replay gain stars; a higher one never takes a star back).
- **Initialisation**: `scripts/deploy.sh`'s fresh path sets the Tutorial campaign (11 levels, rule 2) from the plan
  (`FRESH_STORY_CAMPAIGNS`, `FRESH_STORY_LEVELS`, section 8). The other campaigns are added when the client plan has them.

## 4. The submission

```
submit_run(campaign_id: u8, level_index: u8, moves: Span<StoryMove>) -> u8     // RunSubmitted, the run's stars
StoryMove { discard: bool, orientation: u8, x: u32, y: u32 }
```

**The payload**, named as the client names it (PVD-38, #575: `submit_run(campaign_id, level_index, moves)`, each move
`{ discard, orientation, x, y }`):

- `campaign_id`: the campaign's number, from 1.
- `level_index`: the level's index in its campaign, from 1: the `level_id` of `set_level` and of the views.
- `moves`: **one move per drawn tile, in draw order**. `discard` true: the tile is discarded (`orientation`, `x` and `y` are
  ignored, 0 by convention). `discard` false: the tile is built with `orientation` (1 North, 2 East, 3 South, 4 West) at
  `(x, y)`, the game's absolute coordinates (the starter at `CENTER`, `CENTER`), exactly as `Challenge.build(game_id,
  orientation, x, y)` takes them. The run is complete: `moves.len()` equals the level's plan count (`'Story: invalid moves'`
  otherwise).

Calldata: 3 + 4 x tiles felts (291 for the whole deck; the limit is 5,000).

The replay (`Story::replay`), in a new game of `Story`'s storage, with no random draw:

1. The starter is written as tile 1 (from constants, `placement::place_starter`, when it is the usual one; otherwise
   placed on the structure state like any written tile), then the placed tiles from id 200 (`PLACED_ID`, the client's
   `PREPLACED_ID`), placed without a move: nothing checked, nothing scored (`Store::set_tile`, `place_alone`).
2. Each plan of the deck is drawn in order (tile ids 2, 3, ...) and its move applied as `PlayableComponent` does: a discard
   takes `DISCARD_POINTS` (50, at most the score); a build checks the orientation (`'Story: invalid orientation'` outside 1
   to 4), the position (`'Story: invalid position'`: 0 or `u32::MAX` on an axis), that it is free (`'Tile: already exists'`), that it has a side neighbour (`'Tile: no
   neighbors'`) and that every facing edge matches (`'Tile: cannot place'`), then places the tile on the structure state
   (`placement::place_move`) and, when a structure closes, assesses it (`Game::assess`, solo: every structure scores for
   the player) and flushes the pages.
3. The score is the game's at the end. The tests replay the client engine's lines on chain and get the client's scores: 321,
   788 and 900 on three Tutorial levels, **5,629 on a 38-tile deck and 16,546 on the whole deck** (the decks and lines are
   the client engine's, `packages/game-core/src/engine/game.ts`, deck `story`).

Then, in order: the best score is kept; the stars of the run (section 5) are compared with the stars held; when higher, the
progress word gets the new stars and its sum, and **`Setup.credit_story` pays the stars gained** (section 6); `RunSubmitted`
is emitted.

```
RunSubmitted { #[key] player_id, #[key] campaign_id, #[key] level_id, game_id: u32, score: u32,
               stars: u8, best_stars: u8, gained: u8, cobbles: u32 }
```

`stars` is the run's, `best_stars` the player's after it, `gained` the stars paid now, `cobbles` their sum. The engine's own
`Scored` events of the replayed game are emitted too (from `Story`), as a Challenge move emits them.

## 5. Stars and locks: what the chain enforces

| Rule | Where | How |
|---|---|---|
| 1 star: the run is finished | chain | every accepted run is complete (one move per drawn tile) |
| 2 stars: score >= 70 % of the target, rounded up | chain | `score x 100 >= target x 70` (the same as `score >= ceil(0.7 x target)` for an integer score) |
| 3 stars: score >= the target | chain | |
| The best stars and score are kept | chain | 2 bits per level, the best score per level |
| A level is locked until the one before it is finished | chain | `'Story: level locked'`: level `l > 1` needs 1 star on `l - 1` |
| A campaign unlocks on stars | chain, at its first level | `'Story: campaign locked'`: the stars held over the levels the campaigns before it have now (levels 1 to their current `level_count`: the stars of a level the owner removed do not count) >= `unlock_average` x their level count. Checked on level 1 only, and not when the player has finished level 1 already: once open, a campaign stays open to them (its first level and the levels after it), even if the owner adds levels before it later |
| Unknown campaign or level | chain | `'Story: invalid campaign'`, `'Story: invalid level'`, `'Story: no level'` |
| What the screens show (locks, stars, the next level, the coach marks) | client | from the device's progress first, from `Story`'s views once wired; the client applies the same rules so a run it lets the player start is accepted |
| Which levels exist, their decks and targets | owner, on chain | the client's plan and the chain's levels are kept equal by the deploy table (section 8) and, later, by the wiring task's check |

The thresholds at the boundary, tested: a run of 321 against a target of 458 is 2 stars (70 % of 458 is 320.6, rounded up
321), against 459 it is 1 star (321.3, rounded up 322).

## 6. The Cobble credit

`Setup` gains one entry point, for an allowlisted reporter (`Story` is allowed with `set_reporter`, as `Challenge` is):

```
credit_story(player_id: felt252, campaign_id: u8, level_id: u8, paid: u8, stars: u8) -> u32
```

It credits stars `paid + 1` to `stars` (`paid < stars <= 3`, `'Setup: invalid stars'` otherwise), star `k` worth `k x 5`
(`STAR_COBBLES`): 5, 10, 15. One write of the player's `Account`, and **one `CobblesClaimed` per star**:

```
CobblesClaimed { player_id, kind: 3, id: (campaign_id << 8) | level_id, period: <the star, 1 to 3>, cobbles, balance }
```

- **One payment per star, per level, per account**: `Story` pays only the stars above the best it holds for the player and
  level, and the best never falls. The claim's key `(player, kind 3, level, star)` is unique on the ledger, as the
  indexer's `cobble_claims` requires (it halts on a second claim of a key).
- **Trust**: `Setup` trusts the reporter for whom and for which stars, as it trusts `Challenge` for its reports
  (`docs/architecture/quests.md`). `Story` names only the caller of `submit_run` and only stars its replay computed.
- **The emergency stop**: `Setup`'s owner revokes `Story` (`set_reporter(Story, false)`): every run that would gain a star
  then reverts (`'Quest: not reporter'`); runs that gain nothing still go through. No pause is needed on `Story` itself: it
  takes no money.
- Value: 30 Cobbles per level at most, 1,500 over the 50 levels planned. A star costs the player one free transaction of
  about 0.16 billion L2 gas on a 38-tile level; farming is bounded by the 3 stars per level and account.

## 7. Gas and size

Measured on the VPS (2026-10-19, scarb 2.20.1, snforge 0.64.0, test profile, `contracts/src/tests/story.cairo`): the L2 gas
of the `submit_run` call alone.

| Run | Tiles | Built, discarded | Score | L2 gas | Of 1.11 x 10^9 |
|---|---:|---|---:|---:|---:|
| 38-tile level (a greedy line on a Simple draw), 3 stars paid | 38 | 36, 1 | 5,629 | **160,617,110** | 14.5 % |
| The whole deck (a shuffle of the 72 cards), 3 stars paid | 72 | 71, 0 | 16,546 | **322,189,372** | 29.0 % |

`test_story_gas_submit_38` fails above 168,561,729 (160,534,980, measured before the campaign-lock fix of review 1, + 5 %). About 4.3M L2 gas per drawn tile, the cost of a
Challenge move without its game-state writes (a Challenge build is 4.8 to 18.7M, `contracts/tests/gas.cairo`), plus the
level's reads and the credit (three claims). The release code the network runs is cheaper (no `inlining-strategy =
"avoid"`).

Class sizes (`scripts/class-sizes.sh`, release, CASM is the binding cap of 81,920 felts):

| Class | Sierra | CASM | Of the cap | Before |
|---|---:|---:|---:|---|
| `Story` (new) | 25,656 | 58,650 | 71.6 % | |
| `Setup` | 18,024 | 39,861 | 48.7 % | 17,534 / 38,722, 47.3 % on main (2179cb2) |
| `Challenge` | 29,831 | 64,826 | 79.1 % | unchanged |

**P-64**: the projected share of `Setup` was about 48 % (one reporter-only entry point and a loop of three events, about
1,000 CASM felts); measured 48.7 %, under the 50 % review point, so no `Shop` split. `Story` has 23,270 felts of margin
for the views and the indexer's needs of the wiring task.

## 8. Deployment (fresh path), not run

`scripts/deploy.sh`'s fresh path (D-27) declares and deploys `Story(owner, Setup)` after `Collection`, adds
`Setup.set_reporter(Story, true)` to the wiring multicall, then sets the campaigns and levels of `FRESH_STORY_CAMPAIGNS` and
`FRESH_STORY_LEVELS` in one multicall of what `Story` lacks (`story_tx`), each read back through the views `campaign` and
`level`; the smoke reads `owner()`, `setup()`, `Setup.is_reporter(Story)` and every level again, and the deployment file
gains `contracts.Story`. The table holds the Tutorial campaign of `packages/game-core/src/story/plan.ts` at 2179cb2 (11
levels, their decks, level 10's placed tiles, the optimum as target). **No deployment was run**: the owner said no new
deployment for now; the wiring task runs it with the client's campaigns in the table.

## 9. Later: the wiring

- **Client end screen**: after the last tile, the client sends `Story.submit_run(campaign_id, level_index, moves)` with the
  run its device progress keeps (`StorySubmission`, the shape above), then reads
  `stars`, `progress` and `best_score` (or the indexer) to replace the device's progress.
- **Indexer**: it follows `Setup`, whose `CobblesClaimed` of kind 3 it decodes since this change (the running balance stays
  right; the per-day claims list keeps quests and achievements only). `Story`'s events (`RunSubmitted`, `CampaignSet`,
  `LevelSet`, and the replayed games' `Scored`) are in a contract it does not follow yet: the wiring task adds it to the
  deployment it reads and decodes them for the screens (stars per level, leaderboards per level if wanted).
- **Parity**: the wiring task's test replays every level's best line of the client plan on chain and compares the scores,
  as `contracts/src/tests/story.cairo` does for three Tutorial levels and the two long decks.

## 10. Decision row (proposed, number to be given by the PM)

| P-next | Story mode on chain (#546, #548; `docs/architecture/story-mode.md`): a new system `Story` holds the campaigns and levels in storage, keyed (campaign, level), set and corrected by the owner (`set_campaign`, `set_level`), no fixed level count (1 to 64 per campaign); `submit_run(campaign_id, level_index, moves)`, each move `{ discard, orientation, x, y }` as the client records it, replays a whole run in one transaction, free and unpermissioned, on the engine `Challenge` plays; stars 1 / 70 % rounded up / target, best kept at 2 bits per level and player; levels unlock in order and a campaign at `unlock_average` (2) stars per level of the campaigns before it, both enforced on chain; the stars gained are paid 5 / 10 / 15 Cobbles once per star, level and account through `Setup.credit_story` (a reporter-only entry point, `CobblesClaimed` kind 3) | Owner (#546, #548), CORE | 2026-10-19 | The owner changes the scale, the rules or the host |
