# D-18e brief: the economy defaults after D-18 (P-46)

Track CORE of Paved. Commit this brief as `docs/briefs/d18e-economy-defaults.md`, as the first commit of your PR.

## Context

- P-46 (PM, 2026-10-13, in `docs/programme/DECISIONS.md`, merged in #326 at 9c1c00a). After D-18's resample:
  - `sigma` stays 0 and `c` = 1.222 (`slope_bps` 12,220);
  - the initial mean for a new deploy is 3,980 points (`MEAN0` 3,980,000);
  - Sepolia gets `Economy.configure(slope_bps 12,220)` in D-18c. That is not this task.
- Today's defaults still hold the pre-D-18 values:
  - `scripts/deploy.sh:1465-1468`: `CONFIG=(7000 0 18130 5 …)`, `MEAN0=3353000`, and the comment above them;
  - `contracts/src/economy/economy.cairo:69-71`: `decided()` with `slope_bps: 18_130`, and its doc comment
    ("c 1.813");
  - `scripts/montecarlo/fixture.py` and the Cairo test `test_fixture_matches_sim`
    (`contracts/src/tests/economy/economy.cairo:1209`), with the test's `MEAN0` (line 63);
  - `docs/architecture/economy.md`, the deploy sections (about lines 1126 and 1190), which say "initial mean 3,353".

## Goal

1. **`deploy.sh`.** Set slope 12,220 and `MEAN0` 3,980,000, and update the comment. These are the values every
   network's fresh deploy passes. Check that no other place in `scripts/` passes the old values.
2. **`decided()`.** Set `slope_bps: 12_220`, and update its doc comment (P-46, c 1.222).
   - First establish, with evidence, that `decided()` is called only from tests and never by the contract at
     runtime.
   - Then prove that **`Economy`'s compiled class does not change**: build main and this branch, and compare
     `Economy`'s class hash (or its CASM). Quote both. R-1 part B records `Economy`'s class hash in `sepolia.json`,
     so a changed class must be reported, not hidden. If the class changes, stop and report.
3. **The fixture.** Regenerate `fixture.py`'s expected figures with the new slope and mean, through `sim.py`'s own
   code, as the fixture does today. Update `test_fixture_matches_sim` and the test file's `MEAN0` to match.
   - Tests that use 18,130 or 3,353,000 as **arbitrary inputs** to the curve's math (for example in
     `tests/economy/curve.cairo` and `mean.cairo`) stay as they are.
   - Change only tests that assert the decided configuration or the deploy defaults (for example the assertions on
     `terms.slope_bps` and `quote.slope` fed by `decided()`).
   - List every test you changed, and why. List the ones you kept, and why.
4. **`economy.md`.** Update the deploy sections' "initial mean 3,353", and any other place that states a deploy
   default. Figures of the old sample in historical text stay.
5. **`DECISIONS.md`, P-46 (review note of #326).** In the reversal column, write "`c` 1.506 (`slope_bps` 15,060)"
   instead of "`c` 15,060". Change nothing else in the row.

## Tests

- `snforge test paved::tests::economy`, then the whole suite once at the end.
- `python3 -I -B scripts/montecarlo/fixture.py`, and confirm `sim.py` is unchanged.
- `scripts/test-deploy-url.sh`, which must stay green.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- A run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh`: the `CONFIG` slope, `MEAN0` and their comment only.
- `contracts/src/economy/economy.cairo`: `decided()` and its doc comment only.
- `contracts/src/tests/economy/**`, `scripts/montecarlo/fixture.py`.
- `docs/architecture/economy.md`: deploy defaults only. `docs/programme/DECISIONS.md`: the P-46 reversal wording
  only.
- `docs/briefs/d18e-economy-defaults.md`.
- Not `contracts/deployments/**`, not `contracts/abis/**` (no ABI may change), not `packages/**`.

## PR

- Title: `chore: economy defaults after D-18 (slope 12,220, mean 3,980; P-46)`.
- Body:
  - each change;
  - the evidence that `decided()` is test-only;
  - `Economy`'s class hash on main and on the branch;
  - the tests changed and kept;
  - the fixture's old and new figures;
  - one line: "No audit: the values are the PM's decision P-46; the contract class is unchanged".
- Report: the PR's number and head, everything in the body, the test results and the peaks. Do not merge. A review
  follows.

