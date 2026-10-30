# Client data layer (P-10)

> History note: `packages/app-web`, which this document names, was removed in P-70; see git history.

How the web client reads and writes the native contracts (`contracts/`, since P2). No Torii, no
Dojo, no polling. The contract side is `native-storage.md` (events, access) and
`public-interface.md` (views). The code is `packages/chain`.

## Sources

| What | From | Override |
|---|---|---|
| ABIs of `Challenge` and `Setup` (the entry token reads with `Faucet.json`; the `Tutorial` and `Lobby` ABIs left with D-21 and D-24, `Account` with D-25 (E)) | `contracts/abis/<Contract>.json` (committed by CORE, imported at build time) | none |
| RPC URL, chain id, addresses, `deployed_block`, token decimals and symbol | `contracts/deployments/<network>.json` (O-19, written by CORE's deploy script); `<network>` is `VITE_NETWORK`, default `devnet` | env, see below |
| The playing account | the device's local key (#918, phase A; [accounts.md](accounts.md)), kept in `localStorage`. Its account's deployer, **devnet only**: `VITE_DEPLOYER_ADDRESS` and `VITE_DEPLOYER_PRIVATE_KEY` (the node's first predeployed account); ignored on any other network, since a key in a built bundle is public | none; without them a devnet account's first write is refused |

The env variables of `packages/app-web` (`src/utils/network.ts`), each one set overriding the file:

| Variable | Overrides |
|---|---|
| `VITE_RPC_URL` | `rpc_url` (a public network's file holds the placeholder `$STARKNET_RPC_URL`, which is never used as a URL: without this variable a Sepolia build is "not connected", `missing: ["RPC URL"]`) |
| `VITE_DEPLOYED_BLOCK` | `deployed_block` |
| `VITE_CHALLENGE_ADDRESS`, `VITE_SETUP_ADDRESS` | `contracts.<Contract>.address` (the contracts, not the player); `Setup` is optional (see below). `VITE_ACCOUNT_ADDRESS` left with D-25 (E) |
| `VITE_SUPPORTS_TOKEN_MINT` | the test token's faucet; default on for `devnet` and `sepolia`, off elsewhere (it still needs a Faucet: mainnet resolves none) |
| `VITE_COLLECTION_ADDRESS` | the game NFT's Collection (overrides `contracts.Collection` and the indexer's head, all optional; see "Game NFT") |

The app reads every `contracts/deployments/*.json` at build time (`import.meta.glob`, which
tolerates a missing folder) and picks `<network>.json`.

`resolveDeployment` (`packages/chain/src/deployment.ts`) merges the file and the env, env first. A
missing address, or a missing file with no env, gives a deployment with `configured: false`.
`configured` is computed there once, from the two required addresses (Challenge, Token) and the RPC URL. The app
shows a "not connected" state and no write button while it is false. `Setup` (D-24, D-25: the quests, the achievements
and the tutorial claim) is resolved from `contracts.Setup` (the key of step D's deploy script) but is not part of
`configured`: a deployment from before step D (Sepolia until the fresh deployment, P-53) has none and stays connected,
and only the tutorial claim is unavailable. An old file's `contracts.Tutorial` and `contracts.Account` (D-25 (E)) are not
read.

**D-23.** The contract `Daily` is named `Challenge` since D-23 (`public-interface.md`, "Breaking change D-23"): its ABI
becomes `contracts/abis/Challenge.json` and a fresh deployment file's key `contracts.Challenge`; entry point and event
names (selectors) and `mode` code 1 do not change. The live Sepolia file keeps `contracts.Daily` until the fresh
deployment (F), and main's client never goes to Sepolia before F: `packages/chain` imports `Challenge.json` and reads
`contracts.Challenge` only (and `VITE_CHALLENGE_ADDRESS`), with no fallback to `contracts.Daily` (CLIENT's W1e).

Only the keys above are read: any other key of the file, such as `classes` (the declared library
class `Lobby` of P-26, which has no address; the class left with D-24), is ignored.

The token is labelled `PAVED` whatever its on-chain symbol (D-10, which replaces D-2's old label; reading the symbol waits for P8's token); `decimals` comes from the file
(no default: when the file does not say, `tokenDecimals` is `null` and the app shows no
amount and offers no Challenge confirm, rather than assume 18).

### Sepolia (D-16, P-39)

A build with `VITE_NETWORK=sepolia`, `VITE_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` and
`VITE_INDEXER_URL=https://api.paved.bal7hazar.com` plays on CORE's deployment (`contracts/deployments/sepolia.json`, S-1). What
differs from devnet:

- **Addresses**: all from the file. The old `Token` is gone (CORE's file has one key per contract): the only required address is `Challenge`.
  The entry token is the address `Challenge.entry_price` names (the Faucet, on devnet and Sepolia), read at run time.
  `Economy`, `PavedToken`, `Vault` and `Faucet` give the economy, whose USDC is the Faucet.
- **RPC**: the file's `rpc_url` is the placeholder `$STARKNET_RPC_URL`. `resolveDeployment` takes an `rpc_url` only when it is
  an `http(s)` URL without a `$`, so the placeholder is never called; without `VITE_RPC_URL` the build says "Not connected to
  sepolia: RPC URL missing" (`configured: false`). The RPC is Cartridge's, not Zan's (which rate-limits reads with -32011).
- **Signer**: the Cartridge controller, as on mainnet (the env's burner key is devnet only). Writes pass no tip: starknet.js's own
  estimate (only devnet passes 0).
- **Faucet**: `Faucet` is resolved on `devnet` and `sepolia` (`FAUCET_NETWORKS`) and nowhere else; `mint` is a session
  policy where it is (see "Signing"). The faucet button is offered on Sepolia
  (`supportsMint`), and never on mainnet.
- **Pool quote**: `Economy.quote_swap` on the MockRouter (`EconomyPoolQuoter`), as on devnet: Ekubo serves no Sepolia. Mainnet keeps
  Ekubo's quoter; its route guard (a single hop through `Economy.pool()`) is a separate mainnet gate, not done here.
- **Block time**: 1.72 s, measured on 2026-10-11 (1,000 blocks took 1,720 s at block 16421969).

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
contract version, e.g. an orientation code added by a later contract version) decodes to a **bare number**, only for an enum whose listed variants are all unit variants (an
unknown variant of an enum with a payload variant could carry felts of unknown length: the codec
throws); the consumer must handle a code it does not know (treat it as "unknown"), as `public-interface.md` says.

Writes go through a starknet.js `Account` (`client.writer(account, { tip })`, a `PavedWriter`): `spawn`
(Challenge: `approve` + `spawn` in one multicall), `build`, `discard`, `surrender`,
`mint` (test token). D-20 removed `claim` and `sponsor` (and the reclaim, a `claim` of rank 0) with the prize. After D-18 (characters leave the game) `build` takes a tile, an orientation and a position, with no role and no spot, and there is no role picker; the chain and UI changes land in D-18 PR 1 (chain) and PR 2 (UI, renderer, app-web). Art from `packages/app-web/public/assets` stays limited to real files of the package, kept to the ones the packages load (`__tests__/public-assets.test.ts` fails when a path used in code is missing). Each write waits for its own receipt and returns its decoded events: the one
request repeated while a transaction is pending, every 250 ms (`RECEIPT_POLL_MS`; starknet.js waits
5 s by default), and only until that receipt arrives. The writer takes an explicit `tip` (0 on
devnet: starknet.js 8.9's tip estimate wants 10 V3 transactions per block and stalls a fresh node). Sepolia, like every
other network, passes no tip: the account takes starknet.js's own estimate (`AppNetwork.tip` is `undefined`).
A rejected write (fee estimation, a contract assert found by the simulation, a reverted receipt)
is a `WriteError` with the reason. Writes are serialised in `PavedWriter`: while one is pending, a
second is refused, so a double click on "confirm" never sends two transactions; `GameSession` also
ignores a move while its own write is pending. The events of every receipt go to the event reader,
which keeps the `GameSpawned` / `GameOver` of this client and merges them into the lists: a game
just spawned is listed even when the node's `latest` block lags behind the receipt.
A Challenge spawn first reads `Challenge.entry_price()` (O-23: the token and the amount `spawn` pulls, from
the same source) and approves exactly that, in the same multicall as `spawn`; a free entry sends
no approve. The landing page shows the same view as the Challenge entry fee, with these rules, so that the
client pays a Challenge entry only for an amount the player saw and confirmed with a click:

- The fee is read on connect, when the page becomes visible and after each write. The Challenge confirm
  is disabled while the read is loading or failed ("Entry price unavailable"); resuming a game
  needs no fee.
- The amount is formatted with the decimals of the deployment's token only. If `entry_price().token`
  is another token, the card says "Unknown token" and the confirm is refused (and `spawn` refuses it
  too).
- The consent to start a game is the **history state** of the landing page's confirm
  (`navigate("/game?mode=challenge", { state: { start: true, confirmedAmount } })`, `utils/start-game.ts`),
  which a link cannot set: the URL carries only `mode` and `id`, and `spawn` or `price` in a URL are
  ignored. The state holds the amount the player saw (a plain integer, base unit) and the game page
  passes it to `spawn`, which reads the price again; if it differs, nothing is sent and the page says
  "The entry price changed: confirm again" (`EntryPriceChangedError`).
- The state is cleared (`navigate(..., { replace: true, state: null })`) **before** anything is sent,
  at mount of the game page, whether or not the writer is ready: the intent then lives in a ref
  until the start uses it. A reload, Back, a refused spawn or a failed one cannot pay again: the
  player confirms again. A Challenge consent without a valid amount, or no state at all, starts nothing.
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

**Spawn paused (G4).** Challenge has an emergency stop on `spawn` only: a guardian set by the owner (or the owner) calls
`pause_spawn`, the owner calls `unpause_spawn`; the views are `spawn_paused() -> bool` and `guardian()`
(`GameViews.spawnPaused()`, `GameViews.guardian()`). Build, discard, surrender, the record and the settlement keep working
while paused, so a game already bought is played to its end. The client wraps no pause entry point (the owner's tools are
CORE's) and has no Controller policy for them. The purchase path reads `spawn_paused()` before it builds any call
(`SpawnPausedError`, nothing sent); a `'Challenge: spawn paused'` revert that still comes back after a race maps to the same
error. A failed `spawn_paused` read keeps today's behaviour: the purchase is not blocked by the client, the contract is the
guard. The indexer skips the three pause events by name (`packages/indexer/README.md`).

**A game's 24 hours (S1).** A Challenge game takes moves for 24 h from its start. `GameView.expires_at` (`expiresAt`, the last
field of the view) is the start plus 86,400; from that second on `build` and `discard` revert with `'Game: expired'`, and
`surrender` stays open: an expired game ends only when its player surrenders, is recorded by the Economy as expired (its
score, no reward, no mean) and is settled for 0. The client types the revert as `GameExpiredError` (`writer.ts`, from the
fee estimation or the receipt, text or short-string hex), whose message is true to that rule: "This game has expired: its
24 hours are over. Surrender to close it: its score is recorded, but an expired game earns no reward." `GameSession` checks `expiresAt` against the
time it is given (the clock by default, the block time in the e2e) before a `place` or a `discard` and sends nothing;
`surrender` has no pre-check. The game page shows the message through its existing `writeError` notice. A game bought
before the upgrade has the same 24 h from its stored start. `EconomyWriter.settle` still refuses a recorded expired
game client-side ("is expired: no reward"), while the chain settles it for 0: left to the economy track.

**The initial seed (S1).** `initial_seed(game_id) -> felt252` (`GameViews.initialSeed`) is the seed the game started with,
before the deck's withdrawal and the first draw: `Poseidon(0, Challenge, game_id)`. `tiles()` stays in draw order with
statuses, so `EngineGame.start({ deck: "simple", seed })`, then each tile in order (`build` at its position, or `discard`,
which reseeds on `(CENTER, CENTER)` as the contract does though `tiles()` reports `(0, 0)`), gives the chain's current
seed, the tile in hand and the score, with no extra call per move. It holds for every game deployed after G1.

Kept from the old code: the plain `Account` from an address and a private key (a devnet
predeployed account, from `VITE_PLAYER_ADDRESS` and `VITE_PLAYER_PRIVATE_KEY`, on devnet only; the
old hard-coded Katana master key is gone), and the Cartridge controller placeholder
(`auth/controller.ts`), whose policies are now built from the deployment's addresses (refused
when it is not configured: no policy on an empty target). The controller is the only signing path
outside devnet, now wired: see [Signing](#signing). Dropped:
the Dojo burner manager (`@dojoengine/create-burner`).

### Surrender, name (t-0028)

- **Surrender**: a button on the game screen, enabled for the player's own unfinished game with no
  write pending; it opens a confirm dialog with the score the game ends with, and only "Confirm
  surrender" calls `GameSession.surrender` (the writer serialises it; a pending write disables the
  button). A reverted surrender is the same `writeError` notice as any write.
- **Player name**: gone with D-25 (E); see [Identity](#identity-d-25-e).

## Identity (D-25 (E))

`Account` left the deployment (CORE's step E, `docs/briefs/e-account-out.md`): nothing registers a player, and
`PlayerCreated` is emitted by nothing deployed.

- **The player is the wallet address.** Any connected wallet buys and plays with no step before: `createPlayer`,
  `PavedClient.player` and the landing page's name flow are gone, and so is the `Account.create` session policy.
- **One form of the id.** Where an id is compared or sent to the indexer it is `indexerPlayerId(address)`: `0x` and 64
  lowercase hex digits, the form the indexer stores (66 characters). The connected player is `useMe()`
  (`app-web/src/utils/player-label.ts`).
- **Names are off chain.** The connected player's name is their Controller username
  (`ControllerConnector.username()`, held by `WalletProvider` as `username`), shown on the landing page and on their own
  rows of the leaderboard, the player page and the Challenge top 3 (`usePlayerLabel`). It wins over any other source.
- **Other players' names (N1).** The indexer looks Cartridge usernames up in the background (`POST
  https://api.cartridge.gg/lookup`, `{"addresses": [...]}`: public, read-only, undocumented, the route Glitchbomb uses),
  keeps them in a `names` table of its SQLite (schema 10) and adds `name: string | null` to `leaderboard.entries[]`,
  `players/{id}` `player` and `players/{id}/tournaments/{day}` `entry`, from that cache only: null until resolved. The
  client reads it as `name` (`LeaderboardEntry`, `IndexedPlayer`; a missing key from an older indexer reads null) and
  `playerLabel(id, me, name)` shows the connected player's username, else the indexer's `name`, else the short address
  (`shortId`). A name is display data: never stored by the client, never an identity, never in a link (those use the
  address). The lookup failing, off (`--no-names`) or finding nothing leaves the short address. Devnet's burner has no
  username: its short address shows. If Cartridge objects or the endpoint breaks for good, the decision is reversed.
- **Wiring.** The client reads no Economy or Collection address from a contract view (not from Challenge, not from Account,
  not from Setup's wiring view): it resolves them from the deployment file, as before (`economy/deployment.ts`,
  `deployment.ts`). Setup's wiring view is the contracts' source; the indexer checks Setup's `EconomySet` and
  `CollectionSet` against the same file.
- **The referrer** is any non-zero address other than the payer, the Challenge and the Economy: see `client-economy.md`.

## Views

The views sit behind one interface, `GameViews` (`views.ts`): `game`, `tiles` (pages of 64 until a
short page), `builder`, `currentDay` (`Challenge.current_day`, `IChallengeView`; `current_tournament_id` before D-20), `entryPrice`,
`initialSeed(game)` (S1) and `tutorialClaimed(player)` (`Setup.tutorial_claimed`, D-21).
The `tournament` view and its `TournamentView` left with D-20. `RpcGameViews` calls the
contracts; `FakeGameViews` holds games in memory for unit tests of the app.

Every game read names its contract: the client's game key is `(mode, game_id)`, and since D-21 the one mode is Challenge
(`mode` 1; 2 was Weekly and 3 the on-chain Tutorial, never given again).

Reverts are mapped to typed errors (`ViewError`), from the message as text or as the hex of its
short string (devnet 0.10 gives only the hex): `Game: does not exist` gives `game-not-found`,
`View: not the game player` gives `not-player`, a layout the ABI does not describe `abi-mismatch`, anything else `rpc`. The game page shows "game not
found" and "not your game: read only" for the first two.

## Events

`EventReader` (`events.ts`) reads `starknet_getEvents` from `deployed_block`, page by page
(continuation token), and decodes the events from the ABIs. Lists use the keys, so the node does the
filtering:

- "My games": `GameSpawned` with keys `[[selector], [], [player]]` on `Challenge`.
- "My finished games": `GameOver` with the same filter. A spawned game with no `GameOver` is active.
- The receipt of a write: its events from the contract written to.

## Who reads what, and when

| UI | Read | When |
|---|---|---|
| Landing: the player and their name | the connected address; the Controller username (`WalletProvider`), else a short address | on connect |
| Landing: balance | `Token.balance_of(address)` | on connect, after a write that pays |
| Landing: my games, active and finished | `GameSpawned` + `GameOver` events (both game contracts), then one `game` view per listed game (the active ones and the 10 latest finished) for its counts | on connect, when the page becomes visible |
| Landing: today's day (its end) | `Challenge.current_day` (D-20: no prize and no on-chain top 3 any more) | on connect, when the page becomes visible |
| Landing: Challenge entry fee | `Challenge.entry_price()` | on connect, when the page becomes visible, after a write |
| Landing: new games paused | `Challenge.spawn_paused()` (G4) | on connect, when the page becomes visible, after a write |
| Purchase dialog: new games paused | `Challenge.spawn_paused()` | on open, when the page becomes visible |
| Challenge spawn: the pause, then the approve | `Challenge.spawn_paused()`, then `Challenge.entry_price()` | before each Challenge spawn |
| Game page with a consent in its history state (the landing page's confirm only) | `GameSpawned` / `GameOver` of the mode: resume the active game, else `spawn` | once, then the consent is cleared |
| Leaderboard screen (`/leaderboard/:day?`) | indexer `tournaments`, `leaderboard` (limit, offset); today's id from `Challenge.current_day` | on open, when the page becomes visible, on paging |
| Player screen (`/player/:id`) | indexer `player`, `playerGames` (before), `playerTournament` per listed day | on open, when the page becomes visible |
| Quests screen (`/quests/:day?`) | indexer `playerQuests(player, day)`, `playerAchievements(player)`, `definitions`; the player id is the connected address (D-25 (E)); today's id from `Challenge.current_day`; the day list from `tournaments` | on open, when the page becomes visible, on a day change |
| Player screen: quests and achievements | indexer `playerQuests`, `playerAchievements` (not `definitions`), same day rules | on open, when the page becomes visible, on a day change |
| Game: board | `tiles(game_id, 0, 64)` | on open |
| Game: tile in hand, score, counts, over | `game(game_id)` | on open, after each write (reconcile) |
| Game: tile in hand (builder) | `builder(game_id, player)`: `game_id`, `player_id`, `tile_id`, `plan` (four fields; the two counters and the `characters` view are gone with D-18) | on open, after each write (reconcile) |
| Game: placement shown | receipt events `Built`, `Scored`, `Discarded`, `GameOver` | when the receipt arrives |

A placement is shown in three stages: the tile is drawn at once as pending (local state); when the
receipt arrives, its `Built` event confirms the tile (plan, orientation, position: a move is a tile, an orientation and a position),
`Scored` adds points and `GameOver` ends the game, without re-reading the board; then one
`game` + `builder` read reconciles the score and the next tile. The points a move scored show from its receipt's `Scored` events (one per closed structure, even at 0 points; a forest gives one, with its closed roads plus its closed cities). The board is not read again.

Why no polling: a game is single-player and only its player can write it (`native-storage.md`,
access control), so its state changes only through the client's own transactions, whose receipts
the client waits for. The leaderboard changes when other players finish games; it is read again on
visibility and on demand, not on a timer. A live feed (a websocket subscription or META's indexer)
can replace that later.

## Indexer client

`packages/chain/src/indexer.ts` reads the indexer's API v1 (`docs/architecture/indexer.md`, "Read API"). It is for
display only. Since D-20 the contracts keep no prize and no ranking: the daily leaderboard is the indexer's own.

- `IndexerClient({ url })` has one method per route (`head`, `tournaments`, `tournament`, `leaderboard`, `player`,
  `playerGames`, `playerTournament`, `game`, and the P7 routes `definitions`, `playerQuests(player, { day })`,
  `playerAchievements(player)`), checks its ids and days before sending, and returns rows in camelCase.
- Every answer is `{ data, head, behind, freshness }`. `freshness` is `ok` up to `maxLag` blocks behind (default 5,
  the indexer doc's figure) and `behind` above it; the screens print `behind` as it is.
- Errors are `IndexerError` with a `kind`: `not-configured` (no URL), `unreachable` (the request failed, timed out
  after 10 s, or a 5xx without an envelope), `wrong-version` (envelope `version` is not 1, checked first), `unavailable`
  (503: `status` is `loading`, `rewinding` or `halted`), `not-found` (404), `rejected` (400, or an id refused
  before sending) and `bad-response` (the shape is not the doc's: nothing is guessed).
- A `429` is the indexer's own per-address rate limit (P-43): it is busy, not broken. The client waits the `Retry-After`
  seconds (capped at `MAX_RETRY_AFTER_SECONDS`, 10 s) and asks once more. A second `429`, or a `429` with no `Retry-After`
  in whole seconds, ends as a `rejected` error with `httpStatus` 429, the same fall-back as any indexer error (the bounded RPC
  scans where they exist). One retry at most, never a loop; every other status is read as before.
- The base URL is `VITE_INDEXER_URL`; the deployments file is not touched. With none, `createIndexerClient` gives
  `null` and the screens say "Leaderboard unavailable": no request, no placeholder rows.
- `IndexerProvider`, `useIndexer` and `useIndexerRead` follow the rules of `useRead`: a read on its inputs, on
  `refresh`, and on visibility; no timer. After a failure the last answer stays in `data`, so a screen can show it
  marked stale beside the error.
- As built (`indexer.md`, "As built"): `head()` does not read `checks` (D-20 removed `checks.tournaments_checked` and
  `checks.last_mismatch` with the cross-check against the `tournament` view; a leaderboard row has no `prize_ranks`), and
  ignores any other key, known or later, and a missing `checks`; the 503 of `/v1/head` when the state is
  not `ok` is `unavailable` with its `status`, like every other route; a game row's days are `day_id` and
  `counted_day_id` (`dayId`, `countedDayId`; `tournament_id` and `counted_tournament_id` before D-20); a game that is
  still running answers `score`, `counted_day_id` and `end_time` as null, which the client reads as 0 and shows as "In progress"; a null on a
  game with `over` true is `bad-response`.
- A read never shows another input's answer: `useAsyncRead` (and so `useIndexerRead`) hides what was read for earlier
  inputs at once, in the render that changes them, so the leaderboard never shows rows of another day or page, nor
  another day's failure. A refresh of the same inputs still keeps its last answer, marked stale.
- A `tournament` answer for an id near `MAX_TOURNAMENT_ID` carries `start_time` above 2^53; the client refuses it as
  `bad-response` (reported to META).
- Not done: the `head.hash` check against the node's block (the fork guard of the indexer doc). There is no on-chain top 3
  to fall back to since D-20.
- Tests run against `FixtureIndexer`, imported from `@paved/chain/testing` only (not from the public entry, so no app code can reach it), an in-process `fetch` built from the doc's examples that
  refuses parameters as the API does and can be put `behind`, `loading`, `rewinding`, `halted`, `down` or on another
  `version`; `RUNNING_GAME` is a game row as the real indexer writes a running game. Its answers follow the real
  indexer's as built. `packages/chain/test/indexer-real.test.ts` also runs the client against the real
  `packages/indexer` started in-process over its own fake node (an in-memory SQLite, a free local port, real HTTP):
  every route, paging, a running game, `halted` (503 on `/v1/head` too), CORS. Run on devnet is configured in
  `packages/README.md`; the end-to-end check on a live devnet waits for CORE's regenerated `devnet.json`.

### Quests and achievements (P7, display only)

- The three routes are validated field by field against `indexer.md`: a missing key, a count above its target, a task
  list that is empty, `completed` without `completed_at` (or the reverse), `completed` that disagrees with the counts,
  `retired` that disagrees with `retired_at`, and an answer about another player or another day than the one asked are all
  `bad-response`. Nothing is guessed. A player the indexer does not know has zero counts (200, not an error); a day with no
  quest is an empty list.
- Titles and descriptions are not on chain: `app-web/src/utils/quests-view.ts` keys them by id from the accepted list
  (`quests.md`, P-22). The targets shown are always the chain's (`definitions`, and the `total` of each task), never copied
  into the client, because they are first guesses to be calibrated. An id the list does not know shows by number, without
  a description.
- **No reward is shown or promised anywhere.** Achievement points are shown as points, never as a grant. The tests assert no
  `reward`, `prize`, `claim` or token label on these screens. "On the Podium" is credited by the indexer after the day
  closes, from its own daily leaderboard (D-20); the screen says so and nothing more.
- States, as for the leaderboard: not configured (`Quests unavailable`, no request), loading, unavailable by kind (down,
  halted, rewinding, loading, another API version, unexpected answer) with Retry for each read, stale (the rows stay with
  the reason after a failed refresh), and one lag line (`progress-lag`) for the furthest-behind of the screen's reads.
  Not connected and "no player yet" are said in words; the definitions still show.
- The day picker is the leaderboard's (`DayPicker`, `useDays`): the days the indexer lists, today from the contract. The
  quest `interval_id` is not the day (it counts from the quest's own `start`), so the screens use the requested `day`.
- Tests: `packages/chain/test/indexer-quests.test.ts` (fixture, every error case), the new cases of
  `indexer-real.test.ts` (the real indexer: a player with progress, one with none, an unknown one, a day with no quest, a
  retired quest, a halted indexer) and `app-web/__tests__/{quests,player}-page.test.tsx` (jsdom, every state).

## Tests

- Unit tests (`packages/chain/test/*.test.ts`) replay RPC answers recorded from devnet
  (`test/fixtures/devnet.json`) and check the TS view types against the ABIs.
- `bun run test:devnet` in `packages/chain` (needs `scarb build` in `contracts/`, `starknet-devnet`
  0.10 and `universal-sierra-compiler`): starts a devnet, declares and deploys Token, Account, Setup and Challenge in
  the test setup only (Challenge an allowed reporter of Setup), claims the tutorial twice, plays a Challenge game (spawn,
  discard, surrender), lists the games from events and checks the error mapping. Its Challenge spawn predates E3 (a Challenge
  game is bought by the economy writer since), so that step waits for a port. `PAVED_RECORD=1` rewrites
  the fixtures. CI does not run it (no devnet there).

## The tutorial claim (U2, D-21, P-49)

The tutorial is off chain (`/tutorial`, no chain client). Its achievement, First Stone (achievement 1, task 10
`TUTORIAL_FINISHED`), is claimed on chain from a chain route, `/tutorial/claim`, which the tutorial's end links to:

1. No Setup in the deployment: the page says the claim is unavailable. No wallet: it says so, with the controller's
   Connect where there is one.
2. It reads `Setup.tutorial_claimed(address)`. True: "Already claimed", and nothing is sent.
3. Otherwise one press sends one `Setup.claim_tutorial()` (`PavedWriter.claimTutorial`, a session policy of the
   controller). The call is idempotent and unchecked on chain: the first one emits `AchievementProgressed { task 10,
   count 1 }` from Setup ("Claimed"); a later one has no effect, no revert and no event ("Already claimed": the receipt
   tells them apart). A refused call shows its reason and may be tried again.

The indexer credits the claim as any achievement progress from Setup (`packages/indexer/README.md`).

## Game NFT

CORE's E5b mints one soulbound token per game at spawn (`contracts/src/systems/collection.cairo`). A game's NFT is
(Collection address, token id): a game's token id is its game id (the Tutorial's `2^32 + game id` left with D-21)
(`nftOf(mode, gameId)` in `packages/chain/src/nft.ts`, BigInt, a game id outside the u32 range is refused). The
Collection address comes from `VITE_COLLECTION_ADDRESS` (an operator override), else `contracts.Collection` of the
deployments file, else the indexer's `/v1/head` `contracts.collection` (`collectionAddress`; the head is read only when
the first two are unset); the file's key is
optional and a deployment without it stays `configured`. With no address known the screens show no NFT, not an error.

- **Indexer rows**: `GameRow.token_id` is read as `tokenId`: a safe integer, or `null` for a game spawned before the
  Collection existed, or undefined from an indexer that predates schema 5. The player page shows an NFT only for a row
  with a token id (the id is the indexer's, never computed there); any other type is a `bad-response`. The game page,
  which has no row, uses the rule above and shows the NFT only after one `owner_of(token_id)` call resolves; a failed
  call shows nothing.
- **Display**: "NFT: 0x1234…cdef #4294967297" next to the game (a column on the player page's games table, under the
  status on the game page), and a "Metadata" toggle. Only when opened it calls `token_uri(token_id)` on the Collection
  (`RpcCollectionViews`; the codec decodes the contract's `ByteArray` to text, bounded) and prints the name,
  description and attributes as text.
- **Safety**: only a `data:application/json` URI (base64 or percent-encoded, at most 16,384 characters) is decoded; an
  http or ipfs URI is not fetched and is shown as unreadable. The JSON is parsed as data, the fields reach the page as
  React text children (never `dangerouslySetInnerHTML`), non-text values are dropped. "Raw JSON" is a `blob:` URL of
  the JSON typed `application/json` (revoked when the panel closes; absent where the browser has no blob URLs), opened
  with `rel="noopener noreferrer"`, never a `data:` navigation.
- **Tests**: `chain/test/nft.test.ts` (the token id rule for both modes including `2^32 + id`, the codec's `ByteArray`,
  `token_id` parsing with and without the field, `contracts.collection` null, the Collection address sources, hostile
  JSON) and `app-web/__tests__/game-nft.test.tsx` (jsdom: both pages, a hostile string that must create no element,
  no Collection, no `token_id`, failure and retry, the blob link). No browser or devnet run.
- **Not done**: no screen prints the owner (`owner_of` is only the game page's existence check).

## Signing

**Since #918 (phase A)** Cartridge's controller and the devnet burner are gone: every network signs with the device's
local key, whose account is deployed on its first write, with no session (`chain/src/auth/local-key.ts`,
`app/src/wallet/connector.ts`; the design is [accounts.md](accounts.md)). The text below records the signing as it was
before; the session policies (`controllerPolicies`) are kept as the record of the session's calls.

Who signs depends on the network (`signerOf`, `app-web/src/utils/network.ts`), and
`resolvePlayerAccount` returns that account:

- **devnet**: the burner, a predeployed account from `VITE_PLAYER_ADDRESS` and
  `VITE_PLAYER_PRIVATE_KEY`. No other network takes a key from the env: a key in a built bundle is
  public.
- **any other network**: the Cartridge controller's account, once the player has connected. Until then
  the app is read-only: the banner says "Read only: connect to play." and shows a "Connect" button.
  Once the player is connected, the banner shows the account and "Disconnect", and disconnecting makes
  the app read-only again at once.
- **not configured**: nobody signs and no controller is built (`controllerPolicies` refuses, since
  there is no policy on an empty target).

`WalletProvider` (`app-web/src/components/WalletProvider.tsx`) holds the controller's account and passes
the resolved account to `PavedProvider`. That makes a controller account go through the same `PavedWriter`
as the burner, so the payment rules above hold whoever signs: writes are serialised, a paying write needs
an explicit confirm, the amount is checked again at send, and nothing is written when the deployment is
not configured. The account object changes only when the signer changes, because a new account means a
new writer.

The connector (`createControllerConnector`, `chain/src/auth/controller.ts`) wraps
`@cartridge/controller` **0.13.16**, pinned exactly. It is the last release on starknet ^8: 0.14.x
needs starknet ^10, and the client stays on 8.9. The package is imported on first use, so it lives in a
lazy chunk of about 262 kB (78 kB gzip) and a devnet session never loads it; the controller's UI
runs in Cartridge's iframe. The connector is configured as follows:

- `chains`: the deployment's RPC URL only.
- `defaultChainId`: the deployment file's `chain_id` and the RPC's `starknet_chainId`. When both
  are known and differ, the connector refuses ("Chain id mismatch"), and the banner shows that error.
  When only one is known, it is used. It is never left unset, because the controller would then
  default to mainnet.
- `policies`: `controllerPolicies(deployment, { approve })`, converted by
  `toControllerSessionPolicies`. The package's own `toSessionPolicies` is not used, because it drops
  an approve's `spender` and `amount`, and the controller turns an approve without both into a
  policy on any spender and any amount. The policies hold:
  - `Faucet.mint` (the test faucet: `PavedWriter.mint`) **when, and only when,
    the deployment resolves a Faucet** (`deployment.faucet`): Sepolia. Mainnet resolves none, so it has no such policy,
    and neither has a deployment whose file lacks the mock. The faucet mints 100 USDC a call, under the contract's caps
    (10,000 USDC a call, 20,000 USDC an address in all, `contracts/src/mocks/usdc.cairo`); an address that has used its total
    gets `MockUSDC: over the address cap`, which the writer turns into `FaucetCapError` ("The test USDC faucet is empty for
    this account...") and the call cap into its own words, never a raw revert;
  - one policy per call the client sends outside devnet (`CONTROLLER_ENTRY_POINTS`): Challenge `spawn`/`build`/`discard`/`surrender` (D-20 removed `claim` and `sponsor`), and `Setup.claim_tutorial` where
    the deployment has a Setup (D-21; the Tutorial's policies left with it). Since E3 the Challenge `spawn` is the paid
    purchase's (`EconomyWriter.purchase`: `Challenge.spawn(stake, referrer, min_out)`); `PavedWriter` spawns nothing;
  - `approve` only as the controller's approval policy, on the token that `Challenge.entry_price` names,
    read when the controller is first used. That token is the deployment's Token before E3 and USDC
    after it, so no code change is needed. The spender is pinned to the Challenge contract, and the cap is
    `ENTRY_MAX_STAKE` (the economy's `MAX_STAKE`, 10) times the unit price, which is the most one
    purchase approves: `USDC.approve(Challenge, stake x unit)`.

  An approve to Challenge on the entry token up to 10 times the unit price is signed in the session: since
  D-20 only a purchase sends one. Above the cap, or on another token or spender, an approve prompts. When the entry cannot be read, the
  session holds no approve and every approve prompts.

  The cap is read once per page load, when the controller is first used, and kept for the session. If
  the price falls, the cap stays at 10 times the old unit price, while the writer still approves
  exactly the amount the player confirmed.

  The economy's other writes are not in the session, so each one prompts: `Economy.settle`,
  `PavedToken.approve(Vault, …)`, and Vault `stake`/`unstake`/`claim`. Their addresses belong to
  the economy's deployment, not to `Deployment`. `Faucet.mint` (was `Token.mint`) is not a policy, because the faucet
  exists only on the devnet mock. The connector refuses to build without an RPC URL or policies.

  A test (`chain/test/controller.test.ts`) drives every write of `PavedWriter` and `EconomyWriter`,
  on E3's committed ABIs, against a recording account. It checks that:
  - each call of the game writes and of the purchase is signed in the session (target and entry
    point, and for an approve its spender and an amount within the cap);
  - the policies hold exactly those calls;
  - a purchase at stake 10 approves exactly the cap;
  - settle and the Vault writes fall outside the session;
  - no policy holds `claim` or `sponsor` (D-20).

When the app opens, `probe` restores a session already approved in the browser without a prompt. A
connect that the player abandons leaves the app read-only and says why.

Within the session, the controller signs an approve of the entry token to the Challenge contract, up to
10 times the unit price, without asking. What guards each payment is still the client's own confirm, which shows the amount,
and the check at send. "Disconnect" is disabled while a write is in flight (`writing` from
`usePaved`, counted by `PavedProvider` around the writer's calls), so a write that has been sent
never loses its account to a reconnect.

Not verified: that the keychain prompts for an approve above the cap, rather than refusing it. That
needs a run against the real controller, which is due before any public deployment.

The controller's licence is Cartridge's own (`LICENSE` in the package). It allows Non-Commercial Use only,
which includes a product under 10,000 monthly active users. Each copy must carry a prominent notice that
the controller is used and is Cartridge's copyright, and copies of the client are subject to the same
terms. The owner accepted it for the MVP and testnet (D-15), to be revisited before mainnet or 10k
monthly active users. The client meets the notice requirement in two ways:
- `app-web/public/THIRD_PARTY_NOTICES.txt`, which `vite build` copies to `dist`, names the package and
  version and Cartridge's copyright, and carries the licence text verbatim;
- a small fixed footer on every page and network (`WalletNotice`, rendered from `main.tsx`) says "Uses
  Cartridge Controller, © Cartridge Gaming Company" and links to that file. The controller's code ships
  in every build, devnet's included, which is why the footer is not limited to connected sessions.

`app-web/__tests__/third-party-notices.test.tsx` checks the file against the installed `LICENSE`, checks
it is in `dist` (required in CI, which builds before it tests), and checks the link. Tested in jsdom with
the controller mocked
(`app-web/__tests__/wallet.test.tsx`, `chain/test/controller.test.ts`). No browser run has been made
against a real controller or network.

## In the app

`PavedProvider` (`react.tsx`) gives the client, the writer and a status computed once from
`configured` and the account: `not-configured`, `read-only` (no account) or `ready`. `useRead` runs
one read on its inputs, on `refresh` and, when asked, when the page becomes visible. The game page
uses `GameSession` (`session.ts`) through `useGameSession`: it loads `game` + `tiles` (+ `builder` for the game's player), and moves only on this client's writes, as above. The scene draws the last tiles it was given once its models are loaded, so the
game page no longer re-sends the board on scene ready. A read that
fails after a successful write is a `readError` ("Move applied; refresh failed"), not a write error.

`/game?mode=..&id=..` shows a game. Only a consent in the history state, from the landing page's
confirm, starts one (a Challenge spawn pays the entry); a bare `/game` URL, a link with `spawn=1` and a
reload after the consent was cleared spawn nothing ("No game selected"), and a malformed id shows
"Game not found". `useRead` says when a read has answered
(`loaded`), and the landing page shows the errors of its reads with a "Retry". There is no player read since D-25 (E):
the connected wallet is the player.

## Not connected

`ConnectionBanner` (app-web) says why writes are not offered. `not-configured`: the deployment
misses addresses or the RPC URL; no write button, no spawn, and the game page shows "Not connected".
`read-only`: no playing account; games open read-only and the landing page offers no start. A game of
another player opens read-only with "Not your game: read only"; a missing game shows "Game not
found".
