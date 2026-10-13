# Artifacts brief: a static check that every artifact name the scripts load exists in the build

Track CORE of Paved. A small CI task (the PM, 2026-10-13, from the note of review t-0249 on #342). Commit this brief as
`docs/briefs/ci-artifact-names.md`, as the first commit of your PR.

## Why

#342 renamed `MockUSDC` to `Faucet`. The signer's rehearsal test and README still loaded `paved_MockUSDC.*`, and CI
did not notice: the Test signer job has no devnet and no build, so the rehearsal skips itself. F, the fresh Sepolia
deployment, depends on these names, so a wrong name must fail CI before F.

## Goal

1. **A check script**, `scripts/check-artifact-names.sh` (or a name you justify). It lists every compiled-artifact name
   that `scripts/deploy.sh` and `scripts/signer/**` (code, tests, README) load: `paved_<Contract>.contract_class.json`,
   `.compiled_contract_class.json`, and any other form they use. It fails, naming the culprit, if one does not exist.
   Choose and justify the method:
   - against the build: the files under `contracts/target/{dev,release}` after `scarb build`;
   - or static: each name against the `#[starknet::contract]` modules of `contracts/src/**`. The artifact name is
     `paved_<module>`, plus any test-only or mock target the scripts use.

   A name built from a variable (deploy.sh's `$name` loop) must be resolved from the list that feeds it, not skipped.
   Say how.
2. **Run it in CI.**
   - The PM asks for it in the Test signer job. That job runs only when `scripts/signer/**` changes. A rename in
     `contracts/src` or `deploy.sh` must also trigger the check, so make its trigger cover `contracts/**`,
     `scripts/deploy.sh` and `scripts/signer/**`.
   - Either widen the signer job's filter, or put the check in the build job, which has the artifacts. Justify the
     choice in one paragraph.
   - It must stay part of `ci`, the required aggregate.
3. **Prove it.**
   - It passes on main as it is.
   - It fails on a deliberate wrong name (for example `paved_MockUSDC` put back in a scratch copy of the README). Show
     the failing output in the PR body. Do not commit the wrong name.
   - It needs no devnet and no network.

## Constraints

- **Step D (t-0250) is changing the contracts in parallel.** Its PR deletes `Lobby` and `Tutorial` and adds `Setup`,
  and it edits `scripts/deploy.sh` and `scripts/test-deploy-url.sh` for those artifacts. So:
  - **do not edit `scripts/deploy.sh`, `scripts/test-deploy-url.sh`, `contracts/**` or `scripts/signer/**`**;
  - your check only reads them.
  - Whichever PR merges second must keep the check green. Say in the PR body what step D must keep in mind, in one
    line.
- `--repoint` and `--d18` run from the pinned commit 06c024d, not from main. If the check finds names that only those
  paths load (MockRouter, Account, Daily, Lobby, Tutorial, Economy), list them. Accept a name that exists at 06c024d
  but not on main only if it is on a short, commented allow-list in the script, naming 06c024d.
- Never use or print the `STARKNET_*` variables.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/check-artifact-names.sh` (new).
- `.github/workflows/test.yaml`: the job and the filter only.
- `docs/programme/OPERATIONS.md`: one line on the check.
- `docs/briefs/ci-artifact-names.md`.
- Nothing else.

## PR

- Title: `ci: fail when a script loads an artifact name the build does not produce`.
- Body:
  - the method;
  - the CI placement and why;
  - the pass on main, and the failing output on a wrong name;
  - the 06c024d allow-list, if any;
  - the line for step D.
- Report: the PR's number and head, CI's result (the job ran, with its log line), and the body. Do not merge. A review
  follows.

