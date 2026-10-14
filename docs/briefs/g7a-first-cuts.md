# Brief: G7a, the first gas cuts, C1 + C2 + C3 (+ C5)

Track CORE of Paved. The PM's ruling P-59 (2026-10-14) on the G7 plan: `docs/architecture/g7-gas-plan.md`, in PR #406 (branch `hp/paved-core/t-0332-g7-gas-profile-and-plan`, readable with `git show origin/hp/paved-core/t-0332-g7-gas-profile-and-plan:docs/architecture/g7-gas-plan.md` until it merges). A review and a correctness audit follow, since C1 and C3 touch structure code. Commit this brief as `docs/briefs/g7a-first-cuts.md`, as the first commit of your PR.

**Machine: the VPS.** Committed gas figures are measured on Linux.

## The cuts (read each one's section in the plan)

- **C1:** skip the assessment when nothing closes. Estimate: a0 and l -0.56M.
- **C2:** the starter tile from constants at spawn. Estimate: spawn -2.06M.
- **C3:** the forest walker seeded with the move's side tiles. Estimate: e and f -0.36M.
- **C5,** only if it stays small: the fit check on one edge word. Estimate: -0.15M. If it grows, leave it out and say why.

## Rules

- **Goldens and the parity fixture stay byte-identical.** Show it with `git diff origin/main -- contracts/src/tests/golden docs/measures/golden-games.md packages`, which must be empty, and with the golden tests passing.
- **No rule changes. No storage layout change, and no ABI change** (`scripts/abis.sh` shows no diff). C4 and C6, which change the layout, come later. If a cut turns out to need a layout or ABI change, stop and report.
- For C1 and C3, prove that the result is unchanged with tests that compare the new path against the old one on many boards. This is what the correctness audit will check:
  - C1: every closing case still scores, and no non-closing case changes state;
  - C3: the forest result is identical to the full scan's, including forests that touch the move from several sides, and forests that do not touch it.
- **Measure.** Add an "After G7a" table to `docs/measures/baseline.md` with every scenario, before and after. Give each cut's measured gain beside the plan's estimate. Reset a ceiling to measured + 5 % where its figure falls; none may rise. Say where f lands. Give Challenge's CASM against the P-44 cap.

## Runs (VPS)

- scarb and snforge through the shims on PATH only (plain `scarb`, `snforge`). Never prepend `~/.asdf/installs` to PATH or call a binary by its path. At most one Cairo build or test run at a time on the VPS: the shim lock queues them.
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries to get past the guard.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`. scarb build: `prlimit --as=12884901888`. Only after `free -g` shows 8 GB or more available. Record the peaks.
- Scoped runs first (structure, forest, golden, gas, oracle), then the whole suite once.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`.
- `contracts/tests/gas.cairo` (ceilings, only downward).
- New test files for the equality proofs, under `contracts/src/tests/`, with their `mod` lines.
- `docs/measures/baseline.md`, `docs/architecture/class-headroom.md`.
- `docs/briefs/g7a-first-cuts.md`.
- Not `contracts/abis/**`, `contracts/tests/profile_g7.cairo` (#406), `scripts/**`, `packages/**`, `contracts/deployments/**`, `docs/architecture/g7-gas-plan.md` (#406) or `docs/programme/DECISIONS.md` (#406 adds P-59).

## PR

- Title: `perf: G7a, the first gas cuts (C1 skip the assessment, C2 starter from constants, C3 seeded forest walk[, C5]) (P-59)`.
- Body:
  - each cut, its design and its equality proof;
  - goldens and parity unchanged;
  - the gas table, measured against the estimate;
  - sizes;
  - no ABI or storage change;
  - one line on the audits: a review and a correctness audit, since structure code changes.
- Report: the PR's number and head, the commands with their peaks, the whole-suite count. Do not merge.

