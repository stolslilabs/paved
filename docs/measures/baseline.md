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

**Fixed seed (D-23, CORE's decision).** The scenarios measure a known board, so they spawn on a fixed seed: the day
seed they were calibrated with, Poseidon(0, day id) at time 0, through `Challenge`'s own spawn path (`spawn_from`, as
the goldens do). The plans are forced, but the draw that follows each move, and the deck the spawn builds, read the
seed, so on another seed the same move costs something else. The move cost of a real game varies with its deck (since
D-23 each game has its own, Poseidon(0, the Challenge contract's address, game id)), and that is expected: a ceiling bounds the scenario, not every deck.
The spawn scenarios m and n measure the entry point itself and so the token seed; it is fixed too in the test (game 2,
Poseidon(0, 2); since fix loop 1, Poseidon(0, the contract's address, 2)).

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

## After D-18 (characters leave the game, D-18b)

D-18 (P-45) takes the characters out: every structure scores on the move that closes it, and the forest scan runs
on every forest closure. Measured on the VPS, 2026-10-13, scarb 2.20.1, snforge 0.64.0,
`RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test test_gas_ --max-threads 2`, "before"
on main at 07aab8a (the branch's first commit, code unchanged), "after" on the D-18b branch. Peak RSS of the run
6,538,884 kB before, 5,522,140 kB after. Ceilings: measured + 5 %, rounded up, as the earlier phases (j and r did not
move and keep theirs).

| | Scenario | Before | After | Change | New ceiling |
|---|---|---:|---:|---:|---:|
| e | closes a forest of 4 tiles (before: with a Woodsman on it) | 9,357,939 | 8,535,523 | -822,416 | 8,962,300 |
| e0 | the same move with no character before D-18 (new scenario) | 6,103,341 (frozen class) | 8,535,523 | +2,432,182 | (e's) |
| f | closes a forest of 16 nodes, the worst scan (before: with a Woodsman) | 19,097,399 | 18,022,090 | -1,075,309 | 18,923,195 |
| a0 | open simple move | 5,626,455 | 5,437,937 | -188,518 | 5,709,834 |
| a | closes a 2-tile city (before: not scored, no character) | 5,112,775 | 5,062,076 | -50,699 | 5,315,180 |
| b | a's move with a Lord | 6,087,164 | retired: since D-18 it is a's move | | |
| c | closes a 6-tile city (before: with a Lord) | 6,160,191 | 5,136,594 | -1,023,597 | 5,393,424 |
| d | closes a 12-tile city tree (before: placed with a Lord) | 7,049,564 | 5,392,451 | -1,657,113 | 5,662,074 |
| g | closing move, rank 1, two shifts | 3,524,849 | 3,498,006 | -26,843 | 3,672,907 |
| h | closing move, not ranked | 3,121,693 | 3,094,850 | -26,843 | 3,249,593 |
| i | game over after its tournament | 2,589,504 | 2,562,751 | -26,753 | 2,690,889 |
| j | `tournament` view | 370,828 | 370,828 | 0 | 388,740 (unchanged) |
| k | closing move, largest report | 3,853,729 | 3,826,886 | -26,843 | 4,018,231 |
| l | game over on the last `build` | 7,582,195 | 7,403,897 | -178,298 | 7,774,092 |
| m | Daily spawn, stake 1 | 50,305,146 | 50,231,646 | -73,500 | 52,743,229 |
| n | Daily spawn, stake 10, referred | 51,331,256 | 51,257,756 | -73,500 | 53,820,644 |
| o | Tutorial spawn | 5,181,602 | 5,108,102 | -73,500 | 5,363,508 |
| p | sponsor | 1,867,109 | 1,863,109 | -4,000 | 1,956,265 |
| q | claim | 1,940,878 | 1,936,878 | -4,000 | 2,033,722 |
| r | reclaim | 1,535,068 | 1,535,068 | 0 | 1,611,612 (unchanged) |

- **The forest scenarios.** e and f no longer place a Woodsman nor recover it (the `Characters` word, the tile
  rewrite), so they are cheaper than before, though the scan runs as it did. **e0 is the new cost of D-18**: a forest
  that closed with no character on it was not scanned before (6,103,341) and is now (8,535,523, +2.43M, +39.8 %):
  the 4-tile scan, one `Scored` and the forest counter. The scan is bounded by the forest's tiles (f, 16 nodes, is
  the worst we built). e0's figure before D-18 is measured on the frozen build of 07aab8a
  (`src/tests/e2e/upgrade_d18.cairo`, `test_upgrade_d18_gas_e_and_e0_before_d18`, a test-only class: the D-18 tree
  cannot declare main's class); the same test measures e there at 9,334,249, 23,690 (0.25 %) under main's figure,
  the frozen class lacking only `Daily`'s wrapper.
- **Moves a0 to d.** The character arguments, the idle check and the `Characters` word left the path. a now scores
  its city (one `Scored`) and is still cheaper. b is retired: its Lord left with D-18, so its move is a's.
- **g to r.** The game's state packs one field fewer, and `Daily`'s dispatch is smaller; the moves of the prize do
  not change. m and n follow the same rule (measured + 5 %), which puts their ceilings 10,910 and 11,119 above the
  previous ones, 52,732,319 and 53,809,525. Those were set in E5b (#283, the game NFT minted at spawn), 5 % over
  figures this file does not record (50,221,256 and 51,247,166, inferred as ceiling / 1.05), not on E3's figures; the
  spawns then rose to 07aab8a's 50,305,146 and 51,331,256 with no ceiling change, and D-18 lowers them by 73,500.
- **Scores the scenarios assert.** e scores 767 (the loop of road 438, the forest 329) and f 5,618: the oracle's
  walks give both (`src/tests/differential.cairo`, `test_differential_gas_scenario_e`, `_f`), `gas.cairo` asserts
  them (`SCORE_E`, `SCORE_F`).

## After D-19 (tile owners and majority scoring, D-19b)

D-19 (P-47) gives each closed structure to the seat with the most of its tiles; D-19b keeps the seat in the tile's own
slot (`Tile.owner`, bits 96 to 104, the owner's ruling of 2026-10-13) and counts the seats by a walk on the move that
closes the structure, **skipped in a game with one player** (`Mode::solo`: Daily and Tutorial), so a single-player
move walks nothing (`docs/architecture/structure-state.md`, "As built: D-19"). Measured on the VPS, 2026-10-13,
scarb 2.20.1, snforge 0.64.0,
`RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test test_gas_ --max-threads 2`, "before"
on the tree of the branch's first commit (b7e2bb57, main 7d04872 plus the brief: the figures of "After D-18", to the
unit), "after" on the D-19b branch (b5a15f76). Peak RSS of the run 5,549,652 kB before, 4,077,596 kB after.

| | Scenario | Before (D-18) | After D-19 | Change | Ceiling (unchanged) | Share of the ceiling |
|---|---|---:|---:|---:|---:|---:|
| e | closes a forest of 4 tiles | 8,535,523 | 8,735,386 | +199,863 (+2.34 %) | 8,962,300 | 97.5 % |
| f | closes a forest of 16 nodes, the worst scan | 18,022,090 | 18,569,616 | +547,526 (+3.04 %) | 18,923,195 | 98.1 % |
| a0 | open simple move | 5,437,937 | 5,514,643 | +76,706 (+1.41 %) | 5,709,834 | 96.6 % |
| a | closes a 2-tile city | 5,062,076 | 5,144,312 | +82,236 (+1.62 %) | 5,315,180 | 96.8 % |
| c | closes a 6-tile city | 5,136,594 | 5,216,810 | +80,216 (+1.56 %) | 5,393,424 | 96.7 % |
| d | closes a 12-tile city tree | 5,392,451 | 5,480,220 | +87,769 (+1.63 %) | 5,662,074 | 96.8 % |
| g | closing move, rank 1, two shifts | 3,498,006 | 3,498,006 | +0 (+0.00 %) | 3,672,907 | 95.2 % |
| h | closing move, not ranked | 3,094,850 | 3,094,850 | +0 (+0.00 %) | 3,249,593 | 95.2 % |
| i | game over after its tournament | 2,562,751 | 2,562,751 | +0 (+0.00 %) | 2,690,889 | 95.2 % |
| j | `tournament` view | 370,828 | 370,828 | +0 (+0.00 %) | 388,740 | 95.4 % |
| k | closing move, largest report | 3,826,886 | 3,826,886 | +0 (+0.00 %) | 4,018,231 | 95.2 % |
| l | game over on the last `build` | 7,403,897 | 7,466,893 | +62,996 (+0.85 %) | 7,774,092 | 96.0 % |
| m | Daily spawn, stake 1 | 50,231,646 | 50,271,386 | +39,740 (+0.08 %) | 52,743,229 | 95.3 % |
| n | Daily spawn, stake 10, referred | 51,257,756 | 51,297,496 | +39,740 (+0.08 %) | 53,820,644 | 95.3 % |
| o | Tutorial spawn | 5,108,102 | 5,147,842 | +39,740 (+0.78 %) | 5,363,508 | 96.0 % |
| p | sponsor | 1,863,109 | 1,863,109 | +0 (+0.00 %) | 1,956,265 | 95.2 % |
| q | claim | 1,936,878 | 1,936,878 | +0 (+0.00 %) | 2,033,722 | 95.2 % |
| r | reclaim | 1,535,068 | 1,535,068 | +0 (+0.00 %) | 1,611,612 | 95.3 % |

- **Single-player moves: D-18's cost plus the seat and the skip.** No ceiling moves: the largest share of a ceiling
  used is 98.1 % (f). The moves of the prize and the view (g to k, p to r) cost
  exactly what they did. A move that builds pays +62,996 to +87,769 (1.4 to 1.6 %), the spawns +39,740 (they write
  the starter and a drawn tile): `Tile` carries one more field (`owner`) wherever a tile is copied (the neighbourhood
  of a move holds 9), each tile slot decoded reads it and each one written packs it, and the mode test of the skip
  runs on every build. The forest scenarios pay +199,863 (e, 2.34 %) and +547,526 (f, 3.04 %): the scan runs on the
  shared walker (`structure/walk.cairo`), decodes the seat of every node's tile, and tests its `Option<Tally>` (no
  tally in a single-player game: no set is built) at every node.
- **Against the first version of D-19b** (a separate `tile_owners` map, written only for another seat; head
  65575711): that version cost +37,800 to +47,830 on a building move, +118,360 on e and +200,680 on f. The seat in the
  slot costs about 40K more per building move and 80K to 350K more on the forest moves, and reads no separate slot
  when the count runs (the skip-off figures below).
- **The count with the skip off** (for the multiplayer mode; it changes no ceiling). Measured once on the full-deck
  golden game (`src/tests/walk_cost.cairo`, `snforge test --ignored test_walk_cost_full_deck`, peak RSS 3,992,092
  kB): each of its 37 moves built by `Daily` (skip on), then the count that the move would run with the skip off, run
  in the contract's storage and measured alone, the forest's as the scan with a tally less the scan without one. The
  board's largest closures:

  | Closure | Move | Nodes | Count (L2 gas) |
  |---|---:|---:|---:|
  | road | 8 (and 22) | 4 (4 tiles) | 1,602,076 |
  | city | 5 (and 11, 20) | 2 | 608,126 |
  | forest | 22 | 4 | 155,750 (the tally's share of the scan) |
  | wonder | 11 (and 21) | its tile and 8 | 1,913,810 |

  A road or a city reads its tiles' slots once each (the seat comes with the slot), a wonder reads 8 positions and 8
  tile slots. **The most expensive closing move with the skip off is move 22**: 10,617,526 with the skip on (the
  D-18 move plus the overhead above) and 12,373,902 with it off (+1,756,376, +16.5 %: a road of 4 tiles and a forest
  of 4). The most expensive move of the game is move 35, 27,033,373, which closes no structure (the bench counts
  nothing there), so the skip off costs it nothing more; why that move is expensive is not analysed here. The
  per-move figures of the game on D-18 were not measured: "skip on" stands for them. The skip-off figures are
  estimates of a multiplayer move: the count runs here beside the call, with the same reads.

## After D-20 (tournaments leave the code, D-20b)

D-20 (P-48, PM's rulings of 2026-10-13) removes the prize path and the on-chain ranking: a closing move no longer
submits to a leaderboard, and the game-over report no longer carries task 9 (`leaderboard.md`, "As built: D-20").
Measured on the VPS, 2026-10-13, scarb 2.20.1, snforge 0.64.0,
`RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test test_gas_ --max-threads 2`, "before" on
the tree of the branch's first commit (main 6552ae21 plus the brief: the figures of "After D-19", to the unit),
"after" on the D-20b branch. Peak RSS of the run 6,805,288 kB before, 3,609,128 kB after.

| | Scenario | Before (D-19) | After D-20 | Change | Ceiling (unchanged) | Share of the ceiling |
|---|---|---:|---:|---:|---:|---:|
| e | closes a forest of 4 tiles | 8,735,386 | 8,726,746 | -8,640 (-0.10 %) | 8,962,300 | 97.4 % |
| f | closes a forest of 16 nodes, the worst scan | 18,569,616 | 18,560,976 | -8,640 (-0.05 %) | 18,923,195 | 98.1 % |
| a0 | open simple move | 5,514,643 | 5,506,003 | -8,640 (-0.16 %) | 5,709,834 | 96.4 % |
| a | closes a 2-tile city | 5,144,312 | 5,135,672 | -8,640 (-0.17 %) | 5,315,180 | 96.6 % |
| c | closes a 6-tile city | 5,216,810 | 5,208,170 | -8,640 (-0.17 %) | 5,393,424 | 96.6 % |
| d | closes a 12-tile city tree | 5,480,220 | 5,471,580 | -8,640 (-0.16 %) | 5,662,074 | 96.6 % |
| g | closing move in its day (before: rank 1, two shifts) | 3,498,006 | 2,988,628 | -509,378 (-14.56 %) | 3,672,907 | 81.4 % |
| h | closing move, not ranked | 3,094,850 | removed | the same move as g since D-20 | 3,249,593 (removed) | |
| i | game over after its day | 2,562,751 | 2,531,088 | -31,663 (-1.24 %) | 2,690,889 | 94.1 % |
| j | `tournament` view | 370,828 | removed | the view is gone | 388,740 (removed) | |
| k | closing move, largest report | 3,826,886 | 3,317,508 | -509,378 (-13.31 %) | 4,018,231 | 82.6 % |
| l | game over on the last `build` | 7,466,893 | 6,957,515 | -509,378 (-6.82 %) | 7,774,092 | 89.5 % |
| m | Daily spawn, stake 1 | 50,271,386 | 50,271,386 | +0 (+0.00 %) | 52,743,229 | 95.3 % |
| n | Daily spawn, stake 10, referred | 51,297,496 | 51,297,496 | +0 (+0.00 %) | 53,820,644 | 95.3 % |
| o | Tutorial spawn | 5,147,842 | 5,147,842 | +0 (+0.00 %) | 5,363,508 | 96.0 % |
| p | sponsor | 1,863,109 | removed | | 1,956,265 (removed) | |
| q | claim | 1,936,878 | removed | | 2,033,722 (removed) | |
| r | reclaim | 1,535,068 | removed | | 1,611,612 (removed) | |

- **No ceiling moves and none is passed.** The largest share of a ceiling used is still f's, 98.1 % (98.09 %, against
  98.13 % after D-19). The ceilings of `contracts/tests/gas.cairo` stay as they were; those of h, j, p, q and r left
  with their tests. g's constant is renamed `CEILING_CLOSING_IN_DAY` (was `CEILING_CLOSING_PLACES`), same value.
- **The closing moves g, k and l: -509,378 each.** Before, each took rank 1 of its day (g and k after three prefilled
  ranks, l in an empty day): the ranking's update (the scores word and the shifted players) and the achievement entry
  of task 9. Both are gone. g and k now run without the prefilled ranking (nothing to prefill). The leaderboard note's
  estimate of the ranking update at rank 1 was about 516,000 including the `GameEnd` write that stays.
- **i: -31,663.** A game over after its day never ranked; it saves the code around the ranking (`end_in_day` reads
  two day ids and returns nothing).
- **The building moves: -8,640 each** (a0 to f, the same figure on every one). Not analysed; the `build` path's own code
  is unchanged up to the game over, so the cause is outside the move (an estimate would be a guess: `Daily`'s entry
  point dispatch lost two entry points and a view).
- **The spawns m, n, o: unchanged to the unit.** The spawn path is untouched (only the day id's function moved).

## After D-21/24 (the tutorial leaves, the cold paths return, Setup; step D)

D-21 and D-24 (`leaderboard.md`, "D-21" and "D-24"): `spawn`, `discard` and `surrender` run in `Daily`'s own code (no
library call to `Lobby`), and a game over makes **one external call**, `Setup.report`, instead of the library call
`Lobby.report` (`build`) or the internal quiver calls inside `Lobby` (`discard`, `surrender`). Measured on the VPS,
2026-10-13, scarb 2.20.1, snforge 0.64.0,
`RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test test_gas_ --max-threads 2`, on the step
D branch (the contracts of c3ce333a, the gas file of 61d8f18c); peak RSS of the run 3,524,932 kB. **"Before" is the
"After D-20" column above** (the D-20b branch), not a run on this branch's base (main 36b8d9de): #342 (D-25 A+B, the
Faucet) came between and was not measured on its own, and the export of the base for a run of its own was refused on
the VPS. Scenario o (the Tutorial spawn) left with the Tutorial; s (the game over on the last `discard`) is new, with
no figure before.

| | Scenario | Before (D-20) | After D-21/24 | Change | Ceiling | Share of the ceiling |
|---|---|---:|---:|---:|---:|---:|
| l | game over on the last `build` | 6,957,515 | 7,128,685 | +171,170 (+2.46 %) | 7,774,092 | 91.7 % |
| s | game over on the last `discard` (new) | not measured | 3,360,103 | not measured before | 3,528,109 | 95.2 % |
| g | closing move in its day (surrender) | 2,988,628 | 3,169,908 | +181,280 (+6.07 %) | 3,672,907 | 86.3 % |
| i | game over after its day (surrender) | 2,531,088 | 2,712,368 | +181,280 (+7.16 %) | **2,847,987** (was 2,690,889) | 95.2 % |
| k | closing move, largest report (surrender) | 3,317,508 | 3,604,088 | +286,580 (+8.64 %) | 4,018,231 | 89.7 % |
| m | Daily spawn, stake 1 | 50,271,386 | 49,988,176 | -283,210 (-0.56 %) | 52,743,229 | 94.8 % |
| n | Daily spawn, stake 10, referred | 51,297,496 | 51,014,286 | -283,210 (-0.55 %) | 53,820,644 | 94.8 % |
| a0 | open simple move | 5,506,003 | 5,499,903 | -6,100 (-0.11 %) | 5,709,834 | 96.3 % |
| a | closes a 2-tile city | 5,135,672 | 5,129,572 | -6,100 (-0.12 %) | 5,315,180 | 96.5 % |
| c | closes a 6-tile city | 5,208,170 | 5,202,070 | -6,100 (-0.12 %) | 5,393,424 | 96.5 % |
| d | closes a 12-tile city tree | 5,471,580 | 5,465,480 | -6,100 (-0.11 %) | 5,662,074 | 96.5 % |
| e | closes a forest of 4 tiles | 8,726,746 | 8,720,646 | -6,100 (-0.07 %) | 8,962,300 | 97.3 % |
| f | closes a forest of 16 nodes, the worst scan | 18,560,976 | 18,554,876 | -6,100 (-0.03 %) | 18,923,195 | 98.1 % |

- **i's ceiling is raised to measured + 5 %, 2,847,987 (was 2,690,889).** It measured 2,712,368, 100.8 % of the old
  ceiling: the external `Setup.report` call at game over that D-24 chose costs +181,280 over D-20. CORE's decision
  (2026-10-13, after the step D escalation), the rule the other ceilings follow; it reverses if the PM asks for savings
  instead. Every other ceiling is unchanged and none is passed; the largest share of a ceiling is f's, 98.05 %.
- **The game overs, g, i, k, l: +170,000 to +287,000.** g and i +181,280 each, l +171,170, k +286,580 (k's report has 9
  entries, against 3 for g and i and 7 for l). The external call (`call_contract_syscall`, the calldata of the player and of up
  to 9 entries, `Setup`'s dispatch, its reporter read) costs more than the library call of `build` (about 118,650 L2
  gas, `class-headroom.md`) and the internal quiver calls of `discard` and `surrender`. A first build, which checked the
  allowlist of both components, cost 50,530 more on each (i 2,762,898): `Setup` now reads one, the quests', since
  `set_reporter` is the only writer of both and writes them together.
- **Fix loop 1 (review #346): the zero-`setup` guard in `finish` costs +3,100 on each game over** (g 3,173,008, i
  2,715,468, k 3,607,188, l 7,131,685, s 3,363,203; the other scenarios unchanged to the unit). `setup` was read
  before as well; the guard adds the zero check and its branch, not a read. Every scenario stays under its ceiling
  (i: 95.3 % of 2,847,987).
- **The spawns m, n: -283,210 each.** The library call to `Lobby` is gone (and #342's Faucet is inside this figure).
- **The building moves a0 to f: -6,100 each.** Not analysed (the move's own code is unchanged; `Daily`'s dispatch
  changed: an estimate would be a guess).

## After D-25 E (Account leaves, Setup holds the wiring; step E)

Step E (t-0260): `spawn` reads the wiring from `Setup` in one call (`Setup.wiring()`) instead of `Account` (the
caller's registration, `economy()`, the referrer's registration, `collection()`); a game over reads the economy from
`Setup.wiring()` instead of `Account.economy()`. Measured on the VPS, 2026-10-13, scarb 2.20.1, snforge 0.64.0,
`RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test test_gas_ --max-threads 2`. **Before**:
this branch's base, main aff59e06 (step D merged), with the brief only (7019c683); peak RSS of the run 6,356,708 kB.
**After**: the step E contracts (4e36a1d1, gas file of 8f2fb530); peak RSS 3,518,992 kB.

| | Scenario | Before (aff59e06) | After E | Change | Ceiling | Share of the ceiling |
|---|---|---:|---:|---:|---:|---:|
| m | Daily spawn, stake 1 | 49,988,176 | 49,482,886 | **-505,290 (-1.01 %)** | 52,743,229 | 93.8 % |
| n | Daily spawn, stake 10, referred | 51,014,286 | 50,189,546 | **-824,740 (-1.62 %)** | 53,820,644 | 93.3 % |
| l | game over on the last `build` | 7,131,785 | 7,132,145 | +360 | 7,774,092 | 91.7 % |
| s | game over on the last `discard` | 3,363,203 | 3,363,563 | +360 | 3,528,109 | 95.3 % |
| g | closing move in its day (surrender) | 3,173,008 | 3,174,268 | +1,260 | 3,672,907 | 86.4 % |
| i | game over after its day (surrender) | 2,715,468 | 2,716,728 | +1,260 | 2,847,987 | 95.4 % |
| k | closing move, largest report (surrender) | 3,607,188 | 3,608,448 | +1,260 | 4,018,231 | 89.8 % |
| a0 | open simple move | 5,499,903 | 5,499,623 | -280 | 5,709,834 | 96.3 % |
| a | closes a 2-tile city | 5,129,572 | 5,129,292 | -280 | 5,315,180 | 96.5 % |
| c | closes a 6-tile city | 5,202,070 | 5,201,790 | -280 | 5,393,424 | 96.4 % |
| d | closes a 12-tile city tree | 5,465,480 | 5,465,200 | -280 | 5,662,074 | 96.5 % |
| e | closes a forest of 4 tiles | 8,720,646 | 8,720,366 | -280 | 8,962,300 | 97.3 % |
| f | closes a forest of 16 nodes, the worst scan | 18,554,876 | 18,554,596 | -280 | 18,923,195 | 98.1 % |

- **The spawns: m -505,290, n -824,740.** The glitchbomb-gap note estimated -200,000 to -300,000 (the wiring in one
  view instead of two). The rest is the registration: the caller's `Account.player` read (the `assert_exists` of
  `hostable`) goes from both, and n also loses the referrer's `Account.player` read.
- **The game overs: +360 to +1,260.** `Setup.wiring()` (two slots, a two-felt return) against `Account.economy()` (one
  slot), and the zero-`setup` check now made once for the wiring and the report. No ceiling changes; none is passed.
- **The building moves: -280 each.** Not analysed (`Daily`'s dispatch changed with its interface; an estimate would be
  a guess).
- No ceiling changes. f, the tightest, is at 98.05 % of its ceiling, as before.

**Fix loop 1 (review and audits of #350).** Same command, on the fix-loop branch (peak RSS 3,614,352 kB). Against the
"After E" column above:

| | Scenario | After E | Fix loop 1 | Change |
|---|---|---:|---:|---:|
| m | Daily spawn, stake 1 | 49,482,886 | 49,484,346 | +1,460 |
| n | Daily spawn, stake 10, referred | 50,189,546 | 50,210,796 | +21,250 |
| l | game over on the last `build` | 7,132,145 | 7,127,545 | -4,600 |
| s | game over on the last `discard` | 3,363,563 | 3,358,963 | -4,600 |
| g | closing move in its day | 3,174,268 | 3,169,668 | -4,600 |
| i | game over after its day | 2,716,728 | 2,712,128 | -4,600 |
| k | closing move, largest report | 3,608,448 | 3,603,848 | -4,600 |
| a0, a, c, d, e, f | the building moves | | | 0 (f 18,554,596, 98.05 % of its ceiling) |

- **n +21,250, m +1,460:** the referrer is now compared with `Economy` and with `Daily` itself (`get_contract_address`),
  which runs only when the referrer is non-zero and not the payer; m (no referrer) pays the extra branch only.
- **The game overs -4,600:** `finish` no longer asserts the collection, which it does not use.
- Spawn against main aff59e06: m -503,830, n -803,490. No ceiling changes; none is passed.

## After D-23 (Daily becomes Challenge, the token seed; D-23b)

Same tests and method (scarb 2.20.1, snforge 0.64.0, VPS, `RAYON_NUM_THREADS=1`, 15 GiB cap). The moves spawn on the
day seed (method note above): a0, a, c, d, e, f, g, i, k, l and s are identical to "Fix loop 1 (review and audits of
#350)" above (f 18,554,596). On the token seed instead, a was 6,551,754 (ceiling 5,315,180), c 5,523,562 and d
6,079,306: the deck, not the code.

| | Scenario | After E (fix loop 1) | D-23b | Change |
|---|---|---:|---:|---:|
| m | Challenge spawn, stake 1 | 49,484,346 | 51,202,206 | +1,717,860 |
| n | Challenge spawn, stake 10, referred | 50,210,796 | 51,928,656 | +1,717,860 |

**Fix loop 1 (PM, 2026-10-14: the seed mixes in the Challenge contract's address).** Game 2's seed is now
Poseidon(0, the test's Challenge address, 2); same command (peak RSS 3,584,444 kB). The moves are identical (day seed);
the spawns move with the new deck:

| | Scenario | After E (fix loop 1) | D-23b fix loop 1 | Change |
|---|---|---:|---:|---:|
| m | Challenge spawn, stake 1 | 49,484,346 | 49,873,311 | +388,965 |
| n | Challenge spawn, stake 10, referred | 50,210,796 | 50,599,761 | +388,965 |

The cause below holds (the deck walk of that seed); the figures of the table below are those of the two-input seed.

**Why the spawns rose: the deck of game 2's seed.** The spawn draws and places nothing new. m spawns game 2 at time 0:
before D-23 its seed was the day's, Poseidon(0, 0); it became Poseidon(0, 2) (then, with fix loop 1, Poseidon(0, the
contract's address, 2)). `Game::start` builds the deck with
`Deck::tiles`, which walks the deck's indexes and draws a Poseidon per free index until the extra tiles are removed:
how far it walks depends on the seed. Measured off chain (`GameImpl::new`, `start`, `draw_plan`, gas read around
each; a probe, not committed):

| Seed | `start` (`Deck::tiles`) | first draw | Both |
|---|---:|---:|---:|
| Poseidon(0, 0), the day seed of game 2 before D-23 | 34,828,885 | 561,587 | 35,390,472 |
| Poseidon(0, 2), the token seed of game 2 | 36,572,025 | 542,437 | 37,114,462 |
| Poseidon(0, 1), the token seed of game 1 | 36,289,301 | 259,423 | 36,548,724 |

The difference of the two seeds of game 2 is +1,723,990 (`start` +1,743,140, the draw -19,150), within
6,130 of the spawn's rise. The same full spawn path (`spawn_from` in `Challenge`'s state) on the two seeds gives 44,465,578 and 46,274,088
(+1,808,510; that path has no entry-point dispatch, so its totals are lower than m's). `TokenSeed` itself costs one
two-input Poseidon, as the day seed did (with a division more): not the cause. The cost that varies is `Deck::tiles`'
walk, about 35M of the 51M spawn whatever the seed; cutting it means changing how the deck is built, which changes every
deck and so the goldens: a P5 subject, not D-23b's. No ceiling changes; none is passed.

## After G1 (the spawn's deck walk cut)

Same tests and method (scarb 2.20.1, snforge 0.64.0, VPS, `RAYON_NUM_THREADS=1`, 15 GiB cap, `--max-threads 2`). Before:
an export of main f94c34f (`git archive`), run the same day; after: the G1 branch. Peak RSS 6,361,532 kB (before) and
5,415,980 kB (after).

**The design.** `DeckTrait::tiles` removes 34 of the 71 free tiles after the starter. Before, it walked the indexes
with, per free index, one Poseidon and a probability over 10,000, and read and set each bit with
`Bitmap::get_bit_at`/`set_bit_at`, a loop of 256-bit products each (`models/game.cairo`, `bit`: about 0.25M each). G1
runs selection sampling (Knuth, algorithm S) over the free indexes in order with a running mask: a free index goes when
a draw uniform on `[0, free)` falls below the number still to remove. The draws are the digits, in the mixed radix of
the successive `free`, of the two 128-bit halves of Poseidon(seed, 'DECK' + batch), 10 per half, so one Poseidon serves
20 free indexes; once the count to remove equals the free count, the rest go with no draw.

| | Scenario | Before G1 (main f94c34f) | G1 | Change | Ceiling before | Ceiling G1 |
|---|---|---:|---:|---:|---:|---:|
| m | Challenge spawn, stake 1 | 49,873,311 | **17,997,115** | -31,876,196 (-63.9 %) | 52,743,229 | 18,896,971 |
| n | Challenge spawn, stake 10, referred | 50,599,761 | **18,723,565** | -31,876,196 (-63.0 %) | 53,820,644 | 19,659,744 |
| a0 | Open simple move | 5,499,623 | 5,558,903 | +59,280 | 5,709,834 | kept |
| a | Simple move, closes a 2-tile city | 5,129,292 | 5,129,292 | 0 | 5,315,180 | kept |
| c | Close a large city | 5,201,790 | 6,605,882 | +1,404,092 | 5,393,424 | **6,936,177** (raised) |
| d | Worst case of P0 | 5,465,200 | 5,465,200 | 0 | 5,662,074 | kept |
| e | Close a forest of 4 | 8,720,366 | 9,095,020 | +374,654 | 8,962,300 | **9,549,771** (raised) |
| f | Worst forest scan | 18,554,596 | 18,583,486 | +28,890 | 18,923,195 | kept (98.2 %) |
| g | Closing move in its day | 3,169,668 | 3,169,668 | 0 | 3,672,907 | kept |
| i | Closing move after its day | 2,712,128 | 2,712,128 | 0 | 2,847,987 | kept |
| k | Closing move, full report | 3,603,848 | 3,603,848 | 0 | 4,018,231 | kept |
| l | Game over on a build | 7,127,545 | 7,127,545 | 0 | 7,774,092 | kept |
| s | Game over on a discard | 3,358,963 | 3,358,963 | 0 | 3,528,109 | kept |

**The walk alone** (`src/tests/deck_walk.cairo`, `test_deck_walk_cost`: `get_available_gas` around the walk, the
starter out; the frozen walk of f94c34f is `tests/legacy_g1.cairo`, `tiles_before_g1`):

| Seed | Before G1 | G1 |
|---|---:|---:|
| Poseidon(0, 0), the day seed of game 2 before D-23 | 34,649,744 | 3,182,741 |
| Poseidon(0, 2) | 36,392,884 | 3,223,784 |
| Poseidon(0, 1) | 36,110,160 | 3,182,741 |
| Mean, Poseidon('G1', i) | 35,407,796 (10 seeds) | 3,193,914 (100 seeds; worst 3,229,014) |

So the walk falls from about 35.4M to about 3.2M (-91 %), and the spawns by 31.9M. The rest of the walk is the
per-index work of the test profile (`inlining-strategy = "avoid"`: each `&`, comparison and division is a call): a
probe of 64 iterations of an empty loop cost 998,440, of `tiles & mask` with a doubling mask 1,667,932, of a 128-bit
division 1,897,640, of a two-input Poseidon 1,274,432, so the Poseidon is no longer the cost. Spawn's other parts (the
purchase, the mint, the first draw) are unchanged.

**The rises are the draw, not the code.** The scenarios force their plans on the day seed, and the draw that follows
each build reads the deck the spawn built: on the same seed, G1's deck is another. The draw alone (`Game::draw_plan` on
the state before the scenario's last build, with that build's reseed; a probe, not committed) accounts for every
change exactly:

| Scenario | Draw before G1 | Draw G1 | Change |
|---|---:|---:|---:|
| a0 | 508,967 | 568,247 | +59,280 |
| c | 520,597 | 1,924,689 | +1,404,092 |
| e | 219,903 | 594,557 | +374,654 |

(f's +28,890 was not probed; its build is unchanged too, so it is expected to be the same effect.) The draw costs more when more withdrawn cards sit below the slot it finds
(`slot_card`, one 128-bit power per withdrawn card it steps over), which depends on the deck. As the method note above
says, a ceiling bounds the scenario, not every deck: c and e are raised to measured + 5 % (CORE's decision, reversed if
the PM rules the rise a regression; the alternative is to calibrate them on another fixed seed). The draw's own cost
is the next lever (a running mask instead of a power per step, without changing which card is drawn): not G1's.

**f**, the tightest scenario (98.05 % of its ceiling before), lands at 18,583,486, **98.21 %** of its ceiling, which
is kept.

**The other ceilings.** Every test that spawns falls by about 32M, so every `#[available_gas]` of the suite (153 tests:
golden, differential, e2e and the others) is reset to the measured figure + 5 %, from the whole run of the G1 branch
(657 passed, 9 ignored; peak RSS 3,721,040 kB). The new `e2e::upgrade_g1` test gets its own (414,405,555 + 5 %). The
golden and differential figures:

| Test | L2 gas G1 | Ceiling before | Ceiling G1 |
|---|---:|---:|---:|
| golden daily_city5_game_over | 123,580,760 | 184,949,000 | 129,759,798 |
| golden daily_road6 | 133,274,608 | 189,879,000 | 139,938,339 |
| golden daily_mixed_roles | 123,636,623 | 182,574,000 | 129,818,455 |
| golden daily_real_deck_discards_to_game_over | 129,726,115 | 186,283,000 | 136,212,421 |
| golden daily_forest_woodsman_ring | 125,416,251 | 181,814,000 | 131,687,064 |
| golden daily_forest_herdsman_caps | 133,372,379 | 194,393,000 | 140,040,998 |
| golden daily_forest_both_roles | 183,113,983 | 244,454,000 | 192,269,683 |
| golden daily_forest_herdsman_open_city | 136,271,599 | 193,853,000 | 143,085,179 |
| golden daily_full_deck (new moves) | 530,723,592 | 638,549,000 | 557,259,772 |
| golden daily_city5_structures_agree | 335,006,806 | 406,213,000 | 351,757,147 |
| golden daily_road6_structures_agree | 461,126,735 | 535,945,000 | 484,183,072 |
| golden daily_mixed_roles_structures_agree | 350,664,956 | 419,739,000 | 368,198,204 |
| golden daily_real_deck_discards_to_game_over_structures_agree | 151,432,054 | 210,034,000 | 159,003,657 |
| golden daily_forest_woodsman_ring_structures_agree | 375,261,254 | 440,028,000 | 394,024,317 |
| golden daily_forest_herdsman_caps_structures_agree | 363,808,282 | 433,100,000 | 381,998,697 |
| golden daily_forest_both_roles_structures_agree | 680,625,062 | 758,797,000 | 714,656,316 |
| golden daily_forest_herdsman_open_city_structures_agree | 381,427,636 | 458,009,000 | 400,499,018 |
| golden daily_forest_woodsman_ring_last_tile_structures_agree | 379,390,693 | 445,519,000 | 398,360,228 |
| golden daily_full_deck_structures_agree (new moves) | 1,288,135,482 | 1,445,703,000 | 1,352,542,257 |
| differential gas_scenarios_a0_a_b | 214,321,335 | 321,647,000 | 225,037,402 |
| differential gas_scenario_c | 250,041,787 | 306,303,000 | 262,543,877 |
| differential gas_scenario_d | 512,580,547 | 582,165,000 | 538,209,575 |
| differential gas_scenario_e | 301,084,354 | 360,171,000 | 316,138,572 |
| differential gas_scenario_f | 1,287,109,272 | 1,353,892,000 | 1,351,464,736 |
| differential two_areas_of_one_tile_join_one_structure | 671,771,964 | 733,532,000 | 705,360,563 |
| differential wonder_ring | 311,264,950 | 363,925,000 | 326,828,198 |

**Sizes** (`scripts/class-sizes.sh`, release, under `prlimit --as=12884901888`; `class-headroom.md`, "After G1"):
`Challenge` 59,664 -> 60,997 CASM felts (+1,333), 11,950 under the P-44 cap (72,947). No ABI changes
(`scripts/abis.sh` rewrites `contracts/abis/` identically).

## After G4 (the pause guardian on `Challenge.spawn`)

G4 adds one check at the start of `spawn` (`spawn_paused`, one storage read) and nothing to the moves. Same tests and
method: `contracts/tests/gas.cairo`, scarb 2.20.1 / snforge 0.64.0, VPS, 2026-10-14, the whole run of the G4 branch
(`snforge test --max-threads 2` under `prlimit --as=16106127360`: 673 passed, 0 failed, 9 ignored; peak RSS
3,806,460 kB).

| | Scenario | G1 | G4 | Change | Ceiling | Share of the ceiling |
|---|---|---:|---:|---:|---:|---:|
| m | Challenge spawn, stake 1 | 17,997,115 | 17,746,877 | -250,238 | 18,896,971 | 93.9 % |
| n | Challenge spawn, stake 10, referred | 18,723,565 | 18,473,327 | -250,238 | 19,659,744 | 94.0 % |
| a0 | Open simple move | 5,558,903 | 5,558,903 | 0 | 5,709,834 | 97.4 % |
| a | Simple move, closes a 2-tile city | 5,129,292 | 5,129,292 | 0 | 5,315,180 | 96.5 % |
| c | Close a large city | 6,605,882 | 6,605,882 | 0 | 6,936,177 | 95.2 % |
| d | Worst case of P0 | 5,465,200 | 5,465,200 | 0 | 5,662,074 | 96.5 % |
| e | Close a forest of 4 | 9,095,020 | 9,095,020 | 0 | 9,549,771 | 95.2 % |
| f | Worst forest scan | 18,583,486 | 18,583,486 | 0 | 18,923,195 | **98.2 %** |
| g | Closing move in its day | 3,169,668 | 3,169,868 | +200 | 3,672,907 | 86.3 % |
| i | Closing move after its day | 2,712,128 | 2,712,328 | +200 | 2,847,987 | 95.2 % |
| k | Closing move, full report | 3,603,848 | 3,604,048 | +200 | 4,018,231 | 89.7 % |
| l | Game over on a build | 7,127,545 | 7,127,745 | +200 | 7,774,092 | 91.7 % |
| s | Game over on a discard | 3,358,963 | 3,359,163 | +200 | 3,528,109 | 95.2 % |

Every ceiling is kept; f stays the tightest, at 98.2 %. The +200 on the five game overs is measured, its cause not
isolated (the moves run the same code; the class is larger).

**The spawn's check costs 40,480; the spawns fell because the address moved.** Since D-23 a game's seed is
Poseidon(salt, `Challenge`'s address, game id), and the address of a test deployment depends on the class hash, which
G4 changes; G1 showed that the walk's cost depends on the seed. So m and n compare two decks, not two spawns. A probe
(not committed) deployed `Challenge` at one fixed address (`deploy_at`) in `contracts/tests/setup.cairo` and ran the
scenarios twice on the same build, with the check and with its line removed:

| | With the check | Without it | The check |
|---|---:|---:|---:|
| m | 18,673,117 | 18,632,637 | +40,480 |
| n | 19,399,567 | 19,359,087 | +40,480 |

(the same seed, so the same deck; the other scenarios are identical to the unit between the two runs and the whole
run above). The spawns' ceilings are kept: m at 18,673,117 would be 98.8 % of its ceiling, so a deck at another
address can bring m near it; a ceiling bounds the scenario, not every deck (G1's note above).

**Test budgets.** Every existing `#[available_gas]` holds. The new tests get measured + 5 % from the whole run:
`tests::e2e::guardian` (the seven that do not expect a revert) and `tests::e2e::upgrade_g4` (146,907,191 + 5 %);
`cold_paths_audit::test_daily_pins_its_storage_variables_by_name`, which now pins the two new slots, is reset to
55,202,204 + 5 %. Goldens unchanged: the 19 golden tests pass with their expected moves and scores (their seed is the
day's, `DaySeed` in `golden::harness`, not the address's, so the new address does not move them).

**Sizes** (`scripts/class-sizes.sh`, release, under `prlimit --as=12884901888`; `class-headroom.md`, "After G4"):
`Challenge` 60,997 -> 62,323 CASM felts (+1,326), 10,624 under the P-44 cap (72,947). `scripts/abis.sh` rewrites
`contracts/abis/Challenge.json` only (the new interface, its impl and the three events).
