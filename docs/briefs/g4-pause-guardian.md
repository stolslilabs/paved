# G4 brief: a pause guardian on Challenge.spawn (a mainnet gate)

Track CORE of Paved. A mainnet gate whatever owner the owner chooses (PM, 2026-10-14): the emergency stop that every
owner option lacks today (`docs/architecture/upgrade-owner.md`, #361, section 3). An access-control audit follows.
Commit this brief as `docs/briefs/g4-pause-guardian.md`, as the first commit of your PR.

## The ruling (PM, 2026-10-14)

- The guardian is an **owner-set address** that can **pause spawn only**.
- **Unpausing is the owner's.**
- Spawn is the entry point that takes money. A paused Challenge must still let games already bought finish, and still
  let them be recorded and settled: build, discard and surrender work while paused, and so do the economy's record and
  settlement.

## What to build

1. **In Challenge** (`systems/challenge.cairo`):
   - new storage, appended (P-42): `guardian: ContractAddress` and `spawn_paused: bool`;
   - `set_guardian(address)`, owner-only, which emits `GuardianSet { guardian }`. The zero address means "no
     guardian". Say whether the owner may also pause (recommended: yes, the owner can do everything the guardian can);
   - `pause_spawn()`, callable by the guardian (and the owner, if you choose so), which emits
     `SpawnPaused { by }`. Idempotent: a second pause does nothing and does not revert;
   - `unpause_spawn()`, owner-only, which emits `SpawnUnpaused`;
   - `spawn` reverts with `'Challenge: spawn paused'` while paused, before any token moves;
   - one view, `spawn_paused() -> bool`, and the guardian's address in a view (`guardian()`).
2. **Nothing else stops.** Test that build, discard, surrender, the game-over report to Setup, Economy.record and the
   settlement all work while paused.
3. **The two-step Ownable** is unchanged. A new owner after a transfer can unpause; the old one cannot.
4. **deploy.sh.** The fresh path deploys with no guardian (zero) by default. Add an optional
   `--guardian <address>` only if it is simple; otherwise the owner sets it after deployment. Say which. Do not touch
   `--repoint` or `--d18`.
5. **Sepolia** gets this later by a D-17 upgrade of Challenge. A game in flight is unaffected; the new storage reads
   zero and false after the upgrade, so spawn is not paused. Prove it with an upgrade test (the pattern of
   `upgrade_g1.cairo`).

## Tests

- set_guardian: owner-only, emits its event, and zero clears it.
- pause_spawn: by the guardian works; by anyone else reverts (owner as you choose); idempotent.
- unpause_spawn: by the owner works; by the guardian reverts; by anyone else reverts.
- spawn while paused reverts before any transfer (a spy or a balance check); after unpause it works.
- Everything else works while paused (point 2).
- The upgrade test (point 5).
- Goldens unchanged. Gas: spawn's added cost (one storage read); every scenario under its ceiling, f is the tightest.
- ABIs: `scripts/abis.sh`. The diff adds the four entry points, the two views and the three events. CLIENT follows on
  this branch (the pattern), for the views and events.
- Sizes: Challenge's CASM against 72,947.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first, then the whole suite once.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.
- For `scripts/test-deploy-url.sh`, put Node 24's binary first on `PATH`.

## Git

- **Push the branch right after the brief commit** (CLIENT builds on it).
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`, and `contracts/abis/**` through `scripts/abis.sh`.
- `scripts/deploy.sh` (the fresh path's guardian option only, if built), `scripts/test-deploy-url.sh`.
- Docs:
  - `docs/architecture/upgrade-owner.md`: section 3, as built;
  - `upgrades.md`: the new slots and their pins;
  - `public-interface.md`: the new entry points, views and events;
  - `docs/programme/PLAN.md`: the gate row, as done;
  - `class-headroom.md`, `docs/measures/baseline.md`: figures.
- `docs/briefs/g4-pause-guardian.md`.
- Not `packages/**`, not `contracts/deployments/**`.

## PR

- Title: `feat: G4, a pause guardian on Challenge.spawn (mainnet gate)`.
- Body:
  - the interface;
  - who can do what (a table: owner, guardian, anyone);
  - what stops and what does not;
  - the upgrade behaviour;
  - the ABI diff;
  - sizes and gas;
  - "For CLIENT";
  - one line on the audit: access control.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.
