# Brief: coverage re-measure, after T1, T2, P-58 and the measure.sh fix

Track CORE of Paved (PM, 2026-10-14). Measure only. Commit this brief as `docs/briefs/coverage-2-remeasure.md`, as the first commit of your PR.

**Machine: the Mac** (your worktree is under `/Users/bal7hazar/`).

## Goal

1. Run `scripts/measure.sh coverage-split` on current main, exactly as the script documents (#395 merged 5c480528). Since #395 every test module is in a group. One run at a time, under a 16 GB RSS stop: watch snforge's RSS and stop above 16 GB. The Mac offers 45G.
2. **Confirm #395's all-ignored-group skip with the real snforge.** The `tests-walk-cost` group has only an `#[ignore]` test.
   - Record what snforge 0.64 with cairo-coverage 0.6.1 really prints and returns for it, and that `coverage-split` skips it and carries on to the merge.
   - If it stops instead, record the exact output and exit status. Do not fix the script: report it.
3. **Optionally**, if the split fits, run the unsplit `measure.sh coverage` once, now with `--max-threads 2`, under the same 16 GB stop. Record whether it fits.
4. Update `docs/measures/coverage.md` with a "Re-measure (after T1, T2, P-58, #395)" section:
   - the command, the toolchain, the peaks and the wall time;
   - the per-directory table, with the per-file rows that changed;
   - the overall figure from `coverage-split` alone, which should now equal the all-tests figure;
   - the remaining uncovered lines of value and access, each with file:line;
   - what #395's skip did.

   Keep the earlier sections as history.

## Runs (the Mac)

- `~/.local/bin/scarb` on the Mac is a stray scarb 2.11.0 binary until the Overseer removes it. In your own shell, put `~/.asdf/shims` ahead of `~/.local/bin` so that `scarb --version` gives 2.20.1 and `snforge --version` gives 0.64.0. Say what you used. measure.sh's guard should now only warn about the stray binary (#395).
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries to get past the guard. If the guard refuses, stop and report.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network. Never touch the Mac's main clone `/Users/bal7hazar/git/paved`.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/measures/coverage.md`, `docs/briefs/coverage-2-remeasure.md`. No other file.

## PR

- Title: `docs: coverage re-measure after T1, T2, P-58 and measure.sh (P5)`.
- Use `gh pr create` with this line in the body: `Review: none — documents only (a measure)`.
- Report: the PR's number and head, the commands with their peaks, the skip's real behaviour. Do not merge.
