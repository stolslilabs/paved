# S-1c: a read-only estimate mode for the Sepolia deploy (diagnose -32603)

Track CORE of Paved. Commit this brief as `docs/briefs/s1c-estimate.md`, as the first commit of your PR.

## Context
- `scripts/deploy.sh sepolia` stops at the fee estimate of Daily's declare. Two endpoints gave the same error, `-32603: Internal error: undefined`: Cartridge at spec 0.9.0 (t-0176) and Cartridge `rpc/v0_10` at spec 0.10.2 (t-0177).
- Account's declare (90 KB) went through on an earlier provider. Daily's declare body is about 1.8 MB; its class is 2,033,605 bytes and 72,947 CASM felts.
- The same flow passes on starknet-devnet 0.10.0 (`--rehearse`, rc 0, smoke ok).
- We do not know whether the failure depends on size, on the class, or on our request (zero resource bounds, tip 0x5f5e100, SKIP_VALIDATE, block_id latest).
- The STARKNET_* variables in the VPS environment are the funded account and the RPC the owner set (D-16). Use them by name only, and never print a value.

## Goal
1. **Signer:** add an `estimate` subcommand to scripts/signer. It takes the same arguments as declare, deploy and invoke, and calls estimateFee only. It never sends: test that no add*Transaction method is reached. It prints one JSON line with the estimate, or the node's full error, sanitised. On failure, keep the full JSON-RPC error object (code, message and data), not starknet.js's "undefined" formatting.
2. **deploy.sh:** add `sepolia --estimate-only`. It runs every check, then estimates each declare in deploy order, with the class size of each, and prints one line per class: the estimate, or the error with its data. It sends nothing. Test in test-deploy-url.sh that it reaches no add* method (use the node shim).
3. **Diagnostics,** in the same estimate mode, behind flags documented as diagnostic only:
   - estimate with explicit non-zero resource bounds instead of zero (`--bounds <l1,l1data,l2 max amounts and prices>`);
   - estimate without SKIP_VALIDATE;
   - estimate at block_id pending or pre_confirmed if the spec allows it.
4. **Run it** (read-only) on the VPS against the current STARKNET_RPC_URL, after the build. Report per class: size, result and error data, for the default request and for each diagnostic variant. Then say what the threshold or cause looks like.
5. **Signer fallback flag (do not use it here):** `--max-fee-bounds` on declare, which skips the estimate and sends explicit bounds, refused unless given explicitly. Write it only if the diagnosis shows the estimate is the sole problem, and say so. Using it on Sepolia is a later step, after review.

## Tests and runs
- The signer unit tests (`npm test` in scripts/signer) and `scripts/test-deploy-url.sh` stay green, with new cases for `estimate` and `--estimate-only`.
- A devnet rehearsal of `--estimate-only` (a fresh starknet-devnet 0.10.0 at `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`) prints an estimate for every class. Paste its output into the PR.
- The Sepolia estimate-only run's output (redacted by the script) goes into the PR body.
- Node: deploy.sh sets NODE_OPTIONS itself. scarb build: `prlimit --as=12884901888`, after `free -g` shows 8 GB or more available.
- A run with no progress for 15 minutes is stopped and reported.

## Secrets
- STARKNET_* by name only. Never print, log or write a value. The deploy log is checked for the three values (by variable, not printed) before anything is pasted.

## Git
- Push the branch the plugin created. Do not create or rename one. Never `git rebase`. If main moves, `git merge origin/main`.

## Allowlist
- `scripts/deploy.sh`, `scripts/test-deploy-url.sh`, `scripts/signer/**`, `docs/programme/OPERATIONS.md` (the estimate-only procedure), `docs/briefs/s1c-estimate.md`.

## PR
- Title: `feat: S-1c deploy.sh sepolia --estimate-only and signer estimate (diagnose -32603)`.
- Report: the PR number and head, the per-class table from the Sepolia estimate run with each variant, the diagnosis, and whether item 5 was written.
- A review and a security audit follow.
