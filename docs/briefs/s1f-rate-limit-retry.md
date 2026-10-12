# S-1f brief: the signer retries rate limits (-32011) on reads, never on add*

Track CORE of Paved. Small task. Commit this brief as `docs/briefs/s1f-rate-limit-retry.md`, as the first commit of
your PR.

## Context

- `scripts/signer/lib/actions.mjs` has `retryingFetch`: a read method of `RETRIED_METHODS` is retried up to 5 attempts
  (waits of `RETRY_DELAYS_MS`, 1/2/4/8 s) while the node answers HTTP 5xx or JSON-RPC -32601. Every other method,
  every `starknet_add*` among them, goes through once. Its tests are in `scripts/signer/test/retry.test.mjs`.
- The public Sepolia endpoint (Zan) can answer JSON-RPC -32011 ("rate limit") under load. Today that ends a read
  with an error, and a deploy stops halfway for nothing.

## Goal

1. A read method of `RETRIED_METHODS` answered with JSON-RPC **-32011**, or with **HTTP 429**, is retried exactly as
   5xx and -32601 are: same attempts, same waits, same stderr line naming the cause. If the answer carries a
   `Retry-After` header of at most 30 seconds, wait that long instead of the scheduled delay. Never longer than 30 s.
2. A `starknet_add*` answered with -32011 or 429 is **never** retried. Say in the PR how it is reported today:
   - whether it goes through the refusal path (`REFUSAL_CODES`, `CHECKED_REFUSALS`, the 30 s receipt check);
   - what the operator reads.
   If a rate-limited add* can end as "not landed" without a receipt check, add -32011 to `CHECKED_REFUSALS` so that
   the 30 s receipt check runs, and test it. Otherwise leave it and say why.
3. README of the signer: the retried causes and the `Retry-After` cap.

## Tests

- `retry.test.mjs`:
  - -32011 on a read, retried, then success;
  - 429 on a read, retried;
  - `Retry-After: 2` honoured, and `Retry-After: 120` capped at the scheduled delay;
  - 5 attempts at most;
  - a `starknet_addInvokeTransaction` answered -32011 or 429 is sent exactly once.
  Use the injected `sleep`: no real waits in the tests.
- The whole signer suite: `node --test` in `scripts/signer` (Node 24).

## Runs (Mac)

- This thread runs on the Mac. Work only in your worktree. Install with `npm ci` in `scripts/signer/` only, never
  globally.
- If `node --version` is below 24, say so and rely on CI's signer job for the run on Node 24.
- No network calls to any real endpoint. The fakes in `test/fixtures/` are enough. Never read or export the
  `STARKNET_*` variables.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/signer/lib/actions.mjs`, `scripts/signer/test/**`, `scripts/signer/README.md`.
- `docs/briefs/s1f-rate-limit-retry.md`.
- Nothing else.

## PR

- Title: `fix: S-1f signer retries rate limits (-32011, 429) on reads, never on add*`.
- Report:
  - the PR's number and head;
  - the add* answer (point 2);
  - the test output (counts);
  - the Node version used.
