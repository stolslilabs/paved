# @paved/indexer

Paved's indexer: one Node process that follows a Starknet node over JSON-RPC, keeps the games and the players of `Daily`,
`Tutorial` and `Account`, and the paid games' terms and settlements of `Economy`, in SQLite, and serves the daily
leaderboard over a read-only HTTP API. It is display only: it
holds no key, sends nothing, and its database can be deleted at any time (`rebuild` makes the same tables from the
chain). Design: `docs/architecture/indexer.md` (with an "As built" section at its end).

## Source

Copied from Grim World's `indexer/` (https://github.com/bal7hazar/grimworld, commit
`e405340684e4202440a97a4073fcd2bc43ca49d7`, Apache-2.0, like this repository). Each copied file says so in a block at its
top, with what was changed; this copy is maintained here. Copied and adapted: `chain.ts`, `indexer.ts`, `store.ts`,
`main.ts`, `server.ts`, `events.ts`, `testing/fake-node.ts`, `testing/setup.ts`. New: `api.ts`, `queries.ts`,
`crosscheck.ts`, `deployment.ts` and the tests. Not copied: subscriptions (no push in v1), the market queries, the client
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
| `--deployment <file>` | `contracts/deployments/<network>.json`: the four addresses (`Daily`, `Tutorial`, `Account`, `Economy`; all required), `deployed_block`, `chain_id` |
| `--db <file>` | SQLite file (WAL). A database built for another deployment, start or chain is refused: `rebuild` it |
| `--rpc <url>` or `INDEXER_RPC_URL` | The node. Default: the file's `rpc_url`, only for `network: devnet` and only at localhost. Never logged (a short hash is) |
| `--port`, `--host` | The API, default `127.0.0.1` and port `8787`; `--port 0` picks a free port (the log line says which) |
| `--poll <ms>` | Idle wait between steps, default 1000 |
| `--batch <n>` | Blocks applied per step, default 100 |
| `--depth <n>\|l1` | Block headers kept below the tip, default `l1` (down to the last block accepted on L1) |
| `--recheck <blocks>`, `--recheck-every <ms>` | The last blocks read again for a replaced block, default 10 every 10 s |
| `--allow-origin <origin>` | An origin allowed to call the API from a browser (repeatable; default none) |

Stop it with `SIGTERM`. The chain id of the node must be the file's.

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

`prize_ranks` of a leaderboard row are the contract's three prize slots, replayed from the events with the rule of
`Tournament.score`; the indexer compares them with the `tournament` view of every closed day and reports a difference in
`/v1/head` (`checks.last_mismatch`). It never decides a prize: the client reads prizes from the contract.

## Tests

```bash
bun run test --filter @paved/indexer          # typecheck, then the unit tests (what CI runs)
bun run test:devnet                           # in this folder; PAVED_DEVNET=1
```

The devnet scenario starts its own `starknet-devnet` 0.10 on port 5072 (`DEVNET_PORT`), runs `scripts/deploy.sh devnet`,
plays complete Daily games with three accounts over two days, runs the real indexer process against it (restart, a
replaced block, a second indexer rebuilt from the chain), and compares the API with the contracts' own views. It stops what
it starts by PID and writes `contracts/deployments/devnet.json` back as it was. Needs `starknet-devnet` 0.10 (`DEVNET_BIN`,
else the asdf install) and the toolchain of `scripts/deploy.sh`. `PAVED_TRANSCRIPT=<file>` also writes the API answers it
compared.
