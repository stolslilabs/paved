# G6 brief, part A: the Sepolia upgrade of Challenge (G1 and G4), the tool and a devnet rehearsal

Track CORE of Paved. **Part A sends nothing to Sepolia.** It builds the D-17 upgrade tool for Challenge and rehearses
it. Part B, the real upgrade, runs later, only on the PM's word that the indexer release that knows G4's events is live
(the indexer halts on an unknown selector). Commit this brief as `docs/briefs/g6-challenge-upgrade.md`, as the first
commit of your PR.

## Context

- Sepolia runs the fresh deployment of F (#359, f94c34f; `contracts/deployments/sepolia.json`).
- Two changes are on main since F:
  - G1 (#363, 78ab2ab): a new deck walk;
  - G4 (#366, b33bdb5): the pause guardian on spawn.
  Both are in Challenge's class only (check that no other class changed since f94c34f: compare the class hashes of a
  build at main with those of sepolia.json, and list any that differ).
- Games in flight on Sepolia keep their deck (G1's upgrade test) and are unaffected by the new storage (G4's upgrade
  test).
- The PM's order for Sepolia:
  1. the indexer release that knows G4's events;
  2. the upgrade;
  3. the guardian set.
  The guardian on Sepolia is the D-16 deployer account itself (PM, 2026-10-14), set in the same run.
- D-17 / U-1: Challenge is upgraded in place by its owner (the deployer account on Sepolia), with the two-step Ownable.
- The model: `--d18` (#329) and `--repoint` (#313) in `scripts/deploy.sh`, and F's fresh path (#358). Mirror them:
  - the signer path and secret handling;
  - the receipt-checked resume through a record in the deployment file;
  - SN_MAIN refused;
  - the `v` helper.

## Goal

1. **The tool.** `scripts/deploy.sh sepolia --upgrade-challenge [--check-only] [--guardian deployer]`, or a name you
   justify.
   - **Before sending anything, it checks:**
     - the chain id is SN_SEPOLIA;
     - the deployer is `owner()` of Challenge;
     - Challenge's current class hash is the file's, or the new class already, on a resume;
     - every other contract's class is unchanged, so only Challenge is upgraded;
     - the funding.
   - **Steps:**
     1. declare the new Challenge class (skip it if already declared);
     2. `Challenge.upgrade(new class)`;
     3. if `--guardian deployer` is given, `Challenge.set_guardian(<the deployer's address>)`. The keyword `deployer`
        means the address is read from `STARKNET_ACCOUNT_ADDRESS` by name: never in argv, never printed (print the
        literal `$STARKNET_ACCOUNT_ADDRESS`);
     4. write the new class hash into the deployment file (`contracts.Challenge.class_hash`) and an `upgrade_g1g4`
        record with the tx hashes. Keep every other field.
     5. smoke:
        - the class hash read back;
        - `owner()`;
        - `guardian()` equals the deployer (compared in the tool, not printed);
        - `spawn_paused()` is false;
        - one paid spawn and one build on the new class;
        - a game spawned before the upgrade (if one exists in the file's record, or the smoke game of F) can still be
          read.
   - **Resumable:** a rerun after a stop sends only the rest, and a rerun after completion sends nothing (skip time- or
     launch-dependent checks then, as F does).
2. **The rehearsal, on a local devnet:**
   - deploy the system as F does (a fresh path run from a checkout of f94c34f, the class Sepolia runs) in a scratch
     worktree of your own;
   - spawn a game and leave it open, with a few builds;
   - then, from this branch: `--check-only`, which must end with "every check passed; nothing was sent";
   - then the run with `--guardian deployer`, killed once after the declare and resumed;
   - then a rerun that sends nothing;
   - then finish the open game: its draws come from its old deck, and it records and settles;
   - pause and unpause spawn once, through the guardian and the owner.
   Record the steps, the tx count and the spend.
3. **Docs.** `docs/programme/OPERATIONS.md`: the procedure, its command, checks, resume and smoke, and the order: the
   indexer release first, then the upgrade and the guardian.

## Tests

- `scripts/test-deploy-url.sh`, extended to the new mode with a marker URL (no URL, key or address leaks; the guardian
  address is never printed), green.
- `scripts/check-artifact-names.sh` green.
- The rehearsal (point 2), with its output in the PR.

## Runs (VPS)

- starknet-devnet: `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`.
- scarb build: `prlimit --as=12884901888`, after `free -g` shows 8 GB or more available. One build at a time.
- For `test-deploy-url.sh`, put Node 24's binary first on `PATH`.
- **Never export the `STARKNET_*` variables** into the tests or the rehearsal. Nothing is sent to Sepolia.
- A run with no progress for 15 minutes is stopped and reported. Stop every devnet you started, by its own PID, and
  remove your scratch worktree at the end.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh` (the new mode, and what it shares), `scripts/test-deploy-url.sh`,
  `scripts/check-artifact-names.sh` (only if the checker needs it).
- `docs/programme/OPERATIONS.md`, `docs/briefs/g6-challenge-upgrade.md`.
- Not `contracts/**`, not `packages/**`, and not `contracts/deployments/sepolia.json` (part B writes it).

## PR

- Title: `feat: G6 part A, the Sepolia upgrade of Challenge (G1, G4) with the guardian, rehearsed`.
- Body:
  - the tool, its checks and steps;
  - the classes compared (only Challenge differs);
  - the rehearsal output: each step, the open game before and after, the kill and resume, the rerun, the
    pause/unpause, the tx count and the spend;
  - "For the PM": the order (indexer release first).
- Report: the PR's number and head, the body, and the peaks. Do not merge. A review follows.
