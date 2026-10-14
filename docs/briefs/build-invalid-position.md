# Brief: Challenge's build refuses an invalid position with a named error

Track CORE of Paved. A small fix (PM, 2026-10-14, found by CLIENT). A review on the other model follows; no audit (an earlier, clearer revert of a call that already reverts). Commit this brief as `docs/briefs/build-invalid-position.md`, as the first commit of your PR.

## The problem

`build(game_id, orientation, 0, 0)` (or any position on the board's edge whose neighbour would be below 0) reverts with a raw `u32_sub Overflow` from `self.x - 1` (or `self.y - 1`), seen at the fee estimate. It is safe, but unclear for a client.

## Goal

1. **Check the coordinates first.** In the build path (`components/playable.cairo` `build`, or the earliest place that receives x and y), before any read or write, revert with a named error, `'Challenge: invalid position'` or the codebase's error style (say which), for any position that cannot be on the board:
   - x or y of 0;
   - any value whose neighbour computation would underflow or overflow;
   - any bound the board already has (find it: the CENTER constant, the maximum extent). State the exact rule you chose and why it is exactly the set of positions that could never be valid. A valid position must never be refused.
2. **Tests:**
   - (0, 0), (0, CENTER) and (CENTER, 0) revert with the named error;
   - the upper edge, if the board has one;
   - a valid edge-adjacent position still builds;
   - the goldens are unchanged.
3. **No ABI change** beyond the error string. `scripts/abis.sh` shows no diff. No storage change.
4. **Gas:** the check's cost per build. Every scenario stays under its ceiling, with no ceiling raised. Record it in `docs/measures/baseline.md` ("After the position check").
5. Document the error in `docs/architecture/public-interface.md` (the errors of `build`).

## Runs (VPS)

- scarb and snforge through the shims on PATH only (plain `scarb`, `snforge`). Never prepend `~/.asdf/installs` to PATH or call a binary by its path. At most one Cairo build or test run at a time on the VPS. The repository's scripts now enforce this (#389).
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first (the build tests, golden, gas), then the whole suite once.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**` (the build path and its tests), `contracts/tests/**` (ceilings, only if a figure falls).
- `docs/architecture/public-interface.md`, `docs/measures/baseline.md`.
- `docs/briefs/build-invalid-position.md`.
- Not `contracts/abis/**` (no ABI may change), not `scripts/**`, not `packages/**`, not `contracts/deployments/**`.

## PR

- Title: `fix: Challenge's build refuses an invalid position with a named error`.
- Body:
  - the rule;
  - the error;
  - the tests;
  - gas;
  - no ABI or storage change;
  - one line on why no audit.
- Report: the PR's number and head, the commands with their peaks, and anything you could not do. Do not merge.

