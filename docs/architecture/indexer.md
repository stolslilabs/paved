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

Events come from three contract addresses of `contracts/deployments/<network>.json`. Keys are the variant
selector first, then the fields marked `key`. Types are those of the ABIs in `contracts/abis/`.

| Event | Emitted by | Keys (after the selector) | Data | Used for |
|---|---|---|---|---|
| `GameSpawned` | `Daily`, `Tutorial` | `game_id u32`, `player_id felt252` | `mode u8`, `tournament_id u64` (0 for Tutorial), `start_time u64`, `price felt252` | A player's games list, games played per day, active games |
| `GameOver` | `Daily`, `Tutorial` | `game_id u32`, `player_id felt252`, `tournament_id u64` | `mode u8`, `score u32`, `start_time u64`, `end_time u64` | Final score, the leaderboard |
| `PlayerCreated` | `Account` | `player_id felt252` | `name felt252` (short string), `master felt252` | Display name of a player |

`Daily` and `Tutorial` both count `game_id` from 1, so a game is identified by `(contract, game_id)`, where
`contract` is `daily` or `tutorial` (the address that emitted the event). `mode` is checked against the
contract (`1` Daily, `3` Tutorial) and a mismatch halts the indexer (a contract change the indexer was not
told about).

`GameOver.tournament_id` and `end_time` are `0` when the game ended after its tournament closed, and always
in Tutorial. Such a game is stored and listed under its player, but ranks in no tournament.

Not indexed in v1: `Built`, `Discarded`, `Scored` (the current board of a game is a view call, not a list),
`Sponsored`, `Claimed`, ownership and upgrade events. `Claimed` may be added later to mark a prize as claimed;
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

## Storage

SQLite file (WAL), opened with `node:sqlite`. Schema version `1` in `meta`; a database of another version is
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
`--port`; `--allow-origin` lists the origins that may call it from a browser (default none). Every parameter is
checked before anything is read: a missing, unknown, repeated or malformed parameter is `400`, an unknown route
`404`. u64 values (tournament ids, timestamps) are JSON numbers (all below 2^53: a tournament id is at most
`2^64 / 86400`, and times are seconds); `player_id` is a `0x` hex string, 66 characters, zero-padded;
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
| `GET /v1/head` | none | `head`, `state`, `chain_id`, `from_block`, `contracts` (the three addresses), `checks` (`last_mismatch`: the last closed day whose `prize_ranks` differed from the `tournament` view, or null) |
| `GET /v1/tournaments` | `limit`, `before` (a tournament id, from `next`) | `tournaments`: newest first, each `id, start_time, end_time, games_spawned, players, best_score`; `next` (id or null) |
| `GET /v1/tournaments/{id}` | none | `tournament`: `id, start_time, end_time, games_spawned, games_finished, players, best_score`; `{id}` is parsed as a decimal string; a malformed one, or one above `MAX_TOURNAMENT_ID` (`213503982334600`), is 400. This differs from the contract's `tournament` view, which answers zeros above that id: ids above 2^53 cannot round-trip as JSON numbers, so every id the API returns is at most `MAX_TOURNAMENT_ID` (< 2^53). A day with no game answers zeros, never 404 |
| `GET /v1/tournaments/{id}/leaderboard` | `limit`, `offset` (default 0) | `total` (players ranked), `entries`: by `rank`, each `rank, player_id, name, best_score, best_game_id, games_played, games_finished, finished_at, prize_ranks`; `next_offset` (or null) |
| `GET /v1/players/{player_id}` | none | `player`: `player_id, name, created`; `stats`: `daily_games, daily_finished, best_score, tutorial_games`. a malformed id is `400`; an unknown player answers `player: null` with `200` |
| `GET /v1/players/{player_id}/games` | `contract` (`daily`, `tutorial`, default both), `limit`, `before` (`<start_time>:<contract>:<game_id>`, from `next`) | `games`: newest first, each `contract, game_id, mode, start_time, tournament_id` (of the spawn), `over, score, counted_tournament_id, end_time`; `next` (or null) |
| `GET /v1/games/{contract}/{game_id}` | none | `game`: one row as above, or `404` |
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
