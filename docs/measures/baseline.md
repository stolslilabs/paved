# Baseline measures (phase P0)

Taken before any change to the contracts, to judge P2 (remove Dojo) and P5 (gas work) against.

- Date: 2026-10-06
- Commit: `76f8dd3` (branch `hp/paved-core/t-0001-p0-toolchain-pin-and-ci`, PR #185) plus the files of this PR
- Toolchain: scarb 2.13.1 (cairo 2.13.1, sierra 1.7.0), snforge 0.51.2, dojo 1.8.0, `~/.asdf/installs/...` binaries
- Reproduce: `scripts/measure.sh` (`gas`, `coverage` or `all`); it sets `RAYON_NUM_THREADS=1` as `docs/programme/OPERATIONS.md` requires. The figures above were taken before that rule, with the default thread count; a rerun of `scripts/measure.sh gas` with it gave identical gas figures (peak RSS 3.99 GB).

## L2 gas of one `Daily.build`

Tests: `contracts/tests/gas.cairo` (snforge integration crate; `contracts/tests/setup.cairo` is a copy of
`src/tests/setup.cairo`, because `paved::tests` is `#[cfg(test)]` and cannot be imported from `tests/`).

Method: `core::testing::get_available_gas()` is read right before and right after the `build` call of the
last move; the difference is the L2 (Sierra) gas of that call alone (setup, spawn and earlier moves are
excluded). The builder's tile is overwritten with the wanted plan (as the e2e tests do) so the sequences do
not depend on the random draw; plans stay within the Base deck counts. `--detailed-resources` only reports
whole-test totals and `--gas-report` does not exist in snforge 0.51.2, hence the deltas. Two runs gave
identical figures. Each test asserts `gas <= ceiling`, ceiling = measured + 5 %, rounded up.

| | Scenario | Tiles in structure | L2 gas (delta) | Ceiling (+5 %) |
| --- | --- | --- | --- | --- |
| a | simple move, tile next to the start tile, no character | 2 (open) | 64,102,212 | 67,307,323 |
| b | same move with a Lord placed on the new tile | 2 (open) | 72,155,500 | 75,763,275 |
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

Output excerpt (`snforge test test_gas_`):

```
GAS a_simple_move: 64102212
[PASS] paved_tests::gas::test_gas_a_simple_move (l1_gas: ~0, l1_data_gas: ~21696, l2_gas: ~285498002)
GAS b_move_with_character: 72155500
GAS c_close_large_city: 112722643
GAS d_worst_case: 247082185
Tests: 4 passed, 0 failed, 0 ignored, 219 filtered out
```

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
`scripts/measure.sh coverage`, to be run on the Mac. The overall and per-directory table (tests/ and mocks/
excluded) is computed by that script from `coverage/coverage.lcov`; its awk part has not been exercised yet.

## Commands and peak memory (VPS, under `prlimit --as=8589934592`)

| Command | Result | Peak RSS |
| --- | --- | --- |
| `scarb fmt --check` | pass | n/a |
| `scarb build` | pass | 2.65 GB |
| `snforge test test_gas_` | 4 passed | 3.88 GB |
| `snforge test` | `Tests: 222 passed, 0 failed, 1 ignored, 0 filtered out` | 5.53 GB |
| `snforge test --coverage` | aborted in `cairo-coverage` | 7.90 GB |
