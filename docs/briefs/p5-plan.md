# P5 plan: gas and coverage, stacked PRs

The ordered PRs of phase P5, to brief one at a time. Design:
[`docs/architecture/structure-state.md`](../architecture/structure-state.md). Each PR stacks on the
previous one and keeps the rules of `docs/programme/OPERATIONS.md`: goldens never edited, every
gameplay test with a gas budget, single-threaded builds, toolchain scarb 2.20.1 / snforge 0.64.0.

Common to every PR:

- **Invariants**: the eight golden games pass unchanged; the views and events of
  `public-interface.md` and `native-storage.md` keep names, fields and meanings; the view invariants
  of the design hold (player answerable, `tile_count >= 2` after spawn, `builder.tile_id` after a
  surrender and after a last-tile end, `built`/`discarded` counting).
- **Test command**: the run is scoped to the parts touched, under the cap the first time:
  `cd contracts && RAYON_NUM_THREADS=1 prlimit --as=8589934592 -- /usr/bin/time -v snforge test <filter>`.
  The whole suite peaked at 2.1 GB at P3, so a PR that touches storage may run `snforge test` whole.
  The gas figures committed are from Linux (VPS or CI).
- **Gas**: a PR that lowers a figure lowers its ceiling to measured + 5 % in the same PR, and adds a
  section to `docs/measures/baseline.md` (and `golden-games.md` for the goldens) with before/after.
- **Audit**: OPERATIONS names one for "a change of the structure-state algorithm", lens correctness
  against the goldens. It applies to P5-4, P5-5 and P5-8.

Profiles: impl-sonnet unless marked. Only P5-4 needs impl-opus.

| # | PR | Profile | Audit | Depends on |
|---|---|---|---|---|
| P5-1 | Plan tables, symmetry test and walk oracle | Sonnet | no | main |
| P5-2 | `Game` split, player in config, builder in game state | Sonnet | no | P5-1 |
| P5-3 | Characters packed in one slot | Sonnet | no | P5-2 |
| P5-4 | Structure state for roads, cities, wonders and conflicts | **Opus** | **yes** | P5-3 |
| P5-5 | Forests on the structure state, P-15 and its golden | Sonnet | **yes** | P5-4 |
| P5-6 | Gas pass: one write per slot, ceilings, scenario e, baseline "After P5" | Sonnet | no | P5-5 |
| P5-7 | Line coverage in split runs, gaps closed to 90 % | Sonnet | no | P5-6 (P5-7's script part can start after P5-1) |
| P5-8 | Forest re-assessed when an adjacent road closes away | Sonnet | **yes** | P5-5, and a PM ruling (P-16): not briefed before |

## P5-1 Plan tables, symmetry test and walk oracle

- **Goal**: packed constant tables per plan (per area: category, `record_index`, moves, half-edges per
  direction, adjacent road and city areas; per plan: starts in order, wonder spot) with rotation by
  index arithmetic; a test that they equal what `elements/layouts/*` return for every plan, area and
  orientation; an exhaustive test that the move relation is symmetric between areas of two adjacent
  tiles that a placement accepts (design, "Assumption to prove first"); the walks of
  `helpers/{generic,conflict,wonder,forest,simple}.cairo` copied unchanged into a test-only oracle.
  No runtime change.
- **Allowlist**: `contracts/src/structure/tables.cairo` (new), `contracts/src/tests/oracle.cairo`
  (new), `contracts/src/lib.cairo` (the module lines only).
- **Acceptance**: table equality and symmetry tests pass; no other test changes; gas figures
  unchanged. If the symmetry test fails, the PR stops there and reports the asymmetric pairs (the
  design is revised before P5-4).
- **Test**: `snforge test paved::structure::` and `snforge test paved::tests::oracle`.

## P5-2 `Game` split, player in config, builder in game state

- **Goal**: `GameConfig` (player, mode, start time, tile limit; written at spawn), `GameState` (seed;
  deck bitmap, tile count, score, discarded, built, over, held tile, `characters u16`), `GameEnd`
  (end time, tournament id); the `Builder` map goes, `Store::builder` becomes a facade (zero builder
  for any player but the game's, so `Builder: Does not exist` is unchanged); `Tile` loses its player
  slot; `build`, `discard`, `surrender` check `caller == GameConfig.player_id` and no longer call
  `Account` (spawn still does). Views read the new storage (design, "Views and events").
- **Allowlist**: `contracts/src/store.cairo`, `contracts/src/models/{index,game,builder,tile}.cairo`,
  `contracts/src/components/{playable,tutoriable}.cairo`, `contracts/src/views.cairo`,
  `contracts/src/tests/**` (harness and setup only where the facade needs it; golden data untouched),
  `contracts/tests/setup.cairo` (the copy, `scripts/measure.sh check-setup`), `contracts/tests/gas.cairo`
  (ceilings), `docs/architecture/native-storage.md` (storage table, access section),
  `docs/architecture/public-interface.md` (the section "How the views are read today" only),
  `docs/measures/{baseline,golden-games}.md`.
- **Invariants**: as above, and the access rule: only the spawning player acts on a game (e2e
  `access.cairo` unchanged and passing).
- **Acceptance**: whole suite passes; goldens unchanged; a view test for each invariant of the design
  (surrender keeps `builder.tile_id`, last-tile end gives 0, `tile_count >= 2` after spawn, player
  answerable for a game with no build); gas lower on every scenario, ceilings lowered.
- **Test**: `snforge test` (whole crate: the storage is under every test).

## P5-3 Characters packed in one slot

- **Goal**: `Char` and `CharPosition` maps replaced by one `Characters` slot per game (16 bits per
  role: tile id, spot, weight, power); `Store::character` stays as a facade; the walks (still in use
  until P5-4) find the character of a tile spot through the facade.
- **Allowlist**: `contracts/src/store.cairo`, `contracts/src/models/{index,character,builder}.cairo`,
  `contracts/src/helpers/{generic,wonder,forest}.cairo` (the character lookup only),
  `contracts/src/tests/oracle.cairo` (the same lookup),
  `contracts/src/views.cairo`, `contracts/src/tests/**` (facade uses), `contracts/tests/setup.cairo`,
  `contracts/tests/gas.cairo`, `docs/architecture/native-storage.md`, `docs/measures/{baseline,golden-games}.md`.
- **Acceptance**: whole suite passes; goldens unchanged; `characters` view unchanged on the e2e
  boards; scenario b lower, ceilings lowered.
- **Test**: `snforge test`.

## P5-4 Structure state for roads, cities, wonders and conflicts (impl-opus, audit)

- **Goal**: record pages, `Tile.refs`, the union-find update of each build and of the spawn
  (design, "Update algorithm per move", steps 1 to 5); `assert_structure_idle` from `chars`; road,
  city and wonder assessment from the roots, in today's order. Forests keep `ForestCount` for now
  (it walks positions, which are unchanged). `generic.cairo`, `conflict.cairo`, `wonder.cairo` leave
  the runtime (the oracle of P5-1 keeps them in tests). A differential check against the oracle runs
  after every move of the goldens, the gas scenarios and the e2e boards.
- **Why Opus**: the core algorithm: half-edge accounting across 8 neighbours, unions with
  deterministic roots, move-local caching of pages, event order.
- **Allowlist**: `contracts/src/structure/**` (new module), `contracts/src/lib.cairo` (module lines),
  `contracts/src/store.cairo`, `contracts/src/models/{game,tile,builder}.cairo`,
  `contracts/src/components/{playable,tutoriable}.cairo`,
  `contracts/src/helpers/{generic,conflict,wonder}.cairo` (removal), `contracts/src/tests/**`
  (oracle checks; golden data untouched), `contracts/tests/{setup,gas}.cairo`,
  `docs/architecture/{native-storage,structure-state}.md` (as built),
  `docs/measures/{baseline,golden-games}.md`.
- **Invariants**: as above; `Scored` events in the same order with the same fields (e2e
  `events.cairo` unchanged and passing).
- **Acceptance**: goldens unchanged; differential check clean on every move it covers; unit tests of
  pages, union by size and `find` depth; c and d within 10 % of a (their cost no longer grows with the
  city), ceilings lowered.
- **Audit**: correctness against the goldens (OPERATIONS), on the PR head, in parallel with the review.
- **Test**: `snforge test`.

## P5-5 Forests on the structure state, P-15 and its golden (audit)

- **Goal**: forest assessment from the root (gate `open == 0` and a forest character; the scan of the
  design, "Forests"); Herdsman counts distinct **closed** city roots only (**P-15**, a rule correction
  of the PM); `forest.cairo` and `simple.cairo` leave the runtime. A new golden case
  `test_golden_daily_forest_herdsman_open_city` builds a forest that touches one open city at two
  places with a Herdsman on it: its doc comment gives the 2024 figure (recorded on the commit before
  the fix, the bug counting the city) and the P5 figure (the city not counted), computed by hand.
- **Allowlist**: `contracts/src/structure/**`, `contracts/src/models/game.cairo`,
  `contracts/src/helpers/{forest,simple}.cairo` (removal), `contracts/src/tests/golden/forest.cairo`
  (the new case only; existing cases untouched), `contracts/src/tests/oracle.cairo` (the oracle's
  Herdsman count follows P-15, stated in a comment), `contracts/src/tests/e2e/forest.cairo`,
  `contracts/tests/gas.cairo`, `docs/architecture/{native-storage,structure-state}.md` (forest rule,
  P-15), `docs/measures/{baseline,golden-games}.md` (new case and its ceiling).
- **Invariants**: as above; the three P4 forest goldens unchanged.
- **Acceptance**: the new golden passes with the P5 figure and its comment shows the 2024 one; the
  title says the rule change (`... [rule: P-15 Herdsman open city]`); gas of the forest goldens lower.
- **Audit**: correctness against the goldens, with P-15 as the one stated difference.
- **Test**: `snforge test paved::tests::golden::` `snforge test paved::tests::e2e::forest`
  `snforge test paved::structure::`.

## P5-6 Gas pass

- **Goal**: each storage slot read once and written once per transaction (the move-local cache of
  P5-4 extended to `Tile`, `GameState`, `Characters`); positions only (no tile read) for diagonal
  neighbours that cannot hold a wonder; a gas scenario e (a move that closes a forest with a Woodsman)
  and a worst case under P5 (the deepest `find` and the largest forest scan built); every gameplay
  test with a budget; baseline "After P5" with the five scenarios against P4. Try the full-deck golden
  (O-12, O-17): one game per run, memory measured first; kept only if it fits a test's cap.
- **Allowlist**: `contracts/src/structure/**`, `contracts/src/store.cairo`,
  `contracts/src/models/**`, `contracts/src/components/{playable,tutoriable}.cairo`,
  `contracts/tests/gas.cairo`, `contracts/src/tests/**` (budgets, the full-deck case),
  `docs/measures/{baseline,golden-games}.md`.
- **Acceptance**: a0, a, b at most 10M (or the measured figure and why, if the estimate does not hold);
  every figure lower or equal to P5-5; goldens unchanged.
- **Test**: `snforge test`.

## P5-7 Line coverage

- **Goal**: `scripts/measure.sh coverage-split`: `snforge test --coverage <filter>` per group (types
  and elements, helpers and models, structure, e2e, golden), each capped at 8 GiB with its peak
  printed, the lcov files merged by summing hits per `SF`/`DA` (`lcov -a` if present, else awk), then
  the existing per-directory table. Measure, then add tests for the gaps until at least 90 % of
  `contracts/src` lines (tests and mocks excluded). If a group exceeds the cap, split it by test name;
  on the Mac when it is offered again.
- **Allowlist**: `scripts/measure.sh`, `contracts/src/**/*.cairo` (tests only: `#[cfg(test)]` modules
  and `contracts/src/tests/**`), `docs/measures/baseline.md` (coverage section).
- **Acceptance**: the table in `baseline.md` with the command, the peak of each group and the merged
  figure; at least 90 %, or the figure reached and the lines left with the reason.
- **Test**: the script itself, then `snforge test <module>` for each test added.

## P5-8 Forest re-assessed when an adjacent road closes away (after a PM ruling)

- **Goal**: when a road root closes during a move, the forests adjacent to its nodes are assessed once
  each, after the start spots and the wonders. Today (and after P5-5) a forest whose last open road
  closes away from it never scores: its Woodsman or Herdsman never comes back. Not briefed until the PM
  rules (proposed P-16): it changes the rules of 2024, which P-15 keeps otherwise.
- **Allowlist**: `contracts/src/structure/**`, `contracts/src/models/game.cairo`,
  `contracts/src/tests/golden/forest.cairo` (one new case), `contracts/src/tests/oracle.cairo`,
  `docs/architecture/{native-storage,structure-state}.md`, `docs/measures/golden-games.md`.
- **Acceptance**: a new golden shows the forest scoring on the move that closes its road away; the
  existing goldens unchanged.
- **Audit**: correctness against the goldens.
- **Test**: `snforge test paved::tests::golden::` `snforge test paved::structure::`.
