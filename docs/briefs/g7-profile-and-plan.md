# Brief: G7, the next gas iteration, part 1: profile, and a plan of cuts

Track CORE of Paved. The next of the owner's gas iterations (PM, 2026-10-14; an owner macro goal). This part profiles and proposes. The PM rules on the plan, and the implementation follows in later PRs. Commit this brief as `docs/briefs/g7-profile-and-plan.md`, as the first commit of your PR.

**Machine: the VPS.** Committed gas figures are measured on Linux.

## Where we are

- A simple build is now about 5M L2 gas. The closing moves cost more: e (closing a forest) at 8.68M, f at 18.1M.
- See `docs/measures/baseline.md`: the latest "After ..." tables, and the ceilings in `contracts/tests/gas.cairo`.
- G1 to G5 and the later PRs each recorded where their gain came from. Read their sections of baseline.md, so you do not re-propose what was done or rejected.

## Goal

1. **Profile on current main** the build of every scenario of baseline.md (a0, a, c, d, e, f, l, and the others), discard, surrender, spawn and the closing moves (e, f). Use snforge's resource output and, if it is installed, `cairo-profiler` (`snforge test --save-trace-data` or `--build-profile`). Break the gas down by:
   - storage reads and writes (count and cost);
   - the structure walk (roads, cities, wonders);
   - the forest scan;
   - the D-19 seat;
   - the draw;
   - the Setup report at game over (quests and achievements);
   - Economy.record;
   - events;
   - anything else above about 3 % of a move.

   Give the method, so the figures can be reproduced.
2. **Propose the cuts.** For each one, give:
   - what it changes;
   - the expected gain per scenario (an estimate, called one, with how you estimated it);
   - the risk;
   - whether it changes a rule, the goldens, the parity fixture, the storage layout (an upgrade concern: Sepolia's fresh deployment comes later, D-27) or an ABI;
   - and whether it touches structure code, which would need a correctness audit.

   Order them by gain over risk.
3. **Write it all to `docs/architecture/g7-gas-plan.md`** (new): the profile tables, the method and the ordered cuts. End with a section "For the PM to rule", listing the cuts you recommend for the first implementation PR and any that change a rule.

## Rules

- **No contract code change in this PR.** Profiling helpers may be added as `#[ignore]`d tests in a NEW file, `contracts/tests/profile_g7.cairo`, if you need them. Say so. They must not change any ceiling or golden.
- Goldens and parity identical: nothing changes here.

## Runs (VPS)

- scarb and snforge through the shims on PATH only (plain `scarb`, `snforge`). Never prepend `~/.asdf/installs` to PATH or call a binary by its path. At most one Cairo build or test run at a time on the VPS: the shim lock queues them.
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries to get past the guard.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`. Only after `free -g` shows 8 GB or more available. Record the peaks.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/architecture/g7-gas-plan.md` (new), `docs/briefs/g7-profile-and-plan.md`.
- `contracts/tests/profile_g7.cairo` (new, ignored profiling tests only), and, only if the test crate needs it, its registration line.
- Not `contracts/src/**`, not `docs/measures/**` (the coverage re-measure runs in parallel there), not `scripts/**`.

## PR

- Title: `docs: G7, the gas profile of build and the closing moves, and a plan of cuts`.
- Body:
  - the top costs per scenario;
  - the ordered cuts with their estimated gains;
  - "For the PM to rule";
  - one line: no contract change.
- Report: the PR's number and head, the commands with their peaks, and the plan. Do not merge.
