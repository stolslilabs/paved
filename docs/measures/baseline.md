# Baseline measures (phase P0)

Taken before any change to the contracts, to judge P2 (remove Dojo) and P5 (gas work) against.

- Date: 2026-10-06
- Commit: `76f8dd3` (branch `hp/paved-core/t-0001-p0-toolchain-pin-and-ci`, PR #185) plus the files of this PR
- Toolchain: scarb 2.13.1 (cairo 2.13.1, sierra 1.7.0), snforge 0.51.2, dojo 1.8.0, `~/.asdf/installs/...` binaries
- Reproduce: `scripts/measure.sh` (`gas`, `coverage`, `check-setup` or `all`); it sets `RAYON_NUM_THREADS=1` as `docs/programme/OPERATIONS.md` requires. The first figures were taken with the default thread count; a rerun of `scripts/measure.sh gas` with it gave identical gas figures (peak RSS 3.99 GB; with a0, 4.17 GB).

## L2 gas of one `Daily.build`

Tests: `contracts/tests/gas.cairo` (snforge integration crate; `contracts/tests/setup.cairo` is a copy of
`src/tests/setup.cairo` (header line names the source and commit; check with `scripts/measure.sh check-setup`, i.e. `diff <(tail -n +2 contracts/tests/setup.cairo) contracts/src/tests/setup.cairo`), because `paved::tests` is `#[cfg(test)]` and cannot be imported from `tests/`).

Method: `core::testing::get_available_gas()` is read right before and right after the `build` call of the
last move; the difference is the L2 (Sierra) gas of that call alone (setup, spawn and earlier moves are
excluded). The builder's tile is overwritten with the wanted plan (as the e2e tests do) so the sequences do
not depend on the random draw; plans stay within the Base deck counts. `--detailed-resources` only reports
whole-test totals and `--gas-report` does not exist in snforge 0.51.2, hence the deltas. Two runs gave
identical figures. Each test asserts `gas <= ceiling`, ceiling = measured + 5 %, rounded up.

| | Scenario | Tiles in structure | L2 gas (delta) | Ceiling (+5 %) |
| --- | --- | --- | --- | --- |
| a0 | open simple move: a road tile east of the start tile, closes nothing, no character | open | 53,633,322 | 56,314,989 |
| a | simple move closing a 2-tile city (new tile's S cap meets the start tile's N cap), no character, nothing scored | 2 (closed) | 64,102,212 | 67,307,323 |
| b | same move as a with a Lord placed on the new tile (city closed, scored, Lord recovered) | 2 (closed) | 72,155,500 | 75,763,275 |
| c | last tile closes a 6-tile city that holds a character (scored, character recovered) | 6 | 112,722,643 | 118,358,776 |
| d | worst case built: last tile of a 12-tile city tree, placed with a character | 12 | 247,082,185 | 259,436,295 |

Scenario d, how it was built: the DFS (`helpers/generic.cairo`, `conflict.cairo`) only walks a full
structure when it is closed (a missing neighbour stops the walk, `count = 0`) or, for `conflict`, when no
character is met. So the worst move is the one that closes a very large structure while the new tile carries
the only character: the conflict walk crosses the 11 existing tiles without short-circuit, then the
assessment walks the closed 12 tiles again, finds the character, solves and scores. The tree is the starter
city cap, two corridors, a T-junction, a west arm (corridor, 2 corners, cap) and an east arm (3 corners, cap,
placed last). Not explored: a last tile that closes several large structures at once (e.g. city and road),
which would add walks; the figure is the worst case we built, not a proven maximum.

Share of world calls (call tree of `snforge test --trace-components contract-name gas entry-point-type`,
scenario a only): `Daily.build` = 64,460,972 L2 gas, of which 31 nested `world` calls (26 `entity`,
5 `set_entity`) = 48,980,305 = 76.0 %. This call-level figure is 0.56 % above the delta of the table (the
earlier measure of 64,460,972 matches it). The trace run on one scenario took over 18 minutes and several GB,
so it was not repeated for b, c, d: their share is not measured.

Whole-test `--detailed-resources` of scenario a, for reference (includes setup): sierra gas 280,203,922;
syscalls StorageRead 654, StorageWrite 322, CallContract 155, GetExecutionInfo 151, EmitEvent 82,
Deploy 22, GetClassHashAt 1.

Output excerpt (`snforge test test_gas_`, the 5 `GAS` lines, one `[PASS]` line and the summary):

```
GAS a0_open_simple_move: 53633322
GAS a_simple_move: 64102212
[PASS] paved_tests::gas::test_gas_a_simple_move (l1_gas: ~0, l1_data_gas: ~21696, l2_gas: ~285498002)
GAS b_move_with_character: 72155500
GAS c_close_large_city: 112722643
GAS d_worst_case: 247082185
Tests: 5 passed, 0 failed, 0 ignored, 219 filtered out
```

### After P1 (Weekly, Configurable and the #181 economy removed)

Same tests, same method, same toolchain, run on 2026-10-06 on the commit of the PR `refactor: P1 scope,
drop Weekly, Configurable and the #181 economy`. The `Game` and `Tournament` models lost the config and
economy fields, so every `world` read and write of a build is smaller. The ceilings of
`contracts/tests/gas.cairo` are lowered to the new figure + 5 %.

| | L2 gas before (P0) | L2 gas after (P1) | Change | Ceiling before | Ceiling after |
| --- | --- | --- | --- | --- | --- |
| a0 | 53,633,322 | 47,125,474 | -12.1 % | 56,314,989 | 49,481,748 |
| a | 64,102,212 | 57,579,064 | -10.2 % | 67,307,323 | 60,458,018 |
| b | 72,155,500 | 65,625,152 | -9.0 % | 75,763,275 | 68,906,410 |
| c | 112,722,643 | 106,160,795 | -5.8 % | 118,358,776 | 111,468,835 |
| d | 247,082,185 | 240,377,237 | -2.7 % | 259,436,295 | 252,396,099 |

The golden games (whole games, spawn included) went down too: see `docs/measures/golden-games.md`.

### After P2 (Dojo removed, native Starknet storage)

Same tests, same method, same toolchain (scarb 2.13.1, snforge 0.51.2; no Dojo), run twice on
2026-10-06 on the commit of the PR `refactor: P2 native Starknet contracts, Dojo removed`, with
identical figures. The world calls (76 % of scenario a at P0) are gone: the state is read and written
with storage syscalls on packed slots (`docs/architecture/native-storage.md`), and a game contract
reads the player with one call to `Account`. The rules are unchanged (golden games identical). The
ceilings of `contracts/tests/gas.cairo` are lowered to the new figure + 5 %.

| | L2 gas P1 | L2 gas P2 | Change | P1 / P2 | Ceiling before | Ceiling after |
| --- | --- | --- | --- | --- | --- | --- |
| a0 | 47,125,474 | 7,799,482 | -83.4 % | 6.04 | 49,481,748 | 8,189,457 |
| a | 57,579,064 | 8,548,117 | -85.2 % | 6.74 | 60,458,018 | 8,975,523 |
| b | 65,625,152 | 9,704,369 | -85.2 % | 6.76 | 68,906,410 | 10,189,588 |
| c | 106,160,795 | 11,819,872 | -88.9 % | 8.98 | 111,468,835 | 12,410,866 |
| d | 240,377,237 | 21,895,031 | -90.9 % | 10.98 | 252,396,099 | 22,989,783 |

Golden games (whole test, spawn and the test's own state reads included):

| Golden | L2 gas P1 | L2 gas P2 | Change | P1 / P2 |
| --- | --- | --- | --- | --- |
| `daily_city5_game_over` | 502,727,336 | 106,111,373 | -78.9 % | 4.74 |
| `daily_road6` | 556,024,333 | 118,279,043 | -78.7 % | 4.70 |
| `daily_mixed_roles` | 535,832,671 | 113,176,918 | -78.9 % | 4.73 |
| `daily_real_deck_discards_to_game_over` | 392,683,480 | 103,613,438 | -73.6 % | 3.79 |
| `tutorial_full_sequence` | 1,042,528,480 | 116,162,877 | -88.9 % | 8.97 |

Output excerpt (`snforge test`, whole suite):

```
GAS b_move_with_character: 9704369
GAS a0_open_simple_move: 7799482
GAS a_simple_move: 8548117
GAS c_close_large_city: 11819872
GAS d_worst_case: 21895031
Tests: 226 passed, 0 failed, 0 ignored, 0 filtered out
	Maximum resident set size (kbytes): 2183960
```

Found while writing the P2 event tests: in scenario b the Lord is placed on `Spot::North`, the
north city cap of `FFCFFFCFF`, which stays open; the 2-tile city closed by the move is the south cap.
So b places a character but scores nothing (the P0 description above, "scored, Lord recovered", is
not what the test does). The test is kept as is so that the series stays comparable.

### After P3 (Scarb 2.20.1 / snforge 0.64.0)

Same tests and method. Toolchain moved to scarb 2.20.1 / snforge 0.64.0 (organisation D-180, phase P3), run on 2026-10-06 (VPS, `RAYON_NUM_THREADS=1`, capped 8 GiB; `scarb build` peak 1,197,760 KB, full `snforge test` peak 2,138,340 KB). All figures rose: this is a compiler effect (the code and the rules are unchanged; the golden expected values are identical), so the ceilings are raised to the new figure + 5 %, the one case where a rise may raise a ceiling.

| Scenario | L2 gas P2 | L2 gas P3 | Change | Ceiling P2 | Ceiling P3 |
| --- | --- | --- | --- | --- | --- |
| a0 | 7,799,482 | 8,664,572 | +11.1 % | 8,189,457 | 9,097,801 |
| a | 8,548,117 | 9,525,767 | +11.4 % | 8,975,523 | 10,002,056 |
| b | 9,704,369 | 10,887,309 | +12.2 % | 10,189,588 | 11,431,675 |
| c | 11,819,872 | 13,619,382 | +15.2 % | 12,410,866 | 14,300,352 |
| d | 21,895,031 | 25,305,931 | +15.6 % | 22,989,783 | 26,571,228 |

Output excerpt (`snforge test`, whole suite, 246 tests since the views of #200):

```
GAS b_move_with_character: 10887309
GAS a0_open_simple_move: 8664572
GAS a_simple_move: 9525767
GAS c_close_large_city: 13619382
GAS d_worst_case: 25305931
Tests: 246 passed, 0 failed, 0 ignored, 0 filtered out
```

### After P4 (Woodsman and Herdsman)

Same tests, same method, scarb 2.20.1 / snforge 0.64.0, run on 2026-10-06 (VPS, `RAYON_NUM_THREADS=1`,
capped 8 GiB). Cause of the rise: **forest scoring**. The forest starts of the layouts
(`elements/layouts/*`, `starts()`), commented out since #95, are active again, so every build now
assesses (walks) each forest it touches, with or without a Woodsman or a Herdsman on the board;
the walk of a forest visits the roads and the cities next to it as well. The "before" figures are those of
P3 above, which the unchanged `main` (`f351faa`) reproduced to the unit when measured again the same day.
No other cause: the rules are unchanged (the five golden cases keep every expected value), and a game
that builds nothing (`daily_real_deck_discards_to_game_over`) has the same figure as before. The ceilings of
`contracts/tests/gas.cairo` are raised to measured + 5 %.

| Scenario | L2 gas P3 | L2 gas P4 | Change | Ceiling P3 | Ceiling P4 |
| --- | --- | --- | --- | --- | --- |
| a0 | 8,664,572 | 9,634,832 | +11.2 % | 9,097,801 | 10,116,574 |
| a | 9,525,767 | 10,878,072 | +14.2 % | 10,002,056 | 11,421,976 |
| b | 10,887,309 | 12,252,204 | +12.5 % | 11,431,675 | 12,864,815 |
| c | 13,619,382 | 17,085,237 | +25.4 % | 14,300,352 | 17,939,499 |
| d | 25,305,931 | 32,287,556 | +27.6 % | 26,571,228 | 33,901,934 |

The rise is largest where the structures are largest (c, d): the forests of the tiles of a big city are
walked too. The persistent structure state of P5 is meant to remove these walks. The golden games
(whole games) rose too, see `docs/measures/golden-games.md`.

Output excerpt (`snforge test test_gas_`, the 5 `GAS` lines):

```
GAS a0_open_simple_move: 9634832
GAS b_move_with_character: 12252204
GAS a_simple_move: 10878072
GAS c_close_large_city: 17085237
GAS d_worst_case: 32287556
```

### After P5-2 (`Game` split, player in config, builder in game state)

Same tests and method, scarb 2.20.1 / snforge 0.64.0. The figures are the `GAS` lines of the CI
`Test game` job of the PR (Linux, run 37601718300), not a local run; "P4" is the table above. Cause of the
fall: no `Account` call and no player read per move, no `Builder` map entry, one game slot read fewer, no
player slot in a drawn `Tile`; the walks are unchanged (P5-4). The ceilings of `contracts/tests/gas.cairo` are
lowered to measured + 5 %.

| Scenario | L2 gas P4 | L2 gas P5-2 | Change | Ceiling P4 | Ceiling P5-2 |
| --- | --- | --- | --- | --- | --- |
| a0 | 9,634,832 | 9,301,448 | -3.5 % | 10,116,574 | 9,766,521 |
| a | 10,878,072 | 10,442,168 | -4.0 % | 11,421,976 | 10,964,277 |
| b | 12,252,204 | 11,820,610 | -3.5 % | 12,864,815 | 12,411,641 |
| c | 17,085,237 | 16,688,689 | -2.3 % | 17,939,499 | 17,523,124 |
| d | 32,287,556 | 30,685,028 | -5.0 % | 33,901,934 | 32,219,280 |

### After P5-3 (characters packed in one slot)

Same tests and method, scarb 2.20.1 / snforge 0.64.0. The figures are the `GAS` lines of the CI
`Test game` job of the PR (Linux, run 37603717369, same code as the final head: the final commit only lowers
ceilings and writes this section); "P5-2" is the table above. Cause of the fall: the `Char` and `CharPosition`
maps (3 storage slots per placement, 2 of them new every time) are one `Characters` slot per game, read
and rewritten; the walks look a character up with one slot read. The ceilings of
`contracts/tests/gas.cairo` are lowered to measured + 5 %.

| Scenario | L2 gas P5-2 | L2 gas P5-3 | Change | Ceiling P5-2 | Ceiling P5-3 |
| --- | --- | --- | --- | --- | --- |
| a0 | 9,301,448 | 9,240,568 | -0.7 % | 9,766,521 | 9,702,597 |
| a | 10,442,168 | 10,363,688 | -0.8 % | 10,964,277 | 10,881,873 |
| b | 11,820,610 | 11,573,236 | -2.1 % | 12,411,641 | 12,151,898 |
| c | 16,688,689 | 16,372,535 | -1.9 % | 17,523,124 | 17,191,162 |
| d | 30,685,028 | 30,145,567 | -1.8 % | 32,219,280 | 31,652,846 |

### After P5-4 (structure state for roads, cities, wonders and conflicts)

Same tests and method, scarb 2.20.1 / snforge 0.64.0. The figures are the `GAS` lines of the CI
`Test game` job of the PR (Linux, run 37610956822, same code as the final head: the final commit only
lowers ceilings and writes the docs); "P5-3" is the table above. Cause of the fall: the walks of roads,
cities and wonders and the conflict walk are gone (union-find over record pages,
`docs/architecture/structure-state.md`); the forest walk runs only when the forest's root is closed
and holds a Woodsman or a Herdsman; the neighbourhood is read once per move (8 positions, against 4
then 8 before). What the move adds: the record pages it reads and writes (one slot per neighbour
tile touched, the new tile's page). The ceilings of `contracts/tests/gas.cairo` are lowered to measured
+ 5 %.

| Scenario | L2 gas P5-3 | L2 gas P5-4 | Change | Ceiling P5-3 | Ceiling P5-4 |
| --- | --- | --- | --- | --- | --- |
| a0 | 9,240,568 | 9,143,695 | -1.0 % | 9,702,597 | 9,600,880 |
| a | 10,363,688 | 8,918,742 | -13.9 % | 10,881,873 | 9,364,680 |
| b | 11,573,236 | 9,967,911 | -13.9 % | 12,151,898 | 10,466,307 |
| c | 16,372,535 | 10,639,848 | -35.0 % | 17,191,162 | 11,171,841 |
| d | 30,145,567 | 12,701,782 | -57.9 % | 31,652,846 | 13,336,872 |

**c and d against a** (acceptance of P5-4: within 10 %): c is a + 19.3 %, d is a + 42.4 %. Their cost no
longer depends on the size of the city (the 12-tile tree of d costs 2.1M more than the 6-tile city of
c, against 13.8M at P5-3); what remains is the work of the move itself, which a does not do:

- c scores: the character is recovered (its `Characters` entry, its tile slot and `GameState` read
  and written, the builder read again after the assessment) and one `Scored` is emitted; c's tile
  also has one more neighbour tile than a's (a diagonal one, read for its wonder: a tile read).
- d places a character (b - a = 1.05M: the idle check, the `Characters` slot) and scores it (as c),
  and its tile has three neighbour tiles (a has one: two sides and a diagonal against one side): two
  more tile reads and one more record page read and written.

Measured cost of the pieces (snforge, local, scenario a0; get_unspent_gas around each call, dev
profile): reading the neighbourhood 0.93M (8 position reads of about 84k, a tile read of about
105k), placing the tile on the structure state about 1.2M, writing two record pages 0.21M.

Output excerpt (CI, the 5 `GAS` lines):

```
GAS b_move_with_character: 9967911
GAS a0_open_simple_move: 9143695
GAS c_close_large_city: 10639848
GAS a_simple_move: 8918742
GAS d_worst_case: 12701782
```

Golden games: `docs/measures/golden-games.md`.

## Line coverage of `contracts/src`

**Not measured.** `cairo-coverage` 0.6.1 was installed in user space (release tarball into
`~/.local/bin`; the official `install.sh` was not run because it appends to `~/.bashrc`).
`snforge test --coverage` ran all tests, then `cairo-coverage` aborted:

```
$ prlimit --as=8589934592 -- /usr/bin/time -v snforge test --coverage
memory allocation of 632 bytes failed
[ERROR] cairo-coverage failed to generate coverage - ... failed with status signal: 6 (SIGABRT)
	Elapsed (wall clock) time: 3:22.13
	Maximum resident set size (kbytes): 7896092
```

Peak memory reached 7.9 GB under the 8 GiB cap, so it does not fit this VPS. The command is
`scripts/measure.sh coverage`, to be run on the Mac (the script uses `/usr/bin/time -l` and no cap on Darwin). The overall and per-directory table (tests/ and mocks/
excluded) is computed by that script from `coverage/coverage.lcov`; its awk part has not been exercised yet.

## Commands and peak memory (VPS, under `prlimit --as=8589934592`)

| Command | Result | Peak RSS |
| --- | --- | --- |
| `scarb fmt --check` | pass | n/a |
| `scarb build` | pass | 2.65 GB |
| `snforge test test_gas_` | 5 passed | 4.17 GB (single-threaded) |
| `snforge test` | `Tests: 222 passed, 0 failed, 1 ignored, 0 filtered out` | 5.53 GB |
| `snforge test --coverage` | aborted in `cairo-coverage` | 7.90 GB |
| `snforge test` after P1 | `Tests: 192 passed, 0 failed, 0 ignored, 0 filtered out` (the CI job `Test game` of the PR passes) | 4.32 GB |
| `scarb build` after P2 | pass | 0.85 GB |
| `snforge test` after P2 | `Tests: 226 passed, 0 failed, 0 ignored, 0 filtered out` | 2.18 GB (single-threaded) |
| `snforge test --max-threads 2` after P5-4 (Mac, `/usr/bin/time -l`) | `Tests: 349 passed, 0 failed, 0 ignored, 0 filtered out` (CI) | 6.14 GB (two test threads, the Mac's measure) |
