# Gas in the release profile (G7 C9, P-59)

The L2 gas of every scenario of `contracts/tests/gas.cairo` in the `release` profile, next to the test-profile
figure the ceilings use. **For information: these figures are not ceilings** (the PM's ruling P-59 (4), 2026-10-14).
No test asserts them, and `contracts/tests/gas.cairo` is untouched.

## Method

- Code: main `82193903` (the branch of this thread is main plus the brief). Machine: the Mac,
  2026-10-14.
- Toolchain: scarb 2.20.1 (cairo 2.20.0, sierra 1.9.3), snforge 0.64.0, from `~/.asdf/shims` put ahead of
  `~/.local/bin` in the shell (`export PATH=$HOME/.asdf/shims:$PATH`), because `~/.local/bin/scarb` is a stray
  2.11.0. `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` were not set.
- Release command, run from `contracts/`, one run at a time, no memory cap on the Mac, a watcher stopping at 16 GB:

  ```
  RAYON_NUM_THREADS=1 /usr/bin/time -l snforge test test_gas_ --release --max-threads 2
  ```

  snforge 0.64.0 accepts `--release` as written (the log says "Finished `release` profile [optimized]"), and the
  17 gas tests passed.
- Test-profile command, the same without `--release`. Its 17 figures equal, to the unit, the latest figure of each
  scenario in `docs/measures/baseline.md` (the table "After the position check" for a0 to l and s; "After the
  Economy hardening (P-58)" for m and n; "After V1b" for t to w), so the test-profile column below is both.

| Run | Result | Wall time | Peak RSS (`maximum resident set size`) | Peak memory footprint |
|---|---|---:|---:|---:|
| `test_gas_ --release` | 17 passed | 77.36 s | 9,975,562,240 B (9.98 GB) | 5,231,186,288 B |
| `test_gas_` (test profile) | 17 passed | 43.90 s | 7,412,629,504 B (7.41 GB) | 4,676,734,960 B |

The release build fits under the 16 GB stop (62 % of it). The wall time includes the build of the test target and
the 17 tests; the release run was the first build of its profile in this worktree, the test-profile run came after it
(whether its target was cached was not checked).

## Figures

L2 gas of the last call of each scenario (the `GAS` lines). Ratio is release over test profile.

| | Scenario | L2 gas, test profile | L2 gas, release | Ratio | Change |
|---|---|---:|---:|---:|---:|
| a0 | Open simple move | 5,169,607 | 2,550,112 | 0.493 | -50.7 % |
| a | Simple move, closes a 2-tile city | 4,967,939 | 2,483,041 | 0.500 | -50.0 % |
| c | Close a large city | 5,376,938 | 2,562,190 | 0.477 | -52.3 % |
| d | Worst case of P0 | 5,328,267 | 2,656,262 | 0.499 | -50.1 % |
| e | Close a forest of 4 | 8,679,414 | 4,208,026 | 0.485 | -51.5 % |
| f | Worst forest scan | 18,167,380 | 8,525,795 | 0.469 | -53.1 % |
| g | Closing move in its day (surrender) | 3,174,468 | 1,769,218 | 0.557 | -44.3 % |
| i | Closing move after its day (surrender) | 2,716,928 | 1,493,538 | 0.550 | -45.0 % |
| k | Closing move, full report (surrender) | 3,608,648 | 1,928,308 | 0.534 | -46.6 % |
| l | Game over on a build | 7,173,835 | 3,730,835 | 0.520 | -48.0 % |
| m | Challenge spawn, stake 1 | 17,644,657 | 9,982,660 | 0.566 | -43.4 % |
| n | Challenge spawn, stake 10, referred | 18,497,677 | 10,580,410 | 0.572 | -42.8 % |
| s | Game over on a discard | 3,395,653 | 1,859,163 | 0.548 | -45.2 % |
| t | Vault `deposit` 1,000 PAVED | 3,717,820 | 2,541,310 | 0.684 | -31.6 % |
| u | Vault `redeem` 1,000 shares | 3,627,776 | 2,466,796 | 0.680 | -32.0 % |
| v | Vault `withdraw` 1,000 PAVED | 5,237,300 | 3,506,260 | 0.669 | -33.1 % |
| w | Vault `transfer` of 1,000 shares | 1,507,892 | 1,042,192 | 0.691 | -30.9 % |

Reading the table: the release figures are 0.47 to 0.69 of the test-profile ones. The moves that run the engine
(a0 to f) fall the most, by 50 to 53 %. The scenarios that are mostly storage and external calls (the Vault calls t to
w, the spawns m and n, the closing moves g, i, k, s) fall the least, by 31 to 47 %. In release the simple moves a0
and a cost 2.5M L2 gas, the worst forest scan f 8.5M, and the spawn m 10.0M.

## What the release profile is, and why the figures differ

The release profile is the one `scarb --release build` compiles, and so the code that `scripts/deploy.sh` declares
(`docs/architecture/class-headroom.md`). The test profile is the one `snforge test` builds by default: the `dev`
profile, which `contracts/Scarb.toml` sets to `inlining-strategy = "avoid"` and with function debug info. The
ceilings of `contracts/tests/gas.cairo` are measured in that test profile. With inlining avoided, a call of a small
function stays a call in the Sierra (the cost of the call itself, the argument and return handling, and the gas
accounting of each function are paid every time), while the release build leaves the compiler's default inlining
on, so the same source runs as fewer Sierra statements. Storage reads, writes, hashing and syscalls cost the same in
both, which is why the scenarios that are mostly those fall less. This paragraph is the reading of the cause and was
not isolated here by a run with only the strategy changed; the figures themselves are measured.

These figures are **information, not ceilings** (P-59). The committed ceilings stay the test-profile ones (measured
+ 5 %), which hold on Linux in CI. Figures of the deployed code are the release ones, and the real chain gas will also
include what the tests do not (the transaction's validation, calldata, state diff and L1 data). They were measured on
the Mac, and a figure that is ever used as a pin should be re-measured on Linux (CI or the VPS): the earlier
test-profile Mac and Linux runs gave the same L2 gas to the unit (`baseline.md`, "Leaderboard behind an interface"),
and release gave its own figures on the VPS at S1 (`class-headroom.md`), but this table has not been checked against
Linux.
