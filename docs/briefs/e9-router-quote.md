# E-9 brief: on-chain swap quote through the router, proved by a mainnet fork test

Track CORE of Paved. Value-critical: a review and a security audit follow. Commit this brief as
`docs/briefs/e9-router-quote.md`, as the first commit of your PR.

## Context

Read first:
- `docs/architecture/economy.md`, section 5, "Quoting on mainnet (P-35)";
- the gates list near "The route gap (P-39, two mainnet gates)";
- risk E-9;
- "As built: E2", the gate "the mainnet price limit and partial fills are untested";
- `docs/architecture/client-economy.md`, "Known gap: the quoted route is not the route the contract swaps".

In short:
- `Economy` swaps the burn share in one hop through its own pool key: `RouteNode { pool_key, sqrt_ratio_limit,
  skip_ahead: 0 }`, set at construction or by `set_pool`.
- The player's `min_out` is the pool quote minus their slippage of 1 % to 5 % (P-35).
- On devnet and Sepolia, `Economy.quote_swap(usdc_in)` forwards to `MockRouter.quote(token_in, amount_in) -> u128`.
  That shape is not Ekubo's. On mainnet the call fails, so the client quotes through Ekubo's public API, which may
  answer with another route (splits, hops).
- The interim guard is (i): the client refuses any route that is not the single hop through `Economy.pool()`.
- **This task is (ii), the target:** `Economy.quote_swap` quotes on chain through the router's own
  `quote_swap(node: RouteNode, token_amount: TokenAmount) -> Delta`, with the contract's own pool key and limit.
  The quote is then the exact route the purchase swaps through.
- Ekubo's `quote_swap` runs the swap inside core's `lock` with a callback that reverts on purpose, and decodes the
  `Delta` from the revert data. Whether the mainnet router has it, and whether a contract can call it on chain, is
  **unverified**. That is what the fork test proves.
- Local ABI-compatible Ekubo declarations are in `contracts/src/economy/ekubo.cairo` (`IRouter`). The mock is in
  `contracts/src/mocks/router.cairo` (`IMockRouter`).
- Sepolia runs on the mocks (P-39). `Economy` is upgradable (U-1); `MockRouter` is not.

## Goal

1. **Fork test against the Starknet mainnet Ekubo router** (snforge `#[fork]`), read-only. Cover:
   - `quote_swap` exists at the mainnet router address and returns a `Delta` when called from a contract, through
     `Economy.quote_swap` on the fork;
   - the quote equals what the real swap through the same `RouteNode` returns on the fork, for a USDC to X pool that
     exists on mainnet (name it, with its key). Exact, or say the difference and why;
   - **the price limit:** the `sqrt_ratio_limit` that `Economy` passes for its direction, and a swap that reaches it;
   - **a partial fill:** what `Economy.purchase` does when the router fills only part of the input. The rest goes
     back through `clear` to the Vault as margin, as `economy.md` describes. Check the burn share and `R` against the
     text;
   - the quote of an amount that would revert in the swap: what `quote_swap` answers.

   Pin the block (`block_number`) so the test is deterministic. Use a public mainnet RPC that needs no key, and name
   it in the PR. **If every usable endpoint needs a key, stop and report: providing credentials is the owner's act.**
   Never write a URL with a key into any file. Nothing is sent to any network: a fork test only reads.
2. **`Economy.quote_swap` on the router's interface.** Move it to Ekubo's `quote_swap(RouteNode, TokenAmount) ->
   Delta`, built from the stored pool key and limit, and return the PAVED out.
   - `MockRouter` implements the same `quote_swap`, with the same answer as its current `quote` (the devnet
     goldens and fixtures unchanged).
   - Keep the mock's old `quote` only if something still needs it; say what.
   - The public signature of `Economy.quote_swap(usdc_in: u256) -> u256` should not change. If it must, say why:
     it is a published interface that CLIENT reads.
3. **CI.** A fork test hits the network: keep it out of the required `ci` path unless it is fast and stable. Make it
   opt-in (an snforge filter or `#[ignore]`) with one documented command in `docs/programme/OPERATIONS.md`, and say
   so. Unit tests of the mock's `quote_swap` and of `Economy.quote_swap` on devnet run in `ci`.
4. **Sizes.** Run `scripts/class-sizes.sh` before and after. Daily must not change. Stop and report if any class
   passes 90 % of 81,920.
5. **Sepolia path.** Analysis only: nothing is sent. Name what a Sepolia update needs:
   - an `Economy` upgrade;
   - a new `MockRouter` deploy and `set_pool`, or a redeploy;
   - `deploy.sh` changes for a fresh deploy.
   Wire `deploy.sh` for fresh devnet and Sepolia deploys only if the mock's constructor or address flow changes.
6. **Docs.** `economy.md`:
   - mark gate (ii) and the mock-router gate as covered by this test, with the figures;
   - update section 5 and risk E-9;
   - write what CLIENT must change: drop the API quote and the interim guard (i) on mainnet, and call
     `Economy.quote_swap`.
   `client-economy.md` is CLIENT's: do not edit it; put the CLIENT notes in the PR body.

If the mainnet router has no usable `quote_swap`, or a contract cannot call it, stop and report with the evidence.
Gate (i) then stays, and the PM decides the next step.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs: the economy, router, mock and fork tests, the goldens, the gas tests and `class-sizes.sh`. The whole
  suite once, at the end.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. The fork test needs no account.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/economy/{economy,ekubo}.cairo`, `contracts/src/mocks/router.cairo`.
- `contracts/src/tests/**`, `contracts/tests/**` (new tests; existing goldens unchanged).
- `contracts/snfoundry.toml` or `contracts/Scarb.toml`, only for the fork configuration (no key in either).
- `contracts/abis/**`, through `scripts/abis.sh`.
- `scripts/deploy.sh`, only as point 5 says.
- `docs/architecture/economy.md`, `docs/programme/OPERATIONS.md`, `docs/briefs/e9-router-quote.md`.
- Not `scripts/signer/**` (another thread holds it). Not `packages/**`, not `contracts/deployments/**`.

## PR

- Title: `feat: E-9 on-chain swap quote through the Ekubo router, mainnet fork test`.
- Report:
  - the PR's number and head;
  - the router address, the pool, the block and the RPC used;
  - quote against swap, for each amount;
  - the price-limit and partial-fill results;
  - sizes before and after;
  - the ABI diff;
  - the Sepolia path;
  - the notes for CLIENT;
  - the peaks.
- A review and a security audit follow.
