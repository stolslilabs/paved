# S-1e: why did "sending" print twice for one declare? (Sepolia deploy, after S-1d)

Track CORE of Paved. Commit this brief as `docs/briefs/s1e-double-send.md`, as the first commit of your PR, if a PR follows.

## Context
t-0182 ran `scripts/deploy.sh sepolia` at main ddbf5c5 (S-1d, #301) on dRPC. Tutorial's declare stopped with this log (no secret in it):
```
   signer: sending starknet_addDeclareTransaction, transaction 0x444226c6…1c9
deploy.sh: signer declare failed: .json
signer: starknet_getNonce failed (HTTP 400), attempt 1 of 5; retrying
signer: sending starknet_addDeclareTransaction, transaction 0x444226c6…1c9
signer: refused starknet_addDeclareTransaction (HTTP 400, JSON-RPC error -32601: …); not sending it again: reading the receipt of 0x444226c6…1c9 for 30 s, every 15 s
signer: starknet_getTransactionReceipt failed (HTTP 400), attempt 1 of 5; retrying
signer: starknet_getTransactionStatus failed (HTTP 400), attempt 1 of 5; retrying
signer: refused (-32601); no receipt for 0x444226c6…1c9 after 30 s; check it before any rerun
deploy.sh: declare Tutorial failed
```
- The nonce stayed 0x18f2, and the class is not declared.
- The rule since S-1d is that an add* is sent once, never again.
- The "sending" line appears twice for the same hash, and `deploy.sh: signer declare failed: .json` sits between them.

## Goal
1. **Find out, from the code and with tests, whether the signer sent the add* twice, and why.** Candidates:
   - deploy.sh's streamed stderr (`stream_sending`) echoing a line twice, or out of order;
   - the full failure output re-printing the earlier lines;
   - starknet.js calling the add* twice (declareIfNot, or an internal retry);
   - deploy.sh calling the signer twice.
   Reproduce it with the fake node: one add* answered -32601, then reads answered -32601. Count the add* requests the node receives.
2. **If it is a real second send:** fix it so the node receives exactly one add* per signed transaction on every path, and add a test that counts the requests.
3. **If it is only output:** fix the duplication, and the truncated `failed: .json` message, so the log shows each send once and the failure line in full.
4. **Make the recovery for a refusal with no receipt say what was read:** the nonce after, and whether the class or contract exists. A refused add* whose nonce has not moved and whose class is absent can then be reported as "not landed (nonce unchanged, class absent)", while still stopping the run.

## Tests and runs
- The signer `npm test` and `scripts/test-deploy-url.sh` green, with the new counting test.
- A devnet rehearsal (`deploy.sh sepolia --rehearse` on a fresh starknet-devnet 0.10.0 at `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`). Paste its result in the PR.
- No Sepolia send in this task.

## Secrets
STARKNET_* by name only. Never print, log or write a value.

## Git
Push the branch the plugin created. Never `git rebase`. If main moves, `git merge origin/main`.

## Allowlist
`scripts/deploy.sh`, `scripts/test-deploy-url.sh`, `scripts/signer/**`, `docs/briefs/s1e-double-send.md`.

## PR
- Title: `fix: S-1e one add* per signed transaction; full failure line` (or `test:` if there was no second send).
- Report: the diagnosis with evidence (the request count), the fix, and the tests.
- A review and a security audit follow.
