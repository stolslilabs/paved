# Brief: coverage T2, tests for access and expiry (and two build-position tests)

Track CORE of Paved. Part 2 of the coverage iteration (PM, 2026-10-14; an owner macro goal from P5). Tests only. A review on the other model follows; no audit (no contract change). Commit this brief as `docs/briefs/coverage-t2-access-expiry.md`, as the first commit of your PR.

**Machine: the Mac** (your worktree is under `/Users/bal7hazar/`). The VPS runs T1 in parallel.

## The plan

1. Implement "PR T2: access and expiry" of `docs/measures/coverage.md` (on main, #392 805c6a4e), every row of its table, with the assertion it names. Read its sections "Access" and "The expiry (S1)" for each gap's file:line and scenario. The line numbers there are at 420d9529: re-locate them on current main.
2. Two tests from the #391 review, in `contracts/src/tests/e2e/position.cairo`:
   - an accepted `build` at x = 1, and at y = 1 (a real build there, not just the check: write the neighbour as the existing tests do);
   - `'Challenge: invalid position'` takes precedence over `'Game: does not exist'`: `build(999, .., 0, 0)` reverts with the position error.

## Rules

- **Tests only. No contract code changes.** If a test shows a contract behaving otherwise than the table says, do not change the contract and do not weaken the test to pass. Mark the test `#[ignore]` with a one-line reason, describe the failing scenario in the PR under "Findings", and go on with the rest.
- Every new test asserts something specific: exact reasons and events.
- Leave out the plan's findings 1 to 3. They wait for a ruling.
- Goldens unchanged. No gas ceiling changes.

## Runs (the Mac)

- `~/.local/bin/scarb` on the Mac is a stray scarb 2.11.0 binary, not a shim. Make sure the `scarb` and `snforge` you run are 2.20.1 and 0.64.0: check `scarb --version` and `snforge --version` first. Use the asdf shims (`~/.asdf/shims`) ahead of `~/.local/bin` in your own shell if needed, and say what you used. The owner's one-run rule is for the VPS; on the Mac, still run one Cairo build or test at a time.
- snforge: `RAYON_NUM_THREADS=1 /usr/bin/time -l snforge test <filter> --max-threads 2`. Stop any run whose RSS passes 16 GB; the Mac offers 45G.
- Scoped runs first (`paved::tests::e2e::access`, `quests`, `expiry`, `position`), then the whole suite once. Record the peaks.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network. Never touch the Mac's main clone `/Users/bal7hazar/git/paved`.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/tests/e2e/access.cairo`, `quests.cairo`, `expiry.cairo`, `position.cairo`.
- `docs/briefs/coverage-t2-access-expiry.md`.
- Not `contracts/src/tests/economy/**` (T1), not any contract source, not mocks.

## PR

- Title: `test: coverage T2, access and expiry (P5)`.
- Body:
  - a table mapping each plan row to its test, and the result;
  - "Findings";
  - the peaks and the toolchain used on the Mac;
  - one line on why no audit.
- Report: the PR's number and head, the commands with their peaks, the whole-suite count. Do not merge.

## Addendum (the PM's ruling, 2026-10-14)

`Challenge.set_setup` stays an owner power, with no contract guard. Add one test pinning today's behaviour
(`access.cairo` or `expiry.cairo`):

- game 1 is bought on Economy A;
- the owner calls `set_setup(S2)`, where S2 is wired to Economy B;
- the game's ending move reverts (`'Economy: unknown game'`, or `'Quest: not reporter'` if S2 has not
  allowlisted Challenge: assert the exact reason);
- `settle` on A reverts `'Economy: not recorded'`.

Named so that it reads as documented behaviour, e.g. `test_set_setup_with_a_game_in_flight_blocks_its_ending`.
`PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only: never point them at real binaries.
