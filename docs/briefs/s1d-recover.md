# S-1d: survive a timed-out send, and a funding check sized to what is left (Sepolia deploy)

Track CORE of Paved. Commit this brief as `docs/briefs/s1d-recover.md`, as the first commit of your PR.

## Context
- t-0182 ran `scripts/deploy.sh sepolia` at main e38f73b on dRPC, the endpoint the owner set (keyless, spec 0.10.3).
  - The declare of Daily landed and succeeded: tx 0x79d97c90…e1f, block 16,415,030, fee 35.83 STRK, nonce 0x18f1 → 0x18f2.
  - But dRPC's free plan answered the add* with `30: Request timeout on the free plan, please upgrade to paid plan`. The signer never retries add*, by design, so deploy.sh stopped before Tutorial.
  - Nothing is deployed yet. Account and Daily are declared.
- The balance is about 190.8 STRK (t-0182's arithmetic). deploy.sh's fixed 200 STRK floor now refuses a rerun, although the declares left (Tutorial 36.4, MockUSDC 3.8, PavedToken 4.3, MockRouter 3.1, Vault 3.5, Economy 13.2, Lobby 33.2, Collection 7.7) come to about 105 STRK.
- Tutorial (1.67 MB) and Lobby (1.51 MB) can time out the same way.

## Goal
1. **A send whose answer is lost.** For every add* (declare, deploy, invoke, multicall):
   - the signer computes the transaction hash before sending, from the signed transaction, and prints it to stderr first, with no secret;
   - if the add* call errors (timeout, 5xx, a network error), the signer does NOT resend. It polls `starknet_getTransactionReceipt` for that hash (a read, with the existing retry) for up to 5 minutes;
   - if the receipt shows SUCCEEDED, the command succeeds, with the same output as a normal success;
   - if it shows REVERTED or REJECTED, it fails with that status;
   - if no receipt arrives in time, it fails with "sent, status unknown: <hash>; check it before any rerun", and deploy.sh stops.
   - Tests: a fake node that times out the add* but has the receipt: success, and add* asked exactly once. A fake node with no receipt: failure naming the hash, and add* asked once.
2. **The funding check, sized to the run.**
   - Before the first declare, deploy.sh estimates the classes still undeclared (read-only, as in `--estimate-only`), then requires balance ≥ 1.25 × that sum + a documented margin for the deploys, invokes and smoke (measure it from the devnet rehearsal's fees, or state a figure, e.g. 20 STRK).
   - If an estimate cannot be had after the retries, fall back to the 200 STRK floor.
   - Print the need and the balance, and nothing secret.
   - Tests: a run with most classes declared passes below 200 STRK when the need is lower; a run short of the need stops before sending.
3. **README / OPERATIONS.md:** the recovery rule, and that a rerun after a partial deploy is safe for declares (`declareIfNot`). For deploys, a rerun redeploys with a new salt, so never rerun after a deploy without checking.

## Tests and runs
- The signer `npm test` and `scripts/test-deploy-url.sh` stay green, with the new cases.
- A devnet rehearsal of `deploy.sh sepolia --rehearse` (fresh starknet-devnet 0.10.0 at `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`), end to end. Paste the result in the PR.
- Read-only on Sepolia: `scripts/deploy.sh sepolia --estimate-only`. Paste the need and balance lines in the PR. Do NOT run a real deploy in this task.
- Node: deploy.sh sets NODE_OPTIONS. scarb build: `prlimit --as=12884901888` after `free -g` shows 8 GB or more available. A run with no progress for 15 minutes is stopped and reported.

## Secrets
STARKNET_* by name only. Never print, log or write a value. Check logs for the three values by variable before pasting anything.

## Git
Push the branch the plugin created. Never `git rebase`. If main moves, `git merge origin/main`.

## Allowlist
`scripts/deploy.sh`, `scripts/test-deploy-url.sh`, `scripts/signer/**`, `docs/programme/OPERATIONS.md` (procedure section only, not the RPC note), `docs/briefs/s1d-recover.md`.

## PR
- Title: `feat: S-1d recover a sent transaction whose answer is lost; funding check sized to the run`.
- Report: the PR's number and head, the tests, the rehearsal, the estimate-only need and balance.
- A review and a security audit follow.
