# P-55: the Vault's share token with votes

## Addendum: vPAVED (owner correction, 2026-10-14)

The owner corrected ruling 1 of P-56 (the 1:1 share), relayed by the PM on 2026-10-14: "It is rather vPAVED for the
staked token, and the rate depends on the rewards already deposited in the pool and on the withdraw fees." The PM's
instructions: follow Glitchbomb's Vault; vPAVED is an ERC4626 over PAVED with `VotesComponent`, upgradable and
owner-gated as P-56 ruled; an exit fee left in the Vault; the staker margin reaches the Vault as PAVED deposited
without minting shares (D-10 unchanged); no separate USDC claim unless argued otherwise. Brief:
`docs/briefs/v1a2-vpaved-addendum.md`. This addendum is a design: nothing is built.

The sections after it are the P-55 note as it was. Those that the 1:1 share carried are marked "superseded by the
addendum" and kept as the record. Section 4 (votes) still holds, with the changes in A6.

References are those of the note below: Paved at origin/main `596808f1` (its `contracts/`, `scripts/` and `packages/`
are unchanged since `c52467ca`, where the note was written); `GB:` is Glitchbomb at `5efcbce`, read only;
`OZ:token-4.0.1/…` is `openzeppelin_token` 4.0.1, which Paved pins (`contracts/Scarb.toml:17`). Glitchbomb builds on
`openzeppelin = "3.0.0"` (`GB:Scarb.toml:22`): its lines are read in its own source, and the OpenZeppelin lines below
are those of the version Paved would use. `OZ:governance-4.0.1/…` is `openzeppelin_governance` 4.0.1, read from the
local scarbs.xyz cache.

### As built (V1b, P-56)

The addendum is built, with the owner's two later decisions (2026-10-14) and these corrections.

- **The exit fee: 500 bps by default, owner bounds 0 to 1,000** (owner; A2 proposed 100 and 500).
  - It is `Fee::Assets` on both exits, rounded up: `withdraw` uses `fee_on_raw` (`assets x f` on top) and `redeem`
    uses `fee_on_total` (`v x f / (1 + f)` inside), so both charge `f` of what the holder receives.
  - `LimitConfigTrait::withdraw_limit` is `preview_redeem(balance)`, so `withdraw(max_withdraw)` burns at most the
    balance (tested at an odd rate).
  - The event is `ExitFeeSet { previous, fee }`, as A2 proposed; the brief's shorthand "FeeSet" names this event.
- **The constructor is `(owner, paved, exit_fee)`**, as A7 says, and refuses a fee above the bound.
- **The split is owner-set** (the PM's addendum "the split", the owner's figures):
  - `Config` gains `referral_bps` (0 to 1,000, at most the Vault's part, paid out of it).
  - The Vault's part is `10,000 - burn_bps`, derived and shown by `split_bps()`.
  - The defaults are burn 7,368 and referral 500: 69.996 % of the price burned after the 5 % pool fee, and 25.004 % to
    the Vault, or 20.254 % with a referral.
  - The table with each residual is in `economy.md`, section 4.
- **The swap's input is Economy's whole USDC balance after the referral**: the burn quote, the Vault's part, and any
  USDC sent to `Economy` before. A3 says "quote + margin". Today's code already sends such strays to the Vault with the
  margin; swapping them sends them on, and they count with the Vault's part of the split. One correction (security
  audit note 1 of #382): the router's own stray USDC, returned by `clear(usdc)` after the swap, now waits in `Economy`
  for the next purchase's margin. `Economy` does not hold "nothing" after a purchase.
  - `min_out` bounds the whole swap.
  - The full-fill check reads the swap's own USDC leg (`'Economy: partial fill'`).
- **`Quote.min_out_hint`** now estimates a referred purchase's whole swap (`price - referral`), not the burn quote.
- **One swap, split by input, is not sim.py's model** (A4 swaps the margin after the burn).
  - The burn's part gets the average price of the one swap, a little below the first swap's. The contract's R and
    guard are therefore lower than sim.py's by one swap's extra impact.
  - `fixture.py --margin-paved` models the contract's way, and `test_fixture_matches_sim` checks it.
  - `sim.py --margin-paved` reproduced A4 to the digit with A4's two swaps. Since fix loop 1 of #382 it models the
    contract's one swap instead. The year figures move by 52 to 105 PAVED and 0.1 point of house edge at most
    (`economy.md`, section 4).
- **Votes.** The dead shares are held by the Vault and never delegated. `get_past_total_supply` counts them, as A6
  says.
- **The fork tests.** Their two partial-fill purchases now expect the revert. No fork test runs a full purchase: the
  fork reads a public RPC, which this PR does not run.

### Summary

- **The share**: "Vault PAVED", `vPAVED`, 18 decimals, SNIP-12 name `'vPAVED'`. It is an OpenZeppelin ERC4626 over
  PAVED with `deposit`, `mint`, `withdraw` and `redeem`. The rate is `(total_assets + 1) / (total_supply + 1)`, where
  `total_assets` is the Vault's own PAVED balance.
- **The inflation defence**: OpenZeppelin's virtual offset at 0, as Glitchbomb uses it, plus 1,000 PAVED of dead shares
  minted to the Vault itself at deployment, before Economy is wired. Deposits that would mint zero shares revert.
- **The exit fee**: `Fee::Assets` on both `withdraw` and `redeem`, left in the Vault, so the rate rises for those who
  stay. Proposed default **100 bps (1 %)**, bounded to **at most 500 bps**, set by the owner (`set_exit_fee`, evented).
  Glitchbomb's comment says 500 bps, but it deploys **0** in all four of its deployment files. Its redeem takes
  `Fee::Shares` (burned), not assets, and its `max_withdraw` ignores the fee.
- **The margin as PAVED**: Economy runs **one swap** of the burn quote plus the margin at purchase. It burns the burn's
  pro-rata part of the PAVED and sends the rest to the Vault by a plain `transfer`: no `pay`, no role, no share
  minted. A partial fill reverts the purchase. Its cost against today is about one call, an estimate: a PAVED
  `transfer` to the Vault replaces today's USDC one, and the swap is the one that already runs. **This is not
  Glitchbomb's purchase path**: Glitchbomb pays the Vault in USDC, through `pay`, into its rewardable claim ("For the
  PM", item 1).
- **Economy figures** (`sim.py`'s own code, run read-only with the margin swapped; A4):
  - The margin adds 39 % to the PAVED bought per purchase. At the launch pool and 200 games a day, one day's buys
    alone move the price by +26.9 % instead of +19.0 %.
  - The house edge moves from 36.6 % to 37.4 % (option B), and the curve and the mean are untouched.
  - After a year at 200 games a day, the Vault holds 653k PAVED and the pool 50k PAVED (316k with today's USDC
    margin). The model has no outside trader, so this is not a forecast.
- **No rewardable claim**: Glitchbomb's `pay`, `claimable_of`, `time_lock_of`, `open` and `close` pay USDC that no
  deployment of Glitchbomb ever sends (`vault_percentage` 0). Paved keeps the rate as its only mechanism: the PM's
  default is confirmed.
- **What goes from the 1:1 design**: `acc`, `accounted`, `snapshots`, `owed`, `claim`, `pending`, the settling hook and
  the stranded USDC of contract holders. The votes stay, counted in vPAVED.

### A1. The share

| Property | vPAVED | Source |
|---|---|---|
| Name | `Vault PAVED` | Glitchbomb's is `GLITCH (Vault)` (`GB:contracts/src/systems/vault.cairo:153`); `Vault PAVED` reads the same way |
| Symbol | `vPAVED` | The owner's word. `economy.md:570` already names it |
| Decimals | 18: PAVED's 18 (`contracts/src/systems/token.cairo:15`) plus an offset of 0 | `ERC4626MetadataImpl::decimals` returns `UNDERLYING_DECIMALS + DECIMALS_OFFSET` (`OZ:token-4.0.1/src/erc20/extensions/erc4626/erc4626.cairo:668-670`); `DefaultConfig` gives 18 and 0 (`:949-952`, `:48-49`) |
| SNIP-12 metadata | name `'vPAVED'`, version `'1'` | `delegate_by_sig` signs against it. Glitchbomb: `'vGLITCH'`, `'1.0.0'` (`GB:contracts/src/systems/vault.cairo:183-190`) |

**The ERC4626.** It is `ERC4626Component` over the PAVED address, with `ERC4626SelfAssetsManagement`, so the assets are
the Vault's own PAVED balance (`OZ:…/erc4626.cairo:913-920`), as Glitchbomb wires it
(`GB:contracts/src/systems/vault.cairo:46-48`, `:157`). The four entry points:

| Entry | The caller gives | What moves | Rounding |
|---|---|---|---|
| `deposit(assets, receiver)` | exactly `assets` PAVED | mints `assets × (S + 1) / (A + 1)` shares to `receiver` | down, for the Vault (`:713-728`) |
| `mint(shares, receiver)` | the PAVED that exactly `shares` cost | pulls `shares × (A + 1) / (S + 1)` PAVED | up (`:730-745`) |
| `withdraw(assets, receiver, owner)` | exactly `assets` PAVED out | burns the shares that `assets` plus the fee cost | up (`:747-762`, `:825-857`) |
| `redeem(shares, receiver, owner)` | exactly `shares` burned | sends their PAVED less the fee | down (`:764-778`) |

Here `A` is `total_assets` and `S` is `total_supply`. **The rate** (PAVED per vPAVED) is `(A + 1) / (S + 10^offset)`,
the two conversions of `OZ:…/erc4626.cairo:860-888`; with offset 0 that is `(A + 1) / (S + 1)`. A deposit or a redeem
leaves the rate unchanged, up to rounding, which favours the Vault. Only three things raise it: PAVED reaching the
Vault without shares (the margin, A3, or a donation); the exit fee (A2); and that rounding.

The views come with it: `asset`, `total_assets`, `convert_to_shares`, `convert_to_assets`, the four `max_*` and the
four `preview_*`. The ERC20 share is the same component as in section 1 below (transfers, approvals), and its votes
are A6.

**The inflation defence.** The attack: the first depositor mints one share, then sends PAVED straight to the Vault, so
that a victim's deposit rounds down to zero or to very few shares.

- **What Glitchbomb uses**: the `DefaultConfig`, offset 0 (`GB:contracts/src/systems/vault.cairo:47`), and nothing
  else. OpenZeppelin's virtual share and asset (`+ 10^offset`, `+ 1`, `OZ:…/erc4626.cairo:866-870`, `:882-886`) make
  the attack lose money at offset 0. The donated value is shared with the virtual share, which captures about what
  the attacker hopes to take (`:20-33`). It still lets a victim receive 0 shares: `_deposit` mints whatever the preview
  gives, 0 included (`:790-811`).
- **Paved's case is sharper than a plain attack.** The margin reaches the Vault as PAVED with every purchase (A3).
  - If the supply ever falls to 0 while purchases go on, PAVED piles up with no shares.
  - The next depositor then gets `assets × 1 / (A + 1)` shares, which is 0 for any deposit below `A + 1`. Their PAVED
    joins the pile.
  - The depositor who first gets shares takes nearly all of it.
  - No one needs to attack: the purchases alone build the pile.
- **What Paved should use**:
  1. **offset 0**, so that vPAVED keeps PAVED's 18 decimals and starts at 1 PAVED per share. The votes then count in
     units the size of PAVED's.
  2. **Dead shares**: at deployment, before `Economy.set_game` makes any purchase possible, `deploy.sh` deposits
     **1,000 PAVED with the Vault itself as the receiver**. Nothing can redeem those shares, since only their holder
     can, and the Vault has no entry point that does. They are never delegated, so they never vote. Uniswap v2's
     minimum liquidity does the same. The supply can then never fall back to 0, and the virtual offset's analysis
     holds with 1,000 PAVED of real shares behind it.
  3. **Zero shares refused**: a `before_deposit` hook that asserts `shares > 0`, which costs one comparison.

  The owner's stake follows the dead shares as now (`scripts/deploy.sh:2676-2689`, "the Vault never has zero stakers").
  It no longer carries the defence, since the owner may redeem it.

  What reverses it: the PM prefers a decimals offset. An offset of 6 makes the attack about a million times more
  expensive, but shows vPAVED with 24 decimals, and a Governor's quorum would count in those units.

### A2. The exit fee

**How Glitchbomb takes it.**

- `FeeConfigTrait` (`OZ:…/erc4626.cairo:147-195`) returns a fee that the component folds into the preview. The
  contract moves it in its hooks (`:171-175`).
- Glitchbomb's `calculate_withdraw_fee` returns `Fee::Assets(fee_on_total(assets, exit_fee))`
  (`GB:contracts/src/systems/vault.cairo:398-406`). Its `before_withdraw` does nothing with `Fee::Assets`, by comment:
  "leave the assets in the contract to distribute to share holders" (`:222-227`).
- The component burns the shares that `assets + fee` cost and sends out only `assets` (`OZ:…/erc4626.cairo:747-762`,
  `:838-850`). The fee therefore stays in `total_assets`, and the rate of those who stay rises.
- **Redeem is different**: `calculate_redeem_fee` returns `Fee::Shares(fee_on_raw(shares, exit_fee))`
  (`GB:contracts/src/systems/vault.cairo:407-415`), and `before_withdraw` burns those fee shares from the owner
  (`:228-233`). Fewer shares then hold the same PAVED, which also raises the rate. It is a share burn, not assets left
  behind.
- **The two formulas are swapped** against their own comments. `fee_on_raw` says "used in mint and withdraw" and
  `fee_on_total` "used in deposit and redeem" (`:427-440`), but withdraw uses `fee_on_total` and redeem uses
  `fee_on_raw`.
  - With a fee `f`, a withdraw charges `f / (1 + 2f)` of what leaves the holder (4.55 % at 500 bps), while a redeem
    charges `f` (5 %).
  - A holder who knows this withdraws instead of redeeming.
- **`max_withdraw` ignores the fee.** Glitchbomb uses `ERC4626DefaultNoLimits` (`:47`), and `max_withdraw` converts the
  owner's whole balance (`OZ:…/erc4626.cairo:534-549`). With a fee above 0, `withdraw(max_withdraw(owner))` needs more
  shares than the owner holds and reverts in the burn.
- **The fee setter**: `set_fee` is `COLLECTOR_ROLE` only (`GB:contracts/src/systems/vault.cairo:319-325`). It is bounded
  at 10,000 bps, 100 % (`GB:contracts/src/models/vault.cairo:27-31`): the role can take every exit whole.

**What Glitchbomb deploys.**

- Every deployment file passes `fee = 0x0` to the Vault's `dojo_init(open, fee)`
  (`GB:contracts/src/systems/vault.cairo:151`), under the comment "fee: 500 basis points": `GB:dojo_mainnet.toml:34-37`
  (the value at `:36`), `GB:dojo_sepolia.toml:40-43`, `GB:dojo_cartridge.toml:34-37` and `GB:dojo_appchain.toml:40-43`.
- The contract has no default of its own: `VaultTrait::new` stores the fee it is given
  (`GB:contracts/src/models/vault.cairo:11-13`).
- So Glitchbomb's live exit fee is **0**, unless a collector has called `set_fee` since, which the repository cannot
  show. The 500 bps is a comment, not a deployment.

**Paved's proposal.**

| Point | Proposal | Why |
|---|---|---|
| Kind | `Fee::Assets` on both withdraw and redeem, left in the Vault (an empty `before_withdraw` for it) | One mechanism, the one the owner described ("the rate depends … on the withdraw fees"); no share burn moving the votes' total supply checkpoint twice |
| Formulas | withdraw `fee_on_raw(assets)` (the fee on top of the assets asked), redeem `fee_on_total(assets)` (the fee inside the shares' value), both rounded up | The pairing OpenZeppelin's comments give (`GB:…/vault.cairo:427-440` repeats them); withdraw and redeem then charge the same `f` |
| `max_withdraw` | `LimitConfigTrait::withdraw_limit` returns `preview_redeem(balance_of(owner))` (`OZ:…/erc4626.cairo:221`) | So that `withdraw(max_withdraw(owner))` works with a fee |
| Default | **100 bps (1 %)** | The owner wants the fee to feed the rate. A deposit made just before one purchase and redeemed just after earns that purchase's margin pro rata, under 2 USDC of value for the whole Vault (A4), so any fee above 0 makes such a round trip lose. Beyond that, a fee only taxes ordinary leaving: 1 % is felt, not punitive |
| Bounds | 0 to **500 bps** inclusive, checked in `set_exit_fee` | 500 is Glitchbomb's stated intent; a ceiling keeps the owner's key from trapping stakers (Glitchbomb's allows 100 %). 0 is allowed |
| Who sets it | the owner (`OwnableComponent`, two-step, as `Economy`, `contracts/src/systems/economy.cairo:907-912`), `set_exit_fee(bps)`, event `ExitFeeSet { previous, fee }` | P-56: owner-gated. The constructor takes the initial fee under the same bound |
| Deposits | no entry fee | The owner named only the withdraw fee |

The fee applies to every exit, the owner's own stake included, and it does not touch transfers: a holder may sell
vPAVED instead of redeeming, at whatever price a buyer pays. What reverses it: the PM picks another default or
ceiling. Both are constants of the class, and the default is also the constructor's argument.

### A3. The margin as PAVED deposited without shares

**Today.** `purchase` pays the referral out of the margin, then swaps the burn quote and burns all the PAVED that
`Economy` holds (`contracts/src/systems/economy.cairo:618-631`). It then sends the margin, with any USDC the router gave
back, to the Vault in USDC (`:633-637`). `R` counts the PAVED the burn's swap paid, under the guard
(`:639-645`, `contracts/src/economy/curve.cairo:57`, `:91`). The burn's swap is one router round trip: the USDC to the
router, `swap`, `clear_minimum`, `clear` (`economy.cairo:993-1018`).

**Glitchbomb's `vault_percentage` and purchase component, mapped.**

- Setup embeds the purchase component (`GB:contracts/src/systems/setup.cairo:46`, `:68`). Its `execute`:
  - transfers `quantity × price × burn_percentage / 100` of the quote token to the router, swaps it, clears it and burns
    all the GLITCH it holds (`GB:contracts/src/components/purchase.cairo:179-221`);
  - then takes `vault_percentage` % of the **quote token left over**, approves the Vault and calls
    `vault.pay(recipient, vault_amount)` (`:223-231`);
  - and sends the rest to the team (`:233-238`).
- `pay` pulls that quote token, USDC, into the Vault and adds it to the rewardable accumulator
  (`GB:contracts/src/systems/vault.cairo:283-297`, `GB:contracts/src/components/rewardable.cairo:129-148`).
- **So Glitchbomb's purchase never deposits GLITCH without shares.** Its margin, when there is one, is a USDC dividend,
  the mechanism the owner has just set aside. And there is none: `vault_percentage` is `0x0` in every deployment file
  (`GB:dojo_mainnet.toml:58`, `GB:dojo_sepolia.toml:67`, and the cartridge and appchain files) and 0 in the config's
  defaults (`GB:contracts/src/models/config.cairo:104`, `:134`).
- The only thing that raises vGLITCH's rate is the exit fee, deployed at 0 (A2).

| Glitchbomb | Paved under vPAVED |
|---|---|
| `burn_percentage` of the price swapped and burned (`purchase.cairo:181`) | `burn_bps` (70 %), unchanged |
| `vault_percentage` of the remaining USDC, `pay`'d as a USDC dividend (`:226-231`) | the whole margin (D-10), swapped to PAVED and **transferred** to the Vault; no dividend |
| the rest to `team_address` (`:233-238`) | nothing: no team share (D-10) |
| `pay` reverts on an empty vault (`rewardable.cairo:142`) | a transfer never reverts on an empty Vault; the dead shares (A1) keep it from being empty |

**Three ways for the margin to become PAVED in the Vault.**

| | (a) Economy, at purchase (recommended) | (b) the Vault swaps | (c) a keeper batches |
|---|---|---|---|
| How | One swap of `quote + margin`; burn the burn's share of the PAVED, transfer the rest to the Vault | Economy sends USDC as today; the Vault swaps it on its own entry (each deposit or exit, or a `compound`) | USDC gathers (in Economy or the Vault); a keeper calls `compound(min_out)`, daily for example |
| Slippage bound | the player's `min_out`, over the whole swap, as now | none from a user: a permissionless swap without a bound can be sandwiched; with a bound, someone must give it | the keeper's `min_out`: a trusted key, or a bound read from the guard |
| New code | the split in `purchase`; nothing in the Vault | a router, a pool key and a price limit in the Vault, and their setters | (b)'s code, plus a keeper role or an incentive |
| Rate path | rises with every purchase | jumps at each swap | jumps once a day, so depositing just before the batch takes a day's margin pro rata: the exit fee must then exceed a day's yield |
| Gas | about +1 call per purchase over today (an estimate, below) | a full router round trip in the Vault, paid by whoever triggers it | one round trip a day, so the cheapest per purchase |
| Who holds USDC meanwhile | nobody: `Economy` holds nothing after the call (`economy.cairo:10-11`; as built, the router's strays wait there for the next margin) | the Vault, between swaps | the batcher, a day at a time |
| Against D-26 and P-56 | fits | the Vault gains swap setters | a keeper is a new trusted actor; D-26 keeps operations by hand |

**Recommendation: (a), one swap.**

- `curve::split` is unchanged. `purchase` swaps `quote + margin` through the same node, with the player's `min_out`
  over the total.
- The PAVED out is split by input: `to_vault = bought × margin / (quote + margin)`, rounded down, and
  `burn_part = bought − to_vault`.
- It burns `PAVED.balance_of(Economy) − to_vault`, which is everything else, strays included, as today (`:626-631`).
- It transfers `to_vault` to the Vault.
- `R` and the guard's next rate read `burn_part` against `quote`. That is the same price the swap paid, so a game's
  terms do not change by more than one swap's extra price impact: the guard's clamp already bounds what a single
  purchase can move (`economy.md:633-637`).

Two consequences:

- **A partial fill reverts.** Today the router gives the unswapped USDC back and it goes to the Vault as margin
  (`economy.cairo:633-637`; the fork test's partial fills, `economy.md:1345-1346`). Under vPAVED the Vault does
  nothing with USDC, so that USDC would be stranded. `purchase` asserts that the swap's USDC leg equals its input.
  The client already refuses to send a purchase whose quote is partial (`Economy.quote_swap` reverts,
  `economy.cairo:837-839`), so only a pool moved between the quote and the inclusion meets the revert, where today it
  pays a smaller burn.
- **`min_out` covers the margin too.** The client computes it from the pool's quote of the burn quote
  (`packages/chain/src/economy/pool.ts:6-10`, `amounts.ts:54`). It moves to `quote_swap(quote + margin)`, and the
  floor check of `amounts.ts:81-87` compares the whole swap with `(quote + margin) × rate`. That is CLIENT's change,
  in V1b's PR or its own.

**Cost per purchase** (an estimate; nothing was built or measured):

- (a) keeps one swap, so Ekubo's own work changes only with the larger input, which may cross more ticks on a
  concentrated pool.
- The USDC `transfer` to the Vault becomes a PAVED `transfer`, and the split adds a handful of `u256` operations.
- Net: about 0 calls. An upper bound of one extra call (about 99,230 L2 gas for a bare call,
  `docs/architecture/class-headroom.md:153`) is safe.
- A second swap instead of one would add a whole round trip, four calls (about 400,000 L2 gas before Ekubo's own swap
  work).
- V1b measures it against today's `purchase` in `tests/gas.cairo` and the fork test.

**Failure modes of (a).**

| Case | What happens |
|---|---|
| Slippage beyond the player's `min_out` | the purchase reverts (`BELOW_MIN_OUT`, `economy.cairo:1012-1013`), as now |
| A partial fill (a drained pool, a near limit set by `set_pool`) | the purchase reverts (new); today it pays a smaller burn and sends USDC to the Vault |
| An empty pool | `quote_swap` reverts or gives 0, the client refuses, and a purchase sent anyway reverts: no game is sold, as today with no PAVED to buy |
| A sandwich of the purchase | bounded by `min_out` (1 % to 5 % under the quote, P-35); the extra 39 % of input widens the dollar value at stake by the same 39 % |
| PAVED sent to the Vault directly | a donation: it raises the rate for every holder, and nothing breaks |
| USDC sent to the new Vault | stranded: the Vault has no USDC path ("For the PM", item 8) |

### A4. Economy consequences

**The volume.** `sim.py` draws stakes with `P(k)` proportional to `1/k` over 1 to 10 (`economy.md:428-429`), so the mean
stake is `10 / H(10)` = 3.4142 and the mean price 6.8283 USDC. With half the games referred (`sim.py`'s `referred` 0.5),
the burn takes 4.7798 USDC per game and the margin 1.8778 USDC (27.5 % of the price), **39 % of the burn**. Computed
from those constants.

**Price impact at the launch pool** (800,000 PAVED and 10,000 USDC, on Sepolia's `MockRouter` and as the mainnet LP
`economy.md:1016` and `:1156` assume; constant product, 5 % fee on the input, a day's buys alone, before any reward is
sold):

| Games a day | Burn only, as today | Burn and margin, vPAVED |
|---|---:|---:|
| 20 (`sim.py`'s thin day) | +1.82 % (7,200 PAVED bought) | +2.55 % (9,993 PAVED) |
| 200 (`sim.py`'s base) | +18.99 % (66,605 PAVED) | +26.90 % (89,833 PAVED) |

**Interaction with BURN.** The two buys are one swap under (a), so they add up exactly: one purchase buys
`(0.7 + 0.275) × price` of PAVED instead of `0.7 × price`. Only the burn's part leaves the supply. The margin's part
leaves the pool and the float, but stays in the supply, in the Vault. The supply factor reads the token's real
`total_supply` (D-10; `economy.cairo:639-641`), so it does not see the Vault's PAVED as burned. `R` reads only the
burn's PAVED (A3).

**The staker yield.** It goes from USDC paid out per purchase to a rate that rises with every purchase. Does its shape
matter to the curve or the mean? Not directly: neither reads the margin. The curve's `c`, `sigma` and `H`, and the
mean (`economy.cairo:692-770`), take the score, the stake and `R`. It matters through the pool: the margin now buys
PAVED, which moves the price at which the burn buys and the players sell. So `sim.py` was re-run.

- **Method.** `python3 -I -B` on a scratch wrapper (outside the repository) that loads `scripts/montecarlo/sim.py`'s
  source and patches its purchase block in memory.
  - After the burn's swap, it swaps the margin (`price − burn − referral`) through the same pool, with the same 5 %
    fee, and adds the PAVED out to a Vault balance that is never sold.
  - Everything else is `sim.py`'s, with the same seed (8) and the same 365 days.
  - `git status` was clean before and after: no file under `scripts/` changed.
  - The USDC rows reproduce `scripts/montecarlo/output.md` to the digit (B: mint/burn 0.999, edge 36.6 %, supply 987k;
    A: 0.998, 36.7 %, 977k, price 6.68).
- **The columns.**
  - "Sold at end": the USDC the Vault's PAVED would fetch, sold into the final pool at once with the fee.
  - "Margin in": the USDC the margin carried.

| Run (365 days) | Margin | mint / burn | house edge | return p50 | p90 | supply end | price day 1 | day 30 | end / start | Vault PAVED end | sold at end (USDC) | margin in (USDC) | greedy | noisy | novice |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B, base | USDC | 0.999 | 36.6 % | 0.88 | 1.27 | 987k | 0.975 | 1.325 | 6.40 | 0 | | 136,587 | 1.01 | 0.76 | 0.00 |
| B, base | PAVED | 0.992 | 37.4 % | 0.88 | 1.25 | 986k | 1.044 | 4.717 | 253.31 | 653,168 | 147,229 | 136,587 | 0.99 | 0.75 | 0.00 |
| A, base | USDC | 0.998 | 36.7 % | 0.87 | 1.33 | 977k | 0.987 | 1.441 | 6.68 | 0 | | 136,587 | 0.96 | 0.77 | 0.02 |
| A, base | PAVED | 0.994 | 38.5 % | 0.84 | 1.30 | 990k | 1.063 | 5.057 | 270.59 | 657,939 | 152,620 | 136,587 | 0.94 | 0.75 | 0.02 |
| B, 20 games a day | USDC | 0.974 | 38.5 % | 0.87 | 1.30 | 945k | 0.995 | 1.020 | 1.55 | 0 | | 13,540 | 0.94 | 0.73 | 0.02 |
| B, 20 games a day | PAVED | 0.967 | 38.9 % | 0.87 | 1.28 | 966k | 1.003 | 1.246 | 6.52 | 403,004 | 14,043 | 13,540 | 0.94 | 0.73 | 0.02 |
| B, pool depth x0.1 | USDC | 0.983 | 37.3 % | 0.80 | 1.31 | 981k | 0.862 | 6.326 | 399.87 | 0 | | 136,587 | 0.99 | 0.75 | 0.00 |
| B, pool depth x0.1 | PAVED | 0.980 | 37.6 % | 0.86 | 1.25 | 997k | 1.216 | 136.054 | 22,823 | 67,571 | 149,838 | 136,587 | 0.99 | 0.75 | 0.00 |
| B, players keep half | USDC | 0.992 | 35.9 % | 0.90 | 1.28 | 989k | 1.080 | 5.748 | 342.74 | 0 | | 136,587 | 1.01 | 0.77 | 0.00 |
| B, players keep half | PAVED | 0.993 | 36.0 % | 0.90 | 1.27 | 994k | 1.156 | 11.798 | 994.12 | 329,811 | 291,676 | 136,587 | 1.01 | 0.77 | 0.00 |

In the base run B, the pool ends at 159,156 USDC and 50,265 PAVED with the margin in PAVED, against 25,291 USDC and
316,321 PAVED with it in USDC. The "pool depth x10" run is left out: its pool (8,000,000 PAVED) is larger than the
supply, so its Vault balance means nothing.

What the figures say, within the model's limits (no outside trader, players sell their whole reward, stakers never
sell; `economy.md:405-407`):

- **The players barely move.** The house edge rises by 0.8 point (B) and 1.8 points (A). Mint/burn stays at 0.97 to
  0.99, and the return by kind moves by 0.02 at most. The calibration (`c` 1.222, `mean0` 3,980, P-46) needs no
  change: the curve and the mean do not read the margin, and `sim.py` recalibrates `c` from the scores alone.
- **The stakers keep their share of the value**, in another form. Sold at the end, the Vault's PAVED would fetch 1.08x
  (B), 1.04x (20 games a day) and 1.12x (A) the USDC margin it was bought with. That is after the pool fee on the way
  in and out, carried by the buy pressure that the margin itself adds.
- **The PAVED gathers in the Vault.** The Vault ends a year of 200 games a day with 653k PAVED (66 % of the supply),
  and the pool's PAVED falls to 50k. The model's price path (×253) is a symptom of having no outside seller, not a
  forecast. The direction is real, though: every purchase removes 27.5 % of its price in PAVED from the float, on
  top of the 70 % burned. A staker who redeems and sells puts that PAVED back. The economy audit weighs it (A7).
- **Votes concentrate.** The same 66 % of the supply sits behind vPAVED, so a later Governor's electorate is mostly
  stakers. That is the purpose of D-27 point 3.

**D-10, unchanged.**

- Every USDC of the margin, the referral being already out of it (P-31 ruling 1), enters the swap. Every PAVED that
  swap pays for the margin goes to the Vault, and nothing goes to a team or to Economy.
- In the Vault it raises the rate of every vPAVED pro rata, which is "entirely to the Vault's beneficiaries
  (stakers)".
- **The dead shares' cut** (As built, the economy audit of #382): the 1,000 dead shares are vPAVED too. They take
  `1,000 / total_supply` of every margin and every exit fee, and that cut is locked forever, since nothing can redeem
  them.
  - At deploy.sh's launch amounts (1,000 dead shares, 199,000 staked) it is 0.5 %, and it grows as real stakers leave.
  - With no real stake, all of it accrues to the dead shares until someone deposits.
  - That PAVED stays in `total_supply`, so the supply factor counts it as circulating.
- **One leak to name**: the pool keeps its 5 % fee on the margin's input as well, about 1.4 % of each price
  (0.275 × 5 %). That goes to the LP position, whose fees the team collects by hand (D-26). Today the margin pays no
  pool fee. "For the PM", item 3.

### A5. Glitchbomb's rewardable claim

| Entry | What it pays, to whom, from what |
|---|---|
| `pay(player_id, amount)` | `PROVIDER_ROLE` only, which is Setup (`GB:contracts/src/systems/vault.cairo:166-167`, `:283-297`). It pulls `amount` of the quote token (USDC, `store.config().quote`, `:420-424`) from the caller and adds `amount × 1e36 / total_supply` to `total_reward`. It reverts if no share exists (`GB:contracts/src/components/rewardable.cairo:129-148`). Paid by the purchase with `vault_percentage` (A3), which is 0 everywhere |
| `claimable_of(account)` | a view: `pending_reward + shares × (total_reward − current_reward)`, divided by 1e36 (`GB:contracts/src/systems/vault.cairo:277-281`, `GB:contracts/src/models/position.cairo:14-16`, `rewardable.cairo:69-77`) |
| `claim()` | pays the caller's claimable USDC. It reverts when paused, closed, or when there is nothing to claim (`GB:contracts/src/systems/vault.cairo:299-317`) |
| `time_lock_of(account)` | a view of the account's lock time (`:272-275`). Every receipt of shares sets it to now plus `VAULT_LOCKUP_DURATION` (`GB:contracts/src/components/rewardable.cairo:96-98`, `GB:contracts/src/models/position.cairo:25-28`), which is **0** (`GB:contracts/src/constants.cairo:27`). Sending shares out asserts `time_lock < now` (`rewardable.cairo:112-114`, `position.cairo:40-43`), so all it does is refuse to move shares in the block they arrived, which its comment calls its purpose. It pays nothing |
| `open()` / `close()` | `KEEPER_ROLE` (`GB:contracts/src/systems/vault.cairo:378-394`). A flag that gates `withdraw`, `redeem` (`:219-221`) and `claim` (`:303-304`), not deposits. A closed vault keeps everyone's GLITCH and USDC in. It pays nothing |
| `collect(address)` | `COLLECTOR_ROLE`. It pays a non-account contract's claimable USDC to Glitchbomb's Treasury (`:336-357`) |

**Does Paved need it? No. The PM's default is confirmed.**

- Under vPAVED, all the staker income is PAVED that raises the rate, so there is no USDC to account for.
- A second, USDC mechanism would bring back everything A6 removes: the accumulator, the settling hook on every
  transfer, the claim, and the stranded USDC of a contract holder (section 3's edge case below).
- `time_lock_of` with a duration of 0 is a same-block guard. The votes' checkpoints already make borrowed shares
  useless for a vote (section 4), and the exit fee makes a same-block round trip lose (A2).
- `open`/`close` and the pause would let a key hold the stakers' PAVED. P-56 makes the Vault owner-gated for its
  upgrade and its fee, not for its exits, and `upgrade-owner.md:243-244` keeps the stakers' exits out of any key's
  reach.
- What would reopen it: the owner wants a USDC income again beside the rate. Then the 1:1 note's section 3 is the
  design for it, on top of the ERC4626.

### A6. What changes from the 1:1 note

**The reward hook goes, and so does `acc`.**

- No per-account settlement remains, so the ERC20 `before_update` hook of section 3 goes, and with it `sync`, `settle`,
  `acc`, `accounted`, `snapshots`, `owed`, `ACC_SCALE`, `claim`, `pending` and the `Distributed` and `Claimed` events
  (`contracts/src/systems/vault.cairo:20`, `:29-37`, `:80-87`, `:118-130`).
- Section 3's proof has nothing left to prove.
- Its edge cases change:
  - **To the Vault itself**: allowed now, since the Vault earns no USDC to strand. The dead shares (A1) rely on it.
  - **To a contract that cannot claim**: nothing is stranded any more. The shares' PAVED grows inside the rate,
    wherever they sit. An LP of vPAVED, the case Glitchbomb's `collect` exists for, needs nothing.
- `after_update` keeps one line, `transfer_voting_units` (section 4, `GB:contracts/src/systems/vault.cairo:259-267`).

**P-42 and dead slots.**

- vPAVED is a new class at a new address, in the fresh deployment of D-27 point 1. No slot of today's Vault carries
  over: nothing is migrated, and no field is left dead.
- From its first deployment on, vPAVED is upgradable (P-56), so P-42's storage rules apply to it as to `Economy`: new
  fields only, no rename or retype, and the component substorage names kept (`erc20`, `erc4626`, `erc20_votes`,
  `nonces`, `ownable`, `upgradeable`, and the fee in its own field).
- `Economy` gains no storage under A3. Its `vault` field keeps its meaning (`economy.cairo:576`).
- `PavedToken` stays as it is.

**Votes on an ERC4626 share.**

- Section 4 holds, with one change of unit: the voting units are the vPAVED balance
  (`OZ:governance-4.0.1/src/votes/votes.cairo:222-244`, `ERC20VotesImpl::get_voting_units` returns `balance_of`), not
  the PAVED behind it.
- At any moment every vPAVED is worth the same PAVED, so the votes stay proportional to the PAVED each holder owns in
  the Vault. As the rate rises, one vote stands for more PAVED.
- `get_past_total_supply` counts the 1,000 dead shares, which never vote. A later Governor's quorum as a fraction of
  the supply carries them as a constant handicap of 1,000 shares.
- Deposits and redeems are mints and burns of the share, so they move the total-supply checkpoint, as stake and
  unstake did. The exit fee as `Fee::Assets` burns no extra shares, so it adds no checkpoint.
- `delegate`, `delegate_by_sig`, the timestamp clock and the SNIP-12 metadata (now `'vPAVED'`) are unchanged.

**The ABI.**

| | Today's Vault | vPAVED |
|---|---|---|
| Staking | `stake(amount)`, `unstake(amount)`, `claim()` (`vault.cairo:25-29`) | `deposit`, `mint`, `withdraw`, `redeem`; `stake`, `unstake` and `claim` go |
| Views | `pending`, `staked`, `total_staked`, `acc`, `accounted`, `tokens` (`:31-39`) | `asset`, `total_assets`, `convert_to_shares`, `convert_to_assets`, `max_*`, `preview_*`; `balance_of` and `total_supply` replace `staked` and `total_staked`; `exit_fee()` |
| ERC20 | none | `name`, `symbol`, `decimals`, `total_supply`, `balance_of`, `allowance`, `transfer`, `transfer_from`, `approve`, and the camel-case three |
| Votes, Nonces | none | as section 4 |
| Owner | none (`vault.cairo:9-10`) | `owner`, `transfer_ownership`, `accept_ownership`, `renounce_ownership` (two-step), `upgrade(class_hash)`, `set_exit_fee(bps)` |

- Keeping `stake(amount)` as an alias of `deposit(amount, caller)` would be harmless. `unstake(amount)` would not be:
  it is ambiguous between `withdraw` (PAVED) and `redeem` (shares). So all three go.
- `packages/chain` moves to the new names: the writer's `stake`, `unstake` and `claimDividends`
  (`packages/chain/src/economy/writer.ts:365-392`), and the views' `vault` (`views.ts:128-135`).
- `scripts/deploy.sh` moves to `deposit`: the owner's stake at `:2689`, its read at `:2680`, and the R-1 repoint's
  unstake that keeps 10 % staked, `:1033-1057`, which becomes a `redeem`.
- `Economy`'s ABI is unchanged, but for the `Purchased` event below.

**The indexer events.**

- The indexer reads `Challenge`, `Setup`, `Economy` and `Collection` only (`packages/indexer/src/deployment.ts:55-58`).
  vPAVED's events (`Deposit`, `Withdraw`, `Transfer`, `Approval`, `DelegateChanged`, `DelegateVotesChanged`,
  `ExitFeeSet`, the owner's and `Upgraded`) do not reach it.
- **`Economy.Purchased` does.** Its decoder is strict: exactly 17 data felts (`packages/indexer/src/events.ts:503-521`,
  `:326-328`), and an unknown selector from a read contract is a decode error (`:397`).
- Recommendation: append one field, `vault_paved: u256`, the PAVED sent to the Vault. `margin` keeps its meaning, the
  USDC the margin carried into the swap, and every earlier offset stays.
- The decoder goes to 19 data felts and the `economy` table gains a column, in the same rollout. Sepolia starts from
  zero (D-27 point 1), so the indexer never meets the old layout and the new one in one history.
- This is the INDEXER change of V1b (A7).

**CASM** (estimates: nothing was built):

- Today's Vault is 6,700 felts (#262, `docs/architecture/glitchbomb-gap.md:31`).
- vPAVED stacks ERC20, ERC4626 (the four flows and twelve views), Votes, Nonces, SNIP-12, Ownable and Upgradeable. It
  should land between **25,000 and 40,000 felts**, under half the 81,920 cap (`docs/architecture/class-headroom.md:7`).
- `Economy` (26,567, `class-headroom.md:592`) grows by the split and one field of an event, an estimate of a few
  hundred felts.
- V1b measures both with `scripts/class-sizes.sh`.

### A7. The implementation plan for V1b, re-scoped

One PR, CORE, after the PM's ruling on this addendum and before the fresh Sepolia deployment of D-27. The client and
indexer parts may ride in it or follow in their tracks' PRs, as the PM orders, but must land before that deployment.

**Files**

- `contracts/Scarb.toml`, `contracts/Scarb.lock`: `openzeppelin_governance = "=4.0.1"`, pinned exactly as the others.
- `contracts/src/systems/vault.cairo`, rewritten:
  - the components ERC20, ERC4626 (`ERC4626SelfAssetsManagement`, `DefaultConfig`), Votes, Nonces, Ownable and
    Upgradeable;
  - the hooks: `before_deposit` refuses zero shares, `before_withdraw` is empty for `Fee::Assets`, and `after_update`
    moves the votes;
  - `FeeConfigTrait` (A2) and `LimitConfigTrait::withdraw_limit`;
  - `set_exit_fee` with its bounds and event, and `upgrade`;
  - the constructor `(owner, paved, exit_fee_bps)`;
  - the module comment: an ERC4626 share with votes, owner-gated.
- `contracts/src/systems/economy.cairo`: the one swap and the split in `purchase` and `swap`, the full-fill check,
  `Purchased.vault_paved`, and the module comment's "the rest goes to the Vault" (`:4-11`).
- `contracts/src/economy/curve.cairo`: the split as a pure function, tested alone.
- `contracts/abis/Vault.json`, `contracts/abis/Economy.json`: regenerated.
- `contracts/src/tests/economy/vault.cairo`: rewritten. `contracts/src/tests/economy/` (purchase) and the fork test:
  extended. `contracts/src/tests/e2e/upgrades.cairo:164-170` ("Not upgradable: PavedToken and Vault"): the Vault moves
  to the upgradable side.
- `scripts/deploy.sh`: the Vault's constructor, the dead-share deposit before `Economy.set_game`, the owner's deposit,
  and the reads and repoint of A6.
- `packages/chain`: the writer, the views, `min_out` over `quote + margin` (A3), and the codec tests for `Deposit`,
  `Withdraw` and the votes' events.
- `packages/indexer`: `Purchased` with 19 data felts, the schema's new column.
- `scripts/montecarlo/sim.py`: an option for the margin in PAVED, so that A4's figures come from the committed script.
- Docs:
  - `docs/architecture/economy.md` section 4 (`:527-572`) and its summary;
  - `public-interface.md`, `upgrades.md` and `upgrade-owner.md` (`:95`, `:243-244`: the Vault now has an owner, for
    its upgrade and fee);
  - `glitchbomb-gap.md:182-183`;
  - `docs/programme/DECISIONS.md`: P-56's correction row (brief: "goes in V1b's PR").

**Tests**

- **The rate after deposits**: each deposit and redeem leaves `convert_to_assets(10^18)` unchanged, to the rounding,
  which favours the Vault. A fuzz test of deposits, mints, withdraws, redeems and transfers among three accounts
  checks after every step that `total_assets ≥ convert_to_assets(total_supply)` and that no account can take out more
  PAVED than it put in plus its share of the income.
- **The rate after fees**: at fee `f`, a redeem of half the supply leaves the rate up by the fee over the remaining
  shares, and withdraw and redeem charge the same `f`. `withdraw(max_withdraw(owner))` succeeds with a fee. The bounds
  of `set_exit_fee` (0 and 500 pass, 501 reverts). Not the owner: reverts. The event is emitted.
- **The rate after the margin**: a purchase raises `total_assets` by `vault_paved` and leaves `total_supply` unchanged.
  The split adds up: `burn_part + to_vault = bought`, with the strays burned. `R` from `burn_part` equals today's `R`
  for the same pool and quote, to one swap's price impact.
- **The inflation attack**:
  - with the dead shares, a first-depositor donation of 10^6 PAVED leaves a victim's later deposit within its
    rounding;
  - a deposit that would mint 0 shares reverts;
  - with every non-dead share redeemed while purchases go on, the next depositor still gets a fair share.
- **Votes on vPAVED**:
  - section 7's vote tests, on deposit and redeem instead of stake and unstake;
  - the dead shares are never delegated;
  - `get_past_votes` holds across a margin deposit, which changes no vote.
- **The swap path**:
  - a purchase sends no USDC to the Vault and leaves `Economy` holding nothing;
  - a partial fill reverts (the mock router with a near limit, and the fork test's thin PAVED/USDC pool);
  - `min_out` over the total is enforced;
  - the fork test's "quote equals swap" holds at `quote + margin`.
- **Upgrade**: `upgrade` by the owner keeps the balances, the fee and the votes. By another account it reverts.
- **Gas**: `purchase`, `deposit`, `redeem`, `withdraw` and a `transfer`, against today's `purchase`, `stake`, `unstake`
  and `transfer`, in the PR.

**Audits**

- **Security**:
  - ERC4626 rounding in all four directions;
  - the dead shares and the zero-share check;
  - the fee bounds and the formulas;
  - the owner's powers (upgrade, fee) under the deferred upgrade-owner gate;
  - `delegate_by_sig` and its nonces;
  - the split in `purchase` (no PAVED left in `Economy`, no USDC sent to the Vault);
  - the full-fill check;
  - the dependency pin.
- **Economy**:
  - the price impact of the margin's buy and the 39 % larger sandwich surface;
  - the 5 % LP fee on the margin (item 3 below);
  - the PAVED gathering in the Vault and the overhang it means when stakers sell;
  - the default fee against ordinary exits;
  - the votes' weight against the PAVED behind them.

### For the PM

1. **"As Glitchbomb's purchase path does" has no counterpart in Glitchbomb.**
   - Its purchase pays the Vault in USDC, through `pay`, into `RewardableComponent`
     (`GB:contracts/src/components/purchase.cairo:223-231`, `GB:contracts/src/systems/vault.cairo:283-297`). That is a
     USDC dividend, not GLITCH deposited without shares.
   - Its `vault_percentage` is 0 in every deployment file (`GB:dojo_mainnet.toml:58`, `GB:dojo_sepolia.toml:67`).
   - The only lever on vGLITCH's rate is the exit fee, deployed at 0 (item 2).
   - So A3's path (Economy swaps, then a plain transfer) is Paved's own design, on the pattern of the income Paved
     already uses (a plain transfer, no `pay`, no role; `vault.cairo:1-7`).
2. **Glitchbomb's exit fee is not what its comment says.**
   - The comment says 500 bps; every toml deploys `0x0` (`GB:dojo_mainnet.toml:36`, `GB:dojo_sepolia.toml:42`).
   - Its withdraw takes `Fee::Assets`, but its redeem takes `Fee::Shares`, burned
     (`GB:contracts/src/systems/vault.cairo:397-415`, `:225-234`).
   - Its two formulas are swapped (`:427-440`): 4.55 % on a withdraw against 5 % on a redeem at 500 bps.
   - Its `max_withdraw` ignores the fee, so a full withdraw reverts when the fee is above 0.
   - Paved takes the fee as assets on both, with the right formulas and a withdraw limit (A2). The proposed default is
     100 bps with a ceiling of 500: your ruling.
3. **The margin now pays the pool's 5 % fee**, about 1.4 % of every price, to the LP position. Its fees are collected by
   the team (D-26). D-10 says "no team share", and `economy.md:643-644` counts the LP fee as the owner's choice, not
   margin.
   - Recommendation: accept it as the cost of the owner's correction. A margin in PAVED must be bought somewhere, and
     every route of A3 pays the same pool fee.
   - If you judge it to touch D-10, it is the owner's to confirm.
4. **A partial fill reverts the purchase** under A3 (today it pays a smaller burn and sends the rest to the Vault in
   USDC). Recommendation: accept, since the client already refuses partial quotes. The alternative is a refund of the
   unswapped USDC to the player, which adds a transfer and a path to test.
5. **The PAVED gathers in the Vault.** In the model, 66 % of the supply after a year of 200 games a day, and the pool's
   PAVED falls from 316k to 50k against today's USDC margin (A4). The model has no outside trader, but the direction
   is structural: 97.5 % of every price now buys PAVED. The economy audit should weigh it before mainnet. It changes
   no D-10 number.
6. **Votes count vPAVED, not PAVED** (A6): proportional at any moment, with 1,000 dead shares in the total supply.
7. **The upgradable Vault reverses the 1:1 note's item 2** (its recommendation: not upgradable), as P-56 ruled. Three
   texts say otherwise today, and V1b brings them in line:
   - `upgrade-owner.md:95` ("what no owner can touch: the stakers' PAVED");
   - `contracts/src/tests/e2e/upgrades.cairo:164-170`;
   - P-42's row ("`PavedToken` and `Vault` stay non-upgradable").
   An upgrade key over vPAVED is a key over the stakers' PAVED and the votes. It falls under the deferred upgrade-owner
   gate (D-28).
8. **USDC sent to vPAVED is stranded**: it has no USDC path and no sweep. Recommendation: none. Under A3 nothing sends
   USDC there, and the upgrade (P-56) can add a sweep if a mistake ever needs one.
9. **The 1:1 note's section 3 is superseded, not wrong.** It is the design to take back if the owner ever wants a USDC
   income beside the rate (A5).

## The P-55 note, as written for the 1:1 share

Design note for P-55 (PM, 2026-10-14), from D-27 (owner, via the PM, 2026-10-14): "keep the voting system attached
to the Vault's token", with no Governor for now. Brief: `docs/briefs/v1a-vault-share-votes.md`. Nothing here is built
yet; section 7 is the plan.

References:

- Paved, at origin/main `c52467ca`: paths from the repository root, e.g. `contracts/src/systems/vault.cairo:148`.
- Glitchbomb at `5efcbce` (read only): `GB:` plus the path, e.g. `GB:contracts/src/systems/vault.cairo:240`.
- OpenZeppelin for Cairo: `OZ:token-4.0.1/…` is the published `openzeppelin_token` 4.0.1 that Paved already pins
  (`contracts/Scarb.toml:17`); `OZ:utils-2.2.0/…` is `openzeppelin_utils` 2.2.0 (in `contracts/Scarb.lock`, a
  dependency of the token). `VotesComponent` lives in `openzeppelin_governance` 4.0.1 (`votes/votes.cairo`), which
  Paved does not depend on yet; the scarbs.xyz index gives 4.0.1 as its latest version, requiring `starknet ^2.18.0`
  and the same `openzeppelin_token ^4.0.1`, `openzeppelin_utils ^2.2.0` and `openzeppelin_interfaces ^2.2.0` that
  Paved pins, so it fits Scarb 2.20.1. Its source was read from the v4.0.1 tag of `OpenZeppelin/cairo-contracts`
  (no line numbers given below for it, only names).

## Summary (superseded by the addendum)

- **The share**: "Staked PAVED", `stPAVED`, 18 decimals (PAVED's, `contracts/src/systems/token.cairo:15`).
- **1:1, not ERC4626.** One share is minted per PAVED staked and burned per PAVED unstaked. The USDC income stays in
  the accumulator `acc` exactly as today. ERC4626 prices shares against the PAVED the Vault holds, and nothing ever
  adds PAVED to the Vault without minting shares: it would add rounding, a first-depositor attack and four entry
  points for a price that never moves.
- **Rewards across transfers**: the ERC20 `before_update` hook syncs the income, then settles `from` and `to` against
  `acc` with their balances before the update. The share's balance replaces the `stakes` map, and its total supply
  replaces `total_staked`. Section 3 proves that no USDC is created by a transfer, a mint (stake) or a burn (unstake).
- **Votes**: `VotesComponent` in `after_update` (`transfer_voting_units`), as Glitchbomb does, with a timestamp clock,
  `NoncesComponent` and SNIP-12 metadata for `delegate_by_sig`. No Governor reads them yet (D-27, point 2).
- **Left out from Glitchbomb**: ERC4626, Pausable, AccessControl and its roles, the exit fee, the time lock, `pay` and
  `collect`. The Vault keeps no owner, no setter, no pause and no upgrade (`vault.cairo:9-10`): whether that last one
  should change is an open point for the PM ("For the PM", item 2).

## 1. The share (superseded by the addendum)

| Property | Proposal | Why |
|---|---|---|
| Name | `Staked PAVED` | Says what one share is: one PAVED, staked. Glitchbomb's is `GLITCH (Vault)` (`GB:contracts/src/systems/vault.cairo:153`) |
| Symbol | `stPAVED` | The `st` prefix is the usual mark of a 1:1 staking receipt; `v` (Glitchbomb's `vGLITCH`, `economy.md:570`'s `vPAVED`) reads as a vault share with a moving price, which section 2 rejects |
| Decimals | 18 | 1:1 with PAVED, whose decimals are 18 (`contracts/src/systems/token.cairo:15`, `:70`). The OpenZeppelin ERC20 default is also 18 (`OZ:token-4.0.1/src/erc20/erc20.cairo:34`), so `DefaultConfig` serves |
| SNIP-12 metadata | name `'Staked PAVED'`, version `'1'` | Needed by `delegate_by_sig` (section 4). Glitchbomb uses `'vGLITCH'`, `'1.0.0'` (`GB:contracts/src/systems/vault.cairo:183-190`) |

What reverses it: the PM's choice of other names. Name and symbol are constructor constants: they cost nothing to
change before the fresh Sepolia deployment (D-27, point 1), and a new class after it.

## 2. 1:1 or pro-rata (superseded by the addendum)

**Paved's model.** The Vault holds PAVED and earns USDC. Income is whatever USDC the Vault has not accounted for
(`vault.cairo:1-7`, `:233-245`); Economy sends it the margin by a plain transfer (`contracts/src/systems/economy.cairo:633-637`).
No path sends PAVED to the Vault: Economy burns the PAVED it buys (`economy.cairo:625-631`), and the Vault has no exit
fee and no lockup (`economy.md:567`).

| | 1:1 (recommended) | Pro-rata (ERC4626) |
|---|---|---|
| Shares for `a` PAVED | `a` | `a × supply / assets`, rounded down, with OpenZeppelin's virtual offset |
| Does the price move? | Never, by construction | Only if PAVED reaches the Vault without minting shares: a donation or a fee. Paved has neither, so the price stays 1 except for rounding and donations |
| USDC income | `acc`, as today | `acc` as well: ERC4626 prices the asset (PAVED), not the USDC; Glitchbomb also keeps its USDC rewards outside ERC4626, in `RewardableComponent` (`GB:contracts/src/components/rewardable.cairo:129-167`) |
| Attack surface | none new for pricing | the first-depositor share inflation (`economy.md:542-543`), rounding in four directions, `max_*` limits |
| Entry points | `stake`, `unstake`, `claim`, kept | `deposit`, `mint`, `withdraw`, `redeem`, `preview_*`, `convert_to_*`, `max_*`, `asset`, `total_assets`; the client and `deploy.sh` move to them |
| CASM | ERC20 + votes on top of today's Vault | the same plus ERC4626 |

Why Glitchbomb needs ERC4626 and Paved does not: Glitchbomb's exit fee is taken in the asset and left in the vault for
the remaining holders (`GB:contracts/src/systems/vault.cairo:223-227`, `:397-405`), which raises the GLITCH per share.
That is PAVED income in Paved's terms, and Paved has none.

**Recommendation: 1:1.** What reverses it: a decision that routes PAVED income to the Vault (an exit fee kept in PAVED,
a share of a mint or of the burn). Then ERC4626, with `acc` kept for the USDC, as `economy.md:570-571` foresaw.

The OpenZeppelin `ERC20WrapperComponent` is the library's 1:1 wrapper (`OZ:token-4.0.1/src/erc20/extensions/erc20_wrapper.cairo:5-19`):
`deposit_for(receiver, amount)` and `withdraw_to(receiver, amount)`, which refuse the wrapper itself as sender or
receiver (`:99-101`, `:120-121`) and check that the decimals match (`:155-165`). It is not recommended: it would add
a second pair of entry points beside `stake` and `unstake` (which the client, `packages/chain/src/economy/writer.ts:365-392`,
and `deploy.sh`, `scripts/deploy.sh:1096`, `:2689`, call), its `recover` needs an owner to be safe, and the Vault's
own mint and burn take a few lines. Its two receiver checks are taken (section 3).

## 3. Rewards across transfers (superseded by the addendum)

### Today

`stake`, `unstake` and `claim` each run `sync` then `settle(caller)` before they change anything
(`vault.cairo:151-154`, `:172-174`, `:186-189`):

- `sync` folds the unaccounted USDC into `acc += income × ACC_SCALE / total_staked` and `accounted += income`, unless
  nobody stakes (`vault.cairo:235-256`);
- `settle(a)` moves `stake(a) × (acc − snapshot(a)) / ACC_SCALE` into `owed(a)` and sets `snapshot(a) = acc`
  (`vault.cairo:259-268`).

A transferable share moves stake between two accounts without either calling the Vault, so both must be settled at
the transfer, at the balances they had while they earned.

### The hook

The share's balance becomes the stake: `stakes` (`vault.cairo:83`) and `total_staked` (`:80`) give way to the ERC20
component's balances and total supply. Every balance change, transfer, mint and burn alike, goes through the ERC20
`update`, which calls `before_update`, changes the balances, emits `Transfer`, then calls `after_update`
(`OZ:token-4.0.1/src/erc20/erc20.cairo:472-501`). So:

```cairo
impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState> {
    fn before_update(
        ref self: ERC20Component::ComponentState<ContractState>,
        from: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) {
        let mut contract_state = self.get_contract_mut();
        // [Check] The Vault never holds its own share (it could never claim the USDC it would earn)
        assert(recipient != get_contract_address(), errors::VAULT_RECIPIENT);
        // [Effect] Fold the income in at the supply that earned it, then settle both sides at their old balances
        contract_state.sync();
        if from.is_non_zero() {
            contract_state.settle(from);
        }
        if recipient.is_non_zero() {
            contract_state.settle(recipient);
        }
    }

    fn after_update(
        ref self: ERC20Component::ComponentState<ContractState>,
        from: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) {
        // [Effect] Move the voting units, as Glitchbomb does (GB:…/vault.cairo:259-267)
        let mut contract_state = self.get_contract_mut();
        contract_state.erc20_votes.transfer_voting_units(from, recipient, amount);
    }
}
```

`settle` and `synced` read `self.erc20.balance_of(account)` and `self.erc20.total_supply()` instead of the two
removed fields. In `before_update` both still hold their values before the change, which is what makes the settlement
exact. `stake` becomes "check the amount, `self.erc20.mint(caller, amount)`, pull the PAVED"; `unstake` becomes "check,
`self.erc20.burn(caller, amount)`, return the PAVED"; `claim` keeps its own `sync` and `settle`. The order of checks,
effects and interactions is today's.

Glitchbomb does the same in its `before_update` with `RewardableComponent` (`GB:contracts/src/systems/vault.cairo:240-257`):
its `unstake(from, balance)` and `stake(recipient, balance)` both run `PositionTrait::update` with the balance before
the change (`GB:contracts/src/models/position.cairo:14-23`), which is the same settlement. Two differences: its income
arrives through `pay`, which already moved the accumulator, so it has no `sync`; and it also locks the receiver and
refuses a sender still locked (`GB:contracts/src/components/rewardable.cairo:96-98`, `:113-114`), which Paved leaves
out (section 5).

### No USDC is created or lost

Let `S = ACC_SCALE`, `b(a)` the share balance of `a`, `T = Σ b(a)` the supply, `snap(a)` and `owed(a)` as today. The
USDC that the accounts can claim, if each settled now at the stored `acc`, is

`L = Σ owed(a) + Σ floor(b(a) × (acc − snap(a)) / S)`.

Invariant, true at deployment (everything zero): **`L ≤ accounted ≤ USDC.balance_of(Vault)`**, and `accounted − L` is
rounding dust that no account can claim.

- **Sync.** With `income = balance − accounted > 0` and `T > 0`, `acc` grows by `d = floor(income × S / T)` and
  `accounted` by `income`. `L` grows by at most `Σ b(a) × d / S = T × d / S ≤ income`. The invariant holds; the new
  dust is under `T / S` base units of USDC per sync, so under one base unit while `T < 10^36` (the supply of PAVED is
  `10^24` base units at launch, `token.cairo:16-17`). With `T = 0` nothing moves and the USDC waits, as today.
- **Settle(a).** Moves `floor(b(a) × (acc − snap(a)) / S)` from the second sum into `owed(a)` and sets `snap(a) = acc`:
  `L` does not change.
- **Transfer of `x` from `f` to `r`** (`f`, `r` non-zero). Both are settled at the current `acc` before the balances
  change, so their terms in the second sum are `b × 0 = 0` before and after: `L`, `acc`, `accounted` and the USDC
  balance do not change. No USDC moves; `f` keeps what it earned up to the transfer, `r` earns on `x` only from it.
  A self-transfer (`f = r`) settles the account twice, the second time for nothing.
- **Mint `x` to `a` (stake).** `a` is settled first, then `b(a)` grows with `snap(a) = acc`: its term stays 0. `T`
  grows, but `acc` does not, so the new shares claim nothing that arrived before them (today's
  `test_vault_sync_before_stake_keeps_earlier_income_from_the_new_staker`, `contracts/src/tests/economy/vault.cairo:158`).
- **Burn `x` from `a` (unstake).** `a` is settled first, so `owed(a)` keeps all it earned and the term of the
  remaining balance is 0. `T` falls; `acc` does not change.
- **Claim by `a`.** `owed(a)`, `accounted` and the USDC balance all fall by the same amount: both inequalities hold.

So a transfer, a mint or a burn creates no USDC and loses none beyond the floors above, the same dust as today
(`vault.cairo:18-19`, `test_vault_dust_bound`, `contracts/src/tests/economy/vault.cairo:225`). The dust stays in
`accounted` for good.

### The edge cases

- **To the Vault itself.** Without a check, shares sent to the Vault's address would earn USDC into `owed(Vault)`,
  which nothing can claim (`claim` pays the caller, `vault.cairo:186-198`), and stay stuck themselves. The hook refuses
  it, as the OpenZeppelin wrapper does (`erc20_wrapper.cairo:101`, `:121`). From the Vault therefore never happens.
- **To or from zero.** The ERC20 `transfer` and `transfer_from` refuse the zero address on both sides
  (`OZ:token-4.0.1/src/erc20/erc20.cairo:518-519`). Zero appears only as `from` in a mint (stake) and as `recipient`
  in a burn (unstake); the hook skips settling it. The votes component moves the total supply checkpoint in exactly
  those two cases.
- **To a contract.** The shares and their USDC follow the holder. A contract that can call `claim` (an account, a
  multisig) is like any holder. A contract that cannot (a pool, an escrow, a bridge) accrues `owed` it can never take:
  the USDC stays in the Vault, counted in `L`, forever. Glitchbomb answers this with `collect`, a `COLLECTOR_ROLE`
  entry point that pays a non-account contract's rewards to its Treasury (`GB:contracts/src/systems/vault.cairo:327-357`).
  Paved has no role and no Treasury (D-26). Options in "For the PM", item 3.
- **An approval spent by a third party** (`transfer_from`) runs the same `update` and the same hook.

## 4. Votes (stands, counted in vPAVED: addendum, A6)

`VotesComponent` (`openzeppelin_governance` 4.0.1, `votes/votes.cairo`), wired as Glitchbomb wires it
(`GB:contracts/src/systems/vault.cairo:69-70`, `:83-86`, `:259-267`):

- **Voting units.** The component's `ERC20VotesImpl` gives `balance_of` as the units of an account (1:1 with the
  share, hence with staked PAVED). They move in `after_update` through `transfer_voting_units(from, to, amount)`,
  which pushes the total supply checkpoint on a mint or a burn and moves votes between the two delegates.
- **Delegation.** Units count only once delegated: an account must `delegate` to itself to vote itself (the component's
  own documentation). `delegate(delegatee)`; `delegate_by_sig(delegator, delegatee, nonce, expiry, signature)`, with
  the SNIP-12 `Delegation` message checked against the delegator's account (`is_valid_signature`) and its nonce taken
  by `NoncesComponent`. Events: `DelegateChanged { delegator, from_delegate, to_delegate }` and
  `DelegateVotesChanged { delegate, previous_votes, new_votes }`.
- **Checkpoints.** One trace per delegate and one for the total supply, keyed by the clock: the votes at a past
  timepoint are readable after it (`get_past_votes`, `get_past_total_supply`), which is what keeps a vote safe from
  shares borrowed for one block.
- **The clock: timestamp**, `ERC6372TimestampClock` (`OZ:utils-2.2.0/src/contract_clock/timestamp.cairo:3-13`), as
  Glitchbomb imports it (`GB:contracts/src/systems/vault.cairo:50`). A Governor's delay and period are then in
  seconds, independent of Starknet's block rate. Its `CLOCK_MODE` is the constant `"mode=timestamp&from=starknet::SN_MAIN"`
  (`timestamp.cairo:11-12`), on Sepolia too: cosmetic, but a Governor that compares the mode string sees the same one
  everywhere. What reverses it: the PM prefers block numbers (`contract_clock/block_number.cairo`).
- **SNIP-12 metadata**: section 1.

Entry points the share gains, beyond `stake`, `unstake`, `claim` and today's views:

| From | Entry points |
|---|---|
| ERC20 (`ERC20MixinImpl`, as `PavedToken` embeds it, `contracts/src/systems/token.cairo:65-66`) | `name`, `symbol`, `decimals`, `total_supply`, `balance_of`, `allowance`, `transfer`, `transfer_from`, `approve`, and the camel-case `totalSupply`, `balanceOf`, `transferFrom` |
| Votes (`VotesImpl`) | `get_votes`, `get_past_votes`, `get_past_total_supply`, `delegates`, `delegate`, `delegate_by_sig`, `clock`, `CLOCK_MODE` |
| Nonces (`NoncesImpl`) | `nonces` |

`staked(account)` and `total_staked()` stay, as `balance_of` and `total_supply` under their current names, so the
client and `deploy.sh` keep reading them.

**What a later Governor needs from them** (none reads them now, D-27 point 2): `get_past_votes(account, timepoint)`
for the weight of a vote at the proposal's snapshot; `get_past_total_supply(timepoint)` for a quorum as a fraction of
the supply (it counts every share, delegated or not); `clock` and `CLOCK_MODE`, which its own settings must match;
and holders who have delegated, which the client should prompt (a "delegate to myself" button), since undelegated
shares never vote. None of this needs a change to the Vault when the Governor comes: it is a new contract pointed at
the share's address.

## 5. The Glitchbomb mapping (superseded by the addendum)

| Glitchbomb component (`GB:contracts/src/systems/vault.cairo`) | Paved | Why |
|---|---|---|
| `ERC20Component` (`:72`, `:102-106`) | **taken** | The share. Mixin as in `PavedToken` |
| `VotesComponent` (`:69`, `:84-86`), `after_update` (`:259-267`) | **taken** | D-27 point 3, P-55 |
| `NoncesComponent` (`:70`, `:81-82`) | **taken** | `delegate_by_sig` needs it |
| `ERC6372TimestampClock` (`:50`), `SNIP12Metadata` (`:183-190`) | **taken** | Section 4 |
| `before_update` settling both sides (`:240-257`) | **taken, as `sync` plus `settle`** | Section 3; Paved's income is synced from the balance, not paid |
| `ERC4626Component` (`:71`, `:95-100`), its hooks and fee config (`:193-237`, `:396-416`) | left out | 1:1, section 2. No exit fee to price |
| `RewardableComponent` (`:73`, `:107-108`) and its world models | left out | Paved's `acc` already does it, with no world, and syncs instead of `pay`; `pay` reverts on an empty vault (`GB:contracts/src/components/rewardable.cairo:142`), which Paved avoids on purpose (`economy.md:560-563`) |
| The time lock on receipt (`GB:contracts/src/components/rewardable.cairo:96-98`, `:113-114`) | left out | "Lockup and exit fee: none" (`economy.md:567`); with transfers, a lock on the receiver would also let anyone lock anyone by sending them one share |
| `PausableComponent` (`:67`, `:88-90`, `:360-375`) | left out | No key may freeze stakers (`upgrade-owner.md:243-244`) |
| `AccessControlComponent` and its four roles (`:29-32`, `:66`, `:76-79`, `:161-167`) and `SRC5Component` (`:68`) | left out | No owner (`vault.cairo:9-10`). SRC5 served only AccessControl |
| `pay` (`:283-297`) | left out | Income is a plain transfer, synced (`vault.cairo:1-7`) |
| `collect` (`:327-357`), `set_fee` (`:319-325`), `open` / `close` (`:377-394`) | left out | Need a role; no Treasury (D-26). `collect`'s case is "For the PM", item 3 |

Glitchbomb's reward path has not run in production: its `vault_percentage` is 0 in every deployment file
(`docs/architecture/glitchbomb-gap.md:170-171`, `GB:dojo_mainnet.toml:58`). The pattern is sound, but Paved's tests
and audit are its first real check.

## 6. Effects elsewhere (superseded in part by the addendum: A3, A6)

- **Economy.** No code change. It pays the margin by a plain USDC transfer to the address in its storage
  (`economy.cairo:633-637`) and never calls the Vault. That address is set in the constructor only (`economy.cairo:558`,
  `:576`); there is no `set_vault` (its setters are `set_pool`, `set_game`, `set_router`, `economy.cairo:777-792`). In
  the fresh deployment of D-27 the new Vault is deployed before Economy and passed to it, as now
  (`scripts/deploy.sh:2641`, `:2704`). On a live deployment, replacing the Vault would need an Economy upgrade or a new
  setter, and a migration of the stakes: the fresh Sepolia makes that moot.
- **The indexer.** It reads the events of `Challenge`, `Setup`, `Economy` and `Collection` only
  (`packages/indexer/src/deployment.ts:55-58`), so the Vault's new events (`Transfer`, `Approval`, `DelegateChanged`,
  `DelegateVotesChanged`) do not reach it and cannot halt it on an unknown selector. `Staked`, `Unstaked`, `Claimed`
  and `Distributed` stay (`vault.cairo:94-130`). A future table of holders or votes would add the Vault as a fourth
  contract; it is not needed now.
- **The client.** The `Vault` ABI (`contracts/abis/Vault.json`, imported by `packages/chain/src/abis.ts:6`) is
  regenerated; `stake`, `unstake`, `claim`, `pending`, `staked`, `total_staked` keep their names and arguments
  (`packages/chain/src/economy/views.ts:128-132`, `writer.ts:365-392`). A stake's receipt then also carries `Transfer`
  and, once the staker has delegated, `DelegateVotesChanged`: the writer decodes receipts with the Vault's codec
  (`writer.ts:417-419`), so its tests check that the extra events decode. New, optional: showing the stPAVED balance
  as the stake, a transfer, and "delegate to myself". That is CLIENT's.
- **`deploy.sh`, the fresh path.** One new class: the declare (`scripts/deploy.sh:2611`) picks up the new Vault, and
  its constructor keeps `(paved, usdc)` (`:2641`), the name and symbol being constants. The owner's stake
  (`:2676-2689`) and the reads of `staked` (`:2680`, `:2735`, `:1047`, `:1089`) are unchanged. The comment "PavedToken
  and Vault have no owner and no upgrade" (`:202`) stays true unless the PM rules otherwise (item 2 below).
- **CASM.** Today's Vault measured 6,700 CASM felts in #262 (`docs/architecture/glitchbomb-gap.md:31`), and
  `PavedToken`, an ERC20 mixin with a minter, 8,055. An estimate, not a measure: ERC20 plus votes, nonces and SNIP-12
  should land the new Vault between 15,000 and 25,000 felts, far under the 81,920 cap (`docs/architecture/class-headroom.md:7`).
  The implementation PR measures it with `scripts/class-sizes.sh`.
- **P-42.** P-42 keeps `PavedToken` and `Vault` non-upgradable: "a fix to either is a documented migration"
  (`docs/programme/DECISIONS.md`, row P-42), and `upgrade-owner.md:95` counts "the stakers' PAVED and USDC in the
  `Vault`" among what no owner can touch. D-17 asks for upgrades "so that a fix keeps the games, the players and the
  stakes" (row D-17). The new Vault holds the stakes and now the votes, so the question is real: "For the PM", item 2.

## 7. The implementation plan (superseded by the addendum, A7)

One PR, CORE, after the PM's ruling on this note and before the fresh Sepolia deployment of D-27.

**Files**

- `contracts/Scarb.toml`, `contracts/Scarb.lock`: `openzeppelin_governance = "=4.0.1"` and
  `openzeppelin_utils = "=2.2.0"` (already in the lock through the token), pinned exactly as the others.
- `contracts/src/systems/vault.cairo`: the components (ERC20, Votes, Nonces), the hooks of section 3, `stake` and
  `unstake` through mint and burn, `stakes` and `total_staked` removed from storage, the views kept, a
  `VAULT_RECIPIENT` error, the module comment updated (a share, votes, still no owner).
- `contracts/abis/Vault.json`: regenerated.
- `contracts/src/tests/economy/vault.cairo`: today's tests kept (`:116-315`), new ones below.
- `docs/architecture/economy.md` section 4 (`:527-572`), `docs/architecture/public-interface.md` (the Vault's new entry
  points and events), `docs/architecture/glitchbomb-gap.md:182-183` (the share is no longer Governor-era): brought in
  line.
- `packages/chain`: the codec and writer tests for the new events (CLIENT, or in the same PR if the PM prefers).

**Tests**

- The reward invariant across transfers: a fuzz test of random stakes, transfers, `transfer_from`s, incomes, unstakes
  and claims among three accounts, which checks after every step that `Σ pending ≤ accounted ≤ USDC balance` and that
  `accounted − Σ pending` stays within the dust bound; then all claim and the Vault keeps only the dust.
- Exactness: income `I` with `A` staking alone, `A` transfers half to `B`, income `J`: `A` gets `I + J/2`, `B` gets
  `J/2`, to the dust bound. Income arriving between the transfer and the next action goes by the balances after it.
- A transfer to the Vault reverts; to zero reverts (the ERC20); to a contract that holds shares: its `pending` grows,
  others are unchanged.
- Votes: nothing counts before delegation; `delegate` to self gives `get_votes = balance`; a transfer moves votes
  between the delegates; `get_past_votes` and `get_past_total_supply` at an earlier timestamp; stake and unstake move
  the total supply checkpoint.
- Delegation by signature: a valid SNIP-12 signature works once; the same nonce again, an expired one, a wrong signer
  all revert.
- The ABI: `staked = balance_of`, `total_staked = total_supply` after every operation.
- `contracts/src/tests/e2e/upgrades.cairo:165-167` still finds no `upgrade` on the Vault (unless item 2 rules
  otherwise).
- Gas: the cost of `stake`, `unstake`, `claim` and a `transfer` measured against today's in the PR (the hook adds one
  USDC `balance_of` call to every transfer).

**Audits**

- **Security**: the hook (reentrancy through the PAVED and USDC calls, order of effects), `delegate_by_sig` and its
  nonces, the Vault-as-recipient check, the dependency pin.
- **Economy**: the invariant above, the dust, income that arrives while nobody stakes, a contract holder that cannot
  claim, and the votes' weight against the PAVED actually staked.

## For the PM (items 1 to 3 superseded by the addendum; item 2 ruled by P-56)

1. **P-31's reversal clause.** `economy.md:529` decided a simple vault, "not Nums' ERC4626", and `:570-571` names the
   reversal: "the owner wants a transferable or tradable share (an LP of vPAVED, governance). Then Nums' ERC4626 is
   ported, with its roles cut to none and its accumulator kept." D-27 point 3 triggers it, but this note recommends a
   1:1 share instead of the ERC4626 port (section 2); the accumulator is kept as the clause says. Your ruling settles
   which.
2. **Should the new Vault be upgradable (D-17, P-42)?** Today it is not, by P-42 and by design (`vault.cairo:9-10`,
   `upgrade-owner.md:95`, `:243-244`). Recommendation: **not upgradable**. An upgrade key over the Vault is a key over
   every staker's PAVED and USDC and, with P-55, over the votes a later DAO would rest on; the upgrade owner itself is
   a mainnet question that D-28 defers. A fix is then a new Vault and a migration (stakers unstake and stake again;
   Economy needs a way to point at the new Vault, which it lacks today, section 6). What reverses it: you rule the
   Vault upgradable; then it takes `UpgradeableComponent` with the two-step owner as Economy does
   (`economy.cairo:907-912`), joins P-42's list, and its owner falls under the deferred upgrade-owner gate.
3. **Shares held by a contract that cannot claim.** Their USDC is stranded in the Vault (section 3). Options: (a)
   accept it and say so in the client (recommended for now: no pool or escrow of stPAVED exists, and no role is
   needed); (b) a permissionless `claim_for(holder)` that pays the holder itself, which helps only contracts that can
   forward USDC; (c) Glitchbomb's `collect` with a role and a Treasury, against D-26 and the no-owner Vault. What would
   reopen it: an LP of stPAVED, which is the case Glitchbomb's `collect` was written for.
4. **No production evidence from Glitchbomb's reward path** (section 5): its vault income is 0 in every deployment.
5. Nothing in P-55 contradicts the code: the hook settles at the old balances because `before_update` runs before the
   balances change (`OZ:token-4.0.1/src/erc20/erc20.cairo:478`), and the voting units are the ERC20 balance, 1:1 with
   staked PAVED.
