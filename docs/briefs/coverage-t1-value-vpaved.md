# Brief: coverage T1, tests for value and vPAVED

Track CORE of Paved. Part 2 of the coverage iteration (PM, 2026-10-14; an owner macro goal from P5). Tests only. A review on the other model follows; no audit (no contract change). Commit this brief as `docs/briefs/coverage-t1-value-vpaved.md`, as the first commit of your PR.

## The plan

Implement "PR T1: value and vPAVED" of `docs/measures/coverage.md` (on main, #392 805c6a4e), every row of its table, with the assertion it names. Read that document's sections "Value" and "The vPAVED fee and dead-share maths" for each gap's file:line and scenario. The line numbers there are at 420d9529: re-locate them on current main.

## Rules

- **Tests only. No contract code changes.** If a test shows a contract behaving otherwise than the table says, do not change the contract and do not weaken the test to pass. Mark the test `#[ignore]` with a one-line reason, describe the failing scenario in the PR under "Findings", and go on with the rest.
- Every new test asserts something specific about the gap it covers: exact values and events, not "does not panic".
- Leave out the plan's findings 1 to 3 (the swap sign check, the Vault or router as a referrer, set_setup with games in flight). They wait for a ruling.
- Goldens unchanged. No gas ceiling changes.

## Runs (VPS)

- scarb and snforge through the shims on PATH only (plain `scarb`, `snforge`). Never prepend `~/.asdf/installs` to PATH or call a binary by its path. At most one Cairo build or test run at a time on the VPS: the shim lock queues them.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`. Only after `free -g` shows 8 GB or more available.
- Scoped runs first (`paved::tests::economy::`), then the whole suite once. Record the peaks.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/tests/economy/economy.cairo`, `vault.cairo`, `token.cairo`, `curve.cairo`.
- New test helpers only inside those files. If a mock needs a new behaviour (for example the swap returning a USDC leg paid out), and the existing mock cannot be configured to do it, stop and report which mock and why.
- `docs/briefs/coverage-t1-value-vpaved.md`.
- Not `contracts/src/systems/**`, `economy/**`, `mocks/**`, or any other file. T2 runs in parallel on `tests/e2e/{access,quests,expiry,position}.cairo`.

## PR

- Title: `test: coverage T1, value and vPAVED (P5)`.
- Body:
  - a table mapping each plan row to its test, and the result;
  - "Findings" (any ignored test, with its scenario);
  - the peaks;
  - one line on why no audit.
- Report: the PR's number and head, the commands with their peaks, the whole-suite count. Do not merge.
