# Client data layer (P-10)

How the web client reads and writes the native contracts (`contracts/`, since P2). No Torii, no
Dojo, no polling. The contract side is `native-storage.md` (events, access) and
`public-interface.md` (views). The code is `packages/chain`.

## Sources

| What | From | Override |
|---|---|---|
| ABIs of `Account`, `Daily`, `Tutorial`, `Token` | `contracts/abis/<Contract>.json` (committed by CORE, imported at build time) | none |
| RPC URL, chain id, addresses, `deployed_block`, token decimals and symbol | `contracts/deployments/<network>.json` (O-19, written by CORE's deploy script); `<network>` is `VITE_NETWORK`, default `devnet` | env, see below |
| The playing account | env, **devnet only**: `VITE_PLAYER_ADDRESS` and `VITE_PLAYER_PRIVATE_KEY` (a devnet predeployed account); ignored on any other network, since a key in a built bundle is public | none; without both the app is read-only |

The env variables of `packages/app-web` (`src/utils/network.ts`), each one set overriding the file:

| Variable | Overrides |
|---|---|
| `VITE_RPC_URL` | `rpc_url` |
| `VITE_DEPLOYED_BLOCK` | `deployed_block` |
| `VITE_ACCOUNT_ADDRESS`, `VITE_DAILY_ADDRESS`, `VITE_TUTORIAL_ADDRESS`, `VITE_TOKEN_ADDRESS` | `contracts.<Contract>.address` (the contracts, not the player) |
| `VITE_SUPPORTS_TOKEN_MINT` | the test token's faucet; default on for `devnet` only |

The app reads every `contracts/deployments/*.json` at build time (`import.meta.glob`, which
tolerates a missing folder) and picks `<network>.json`.

`resolveDeployment` (`packages/chain/src/deployment.ts`) merges the file and the env, env first. A
missing address, or a missing file with no env, gives a deployment with `configured: false`.
`configured` is computed there once, from the four addresses and the RPC URL. The app shows a "not
connected" state and no write button while it is false.

The token is labelled `$TILE` whatever its on-chain symbol (D-2); `decimals` comes from the file
(no default: when the file does not say, `tokenDecimals` is `null` and the app shows no
amount and offers no Daily confirm, claim or sponsor, rather than assume 18).

## Clients

`createPavedClient(deployment)` gives a `PavedClient` on a starknet.js `RpcProvider` for the
deployment's RPC URL (`callContract`, `getEvents`, `waitForTransaction`); it refuses a deployment
that is not configured, so an empty URL never falls back to a public node. Calldata and results are encoded
and decoded from the ABIs (`codec.ts`): structs, arrays, `u256`, enums by variant index. A unit test
checks that the field lists of the TS view types match the ABI structs, so an ABI change that the
client does not follow fails the tests. A result with felts left over, or too few, is an
`abi-mismatch` error (a contract upgraded with a grown struct fails rather than misaligns);
integers are range-checked before they are encoded; an event with a field type the codec does not
know is skipped and logged, so ABI growth cannot break a receipt or an event page. A unit enum
decodes to its variant index, and an index the bundled ABI does not list (a variant added by a later
contract version, e.g. a role in P4) decodes to a **bare number**, only for an enum whose listed variants are all unit variants (an
unknown variant of an enum with a payload variant could carry felts of unknown length: the codec
throws); the consumer must handle a code it does not know (treat it as "unknown"), as `public-interface.md` says.

Writes go through a starknet.js `Account` (`client.writer(account, { tip })`, a `PavedWriter`): `create`, `spawn`
(Daily: `approve` + `spawn` in one multicall), `build`, `discard`, `surrender`, `claim`, `sponsor`,
`mint` (test token). The seven roles (Woodsman 6 and Herdsman 7 since P4) are listed in the role picker, with their art from `packages/app-web/public/assets` (real files of the package, kept to the ones the packages load; `__tests__/public-assets.test.ts` fails when a path used in code is missing). Each write waits for its own receipt and returns its decoded events: the one
request repeated while a transaction is pending, every 250 ms (`RECEIPT_POLL_MS`; starknet.js waits
5 s by default), and only until that receipt arrives. The writer takes an explicit `tip` (0 on
devnet: starknet.js 8.9's tip estimate wants 10 V3 transactions per block and stalls a fresh node).
A rejected write (fee estimation, a contract assert found by the simulation, a reverted receipt)
is a `WriteError` with the reason. Writes are serialised in `PavedWriter`: while one is pending, a
second is refused, so a double click on "confirm" never sends two transactions; `GameSession` also
ignores a move while its own write is pending. The events of every receipt go to the event reader,
which keeps the `GameSpawned` / `GameOver` of this client and merges them into the lists: a game
just spawned is listed even when the node's `latest` block lags behind the receipt.
A Daily spawn first reads `Daily.entry_price()` (O-23: the token and the amount `spawn` pulls, from
the same source) and approves exactly that, in the same multicall as `spawn`; a free entry sends
no approve. The landing page shows the same view as the Daily entry fee, with these rules, so that the
client pays a Daily entry only for an amount the player saw and confirmed with a click:

- The fee is read on connect, when the page becomes visible and after each write. The Daily confirm
  is disabled while the read is loading or failed ("Entry price unavailable"); resuming a game
  and the free Tutorial need no fee.
- The amount is formatted with the decimals of the deployment's token only. If `entry_price().token`
  is another token, the card says "Unknown token" and the confirm is refused (and `spawn` refuses it
  too).
- The consent to start a game is the **history state** of the landing page's confirm
  (`navigate("/game?mode=daily", { state: { start: true, confirmedAmount } })`, `utils/start-game.ts`),
  which a link cannot set: the URL carries only `mode` and `id`, and `spawn` or `price` in a URL are
  ignored. The state holds the amount the player saw (a plain integer, base unit) and the game page
  passes it to `spawn`, which reads the price again; if it differs, nothing is sent and the page says
  "The entry price changed: confirm again" (`EntryPriceChangedError`).
- The state is cleared (`navigate(..., { replace: true, state: null })`) **before** anything is sent,
  at mount of the game page, whether or not the writer is ready: the intent then lives in a ref
  until the start uses it. A reload, Back, a refused spawn or a failed one cannot pay again: the
  player confirms again. A Daily consent without a valid amount, or no state at all, starts nothing.
- A consent held for a writer that is not ready (no account yet) expires after 30 s: the intent is
  dropped and the page says "Not connected: confirm again on the landing page". A start that
  finishes after the page was left (the browser's Back during the flight) does not navigate; the
  game shows in "my games" anyway.
- While the start is in flight the page says "Spawning game..." and its Back button is disabled
  (a local `starting` state; the consent being cleared, the history state no longer says that a
  start is wanted). A refused or failed start shows its error with Back enabled.

What this guarantees is that the client never pays an amount the player did not see and confirm by
a click; it does not make the price atomic with the spawn. The approve is built from a read made
just before `execute` (`entry_price`, then the multicall), so the contract could change the price
in between: accepted for the MVP, where the owner is the only one who can upgrade it.

Kept from the old code: the plain `Account` from an address and a private key (a devnet
predeployed account, from `VITE_PLAYER_ADDRESS` and `VITE_PLAYER_PRIVATE_KEY`, on devnet only; the
old hard-coded Katana master key is gone), and the Cartridge controller placeholder
(`auth/controller.ts`), whose policies are now built from the deployment's addresses (refused
when it is not configured: no policy on an empty target). The controller is the only signing path
outside devnet; until it is wired, other networks are read-only. Dropped:
the Dojo burner manager (`@dojoengine/create-burner`).

### Surrender, claim, sponsor, name (t-0028)

- **Surrender**: a button on the game screen, enabled for the player's own unfinished game with no
  write pending; it opens a confirm dialog with the score the game ends with, and only "Confirm
  surrender" calls `GameSession.surrender` (the writer serialises it; a pending write disables the
  button). A reverted surrender is the same `writeError` notice as any write.
- **Claim a Daily prize** (landing): the claimable tournaments are found from **events and views**:
  the `tournament_id` of the player's finished Daily games (`GameOver`, `countedTournamentIds`; 0
  means the game did not count), newest 30, then one `Daily.tournament(id)` each. A rank is claimable
  when the tournament is `over`, the player's id is the holder of rank 1, 2 or 3, that rank is not
  `claimed` and its reward is above 0 (`claimableRanks`). The reward is computed from the view as the
  contract does (`rewardOf`: third a sixth of the prize, second a third of the rest, first the
  remainder). It is read on connect, on visibility and after a claim. No new event is needed.
- **Sponsor** (landing): an amount field in the token's decimals (`parseTokenAmount`: positive, at
  most `decimals` fraction digits); the button only opens the confirm, which shows the amount; the
  confirm sends `approve` + `sponsor` of exactly that amount in one multicall.
- **Paying and paid actions keep the Daily rule**: an explicit confirm, the amount shown, and the
  amount re-checked at send. The panel reads the field again at the confirm click and hands the writer
  the amount it confirmed: `sponsor(amount, { confirmedAmount })` refuses a difference
  (`SponsorAmountChangedError`) and an amount of 0; `claim(id, rank, { confirmedReward })` reads the
  tournament again and refuses a changed reward (`RewardChangedError`), a rank already claimed or a
  tournament not over (`WriteError`), sending nothing. Both options are required.
- **Player name**: a field on the landing page when "Create Account" is offered; 1 to 31 printable
  ASCII characters (`playerNameError`), checked before anything is sent, and again by the writer.

## Views

The views sit behind one interface, `GameViews` (`views.ts`): `game`, `tiles` (pages of 64 until a
short page), `builder`, `characters`, `tournament`, `currentTournamentId`. `RpcGameViews` calls the
contracts; `FakeGameViews` holds games in memory for unit tests of the app.

Every game read names its contract: game ids are counted per contract, so the client's game key is
`(mode, game_id)` (`mode` 1 = Daily, 3 = Tutorial).

Reverts are mapped to typed errors (`ViewError`), from the message as text or as the hex of its
short string (devnet 0.10 gives only the hex): `Game: does not exist` gives `game-not-found`,
`View: not the game player` gives `not-player`, a layout the ABI does not describe `abi-mismatch`, anything else `rpc`. The game page shows "game not
found" and "not your game: read only" for the first two.

## Events

`EventReader` (`events.ts`) reads `starknet_getEvents` from `deployed_block`, page by page
(continuation token), and decodes the events from the ABIs. Lists use the keys, so the node does the
filtering:

- "My games": `GameSpawned` with keys `[[selector], [], [player]]` on `Daily` and on `Tutorial`.
- "My finished games": `GameOver` with the same filter. A spawned game with no `GameOver` is active.
  Tutorial has no tournament: its `GameSpawned`, `GameOver` and `game` give `tournament_id` 0 and
  `end_time` 0 (#205), read as they are.
- The receipt of a write: its events from the contract written to.

## Who reads what, and when

| UI | Read | When |
|---|---|---|
| Landing: player registered, name | `Account.player(address)` | on connect, after `create` |
| Landing: balance | `Token.balance_of(address)` | on connect, after a write that pays |
| Landing: my games, active and finished | `GameSpawned` + `GameOver` events (both game contracts), then one `game` view per listed game (the active ones and the 10 latest finished) for its counts | on connect, when the page becomes visible |
| Landing: today's tournament (prize, top 3, end) | `Daily.current_tournament_id` + `Daily.tournament(id)` | on connect, when the page becomes visible |
| Landing: Daily entry fee | `Daily.entry_price()` | on connect, when the page becomes visible, after a write |
| Daily spawn: the approve | `Daily.entry_price()` | before each Daily spawn |
| Game page with a consent in its history state (the landing page's confirm only) | `GameSpawned` / `GameOver` of the mode: resume the active game, else `spawn` | once, then the consent is cleared |
| Leaderboard screen (`/leaderboard/:day?`) | indexer `tournaments`, `leaderboard` (limit, offset); today's id from `Daily.current_tournament_id` | on open, when the page becomes visible, on paging |
| Player screen (`/player/:id`) | indexer `player`, `playerGames` (before), `playerTournament` per listed day | on open, when the page becomes visible |
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

## Indexer client

`packages/chain/src/indexer.ts` reads the indexer's API v1 (`docs/architecture/indexer.md`, "Read API"). It is for
display only: a prize amount, who may claim and whether a rank was claimed come from the contract's `tournament`
view, never from here.

- `IndexerClient({ url })` has one method per route (`head`, `tournaments`, `tournament`, `leaderboard`, `player`,
  `playerGames`, `playerTournament`, `game`), checks its ids before sending, and returns rows in camelCase.
- Every answer is `{ data, head, behind, freshness }`. `freshness` is `ok` up to `maxLag` blocks behind (default 5,
  the indexer doc's figure) and `behind` above it; the screens print `behind` as it is.
- Errors are `IndexerError` with a `kind`: `not-configured` (no URL), `unreachable` (the request failed, timed out
  after 10 s, or a 5xx without an envelope), `wrong-version` (envelope `version` is not 1, checked first), `unavailable`
  (503: `status` is `loading`, `rewinding` or `halted`), `not-found` (404), `rejected` (400, or an id refused
  before sending) and `bad-response` (the shape is not the doc's: nothing is guessed).
- The base URL is `VITE_INDEXER_URL`; the deployments file is not touched. With none, `createIndexerClient` gives
  `null` and the screens say "Leaderboard unavailable": no request, no placeholder rows.
- `IndexerProvider`, `useIndexer` and `useIndexerRead` follow the rules of `useRead`: a read on its inputs, on
  `refresh`, and on visibility; no timer. After a failure the last answer stays in `data`, so a screen can show it
  marked stale beside the error.
- Not done: the `head.hash` check against the node's block (the fork guard of the indexer doc) and the fallback to the
  on-chain top 3 when the indexer is down.
- Tests run against `FixtureIndexer` (`indexer-fixture.ts`), an in-process `fetch` built from the doc's examples that
  refuses parameters as the API does and can be put `behind`, `loading`, `rewinding`, `halted`, `down` or on another
  `version`. No real indexer exists yet.

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
`characters` for the game's player), and moves only on this client's writes, as above. The scene draws the last tiles and characters it was given once its models are loaded, so the
game page no longer re-sends the board on scene ready. A read that
fails after a successful write is a `readError` ("Move applied; refresh failed"), not a write error.

`/game?mode=..&id=..` shows a game. Only a consent in the history state, from the landing page's
confirm, starts one (a Daily spawn pays the entry); a bare `/game` URL, a link with `spawn=1` and a
reload after the consent was cleared spawn nothing ("No game selected"), and a malformed id shows
"Game not found". `useRead` says when a read has answered
(`loaded`): "Create Account" is offered only once the player read has answered "none", never while
it is in flight or failed, and the landing page shows the errors of its reads with a "Retry".

## Not connected

`ConnectionBanner` (app-web) says why writes are not offered. `not-configured`: the deployment
misses addresses or the RPC URL; no write button, no spawn, and the game page shows "Not connected".
`read-only`: no playing account; games open read-only and the landing page offers no start. A game of
another player opens read-only with "Not your game: read only"; a missing game shows "Game not
found".
