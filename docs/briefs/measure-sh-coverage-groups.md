# Brief: measure.sh covers every test, fits the memory stop, and the guard recognises a real shim

Track CORE of Paved. A follow-up of the coverage measure (#392, `docs/measures/coverage.md`, "Outside this plan"). Scripts only. A review on the other model follows; no audit. Commit this brief as `docs/briefs/measure-sh-coverage-groups.md`, as the first commit of your PR.

## What is wrong on main

1. `scripts/measure.sh`'s `COVERAGE_GROUPS` leave out `paved::quests::` and `paved::tests::{collection, deck_walk, draw_mask, economy::, owners, seed, walk_cost}`: 286 tests. So `coverage-split` reports 94.40 % instead of 97.18 % (90.66 % against 99.86 % on `systems/`). Its comment "Together they cover every test of the crate" is false.
2. `measure.sh coverage` (unsplit) has no `--max-threads`. On the Mac it reached 18.5 GB with default threads.
3. The memory figures in `measure.sh` and `AGENTS.md` for `coverage-split` (a 9.34 GB peak) are outdated: the groups now peak at 8.4 to 14.6 GB (coverage.md, "Peaks").
4. The shim guard (deploy.sh, measure.sh, node/run-sample.sh, from #389) treats any executable `~/.local/bin/scarb` as "the shim". On the Mac that path holds a stray scarb 2.11.0 binary, so measure.sh refuses there. On the VPS the real shims are bash scripts that forward to `~/.asdf/shims/scarb` (see the VPS's `~/.local/bin/scarb`).

## Goal

1. **The groups cover every test.** Add the missing groups. Then add a check that fails if a test module is in no group: a `check-groups` mode, or part of `check-setup`, that lists the crate's test modules (from the source tree, or `snforge test --list` if it exists without a build) and compares them with `COVERAGE_GROUPS`. Run it in CI through `scripts/test-deploy-url.sh`, or another script CI already runs, with no Cairo build. Fix the comment.
2. **`coverage` fits:** give it `--max-threads 2`, as the split runs have. Or drop the unsplit mode if it cannot fit under 16 GB. Say which, and why.
3. **Update the memory figures** in measure.sh's header and `AGENTS.md` from coverage.md's "Peaks". Say that coverage runs go on the Mac, under a 16 GB stop.
4. **The guard recognises a real shim.** Treat `~/.local/bin/scarb` (and snforge) as the shim only if it is a script and not a native binary. For example, check that its first line is a `#!` line, or another robust test you justify. A native binary there counts as "no shim": warn, do not refuse. On the VPS, the real shims still pass, and a non-shim scarb is still refused. Keep the three scripts consistent. Add test-deploy-url.sh cases: a stray binary at the shim path warns, and a script shim with scarb elsewhere refuses.

## Runs

- **No Cairo build or test is needed.** Do not run measure.sh's coverage or gas modes.
- Run the whole `bash scripts/test-deploy-url.sh` once at the end, mimicking CI as #389 did (no sncast, no shim on PATH), and give its summary line. Use `node` on PATH.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/measure.sh`, `scripts/deploy.sh` (the guard only), `scripts/node/run-sample.sh` (the guard only), `scripts/test-deploy-url.sh`.
- `AGENTS.md` (the coverage memory note only).
- `docs/measures/coverage.md`: only a line under "Outside this plan" saying it is fixed.
- `docs/briefs/measure-sh-coverage-groups.md`.
- Not `contracts/**`, not `packages/**`, not `.github/**`.

## PR

- Title: `fix(scripts): measure.sh covers every test module, fits 16 GB, and the guard recognises a real shim`.
- Body:
  - the groups added;
  - the coverage check;
  - `coverage`'s threads;
  - the figures;
  - the guard change, with its cases;
  - one line on why no audit.
