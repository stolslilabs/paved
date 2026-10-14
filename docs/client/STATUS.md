# Client track status

Dated 2026-10-06. Track CLIENT of the programme Paved (the packages-based web client).

2026-10-06: throttled (CPU 4x, 60 Hz) at 72 tiles, the cadence holds (no missed frame) but time to
interactive is 6.2 s against 0.5 s; a click shows its tile in 37 ms (p50) unthrottled, 86 ms
throttled; in the real Game page each Torii poll costs 3 React commits and no long task (one
exception, in a session run at load 18.6), while each
placement brings two to three long tasks of 57-123 ms throttled.

2026-10-06, renderer step (P-7b): at 72 tiles throttled, time to interactive is 0.85 s (from 6.2 s;
0.24 s unthrottled), a click shows its tile in 34 ms p95 (from 115 ms), draw calls per median frame
137 (from 207) and triangles 0.74 M (from 1.7 M), with identical screenshots but for a few edge pixels on
tile borders. Every P-7b target is met but two: one long task (56-58 ms) per play session remains, the
first transaction signature (chain layer); and 0.1 % of in-play frames run over 1.5 intervals.

2026-10-06, dependencies (P-8, PR #195): `packages/*` moved to current majors on Node 24 (bun 1.4.2,
TypeScript 7, Vite 8, vitest 5, React 19.3, three 0.186, Tamagui 2.7.7; starknet 8 and `@dojoengine/*`
1.x stay, Dojo peers starknet ^8). At 72 tiles throttled, time to interactive goes from 848 to 742 ms
and CPU + GPU per frame p95 from 6.31 to 5.60 ms; a cold install from 12.9 GB to 0.21 GB. P-7b holds as
before, met but two. Tamagui 2.7.7 adds about +0.5 ms CPU per frame in play; the off-screen bisect is a
follow-up for when the Mac is back (P-9).

| Step | State |
|---|---|
| A. The packages build and their tests run | Done, #188 (CI job `client`) |
| B. Frame-time baseline at 38 and 72 tiles | Done, #190: method and figures in `docs/measures/client-baseline.md` |
| C. Throttled baseline, click-to-display latency, polling cost in play (P-7) | Done, #192: section "Throttled and in-play (P-7)" of `docs/measures/client-baseline.md` |
| Renderer: shared geometry and materials, no per-tile edge geometry (P-7b) | Done, #194: `docs/measures/client-renderer.md`. Instancing measured and dropped |
| Data layer: drop Torii and polling, view calls and events (P-10) | In progress: (a) `packages/chain` #202; (b) app-web wiring and removals; (c) bench mock. Design: `docs/architecture/client-data-layer.md` |

2026-10-06, data layer (P-10): `packages/chain` talks to the native contracts through starknet.js, from
the ABIs of `contracts/abis/`: views for one game or tournament, `GameSpawned` / `GameOver` events keyed
by player for the lists, and each write's receipt events to show a placement before one reconciling
read. No Torii, no Dojo package and no timer: only a pending write asks for its own receipt (every
250 ms). The leaderboard shows "coming later" until META's indexer (replaced on 2026-10-07, below). A devnet integration test
(`bun run test:devnet` in `packages/chain`) deploys the four contracts and plays through; browser
figures of the new layer wait for the Mac.

2026-10-07, game flows (t-0028): the game page says "Spawning game..." (Back disabled) while a paid start
is in flight (#211); surrender with a confirm, claiming a Daily prize and sponsoring (each with an
explicit confirm and the amount re-checked at send), a player-name field, the `D` hotkey following the
discard button, the role picker (since D-18 it is gone: characters leave the game, in three PRs: PR 1 chain, PR 2 UI, renderer and app-web, PR 3 tutorial, quest 3 and these docs), and the scene redrawing its last board
after init (the app's workaround is gone). Page-level tests of the Game and Landing states.

2026-10-07, D-7: client performance work is dropped and the CLIENT targets (P-7b) are frozen at #195's figures
(see PLAN.md); no more browser runs on the Mac. The track is idle until META's leaderboard screen or the
Cartridge controller (P-14).

2026-10-07, leaderboard (t-0038): typed client of the indexer API v1 in `@paved/chain` (#231) and the leaderboard and
player screens (`/leaderboard`, `/player/:id`) with the lag from `behind`, stale and unavailable states and the prize slots
from `prize_ranks`. Tested against a fixture server only: no real indexer is wired yet (`VITE_INDEXER_URL` unset shows
"Leaderboard unavailable"). Prizes and claims stay on the contract views.

2026-10-07, leaderboard wiring (t-0042): the review of #232 fixed (the screens never show rows of another day or page,
nor another's failure; no day to show is a failure with Retry or "No tournament yet"; the player screen says "among
the last 10 games"; a day id above `MAX_TOURNAMENT_ID` is "Not a tournament"). The client reads the indexer's "As built"
API (extra `/v1/head` fields, 503 on `/v1/head`, null score of a running game) and is tested against the real
`packages/indexer` run in-process (no chain, no browser). `VITE_INDEXER_URL` and the indexer's `--allow-origin` for devnet
are in `packages/README.md`. Not done: the end-to-end check on a live devnet (waits for CORE's regenerated `devnet.json`).

2026-10-09, quests and achievements (t-0053): typed client of the indexer's P7 routes (`definitions`, `playerQuests`,
`playerAchievements`) in `@paved/chain`, with fixture routes and contract tests against the real indexer (schema 3), and the
screens: `/quests/:day?` (the connected player's quests of a day with the leaderboard's day picker, achievements with
their points, the list of what counts) and the same progress on `/player/:id`, with the lag line and the unavailable,
not-configured and stale states. Display only: no reward is shown or promised. Landing has a "Quests and achievements"
button. jsdom tests only, no browser run. The e2e step "deployer smoke game" now queries the Tutorial contract and expects
game 1 there (it passed vacuously on Daily). Not run on a live devnet.

2026-10-09, economy client (t-0056, P8, part a): `packages/chain/src/economy/` buys a paid Daily (USDC approve + `Daily.spawn(stake,
referrer, min_out)` in one multicall, `min_out` from the pool quote less 1 %, P-35), settles a bought game after its day (the player's claim of
PAVED) and stakes, unstakes and claims dividends in the Vault, every amount a BigInt re-read and checked at send, serialised with
the game's writes. USDC and the paid `spawn` run on **stub ABIs** until CORE's E3 (`Economy` is real since t-0066); `PavedToken` and `Vault` are E1's
real ABIs. No deployment has the economy's addresses yet, so it is not configured anywhere. `docs/architecture/client-economy.md`.

2026-10-09, economy screens (t-0056, P8, part b): on the landing page, the paid Daily's stake picker (price `2k` USDC read from
the chain, boost `1 + k/100`, the referrer from `?ref=` shown at the confirm with "you pay the same"), the referral link, the
Vault (stake, unstake, dividends) and "after the day" (settle, the chain's reward, and "Below the shifted mean the stake is
lost"). Every paying action has an explicit confirm showing the amount; the purchase's consent is history state only, cleared
before the game page sends. jsdom tests on the fake; nothing runs until E2/E3 deploy the economy.

2026-10-09, economy on E2's real ABI (t-0066, P8): `Economy` is the committed `contracts/abis/Economy.json` (E2, #262): `Recorded.expired`,
`terms()` with `time` and `expired`, `quote_swap` (P-35) behind `EconomyPoolQuoter`, now on. The codec decodes and encodes signed
integers (`sigma_bps` is a real `i16`). "Swap below min_out" (since reworded: the USDC was not spent) and "day cannot close yet" are clear states; an expired game
says "Expired: no reward". `?ref=` is bounded below `2^251 - 256`, and the writer too; `Game.tsx` never falls back to the plain spawn for a
purchase. New `/economy` page; the fakes moved to `@paved/chain/testing`. **Still stubs until E3**: the paid `Daily.spawn` and USDC, so
purchases stay impossible in practice (until E3, above). jsdom tests only. `docs/architecture/client-economy.md`.

2026-10-09, economy on E3 (t-0068, P8, commits on #275): the stubs are gone. The client uses the committed `Daily` ABI
(`spawn(stake, referrer, min_out)`) and the ERC20 interface of `Token.json` for USDC (E3 commits no `MockUSDC.json`). A purchase
is `USDC.approve(Daily, stake x 2,000,000)` and the spawn in one multicall, `min_out` from `Economy.quote_swap` less 1 % (cap 5 %).
`PavedWriter.spawn("daily")` and its free-token path are removed (the Tutorial spawn stays), the prize is sponsor-only and labelled
USDC, and a swap below `min_out` says "your USDC was not spent" (a revert still pays its network fee). `IndexerClient` reads
`contracts.economy` and the appended game, player and tournament economy fields. jsdom tests only; the paid spawn is built from the
ABI, not re-recorded (no devnet here). `docs/architecture/client-economy.md`.

2026-10-09, signing (P-14, t-0055): outside devnet, the player signs with the Cartridge controller
(`@cartridge/controller` 0.13.16, the last release on starknet ^8). The connection banner has "Connect"
and "Disconnect" (held while a write is in flight). The session policies hold the game's writes, and an
approve of the token `Daily.entry_price` names (Token now, USDC after E3) to Daily, capped at 10 stakes. The controller's
account goes through the same `PavedWriter` as the devnet burner, which is kept. Without a connection,
other networks are read-only. jsdom tests only (controller mocked). Nothing has been deployed beyond
devnet, and no real controller has been tried. The controller's licence (non-commercial or under 10,000
monthly active users, notice required) is accepted for the MVP and testnet (D-15). The notice ships in
`dist/THIRD_PARTY_NOTICES.txt` and is linked from a footer on every page. Design: section "Signing" of
`docs/architecture/client-data-layer.md`.

2026-10-10, economy follow-ups (t-0073, PR a): the devnet faucet mints MockUSDC (`MockUSDC.mint(self, 100 USDC)` at
`contracts.MockUSDC`, no longer the old Token) for `mint()` and `createPlayer(..., { mintTestToken })`, and the Landing compares the entry
token with the USDC address. `Tournament: not found` (top-3 claim on a day nobody sponsored) and `Tournament: nothing to reclaim` are clear
states. A sponsor reclaims their part of a prize nobody ranked for through `claim(day, 0)`, with a confirm and a re-check at send; what went
back comes from the `Reclaimed` events. A non-bigint slippage is a `WriteError`. The Cartridge session holds no faucet (test). The devnet
end-to-end of the economy is PR (b). Details: `docs/architecture/client-economy.md`.

2026-10-10, game NFT (t-0078, E5b #283): each game shows "NFT: <Collection short address> #<token id>" on the game page and in the player
page's games table, with a "Metadata" toggle that reads `token_uri` (a `data:application/json` URI, decoded as data and printed as text,
never as markup) and a "Raw JSON" blob link. The Collection is `VITE_COLLECTION_ADDRESS`, else the deployments file's optional
`contracts.Collection`, else the indexer's `/v1/head` `contracts.collection` (read only when the first two are unset); none known
shows nothing. A Daily token id is the game id, a Tutorial one `2^32 + id` (BigInt); the indexer's `token_id` is read when present (an
older answer parses as no NFT). The codec decodes `ByteArray`. jsdom tests only; no browser, no devnet run. Section "Game NFT" of
`docs/architecture/client-data-layer.md`.

2026-10-10, economy end to end with a positive reward (t-0081): the devnet e2e (`PAVED_E2E=1`) passes 18 of 18 on a fresh node (VPS,
12 min 41 s, peak 240,104 kB). alice plays with a search player (`packages/chain/test/daily-player.ts`: every candidate run with
`starknet_simulateTransactions`, a character only on the move that closes its structure: character strategy, before D-18; re-measured after PR 1) and scores 9,084 on day 20738, above the
threshold of 3,455.877: her settlement mints 1,566.39 PAVED, equal in the `Settled` event, `terms.reward`, her balance and
`R x h(score / mean)`; the naive games (1,257) get 0. The Vault step stakes a test account's own 1,000 PAVED and claims the dividends
of a later purchase (3,125 USDC base units, equal to `pending`). Details: `docs/architecture/client-economy.md`.

Out of scope: Weekly, multiplayer/duel (owner D-4), configurable games (P-1), app-native.

The baseline measures a recorded board, not a live deployment (decided 2026-10-06): the contracts
change in P2 and a fixture is deterministic. Latency from move to display is therefore not in the
baseline; it needs a live node.

The controller notice (D-15) is shown at body size (1rem), in normal flow below the app area (AppShell), on an opaque bar, text and link at 16.06:1 and 19.80:1 on `#0a0a0a`, in the Tab order (D-16).

2026-10-11, Sepolia network config (t-0099, D-16, P-39): `VITE_NETWORK=sepolia` plays on `contracts/deployments/sepolia.json`: its placeholder `rpc_url` is never called (set `VITE_RPC_URL`), `Token` falls back to the file's top-level `token`, the pool quote is `Economy.quote_swap` (Ekubo has no Sepolia), and the MockUSDC faucet works (`MockUSDC.mint` in the controller's session, only where a MockUSDC exists, never on mainnet; the faucet's caps are told in words). `SPONSORED_FALLBACK_BLOCKS` is 350,000 (Sepolia's block time is 1.72 s). Details: `docs/architecture/client-data-layer.md`, section "Sepolia".

2026-10-11, Sepolia run against the real Cartridge controller (D-16, T-0101): part A passed headless on the VPS (client loads, UI leaderboard equals the indexer's, keychain reaches its username screen); part B (account, faucet, buy, play) was tried headless on 2026-10-12 with the owner's go and **failed at sign-up on Cartridge's side** (`finalizeRegistration` internal server error at 08:19, 08:23 and, on the planned retry, 12:32 UTC; keychain username limit 19 characters; no account exists); automated attempts stopped, the owner's by-hand run is the fallback. Method and evidence: `docs/client/sepolia-controller-run.md`.

2026-10-12, on-chain purchase quote (t-0109, E-9): on every network, mainnet included, a purchase takes `min_out` from `Economy.quote_swap(burn_quote)` (the on-chain quote of the purchase's own route through the router, CORE #309) less the slippage, re-quoted at every send. Ekubo's quoter API (`EkuboPoolQuoter`) is removed and guard (i) is dropped, never built. A revert of `quote_swap` (`'Economy: partial fill'`, any router revert) or a failed call sends nothing and says "The pool cannot fill this purchase right now. Try a smaller stake or later."; the purchase screen shows the least PAVED bought and never a stale quote. Details: `docs/architecture/client-economy.md`, "The pool quote (E-9)".

2026-10-12, mainnet gates on the purchase quote (t-0114, E-9b, CORE #311): the purchase reads `Economy.router()` and `Economy.rate()` with its quote at every send. The router must be Ekubo's Router V3.0.13 on mainnet (`MAINNET_ROUTER`) and the file's `MockRouter` on devnet and Sepolia, else nothing is quoted nor sent. A pool quote below 90 % of `burn_quote x rate / 1e18` shows both figures and needs an explicit extra confirmation, never a refusal; a send-time quote below it without that confirmation sends nothing ("confirm again"). The burn share is labelled "at today's terms". On mainnet, a rate of 0, which only an unexpected upgrade can cause (the constructor refuses 0, E-9c), refuses every purchase ("Price rate unavailable; purchases are paused"). Before any purchase, the RPC's chain id must be the deployment's (fails closed). Sepolia's Economy has no `router()` yet (pre-E-9 class): purchases there are refused until CORE upgrades it. Details: `docs/architecture/client-economy.md`, "The mainnet gates on the purchase quote (E-9b)".

2026-10-12, follow-ups to the mainnet purchase gates (t-0121, #312 review and value audit): the purchase screen reads the chain check again when the page is shown again (a failed read at page open no longer leaves purchases off until a reload; a mismatch stays refused); the low-quote tick is also cleared when the implied figure changes (the guard rate moved); the doc says the chain check compares the read RPC's chain id with the deployment's `chain_id` and cannot see the signing wallet's chain. Details: `docs/architecture/client-economy.md`, "The chain check".

2026-10-12, Landing right panel height (t-0126, #289 note): the panel is capped at `calc(100dvh - 16px - 64px)`, with `100vh` as the fallback for browsers without `dvh`, so a mobile address bar no longer hides its bottom; the 64 px stays (the footer is about 33 px on one line, 57 px wrapped).

2026-10-12, indexer rate limit: hosting doc and `Retry-After` (t-0128, #296 notes 5 and 6): `docs/client/indexer-hosting.md` says the indexer limits per address itself (no limit at the proxy or firewall, P-43), that a proxy must set `X-Forwarded-For` (Caddy's `reverse_proxy` does; an nginx block is given) and that without it every client shares the proxy's one bucket. `IndexerClient` treats a `429` as "busy": it waits `Retry-After` seconds (capped at 10 s) and retries once; a second `429`, or a missing or non-numeric header, ends as a `rejected` error (httpStatus 429) and the callers fall back as for any indexer error. Other statuses unchanged. Tests in `packages/chain/test/indexer.test.ts`.

2026-10-13, D-18 done in the client (#321, #323, #322 through #324, and this PR): the temporary role/spot/character shims are gone from the chain package and app-web, the points on closing read the session's `lastScored`, the bench boards carry no characters, and the data-layer doc names an orientation code as its unknown-variant example.

2026-10-13, economy defaults (P-46): the chain package's `FakeEconomy` and `fakeTerms`, the indexer's `fake-node` and the economy screen tests use slope 12,220 and a mean of 3,980 points (were 18,130 and 3,353); tests that decode raw felts keep their own values, and the t-0081 devnet record in `client-economy.md` stays as measured.

2026-10-13, off-chain engine (E1, D-21/D-22, P-49): `packages/game-core/src/engine/` plays the contracts' rules (D-18, and the D-19 owners) with no chain: the draw bit-exact from a seed, the full placement rule, the structures and the `Scored` events; `__tests__/engine-parity.test.ts` replays the 11 golden games and the differential boards in the format of `docs/architecture/parity-fixture.md`, with equal draws, scores and counters. Tutorial index 9 (not 8) is the West move, as in Cairo.

2026-10-13, Training (T1, D-22, P-49): `/game?mode=training` plays the off-chain engine with a random seed per game and the game saved in `localStorage` (seed and moves, replayed on load); no wallet, writer, indexer or transaction on that path, no leaderboard, quests or reward; the Landing has a free Training card that needs no wallet. `Game.tsx` drives a `PageSession` (`GameSession` unchanged, or `LocalSession` over `EngineGame`); `useLobbyStore` is now `useModesStore` (D-24).
2026-10-13, off-chain tutorial page (U1, D-21, P-49): `/tutorial` plays the 8 scripted stages (and the burned tile between the seventh and the last) on the engine's tutorial deck, with no wallet, indexer or transaction; only the preset move is accepted, the moves are kept in `localStorage` and replayed on load, and the final score (2794) equals the `tutorial_full` golden. The claim button is U2 (waits for CORE's Setup system). `TUTORIAL_STAGES`: last preset's `tile_id` is 10, two empty texts filled.

2026-10-13, D-20 in the client (W1a, on CORE's #337): the prize leaves the client (claim, sponsor, reclaim, the `tournament` view, the prize panel, the prize slots of the leaderboard and player screens); the chain package follows the ABIs' `day_id` and `current_day`; the indexer skips the past `Sponsored`, `Claimed` and `Reclaimed`, drops the sponsor route and the cross-check, credits On the Podium from its own daily leaderboard when a day closes, and moves to schema 7 (a `rebuild` at the next deployment, P-53).

2026-10-13, A+B in the client (W1b, on CORE's #342): `abis.ts` imports `contracts/abis/Faucet.json` (was `MockUSDC.json`), the economy view keys and the indexer's event test follow `paved::systems::economy::...`, and the faucet caps are recognised under both `Faucet: over the ...` and the old `MockUSDC: over the ...` (still deployed on Sepolia until the fresh deployment, P-53). The deployments file key `contracts.MockUSDC` and the `mockUsdc` fields stay until D-25's deployment change.

2026-10-13, W2a: the Daily card shows today's top 3 from the indexer (rank, name, score, links to the player and the leaderboard; one line with no games, nothing with no indexer); the mode cards show with no wallet and Training sits among them; the podium counts only games over before the closing block; the Tutorial's restart, re-announced refusal and completion focus are fixed; `/tutorial` and `/game?mode=training` mount no wallet, paved client or indexer client (`ChainProviders` mounts them on the first chain route).

2026-10-13, step D in the client (W1c, D-21/D-24, P-49/P-51, on CORE's branch): the `Tutorial` and `Lobby` ABIs, the on-chain tutorial mode, its spawn, policies, Player row and stat leave the client; `Setup.json` is read and `Setup` is an optional deployment key; `/tutorial/claim` (a chain route) reads `Setup.tutorial_claimed`, then sends one `Setup.claim_tutorial()` and says claimed, already claimed, refused or no wallet (U2); the indexer reads the quest and achievement events from Setup only (skipped from Daily, so an old history replays), drops the `tutorial` source and its games, credits the claim as First Stone's progress, and moves to schema 8.

2026-10-13, F1: `packages/chain/test/devnet.test.ts` (`bun run test:devnet`) follows the paid Daily path again (it reads the `scripts/deploy.sh devnet` deployment through `test/devnet/devnet.ts` instead of deploying its own contracts: faucet `mint`, then `EconomyWriter.purchase`, then discard and surrender), 5 of 5 on a fresh seeded devnet; `packages/README.md` names `DEVNET_BIN` and `deploy.sh devnet --unmerged`; `/game?mode=tutorial` (with or without `id`) redirects to `/tutorial`.

2026-10-13, F2: `parity-sources.json` names each golden by Cairo file and test function, with no line number (a reformat leaves the fixture alone, a changed move or score fails it); the `client` CI filter also runs on `contracts/src/structure/tables.cairo`, `contracts/src/tests/golden/**`, `contracts/src/tests/differential.cairo` and `contracts/fixtures/**`.

2026-10-13, step E in the client (W1d, D-25, P-52/P-53, on CORE's branch): `Account` leaves the client: no ABI, no `createPlayer`, no `PavedClient.player`, no `Account.create` policy, no `VITE_ACCOUNT_ADDRESS`, and the landing page's name flow is gone. A player is the connected wallet address (`indexerPlayerId`: `0x` and 64 hex digits, as the indexer stores it); the connected player's name is their Controller username, everyone else a short address (no lookup of other players' names). The referrer is any non-zero address other than the payer, the Daily and the Economy: those are refused client-side (`RefusedReferrerError`, one plain message). The indexer creates a player from the first event that names the address (`GameSpawned`, `Purchased`, a quest or achievement progress), serves no `name`, reads `EconomySet` and `CollectionSet` from Setup, skips `PlayerCreated` by name so an old history replays, drops the `account` source from its sources and its deployment hash, and moves to schema 9 (a `rebuild` at F). On the merged step E ABIs (7218f5e), the F1 devnet test picks fresh accounts (no game, no tutorial claim, no USDC) instead of unregistered ones.
2026-10-14, F3: the devnet e2e no longer depends on the UTC day of the chain (the Daily deck does): alice's search player must still beat the day's threshold (the test fails naming the day and the scores otherwise), bob and carol play 3 and 2 placements and surrender, with scores checked under a floor of every threshold of the day, so one positive reward and one 0 are proved on every run; passes 16 of 16 on chain days 20650, 20700, 20740, 20750, 20800 and 20850 (`starknet-devnet --start-time`).
2026-10-14, N1: other players' names. The indexer looks Cartridge usernames up in the background (`POST https://api.cartridge.gg/lookup`, batched, cached in a `names` table with a 24 h and a 1 h negative TTL, one request per 5 s at most, off with `--no-names`; schema 10, a `rebuild` at F) and adds `name: string | null` to the leaderboard entries, the player and the player's entry from the cache only; the chain client reads `name` and the leaderboard, the Daily top 3 and the player page show it, the connected player's Controller username first and the short address as the fallback.
2026-10-14, V2: Vercel deploys from main only (`git.deploymentEnabled` `{"main": true, "**": false}` in `book/vercel.json` and `app/vercel.json`): no preview deployment and no Vercel check on thread branches, so its free-tier limit stops blocking merges; `book/vercel-ignore-build.sh` still filters main.

2026-10-14, D-23b in the client (W1e, D-23, P-50/P-53, on CORE's branch): Daily becomes Challenge in every client name: the mode `"challenge"` (code 1 unchanged, `ModeType.Challenge`), the contract and codec `Challenge`, the deployment key `contracts.Challenge` (no fallback to `contracts.Daily`: the committed devnet.json and sepolia.json are read under the new key by the tests until the fresh deployment rewrites them), `VITE_CHALLENGE_ADDRESS`, the Controller policies, the UI strings, and the indexer's source, stored contract value and API values (`challenge`, `challenge_games`, `challenge_finished`; schema 11, after N1's 10; a `rebuild` at F). An old `/game?mode=daily` link is replaced by `/game?mode=challenge`. "Daily" stays for the UTC day: the daily leaderboard, the daily quests, `day_id`. Each game's seed is Poseidon(salt, Challenge's address, token id) on chain: the engine is unchanged (it takes a seed).

2026-10-14, W1f (on CORE's F part A branch): the client reads `contracts.Faucet` only, with no `MockUSDC` fallback: `deployment.faucet`, `FAUCET_ABI`, `FAUCET_NETWORKS`, `VITE_FAUCET_ADDRESS` (no alias) replace the `mockUsdc` names, and the economy's USDC is `contracts.USDC` or `contracts.Faucet`. `sepolia.json` still keys `MockUSDC` until F writes it, so a Sepolia build resolves no faucet and no economy USDC from the file until then (its tests assert that). The faucet cap reverts keep both prefixes (`Faucet:` and `MockUSDC:`) until F replaces Sepolia; the `MockUSDC:` one can go in a later cleanup.

2026-10-14, D-23b in the client (W1e, D-23, P-50/P-53, on CORE's branch): Daily becomes Challenge in every client name: the mode `"challenge"` (code 1 unchanged, `ModeType.Challenge`), the contract and codec `Challenge`, the deployment key `contracts.Challenge` (no fallback to `contracts.Daily`: the committed devnet.json is read under the new key by the tests; the committed sepolia.json still keys `contracts.Daily`, and a test asserts that this old deployment is not configured, until the fresh deployment at F rewrites it), `VITE_CHALLENGE_ADDRESS`, the Controller policies, the UI strings, and the indexer's source, stored contract value and API values (`challenge`, `challenge_games`, `challenge_finished`; schema 11, after N1's 10; a `rebuild` at F). An old `/game?mode=daily` link is replaced by `/game?mode=challenge`. "Daily" stays for the UTC day: the daily leaderboard, the daily quests, `day_id`. Each game's seed is Poseidon(salt, Challenge's address, token id) on chain: the engine is unchanged (it takes a seed).

2026-10-14, F0: the client's preparation for the fresh Sepolia deployment F (no deploy, no VPS change): `docs/client/f-release.md` (read-only checks of F's deployment file, build, smoke, order with the indexer), `scripts/client/check-deployment.mjs` (the read-only checks, run on devnet only here), "Release at F" in `indexer-hosting.md` (schema 11 rebuild), the Challenge card carries `data-testid="mode-card-challenge"` and `part-b.mjs` clicks it by that id; the faucet key (`contracts.Faucet`, no `MockUSDC` fallback) is left to a separate CLIENT PR on CORE's F branch.

2026-10-14, W1f follow-up (CORE's F part A at b1e64dd drops the old `Token`): `ContractName` is `Challenge | Setup`, `configured` needs only the RPC URL and `Challenge`, `VITE_TOKEN_ADDRESS` is gone, and `PavedClient.balance` reads `balance_of` at the address `Challenge.entry_price` names with the Faucet's ABI. The bench mock (`scripts/bench/mock-chain.ts`) names that token `BENCH.Faucet` (`VITE_FAUCET_ADDRESS`). `f-release.md` is updated to Faucet only.

2026-10-14, W1f entry token explicit (CORE's finding: on devnet the client preferred the open-mint `contracts.Token` while Challenge charges the Faucet): the economy's USDC is `contracts.Faucet` on the faucet networks (devnet, Sepolia), never a fallback of `contracts.USDC`; `contracts.USDC` is read only elsewhere (mainnet). `VITE_USDC_ADDRESS` is ignored there too (no override can point the client at another token) and comes first only on the networks without a faucet (mainnet). The devnet e2e asserts that `Challenge.entry_price`'s token is `contracts.Faucet`.

2026-10-14, W1f review fix: the faucet has no env override. `VITE_FAUCET_ADDRESS` is removed (it was only W1f's rename of `VITE_MOCK_USDC_ADDRESS`): on devnet and Sepolia `deployment.faucet` is `contracts.Faucet` of the file and nothing else, and the economy's USDC is that same value (`resolveEconomyDeployment` reads `base.faucet`), so the mint and the payment cannot name different tokens. The bench mock names its entry token with `BENCH_FAUCET` (`app-web/src/bench/addresses.ts`), not an env variable.

2026-10-14, W1g (on CORE's #359, F part B): the client's tests follow the fresh `sepolia.json` (one key per contract, `deployed_block` 16559258): chain, app-web and indexer assert, from the file's own values, a configured Sepolia deployment (Challenge, Setup, Faucet), the economy on the Faucet, the router equal to `MockRouter` and the controller as signer; the old `Daily`/`MockUSDC` file survives only as a fixture for the not-configured path. `check-deployment.mjs` passes every check on the file.

2026-10-14, W1h (on CORE's #363, G1 spawn deck walk cut): `withdrawExtra` follows the new walk (selection sampling, draws as mixed-radix digits of the 128-bit lanes of `Poseidon(seed, 'DECK' + batch)`, 10 per lane); `parity.json` regenerated from the branch's goldens and equal to CORE's `.g1` copies, `parity-sources.json` unchanged, the frozen tutorial golden untouched; the devnet e2e passes 16 of 16 on a fresh node at CORE's reviewed head (85eabdb): alice's search player scores 4596 against a threshold of 3963.71 (margin 632.29), bob and carol stay under it; no id changed.

2026-10-14, W1i (on CORE's G4, a pause guardian on `Challenge.spawn`): the indexer skips `GuardianSet`, `SpawnPaused` and `SpawnUnpaused` by name (no schema change), `GameViews.spawnPaused()` and `guardian()` are added, the purchase path throws `SpawnPausedError` before it builds any call (and maps a `'Challenge: spawn paused'` revert to it), and the Challenge card and the purchase dialog show a plain message with the buy button disabled; a started game still plays. Merged with CORE's code (fe13414): the names and the event shapes match the committed `Challenge.json`; the scripted devnet check (pause as the owner, refused purchase, indexer past the event, unpause, buy) is in the e2e and waits for CORE's reviewed head.

2026-10-14, I1 (the indexer catches up by block ranges, as Torii does): with `--depth l1`, the blocks at or below the last L1-accepted block are read with one `starknet_getEvents` per contract over a range (pages of 1024, continuation tokens), merged in (block, transaction, event) order, with headers only for event blocks, day boundaries (binary search on time) and the range's edge; near the tip, block by block as before. `--range <blocks>` (default 10000, 0: off). The fake node and the devnet scenario replay each chain both ways and get identical dumps. Sepolia, 2,000 blocks from 16559258: 89.2 to 29,460 blocks a minute, 6,131 to 11 RPC calls per 1,000 blocks, identical tables.

2026-10-14, W1k (on CORE's S1, e83d9e2): `GameView.expiresAt` (start + 86,400, the last field) and `GameViews.initialSeed` follow the ABI; `build` and `discard` after the 24 h revert `'Game: expired'`, typed as `GameExpiredError` (pre-check in `GameSession`, nothing sent; surrender stays open), shown through the game page's `writeError`; the indexer is unchanged (no event changed); the devnet e2e replays a game from `initial_seed` (a discard included) and walks the expiry, surrender, record and settlement.

2026-10-14, T2 (Training complete and solid, D-27): an inventory of Training against a Challenge game, and a Playwright battle test (`cd packages/app-web && bun run e2e`, headless, dev server, no chain; a bot plays complete games and every move is checked against the engine replay of the saved seed and moves: score, tiles, discards, closing lines, the lit slots at the four orientations, game-over dialog, New game, reload, tab reopen, surrender, corrupt save, storage off, two tabs, phone width, Landing card). One defect fixed with a test: the D, C and R keys played moves under the open Surrender dialog. The test seam is `window.__PAVED_E2E__`, defined only by the test (`training/e2e-probe.ts`); `playwright-core` 1.63.0 is a dev dependency of app-web (matches the installed Chromium 1243).

2026-10-14, Client v2 P0 (t-0200, P-57): the benchmark of cartridge-gg/nums and glitchbomb and the v2 architecture proposal in `docs/client/v2-architecture.md` (palette and token file, fonts, stack, Storybook and its hosting, renderer outlines, page map, new `packages/app`, Font Awesome: the nums files are Pro 6.6.0 under the Commercial License, next-tile prediction, skills, phased plan), with the spec recorded in `docs/client/spec-v1.md`; documents only, for the PM's ruling.

2026-10-14, Client v2 F1 (t-0205): `packages/app` (`@paved/app`), the scaffold of `docs/client/v2-architecture.md` beside `app-web`: Vite 8, React 19, Tailwind v4 with the `theme.css` token file (section 2.2, breakpoints and `data-theme="dark"` corrected), self-hosted Rubik Mono One and Inter, React Router 7 with the 17 routes of section 6.1 as placeholders under a five-tab shell, a TanStack Query client, a zustand UI store, lazy-loaded Motion. No chain access. README: `packages/app/README.md`.

2026-10-14, D1 (S1's devnet move refused with `u32_sub Overflow`, calldata `build(9, South, 0, 0)`): the game page sent the zustand store's `x`/`y`, which only a click on a slot set (default 0, 0), while the Confirm button and the `C` hotkey were enabled by the hovered ghost; a hover then Confirm (S1's script: `mouse.move` then `c`) sent (0, 0), and the contract's `x - 1` on a neighbour overflowed. Since the monorepo reboot (#180), not T1. The move now takes the slot the ghost shows (`toChainSlot` in `game-helpers.ts`: grid x + CENTER, CENTER - grid y), and tests pin the absolute coordinates for the button and the hotkey, and the relative ones Training saves.

2026-10-14, Client v2 F2 (t-0210): Storybook 10 (`@storybook/react-vite`, docs and a11y addons) in `packages/app`, dark on the board's colour `#07111A` as its only background, with the Foundations stories read from `theme.css`: colours (every scale with hex and OKLCH, the semantic tokens with their computed contrast: `border` 1.38:1 and `input` 2.11:1 fall under 3:1), typography, motion with reduced motion on and off, spacing and radius, breakpoints at the four viewports. `build-storybook` runs in the CI `client` job. Hosting is F5; the a11y checks in CI are Q2's.

2026-10-14, Client v2 F4 (t-0217): Font Awesome Pro 6.6.0 in `packages/app` from the owner's files (`21788fb`, moved from `app/public/fontawesome`, byte-identical, hashes in the PR and in `public/fontawesome/README.md`), loaded after the first frame with DOM rewriting off and drawn by an `Icon` component as React-managed SVG (`name`, `variant` solid or thin, `size`, `label`), the Icons story, the licence line in `THIRD_PARTY_NOTICES.txt`, section 8 and the plan additions of section 12 in `v2-architecture.md`. Headless Mac figures: loaded in the head the 2 MB of scripts add 1.9 s to the first paint at 9 Mbit/s and CPU 4x (40 ms on localhost), loaded after the first frame none; parse and run 28 ms (123 ms at CPU 4x). `thin.min.js` holds one icon, `spider-web`.

2026-10-14, Client v2 F3 (t-0216): the 17 shadcn/ui primitives of section 3.1 in `packages/app/src/components/ui` (Radix, restyled to the semantic tokens, each with UI stories; `shadcn` 4.21.4 pinned as a devDependency, sources written by hand because the CLI run was refused), `cn()` and CVA, Motion on the button press, tab indicator and sheet, and `--input` moved from ink-700 to ink-600 (2.11:1 to 3.11:1 on `--background`, WCAG 1.4.11; section 2.2). No page uses them yet.

2026-10-14, S1 (D-28, what a player feels in the release smoke): `docs/client/f-release.md` has a "Latency" part (a move: click to `Working...` gone; a purchase: click, hash, receipt, `/game?id=`; the faucet mint as a control; 5 moves, 2 purchases, 1 mint, median and max, time of day), and says what the client calls confirmed: `ACCEPTED_ON_L2` (starknet.js's default, polled every 250 ms), never `PRE_CONFIRMED`. `scripts/e2e-sepolia/part-b.mjs` writes `latency.json` and `latency.md` from the page's own marks and the node's answers, no app change; the timing code ran on a local devnet (`latency-devnet.mjs`, same module): faucet and purchase gave full samples, the move's write was refused by the devnet contract (`u32_sub Overflow`, see the PR), so no move figure yet; nothing was run on Sepolia by a thread.

2026-10-14, Client v2 F5 (Storybook hosting recorded): `deploy/storybook/paved-storybook.caddy` is the Caddy site the owner's root block installs for `storybook.paved.bal7hazar.com` (same text), and `docs/client/storybook-hosting.md` has the paved-deploy release (checkout, `bun install --frozen-lockfile`, `build-storybook`, `WWW_ROOT=/var/www/paved-storybook publish.sh`), its check and its rollback (`switch.sh`, same `WWW_ROOT`). Documents only; nothing run on the VPS.

2026-10-14, X1 (the tutorial page's whole-run test timed out on CI): `tutorial-page.test.tsx` "plays from the first stage to the last" plays a whole tutorial in jsdom (each click re-renders the page and replays the saved moves through the engine, CPU-bound), 2.6 to 5.0 s locally in three runs of the app-web suite under a 1536 MB heap and 6.1 to 7.3 s on CI, over vitest's 5 s default; it now has an explicit 30 s timeout with the cause in a comment, as T2 gave the Training whole-game test. No other whole-game or whole-tutorial test sits near 5 s (next slowest in the suite: 3.0 s, the Training test, which already has 30 s). No source change.

2026-10-14, Client v2 F1b (t-0228): the owner's fonts in `packages/app` replace Rubik Mono One and Inter: Cinzel Bold (`font-display`), Nunito Sans Variable (`font-sans`) and IBM Plex Mono 400/600 with tabular figures (`font-numeric`, the `numeric` utility), self-hosted from `@fontsource` 5.3.0, Latin only, OFL 1.1 recorded in `THIRD_PARTY_NOTICES.txt`; first-screen fonts 61,008 B before, 46,260 B after (Cinzel + Nunito Sans preloaded, Plex Mono on demand); section 2.3 of `docs/client/v2-architecture.md` records the choice.

2026-10-14, W1j (on CORE's V1b, P-56, the Vault as vPAVED): the chain package reads the vPAVED position (`balance_of`, `convert_to_assets`, `max_withdraw`, `exit_fee`, `total_assets`, `total_supply`, the previews) and writes `deposit` (approve then `deposit(amount, self)`), `withdraw(amount, self, self)` and `redeem` for "withdraw all", with typed errors for a zero-share deposit, over `max_withdraw` and a missing allowance; `stake`, `unstake` and the USDC claim are gone. The purchase quotes its one swap (the burn quote plus the margin, the referral taken: `swapInputOf`) for `min_out` and the sanity floor. The staking screen shows the vPAVED, its PAVED value, the rate, the exit fee and `max_withdraw`. The indexer decodes `Purchased.vault_paved` and moves to schema 12; it does not read the Vault.

2026-10-14, Client v2 F3b (t-0226, animated components from the owner's libraries): `docs/client/v2-architecture.md` section 3.5 records the chosen source per primitive and pattern. In `packages/app`: the Tabs highlight is motion-primitives' AnimatedBackground (a shared `layoutId`), the Dialog enters and exits with Motion (motion-primitives Dialog's variants, on Radix), the counter is Magic UI's Number Ticker (`elements/`), the list is Magic UI's Animated List, the carousel is shadcn/ui's on Embla 8.6.0; Button, Sheet and Sonner stay F3's. animate-ui is not taken (MIT + Commons Clause, a licence for the owner), coss ui neither (Base UI). Motion's lazy feature set is `domMax` now (28.50 kB gzip after paint); the entry chunk is 120.24 kB gzip (120.11 before), measured before F1b's merge; on main after F1b it is 120.68 kB gzip. Each component has stories with reduced motion off and on, and tests.

2026-10-14, Client v2 F3c (t-0243, animate-ui where clearly better): `imskyleen/animate-ui` at efeb96f (MIT + Commons Clause) compared with F3b for Tabs, Dialog, Sheet and Carousel in section 3.5 of `docs/client/v2-architecture.md`; none is taken. Its Tabs puts `aria-selected` on role-less divs, and its panel fade does not run on a tab change (Radix keeps the panel mounted); at 4,019 B gzip it is 4.5x F3b's 897 B. Its Dialog flip and blur still play under reduced motion (a `transform` string and a `filter`, which Motion 14 does not reduce). Its Sheet equals F3b's. Its Motion Carousel is a demo with no roles, keys or reduced motion. Nothing of animate-ui is in the repository, so no notice or licence note is added. Entry chunk on main at 56c4e237: 120.68 kB gzip, before and after.

2026-10-14, R-dispose (t-0245): `GameScene.dispose` now also clears the scene graph, the light shadow map and its callbacks, and calls `renderer.forceContextLoss()` after `renderer.dispose()`, so an unmounted canvas gives its WebGL context back (Chrome drops the oldest past about 16). `GameCanvas` and `GameCanvasNative` ignore an `init` that resolves after unmount (dispose at once, no `start`, no `onReady`) and report a rejected `init` through an optional `onError`.
2026-10-14, Client v2 SC1 (t-0229, story-first): the scenes welcome, loading, home, play, board, over and purchase in `packages/app/src/components/scenes`, with 11 elements and 14 containers (F4's `Icon`; the hand's tile drawn by the renderer as the board draws it), each state a story at the four viewports (132 scene stories) on typed mocks (`src/mocks`, shapes of `@paved/chain` and `@paved/game-core`, nothing called), and a render test per state. The board scene draws `@paved/renderer`'s canvas on the bench's recorded boards; Storybook serves the models from app-web's `public/` (`staticDirs`). Mocks on S1's `GameView.expiresAt` and V1b's `split_bps`; the purchase deadline reads relative and local, UTC in a tooltip. No route changed: the app's JavaScript is unchanged, its CSS grows by the scenes' Tailwind classes (39,777 to 56,158 bytes). Section 12 of `v2-architecture.md` is now story-first (SC1, SC2, then P1 to P11 wire the scenes).

2026-10-14, Client v2 SC2 (t-0246, story-first): the scenes leaderboard (with the player's page), vault, settings, theme, quests, achievements and referral in `packages/app/src/components/scenes`, with 4 new elements (day picker, copy field, task progress, setting switch) and 10 new containers (SC1's amount, stat row, countdown, notice, player name, top-3 row and app nav reused), one story per state (39 states, no per-breakpoint stories: the viewport is VP's toolbar global) on typed mocks of `@paved/chain` (the indexer's quest, achievement, leaderboard and game shapes as its client reads them; V1b's `VaultPosition` and `split_bps`), and a render test per state; the no-wiring guard now covers `@paved/indexer` and any indexer, chain or session call. No route changed: the app's JavaScript is byte-identical (379,862 B, 120.68 kB gzip), its CSS grows from 57,069 to 61,274 bytes (10.84 to 11.42 kB gzip). In v1 quests have no claim (event mode, quests.md): a quest shows complete, in progress or to do.
