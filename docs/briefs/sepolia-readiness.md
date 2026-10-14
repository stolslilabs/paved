# Brief: readiness for the fresh Sepolia deployment, a rehearsal and the day-of checklist

Track CORE of Paved. The PM's go of 2026-10-14. D-27: Sepolia gets one fresh deployment at the end, with F's tool. **This task sends nothing to any network.** The deployment itself, and its date, stay with the PM and the owner. Commit this brief as `docs/briefs/sepolia-readiness.md`, as the first commit of your PR.

**Machine: the VPS** (the Mac is unreachable).

## Goal

1. **Rehearse the fresh path at current main** (a28f1e8d or later). That is everything since F part B (#359): vPAVED and its 1,000 dead shares, the split defaults (P-56, burn_bps 7,368, referral 500, exit fee 500 bps), P-58, S1's expiry and initial_seed, the guardian (G4), the invalid-position check, and G7a if it has merged.
   - `scripts/deploy.sh devnet` on a local starknet-devnet: the whole fresh path and its smoke.
   - `scripts/deploy.sh sepolia --rehearse` on a fresh local devnet, as the script documents: the Sepolia path, signer included, with the node's predeployed account. The funded account's variables are unset by the script.
   - `scripts/deploy.sh sepolia --rehearse --estimate-only`: the fee estimate of each declare in deploy order, on the local node.
   - Record every command with its output summary. Check that each post-deploy check passes, and that the order is right: the dead shares before `Economy.set_game`, the fee and split defaults set, every owner the deployer, the guardian as `deploy.sh` sets it, Challenge's Setup wired.
   - If a step fails, describe it exactly and stop. Do not fix contracts. A script fix in `deploy.sh` is allowed only if it is small and clearly a script bug; otherwise report it.
2. **The funding line.** From the rehearsal's estimates, compute the STRK the fresh deployment needs (declares plus deploys plus the setup calls), with a margin. Say it is an estimate from a local node. On the day, the real `sepolia --estimate-only` against Sepolia (reads only, with the funded account) gives the real figure. That run is a day-of step for whoever deploys, not for this task: never use the `STARKNET_*` variables.
3. **The day-of checklist**, a new file `docs/programme/sepolia-release-day.md`, covering the whole day in order: **contracts, then indexer, then client.**
   - **Contracts:**
     - the go (the PM's and the owner's);
     - the funding check (`sepolia --estimate-only` with the funded account), then the deploy command, the expected outputs and the checks;
     - recording `contracts/deployments/sepolia.json`, the ABIs and the addresses;
     - what to do if a step fails mid-way (the rerun and resume behaviour of `deploy.sh`).
   - **Indexer and client:** by reference to CLIENT's `docs/client/f-release.md`, each step in order, linked to the section, not copied.
   - **Owner handover:** "mainnet only, deferred (D-28); on Sepolia the deployer stays owner".
   - **After the deployment:** CLIENT's D-28 measure (`scripts/e2e-sepolia/part-b.mjs`, #376, `latency.json`).
4. **The D-28 measure, contract side:** read `scripts/e2e-sepolia/part-b.mjs` and say whether it records the time from the receipt to ACCEPTED_ON_L2 (or the finality status it waits for). If there is a gap on the contract side, describe it in the PR and in your report. Do not write a second script.

## Runs (VPS)

- scarb and snforge through the shims on PATH only (plain `scarb`, `snforge`). Never prepend `~/.asdf/installs` to PATH or call a binary by its path. At most one Cairo build at a time on the VPS: `deploy.sh` builds, so let the shim lock queue it.
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries to get past the guard.
- starknet-devnet: the direct path `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet` on a free port, stopped by its PID. Devnet keys only.
- `node` on PATH for the signer.
- **Never use or print the `STARKNET_*` variables. Nothing is sent to Sepolia or any public network.** `--estimate-only` runs only in the local rehearsal.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/programme/sepolia-release-day.md` (new), `docs/briefs/sepolia-readiness.md`.
- `scripts/deploy.sh`: only a small, clear script bug found by the rehearsal, with a test-deploy-url.sh case for it.
- Not `contracts/**`, not `contracts/deployments/**` (a rehearsal file goes to a temporary path), not `docs/architecture/**` (the interface audit runs in parallel), not `docs/client/**`.

## PR

- Title: `docs: Sepolia release day, the rehearsal at current main and the checklist (D-27)`.
- Body:
  - the rehearsal's results;
  - the funding estimate;
  - the checklist's outline;
  - the D-28 contract-side finding;
  - one line: documents only, unless a script fix was needed.
- Report: the PR's number and head, every command with its outcome, and anything that failed. Do not merge.
