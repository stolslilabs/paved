# Brief: G7 C9, the release-profile gas figures, for information

Track CORE of Paved. The PM's ruling P-59 (4), of 2026-10-14: measure the gas figures in the release profile on the Mac, for information, with no ceilings yet. Commit this brief as `docs/briefs/g7-c9-release-profile.md`, as the first commit of your PR.

**Machine: the Mac** (your worktree is under `/Users/bal7hazar/`). The release build needs more than the VPS shim's 8 GB.

## Goal

1. On current main, run the gas scenarios in the release profile: `snforge test test_gas_ --release --max-threads 2`, or the form snforge 0.64 accepts; say which.
   - Record every `GAS ...` figure;
   - the build's peak memory, with `/usr/bin/time -l`;
   - the wall time.
2. Write a NEW file, `docs/measures/release-profile.md`:
   - the command and the toolchain;
   - a table of every scenario, with the test-profile figure (from `docs/measures/baseline.md`, its latest table), the release figure, and the ratio;
   - one paragraph on what the release profile is, why its figures differ, and that they are information, not ceilings (P-59).

   Do not edit `baseline.md`: G7a (t-0335) is editing it in parallel. A pointer line in baseline.md comes later.
3. If the release build does not fit under the 16 GB stop, record where it stopped, and report.

## Runs (the Mac)

- `~/.local/bin/scarb` on the Mac is a stray 2.11.0 binary. In your own shell, put `~/.asdf/shims` ahead of `~/.local/bin` so that `scarb --version` gives 2.20.1 and `snforge --version` gives 0.64.0. Say what you used.
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries.
- One run at a time. Stop any run above 16 GB RSS; the Mac offers 45G. `RAYON_NUM_THREADS=1 /usr/bin/time -l snforge test ...`.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network. Never touch the Mac's main clone `/Users/bal7hazar/git/paved`.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/measures/release-profile.md` (new), `docs/briefs/g7-c9-release-profile.md`. No other file.

## PR

- Title: `docs: G7 C9, the release-profile gas figures, for information (P-59)`.
- Use `gh pr create` with this line in the body: `Review: none — documents only (a measure)`.
- Report: the PR's number and head, the commands with their peaks, and the table. Do not merge.

