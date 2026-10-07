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
| `test_golden_daily_forest_herdsman_open_city` | Daily, PLAYER, day 7 | **P5-5, rule P-15.** A forest of 2 tiles between two city corridors that a corner and a T-junction join into one city that stays open (the T-junction's east edge looks at an empty position); the forest touches it at two places. The Herdsman waits on one corridor and the other, built last, closes the forest. 2024 figure (run on `dc804707`, before the fix): **314** (the open city counted once). P5 figure: **0** (an open city never counts), the Herdsman comes back. Built 5, tile count 7. |

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

### After P5-4 (structure state for roads, cities, wonders and conflicts)

Every expected value is unchanged. L2 gas from the CI `Test game` log of the PR (Linux, run 37610956822);
the ceilings (`#[available_gas]`) are lowered to measured + 5 %, the golden data is not touched.

| Test | L2 gas P5-3 | L2 gas P5-4 | Change | Ceiling P5-3 | Ceiling P5-4 |
| --- | --- | --- | --- | --- | --- |
| tutorial_full_sequence | 178,254,025 | 147,440,483 | -17.3 % | 187,166,727 | 154,812,508 |
| daily_city5_game_over | 147,271,649 | 133,958,018 | -9.0 % | 154,635,232 | 140,655,919 |
| daily_road6 | 154,926,353 | 149,887,333 | -3.3 % | 162,672,671 | 157,381,700 |
| daily_mixed_roles | 149,541,806 | 142,837,157 | -4.5 % | 157,018,897 | 149,979,015 |
| daily_real_deck_discards_to_game_over | 127,156,456 | 129,856,885 | +2.1 % | 133,514,279 | 133,514,279 (kept) |
| daily_forest_woodsman_ring | 144,970,162 | 140,945,875 | -2.8 % | 152,218,671 | 147,993,169 |
| daily_forest_herdsman_caps | 156,763,241 | 154,632,222 | -1.4 % | 164,601,404 | 162,363,834 |
| daily_forest_both_roles | 233,113,166 | 223,097,331 | -4.3 % | 244,768,825 | 234,252,198 |

`daily_real_deck_discards_to_game_over` builds nothing: its rise is the spawn, which now places the
starter tile on the structure state (8 position reads around it and its record page written). It stays
under its ceiling, which is kept (not raised).

Differential check (P5-4): each Daily case above but the discard one has a checked replay
`<case>_structures_agree` (same moves, same expected values, `oracle::check` after every build),
and `tests/differential.cairo` checks the gas scenarios, the Tutorial and a wonder ring. Their budgets
(measured + 5 %, run 37610956822) include the oracle's walks and do not measure the game:

| Test | L2 gas | Ceiling (+5 %) |
| --- | --- | --- |
| daily_city5_structures_agree | 175,616,265 | 184,397,079 |
| daily_road6_structures_agree | 237,004,823 | 248,855,065 |
| daily_mixed_roles_structures_agree | 208,409,579 | 218,830,058 |
| daily_forest_woodsman_ring_structures_agree | 200,112,045 | 210,117,648 |
| daily_forest_herdsman_caps_structures_agree | 207,600,416 | 217,980,437 |
| daily_forest_both_roles_structures_agree | 342,214,227 | 359,324,939 |
| differential_gas_scenarios_a0_a_b | 283,820,600 | 298,011,630 |
| differential_gas_scenario_c | 190,727,389 | 200,263,759 |
| differential_gas_scenario_d | 360,609,021 | 378,639,473 |
| differential_tutorial_full_sequence | 307,826,455 | 323,217,778 |
| differential_wonder_ring | 264,252,765 | 277,465,404 |

### After P5-5 (forests on the structure state, P-15)

Every expected value of an existing case is unchanged; one case is added (the P-15 rule correction,
above). L2 gas from the CI `Test game` log of the PR (Linux, run 37616293570); the ceilings
(`#[available_gas]`) of the forest cases are lowered to measured + 5 %, the golden data is not touched.

| Test | L2 gas P5-4 | L2 gas P5-5 | Change | Ceiling P5-4 | Ceiling P5-5 |
| --- | --- | --- | --- | --- | --- |
| daily_forest_woodsman_ring | 140,945,875 | 138,215,720 | -1.9 % | 147,993,169 | 145,126,506 |
| daily_forest_herdsman_caps | 154,632,222 | 151,944,301 | -1.7 % | 162,363,834 | 159,541,517 |
| daily_forest_both_roles | 223,097,331 | 216,990,099 | -2.7 % | 234,252,198 | 227,839,604 |
| daily_forest_herdsman_open_city (new) | n/a | 152,450,279 | n/a | n/a | 160,072,793 |

Checked replays: `daily_forest_herdsman_open_city_structures_agree` is new (211,988,064, ceiling
222,587,468); the other twins keep their ceilings (woodsman_ring 205,098,443, herdsman_caps 209,305,150,
both_roles 348,484,189: the forest comparison of the differential check added to them), and the
real-deck discard golden has its twin (129,860,385, same ceiling 133,514,279).

A gas improvement lowers the figures: lower the ceilings in the same PR. A rise above a ceiling is
a regression, not a reason to raise it.

### After P5-6 (gas pass)

Every expected value is unchanged. L2 gas from the CI `Test game` job of PR #224 (Linux, run 37624454030,
same code as the final head: the final commit only sets budgets and writes the docs). Every ceiling
(`#[available_gas]`) of the golden and differential cases is reset to measured + 5 % (four checked twins
sat within 1 % of their limit: mixed_roles, both_roles, herdsman_open_city, road6), the golden data is not touched.

| Test | L2 gas P5-5 | L2 gas P5-6 | Change | Ceiling P5-5 | Ceiling P5-6 |
| --- | --- | --- | --- | --- | --- |
| daily_forest_woodsman_ring | 138,215,720 | 130,512,828 | -5.6 % | 145,126,506 | 137,038,470 |
| daily_forest_herdsman_caps | 151,944,301 | 142,820,786 | -6.0 % | 159,541,517 | 149,961,826 |
| daily_forest_both_roles | 216,990,099 | 200,352,047 | -7.7 % | 227,839,604 | 210,369,650 |
| daily_forest_herdsman_open_city | 152,450,279 | 143,325,544 | -6.0 % | 160,072,793 | 150,491,822 |

Other cases now (measured, ceiling): `city5_game_over` 127,484,710 (ceiling 133,858,946); `road6` 142,411,237 (ceiling 149,531,799); `mixed_roles` 134,387,983 (ceiling 141,107,383); `real_deck_discards_to_game_over` 127,719,133 (ceiling 134,105,090); `tutorial_full_sequence` 130,887,773 (ceiling 137,432,162).

Checked replays (measured, ceiling): city5 180,346,710 (ceiling 189,364,046); mixed_roles 211,455,423 (ceiling 222,028,195); road6 241,470,841 (ceiling 253,544,384); real_deck_discards_to_game_over 138,240,222 (ceiling 145,152,234); forest_woodsman_ring 208,354,803 (ceiling 218,772,544); forest_herdsman_caps 211,326,795 (ceiling 221,893,135); forest_both_roles 343,456,605 (ceiling 360,629,436); forest_herdsman_open_city 214,062,109 (ceiling 224,765,215); forest_woodsman_ring_last_tile 208,486,147 (ceiling 218,910,455); forest_lord_and_woodsman_ring 209,934,279 (ceiling 220,430,993).

**Full-deck case (new).** `test_golden_daily_full_deck`: all 38 tiles of the Daily deck, real draws, real
placements (no forced plan; `contracts/src/tests/golden/full_deck.cairo`). 37 builds, 0 discards, characters
placed along the way; final score 3554, tile count 38, game over, characters left `120` (Adventurer,
Paladin, Pilgrim, Woodsman still placed), tournament top score 3554. The moves come from a greedy bot
(`test_full_deck_generate`, `#[ignore]`, run once by hand: most-neighbours legal position, a character on
the first area that accepts one); the expected scores were recorded from that run, not computed by hand.
Their check is the differential twin `test_golden_daily_full_deck_structures_agree`, which compares the
structure state with the 2024 walks (`oracle::check`) after each of the 37 builds. Gas: 586,423,537 (ceiling 615,744,714) and 1,337,226,473 (ceiling 1,404,087,797). Memory (Mac, `/usr/bin/time -l`, `--max-threads 2`): 3.8 to 4.0 GB peak for
either test alone, 5.9 GB for the whole suite. The generator itself took 1.27B L2 gas and 4.4 GB. The
"caps near 1.3B" of earlier phases is not a hard cap: the twin runs at 1.34B. This answers O-12 and O-17: the
full deck fits since P5.

### P5-5 review and audit follow-up

Two checked cases are added (new cases only, `play_daily_checked`, hand figures matched the run):
`daily_forest_lord_and_woodsman_ring_structures_agree` (a Lord on the fourth curve's road: 4 x 100 x
bonus(4) = 438, then the Woodsman 329, **767**) and `daily_forest_woodsman_ring_last_tile_structures_agree`
(tile limit 5: 329, over, tournament top score 329). A third board (a Woodsman and a Herdsman on two
corner forests of a 2x2 crossings block, joined by a later tile) was dropped: it cannot be built
legally, since the tiles of the block join the corner nodes as soon as they touch.

The checked replays now also check the starter tile after the spawn (`replay_daily`). That is test
instrumentation only: every checked twin costs about 10M more, so the ceilings that this crossed are
raised. All figures below are L2 gas from the CI `Test game` log of head `2872da70` (Linux, run
37618564008); ceilings are CI figure + 5 %.

| Test | L2 gas | Ceiling |
| --- | --- | --- |
| daily_city5_structures_agree (was 175,595,726) | 185,943,874 | 195,241,068 |
| daily_forest_herdsman_caps_structures_agree (was 209,305,150) | 219,666,898 | 230,650,243 |
| daily_forest_woodsman_ring_structures_agree (was 205,098,443) | 215,500,991 | 226,276,041 |
| daily_real_deck_discards_to_game_over_structures_agree (was 129,860,385) | 140,208,533 | 147,218,960 |
| daily_forest_lord_and_woodsman_ring_structures_agree (new) | 218,243,041 | 229,155,194 |
| daily_forest_woodsman_ring_last_tile_structures_agree (new) | 215,365,035 | 226,133,287 |

The other twins (road6 247,223,342; mixed_roles 218,648,663; both_roles 358,900,337;
herdsman_open_city 222,349,812) rise by the same extra check and stay under their ceilings, which are
kept.

## Limits

- The Daily moves with a role use forced plans (`forced: true`: the harness replaces the drawn tile,
  as `e2e/daily*.cairo` do), so that a structure of known size can be built in a few moves. Before
  each override the harness still asserts the plan that the real deck drew (`drawn`), so the draw
  after every build (reseed included) is pinned too; the discard case pins 7 draws on its own.
- (Superseded in P5-6: a full Daily deck is now a case, see "After P5-6".) A full Daily deck (38 tiles) was kept out of the suite: at P1 one more build (road6, 5 builds,
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

### After P-17 (same-draw optimisation of `draw_plan`)

Every expected value is unchanged (all goldens pass on the same data, `test_golden_daily_full_deck` with its 38
real draws and the real-deck discards case included): `draw_plan` returns the same tile for the same seed and
deck state, which `helpers/random_deck` tests against the old `from_bitmap` + `draw` path. L2 gas from the CI
`Test game` job of PR #225 (Linux, run 37627275425, head `9839dcf8`; the final head only sets budgets and writes
the docs); the P5-6 column is the figure of the previous section. Every `#[available_gas]` of the
golden, differential and e2e cases is reset to CI figure + 5 % (all 100 of them that run in the job; the `#[ignore]`
generator keeps its limit).

| Test | L2 gas P5-6 | L2 gas P-17 | Change | Ceiling |
| --- | --- | --- | --- | --- |
| daily_forest_woodsman_ring | 130,512,828 | 118,674,722 | -9.1 % | 124,608,459 |
| daily_forest_herdsman_caps | 142,820,786 | 130,039,108 | -8.9 % | 136,541,064 |
| daily_forest_both_roles | 200,352,047 | 178,043,673 | -11.1 % | 186,945,857 |
| daily_forest_herdsman_open_city | 143,325,544 | 129,908,758 | -9.4 % | 136,404,196 |
| daily_city5_game_over | 127,484,710 | 119,060,970 | -6.6 % | 125,014,019 |
| daily_road6 | 142,411,237 | 126,632,673 | -11.1 % | 132,964,307 |
| daily_mixed_roles | 134,387,983 | 122,805,152 | -8.6 % | 128,945,410 |
| daily_real_deck_discards_to_game_over | 127,719,133 | 111,900,154 | -12.4 % | 117,495,162 |
| tutorial_full_sequence | 130,887,773 | 130,887,323 | -0.0 % | 137,431,690 |
| daily_city5_structures_agree | 180,346,710 | 171,922,970 | -4.7 % | 180,519,119 |
| daily_mixed_roles_structures_agree | 211,455,423 | 199,872,592 | -5.5 % | 209,866,222 |
| daily_road6_structures_agree | 241,470,841 | 225,692,277 | -6.5 % | 236,976,891 |
| daily_real_deck_discards_to_game_over_structures_agree | 138,240,222 | 122,421,243 | -11.4 % | 128,542,306 |
| daily_forest_woodsman_ring_structures_agree | 208,354,803 | 196,516,697 | -5.7 % | 206,342,532 |
| daily_forest_herdsman_caps_structures_agree | 211,326,795 | 198,545,117 | -6.0 % | 208,472,373 |
| daily_forest_both_roles_structures_agree | 343,456,605 | 321,148,231 | -6.5 % | 337,205,643 |
| daily_forest_herdsman_open_city_structures_agree | 214,062,109 | 200,645,323 | -6.3 % | 210,677,590 |
| daily_forest_woodsman_ring_last_tile_structures_agree | 208,486,147 | 198,689,797 | -4.7 % | 208,624,287 |
| daily_forest_lord_and_woodsman_ring_structures_agree | 209,934,279 | 198,096,173 | -5.6 % | 208,000,982 |
| daily_full_deck | 586,423,537 | 542,367,578 | -7.5 % | 569,485,957 |
| daily_full_deck_structures_agree | 1,337,226,473 | 1,293,170,514 | -3.3 % | 1,357,829,040 |
