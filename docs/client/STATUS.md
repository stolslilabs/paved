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
the game's writes. `Economy`, USDC and the paid `spawn` run on **stub ABIs** until CORE's E2/E3; `PavedToken` and `Vault` are E1's
real ABIs. No deployment has the economy's addresses yet, so it is not configured anywhere. `docs/architecture/client-economy.md`.

2026-10-09, economy screens (t-0056, P8, part b): on the landing page, the paid Daily's stake picker (price `2k` USDC read from
the chain, boost `1 + k/100`, the referrer from `?ref=` shown at the confirm with "you pay the same"), the referral link, the
Vault (stake, unstake, dividends) and "after the day" (settle, the chain's reward, and "Below the shifted mean the stake is
lost"). Every paying action has an explicit confirm showing the amount; the purchase's consent is history state only, cleared
before the game page sends. jsdom tests on the fake; nothing runs until E2/E3 deploy the economy.

Out of scope: Weekly, multiplayer/duel (owner D-4), configurable games (P-1), app-native.

The baseline measures a recorded board, not a live deployment (decided 2026-10-06): the contracts
change in P2 and a fixture is deterministic. Latency from move to display is therefore not in the
baseline; it needs a live node.
