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
(spawn included) exceeds N. N is the figure measured on 2026-10-06 (after the characters and tournament assertions were added) plus 5 %.

| Test | Measured L2 gas | Ceiling (+5 %) |
| --- | --- | --- |
| `daily_city5_game_over` | 676,962,179 | 710,810,288 |
| `daily_road6` | 733,680,982 | 770,365,032 |
| `daily_mixed_roles` | 699,318,364 | 734,284,283 |
| `daily_real_deck_discards_to_game_over` | 609,271,691 | 639,735,276 |
| `tutorial_full_sequence` | 1,270,407,901 | 1,333,928,297 |

A gas improvement lowers the figures: lower the ceilings in the same PR. A rise above a ceiling is
a regression, not a reason to raise it.

## Limits

- The Daily moves with a role use forced plans (`forced: true`: the harness replaces the drawn tile,
  as `e2e/daily*.cairo` do), so that a structure of known size can be built in a few moves. Before
  each override the harness still asserts the plan that the real deck drew (`drawn`), so the draw
  after every build (reseed included) is pinned too; the discard case pins 7 draws on its own.
- A full Daily deck (38 tiles) is kept out of the suite: from the figures above, a spawn costs about
  214M L2 gas and a build 100M to 120M in the test world (city5: 4 builds, 677M; road6: 5 builds,
  734M), so 37 builds would cost about 4B and the 10-step tutorial already costs 1.27B. The
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
