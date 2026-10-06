# Paved: plan

Validated by the owner on 2026-10-06 (D-1). Status values: `planned`, `briefed`, `in progress`, `done`.

## Phases

| # | Phase | Owner's task no. | Why at this place | Status |
|---|---|---|---|---|
| P0 | **Base**: pin the current toolchain, repair the CI, baseline measures (gas per move on 3 scenarios, coverage) and **golden games** (move sequences with expected score) | none | Without a baseline no gain can be measured; goldens prove that later phases do not change the rules | briefed |
| P1 | **Refocus on single player**: port only Daily (and Tutorial); Weekly, Configurable and the #181 economy leave the path (kept in history) | 5 (partly) | Less code to port and optimise | planned |
| P2 | **Leave Dojo** at constant compiler (2.13.1): native Starknet storage, native contract(s), real events, snforge tests, same directory layout | 3 | Dojo 1.8 locks Cairo 2.13, so the compiler cannot move while Dojo is there. Doing it at constant compiler isolates the change: goldens stay identical | planned |
| P3 | **Cairo migration**: Scarb 2.20.1 / snforge 0.64, alone in its PR | 1 | Becomes a plain bump (the known pattern from Slingfall and quiver) | planned |
| P4 | **Woodsman and Herdsman** | 2 | Before optimisation: Forest scoring adds nested DFS, and the new structure state must cover them by design | planned |
| P5 | **Gas and coverage iterations**: persistent structure state (union-find or equivalent) instead of DFS, packing and bitmaps, `Game` split (frozen config vs hot state) | 4 | Most of the gain is here; designed to take extensions (rivers) without a redo | planned |
| P6 | **Single-player product**: daily seed, full leaderboard (events plus a light indexer, or a bounded on-chain ranking), client wired to the native contracts | 5 | | planned |
| P7 | **Quests and achievements** through `quiver_quest` / `quiver_achievement` (pinned published version, never git or path) | 6 | | planned |
| P8 | **Tokenomics** (`$TILE`): paid game, moving mean shifted by profitability, stake lost below the threshold | 7 | Rewritten, not built on #181; needs the owner's parameters | planned |
| - | **Extensions** (rivers and so on) | 8 | Out of scope; a design constraint in P5 (extensible tile and zone types) | planned |

The client runs in parallel from P2: base is `packages/` (2026). Client P0 is measuring the current
frame time on the Mac (real browser, GPU); then an instanced renderer, no more polling (view calls for
the running game, an indexer for the leaderboard), and the native app put to sleep.

## Tracks

| Track | Delivers | Measured by |
|---|---|---|
| **CORE** (contracts) | P0 to P5: native contracts, Cairo 2.20, roles, optimised state | **L2 gas per move** (simple move, move with character, move that closes a large structure, worst case) by snforge and Sepolia receipts; goldens identical; **line coverage** (`cairo-coverage`) |
| **CLIENT** | `packages/` client on the native contracts, without Torii | **p95 frame time** at 38 and 72 tiles (Mac, real browser), draw calls, time to interactive, latency from move to display, click-to-display latency, long tasks and React commit time while polling |
| **META** (single-player product and progression) | P6 to P7: daily, leaderboard, quests, achievements | gas per meta action; completeness of the e2e scenarios |
| **ECO** (economy) | P8: token, paid entry, per-game settlement | profitability simulation (Monte-Carlo over score distributions), tested invariants (no mint outside the game system, real supply), audit |

Orchestrators: `paved-core` from P0, `paved-client` from P2; META and ECO later (possibly carried by
core). See [OPERATIONS.md](OPERATIONS.md).

## Targets

These are **estimates**, to be fixed after P2's native measure:

- Simple move **at most 10 M L2 gas** (against 64.5 M today).
- No move with unbounded cost.
- At least 90 % line coverage of the contracts.
- At 72 tiles on the Mac (M2 Max) under CDP CPU throttling 4x and a 60 Hz cadence unless said (P-7b):
  CPU + GPU time per frame p95 at most 16.7 ms and no frame over 1.5 intervals; time to interactive at
  most 2.0 s throttled and 0.5 s unthrottled; click to display p95 at most 50 ms and no long task over
  50 ms per placement, throttled; draw calls and triangles per median frame below baseline B.
