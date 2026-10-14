# F brief, part B: the fresh Sepolia deployment, the real run

Track CORE of Paved. Sepolia only, with test tokens on the test network: CORE's act (D-16, P-39, P-53). Never mainnet;
the tool refuses SN_MAIN.

## Secrets (absolute)

- `STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY` and `STARKNET_RPC_URL` are used by name only. Never print, log,
  echo or write their values:
  - no `env` or `printenv`;
  - no `set -x`;
  - no value in a file, a commit, a PR or a report.
  No keystore or accounts file is written with the key.
- Presence may be checked by name only: `[ -n "${STARKNET_PRIVATE_KEY:+x}" ] && echo set`.
- If any output you see contains a value, stop and report that, without the value.
- Plain environment: no override and no prefix on `STARKNET_*`. Nothing replaces the variables.

## Context

- F part A merged in #358 (5dbc692): `scripts/deploy.sh sepolia [--check-only] [--out <file>]`. The procedure,
  checks, resume and smoke are in `docs/programme/OPERATIONS.md`, "Fresh Sepolia deployment (F, P-53)". The rehearsal
  is recorded in #358.
- What the run does:
  1. declares, deploys and wires the whole D-19 to D-25 system (Challenge, Setup, Collection, Economy, Vault,
     PavedToken, Faucet, MockRouter);
  2. seeds the MockRouter pool (800,000 PAVED, 10,000 USDC) with the launch rate 7.6e31;
  3. defines the quests.md v1 set on Setup **before** any address is written to the file;
  4. writes the file;
  5. smokes.
- The old `contracts/deployments/sepolia.json` describes the old Sepolia deployment. It stays as it is until this PR,
  which replaces it.
- The endpoint is the owner's `STARKNET_RPC_URL`. If a send fails, stop and report the exact error, redacted.
  **Never switch endpoints.**
- The run spends testnet STRK only, from the D-16 account: within sponsored test fees, no owner act (PM, 2026-10-14).
- After this PR merges, the owner runs one root script: the new indexer release, the rebuild at schema 11, and the
  client release. That script needs this PR's merge commit, which the coordinator reports to the PM. Your report gives
  the PR's head and the run's facts.

## Steps

1. Work in your worktree at merged main (the plugin's base), which includes #358. Record its sha.
2. Read-only checks:
   - the endpoint answers SN_SEPOLIA to `starknet_chainId`;
   - `starknet_specVersion` is 0.10.x. If not, stop and report.
   Pass the URL to curl through its config on stdin, never in argv, and print only the chain id and the spec.
3. Build: `prlimit --as=12884901888 scarb --release build`, from `contracts/`, after `free -g` shows 8 GB or more
   available.
4. **`scripts/deploy.sh sepolia --check-only --out contracts/deployments/sepolia-next.json`** (read-only). It must end
   with "every check passed; nothing was sent". Paste into the PR body:
   - the funding line: the need it measured, and the deployer's balance;
   - the classes to declare;
   - the list of steps.
   If it fails, stop and report.
   **Then stop and report the funding line** (the measured need, the deployer's STRK balance) and the check-only
   output. The PM sees the funding line before the real run. Do not start step 5 until the coordinator prompts
   "Run step 5".
5. **`scripts/deploy.sh sepolia --out contracts/deployments/sepolia-next.json`**. Keep the full output in your terminal
   only. If it stops:
   - **a send failed, or anything failed after a send:** stop at once. Report the step, the tx hash, the deployer
     nonce and the exact error, redacted;
   - **"not landed" (the tool cleared the record):** report it, and do not rerun without the coordinator's word;
   - **a lost answer recovered by receipt (SUCCEEDED):** fine, count it.
   **Never rerun without the coordinator's word.** The tool resumes from the recorded state when it is given.
6. After the run, paste into the PR body, exactly as the tool returned them:
   - every contract's address and class hash;
   - `Economy.router()` against the file's MockRouter, the pool reserves, `quote_swap(1.4 USDC)` and `rate()`;
   - Setup's `wiring()` and its reporter (Challenge);
   - the definitions read back from Setup: 4 quests and the achievements;
   - the smoke lines: the paid spawn, the D-18 build, the game over that reported to Setup, the `claim_tutorial`, and
     `owner()` on every ownable contract;
   - the transaction count and the STRK spent.
7. Then, once more: `scripts/deploy.sh sepolia --check-only --out contracts/deployments/sepolia-next.json` on the
   complete file. It must say a run would send nothing.
8. **Replace the deployment file.** `git mv contracts/deployments/sepolia-next.json contracts/deployments/sepolia.json`
   (overwriting the old file), and commit.
   - Check that it holds no secret: no key, the `rpc_url` the literal `$STARKNET_RPC_URL`, no deployer value. Say so in
     the PR.
   - Show that its keys are one per contract (`Challenge`, `Faucet`, `MockRouter`, `Setup`, ...; no `Daily`,
     `MockUSDC`, `Account` or `Token`).
   - Then run CLIENT's check: `node scripts/client/check-deployment.mjs --file contracts/deployments/sepolia.json` with
     the Sepolia RPC passed as its argument expects. The URL must go through the environment or stdin, never argv: read
     the script first, and if it only takes the URL in argv, do not run it with the real URL; say so. Report the result.
9. Open a PR to main titled `chore: fresh Sepolia deployment at <main sha> (F)`. Its body holds:
   - the check-only output;
   - the reads of step 6;
   - the second check-only;
   - the file's keys;
   - CLIENT's check;
   - the tx count and the spend;
   - one line for the owner's script: "the indexer and client releases are built from this PR's merge commit or
     later".

## Runs

- A run with no progress for 15 minutes is stopped and reported.
- Node heap: as deploy.sh sets it. Do not change `NODE_OPTIONS`.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch. **Never `git rebase`.**

## Allowlist

- `contracts/deployments/sepolia.json` (replaced) and `docs/briefs/f-b-fresh-sepolia-run.md`. Nothing else is
  committed.

## Report

- the PR's number and head;
- the main sha the run was built from;
- the check-only output;
- the reads of step 6;
- the tx hashes, their count and the spend;
- the peaks.
