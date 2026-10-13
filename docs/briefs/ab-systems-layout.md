# A+B brief: the systems layout (Token, Vault and Economy into systems/; the Faucet)

Track CORE of Paved. Steps A and B of the D-25 order (P-53), folded into one PR: both are moves over the same test
files. Commit this brief as `docs/briefs/ab-systems-layout.md`, as the first commit of your PR.

## Context

- D-25 and P-53 in `docs/programme/DECISIONS.md`. The gap analysis is `docs/architecture/glitchbomb-gap.md` (#334),
  sections 1, 3, 5 and 7.
- **A: the move.** `contracts/src/economy/token.cairo`, `vault.cairo` and `economy.cairo` go to
  `contracts/src/systems/`.
  - `curve.cairo`, `mean.cairo` and `ekubo.cairo` stay libraries (keep them in `economy/`, or say why another place is
    clearer).
  - No logic change.
  - The contract names (`PavedToken`, `Vault`, `Economy`) stay, so the deploy artifacts keep their names.
- **B: the Faucet.** `contracts/src/mocks/usdc.cairo` (`MockUSDC`) becomes `contracts/src/systems/faucet.cairo`, a
  contract named `Faucet`.
  - Its caps stay as they are.
  - Mainnet is kept out twice:
    1. a chain-id guard in the constructor that refuses SN_MAIN;
    2. `scripts/deploy.sh` refuses to deploy the Faucet on mainnet, by name.
  - Who may mint and how much: as today. Say what that is.

## Constraints

- **No logic change in A.** The tests that move keep their assertions. The class hashes change only through the type
  paths. Say so with the before and after hashes of `PavedToken`, `Vault` and `Economy`.
- **The ABIs.** Run `scripts/abis.sh`. Report the exact ABI diff: type names that now carry `systems::` instead of
  `economy::`, and the Faucet's ABI against MockUSDC's.
  - **If any ABI file changes**, say which ones, and whether a client or indexer decoder matches type names (read
    `packages/**`, read only). CLIENT then follows on this branch, as for D-20b. Push early so CLIENT can start.
- **deploy.sh.**
  - The R-1 repoint (`--repoint`) and D-18c (`--d18`) paths still run against today's
    `contracts/deployments/sepolia.json`, which keys the test USDC as `MockUSDC`. Do not break them: they read that
    key and that class as they are.
  - The fresh deployment (step F) writes the full new path later. Here, change only what the Faucet rename and its
    mainnet refusal need in the fresh-deploy path, plus what CI needs.
  - `scripts/test-deploy-url.sh` must stay green. Add a case: the Faucet is refused on mainnet.
- **Storage (P-42).** Moving a file changes no storage name. Confirm that no `#[storage]` member and no component
  path changes.
- **Gas and sizes.** Run `scripts/class-sizes.sh` before and after. The sizes should be identical, or within a few
  felts from path strings. The gas ceilings must not move; f is at 98.09 % and is watched.

## Tests

- The economy tests (`tests/economy/**`, `tests/e2e/economy.cairo`, `mint.cairo`, `upgrades.cairo`, `setup.cairo`)
  follow the new paths. No assertion changes.
- New Faucet tests:
  - the constructor refuses SN_MAIN (set the chain id with snforge's cheatcode);
  - SN_SEPOLIA and the devnet chain id deploy fine;
  - the mint caps hold, as MockUSDC's tests did.
- The whole suite at the end.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/economy/**`, `contracts/src/systems/**`, `contracts/src/mocks/usdc.cairo`, `contracts/src/lib.cairo`,
  and the `use` lines of every other file under `contracts/src/` that imports a moved module (imports only).
- `contracts/src/tests/**`, `contracts/tests/**`.
- `contracts/abis/**`, through `scripts/abis.sh` only.
- `scripts/deploy.sh`, `scripts/test-deploy-url.sh`: as the constraints above say.
- Docs:
  - `docs/architecture/economy.md`, `glitchbomb-gap.md`, `upgrades.md` and `class-headroom.md`: file paths and the
    Faucet only;
  - `docs/programme/DECISIONS.md`: no change unless the code contradicts P-53;
  - `docs/briefs/ab-systems-layout.md`.
- Not `packages/**` (read only), not `contracts/deployments/**`.

## PR

- Title: `refactor: Token, Vault and Economy into systems/; MockUSDC becomes the Faucet (D-25 A+B)`.
- Body:
  - the moves, file by file;
  - "No logic change": the evidence (tests unchanged, sizes, class hashes before and after);
  - the ABI diff, and whether CLIENT must follow;
  - the Faucet: its guard, its caps and who may mint;
  - deploy.sh: what changed, and that `--repoint` and `--d18` are untouched;
  - one line on the audits: security and economy limited to the move, plus access control on the Faucet's guard and
    mint.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.

