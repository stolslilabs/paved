# @paved/indexer

Paved's indexer: one Node process that follows a Starknet node over JSON-RPC, keeps the games and the players of `Daily`,
the quests, achievements and wiring of `Setup`, the paid games' terms and settlements of `Economy`, and the game NFTs of
`Collection`, in SQLite, and serves the daily leaderboard over a read-only HTTP API. It is display only: it
holds no key, sends nothing, and its database can be deleted at any time (`rebuild` makes the same tables from the
chain). Design: `docs/architecture/indexer.md` (with an "As built" section at its end).

Hosting it for the public Sepolia client (process, host needs, exposure, systemd): `docs/client/indexer-hosting.md`, with the owner's runbook for this VPS and the files in `deploy/indexer/`.

## Source

Copied from Grim World's `indexer/` (https://github.com/bal7hazar/grimworld, commit
`e405340684e4202440a97a4073fcd2bc43ca49d7`, Apache-2.0, like this repository). Each copied file says so in a block at its
top, with what was changed; this copy is maintained here. Copied and adapted: `chain.ts`, `indexer.ts`, `store.ts`,
`main.ts`, `server.ts`, `events.ts`, `testing/fake-node.ts`, `testing/setup.ts`. New: `api.ts`, `queries.ts`,
`deployment.ts` and the tests (`crosscheck.ts`, the cross-check against the `tournament` view, left with D-20). Not copied: subscriptions (no push in v1), the market queries, the client
library, the emitter contract.

## Run

Node 24 (the repository's engines), no build: Node runs the TypeScript directly.

```bash
starknet-devnet --host 127.0.0.1 --port 5050 --seed 42     # a fresh local node; note its PID
scripts/deploy.sh devnet                                    # writes contracts/deployments/devnet.json
bun run --cwd packages/indexer start run \
  --deployment ../../contracts/deployments/devnet.json --db /tmp/paved-indexer.db --port 8787
curl -s http://127.0.0.1:8787/v1/head
```

`run` follows the node from the database's tip (a new database starts at `deployed_block` of the deployment file);
`rebuild` empties the database first. Both take:

| Option | Meaning |
|---|---|
| `--deployment <file>` | `contracts/deployments/<network>.json`: the addresses of `Daily`, `Setup` and `Economy` (all required) and of `Collection` (optional), `deployed_block`, `chain_id`. An `Account` key (a file from before D-25 (E)) is ignored |
| `--db <file>` | SQLite file (WAL). A database built for another deployment, start or chain is refused: `rebuild` it |
| `--rpc <url>` or `INDEXER_RPC_URL` | The node. Default: the file's `rpc_url`, only for `network: devnet` and only at localhost. Never logged (a short hash is) |
| `--port`, `--host` | The API, default `127.0.0.1` and port `8787`; `--port 0` picks a free port (the log line says which) |
| `--poll <ms>` | Idle wait between steps, default 1000 |
| `--batch <n>` | Blocks applied per step, default 100 |
| `--depth <n>\|l1` | Block headers kept below the tip, default `l1` (down to the last block accepted on L1) |
| `--recheck <blocks>`, `--recheck-every <ms>` | The last blocks read again for a replaced block, default 10 every 10 s |
| `--allow-origin <origin>` | An origin allowed to call the API from a browser (repeatable; default none) |
| `--rate <n>`, `--burst <n>` | Per-address rate limit (P-43): `n` requests per second refilled, a bucket of `--burst` (at least 1). Defaults `10` and `20`; `--rate 0` turns the limit off. Over it: `429` with `Retry-After`. Behind a proxy on this machine the address is the right-most `X-Forwarded-For` entry, the one the proxy wrote (read from loopback peers only: the proxy must dial `127.0.0.1` or `::1`, not another `127.x` address) |
| `--no-names`, `--names` | The display-name lookup (N1) is on by default, except for a deployment with `network: devnet` (test accounts are not sent to a public service). `--no-names` turns it off everywhere: every `name` is `null`; `--names` forces it on, for a by-hand check on devnet |
| `--names-url <url>` | The lookup endpoint, default `https://api.cartridge.gg/lookup` |

Stop it with `SIGTERM`. The chain id of the node must be the file's.

## Display names (N1)

A player is a wallet address; a Cartridge Controller account also has a username. A background resolver (`src/names.ts`)
asks `POST <names-url>` with `{"addresses": [...]}` for the addresses the routes have shown and not yet resolved, and keeps
the answers in the `names` table (schema 10; a cache, dropped by `rebuild`). The routes that list players (the leaderboard's
`entries[]`, `players/{id}`, `players/{id}/tournaments/{day}`) add `name: string | null` read **from that cache only**: null
until resolved, and always null with `--no-names`. The resolver never runs in the follow, rewind or decode path, and a lookup
that fails, hangs or finds nothing never slows or fails a route: the name stays null.

The service publishes no limits, so the budget is conservative: a batch of at most 50 addresses, at most one request every
5 s (12 a minute), one in flight, a 5 s timeout, and after a failure a wait of 30 s doubling to 15 min (no retry storm). A
found name is kept 24 h (and shown, stale, while it is refreshed); "no username" 1 h, shorter so that an account created
later is found. The answer is parsed tolerantly (`{results: [...]}` or a bare array; `name` or `username`; the addresses in `addresses`, which is what the service sends:
`{"username": "bal", "addresses": ["0x2514…"]}` with the leading zeros dropped, or in `address` / `addr`, else the position) and an answer that cannot be attributed to an address is refused. Names
are display only: never an identity, never used by anything else. Tests use a fake lookup and never call the service.

## API v1

`GET` only, JSON. The routes, their parameters and answers are in the design document and typed in `src/api.ts` (which a
client imports as types only). A missing, unknown, repeated or malformed parameter is `400`; an unknown route `404`; while
the indexer is `loading`, `rewinding` or `halted` every route answers `503` with the state.

```
/v1/head
/v1/tournaments?limit&before
/v1/tournaments/{id}
/v1/tournaments/{id}/leaderboard?limit&offset
/v1/players/{player_id}
/v1/players/{player_id}/games?contract&limit&before
/v1/players/{player_id}/tournaments/{id}
/v1/games/{contract}/{game_id}
```

Since D-20 the contracts keep no prize and no ranking: the daily leaderboard is the indexer's own (one row per player,
best score descending, ties by the chain order of the `GameOver`). The route names stay (`tournaments`,
`tournaments/{id}`); a game row's day fields follow the events: `day_id` (`GameSpawned.day_id`) and `counted_day_id`
(`GameOver.day_id`), `tournament_id` and `counted_tournament_id` before. Gone with D-20: `prize_ranks` of a leaderboard
row, `checks.tournaments_checked` and `checks.last_mismatch` of `/v1/head` (no view is read any more), the
`/v1/sponsors/{id}/days` route and its `sponsorships` table.

On the Podium (achievement task 8, `docs/architecture/quests.md`) is credited from that leaderboard: when a block closes a
day (`day_closes`), ranks 1 to 3 of that day go to the `podium` table, three different players at most, credited at the
closing block. The past prize events of `Daily` (`Sponsored`, `Claimed`, `Reclaimed`, emitted before D-20) are known by
name and skipped, so a replay of a history holding them never halts.

Since D-21 and D-24 the on-chain Tutorial is gone and the quests and achievements live in `Setup`: their six events
(`QuestDefined`, `QuestProgressed`, `QuestRetired`, `AchievementDefined`, `AchievementProgressed`,
`AchievementRetired`) are read from Setup's address only. The tutorial claim, `Setup.claim_tutorial()`, emits
`AchievementProgressed { task 10, count 1 }` the first time a player calls it (nothing after): it credits First Stone like
any achievement progress. Gone with D-21: the `tutorial` source and the `Tutorial` key of the deployment file, the
`tutorial` contract of the game routes (`/v1/games/tutorial/...` and `contract=tutorial` are `400`), and `tutorial_games`
of a player's stats. A replay of an older history never halts: the six events from Daily's address (Sepolia's past
progress, not carried over, P-51 ruling 5), `LobbyClassSet` and the mint of a past Tutorial game's token (id `2^32 +
game id`) are skipped; the Tutorial's address is not read. Daily's `SetupSet` (its owner's `set_setup`) is known and
skipped: the indexer takes Setup's address from the deployment file.

Since D-25 (E) `Account` is gone and a player is the wallet address. Names are off-chain (the Cartridge Controller
username, resolved by the client) and leave every answer: no `name` in a leaderboard entry or in `/v1/players/{id}`'s
`player`, which keeps `player_id` and `created`. A player row is created by the first event that names the address,
`GameSpawned`, `Purchased` (the buyer; its referrer is not a player) or a `QuestProgressed` or `AchievementProgressed` from
Setup (the tutorial claim too), with that event's block and time as `created`; a later event changes nothing. A player id
is stored and served as `0x` and 64 lowercase hex digits. Setup emits the wiring, `EconomySet` and `CollectionSet` (the
address in the data, as Account did): they are read from Setup only and compared with the deployment file, and a
mismatch halts. Gone with D-25 (E): the `account` source, the `Account` key of the deployment file (its address no longer
counts in the deployment hash, which covers Daily, Setup, Economy and Collection), `contracts.account` of `/v1/head`, and
the `name` and `master` columns of `players`. A replay of an older history never halts: `PlayerCreated` is known by name
and skipped from any source still read (Daily's ABI declared it), and Account's own events, `PlayerCreated`,
`EconomySet` and `CollectionSet` included, are never seen, since its address is not read.

Schema 9 (D-25 (E): Account leaves the deployment the database is built for, players come from their first event): a
database of schema 8 or older is refused at start with a message naming `rebuild`; rebuild it from the chain.

## Tests

```bash
bun run test --filter @paved/indexer          # typecheck, then the unit tests (what CI runs)
bun run test:devnet                           # in this folder; PAVED_DEVNET=1
```

The devnet scenario starts its own `starknet-devnet` 0.10 on port 5072 (`DEVNET_PORT`), runs `scripts/deploy.sh devnet`,
plays complete Daily games with three accounts over two days, runs the real indexer process against it (restart, a
replaced block, a second indexer rebuilt from the chain), and compares the API with the contracts' own views. It stops what
it starts by PID and writes `contracts/deployments/devnet.json` back as it was. Needs `starknet-devnet` 0.10 (`DEVNET_BIN`,
else the asdf install) and the toolchain of `scripts/deploy.sh`. On a pull request's branch, whose contract sources differ
from main, set `PAVED_DEPLOY_UNMERGED=1` (it passes `--unmerged` to `deploy.sh`). A node port of your own must not be one the
fetch standard blocks (5060 and 5061 are): Node's `fetch` refuses it ("bad port"). `PAVED_TRANSCRIPT=<file>` also writes the API answers it
compared.
