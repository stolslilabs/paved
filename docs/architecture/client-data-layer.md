# Client data layer (P-10)

How the web client reads and writes the native contracts (`contracts/`, since P2). No Torii, no
Dojo, no polling. The contract side is `native-storage.md` (events, access) and
`public-interface.md` (views). The code is `packages/chain`.

## Sources

| What | From | Override |
|---|---|---|
| ABIs of `Account`, `Daily`, `Tutorial`, `Token` | `contracts/abis/<Contract>.json` (committed by CORE, imported at build time) | none |
| RPC URL, chain id, addresses, `deployed_block`, token decimals and symbol | `contracts/deployments/<network>.json` (O-19, written by CORE's deploy script) | env: `VITE_RPC_URL`, `VITE_<CONTRACT>_ADDRESS`, `VITE_DEPLOYED_BLOCK` |

`resolveDeployment` (`packages/chain/src/deployment.ts`) merges the file and the env, env first. A
missing address, or a missing file with no env, gives a deployment with `configured: false`.
`configured` is computed there once, from the four addresses and the RPC URL. The app shows a "not
connected" state and no write button while it is false.

The token is labelled `$TILE` whatever its on-chain symbol (D-2); `decimals` comes from the file
(18 by default).

## Clients

`createPavedClient(provider, deployment)` gives one typed client per contract, built on starknet.js
`RpcProvider` (`callContract`, `getEvents`, `waitForTransaction`). Calldata and results are encoded
and decoded from the ABIs (`codec.ts`): structs, arrays, `u256`, enums by variant index. A unit test
checks that the field lists of the TS view types match the ABI structs, so an ABI change that the
client does not follow fails the tests.

Writes go through a starknet.js `Account` (`createWriter(account, deployment)`): `create`, `spawn`
(Daily: `approve` + `spawn` in one multicall), `build`, `discard`, `surrender`, `claim`, `sponsor`,
`mint` (test token). Each write waits for its own receipt and returns its decoded events: the one
request repeated while a transaction is pending, every 250 ms (`RECEIPT_POLL_MS`; starknet.js waits
5 s by default), and only until that receipt arrives. The writer takes an explicit `tip` (0 on
devnet: starknet.js 8.9's tip estimate wants 10 V3 transactions per block and stalls a fresh node).
The Daily entry price (`DAILY_PRICE`, 1 token) mirrors `DAILY_TOURNAMENT_PRICE` of
`contracts/src/constants.cairo`: no view exposes it.

Kept from the old code: the plain `Account` from an address and a private key (a devnet
predeployed account, from `VITE_PLAYER_ADDRESS` and `VITE_PLAYER_PRIVATE_KEY`; the old hard-coded
Katana master key is gone), and the Cartridge controller placeholder
(`auth/controller.ts`), whose policies are now built from the deployment's addresses. Dropped:
the Dojo burner manager (`@dojoengine/create-burner`).

## Views

The views sit behind one interface, `GameViews` (`views.ts`): `game`, `tiles` (pages of 64 until a
short page), `builder`, `characters`, `tournament`, `currentTournamentId`. `RpcGameViews` calls the
contracts; `FakeGameViews` holds games in memory for unit tests of the app.

Every game read names its contract: game ids are counted per contract, so the client's game key is
`(mode, game_id)` (`mode` 1 = Daily, 3 = Tutorial).

Reverts are mapped to typed errors (`ViewError`), from the message as text or as the hex of its
short string (devnet 0.10 gives only the hex): `Game: does not exist` gives `game-not-found`,
`View: not the game player` gives `not-player`, anything else `rpc`. The game page shows "game not
found" and "not your game: read only" for the first two.

## Events

`EventReader` (`events.ts`) reads `starknet_getEvents` from `deployed_block`, page by page
(continuation token), and decodes the events from the ABIs. Lists use the keys, so the node does the
filtering:

- "My games": `GameSpawned` with keys `[[selector], [], [player]]` on `Daily` and on `Tutorial`.
- "My finished games": `GameOver` with the same filter. A spawned game with no `GameOver` is active.
  A Tutorial `GameSpawned` carries the spawn time as `tournament_id` (its game duration is 1 s in
  `TournamentImpl::compute_id`); the client reads it as 0.
- The receipt of a write: its events from the contract written to.

## Who reads what, and when

| UI | Read | When |
|---|---|---|
| Landing: player registered, name | `Account.player(address)` | on connect, after `create` |
| Landing: balance | `Token.balance_of(address)` | on connect, after a write that pays |
| Landing: my games, active and finished | `GameSpawned` + `GameOver` events (both game contracts), then one `game` view per listed game (the active ones and the 10 latest finished) for its counts | on connect, when the page becomes visible |
| Landing: today's tournament (prize, top 3, end) | `Daily.current_tournament_id` + `Daily.tournament(id)` | on connect, when the page becomes visible |
| Game page without an id | `GameSpawned` / `GameOver` of the mode: resume the active game, else `spawn` | once |
| Landing: leaderboard | none: a plain "coming later" card until META's indexer | |
| Game: board | `tiles(game_id, 0, 64)` | on open |
| Game: tile in hand, score, counts, over | `game(game_id)` | on open, after each write (reconcile) |
| Game: characters | `builder` + `characters(game_id, player)` | on open, after each write (reconcile) |
| Game: placement shown | receipt events `Built`, `Scored`, `Discarded`, `GameOver` | when the receipt arrives |

A placement is shown in three stages: the tile is drawn at once as pending (local state); when the
receipt arrives, its `Built` event confirms the tile (plan, orientation, position, character),
`Scored` adds points and `GameOver` ends the game, without re-reading the board; then one
`game` + `builder` + `characters` read reconciles the score, the next tile and the characters
(a solved structure gives its characters back, which no event lists). The board is not read again.

Why no polling: a game is single-player and only its player can write it (`native-storage.md`,
access control), so its state changes only through the client's own transactions, whose receipts
the client waits for. The tournament changes when other players finish games; it is read again on
visibility and on demand, not on a timer. A live feed (a websocket subscription or META's indexer)
can replace that later.

## Tests

- Unit tests (`packages/chain/test/*.test.ts`) replay RPC answers recorded from devnet
  (`test/fixtures/devnet.json`) and check the TS view types against the ABIs.
- `bun run test:devnet` in `packages/chain` (needs `scarb build` in `contracts/`, `starknet-devnet`
  0.10 and `universal-sierra-compiler`): starts a devnet, declares and deploys the four contracts in
  the test setup only, plays a Tutorial game to its end and a Daily game (spawn, discard,
  surrender), lists the games from events and checks the error mapping. `PAVED_RECORD=1` rewrites
  the fixtures. CI does not run it (no devnet there).

## In the app

`PavedProvider` (`react.tsx`) gives the client, the writer and a status computed once from
`configured` and the account: `not-configured`, `read-only` (no account) or `ready`. `useRead` runs
one read on its inputs, on `refresh` and, when asked, when the page becomes visible. The game page
uses `GameSession` (`session.ts`) through `useGameSession`: it loads `game` + `tiles` (+ `builder` and
`characters` for the game's player), and moves only on this client's writes, as above.

## Not connected

`ConnectionBanner` (app-web) says why writes are not offered. `not-configured`: the deployment
misses addresses or the RPC URL; no write button, no spawn, and the game page shows "Not connected".
`read-only`: no playing account; games open read-only and the landing page offers no start. A game of
another player opens read-only with "Not your game: read only"; a missing game shows "Game not
found".
