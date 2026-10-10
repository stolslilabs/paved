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
discard button, Woodsman and Herdsman (P4) in the role picker, and the scene redrawing its last board
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
`starknet_simulateTransactions`, a character only on the move that closes its structure) and scores 9,084 on day 20738, above the
threshold of 3,455.877: her settlement mints 1,566.39 PAVED, equal in the `Settled` event, `terms.reward`, her balance and
`R x h(score / mean)`; the naive games (1,257) get 0. The Vault step stakes a test account's own 1,000 PAVED and claims the dividends
of a later purchase (3,125 USDC base units, equal to `pending`). Details: `docs/architecture/client-economy.md`.

Out of scope: Weekly, multiplayer/duel (owner D-4), configurable games (P-1), app-native.

The baseline measures a recorded board, not a live deployment (decided 2026-10-06): the contracts
change in P2 and a fixture is deterministic. Latency from move to display is therefore not in the
baseline; it needs a live node.

The controller notice (D-15) is shown at body size (1rem), on an opaque bar, text and link at 16.06:1 and 19.80:1 on `#0a0a0a`, in the Tab order (D-16).
