# Paved: context

## What Paved is

Paved is a Carcassonne-style tile game that runs fully on chain (Starknet, Cairo). The rules, the
tile deck, the scoring and the leaderboard live in contracts; the client only renders and sends moves.

## Why it is taken up again (2026-10-06)

The Cairo code worked well, but it has two problems:

- **On-chain cost is too high.** A simple move costs 64.5 M L2 gas (measured, see below), most of it
  spent in the Dojo world.
- **The client is slow.** The 2026 client has not been measured yet; suspected causes are listed below.

## Vision

1. A **single-player daily game** (one shared seed per day) with a **leaderboard**.
2. **Quests and achievements**, in the manner of Nums and Glitchbomb.
3. A **token economy like Nums**: paid games in the game's native token (`$TILE` is hard-coded in the
   client for now; the official name is decided later with the team). The protocol tracks a mean score
   and pays players on that basis, with one change: below the mean (the mean shifted by the
   profitability margin) the player loses the whole stake. Nums gives back part of the stake, and the
   protocol struggled to be profitable.
4. Kept in mind for later: game extensions (rivers and so on), as in physical Carcassonne.

The macro tasks, in the owner's order: migrate Cairo to the latest version; re-enable Woodsman and
Herdsman; remove the Dojo layer entirely while keeping a similar repository layout; iterate on test
coverage and gas (including bitmaps and packing, using lessons from the organisation's other
projects); single-player first; then quests and achievements; then the token economy.

## Scope

In scope: Daily mode and Tutorial, on native Starknet contracts, with the leaderboard, then quests,
achievements and the token economy (phases P0 to P8, see [PLAN.md](PLAN.md)).

Out of scope for now:

- **Weekly** mode (D-4).
- **Multiplayer**, duel included (D-4).
- **Configurable game creation** (#181), taken out of the path (P-1).
- **Mainnet**: a trial comes later, only on the owner's explicit go (D-5). Sepolia is not required.
- **The official token name**: decided later with the team (D-2).
- **Extensions** (rivers and so on): only a design constraint in P5.
- **VRF randomness**: the predictable daily seed and the evolving game seed stay (D-3).

## Survey findings (measured, 2026-10-06)

### Contracts (`contracts/`: Cairo 2.13.1, Dojo 1.8.0, 14 models, 6 systems)

- The build passes with scarb 2.13.1 (50 s). Tests: **218 of 219 pass with snforge 0.51.2**. With the
  default installed versions (0.61, 0.64) the runner crashes (the pinned `snforge_std` 0.56 is
  incompatible). The GitHub CI is obsolete (scarb 2.7, and `sozo test` runs 0 tests).
- **Gas of a simple move** (`Daily.build`, no character, next to the starting tile): **64.5 M L2 gas**,
  of which **42.7 M in calls to the Dojo world** (26 reads = 36.2 M; 4 writes = 6.5 M). The first read
  of `Game` costs 8.55 M; one `Tile` costs 2.5 M.
- No structure state: every placement reruns a **recursive DFS** over the touched roads, cities and
  wonders, with 2 world reads per visited tile. The cost is unbounded and grows with the game. `Game`
  (22 fields) is read and rewritten whole at every move. The event component is a no-op, so the client
  depends entirely on Torii.
- About 70 to 75 % of the code is pure logic (types, elements, helpers, models). Leaving Dojo mostly
  touches `store.cairo`, `systems/`, `components/` and the tests.
- **Woodsman / Herdsman** were removed on 2024-06-25 (#95, "Single mode version"). What remains: the
  road/city adjacency data in all tile plans, 14 old test cases (not compiled), and a client that still
  knows the roles. Restoring them takes 2 role variants, `ForestCount` restored from history, and
  Forest scoring.
- Modes: Daily (simple 38-tile deck, shared seed of the day), Weekly (72 tiles), Tutorial, and
  "configurable" (#181). The leaderboard is top 3 only. The seed is deterministic (Poseidon), no VRF.
  There is no duel on `main` (the Duel contract exists only on `dev`).

### The tokenomics commit (#181, not supervised)

It is not the Nums economy: there is no mean score, and payment is the tournament's top 3 in minted
tokens times a supply multiplier. Flaws: the economy configuration is open to anyone, minting is open
to anyone on the deployed token, the admin is the first caller, prizes can be stolen through tournament
id collisions, supply is counted twice, and 80 % of stakes stay locked in the contracts. **It must not
be deployed.** Reusable: config validation, the supply curve (`economy_curve`), the multiplier frozen
at spawn, and the burn/mint helpers.

### Client

Two clients exist: `app/` (2024, R3F, deprecated) and `packages/` (2026, bun + turbo: game-core,
chain, renderer on imperative Three.js, ui on Tamagui, app-web, app-native). All the 2026 work
(#179 to #182, plans, PRD) was done by an agent under a human account. Unfulfilled promises: no WebGPU,
React Native is a shell, the Torii sync is a stub (SQL polling every 2 s). Probable causes of slowness:
one GLB clone and one edge geometry per tile (no instancing), full polling that re-renders an
844-line page, several simultaneous intervals. The build is unverified (bun is absent from the VPS).

### Branches

The four 2026 branches are already in `main`. `origin/dev` carries 19 commits from late 2024 that are
not in `main` (duel, tile varieties, mobile UI, performance fixes): a reference to port from, not to
merge. The other 2024 branches are stale.

### References

- Nums and Glitchbomb quests and achievements are Arcade packages that depend on Dojo. The organisation
  has native rewrites, `quiver_quest` and `quiver_achievement` (bal7hazar/quiver, Cairo 2.20); the
  Overseer accepts the dependency by pinned published version (0.2.0), see O-1 in
  [DECISIONS.md](DECISIONS.md).
- Grim World's indexer code may be copied, keeping its origin stated (O-3).
- Nums economy: entry in USDC, about 70 % swapped and burned, minted payout =
  `base(score) x offer_mult x burn / base(mean)`; below the mean the player recovers a fraction (for
  example 61 % at a score of 8 for a mean of 10).
- Grim World measured native contracts at **0.26x to 0.58x** the Dojo cost, about 0.45 M gas per new
  storage slot and about 0.03 M per rewritten slot.
