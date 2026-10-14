# P-55: the Vault's share token with votes

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

## Summary

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

## 1. The share

| Property | Proposal | Why |
|---|---|---|
| Name | `Staked PAVED` | Says what one share is: one PAVED, staked. Glitchbomb's is `GLITCH (Vault)` (`GB:contracts/src/systems/vault.cairo:153`) |
| Symbol | `stPAVED` | The `st` prefix is the usual mark of a 1:1 staking receipt; `v` (Glitchbomb's `vGLITCH`, `economy.md:570`'s `vPAVED`) reads as a vault share with a moving price, which section 2 rejects |
| Decimals | 18 | 1:1 with PAVED, whose decimals are 18 (`contracts/src/systems/token.cairo:15`, `:70`). The OpenZeppelin ERC20 default is also 18 (`OZ:token-4.0.1/src/erc20/erc20.cairo:34`), so `DefaultConfig` serves |
| SNIP-12 metadata | name `'Staked PAVED'`, version `'1'` | Needed by `delegate_by_sig` (section 4). Glitchbomb uses `'vGLITCH'`, `'1.0.0'` (`GB:contracts/src/systems/vault.cairo:183-190`) |

What reverses it: the PM's choice of other names. Name and symbol are constructor constants: they cost nothing to
change before the fresh Sepolia deployment (D-27, point 1), and a new class after it.

## 2. 1:1 or pro-rata

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

## 3. Rewards across transfers

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

## 4. Votes

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

## 5. The Glitchbomb mapping

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

## 6. Effects elsewhere

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

## 7. The implementation plan

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

## For the PM

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
