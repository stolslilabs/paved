# V1b brief: the Vault's share token with votes (P-55, P-56), the implementation

Track CORE of Paved. It holds and pays tokens: a review and two audits follow (security lens, economy lens). Commit
this brief as `docs/briefs/v1b-vault-share-impl.md`, as the first commit of your PR.

## The specification

- `docs/architecture/vault-share.md` (#371, 596808f): the design. Implement it, with the PM's rulings below. Where the
  code shows the note is wrong, follow the code's truth, fix the note in the same PR, and say so under "Spec
  corrections".
- D-27 point 3, P-55 in `docs/programme/DECISIONS.md`.

## The PM's rulings (2026-10-14): record them as P-56

1. **A 1:1 share**, "Staked PAVED" / `stPAVED`, 18 decimals, not ERC4626. Reversed if PAVED income is routed to the
   Vault. Mark P-31's ERC4626 clause (`economy.md:570-571`, and its DECISIONS row) "replaced by P-56".
2. **The new Vault is upgradable** (D-17, P-42): OpenZeppelin Upgradeable, gated by the two-step Ownable, with the
   deployer as owner, as for the other four.
   - Why: its reward path is new and has never run in production, and the owner wants an owner-controlled version
     first (D-27), so a fix must not need a migration of stakes.
   - Add it to `docs/architecture/upgrade-owner.md` as a fifth owned contract, with its owner powers: `upgrade` only,
     unless you add another owner entry point, which you must justify.
   - Reversed if the DAO takes ownership, or if the owner asks for an immutable Vault.
3. **Stranded USDC is accepted for now.** USDC earned by shares held by contracts that cannot call `claim` stays
   there. Say so in the docs (vault-share.md, economy.md) and in the share's description (its doc comment, and
   public-interface.md).
4. Glitchbomb's reward path has never run in production: a reason for the audits.

Add the P-56 row (who "PM", date 2026-10-14; reversal as above, per point).

## What to build (from the note)

1. **`systems/vault.cairo`** becomes an ERC20 share contract.
   - OpenZeppelin `ERC20Component` (name "Staked PAVED", symbol `stPAVED`, 18 decimals).
   - `VotesComponent`, with a timestamp clock (`ERC6372TimestampClock`), `NoncesComponent` and SNIP-12 metadata, as the
     note says.
   - `OwnableComponent` (two-step) and `UpgradeableComponent`; the constructor takes the owner.
   - `stake(amount)` takes PAVED and mints shares 1:1; `unstake(amount)` burns shares and returns PAVED 1:1; `claim()`
     pays the caller's settled USDC.
   - **The reward hook:** in the ERC20 `before_update`, `sync()` then `settle(from)` and `settle(to)` while the balances
     are still the old ones. Skip the zero address. Refuse the Vault itself as a recipient. In `after_update`,
     `transfer_voting_units`.
   - The existing views (`pending`, `staked` (= the share balance), `total_staked` (= total supply), `acc`,
     `accounted`, `tokens`) keep their meaning; say which become aliases.
   - Events: the ERC20 `Transfer` and `Approval`, the votes events, plus today's `Staked`, `Unstaked`, `Claimed` and
     `Distributed`, unchanged in layout.
2. **Economy** pays the margin to the Vault as today. Check nothing in Economy reads Vault state that changes meaning.
3. **deploy.sh's fresh path** deploys the new Vault with the deployer as owner. The devnet path too. `--upgrade-challenge`
   is untouched. Regenerate `devnet.json`.

## Tests

- **The reward invariant across transfers.** For random sequences of stake, unstake, transfer, transferFrom, income
  arrivals and claims among several accounts: the USDC paid plus the USDC pending equals the income, to within the
  rounding dust the note bounds. Write it as a fuzz test or many seeded sequences.
- Explicit cases:
  - a transfer settles both sides;
  - a transfer to the Vault reverts;
  - a transfer to and from a contract;
  - mint and burn;
  - a claim after transfers;
  - shares held by a contract that never claims (the stranded USDC stays, and no one else gains it).
- **Votes:** delegation (self and other), checkpoints after stake, unstake and transfer, `get_past_votes` and
  `get_past_total_supply` at past timestamps, delegation by signature with a nonce.
- **Ownership and upgrade:** owner-only upgrade, the two-step transfer, an upgrade that keeps balances and `acc`, and
  P-42 storage pins for the new layout.
- Economy end to end: a purchase sends the margin to the Vault, which distributes it to holders by share.
- Goldens unchanged. Gas: stake, unstake, transfer, claim, and a purchase (the margin transfer), before and after.
- ABIs: `scripts/abis.sh`. The Vault's ABI gains the ERC20, votes, ownable and upgrade entry points. CLIENT follows
  on this branch (the pattern).
- CASM: the Vault's size.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first (vault, economy, the fuzz test), then the whole suite once.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.
- For `scripts/test-deploy-url.sh`, put Node 24's binary first on `PATH`.

## Git

- **Push the branch right after the brief commit**: CLIENT builds on it.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`, `contracts/Scarb.toml` (the `openzeppelin_governance` dependency, pinned
  as the note says), and `contracts/abis/**` through `scripts/abis.sh`.
- `contracts/deployments/devnet.json` (regenerated).
- `scripts/deploy.sh` (the fresh and devnet paths), `scripts/test-deploy-url.sh`, `scripts/check-artifact-names.sh`.
- Docs:
  - `docs/architecture/vault-share.md` ("As built");
  - `upgrade-owner.md` (the fifth owned contract);
  - `economy.md` (P-31's clause, stranded USDC);
  - `public-interface.md` (the Vault's new ABI);
  - `upgrades.md` (the Vault's pins);
  - `docs/programme/DECISIONS.md` (P-56, and P-31 marked);
  - `class-headroom.md`, `docs/measures/baseline.md`.
- `docs/briefs/v1b-vault-share-impl.md`.
- Not `packages/**`, not `contracts/deployments/sepolia.json`.

## PR

- Title: `feat: V1b, the Vault's stPAVED share with votes, upgradable (P-55, P-56)`.
- Body:
  - the interface;
  - the hook and the invariant, with the test's evidence;
  - votes;
  - ownership and upgrade;
  - the ABI diff;
  - gas and sizes;
  - "Spec corrections";
  - "For CLIENT": the Vault's new ABI, events, and devnet.json;
  - one line on the audits: security and economy, since it holds and pays tokens.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.

