# E-9b brief: two rulings for CLIENT's quote, written into economy.md (documents only)

Track CORE of Paved. Documents only. Commit this brief as `docs/briefs/e9b-client-quote-rulings.md`, as the first
commit of your PR.

## Context

CLIENT's value audit of #310 (the E-9 quote in the client) raised two mainnet gates. CORE ruled on them (orchestrator,
2026-10-12). Write the rulings into `docs/architecture/economy.md`, exactly as below, in "For CLIENT" (the E-9
section) and in the mainnet gates list. Keep the existing text; edit only where needed so that nothing contradicts
the rulings.

## Ruling 1: a sanity floor against the guard rate (audit note 2)

- **Why.** The client's `min_out` comes from `Economy.quote_swap`, a spot quote. A pool pushed before the player
  quotes (someone buys PAVED first) is accepted as it is, and the player's slippage does not catch it: the player's
  burn buys fewer PAVED and their `R` falls.
- **The check.** Let `implied = burn_quote x rate / RATE_SCALE`, where `rate` is the contract's guard rate (the EMA
  of PAVED per USDC that `purchase` uses). Compare the quote with it:
  - `quote_swap(burn_quote) >= 90 % of implied`: no warning;
  - below 90 %: the client **warns and asks for an explicit confirmation**, showing both figures. It does not refuse
    on its own.
- **Why a warning and not a refusal.** The guard rate moves only with purchases: at most about 0.31 % up and 0.28 %
  down per block, weight 1/32. After a genuine rise of the PAVED price with few purchases, the spot quote sits
  honestly below `implied`. A hard refusal would then block every purchase, and since only purchases move the rate,
  the client would never recover by itself.
- **The other direction.** A quote above `implied` (PAVED cheaper, the self-sandwich direction) needs no client
  check: on chain, the guard already caps `R` at `quote x rate x 1.10`.
- **Interaction with the partial-fill effect (E4 backlog).** None that matters:
  - since E-9's fix loop, `quote_swap` reverts on a partial fill, so the client never sends a purchase the pool can
    only partly fill;
  - a partial fill can still happen if the pool moves between the quote and the transaction, but `min_out`, taken
    from a full-fill quote, then makes the purchase revert;
  - each partial fill that does land moves the rate down by one clamped step (about 0.28 %). That lowers `implied`,
    which loosens the floor and never tightens it.
- **Reversal.** E4's calibration, or a measured false-warning rate on mainnet, may move the 90 %. A refusal would
  need an on-chain way to move the rate other than purchases.

## Ruling 2: the router pin (audit note 3)

- **The address to pin on mainnet:** `0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e`.
  - It is Ekubo's "Router V3.0.13", the newest router in Ekubo's published Starknet contract list
    (`EkuboProtocol/docs`, `src/content/docs/reference/contracts/starknet.md`).
  - E-9's fork test proved it at block 16,265,000: it has `quote_swap`, callable from a contract.
  - Router V3.0.3 (`0x04505a9f06f2bd639b6601f37a4dc0908bb70e8e0e0c34b1220827d64f4fc066`, Nums' router) has no
    `quote_swap` and must not be used.
- **The client check.** On mainnet, the client reads `Economy.router()` and refuses to quote or send unless it is
  that address. On devnet and Sepolia it is the mock of the deployment file.
- **No on-chain pin.** Neither a constant in `Economy` nor a `set_router` restricted on mainnet. The reasons:
  - the owner can already `upgrade` Economy, so an on-chain pin binds nobody who could misuse `set_router`;
  - a constant would break devnet and Sepolia, which run on the mocks, or it would need a network flag and more code
    in `Economy`;
  - a future Ekubo router migration would then need an upgrade instead of a `set_router` and a client release.
- **Mainnet gates** (add to the list): the owner's deploy sets this router. The fork tests are re-run, before the
  go, at a recent block **against the router `Economy.router()` will return**. If Ekubo publishes a newer router,
  CORE re-runs the fork against it before any `set_router`, and CLIENT updates the pin in the same release.

## Allowlist

- `docs/architecture/economy.md`, `docs/briefs/e9b-client-quote-rulings.md`. Nothing else.

## Checks

- Documents only. `ci` must be green (the path filters skip the code jobs).
- Read the result once against this brief: every point is there, and nothing in `economy.md` contradicts it.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: E-9b rulings for the client quote (sanity floor, router pin)`.
- Report: the PR's number and head, the diff stat, and the CI result. Do not merge.
