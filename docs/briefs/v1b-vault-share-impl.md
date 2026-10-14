# V1b brief (re-scoped): vPAVED, the Vault as an ERC4626 share with votes, and the margin as PAVED

Track CORE of Paved. **This replaces your earlier V1b brief** (the 1:1 stPAVED share), which the owner reversed. It
holds and pays tokens, so a review and two audits follow (security lens, economy lens). Commit this text as
`docs/briefs/v1b-vault-share-impl.md`, replacing the old brief's content, as a commit on your branch. Reuse what you
built (the ERC20, votes, Ownable two-step, Upgradeable, the dependency) where it fits; drop the 1:1 reward hook.

## The specification

- `docs/architecture/vault-share.md`, the section "Addendum: vPAVED (owner correction, 2026-10-14)" (#372, 22967ee).
  The 1:1 sections below it are superseded. Implement the addendum, with the PM's rulings below. Where the code shows
  the addendum is wrong, follow the code's truth, fix the note in the same PR, and say so under "Spec corrections".

## The PM's rulings (2026-10-14): record them as P-56 (corrected)

Write the P-56 row with every point below, and say it corrects P-55/P-56's 1:1 ruling 1 (the owner's correction).
1. **The share:** vPAVED, an OpenZeppelin ERC4626 over PAVED, 18 decimals, SNIP-12 'vPAVED'. It has VotesComponent
   (timestamp clock, Nonces, SNIP-12 delegation), the two-step Ownable and Upgradeable, with the deployer as owner.
2. **The inflation defence:** decimals offset 0. 1,000 PAVED of dead shares are minted to the Vault before
   Economy.set_game. A deposit that would mint zero shares reverts.
3. **The exit fee:** Fee::Assets on both withdraw and redeem, left in the Vault for the remaining holders, with
   max_withdraw and max_redeem correct (a withdraw limit). Default 100 bps, bounds 0 to 500, owner-set, with an event.
   **Do not copy Glitchbomb's bugs** (#372 lists them: its redeem burns Fee::Shares, its withdraw and redeem formulas
   are swapped, and its max_withdraw ignores the fee).
4. **The margin path:** in Economy's purchase, one swap of the burn quote plus the margin. The burn's share is burned;
   the margin's PAVED goes to the Vault by a plain transfer, with no shares minted, so the rate rises. A partial fill
   reverts. D-10 holds: the whole margin goes to stakers, as PAVED.
   - The 5 % pool fee on that swap (about 1.4 % of each price, to the team's LP position) is the owner's call on D-10.
     The PM has asked, recommending to accept. Build it as designed; if the owner refuses, the margin path changes in
     a follow-up.
5. **No rewardable claim:** the rate is the only mechanism. The USDC claim, `acc` and the per-account settlement go.
6. **RISKS.md:** add, as information, that the Vault absorbs about two thirds of the supply in a year at 200 games a
   day (#372's sim.py figures), which thins the pool's float. It feeds E4 and P-46.
7. Mark P-31's ERC4626 clause (economy.md:570-571) as "realised by P-56 (vPAVED)" rather than replaced.
8. The stranded-USDC wording of the old P-56 point 3 no longer applies (no USDC claim): remove it where V1a wrote it,
   or mark it superseded.

## What to build

1. **`systems/vault.cairo`:** the ERC4626 vPAVED as above.
   - `deposit`, `mint`, `withdraw` and `redeem`, with the fee.
   - The rate is `total_assets` over total shares; `total_assets` is the PAVED the Vault holds.
   - The owner-set fee.
   - Events: ERC4626 `Deposit` and `Withdraw`, ERC20 `Transfer` and `Approval`, the votes events, and `FeeSet`.
   - The old `stake`, `unstake`, `claim`, `pending`, `acc` and `accounted` go; say which views remain or map.
2. **`systems/economy.cairo`:** the margin path of point 4, through the router. Keep the burn's behaviour and the
   referral unchanged.
3. **deploy.sh's fresh and devnet paths:** deploy vPAVED with the deployer as owner, mint the 1,000 dead shares before
   `Economy.set_game`, and set the fee to its default. Regenerate devnet.json. `--upgrade-challenge` is untouched.

## Tests

- **The rate:**
  - deposits and redeems at a stable rate;
  - margin transfers raise it;
  - exit fees raise it for the remaining holders;
  - rounding always favours the Vault.
- **The inflation attack:** a first depositor donating PAVED cannot steal a later depositor's deposit, with the dead
  shares in place. A zero-share deposit reverts.
- **The fee:**
  - withdraw and redeem both charge it, as Fee::Assets kept in the Vault;
  - max_withdraw and max_redeem are exact;
  - the owner can set it, within the bounds;
  - non-owners cannot set it.
- **The margin path, end to end:** a purchase swaps once, burns the burn share, and transfers the margin PAVED to the
  Vault. The rate moves by exactly that amount over total shares. A partial fill reverts. The referral is unchanged.
- **Votes:**
  - delegation, and checkpoints after deposit, redeem and transfer;
  - past votes and past total supply;
  - delegation by signature.
- **Ownership and upgrade:**
  - an owner-only upgrade that keeps balances and the rate;
  - the two-step transfer;
  - P-42 pins.
- **Sizes and gas:**
  - goldens unchanged;
  - purchase gas before and after (the margin swap), and deposit, redeem and transfer;
  - every scenario under its ceiling; f is the tightest;
  - CASM of the Vault and of Economy.
- **ABIs:** via scripts/abis.sh. The Vault and Economy ABIs change, so CLIENT follows on this branch.
- **The economy figures:**
  - add a `--margin-paved` (or similar) option to scripts/montecarlo/sim.py that reproduces #372's figures, keeping
    the default output byte-identical;
  - re-run it twice for determinism.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first (vault, economy, router), then the whole suite once.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.
- For `scripts/test-deploy-url.sh`, put Node 24's binary first on `PATH`.

## Git

- **Push your branch now**, with the new brief commit, and then as you go: CLIENT's W1j builds on it.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**` (S1, running in parallel, owns challenge.cairo's expiry and the game view; do not touch
  `systems/challenge.cairo`, `models/game.cairo` or `views.cairo` unless the margin path requires it, and say so).
- `contracts/tests/**`, `contracts/Scarb.toml`, `contracts/abis/**` via abis.sh, `contracts/deployments/devnet.json`.
- Scripts:
  - `scripts/deploy.sh` (fresh and devnet paths), `scripts/test-deploy-url.sh`, `scripts/check-artifact-names.sh`;
  - `scripts/montecarlo/sim.py` (the option only; the default output byte-identical) and `output.md` if regenerated
    identically.
- Docs:
  - `docs/architecture/vault-share.md` ("As built"), `upgrade-owner.md` (the Vault as the fifth owned contract, its
    powers: upgrade and the fee), `economy.md` (the margin path, P-31), `public-interface.md`, `upgrades.md`;
  - `docs/programme/DECISIONS.md` (P-56 corrected, P-31 marked), `docs/programme/RISKS.md` (point 6);
  - `class-headroom.md`, `docs/measures/baseline.md`.
- `docs/briefs/v1b-vault-share-impl.md`.
- Not `packages/**`, not `contracts/deployments/sepolia.json`.

## PR

- Title: `feat: V1b, vPAVED (ERC4626 share with votes and an exit fee), the margin as PAVED (P-56)`.
- Body:
  - the interface;
  - the rate and the fee;
  - the inflation defence;
  - the margin path, with its gas;
  - votes;
  - ownership and upgrade;
  - the ABI diff;
  - sizes and gas;
  - the sim.py figures;
  - "Spec corrections";
  - "For CLIENT";
  - one line on the audits: security and economy, since it holds and pays tokens.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.

## Addendum: the exit fee (owner, via the PM, 2026-10-14)

Default 500 bps (5 % of the amount withdrawn, left in the Vault), owner bounds 0 to 1,000 bps, the same fee on withdraw
and redeem with the correct maths (not Nums' `Fee::Shares` redeem nor its swapped formulas), `max_withdraw` and
`max_redeem` exact. Record with P-56: "exit fee 500 bps by default, owner bounds 0 to 1,000 (owner, 2026-10-14)".
deploy.sh sets 500; the tests cover 0 and 1,000 and refuse 1,001.

## Addendum: the split

Addendum to your V1b brief (PM, 2026-10-14): the price split as owner-set parameters. Add it to your committed brief as "Addendum: the split" and do it in this PR. Finish your current Cairo run first; the build rule (one run at a time, shims only) still holds.

The owner accepted the 5 % Ekubo pool fee as the liquidity provider's part (P-56 point 4: no longer open, record it in the P-56 row). The exact figures are not confirmed yet: DO NOT CHANGE ANY DEFAULT (burn 7,000 bps, referral 500 bps, the Vault the rest).

Today on main: `Config.burn_bps` is owner-set through `configure` (bounds 5,000 to 9,000); `curve::REFERRAL_BPS` = 500 is a constant; the Vault gets the remainder, so the referral already comes out of the Vault's part, not out of the burn.

Build:
1. The Vault share and the burn share are owner-set parameters in bps, set through the owner's bounded, evented configuration path. Enforce burn_bps + vault_bps = 10,000 (the price is split between the two; the Ekubo fee is taken inside the swap, not a share of the split). If you find a cleaner equivalent (vault_bps derived and exposed as a view), justify it in the PR.
2. The referral becomes an owner-set `referral_bps` (default 500), paid out of the Vault share: refuse a configuration where referral_bps > vault_bps. The burn quote never depends on whether there is a referrer: add a test of that.
3. Bounds: keep burn 5,000 to 9,000 unless the design needs otherwise (say so); referral 0 to 1,000.
4. Storage: Config is packed; if its layout changes, update the P-42 pins and upgrades.md, and add an upgrade test that a stored Config reads back with the new fields at their defaults.
5. Tests: the split adds up to the price exactly, with and without a referrer, at the bounds; owner-only; the events; the ABI via abis.sh (CLIENT follows on this branch).
6. In the PR body and economy.md: the split at the defaults, and the split the owner described (burn 80 %, Vault 15 %, Ekubo 5 %; with a referral: Ekubo 5 %, referral 5 %, Vault 10 %), stating exactly what bps reproduce it given that the pool fee is 5 % of the amount swapped (burn quote plus the Vault's margin), so the PM can relay the exact figures to the owner.

Allowlist: as your brief, plus contracts/src/economy/curve.cairo.

### The owner's figures (owner, via the PM, 2026-10-14; replaces point 6 and lifts "keep the defaults")

Shares of the price, the burn counted after the 5 % pool fee: without a referral 70 % burned, 25 % to the Vault, 5 % to
the Ekubo LP; with a referral 70 % burned, 20 % to the Vault, 5 % to the referrer, 5 % to the LP.

1. Set the defaults (burn_bps, the Vault's part, referral_bps 500) to the bps that give these figures as closely as the
   swap allows (the PM's estimate: burn_bps about 7,368). Keep the bounds; deploy.sh's defaults and devnet.json follow.
2. State the exact resulting shares, with and without a referral, with each residual in bps (PR body, economy.md).
3. Re-run sim.py with the final split (the margin-as-PAVED option): the house edge and the Vault's PAVED after a year;
   twice for determinism; the default output byte-identical.
4. Record it in P-56 as an owner decision: the split, the 5 % pool fee accepted as the LP's part, D-10's burn unchanged
   at 70 % of the price after the fee, and the sim figures. Update RISKS.md's Vault-share figure if it changes.
