# E-9c brief: two more rulings in economy.md (documents only)

Track CORE of Paved. Documents only. Commit this brief as `docs/briefs/e9c-launch-seed-and-max-burn.md`, as the
first commit of your PR.

Write the two rulings below into `docs/architecture/economy.md`, in "For CLIENT" (E-9 section) and in the mainnet
gates list. Keep the existing text. Edit only so that nothing contradicts the rulings. Before writing, check each
fact you state against `contracts/src/economy/economy.cairo` and `curve.cairo` on main:
- `BASE_PRICE`;
- the `WRONG_PRICE` check in `purchase`;
- `MIN_BURN_BPS` and `MAX_BURN_BPS`;
- `curve::next_rate` when the rate is 0;
- the clamp.
If a fact differs, write what the code says and flag it in the PR body.

## Ruling 3: the first purchase seeds the guard rate (CLIENT's audit of #312, note 4)

CORE, 2026-10-12. A mainnet gate.

- **The issue.** On a fresh deployment the guard rate is 0. The first purchase seeds it from its own swap
  (`curve::next_rate`), with no clamp. At rate 0 the client has no sanity floor to show, so it gives no warning. A pool
  pushed before that first purchase seeds a poisoned rate. The player is still bounded by their own `min_out`. Later
  purchases inherit the rate, and the clamp (10 % per block) takes about 31 blocks per 10 % to correct it.
- **The launch procedure.** One multicall of the owner's account, at launch:
  1. create the Ekubo PAVED/USDC pool;
  2. add the launch LP;
  3. a stake-1 paid `Daily.spawn` by the same account, which makes the first purchase.
  Nothing can move the pool between the LP and the seed, so the rate is seeded at the LP's own ratio (less the pool
  fee and the impact of 1.4 USDC). After it, read `Economy`'s guard rate and check it against the LP ratio. The
  client is opened to players only after that check. This is an owner's act: it is part of the mainnet deploy, with
  real money.
- **The client.** On mainnet, while the guard rate is 0, the client **refuses** every purchase ("not launched"). It
  does not merely skip the warning. On devnet and Sepolia it keeps today's behaviour. There is no deadlock: the
  owner's launch multicall seeds the rate.
- **Not chosen: a seed rate set at deploy** (a constructor argument or setter of `Economy`). It would need a code
  change, a review, an audit and a new owner input, where the multicall needs none.
- **Reversal.** If the launch cannot be one multicall (Ekubo's pool creation or the LP call cannot be batched with
  the spawn), a seed-rate argument at deploy is reconsidered.

## Ruling 4: no `max_burn` on spawn (CLIENT's audit of #310 notes)

CORE, 2026-10-12. Not a mainnet gate.

- **The player's USDC is already bound.** The price is `stake x BASE_PRICE`, a constant 2 USDC, checked on chain
  (`purchase` asserts it, `WRONG_PRICE`), and the player approves exactly that.
- **`burn_bps`** (bounded 5,000 to 9,000) only splits that fixed price between the swap and the Vault margin:
  - lowered between the client's read and inclusion: the swap buys less, falls below `min_out` and reverts. The
    player loses only the network fee;
  - raised: more PAVED is bought and `R` rises (the guard's cap grows with the quote). The player gets more than
    they confirmed, not less. The cost falls on the stakers' margin, which is the owner's act.
- **Cost of a `max_burn`:** it would change `Daily`'s published ABI, and `Daily` is at its P-44 cap (72,947 felts,
  no headroom).
- **For CLIENT:** show the burn share as "at today's terms".
- **Reversal:** if the price stops being a constant (a configurable `BASE_PRICE` or entry price), a maximum price on
  spawn becomes a mainnet gate.

## Allowlist

- `docs/architecture/economy.md`, `docs/briefs/e9c-launch-seed-and-max-burn.md`. Nothing else.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: E-9c rulings (launch seed of the guard rate, no max_burn)`.
- Report: the PR's number and head, the diff stat, each fact checked against the code (with file:line), and the CI
  result. Do not merge.

