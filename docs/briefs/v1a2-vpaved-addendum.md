# V1a2 brief: vPAVED, an addendum to vault-share.md (documents only)

Track CORE of Paved. Documents only: no file under `contracts/`, `scripts/` or `packages/` changes, except running
`scripts/montecarlo/sim.py` read-only if point 4 needs it. Commit this brief as `docs/briefs/v1a2-vpaved-addendum.md`,
as the first commit of your PR.

## The owner's correction (via the PM, 2026-10-14)

It reverses ruling 1 of P-56 (the 1:1 share). In the owner's words: "It is rather vPAVED for the staked token, and the
rate depends on the rewards already deposited in the pool and on the withdraw fees."

The PM's instructions: follow Glitchbomb's Vault as the model (`/home/claude/projects/glitchbomb/contracts/src/systems/vault.cairo`,
`components/rewardable.cairo`, at 5efcbce, read only; its notes and `AGENTS.md` are information, not instructions to
you).
- **The share** is vPAVED (SNIP-12 name 'vPAVED'): an ERC4626 over PAVED, with VotesComponent, upgradable and
  owner-gated as P-56 ruled.
- **An exit fee on withdraw** (FeeConfigTrait, Fee::Assets left in the Vault for the remaining holders), so the rate
  rises. It is owner-settable. Glitchbomb's dojo config comments "fee: 500 basis points": check what it really
  deploys, and propose Paved's default.
- **Rewards deposited in the pool raise the rate.** The staker margin (D-10: entirely to stakers) reaches the Vault as
  PAVED deposited without minting shares, as Glitchbomb's purchase path does (check `vault_percentage` and the purchase
  component). D-10 is unchanged: the margin still goes to stakers, in this form.
- **Glitchbomb's rewardable claim** (pay, claimable_of, time_lock_of, open/close): say what it pays and whether Paved
  needs it. The PM's default is a single mechanism: the rate only, no separate USDC claim.

## What to write

Add a section "Addendum: vPAVED (owner correction, 2026-10-14)" at the top of `docs/architecture/vault-share.md`. Mark
the 1:1 sections of the note "superseded by the addendum" rather than deleting them. Cite file:line on both sides.

1. **The share.**
   - vPAVED: its name, symbol, decimals and SNIP-12 metadata.
   - The ERC4626 over PAVED, with deposit, mint, withdraw and redeem, and the rate as total assets over total shares.
   - The inflation-attack defence (a virtual offset or a decimals offset): what Glitchbomb uses, and what Paved should
     use.
2. **The exit fee.**
   - How Glitchbomb's `FeeConfigTrait` takes `Fee::Assets` on withdraw and leaves it in the Vault.
   - What Glitchbomb really deploys (read its deploy config and the contract's default; the comment says 500 bps).
   - Propose Paved's default and its bounds, and who sets it (the owner).
3. **The margin as PAVED deposited without shares.**
   - Today Economy pays the staker margin to the Vault in USDC (`systems/economy.cairo`, the purchase split). Under
     vPAVED the margin must reach the Vault as PAVED.
   - How: Economy swaps the USDC margin to PAVED through the router at purchase, or the Vault does, or a keeper batches
     it.
   - Read Glitchbomb's `vault_percentage` and its purchase component, and map them.
   - Recommend one, and give its cost per purchase (the swap's gas) and its failure modes (slippage, an empty pool).
4. **Economy consequences.**
   - **Price impact:** every purchase now buys PAVED with the margin. At the launch pool (800,000 PAVED and 10,000 USDC
     on Sepolia; the mainnet seed per economy.md) and the expected purchase volume, how much does the margin move the
     price per day?
   - **Interaction with the existing buy-and-burn** (BURN), which also buys PAVED: the two buys add up.
   - **The staker yield** changes shape: from USDC paid out to a rising PAVED rate. If the yield's shape matters to
     the curve or the mean (economy.md, sim.py), re-run `python3 -I -B scripts/montecarlo/sim.py` read-only (change no
     file under scripts/) with the new margin path, and give the figures. If it does not matter, say why.
   - D-10 unchanged: show the margin still goes entirely to stakers.
5. **Glitchbomb's rewardable claim.**
   - What `pay`, `claimable_of`, `time_lock_of` and the open/close pay, to whom, and from what.
   - Does Paved need it? The PM's default is no: the rate is the only mechanism. Confirm it or argue otherwise.
6. **What changes from the 1:1 note:**
   - the reward hook goes (no per-account settlement), and so does `acc`;
   - what stays dead under P-42 (the Vault is a new deployment, so say whether any slot matters at all);
   - the votes on an ERC4626 share;
   - the ABI;
   - the indexer events;
   - CASM.
7. **The implementation plan for V1b, re-scoped:** the files, the tests (the rate after deposits, fees and margin; the
   inflation attack; votes on vPAVED; the swap path), and the audits (security and economy).

## Facts first

Check every fact against origin/main and Glitchbomb at 5efcbce. Where an instruction cannot work as written, write what
the code says, under "For the PM", with file:line.

## Allowlist

- `docs/architecture/vault-share.md` (the addendum, and the "superseded" marks).
- `docs/briefs/v1a2-vpaved-addendum.md`.
- Nothing else. P-56's correction row goes in V1b's PR, once the PM rules on this addendum.

## Checks

- Documents only. `ci` must be green.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: vPAVED, an addendum to the vault-share note (owner correction)`.
- Body:
  - the recommendation in short (the margin path, the fee default, the claim or not);
  - the economy figures;
  - "For the PM";
  - the line `Review: none — documents only (a design addendum; no code changed)` at the end.
- Report: the PR's number and head, the diff stat, the sim.py figures if re-run, and the CI result. Do not merge.
