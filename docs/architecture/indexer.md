# Indexer and daily leaderboard (P6, design)

Design of Paved's own indexer and of the full daily leaderboard that it serves. Documents only: no
package exists yet. Ruling P-18 (project manager, 2026-10-07): the prize top 3 stays on chain; the full
leaderboard comes from events, through an indexer that is our copy of Grim World's `indexer/` (O-3).
The on-chain top 3 sits behind an interface that a published package can replace: `docs/architecture/leaderboard.md`.

Sources read for this design: `docs/architecture/public-interface.md` (events for lists),
`docs/architecture/native-storage.md` (events, `Tournament`), `contracts/abis/Daily.json`,
`Tutorial.json`, `Account.json`, `contracts/deployments/README.md`, `contracts/src/models/tournament.cairo`,
and Grim World `indexer/` (read only, clone `/Users/bal7hazar/git/grimworld`, commit `e4053406`).

## Scope and principles

- **Display only.** The indexer never decides anything and holds no key. Everything in it is rebuilt from
  the chain; its database may be deleted at any time.
- **On chain stays on chain**: the top 3 of each tournament and the claims (see the last section).
- **Scoped to Paved**: three kinds of event from `Daily`, `Tutorial` and `Account`; nothing generic.
- **Small**: one Node process, SQLite, a read-only HTTP API. No subscriptions in v1 (the client polls, as
  it does for views: `client-data-layer.md`).

## What is indexed

Events come from four contract addresses of `contracts/deployments/<network>.json` (`Daily`, `Tutorial`, `Account`
and, since P8 E3, `Economy`). Keys are the variant
selector first, then the fields marked `key`. Types are those of the ABIs in `contracts/abis/`.

| Event | Emitted by | Keys (after the selector) | Data | Used for |
|---|---|---|---|---|
| `GameSpawned` | `Daily`, `Tutorial` | `game_id u32`, `player_id felt252` | `mode u8`, `tournament_id u64` (0 for Tutorial), `start_time u64`, `price felt252` | A player's games list, games played per day, active games |
| `GameOver` | `Daily`, `Tutorial` | `game_id u32`, `player_id felt252`, `tournament_id u64` | `mode u8`, `score u32`, `start_time u64`, `end_time u64` | Final score, the leaderboard |
| `PlayerCreated` | `Account` | `player_id felt252` | `name felt252` (short string), `master felt252` | Display name of a player |
| `QuestDefined` | `Daily` | `quest_id u32` | `schedule` (`start u64`, `end u64`, `duration u32`, `interval u32`), `tasks` (a span of `task_id u32`, `total u32`), `conditions` (a span of `u32`) | The definitions of the daily quests (P7) |
| `QuestProgressed` | `Daily` | `player_id felt252`, `task_id u32` | `count u32` | A player's progress on a task, per game over (P7) |
| `QuestRetired` | `Daily` | `quest_id u32` | none | The quest stops counting (P7) |
| `AchievementDefined` | `Daily` | `achievement_id u32` | `window` (`start u64`, `end u64`), `tasks` (as above), `points u16` | The definitions of the achievements (P7) |
| `AchievementProgressed` | `Daily`, `Tutorial` | `player_id felt252`, `task_id u32` | `count u32` | A player's progress on a task (`Tutorial`: task 10) (P7) |
| `AchievementRetired` | `Daily` | `achievement_id u32` | none | The achievement stops counting (P7) |
| `Purchased` | `Economy` | `game_id u32`, `player_id felt252` | `day u64`, `stake u8`, `price u256`, `referrer`, `referral u256`, `burned_quote u256`, `burned u256`, `margin u256`, `supply u256`, `factor u32`, `reference u128` | A paid Daily game's terms (P8 E3) |
| `Recorded` | `Economy` | `game_id u32` | `score u32`, `expired bool` | The score `Economy` holds for the game (P8 E3) |
| `DayClosed` | `Economy` | `day u64` | `mean u64`, `weight u32`, `prior u64`, `ema_after u64` | A day's mean, fixed at its first settlement (P8 E3) |
| `Settled` | `Economy` | `game_id u32`, `player_id felt252` | `day u64`, `score u32`, `threshold u64`, `reward u128` | The reward minted to the game's player (P8 E3) |

`Daily` and `Tutorial` both count `game_id` from 1, so a game is identified by `(contract, game_id)`, where
`contract` is `daily` or `tutorial` (the address that emitted the event). `mode` is checked against the
contract (`1` Daily, `3` Tutorial) and a mismatch halts the indexer (a contract change the indexer was not
told about).

`GameOver.tournament_id` and `end_time` are `0` when the game ended after its tournament closed, and always
in Tutorial. Such a game is stored and listed under its player, but ranks in no tournament.

Not indexed in v1: `Built`, `Discarded`, `Scored` (the current board of a game is a view call, not a list),
`Sponsored`, `Claimed`, ownership and upgrade events, and the quiver events Paved never emits (`QuestCompleted`,
`QuestClaimed`: quests are in event mode; the two `...ReporterSet`), and the configuration events of the economy
(`EconomyConfigured`, `PoolSet`, `GameSet` of `Economy`, `EconomySet` of `Account`). `Claimed` may be added later to mark a prize as claimed;
until then the client reads `top*_claimed` from the `tournament` view. Adding an event is a schema change and a
rebuild (below), never a migration.

### What is derived

- **Daily leaderboard of a tournament**: one row per player, from the player's finished games that counted
  for that tournament (`GameOver.tournament_id = id`):
  `rank`, `player_id`, `name`, `best_score`, `best_game_id`, `games_played` (games of this player that
  counted, finished or not: see below), `finished_at` (`end_time` of the best game). When a player has several games with the same best score, the best game is the earliest by chain order `(over_block, over_tx, over_idx)`.
  Rank: best score descending; ties broken by chain order of the `GameOver` event, `(over_block, over_tx, over_idx)`, earliest first. This is the
  order in which the chain filled its slots (a later equal score never displaces an earlier one:
  `Tournament.score` compares with `<=`), so a tie is never reordered against the contract. `end_time` and `game_id`
  are not used: `GameOver`s of one block share a timestamp, and `game_id` is spawn order, not finish order.
- **`games_played`** counts the player's games spawned in that tournament (`GameSpawned.tournament_id = id`),
  including those still running or abandoned: it measures entries. `games_finished` counts the ones that
  have a counting `GameOver`.
- **Player's games list**: `GameSpawned` joined with `GameOver`, newest first, for both contracts; a game with
  no `GameOver` is `over: false`.
- **Prize slots** (`prize_rank`, 1 to 3 or null): the three slots of the contract, **replayed** from the
  counting `GameOver` events in chain order (block, transaction index, event index) with the exact rule of
  `Tournament.score` in `contracts/src/models/tournament.cairo`. This is not the same as the leaderboard rank:
  the contract ranks games, not players, so one player may hold two or three slots, while the leaderboard has
  one row per player. The leaderboard shows both (`rank` and `prize_ranks: [1, 3]`), and the API cross-check
  (below) compares `prize_ranks` with the `tournament` view.

## Package layout

New package in the Paved workspace, same shape as the other `packages/*`:

```
packages/indexer/              @paved/indexer   (private)
  package.json                 type: module; engines node 24.x (as @paved/chain); no build for the daemon
                               beyond tsc; scripts build, test, lint, typecheck, test:devnet
  tsconfig.json  tsconfig.build.json
  vitest.config.ts
  README.md                    usage and options (as Grim World's, trimmed)
  src/
    main.ts        CLI: run, rebuild; reads the deployment file                     (copied, adapted)
    chain.ts       JSON-RPC reader: redacted URL, header checks, getEvents paging   (copied, adapted)
    indexer.ts     follow loop: tip check, rewind, apply blocks                     (copied, reduced)
    store.ts       SQLite open, schema version, meta, blocks, rewind                (copied skeleton, new tables)
    server.ts      HTTP: routing, strict parameter check, envelope, CORS, cache     (copied, reduced)
    events.ts      decode the three events, selectors, felt helpers                 (copied helpers, new decoders)
    queries.ts     leaderboard, tournament, games, players, prize slots             (new)
    api.ts         v1 response types, shared with the client                        (new)
    testing/fake-node.ts   scripted node for unit tests                             (copied)
  test/            unit tests and the devnet scenario                               (new, harness copied)
```

Language and toolchain as Grim World's: TypeScript on Node 24 with the built-in `node:sqlite`, `vitest` for
tests, ESLint. Dependencies stay minimal: Grim World's `src/` hand-rolls its JSON-RPC calls and imports
`starknet` only in `events.ts` (selectors and felt helpers); we keep that, pin one exact version of `starknet`
in the package (not necessarily the `^8.1.2` of `@paved/chain`: the two packages never exchange objects of
that library), and the shared response types are plain TypeScript.

### Files copied from Grim World

Each copied file keeps the licence header it has and adds, at its top, a block of this form (O-3):

```
// Copied from Grim World, indexer/src/<file>.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: <what changed>. This copy is maintained by the Paved repository.
```

Grim World's `indexer/src/` files carry no licence header today (checked: no `Apache` or `SPDX` text in them);
the repository's `LICENSE` is Apache-2.0, like Paved's. The copy therefore adds the block above and no other
header, and the package README names the source and its licence. If Grim World adds headers before the copy
is made, they are kept.

| Grim World file | In Paved | Change |
|---|---|---|
| `src/chain.ts` | `src/chain.ts` | Three addresses instead of hub and market; the `Source` type becomes `daily`, `tutorial`, `account`; the rest (URL redaction, block header and commitments, `getEvents` paging, call counters) unchanged |
| `src/indexer.ts` | `src/indexer.ts` | Follow loop, reorg rewind, kept depth, recheck and halt rules unchanged; the apply step calls Paved's store; subscription listeners removed |
| `src/store.ts` | `src/store.ts` | Meta table, schema-version refusal, `blocks`, raw `events`, WAL, rewind and prune skeleton kept; the market tables replaced by the tables below; block-versioned rows replaced by block columns (see Storage) |
| `src/main.ts` | `src/main.ts` | `run` and `rebuild` kept; `--from`, `--hub`, `--market` replaced by `--deployment <file>` (addresses and `deployed_block` come from it); options for subscriptions removed |
| `src/server.ts` | `src/server.ts` | Strict parameter checking (a missing, unknown, repeated or malformed parameter is 400), envelope with `status` and `head`, state-aware 503, CORS allow-list, answer cache by served block; routes replaced; SSE routes removed |
| `src/events.ts` | `src/events.ts` | `canonical`, `felt`, selector table builder and `DecodeError` kept; the nine Grim World decoders and the market key decoder replaced by the three Paved decoders |
| `src/testing/fake-node.ts`, `src/testing/setup.ts` | `src/testing/` | Scripted node and fixtures; events replaced |
| `src/chain.test.ts`, `src/store.test.ts`, `src/indexer.test.ts`, `src/server.test.ts`, `src/main.test.ts`, `src/events.test.ts` | `src/*.test.ts` | Copied as the starting point of the tests of the matching file, rewritten for Paved's events |
| `test-node/node.ts`, `test-node/run-indexer.ts` | `test/devnet/` | Start and stop a local node, run the indexer against it; adapted to starknet-devnet (D-8) |

Not copied, on purpose:

| Grim World file | Why |
|---|---|
| `src/subscriptions.ts` and its test, SSE routes | No live feed in v1; the client polls. Revisit if a leaderboard screen needs push |
| `src/queries.ts` (market queries) | Market-specific; ours is new |
| `src/client/*` | The Paved client reads through `@paved/chain` (below). Its freshness rule is reimplemented in a few lines; `client/reader.ts` is the only file that may be copied then, with the same header |
| `emitter/` (Cairo contract that emits the nine events) | Paved's own contracts emit the events on devnet; no emitter is needed |
| `test-node/bin/setsid`, `scenario.node.test.ts`, `queries.scenario.ts` | Grim World's scenarios; ours is new |
| `eslint.config.js`, `tsconfig*.json`, `vitest*.config.ts` | Taken from the Paved packages' own configuration, not from Grim World |

- **Daily quests and achievements (P7)**: the rules of quiver 0.2.0 event mode applied to the stored reports, as
  queries (`docs/architecture/quests.md`, "Indexer"; `src/quests.ts`). A report counts for a quest when its block's time
  is in the quest's schedule (`ScheduleTrait::interval_id`: `start <= time`, `end == 0 || time < end`, and
  `(time - start) % interval < duration`) and its position (block, tx, event) is before the quest's retirement; per task
  the counts are summed and saturated at the target, per player and per interval; the quest is complete when every task is
  at its target. A daily quest is an interval of one UTC day (its `start` is a multiple of 86,400), so **Point Chaser is the
  sum of the scores of the day's finished Daily games** (the `POINTS` reports, one per game, P-22). A game that ends after
  midnight counts for the day of its closing block. An achievement counts the reports in its window, before its retirement,
  summed per task and saturated; a reached achievement stays reached. Quest `conditions` (prerequisites) are served as
  defined and not applied: in event mode they depend on acceptances that emit no event, and Paved defines none.
- **On the Podium (task 8, P-22/O-37)**: not from events. After a day closes (the served block's time is at or past the
  day's `end_time`, the D-P6-5 condition), the cross-check's read of the contract's `tournament(id)` view at that served
  block also records the players in the view's three slots, once each for the day. The credit is a progress of 1 on task 8
  at the end of the day, in the achievement rules above, ordered at the block that closed the day (`close_block`: the first block whose time is at or past the day's end). A retirement in that block or after it comes after the credit, one before it comes first; this does not depend on when the view was read (live, rebuilt in batches, or retried). A `AchievementProgressed` of task 8 on chain is not counted: the credit comes only from the view. It is exact (the contract's own ranking), never early (a day still
  open records nothing), and independent of a claim.

## Storage

SQLite file (WAL), opened with `node:sqlite`. Schema version `2` in `meta` (`1` before P7); a database of another version is
refused at open and rebuilt (`rebuild` drops every table), as in Grim World. bounded integers (`game_id`, `score`, `mode`, `tournament_id`, and every time: all below 2^53) are
`INTEGER`; only felts (`player_id`, `price`, `name`, `master`) are fixed-width lowercase hex text, 66 characters.

```sql
CREATE TABLE meta   (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- schema, chain_id, deployment (sha256 of the three addresses), from_block, started_at
CREATE TABLE blocks (
  number INTEGER PRIMARY KEY, hash TEXT NOT NULL, parent TEXT NOT NULL,
  commitments TEXT NOT NULL, timestamp INTEGER NOT NULL, checked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE events (                       -- raw log, kept for audit and for a rebuild by SQL
  block INTEGER NOT NULL, tx INTEGER NOT NULL, idx INTEGER NOT NULL,
  source TEXT NOT NULL, name TEXT NOT NULL, keys TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (block, tx, idx));

CREATE TABLE players (
  player_id TEXT PRIMARY KEY, name TEXT NOT NULL, master TEXT NOT NULL, created_block INTEGER NOT NULL);

CREATE TABLE games (
  contract TEXT NOT NULL,                   -- 'daily' | 'tutorial'
  game_id INTEGER NOT NULL, player_id TEXT NOT NULL, mode INTEGER NOT NULL,
  spawn_tournament INTEGER NOT NULL,        -- GameSpawned.tournament_id
  start_time INTEGER NOT NULL, price TEXT NOT NULL, spawned_block INTEGER NOT NULL,
  over INTEGER NOT NULL DEFAULT 0,
  score INTEGER, tournament_id INTEGER,     -- GameOver (tournament_id 0: did not count)
  end_time INTEGER, over_block INTEGER, over_tx INTEGER, over_idx INTEGER,
  PRIMARY KEY (contract, game_id));
CREATE INDEX games_player ON games (player_id, start_time DESC, game_id DESC);
CREATE INDEX games_board  ON games (tournament_id, score DESC, over_block, over_tx, over_idx) WHERE over = 1 AND tournament_id > 0;
CREATE INDEX games_spawn  ON games (spawn_tournament, player_id) WHERE contract = 'daily';
```

- **Idempotence**, in this order: an event whose `(block, tx, idx)` is already in `events` (primary key) is
  skipped, so applying the same block twice changes nothing; a new event is inserted in `events`, then applied
  to `games` or `players`, in one transaction per block. A duplicate game is never merged: a `GameOver` for a game with no
  `GameSpawned`, a second `GameOver` for one game, or a `GameSpawned` for an existing id halts the indexer
  (the data it holds is not the chain's).
- **Derived data are queries, not tables**: the leaderboard is a `GROUP BY player_id` over `games_board` with a
  window function for `rank`; the prize slots replay a tournament's counting games in chain order (at most a few
  hundred per day, fast; cached per served block). If a day ever holds too many games for this, a
  materialised `leaderboard` table rebuilt per tournament at each block is the fallback; the API does not change.
- **Reorgs**: instead of Grim World's `_from`/`_to` row versions, each row records the block that created it
  and, for a game, the block that finished it. Rewinding to fork block `F` is one transaction:
  `DELETE FROM games WHERE spawned_block > F`, then `UPDATE games SET over = 0, score = NULL, tournament_id = NULL,
  end_time = NULL, over_block = NULL, over_tx = NULL, over_idx = NULL WHERE over_block > F`, and the same
  `DELETE` on `players`, `events` and `blocks`. This is enough because a game row changes at most twice
  (spawn, over) and never back. Decision: simpler than versioned rows for three tables; **reverse** it if a
  later table needs reading the past at a given block (then copy `_from`/`_to` from Grim World's `store.ts`).

## Ingestion

- **Start**: `deployed_block` of `contracts/deployments/<network>.json` (`Token` is the first deploy
  transaction; the declares are earlier). The database records its deployment (hash of the three addresses and
  `from_block`); `run` on a database of another deployment, or `rebuild` with another start, is refused. A
  redeploy of the contracts (a new `deployments/<network>.json`) is a `rebuild`.
- **Polling**: every `--poll` ms (default 1000, as Grim World), the indexer reads `starknet_blockHashAndNumber`
  and, per step of at most `--batch` blocks (default 100), the block headers with
  `starknet_getBlockWithTxHashes` and the events with `starknet_getEvents`, one filter per contract address
  (three), `from_block` to `to_block` of the step, `chunk_size` 100 and `continuation_token` until exhausted.
  Events are merged and ordered by (block, transaction index, event index). Only accepted blocks are read;
  pre-confirmed blocks never. JSON-RPC 0.10 as Grim World's reader; the RPC URL comes from
  `INDEXER_RPC_URL` (never logged, only `rpc <8 hex>`), defaulting to `rpc_url` of the deployment file on a
  local network.
- **Reorg**: copied from Grim World (`indexer.ts`): each step compares the stored tip with the node's block at
  that height by hash **and** commitments; on a difference the state is `rewinding`, the fork point is the
  highest stored block the node still has, and the tables go back to it in one transaction. A block is applied
  only if its parent, read again after its events, is still the node's. The last `--recheck` blocks (default 10)
  are re-read periodically (starknet-devnet reuses a replaced block's hash, which is why commitments count too).
  History kept below the tip: `--depth` (default `l1`: down to the last block accepted on L1; on a local node
  everything). A reorg below the kept history halts.
- **Restart**: the stored tip is checked first; the indexer resumes from it (blocks after the tip), with no
  state held in memory. A crash in the middle of a block loses nothing: each block applies in one transaction.
- **States**: `loading`, `ok`, `rewinding`, `halted` (for good, until a human `rebuild`s: an undecodable event
  of the three contracts, a mode that does not match its contract, a `GameOver` without a `GameSpawned`, a node
  that went back below the kept history). In any state but `ok` every query answers 503 with the state and
  reason.
- **Freshness**: every answer carries `head` (`number`, `hash`, `timestamp`: the served block, the highest block
  checked after being applied) and `behind` (blocks between it and the node's tip).

## Read API (v1)

HTTP, JSON, `GET` only, read-only, versioned in the path. Served on `--host` (default `127.0.0.1`) and
`--port` (default `8787`, P-20; `--port 0` picks a free port, which the startup log line names); `--allow-origin` lists the origins that may call it from a browser (default none). Every parameter is
checked before anything is read: a missing, unknown, repeated or malformed parameter is `400`, an unknown route
`404`. u64 values (tournament ids, timestamps) are JSON numbers, and every number the API returns is a safe integer
(at most 2^53 - 1, P-19): a tournament id is at most `MAX_TOURNAMENT_ID` = `floor((2^53 - 1) / 86400) - 1` =
`104249991373`, so that its `end_time`, `(id + 1) * 86400`, stays at most 2^53 - 1 (`9007199254713600` at the bound); `player_id` is a `0x` hex string, 66 characters, zero-padded;
`name` is the short string decoded as UTF-8 (`null` when it does not decode, or when the player has no
`PlayerCreated`). `limit` is 1 to 100 (default 20). A v1 field is never removed or retyped; fields may be
appended, as for the views (`public-interface.md`).

Envelope of every answer:

```json
{ "version": 1, "status": "ok",
  "head": { "number": 128, "hash": "0x..", "timestamp": 1790000000 }, "behind": 0,
  "...": "the rows below" }
```

An error is `{ "version": 1, "status": "error", "error": "<what>", "state": "ok" }`; a 503 has
`"status": "loading" | "rewinding" | "halted"` and a `reason`.

| Route | Parameters | Answer |
|---|---|---|
| `GET /v1/head` | none | `head`, `state`, `chain_id`, `from_block`, `contracts` (`daily`, `tutorial`, `account`, and `economy` since E3), `checks` (`last_mismatch`: the last closed day whose `prize_ranks` differed from the `tournament` view, or null; `definitions_excluded`, P-30: the quest and achievement definitions left out of every answer because a task total is 0 or a task id repeats, which the contract refuses since P-30 but a definition made before, or through quiver directly, may still be on chain; the indexer never halts on them) |
| `GET /v1/tournaments` | `limit`, `before` (a tournament id, from `next`) | `tournaments`: newest first, each `id, start_time, end_time, games_spawned, players, best_score`; `next` (id or null) |
| `GET /v1/tournaments/{id}` | none | `tournament`: `id, start_time, end_time, games_spawned, games_finished, players, best_score`; `economy` (E3): the day's paid games, see "As built (P8 E3)"; `{id}` is parsed as a decimal string; a malformed one, or one above `MAX_TOURNAMENT_ID` (`104249991373`, P-19), is 400. This differs from the contract's `tournament` view, which answers zeros for ids up to `2^64 / 86400`: a start or end time above 2^53 - 1 cannot round-trip as a JSON number, so the indexer alone refuses the ids whose times would exceed it (the contract view is unchanged). The same bound applies to every tournament id of a path or of `before`. A day with no game answers zeros, never 404 |
| `GET /v1/tournaments/{id}/leaderboard` | `limit`, `offset` (default 0) | `total` (players ranked), `entries`: by `rank`, each `rank, player_id, name, best_score, best_game_id, games_played, games_finished, finished_at, prize_ranks`; `next_offset` (or null) |
| `GET /v1/players/{player_id}` | none | `player`: `player_id, name, created`; `stats`: `daily_games, daily_finished, best_score, tutorial_games, paid_games, settled_games, rewards` (the last three since E3); `unsettled` (E3): the player's recorded games not yet settled. a malformed id is `400`; an unknown player answers `player: null` with `200` |
| `GET /v1/players/{player_id}/games` | `contract` (`daily`, `tutorial`, default both), `limit`, `before` (`<start_time>:<contract>:<game_id>`, from `next`) | `games`: newest first, each `contract, game_id, mode, start_time, tournament_id` (of the spawn), `over, score, counted_tournament_id, end_time`, `economy` (E3; null for a Tutorial game or a game not bought); `next` (or null) |
| `GET /v1/games/{contract}/{game_id}` | none | `game`: one row as above, or `404` |
| `GET /v1/definitions` | none | `quests`: by id, each `quest_id, start_time, end_time, duration, interval, tasks` (`task_id, total`), `conditions, defined_at, retired, retired_at`; `achievements`: by id, each `achievement_id, start_time, end_time, tasks, points, defined_at, retired, retired_at`. Titles and descriptions are not on chain: the client keys them by id. A retirement above the served block has not happened |
| `GET /v1/players/{player_id}/quests` | `day` (a UTC day, `timestamp / 86400`, from 0 to `MAX_TOURNAMENT_ID`; default the day of the served block) | `day, start_time, end_time` and `quests`: the quests active at some second of that day (a quest retired before the day began is not listed), each `quest_id, interval_id, tasks` (`task_id, total, count`: the sum so far, at most `total`), `completed, completed_at` (the time of the block of the report that completed it, or null), `retired`. A player the indexer does not know has zero counts (200) |
| `GET /v1/players/{player_id}/achievements` | none | `points` (of the completed achievements) and `achievements`: every defined one, each `achievement_id, points, tasks` (`task_id, total, count`), `completed, completed_at, retired` |
| `GET /v1/players/{player_id}/tournaments/{id}` | none | `entry`: that player's leaderboard row of that day, or `null` (what "your rank today" needs, without paging the board) |

Example, `GET /v1/tournaments/20733/leaderboard?limit=3`:

```json
{
  "version": 1, "status": "ok",
  "head": { "number": 9120, "hash": "0x01b4..e2", "timestamp": 1791878004 }, "behind": 0,
  "tournament_id": 20733, "start_time": 1791849600, "end_time": 1791936000,
  "total": 41,
  "entries": [
    { "rank": 1, "player_id": "0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef",
      "name": "Ada", "best_score": 187, "best_game_id": 912, "games_played": 3, "games_finished": 2,
      "finished_at": 1791871203, "prize_ranks": [1, 3] },
    { "rank": 2, "player_id": "0x0722..9c", "name": null, "best_score": 181, "best_game_id": 877,
      "games_played": 1, "games_finished": 1, "finished_at": 1791866650, "prize_ranks": [2] },
    { "rank": 3, "player_id": "0x0358..10", "name": "Bo", "best_score": 176, "best_game_id": 903,
      "games_played": 2, "games_finished": 2, "finished_at": 1791870011, "prize_ranks": [] }
  ],
  "next_offset": 3
}
```

(The figures are illustrative.) Example, `GET /v1/players/0x04d1…/games?limit=2`:

```json
{
  "version": 1, "status": "ok", "head": { "number": 9120, "hash": "0x01b4..e2", "timestamp": 1791878004 }, "behind": 0,
  "games": [
    { "contract": "daily", "game_id": 912, "mode": 1, "start_time": 1791869000, "tournament_id": 20733,
      "over": true, "score": 187, "counted_tournament_id": 20733, "end_time": 1791871203 },
    { "contract": "tutorial", "game_id": 55, "mode": 3, "start_time": 1791860000, "tournament_id": 0,
      "over": true, "score": 64, "counted_tournament_id": 0, "end_time": 0 }
  ],
  "next": null
}
```

Example, `GET /v1/players/0x04d1…/quests?day=20733` (Point Chaser at 2,700 of 3,000 after two games of 1,200 and 1,500;
the figures are illustrative):

```json
{
  "version": 1, "status": "ok", "head": { "number": 9120, "hash": "0x01b4..e2", "timestamp": 1791878004 }, "behind": 0,
  "player_id": "0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef",
  "day": 20733, "start_time": 1791849600, "end_time": 1791936000,
  "quests": [
    { "quest_id": 1, "interval_id": 20733, "completed": true, "completed_at": 1791871203, "retired": false,
      "tasks": [ { "task_id": 1, "total": 1, "count": 1 } ] },
    { "quest_id": 4, "interval_id": 20733, "completed": false, "completed_at": null, "retired": false,
      "tasks": [ { "task_id": 3, "total": 3000, "count": 2700 } ] }
  ]
}
```

Example, `GET /v1/players/0x04d1…/achievements`:

```json
{
  "version": 1, "status": "ok", "head": { "number": 9120, "hash": "0x01b4..e2", "timestamp": 1791878004 }, "behind": 0,
  "player_id": "0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef",
  "points": 10,
  "achievements": [
    { "achievement_id": 2, "points": 10, "completed": true, "completed_at": 1791871203, "retired": false,
      "tasks": [ { "task_id": 1, "total": 1, "count": 1 } ] },
    { "achievement_id": 3, "points": 20, "completed": false, "completed_at": null, "retired": false,
      "tasks": [ { "task_id": 1, "total": 10, "count": 1 } ] },
    { "achievement_id": 9, "points": 50, "completed": false, "completed_at": null, "retired": false,
      "tasks": [ { "task_id": 8, "total": 1, "count": 0 } ] }
  ]
}
```

And `GET /v1/definitions`, trimmed to one of each:

```json
{
  "version": 1, "status": "ok", "head": { "number": 9120, "hash": "0x01b4..e2", "timestamp": 1791878004 }, "behind": 0,
  "quests": [ { "quest_id": 4, "start_time": 0, "end_time": 0, "duration": 86400, "interval": 86400,
    "tasks": [ { "task_id": 3, "total": 3000 } ], "conditions": [], "defined_at": 1791000000, "retired": false, "retired_at": null } ],
  "achievements": [ { "achievement_id": 9, "start_time": 0, "end_time": 0, "tasks": [ { "task_id": 8, "total": 1 } ],
    "points": 50, "defined_at": 1791000000, "retired": false, "retired_at": null } ]
}
```

Rank is by player, as the label says: one row per player, best game. The contract's prize slots are a
different list (games, up to three per player); `prize_ranks` links the two. A client that wants the prize
truth reads the `tournament` view (below).

## How the client reads it

- **The client track, `@paved/chain`**: a small `IndexerClient` (`new IndexerClient({ url, node })`) built on
  `fetch`, with the response types of `packages/indexer/src/api.ts` (imported as a type-only workspace
  dependency, so the daemon's code never enters the browser bundle). The base URL comes from configuration
  (`PAVED_INDEXER_URL`), per network, next to the deployment file. The PM hands this section (and the API
  table) to CLIENT; the client side is CLIENT's task, not this PR's.
- **Freshness**: the client treats an answer as usable only if `status` is `ok` and `behind` is at most a small
  `maxLag` (default 5 blocks); otherwise it shows the stale value marked as such, or "loading". It may also
  compare `head.hash` with the node's block at `head.number` (one `starknet_getBlockWithTxHashes`), the rule
  Grim World's client applies, to catch an indexer on another fork.
- **Polling**: on screen visibility and on demand (`client-data-layer.md`), not on a timer: the leaderboard
  screen reloads on focus and after the player's own `GameOver`; no push in v1.
- **No dependency of play on the indexer**: the game, "my games" and the player's own score keep working from
  views and events read through the node (`EventReader` in `@paved/chain`). The indexer adds the full
  leaderboard and the cross-player lists. When it is down or `halted`, the leaderboard screen says so and the
  client falls back to the on-chain top 3 of the `tournament` view.
- **Prize display always from the contract**: where the client shows who may claim and how much, it reads
  `tournament(id)` (`top1..3_player_id`, scores, `*_claimed`, `prize`), never the indexer.

## Devnet run and tests

**Devnet run**, on a local node, from a clean checkout:

```bash
starknet-devnet --host 127.0.0.1 --port 5050 --seed 42     # fresh node, note its PID
scripts/deploy.sh devnet                                    # deploys, writes contracts/deployments/devnet.json,
                                                            # runs its smoke check (one game: create, spawn, discard)
INDEXER_RPC_URL=http://127.0.0.1:5050 \
  bun --cwd packages/indexer run start -- run --deployment ../../contracts/deployments/devnet.json \
  --db /tmp/paved-indexer.db --port 8787
curl -s 'http://127.0.0.1:8787/v1/head'
curl -s "http://127.0.0.1:8787/v1/players/<smoke player id>/games"
```

The smoke check of `deploy.sh` already produces a `PlayerCreated` and a `GameSpawned`; it has no `GameOver`.
The devnet scenario test (below) plays complete games to produce `GameOver`s, for two players and two days
(`devnet_increaseTime`-style block time moves, as Grim World's scenario does), and reads the API.
`deployments/devnet.json` is consumed as it is: `deployed_block` is the start, the three addresses are the
filters, `rpc_url` the default node. `deploy.sh` is not changed by this design. The package's start command
and port are fixed when it is built (P6 implementation); the names above are the intended shape.

**Tests** (local command, scoped: `bun run test --filter @paved/indexer`):

| Level | What | How |
|---|---|---|
| Unit | Decoders: each event from a recorded raw event of the ABIs (including Tutorial's `GameOver` with `tournament_id = 0`, `name` short strings that do not decode) | vitest, fixtures taken from a devnet run |
| Unit | Store: schema version refusal, idempotent apply, rewind to a fork block, halt cases | vitest on an in-memory SQLite, scripted fake node (copied) |
| Unit | Queries: rank order and ties, `games_played` against `games_finished`, a player holding two prize slots, a game that ended after its day, pagination bounds | vitest |
| Unit | Prize slots replay equals `Tournament.score` on a table of score sequences, including equal scores | vitest; the table is also fed to a Cairo test of `Tournament::score` (in P6 implementation, in the contracts' own test module) so the two copies of the rule cannot drift |
| Unit | Server: parameter checks (missing, unknown, repeated, malformed), envelope, 503 states, CORS | vitest, copied and adapted |
| Devnet | Whole path: deploy, play games by two accounts, read the leaderboard, compare with `tournament(id)` top 3 from the view, restart the indexer mid-run, rewind on a replaced block | `PAVED_DEVNET=1`, like `@paved/chain`'s `test:devnet`; not in the default CI job |
| CI | `packages/**` path filter already runs the client job; the package joins it (typecheck, lint, unit tests) | no change to the workflow in this PR |

## What stays on chain, and why the two cannot disagree at a cost

On chain, unchanged by P6:

- The **top 3 per tournament** in `Tournament` (`top1..3_player_id`, `top1..3_score`) and its `prize`, updated
  by `Tournament.score` at each counting `GameOver`.
- The **claims**: `Daily.claim(tournament_id, rank)` pays only the address recorded at that rank, once, after
  the tournament is over (`native-storage.md`, Access control).
- The **entry price and the token**.

Why the indexer can never cost a player anything:

1. **It has no power.** It holds no key and sends no transaction. No contract function reads it, and it is not
   in the claim path: a claim looks at `Tournament` storage only. A wrong, stale, stopped or malicious
   indexer cannot move a prize, only draw a wrong table.
2. **Prizes are read from the contract.** The client shows "you can claim rank N" from the `tournament` view,
   and the `Claimed` flags from it too. The indexer's `prize_ranks` is informative and cross-checked, never
   authoritative.
3. **It is a pure function of the chain.** Every row comes from three event kinds the contracts emit, and a counting
   `GameOver` is emitted in the same transaction that updates `Tournament`. The ranking rule that decides prizes (`Tournament.score`) is
   replayed on the same events in the same order, so `prize_ranks` equals the contract's slots by
   construction; a test feeds the same table to both. The first difference between `prize_ranks` and the
   `tournament` view for a closed day is an indexer bug (a missed event, a wrong order) and halts nothing: it is
   reported (`GET /v1/head` carries `checks.last_mismatch`, set by a cross-check that the indexer makes with
   one `tournament` view call per closed day it has not checked yet; the call is read-only). A day is closed when the
   timestamp of the **served** head is at least its `end_time`; the call passes `block_id` = the served head (any
   later block gives the same answer, since the slots cannot move after the day ends: counting `GameOver`s stop at
   `end_time`). The view is therefore read at a block the indexer has applied, and no mismatch can come from the
   indexer lagging.
4. **The only difference is a documented one**: the leaderboard has one row per player, the contract's slots are
   per game (a player may hold two or three of them). The leaderboard shows both, so no player sees a rank
   that hides a prize they hold.
5. **Recoverable**: lose the database, run `rebuild`: the same chain gives the same tables. A reorg rewinds
   the rows the chain took back.

Decided here, for the owner to read afterwards (changeable by a later PR, as no code exists yet):

- **D-P6-1** Rank by player's best game, ties by chain order of the `GameOver`. Reverse: the PM wants rank
  by game (one row per game, as the contract).
- **D-P6-2** No subscriptions in v1; polling by the client. Reverse: a push screen is wanted (copy
  `subscriptions.ts`).
- **D-P6-3** Rewind by block columns, not versioned rows (Storage). Reverse: a table needs past reads.
- **D-P6-4** The package is `packages/indexer`, TypeScript, Node 24, `node:sqlite`, as Grim World's. Reverse:
  Node 24 SQLite is unavailable on the host (then `better-sqlite3`).
- **D-P6-5** The cross-check against the `tournament` view is part of v1 (it is the guard for point 3).
  Reverse: dropped if the view call cost matters (it is one call per closed day).

Open points for the PM: the public hosting of the indexer (who runs it, the origin allow-list) is a
deployment question, outside this design and outside P6's first implementation PR; a non-local network is the
owner's decision (`OPERATIONS.md`).

## As built (P6 implementation)

The package follows this design. What differs, or was decided while building (Paved-specific names are those of the code):

- **Layout**: as the table above, plus `src/deployment.ts` (reads `deployments/<network>.json`) and `src/crosscheck.ts`
  (the view comparison). `bun run --cwd packages/indexer start run ...` starts it: Node 24 runs the TypeScript directly,
  so `build` is `tsc --noEmit` (a typecheck). The repository has no ESLint configuration, so there is no `lint` script.
- **Tables**: `blocks` has no `checked` column; the highest checked block is the `meta` key `checked`, as in Grim World.
  `meta` holds `schema`, `chain_id`, `deployment` (sha256 of the three addresses), `from_block`, `addresses`, `checked`,
  `started_at`. `players` gains `created_time` (the block's time). `games_player` is `(player_id, start_time DESC,
  contract DESC, game_id DESC)`: the list's order is total across the two contracts. Only the three indexed events are
  stored in `events`; the known others (`Built`, `Discarded`, `Scored`, `Sponsored`, `Claimed`, the ownership events) are
  skipped, and any other selector halts the indexer. A `PlayerCreated` from a contract other than `Account`, a second
  one for a player, and a `GameOver` by another player than the one that spawned the game also halt.
- **Reading blocks**: as Grim World, one header and the events of each of the three contracts per block, by block hash
  (`chunk_size` 100), not by ranges of blocks; the node's chain id is checked against the file's at start.
- **Served block**: the tables hold the stored tip, which may be above the served block while a batch is being checked, so
  every query compares the block columns with the served block (a later spawn is absent, a later game over has not happened).
- **API**: `GET /v1/head` also answers `state` and `checks.tournaments_checked`, and is `503` like the other routes when the
  indexer is not `ok`; error answers carry `head`; game rows carry `player_id`; a game that is running has `score`,
  `counted_tournament_id` and `end_time` `null`; an unknown player has `stats: null`; `players` of a tournament counts the
  players ranked (the leaderboard's `total`) and `created` of a player is the creation block's time. The tournament list
  holds the days with at least one Daily game spawned.
- **Cross-check**: compared days are kept in memory (a restart compares the closed days again, one call each); a rewind
  clears them and the last mismatch.
- **Tests**: the prize-slot table is in `src/queries.test.ts`, with a stable top-3 oracle and a seeded random run. The Cairo
  half of the design (feeding the same table to a test of `Tournament::score`) is not added: P6 does not touch `contracts/`.
  The devnet scenario is `test/devnet/scenario.test.ts`.
- **CI**: the package has its own job in `test.yaml`, gated on `packages/indexer/**` and the ABIs and deployments it reads;
  it is in the aggregate `ci` job's needs. The `client` job of test.yaml, under `ci`, also runs it (it runs every package of `packages/**`).

## As built (P7 indexer, quests and achievements)

- **Events**: the six events of the table above are decoded (`src/events.ts`) strictly, with the ABI's key and data order
  (`src/events.test.ts` reads it from `contracts/abis/Daily.json`): 1 to 3 tasks of a non-zero id, at most 7 conditions,
  every time below 2^53, `points` a `u16`. Quest events and the definitions come from `Daily` only; `AchievementProgressed`
  also from `Tutorial` (task 10); any other emitter halts the indexer, and so does a Tutorial `AchievementProgressed` of a task other than 10 (Q-7: the filter is the addresses of the deployment
  file). `QuestCompleted`, `QuestClaimed` and the two `...ReporterSet` stay in `IGNORED`: Paved's quests are in event mode
  and the game flow calls the internal layer.
- **Definition times**: a definition's `start` and `end` must be below 2^53 (0 = never ends), else the decoder halts the indexer. The deploy script's definitions are far below.
- **Tables** (schema `3`): `quests` and `achievements` (the definition, the position and time of the defining block, and of
  the retiring block once there is one); `progress` (each `QuestProgressed` and `AchievementProgressed`: position, kind,
  emitter, player, task, count, block time); `podium` (`tournament_id`, `player_id`, the slots held, the day's end and the
  block that closed the day); `day_closes` (each UTC day's closing block, written by `apply` when it stores the first block
  whose time is at or past the day's end, with the time of the block before it). `recordPodium` reads the closing block
  there, not in `blocks`, which prune empties: a view call retried after the header is forgotten still credits at the real
  closing block. A definition twice, a retirement of nothing and a second retirement halt the indexer. A
  rewind deletes the rows of the blocks above the fork, un-retires what was retired above it, and deletes the podium rows
  closed above it and the `day_closes` rows above it (prune leaves them), so a rewound database equals one rebuilt from the chain (`src/quests.test.ts`).
- **Derivation**: queries at the served block, not tables (as the leaderboard): `src/quests.ts` has the pure rules
  (`intervalId`, `firstActive`, `replay`), `src/queries.ts` the reads. A player's progress is replayed from that player's
  rows, which stay small (at most six reports per finished game).
- **Day of a quest**: the quests listed for a day are those whose schedule is active at some second of it, the interval
  shown is the one of the first such second. For the accepted list (`start` a multiple of 86,400, `duration = interval =
  86,400`) that is the interval whose id is the day number.
- **Podium**: `CrossCheck.run` records the podium from the same view read as the cross-check, once per closed day per process
  (a restart reads closed days again; `recordPodium` ignores a player already recorded). The credit's time is the day's end,
  so it does not depend on when the indexer ran. A player in two slots is credited once. `podium.close_block` is also what a rewind deletes by.
- **API**: `GET /v1/definitions`, `GET /v1/players/{player_id}/quests?day=` and `GET /v1/players/{player_id}/achievements`,
  append-only on v1, same envelope, every number a safe integer (`day` is bounded by `MAX_TOURNAMENT_ID`).
- **Devnet**: the scenario (`test/devnet/scenario.test.ts`) is not extended in this PR and was not run with it:
  `starknet-devnet` is not installed on the machine that built it. Its games already emit the quiver reports (progress reads
  no definition, so a report is emitted with or without definitions), which the indexer now decodes and stores, so a
  mismatch with the real events halts that run. Defining the accepted list and asserting the three routes belongs with the
  deploy task's definition script.

## As built (P8 E3, the economy)

- **Deployment**: `contracts.Economy` is required; a file without it is refused (`the deployment file has no address
  for Economy`). The deployment hash covers the four addresses and the schema is `4`: a database of schema 3 is refused
  until rebuilt. `PavedToken`, `Vault` and `MockUSDC` are not read.
- **Events**: `Purchased`, `Recorded`, `DayClosed` and `Settled` from `Economy` only (another emitter halts the indexer).
  `Economy`'s event enum is not flat: the first key is the selector of the variant's name, which is the struct's name
  (`src/events.test.ts` checks the shapes against `contracts/abis/Economy.json`). `day` is bounded by
  `MAX_TOURNAMENT_ID`.
- **Tables**: `purchases` (one row per paid game: the terms of `Purchased`, then the score and `expired` of `Recorded`,
  then the threshold and reward of `Settled`, with the block of each) and `economy_days` (each `DayClosed`). The indexer
  halts on a second `Purchased`, `Recorded`, `Settled` or `DayClosed` for the same game or day, on a `Recorded` or
  `Settled` without a purchase, on a `Settled` before its `Recorded`, and on a `Settled` whose player, day or score
  differ from the purchase and the record. A `Purchased` is not checked against `GameSpawned` (their order inside one
  transaction is not fixed); they are joined on read, `contract = 'daily'` and the same `game_id` (`Economy` uses
  `Daily`'s ids). A rewind deletes or undoes them by block.
- **Numbers**: USDC and PAVED amounts (`u256`, `u128`) are decimal strings, stored as text and summed with `BigInt`;
  every other value is a safe-integer JSON number (P-19). No `settles_at` is served: `(day + 2) x 86400` can pass 2^53 at
  `MAX_TOURNAMENT_ID`, so a client computes it.
- **API fields** (appended to v1, read at the served block):
  - `GameRow.economy`, `GameEconomy | null` (null for a Tutorial game and a Daily game with no `Purchased`): `day`,
    `stake`, `price` (USDC, string), `referrer` (`0x` and 64 hex digits, or null without a referral), `referral` (USDC,
    string), `burned` (PAVED, string), `factor` (bps), `reference` (`R`, PAVED, string), `purchased_at` (block time),
    `recorded`, `expired` (false until recorded), `settled`, `threshold` (points x 1,000, null until settled),
    `reward` (PAVED, string, null until settled).
  - `PlayerStats`: `paid_games`, `settled_games`, `rewards` (PAVED, string: the sum of the settled rewards).
  - `PlayerAnswer.unsettled`: the player's recorded games not settled, oldest first, each `game_id`, `day`, `expired`;
    null for an unknown player.
  - `TournamentAnswer.economy` (`GET /v1/tournaments/{id}` only, the list is unchanged), with the tournament id as the
    UTC day: `games_purchased`, `games_recorded`, `games_settled`, `unsettled` (the ids a keeper passes to
    `Economy.settle` from `(id + 2) x 86400`), `rewards` (PAVED, string), `closed`, and `mean`, `weight`, `prior`,
    `ema_after`, `closed_at` (null until `DayClosed`).
  - `GET /v1/head`: `contracts.economy`.
- **Devnet**: the scenario deploys with `scripts/deploy.sh`, whose smoke buys, records and settles one paid game, and
  checks it against `Economy.terms` and `Economy.day`; a keeper test settles a later day from the API's `unsettled` list.
  `PAVED_DEPLOY_UNMERGED=1` deploys a pull request's sources (`--unmerged`). It passed (7 of 7) against #275.
