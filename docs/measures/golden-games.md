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

With the pinned toolchain (scarb 2.13.1, snforge 0.51.2). Peak memory measured for this command:
about 3.7 GB (`/usr/bin/time -v`).

## Cases

| Test | Mode, player, day | Covers |
| --- | --- | --- |
| `test_golden_daily_city5_game_over` | Daily, PLAYER, day 0 | City of 5 tiles (starter, 3 corridors, cap) closed on the last move with a Paladin: +2245. Deck cut to 5 tiles: game over, `built 4`, `tile_count 5`. |
| `test_golden_daily_road6` | Daily, ANYONE, day 1 | Road of 6 tiles (stop, starter, 3 straights, stop) closed on move 5 with an Adventurer: +1379. |
| `test_golden_daily_mixed_roles` | Daily, SOMEONE, day 2 | Pilgrim on a wonder (left open, 0), Paladin on a 2-tile city (+838), Adventurer on a road closed by the last move (+877). Final 1715. |
| `test_golden_daily_real_deck_discards_to_game_over` | Daily, PLAYER, day 3 | Real deck, no forced plan: the 7 plans drawn by the seed of that day, through 7 discards, until game over. |
| `test_golden_tutorial_full_sequence` | Tutorial | The full scripted tutorial: 8 builds and 1 discard, plan before each step, score after each (1286, 2124, 2074 after the discard, 5078 final), game over. |

Forest: no role is allowed on a forest (`Role::is_allowed`), so no case places a character there.

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
