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

### After P5-5 (forests on the structure state, P-15)

Same tests and method, scarb 2.20.1 / snforge 0.64.0. The figures are the `GAS` lines of the CI
`Test game` job of the PR (Linux, run 37616293570, same code as the final head: the final commit only
lowers ceilings and writes the docs). Cause of the small fall: a forest start costs a root read
instead of the P5-4 gate plus walk set-up; no scenario scores a forest. The ceilings of
`contracts/tests/gas.cairo` are lowered to measured + 5 %.

| Scenario | L2 gas P5-4 | L2 gas P5-5 | Change | Ceiling P5-4 | Ceiling P5-5 |
| --- | --- | --- | --- | --- | --- |
| a0 | 9,143,695 | 9,128,151 | -0.2 % | 9,600,880 | 9,584,559 |
| a | 8,918,742 | 8,908,025 | -0.1 % | 9,364,680 | 9,353,427 |
| b | 9,967,911 | 9,957,194 | -0.1 % | 10,466,307 | 10,455,054 |
| c | 10,639,848 | 10,630,441 | -0.1 % | 11,171,841 | 11,161,964 |
| d | 12,701,782 | 12,692,375 | -0.1 % | 13,336,872 | 13,326,994 |

The forest goldens, where forests score, fall by 1.9 % to 2.7 %: `docs/measures/golden-games.md`.
Scenario e (a move that closes a forest with a Woodsman) is added in P5-6.

### After P5-6 (gas pass)

Same tests and method, scarb 2.20.1 / snforge 0.64.0. The P5-6 figures are the `GAS` lines of the CI
`Test game` job of PR #224 (Linux, run 37624454030, same code as the final head: the final commit only
sets budgets and writes the docs); they equal the local Mac run to the unit. Scenarios e (a move that
closes a forest of 4 tiles with a Woodsman, 329 points, the P4 ring golden) and f (the last tile of a loop
of 12 road tiles closes a forest of 16 nodes that holds a Woodsman: the largest forest scan built) are new:
their P4 and P5-5 figures were measured on those commits (`64739c2a`, `d2061597`) with the scenario
tests copied onto them, locally on the Mac. The ceilings of `contracts/tests/gas.cairo` are measured + 5 %.

| Scenario | L2 gas P4 | L2 gas P5-5 | L2 gas P5-6 | Change vs P5-5 | Ceiling P5-6 |
| --- | --- | --- | --- | --- | --- |
| a0 | 9,634,832 | 9,128,151 | 7,942,583 | -13.0 % | 8,339,713 |
| a | 10,878,072 | 8,908,025 | 7,704,827 | -13.5 % | 8,090,069 |
| b | 12,252,204 | 9,957,194 | 8,677,416 | -12.9 % | 9,111,287 |
| c | 17,085,237 | 10,630,441 | 8,548,123 | -19.6 % | 8,975,530 |
| d | 32,287,556 | 12,692,375 | 9,877,960 | -22.2 % | 10,371,858 |
| e | 23,285,560 | 15,004,154 | 12,020,508 | -19.9 % | 12,621,534 |
| f (worst forest scan) | 49,286,395 | 27,744,345 | 21,679,674 | -21.9 % | 22,763,658 |

a0, a and b are at most 10M (acceptance), every figure is lower than P5-5. What changed:

- **Move-local cache extended**: the `Characters` word (read at the first character, written once by
  `flush`) and the built tile (written once, with its position, after the assessment) join the record
  pages in `Structures`. The builder is no longer written before the assessment and read back after it:
  a recovered role goes back into the `Game` in memory (`GameState` is written once at the end of the
  move). A character on the built tile is cleared in the cache. Spawn no longer writes the builder before
  the game (`set_game` wrote it again).
- **Fit check on the oriented tables** (`placement::assert_fits`, same reverts as `Tile::can_place`; the
  edge categories equal the layouts, tested): the layout-based check cost 0.7M L2 gas of Sierra.
- **No 256-bit power loop** for the bit of a role or a card (`Bitmap::set_bit_at` builds `2^i` with a loop of
  256-bit products, about 0.25M each, twice for a character, again for a recovery).
- **Positions carry a wonder flag** (bit 8 of the stored tile id): a diagonal neighbour that holds no wonder
  is not read, only its position (a read of about 0.1M saved per such neighbour).
- **The forest scan reads each tile once** (a dictionary of slots by position, the built tile seeded from the
  cache): f fell from 27.7M to 21.7M, e from 15.0M to 12.0M.
- The tournament id is computed only when the game is over (about 0.03M).

Measured with `cairo-profiler` (`snforge test --build-profile`, 0.17.0) and `--detailed-resources`: a
storage read costs about 0.1M L2 gas and a write about 0.13M (key hashing included), the Sierra cost of a
`build` is about 6.4M of the 7.9M. The rest of a0 is, by the profile: `draw_plan` 2.5M (39 %: the deck is
rebuilt from the bitmap at every draw in `helpers/random_deck`, outside this PR's allowlist), the placement
1.0M (8 position reads 0.88M of it), the assessment 0.6M, dictionaries 0.5M.

**c and d against a** (P5-4 left them at +19.3 % and +42.4 %): c is a + 10.9 %, d is a + 28.2 %, b is a + 12.6 %.
What remains is work that a does not do and that the one-read-one-write rule keeps: the last build of a has
16 storage reads and 7 writes, c has 23 and 9, d 24 and 8 (`--detailed-resources`, last move alone): c and d
read a page and a tile more per neighbour (d has two side neighbours, a one), the `Characters` word, and write
the recovered tile and the word; they emit a `Scored`; d also runs the idle check and the unions of a
closing tile with several neighbours, and scores a 12-node structure (`compute_multiplier`). Nothing in them
grows with the size of the structure.

Worst cases: d (a 12-tile city tree, the deepest `find` of the gas scenarios) 9.9M, f 21.7M. A forest scan costs
about 0.6M per node of the forest (one position read, one tile read and the finds); a forest holds at most
the 38 tiles of the deck, so the bound of a move is about 38 x 0.6M + 8M = 31M, no move is unbounded.

Output excerpt (CI, the 7 `GAS` lines):

```
GAS a0_open_simple_move: 7942583
GAS e_close_forest: 12020508
GAS d_worst_case: 9877960
GAS a_simple_move: 7704827
GAS c_close_large_city: 8548123
GAS f_worst_forest_scan: 21679674
GAS b_move_with_character: 8677416
```

Golden games and the full-deck case: `docs/measures/golden-games.md`. Every gameplay test of `src/tests/e2e/`,
`golden/` and `differential.cairo` that does not expect a revert now carries `#[available_gas]` (measured
+ 5 %, from the same CI log).

### After P-17 (same-draw optimisation)

Same tests and method, scarb 2.20.1 / snforge 0.64.0. Figures are the `GAS` lines of the CI `Test game` job of
PR #225 (Linux, run 37627275425, head `9839dcf8`; the final head only sets budgets and writes the docs); they
equal the local Mac run to the unit. The scenarios overwrite the plan of the tile in hand, but a `build` still
draws the next tile at its end (`draw_plan`), so the draw is inside every figure. No figure is above P5-6.

| Scenario | L2 gas P5-6 | L2 gas P-17 | Change | Ceiling P-17 |
| --- | --- | --- | --- | --- |
| a0 | 7,942,583 | 5,589,725 | -29.6 % | 5,869,212 |
| a | 7,704,827 | 5,075,315 | -34.1 % | 5,329,081 |
| b | 8,677,416 | 6,047,904 | -30.3 % | 6,350,300 |
| c | 8,548,123 | 6,087,935 | -28.8 % | 6,392,332 |
| d | 9,877,960 | 6,976,948 | -29.4 % | 7,325,796 |
| e | 12,020,508 | 9,291,506 | -22.7 % | 9,756,082 |
| f (worst forest scan) | 21,679,674 | 19,006,366 | -12.3 % | 19,956,685 |

What changed: `draw_plan` no longer rebuilds the deck from the bitmap (one dictionary read and write per
withdrawn card, the 2.5M L2 gas of Sierra, 39 % of a0 in the P5-6 profile). `helpers/random_deck::draw_from_bitmap`
counts the withdrawn cards with a popcount and reads the drawn slot through a short chain of lookups: withdrawing
the cards in ascending order moves the card of the last slot into the hole, so slot `q` holds `q` unless card `q`
is withdrawn, in which case it holds what the last slot held at that withdrawal (rank = popcount of the bitmap up
to it). Same card and same remaining count as `from_bitmap` + `draw`, so the seed-to-tiles mapping does not change.

Output excerpt (CI, the 7 `GAS` lines):

```
GAS a0_open_simple_move: 5589725
GAS e_close_forest: 9291506
GAS d_worst_case: 6976948
GAS a_simple_move: 5075315
GAS c_close_large_city: 6087935
GAS f_worst_forest_scan: 19006366
GAS b_move_with_character: 6047904
```

Scenario f now also asserts its exact score (434) and that the Woodsman is back in the builder's hand.

### Leaderboard behind an interface (P6, stage A)

The tournament ranking moved behind `LeaderboardTrait` (`contracts/src/leaderboard.cairo`,
`docs/architecture/leaderboard.md`). Behaviour, events and `contracts/abis/*.json` are unchanged. Scarb 2.20.1 /
snforge 0.64.0, Mac (aarch64), `RAYON_NUM_THREADS=1`, `--max-threads 2`; the Linux figures are those of the CI
log of the PR: the `Test game` job (run 37652684501, Linux) gave the same L2 gas, to the unit, as the Mac for g to j, a0 to f and the 22 bench cases, so the ceilings stand.

**Closing moves, one external call.** `contracts/tests/gas.cairo` g to j: `get_available_gas()` right before
and right after the call. The scenario is the one of scenario c (a 6-tile city closed, score 1379), then
`surrender`, which ends the game in its tournament. Before the interface, the same four scenarios (with the
ranking forced through `Store.set_tournament`) gave the "main" column.

| | Scenario | L2 gas main (`9f930468`) | L2 gas after | Change | Ceiling |
|---|---|---|---|---|---|
| g | closing move that ranks at rank 1 and shifts two ranks (full board 30, 20, 10) | 1,440,588 | 1,234,989 | -205,599 (-14.3 %) | 1,296,739 |
| h | closing move that does not rank (full board 2000, 1900, 1800) | 1,440,588 | 897,489 | -543,099 (-37.7 %) | 942,364 |
| i | game over after its tournament closed (no ranking at all) | 726,130 | 719,000 | -7,130 (-1.0 %) | 754,950 |
| j | the `tournament` view (prize record + three ranks) | 316,518 | 370,228 | +53,710 (+17.0 %) | 388,740 |

The update itself, isolated by difference: main g - main i = 714,458 L2 gas for the ranking update of a closing
move, whether it ranks or not (it read and wrote the five slots every time); after the interface,
g - i = 515,989 when it ranks (rank 1, two shifts) and h - i = 178,489 when it does not. These include the
write of the game-end slot (`set_game_end`, the same in both). The view costs more because the prize
record (two slots) and the ranking (four slots) are two storage entries, two key hashes, where the five-slot
record was one. A first version that read the four ranking slots through a storage node (one key hash per
member) was dearer than this one on the view and on a ranking closing move, and was dropped.

The other scenarios (a0 to f), which never reach the leaderboard, measure 6,310 (a0) to 41,830 (f) L2 gas
more than on main (+0.1 % to +0.2 %): 5,596,035 against 5,589,725 for a0. It is not the call site (the same
figures with the block written inline in `build`); the cause was not found. The ceilings of a0 to f are
unchanged. The orchestrator accepted this and the view's +17 % (a view, not a closing move) as they stand; reverse if a later PR shows a trend.

**In-process figures are not used.** `get_available_gas()` inside `interact_with_state` gave 302,120 for the
main update, against 714,458 by difference at the contract level, and a negative delta for an early return
(Sierra pre-pays the longest path of a straight-line region and refunds it at the return). The bench tests
below take whole-test L2 gas instead.

**Bench minus baseline** (`contracts/src/tests/bench.cairo`, run by `snforge test tests::bench`): each case is
two tests, `test_base_*` primes a tournament and `test_bench_*` primes it then calls the operation once inside
`interact_with_state`. The operation is the difference of their `l2_gas` lines in the snforge log, minus the
cost of `interact_with_state` itself (`test_bench_noop` - `test_base_noop` = 517,560), which the bench pays and
an internal call does not. Table in `docs/architecture/leaderboard.md`, "Limits".

### Lobby library class (S1, P-26)

`spawn`, `claim`, `sponsor`, `discard` and `surrender` of `Daily` and `Tutorial` run in the declared class `Lobby`
through `library_call_syscall` (`docs/architecture/native-storage.md`, "Classes"). Scarb 2.20.1 / snforge 0.64.0,
VPS (Linux), `RAYON_NUM_THREADS=1`, `--max-threads 2`, under `prlimit --as=8589934592` (peak RSS 4.5 GB per gas
run). Full tables (both profiles, sizes): `docs/architecture/class-headroom.md`, "As built (S1)".

- **Moves (a0 to f), the view (j):** unchanged to the unit in both profiles. Ceilings unchanged.
- **Closing moves g, h, i** (`surrender`, now one library call): +146,730 in the test profile, +118,650 in
  release. Test profile: g 1,234,989 -> 1,381,719, h 897,489 -> 1,044,219, i 719,000 -> 865,730. New ceilings,
  measured + 5 %: 1,450,805, 1,096,430, 909,017.
- **New scenario l**, game over on the last `build` (the game of c with its tile limit cut, then the move of a0):
  5,277,705 (test profile), 2,872,365 in release, both the same on main. Ceiling 5,541,591. No library
  call on S1; the reference for the game-over report of #242.
- **Sizes** (CASM, release): `Daily` 80,418 -> 69,062 (84.3 % of the cap), `Tutorial` 75,296 -> 66,059 (80.6 %),
  `Lobby` 47,299 (57.7 %).

## Line coverage of `contracts/src`

Measured on the Mac (aarch64, scarb 2.20.1, snforge 0.64.0, cairo-coverage 0.6.1 from `~/.asdf/installs`;
line coverage does not depend on the machine). Command: `scripts/measure.sh coverage-split`. It runs
`snforge test --coverage --max-threads 2 <filter>` once per group below (`RAYON_NUM_THREADS=1`, peak
printed with `/usr/bin/time -l` on Darwin; on Linux `prlimit` 8 GiB and `time -f`), keeps each
`coverage.lcov` under `contracts/target/coverage-split/`, merges them by summing the hits of each
`SF`/`DA` line with awk (`lcov -a` is not used, so that every machine gives the same file), then prints
the table (`tests/` and `mocks/` excluded). One run of everything (`scripts/measure.sh coverage`) aborted
at 7.9 GB on the VPS, and the first split peaked at 19 GB for `paved::structure::` (the exhaustive table
tests), hence the groups: those tests run two per run (`--partition i/12`).

| Group | Filter | Peak RSS (Mac, `time -l`) |
| --- | --- | --- |
| types | `paved::types::` | 5.27 GB |
| elements | `paved::elements::` | 5.31 GB |
| helpers-random-deck | `paved::helpers::random_deck::` | 7.44 GB |
| helpers-multiplier | `paved::helpers::multiplier::` | 5.25 GB |
| models | `paved::models::` | 5.34 GB |
| structure-record | `paved::structure::record::` | 5.32 GB |
| structure-placement | `paved::structure::placement::` | 5.50 GB |
| structure-state | `paved::structure::state::` | 5.35 GB |
| structure-oriented | `paved::structure::oriented::` | 5.62 GB |
| structure-tables-1 | `paved::structure::tables::` --partition 1/12 | 6.14 GB |
| structure-tables-2 | `paved::structure::tables::` --partition 2/12 | 6.73 GB |
| structure-tables-3 | `paved::structure::tables::` --partition 3/12 | 6.65 GB |
| structure-tables-4 | `paved::structure::tables::` --partition 4/12 | 6.18 GB |
| structure-tables-5 | `paved::structure::tables::` --partition 5/12 | 6.77 GB |
| structure-tables-6 | `paved::structure::tables::` --partition 6/12 | 7.22 GB |
| structure-tables-7 | `paved::structure::tables::` --partition 7/12 | 6.94 GB |
| structure-tables-8 | `paved::structure::tables::` --partition 8/12 | 7.20 GB |
| structure-tables-9 | `paved::structure::tables::` --partition 9/12 | 7.20 GB |
| structure-tables-10 | `paved::structure::tables::` --partition 10/12 | 7.02 GB |
| structure-tables-11 | `paved::structure::tables::` --partition 11/12 | 7.18 GB |
| structure-tables-12 | `paved::structure::tables::` --partition 12/12 | 6.75 GB |
| store | `paved::store::` | 5.33 GB |
| e2e | `paved::tests::e2e::` | 7.12 GB |
| golden | `paved::tests::golden::` | 7.70 GB |
| differential | `paved::tests::differential` | 5.87 GB |
| oracle | `paved::tests::oracle` | 5.41 GB |
| gas | `test_gas_` | 3.93 GB |

Largest peak 7.70 GB (golden), under the 8 GiB cap (8.59 GB) by 10 %. The Mac has no cap, so the cap
itself was not exercised here. Merged result (every test of the groups passes):

| Directory | Lines hit / lines | Coverage |
| --- | --- | --- |
| (root) | 265 / 265 | 100.00 % |
| components | 260 / 268 | 97.01 % |
| elements | 687 / 717 | 95.82 % |
| helpers | 226 / 243 | 93.00 % |
| models | 436 / 441 | 98.87 % |
| structure | 1591 / 1679 | 94.76 % |
| systems | 69 / 71 | 97.18 % |
| TOTAL | 4312 / 4474 | 96.38 % |
| types | 778 / 790 | 98.48 % |

Lines left uncovered (162 of 4474), as listed from `merged.lcov`, by kind:

- 42 in `structure/oriented.cairo`, 29 in `structure/tables.cairo`, 14 in `types/{plan,deck,layout,area,direction,spot}.cairo`
  and `models/tournament.cairo`: the header line of a `match` (compiled to a jump table that is attributed to
  the line of the `match`), the `_ => array![]` / `Orientation::None` / `Plan::None` default arms, and the
  `println!` lines of the failure branches of the exhaustive table tests, which run only on a failure.
- 29 in `elements/decks/{base,tutorial,simple}.cairo`: the deck literals (`Plan::X => array![..]`) and the
  default arm, which the tests reach through the packed deck bitmaps, not these lines.
- 17 in `helpers/{bitmap,random_deck}.cairo`: branches of the bitmap helpers no test reaches (`x & ~mask`,
  the shifts of the high words), `discard`, and lines of the tests of `random_deck` itself.
- 8 in `components/*.cairo`: the `#[derive(starknet::Event)]` lines and two lines of the tutorial and
  playable components (`structures.track`, a game-over emit) that the instrumented trace does not attribute.
- 22 in `structure/{state,placement,forest,record,assessment}.cairo`, `models/game.cairo` and
  `systems/tutorial.cairo`: function headers (`#[inline]` and multi-line signatures attributed to their first
  line), one `return false` and one `break` of the forest scan, and the two view helpers of the tutorial.

None of them is a gameplay branch known to be unreached: the re-rooting branch of `place` is covered by
`test_differential_two_areas_of_one_tile_join_one_structure`, and the P-16 invariant of the oracle by
`test_forest_oracle_finds_a_character_on_a_finished_forest`.

## Commands and peak memory (VPS, under `prlimit --as=8589934592`)

| Command | Result | Peak RSS |
| --- | --- | --- |
| `scarb fmt --check` | pass | n/a |
| `scarb build` | pass | 2.65 GB |
| `snforge test test_gas_` | 5 passed | 4.17 GB (single-threaded) |
| `snforge test` | `Tests: 222 passed, 0 failed, 1 ignored, 0 filtered out` | 5.53 GB |
| `snforge test --coverage` | aborted in `cairo-coverage` | 7.90 GB (VPS, P0; see the split run above) |
| `snforge test` after P1 | `Tests: 192 passed, 0 failed, 0 ignored, 0 filtered out` (the CI job `Test game` of the PR passes) | 4.32 GB |
| `scarb build` after P2 | pass | 0.85 GB |
| `snforge test` after P2 | `Tests: 226 passed, 0 failed, 0 ignored, 0 filtered out` | 2.18 GB (single-threaded) |
| `snforge test --max-threads 2` after P5-4 (Mac, `/usr/bin/time -l`) | `Tests: 349 passed, 0 failed, 0 ignored, 0 filtered out` (CI) | 6.14 GB (two test threads, the Mac's measure) |

## P7: quests and achievements (contracts)

`contracts/tests/gas.cairo`, same method as above (L2 gas of the call alone), Linux, pinned toolchain
(scarb 2.20.1, snforge 0.64.0), test profile. "Before" is main after S1 (`e138c6f`, the Lobby class), "after" is the
P7 contracts PR (CI log). The closing moves g to i are `surrender` (which runs in `Lobby`, so the report adds no
library call); l is the game over of a `build` (`Daily` then one library call to `Lobby.report`). The quests get
tasks 1 to 4 and the achievements tasks 1, 4 to 7 and 9 (at most 4 and 6 entries).

| | Scenario | Before | After | Change | New ceiling |
|---|---|---|---|---|---|
| g | closing move, rank 1, two shifts | 1,381,719 | 2,060,599 | +678,880 | 2,163,629 |
| h | closing move, not ranked | 1,044,219 | 1,657,443 | +613,224 | 1,740,316 |
| i | game over after its tournament | 865,730 | 1,478,864 | +613,134 | 1,552,808 |
| k | closing move, rank 1, score 4,500, every counter non-zero (largest lists) | n/a (g's base 1,381,719) | 2,389,479 | +1,007,760 against g's base | 2,508,953 |
| l | game over on the last `build` | 5,277,705 | 6,111,335 | +833,630 | 6,416,902 |

The P-22 guard is +1.5M on the closing move: the largest (k) is +1.0M, the game over of a `build` (l) +0.83M.

Moves that are not a game over (never report; the code counts in 23 bits of the word already written,
`Game.counts`):

| | Before | After | Change |
|---|---|---|---|
| a0 open simple move | 5,596,035 | 5,626,085 | +30,050 (+0.54 %) |
| a simple move | 5,082,345 | 5,112,405 | +30,060 (+0.59 %) |
| b move with a character | 6,056,534 | 6,086,794 | +30,260 (+0.50 %) |
| c close a large city | 6,098,165 | 6,159,821 | +61,656 (+1.01 %) |
| d worst case | 6,987,338 | 7,049,194 | +61,856 (+0.89 %) |
| e close a forest | 9,308,936 | 9,357,569 | +48,633 (+0.52 %) |
| f worst forest scan | 19,048,196 | 19,097,029 | +48,833 (+0.26 %) |

The ceilings of a0 to f are unchanged. The rise is the one accepted as O-40 on #242 before S1 (the same figures
within 600): one more division on the `GameState` unpack, one more multiplication on the pack, one more felt in the
`Game` copies, and the report's `if`; +31.6k more on a move that scores (the saturating count). It is not
"identical to main"; the cause per piece was not isolated.

## P8 E3: the economy wired (contracts)

`contracts/tests/gas.cairo`, the L2 gas of one external call (`get_available_gas()` right before and after it), scarb
2.20.1 / snforge 0.64.0. "After" is the `GAS` lines of the CI `Test game` job of #275 (Linux, job 113980427433, head
`bcd7fc4b`); "Before" is main `2256724` measured the same way on the Mac, which gave the same figures as Linux for
every line both share (a0 to l match P7's "After" above to the unit). m and o on main were measured with a temporary
copy of the two tests that call the old `spawn()`.

| | Scenario | Before | After | Change | Ceiling |
|---|---|---:|---:|---:|---:|
| a0 | open simple move | 5,626,085 | 5,626,255 | +170 (+0.003 %) | 5,869,212 (unchanged) |
| a | simple move | 5,112,405 | 5,112,575 | +170 | 5,329,081 (unchanged) |
| b | move with a character | 6,086,794 | 6,086,964 | +170 | 6,350,300 (unchanged) |
| c | close a large city | 6,159,821 | 6,159,991 | +170 | 6,392,332 (unchanged) |
| d | worst case | 7,049,194 | 7,049,364 | +170 | 7,325,796 (unchanged) |
| e | close a forest | 9,357,569 | 9,357,739 | +170 | 9,756,082 (unchanged) |
| f | worst forest scan | 19,097,029 | 19,097,199 | +170 | 19,956,685 (unchanged) |
| g | closing move, rank 1 | 2,060,599 | 3,524,749 | +1,464,150 | 3,700,987 |
| h | closing move, not ranked | 1,657,443 | 3,121,593 | +1,464,150 | 3,277,673 |
| i | game over after its tournament | 1,478,864 | 2,589,134 | +1,110,270 | 2,718,591 |
| j | `tournament` view | 370,628 | 370,628 | 0 | 388,740 (unchanged) |
| k | closing move, largest report | 2,389,479 | 3,853,629 | +1,464,150 | 4,046,311 |
| l | game over on the last `build` | 6,111,335 | 7,582,095 | +1,470,760 | 7,961,200 |
| m | Daily spawn, stake 1 | 40,983,345 | 49,361,586 | +8,378,241 (+20.4 %) | 51,829,666 (new) |
| n | Daily spawn, stake 10, referred | n/a | 50,387,496 | | 52,906,871 (new) |
| o | Tutorial spawn | 4,555,211 | 4,314,442 | -240,769 | 4,530,165 (new) |

- **Moves a0 to f.** +170 each; the move code of `Daily` is unchanged (`Daily.build` passes the game id to
  `Lobby.report` only on a game over). Within the +0.1 % of the brief.
- **Closing moves g to l.** A Daily game over calls `Economy.record`: the `Account.economy()` read, then `Economy`'s
  checks, its outcome slot and the day's accumulator. i is lower (+1.11M): its game ends at `start_time + 86401`,
  at or after its expiry (24 h after the purchase, P-34), so `record` marks it expired and does not write the day's
  accumulator; the 353,880 gap was not isolated further. Every closing move stays under P-22's +1.5M guard.
- **Daily spawn.** `Economy.purchase`: the `transferFrom` of the price, the referral (n), the transfer to the
  router, `swap`, `clear_minimum`, `clear`, the burn, the margin to the Vault, the terms, the day's prior and the
  guard; less the prize write that left (P-31).
- **Tutorial spawn.** -240,769: the tournament prize read and write that left. It calls nothing of the economy.

**Test budgets** (`#[available_gas]`, measured + 5 %) rose by the setup, not by the contracts. `setup::spawn_game`
now deploys and wires the economy as `scripts/deploy.sh` does: whole-test L2 gas of the setup alone 23,058,890 on
main, 53,482,264 here (+30,423,374; 11.0M of it measured inside the test, the rest snforge's declare and deploy
charges). The Tutorial golden rose from 132,797,718 to 162,980,323 (+30,182,605), exactly the setup's rise less the
Tutorial spawn's saving: the golden less its setup and spawn is 101,493,507 on both.
