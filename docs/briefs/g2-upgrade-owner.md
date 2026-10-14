# G2 brief: who owns the upgrades on mainnet (a documents task, no code)

Track CORE of Paved. A docs note for the mainnet gate "upgrade owner" (PM, 2026-10-14). Documents only: no file under
`contracts/`, `scripts/` or `packages/` changes. Commit this brief as `docs/briefs/g2-upgrade-owner.md`, as the first
commit of your PR.

## Context

- D-17 (U-1): the upgradable contracts are gated by the two-step `OwnableComponent`. On Sepolia the owner is the
  deployer account (D-16). The upgradable contracts after D-25 are Economy, Challenge, Setup and Collection; check
  whether Vault, PavedToken and the Faucet are upgradable or owned, and list every owner-gated entry point of each.
- P-42 names the options for mainnet: the owner account, then a multisig or a timelock.
- Read `docs/architecture/upgrades.md`, `docs/programme/DECISIONS.md` (D-16, D-17, P-42, P-53) and the contracts'
  owner checks.

## What to write

One new note, `docs/architecture/upgrade-owner.md`, titled "Mainnet gate: who owns the upgrades". Cite file:line.

1. **What the owner can do today, contract by contract.** For Economy, Challenge, Setup and Collection (and any other
   owned contract), list every owner-only entry point and what it can change:
   - `upgrade` (replace_class);
   - configure (the economy's curve, bounds 1,000 to 50,000);
   - the setters (`set_setup`, `set_economy`, `set_collection`, `set_reporter`, `set_minters`);
   - the definitions.
   Say what a malicious or compromised owner could do with each: steal value, block games, mis-record scores. Name
   what is bounded by the code and what is not.
2. **The options**, each with what it means for those entry points:
   - **the owner account**: one key, as on Sepolia;
   - **a multisig**: for example a Starknet multisig account (M of N), and who holds the keys;
   - **a timelock**: a delay between the scheduling of an owner call and its execution, so players can react to an
     upgrade; on which calls; how long;
   - **combinations**, such as a multisig behind a timelock, or a timelock on `upgrade` only with the setters
     immediate.
   For each, cover:
   - the operational cost: who signs, how an emergency fix ships;
   - the trust it gives players;
   - what it changes in deploy.sh and the D-17 upgrade path;
   - whether the two-step Ownable supports it as it is (transfer to a contract address).
3. **Emergencies.** How a bug fix ships under each option (a timelock delays fixes too). Is a pause or a guardian
   worth it, and on what?
4. **A recommendation**, with what would reverse it. The choice may go to the owner: the PM asks once this note is
   merged. Write the exact sentence the owner would give for each option, so the PM can put them to the owner.

## Facts first

Check each fact against `origin/main`. If a stated option cannot work with the contracts as they are (for example a
contract that cannot be owned by another contract), say so with file:line, under "For the PM".

## Allowlist

- `docs/architecture/upgrade-owner.md` (new).
- `docs/briefs/g2-upgrade-owner.md`.
- Nothing else. Another task changes `contracts/**` and the measures at the same time.

## Checks

- Documents only. `ci` must be green.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: mainnet gate, who owns the upgrades (owner account, multisig, timelock)`.
- Body:
  - the summary;
  - the owner powers in short;
  - the recommendation, with what reverses it;
  - the owner's sentences;
  - "For the PM".
  Add the line `Review: none — documents only (a decision note; no code changed)` at the end of the body.
- Report: the PR's number and head, the diff stat, and the CI result. Do not merge.
