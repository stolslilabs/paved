# Brief: the coverage iteration, part 1: measure, and find the gaps that matter

Track CORE of Paved. This is an owner macro goal from P5: line coverage, which has not been touched since P5 (PM, 2026-10-14). This part measures and reports. Tests for the gaps follow in one or two later PRs, which I brief from your report. Commit this brief as `docs/briefs/coverage-1-measure.md`, as the first commit of your PR.

**Machine: the Mac** (you run there; your worktree is under `/Users/bal7hazar/`). Coverage builds are heavy: `scripts/measure.sh coverage-split` peaks at about 9.34 GB RSS and is refused on Linux. Do not run it on the VPS.

## Goal

1. **Measure line coverage of `contracts/src` on current main** with `scripts/measure.sh coverage-split` (or `coverage`, if it fits), as the script documents: snforge `--coverage`, cairo-coverage, lcov, and the `coverage` Scarb profile.
   - One Cairo run at a time.
   - Use the toolchain the Mac has; on the Mac there is no shim, so the script only warns.
   - Record the toolchain versions, the peak RSS of each run and the wall time.
   - If cairo-coverage is missing or fails, say exactly what you ran and what it printed, then stop and report. Do not install anything.
2. **Report the figures per module**: lines found and hit, and the percentage, for each file of `contracts/src`, excluding `tests/**`. Give the overall figure as information: it is not a target.
3. **The uncovered paths that matter.** For each of the following, list every uncovered line or branch with file:line, and say what scenario would reach it:
   - **value**: anything that mints, burns, transfers or computes PAVED or USDC (economy.cairo, vault.cairo, curve.cairo, the token, the router path);
   - **access**: every owner-only, game-only, guardian or two-step ownership path, and every upgrade entry point;
   - **the vPAVED fee and dead-share maths**: deposit, mint, withdraw and redeem with the fee, max_*, preview_*, rounding, and the zero-share refusal;
   - **the expiry**: build, discard and surrender at and after start + 24 h, record and settle of an expired game.

   Also check whether lines that coverage counts as "hit" are really asserted. A line run by a test that checks nothing about it is a gap too: note the worst cases, for value and access only.
4. **A test plan:** group the gaps into one or two PRs of tests, each with its file allowlist, test names and the assertion each makes. No contract code changes: tests only, unless a gap shows a bug. In that case, describe the bug with a failing scenario and stop, without fixing it.
5. Write all of this to `docs/measures/coverage.md` (a new file): the command, the toolchain, the peaks, the per-module table, the gaps that matter, and the test plan.

## Runs

- **The Mac:** scripts/measure.sh as documented, one run at a time.
- A long visible run on the Mac is fine: it is a terminal run.
- A capped run with no progress for 20 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.
- Never touch the Mac's main clone (`/Users/bal7hazar/git/paved`): work only in your worktree.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/measures/coverage.md` (new) and `docs/briefs/coverage-1-measure.md`.
- No other file. If `measure.sh` needs a fix to run, stop and report what breaks: that is a separate task.

## PR

- Title: `docs: coverage of the contracts, per module, and the gaps that matter (P5)`.
- Body:
  - the summary table;
  - the gaps that matter, by class;
  - the test plan;
  - one line: documents only.
- Report: the PR's number and head, the commands with their peaks, and everything in the body. Do not merge.
