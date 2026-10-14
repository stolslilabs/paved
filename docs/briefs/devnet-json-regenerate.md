# Brief: regenerate contracts/deployments/devnet.json from main

Track CORE of Paved (PM, 2026-10-14). The tracked `contracts/deployments/devnet.json` has been stale since #391 and #415: the Challenge, Collection and Economy classes changed after its last update (#382). It misleads any run that does not redeploy. Commit this brief as `docs/briefs/devnet-json-regenerate.md`, as the first commit of your PR.

**Machine: the VPS.**

## Goal

1. On a **fresh** seeded local devnet, as deploy.sh documents it: `starknet-devnet --host 127.0.0.1 --port 5050 --seed 42`, using the direct path `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`, a new process that you stop by its PID afterwards. Run `scripts/deploy.sh devnet` **without** `--unmerged`, from your branch while its contract sources equal main's, so that deploy.sh writes the committed file. Your brief commit touches docs only. If deploy.sh's source check refuses, report its exact text and stop; do not use --unmerged to get round it.
2. Commit the regenerated `contracts/deployments/devnet.json`, and nothing else from the run.
3. In the PR body:
   - the diff summary: which addresses and class hashes changed, and why (the classes since #382);
   - the guardian now set (the PM's ruling, #418) and the v2a definitions (#423), if the file records them;
   - the `deployed_at` value, which must name a main commit, not `unmerged-...`;
   - `smoke ok`.
4. Check that the consumers still pass with it: CI's "Test indexer" ("the committed devnet.json gives the four addresses, the start block and the chain") and "Build and test client".

## Runs (VPS)

- One Cairo build, through the plain `scarb` shim (deploy.sh builds): no PATH prepend, no direct binary path, and the shim lock queues it.
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries.
- Devnet keys only. Never use or print the `STARKNET_*` variables. Nothing is sent to any public network.
- If a command is refused, report its exact text. Do not route around it.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`, and regenerate again if contracts changed. Plain pushes only.

## Allowlist

- `contracts/deployments/devnet.json`, `docs/briefs/devnet-json-regenerate.md`. No other file.

## PR

- Title: `chore: regenerate devnet.json from main (stale since #391 and #415)`.
- Report: the PR's number and head, the deploy.sh output summary, and the peak memory of the build. Do not merge.
