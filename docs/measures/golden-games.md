# Golden games

Characterisation tests of the rules: fixed move sequences whose score after every move and final
counters are asserted exactly. They must stay identical through the later phases (removing Dojo,
toolchain bump, gas work), so they prove that the rules did not change.

Code: `contracts/src/tests/golden.cairo` and `contracts/src/tests/golden/` (`harness`, `daily`,
`tutorial`). Moves are data (`GoldenMove`, `TutorialStep`) replayed by `play_daily` and
`play_tutorial`; a later phase that changes the storage or the entry points only has to adapt the
harness, not the data.

## Run

```
cd contracts
RAYON_NUM_THREADS=1 snforge test golden
```

With the toolchain of P0 (scarb 2.13.1, snforge 0.51.2; P3 runs on 2.20.1 / 0.64.0, see "Gas budget"). Peak memory measured for this command at P0:
about 3.7 GB (`/usr/bin/time -v`).

## Cases

| Test | Mode, player, day | Covers |
| --- | --- | --- |
| `test_golden_daily_city5_game_over` | Daily, PLAYER, day 0 | City of 5 tiles (starter, 3 corridors, cap) closed on the last move with a Paladin: +2245. Deck cut to 5 tiles: game over, `built 4`, `tile_count 5`. |
| `test_golden_daily_road6` | Daily, ANYONE, day 1 | Road of 6 tiles (stop, starter, 3 straights, stop) closed on move 5 with an Adventurer: +1379. |
| `test_golden_daily_mixed_roles` | Daily, SOMEONE, day 2 | Pilgrim on a wonder (left open, 0), Paladin on a 2-tile city (+838), Adventurer on a road closed by the last move (+877). Final 1715. |
| `test_golden_daily_real_deck_discards_to_game_over` | Daily, PLAYER, day 3 | Real deck, no forced plan: the 7 plans drawn by the seed of that day, through 7 discards, until game over. |
| `test_golden_tutorial_full_sequence` | Tutorial | The full scripted tutorial: 8 builds and 1 discard, plan before each step, score after each (1286, 2124, 2074 after the discard, 5078 final), game over. |

The five cases above place no character on a forest (the roles of P0 to P3 are not allowed there). The
Woodsman and the Herdsman of P4 are in the three cases below.

### Cases of P4 (Woodsman and Herdsman)

Code: `contracts/src/tests/golden/forest.cairo`. Daily, forced plans (`forced: true`). The expected
values were recorded from the implementation and checked by hand against the rule of 2024 (the hand
computation is in the doc comment of each case): a forest scores `closed roads (Woodsman) or closed
cities (Herdsman) x 300 x bonus(size)`, `bonus(n) = 1.0235^n` in integers over 10000
(bonus(2) = 10475, bonus(4) = 10972), see `docs/architecture/native-storage.md`. The plans are forced:
the boards use some plans more often than the deck holds them.

| Test | Mode, player, day | Covers |
| --- | --- | --- |
| `test_golden_daily_forest_woodsman_ring` | Daily, PLAYER, day 4 | Four road curves under the starter close a loop of road; the four inner corners are one forest of 4 tiles. The Woodsman waits on the first curve and scores on the fourth: 1 road x 300 x 10972 / 10000 = **329**. Built 4, tile count 6. |
| `test_golden_daily_forest_herdsman_caps` | Daily, ANYONE, day 5 | Two city corridors side by side, each closed by caps, with a forest of 2 tiles between them. The Herdsman waits on the first corridor and scores when the second closes the forest: 2 cities x 300 x 10475 / 10000 = **628** (628.5 rounded down). Built 5, tile count 7. |
| `test_golden_daily_forest_both_roles` | Daily, SOMEONE, day 6 | Both roles in one game: the ring one tile short, then the corridors joined by a city arch (one city touched twice, counted once): the Herdsman scores 1 x 300 x 10475 / 10000 = **314** on move 8, the last curve scores the Woodsman 329 on move 9: **643**. Built 9, tile count 11. |

## Gas budget

Each case carries `#[available_gas(l2_gas: N)]`: the test fails if the total L2 gas of its game
(spawn included) exceeds N. N is the figure measured plus 5 %. The figures below are those of P2
(2026-10-06, Dojo removed, native storage; the expected values did not change). P1 figures, for
comparison, with the ceilings of P1 in brackets: 502,727,336 (527,863,703), 556,024,333
(583,825,550), 535,832,671 (562,624,305), 392,683,480 (412,317,654), 1,042,528,480 (1,094,654,904);
P0: 677M, 734M, 699M, 609M and 1,270M.

| Test | Measured L2 gas | Ceiling (+5 %) |
| --- | --- | --- |
| `daily_city5_game_over` | 106,111,373 | 111,416,942 |
| `daily_road6` | 118,279,043 | 124,192,996 |
| `daily_mixed_roles` | 113,176,918 | 118,835,764 |
| `daily_real_deck_discards_to_game_over` | 103,613,438 | 108,794,110 |
| `tutorial_full_sequence` | 116,162,877 | 121,971,021 |

P3 (2026-10-06, scarb 2.20.1 / snforge 0.64.0): every expected value is unchanged (checked first with the ceilings lifted to 1.2B); gas rose, a compiler effect, so the ceilings are raised to measured + 5 %.

| Test | L2 gas P2 | L2 gas P3 | Change | Ceiling P2 | Ceiling P3 |
| --- | --- | --- | --- | --- | --- |
| daily_city5_game_over | 106,111,373 | 136,530,943 | +28.7 % | 111,416,942 | 143,357,491 |
| daily_road6 | 118,279,043 | 151,036,143 | +27.7 % | 124,192,996 | 158,587,951 |
| daily_mixed_roles | 113,176,918 | 146,570,608 | +29.5 % | 118,835,764 | 153,899,139 |
| daily_real_deck_discards_to_game_over | 103,613,438 | 130,436,168 | +25.9 % | 108,794,110 | 136,957,977 |
| tutorial_full_sequence | 116,162,877 | 162,528,907 | +39.9 % | 121,971,021 | 170,655,353 |

P4 (2026-10-06, Woodsman and Herdsman): every expected value of the five cases is unchanged. Gas rose
because forests are assessed again (the forest starts of the layouts were commented out since #95; each build now
walks the forests it touches, whether or not a Woodsman or a Herdsman is placed): a cause of forest
scoring, so the ceilings are raised to measured + 5 %. The figures of "before" are those of the
unchanged `main` (`f351faa`) measured the same day, on the same toolchain (they differ slightly from the
P3 table above because of the PRs merged since). `daily_real_deck_discards_to_game_over` builds nothing:
its figure is identical (130,455,168) and its ceiling is unchanged.

| Test | L2 gas before | L2 gas P4 | Change | Ceiling before | Ceiling P4 |
| --- | --- | --- | --- | --- | --- |
| daily_city5_game_over | 136,549,943 | 150,320,538 | +10.1 % | 143,357,491 | 157,836,565 |
| daily_road6 | 151,055,143 | 159,934,303 | +5.9 % | 158,587,951 | 167,931,019 |
| daily_mixed_roles | 146,589,608 | 155,192,708 | +5.9 % | 153,899,139 | 162,952,344 |
| daily_real_deck_discards_to_game_over | 130,455,168 | 130,455,168 | 0 % | 136,957,977 | 136,957,977 |
| tutorial_full_sequence | 162,547,807 | 188,832,897 | +16.2 % | 170,655,353 | 198,274,542 |

New cases (ceiling = measured + 5 %):

| Test | L2 gas | Ceiling (+5 %) |
| --- | --- | --- |
| `daily_forest_woodsman_ring` | 149,808,886 | 157,299,331 |
| `daily_forest_herdsman_caps` | 161,737,017 | 169,823,868 |
| `daily_forest_both_roles` | 242,370,465 | 254,488,989 |

### After P5-2 (`Game` split)

Every expected value is unchanged. L2 gas from the CI `Test game` log of the PR (Linux); the ceilings
(`#[available_gas]`) are lowered to measured + 5 %, the golden data is not touched.

| Test | L2 gas P4 | L2 gas P5-2 | Change | Ceiling P4 | Ceiling P5-2 |
| --- | --- | --- | --- | --- | --- |
| tutorial_full_sequence | 188,832,897 | 184,223,856 | -2.4 % | 198,274,542 | 193,435,049 |
| daily_city5_game_over | 150,320,538 | 149,228,751 | -0.7 % | 157,836,565 | 156,690,189 |
| daily_road6 | 159,934,303 | 157,231,128 | -1.7 % | 167,931,019 | 165,092,685 |
| daily_mixed_roles | 155,192,708 | 153,258,741 | -1.2 % | 162,952,344 | 160,921,679 |
| daily_real_deck_discards_to_game_over | 130,455,168 | 127,269,896 | -2.4 % | 136,957,977 | 133,633,391 |
| daily_forest_woodsman_ring | 149,808,886 | 146,872,410 | -2.0 % | 157,299,331 | 154,216,031 |
| daily_forest_herdsman_caps | 161,737,017 | 158,538,599 | -2.0 % | 169,823,868 | 166,465,529 |
| daily_forest_both_roles | 242,370,465 | 235,984,172 | -2.6 % | 254,488,989 | 247,783,381 |

### After P5-3 (characters packed in one slot)

Every expected value is unchanged. L2 gas from the CI `Test game` log of the PR (Linux, run 37603717369); the
ceilings (`#[available_gas]`) are lowered to measured + 5 %, the golden data is not touched.

| Test | L2 gas P5-2 | L2 gas P5-3 | Change | Ceiling P5-2 | Ceiling P5-3 |
| --- | --- | --- | --- | --- | --- |
| tutorial_full_sequence | 184,223,856 | 178,254,025 | -3.2 % | 193,435,049 | 187,166,727 |
| daily_city5_game_over | 149,228,751 | 147,271,649 | -1.3 % | 156,690,189 | 154,635,232 |
| daily_road6 | 157,231,128 | 154,926,353 | -1.5 % | 165,092,685 | 162,672,671 |
| daily_mixed_roles | 153,258,741 | 149,541,806 | -2.4 % | 160,921,679 | 157,018,897 |
| daily_real_deck_discards_to_game_over | 127,269,896 | 127,156,456 | -0.1 % | 133,633,391 | 133,514,279 |
| daily_forest_woodsman_ring | 146,872,410 | 144,970,162 | -1.3 % | 154,216,031 | 152,218,671 |
| daily_forest_herdsman_caps | 158,538,599 | 156,763,241 | -1.1 % | 166,465,529 | 164,601,404 |
| daily_forest_both_roles | 235,984,172 | 233,113,166 | -1.2 % | 247,783,381 | 244,768,825 |

A gas improvement lowers the figures: lower the ceilings in the same PR. A rise above a ceiling is
a regression, not a reason to raise it.

## Limits

- The Daily moves with a role use forced plans (`forced: true`: the harness replaces the drawn tile,
  as `e2e/daily*.cairo` do), so that a structure of known size can be built in a few moves. Before
  each override the harness still asserts the plan that the real deck drew (`drawn`), so the draw
  after every build (reseed included) is pinned too; the discard case pins 7 draws on its own.
- A full Daily deck (38 tiles) is kept out of the suite: at P1 one more build (road6, 5 builds,
  against city5, 4 builds) cost about 53M L2 gas in the test world, so 37 builds would have cost about
  2B and more as the structures grow (a test caps near 1.3B). Since P2 that build costs about 12M
  (118.3M against 106.1M), so a 38-tile game is estimated near 0.5B: it may now fit a test (not tried
  in P2, which only keeps the existing cases). The
  "end of deck" cases therefore cut `tile_limit` (fixture, `tile_limit` argument) to 5 and 8 tiles.
  The game-over rule (`tile_count >= tile_limit`) is the real one.
- Expected values come from running the code of the commit that introduced them (characterisation),
  not from an independent computation.

## Rule

Golden games are never edited to make a test pass.

No pull request may change an expected value of these tests without saying so in its title (for
example `... [golden: city5 score 2245 -> 2300]`). A change of a golden value is a change of the
rules. To record a new case, set `RECORD` to true in `harness.cairo`, run the case, copy the printed
values, and set it back to false.
