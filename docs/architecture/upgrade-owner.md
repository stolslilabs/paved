# Mainnet gate: who owns the upgrades

A decision note for the mainnet gate "upgrade owner" (`economy.md`, "Gates before a real-money game on mainnet";
`upgrades.md`, "Trust"). Brief: `docs/briefs/g2-upgrade-owner.md`. D-17 made the contracts upgradable in place, P-42
gated `upgrade` by the repository's two-step `OwnableComponent`, and D-16 made the deployer that owner on Sepolia. P-42
names the mainnet options: the owner's account, then a multisig or a timelock. This note lists what that owner can do
today, weighs the options against it, and recommends one. Facts are checked against `main` at f94c34fd; `file:line`
are in that tree. `challenge.cairo` is cited by function name instead (since G4, which moved its lines), so those
anchors hold across later changes.

## 1. What the owner can do today

### Which contracts have an owner

| Contract | Owner | Upgradable | Source |
|---|---|---|---|
| `Challenge` | constructor `owner` | yes | `contracts/src/systems/challenge.cairo`: the `OwnableComponent` embed, the `constructor`, `UpgradeableImpl::upgrade` |
| `Economy` | constructor `owner` | yes | `contracts/src/systems/economy.cairo:415-420`, `:573`, `:906-912` |
| `Setup` | constructor `owner` | yes | `contracts/src/systems/setup.cairo:121-126`, `:226-228`, `:350-357` |
| `Collection` | constructor `owner` | yes | `contracts/src/systems/collection.cairo:239-244`, `:292-295`, `:363-370` |
| `PavedToken` | none: an `admin` sets the minter once and is then cleared | no | `contracts/src/systems/token.cairo:4-6`, `:117-126` |
| `Vault` (vPAVED, since P-56) | constructor `owner` | yes | `contracts/src/systems/vault.cairo`: the `OwnableComponent` embed, the `constructor`, `UpgradeableImpl::upgrade`, `set_exit_fee` |
| `Faucet` | none; never on mainnet (the constructor refuses `SN_MAIN`) | no | `contracts/src/systems/faucet.cairo:1-3`, `:101-104`; `scripts/deploy.sh:316-317` |

`MockAccount` (`contracts/src/mocks/account.cairo`) is a test mock, never deployed. `PavedToken` has no owner, but its
only minter is `Economy` for good (`token.cairo:128-134`): whoever controls `Economy`'s code controls the PAVED mint.

All five owned contracts share one mechanism (`contracts/src/components/ownable.cairo`):

- `assert_only_owner` compares the caller with `owner` (`ownable.cairo:96-98`). Every owner-only entry point below
  calls it; there is one owner per contract and no other role.
- `transfer_ownership(new)` records a pending owner, which the current owner may overwrite (`ownable.cairo:66-76`);
  `accept_ownership()` by that address completes it (`ownable.cairo:78-85`). Nothing checks what kind of address the
  new owner is: an account, a multisig or a timelock contract all work, as long as it can send the
  `accept_ownership` call itself.
- There is no `renounce_ownership`: the owner can never be zero (`ownable.cairo:72`, `:101`).
- `scripts/deploy.sh` never hands the ownership over: the deployer is the owner of all five (the `Vault` since
  P-56), and the smoke checks it
  (`scripts/deploy.sh:2497-2501`).

### Owner-only entry points, contract by contract

"Bounded" means the code limits what the call can do; "not bounded" means it does not.

**`Challenge`** (the game; holds no balance: a purchase pulls the price from the player straight to `Economy`,
`challenge.cairo` `purchase`, its `transferFrom`)

| Entry point | What it changes | Bounded by the code? | What a malicious or compromised owner can do |
|---|---|---|---|
| `upgrade(class_hash)` (`challenge.cairo` `UpgradeableImpl::upgrade`) | the whole code, storage kept | no (only class hash 0 is refused) | Any game rule, any score. `Economy.record` trusts the score `Challenge` reports (`economy.cairo:692-710`), so a new class can record the best score for games it buys and be paid up to `cap x R` each at settlement (mis-recorded scores, PAVED minted). It can spend whatever USDC allowance players left to `Challenge` (it is the spender of `transferFrom`, `challenge.cairo` `purchase`); the client approves exactly the price in the same multicall (`packages/chain/src/economy/writer.ts:291`), so that residue is small. It can block every game. |
| `set_setup(setup)` (`challenge.cairo` `set_setup`) | the `Setup`, hence the whole wiring (`challenge.cairo` `wiring`, called by `spawn_from`) | non-zero only | As strong as `upgrade` for new money: a fake `Setup` whose `wiring()` names any "economy" receives the full price of every later spawn (`challenge.cairo` `purchase`). Games in flight cannot end, since the new economy refuses a game it never sold (`economy.cairo:695`): it blocks games. |
| `transfer_ownership` | the owner | two-step | Hands every power here to another address. |

**`Economy`** (the PAVED minter, the purchase split and the settlement; holds nothing between transactions)

| Entry point | What it changes | Bounded by the code? | What a malicious or compromised owner can do |
|---|---|---|---|
| `upgrade(class_hash)` (`economy.cairo:906-912`) | the whole code, storage kept | no | Mint PAVED without limit (`token.cairo:128-134`) and sell it into the PAVED/USDC pool: the pool's USDC goes, every holder and staker is diluted. Take the price of every later purchase. Refuse settlements, so recorded games are never paid. It cannot touch the `Vault`'s stakes or USDC (`vault.cairo:9-10`). |
| `configure(config)` (`economy.cairo:772-775`) | the curve and the split: `burn_bps`, `sigma_bps`, `slope_bps`, `cap`, `target`, `referral_bps` (P-56; the Vault's part is `10,000 - burn_bps`) | **yes**: burn 50 % to 90 %, referral 0 to 10 % and at most the Vault's part, sigma -30 % to +50 %, slope 1,000 to 50,000 bps, cap 1 to 20, target 100,000 to 10,000,000 PAVED (`economy.cairo:44-53`, `:76-93`); evented | Only later purchases: each game freezes its terms at purchase (`economy.cairo:658-666`). The worst inside the bounds: sigma +50 % puts the threshold at 1.5 x the mean, so most games lose their stake. A player sees the threshold, slope and cap in `quote` before buying (`economy.cairo:802-827`). |
| `set_router(router)` (`economy.cairo:792-800`) | the router every swap and quote goes through | non-zero only; evented | As strong as `upgrade` for new money: `Economy` sends the burn share to the router before the swap (`economy.cairo:997`), and the player's `min_out` is checked against the router's own reported delta (`economy.cairo:1013`), so a hostile router keeps 50 % to 90 % of every purchase and burns nothing. The reward `R` stays capped by the price guard at 110 % of `quote x rate` (`curve.cairo:17`, `:55-57`), so it cannot inflate payouts beyond that. |
| `set_pool(pool_key, sqrt_ratio_limit)` (`economy.cairo:777-780`, `:961-968`) | fee, tick spacing, extension, price limit | tokens only: the key must be PAVED/USDC (`economy.cairo:963`); fee, extension and limit are free, and the side of the limit is not checked (`economy.md`, the router and limit gate) | With the real router a swap still pays at least the player's `min_out` (`economy.cairo:1013`), and the client's sanity floor (E-9b) rejects a poor quote. A wrong limit side reverts every purchase: it blocks new games, not those in flight. |
| `set_game(game)` (`economy.cairo:782-790`) | the game allowed to `purchase` and `record` | once, non-zero | Spent by `deploy.sh` (`scripts/deploy.sh:1783`). |
| `transfer_ownership` | the owner | two-step | As above. |

**`Setup`** (quests, achievements and, since D-25 E, the wiring `Challenge` reads at every spawn and game over)

| Entry point | What it changes | Bounded by the code? | What a malicious or compromised owner can do |
|---|---|---|---|
| `upgrade(class_hash)` (`setup.cairo:353-356`) | the whole code, storage kept | no | **On the money path**: `Challenge` reads `wiring()` at every spawn (`challenge.cairo` `spawn_from`, its `wiring` call), so a new class can name any economy and take the price of every later spawn, or block every game over (`challenge.cairo` `finish`, its `wiring(setup, false)` call). Any quest or achievement progress. |
| `set_economy`, `set_collection` (`setup.cairo:325-343`) | the wiring | once, non-zero | Spent by `deploy.sh` (`scripts/deploy.sh:1786-1787`). |
| `set_reporter(reporter, allowed)` (`setup.cairo:284-290`) | who may report progress | no | Allow any address: fake quest and achievement progress for any player (mis-recorded progress; no token or value in v1, `quests.md:149-151`). Revoke `Challenge`: its `report` reverts (`setup.cairo:300`), so every move that ends a game reverts (`challenge.cairo` `finish`, its `report` call): it blocks games. |
| `define_quest`, `define_achievement` (`setup.cairo:234-277`) | new definitions | a definition is created once and never edited; task totals positive and distinct (`setup.cairo:35-37`, `:374-387`) | Add quests or achievements players did not expect; display only in v1. |
| `retire_quest`, `retire_achievement` (`setup.cairo:257-260`, `:279-282`) | retires a definition | a retired id is never defined again | Remove a quest or achievement; display only. |
| `transfer_ownership` | the owner | two-step | As above. |

The quest and achievement components' own admin is the same owner (`setup.cairo:137-173`); their external layers are
not embedded, so they add no entry point.

**`Collection`** (the soulbound game NFTs; holds no value)

| Entry point | What it changes | Bounded by the code? | What a malicious or compromised owner can do |
|---|---|---|---|
| `upgrade(class_hash)` (`collection.cairo:366-369`) | the whole code, storage kept | no | Rewrite who owns which game token and its metadata. Make `mint` revert, and every spawn reverts with it (`challenge.cairo` `spawn_from`, its `mint` call): it blocks new games. |
| `set_minters(challenge, tutorial)` (`collection.cairo:328-340`) | who mints | once, non-zero `challenge`, two distinct addresses | Spent by `deploy.sh` (`scripts/deploy.sh:1789`). |
| `transfer_ownership` | the owner | two-step | As above. |

**`Vault`** (vPAVED, P-56: the stakers' PAVED, an ERC4626 share with votes; `docs/architecture/vault-share.md`)

| Entry point | What it changes | Bounded by the code? | What a malicious or compromised owner can do |
|---|---|---|---|
| `upgrade(class_hash)` (`vault.cairo` `UpgradeableImpl::upgrade`) | the whole code, storage kept | no (only class hash 0 is refused) | **Every staker's PAVED and the votes**: a new class can send the Vault's PAVED anywhere, mint or burn shares, rewrite delegations and checkpoints a later Governor would read, or refuse every exit. This is the reason P-56 gave it an owner (a fix without a migration of the stakes, D-27) and the reason it falls under the deferred upgrade-owner gate (D-28) |
| `set_exit_fee(bps)` (`vault.cairo` `set_exit_fee`) | the fee every `withdraw` and `redeem` leaves in the Vault | **yes**: 0 to 1,000 bps (owner, 2026-10-14); evented (`ExitFeeSet`) | Raise every exit's cost to 10 %, kept by the holders who stay (none of it reaches the owner). It cannot block an exit or take a stake |
| `transfer_ownership` | the owner | two-step | As above. |

The Vault has no other owner entry point: no pause, no setter of its asset, no sweep. Deposits, transfers, exits and
delegations stay each holder's own.

### In short

- **Bounded by the code**: `configure` (bounds, and later purchases only), the once-only setters (`set_game`,
  `set_economy`, `set_collection`, `set_minters`, all spent at deployment), the definitions (no edit, no reuse), and
  `Vault.set_exit_fee` (0 to 1,000 bps), and everything in `PavedToken` (no owner).
- **Not bounded**: the five `upgrade`s, `Challenge.set_setup`, `Economy.set_router`, `Setup.set_reporter` and the
  `Economy.set_pool` fields other than the tokens.
- **As strong as an upgrade for new money**: `Challenge.set_setup`, `Economy.set_router` and `Setup.upgrade` each take
  the price of every later purchase, without touching `Challenge`'s or `Economy`'s class.
- **What no owner can touch**: PAVED already held outside the `Vault` (since P-56 a `Vault` upgrade reaches the
  stakers' PAVED and the votes: above), and the terms of games
  already bought (except by an `Economy` upgrade that refuses to pay them).

## 2. The options

What every option shares: the owner is one address per contract, so "the owner" below is the same for all four (five
since P-56: the `Vault` joins them, and each option below covers it as it covers `Economy`)
contracts unless a row says otherwise. Contracts can have different owners (each has its own `owner` slot), but the
three money-path powers sit in three different contracts (`Challenge`, `Economy`, `Setup`), so splitting them by
contract protects nothing.

### (a) The owner account, as on Sepolia

One key: the deployer stays the owner of the four contracts (D-16 on Sepolia).

- **Operations**: the owner signs alone; a fix ships as soon as it is built, rehearsed and declared, in one owner
  multicall. Nothing in `deploy.sh` changes.
- **Trust for players**: the lowest. One leaked or lost key is every power of section 1 at once: the price of every
  later purchase, the PAVED mint, and no way back (a lost key also means no fix, ever).
- **D-17 path**: unchanged (rehearse, declare, `upgrade`, read `owner()` back).
- **Two-step Ownable**: nothing to transfer.

### (b) A multisig (M of N)

A Starknet multisig account or contract owns the four contracts; a call needs M of N signatures. Example: 2 of 3,
the keys on three separate devices of the owner (a hardware wallet, a second device, a recovery key kept offline), or
one key held by a second trusted person. Candidates exist (a multisig account of a Starknet wallet; OpenZeppelin
Cairo's governance package, not a dependency of the contracts today, `contracts/Scarb.lock`); the choice is outside
this note and is not verified here.

- **Operations**: every owner call needs M signatures; an emergency fix waits for M signers to be reachable (minutes
  to hours). Routine owner calls are rare once the deployment is wired (the once-only setters are spent).
- **Trust for players**: one stolen key is no longer enough; M colluding or compromised keys still hold every power
  of section 1, instantly. Players get no warning before an upgrade.
- **`deploy.sh`**: the deployment and the wiring stay as today (the deployer owns everything while it wires); a last
  step sends `transfer_ownership(multisig)` on the four contracts, then the multisig sends the four
  `accept_ownership` in one multicall, and the smoke reads `owner()` == the multisig instead of the deployer
  (`scripts/deploy.sh:2497-2501`). Later upgrade paths (as `--repoint` and `--d18` were) produce the owner's calls for
  the multisig to sign instead of sending them from the deployer.
- **D-17 path**: unchanged in substance (rehearse on devnet from the deployed state, declare, storage diff, then the
  multisig sends `upgrade` with any setter in one multicall).
- **Two-step Ownable**: supports it as it is: the multisig, as the pending owner, sends `accept_ownership` itself.

### (c) A timelock

A timelock contract owns the four contracts: an owner call is scheduled first and can be executed only after a
delay; the schedule is public (an event), so players see an upgrade coming.

- **Which calls**: all of them. The owner is one address per contract (`ownable.cairo:96-98`), so a timelock that
  owns a contract delays every owner entry point of it, `upgrade` and setters alike. And it should: `set_setup`,
  `set_router` and `Setup.upgrade` are as strong as an upgrade (section 1), so a timelock that let them through
  immediately would protect nothing.
- **How long**: **48 hours** recommended. A game bought on day `d` can be settled from the end of day `d + 1`
  (`economy.cairo:729`), at most 48 hours after its purchase. With a 48-hour delay, a player who stops buying when an
  upgrade is scheduled can have every game of theirs settled (by anyone) before it executes; stakers can redeem at
  once (no lock; the exit fee since P-56) and holders can sell.
- **Operations**: whoever proposes and executes on the timelock (the owner's account, or a multisig: option (d)) does
  so in two transactions, 48 hours apart. **An emergency fix waits 48 hours too**, and today nothing stops the damage
  meanwhile (section 3).
- **Trust for players**: the highest of the single options: no instant change of the rules, the code or the money
  path. A compromised proposer is seen 48 hours ahead, though nobody can cancel its proposal but the timelock's own
  roles.
- **`deploy.sh`**: as (b), the handover to the timelock; `accept_ownership` is itself a timelocked call, so the
  handover takes the delay. Upgrade paths produce a schedule and, after the delay, an execute.
- **D-17 path**: the rehearsal must be run again right before the execution if mainnet state moved meanwhile (the
  storage diff does not change, the deployed state does).
- **Two-step Ownable**: supports it as it is: the timelock executes `accept_ownership` as one of its operations.

### (d) Combinations

- **A multisig behind a timelock**: the multisig is the timelock's proposer and executor. Players get the warning,
  and one stolen key cannot even propose. The cost is the sum: M signatures twice, 48 hours apart, for every owner
  call, emergencies included. Same `deploy.sh` and Ownable remarks as (b) and (c).
- **A timelock on `upgrade` only, the setters immediate**: **cannot be done with the contracts as they are**: one
  owner per contract gates every owner entry point (`ownable.cairo:96-98`; `challenge.cairo` `set_setup`, `UpgradeableImpl::upgrade`;
  `economy.cairo:773`, `:778`, `:784`, `:794`, `:909`; `setup.cairo:242-337`, `:354`; `collection.cairo:331`,
  `:367`). It would need a second role in the code. And it would be hollow: `Challenge.set_setup` and
  `Economy.set_router` reach the money as an upgrade does. A useful split would be the reverse: a separate role for
  the harmless calls only (`define_*`, `retire_*`, `configure` within its bounds), everything else timelocked; that
  is a code change, for its own task.

### The options side by side

| | Who signs | Emergency fix | Warning to players | One stolen key | `deploy.sh` change | Ownable as it is |
|---|---|---|---|---|---|---|
| (a) owner account | the owner | immediate | none | everything | none | yes |
| (b) multisig M of N | M of N keys | M signers reachable | none | nothing | handover + smoke | yes |
| (c) timelock 48 h | the proposer | 48 h, no pause today | 48 h | everything, 48 h late and in public | handover (timelocked) + smoke + schedule/execute | yes |
| (d) multisig behind timelock | M of N, twice | 48 h + M signers | 48 h | nothing | as (c) | yes |
| timelock on `upgrade` only | | | | | | **no**: one owner per contract |

## 3. Emergencies

How a bug fix ships today, under each option: the class is built from a commit that passes the layout pins, its
storage diffed against the deployed one, the upgrade rehearsed on devnet from the deployed state (`upgrades.md`,
"Storage layout discipline"), the class declared (anyone may declare), then the owner sends `upgrade` (and any setter)
in one multicall.

- (a): as soon as the class is ready.
- (b): as soon as M signers have signed.
- (c) and (d): 48 hours after the schedule, plus the signatures. A timelock delays fixes exactly as it delays attacks.

**The pause guardian on `Challenge.spawn` (G4, `docs/briefs/g4-pause-guardian.md`; built after this note).** It is the
only pause in the contracts (the `Vault` still has none, as intended, P-56):

- **Who.** The guardian is an address the owner sets with `Challenge.set_guardian(address)` (owner only; zero means no
  guardian; emits `GuardianSet`). The guardian or the owner calls `pause_spawn()` (emits `SpawnPaused { by }` once; a
  pause while paused does nothing and does not revert); only the owner calls `unpause_spawn()` (emits `SpawnUnpaused`
  once; idempotent too). The owner may pause as well: the owner can do everything the guardian can (CORE's decision,
  reversed if the PM wants the guardian alone to pause).
- **What stops.** `spawn` only: while paused it reverts with `'Challenge: spawn paused'`, its first check, before the
  call to `Setup` and before any token moves. No new purchase, no new money in.
- **What does not stop.** Every game already bought: `build`, `discard`, `surrender`, the game-over report to `Setup`,
  `Economy.record` and `Economy.settle` all work while paused (`tests::e2e::guardian`). A pause cannot hold players'
  money, and it never touches the `Vault`.
- **Views.** `guardian()` and `spawn_paused()`.
- **Ownership.** The two-step `OwnableComponent` is unchanged: after a transfer the new owner unpauses, sets the
  guardian and pauses, the old owner can do none of it; a pending owner can do none of it before it accepts. **The
  guardian survives the transfer**: the guardian set before it is kept (`test_guardian_new_owner_holds_the_pause`).
  So a transfer made because the owner was compromised must be followed by `set_guardian` to a trusted address or to
  zero: a guardian the attacker set before the transfer can otherwise still pause spawn after it. The new owner's
  first multicall (under a timelock, its first scheduled batch) is, in this order: **`accept_ownership`, then
  `set_guardian`, then `unpause_spawn`** (the last only if spawn is paused). `set_guardian` and `unpause_spawn` are
  owner-only, and a pending owner is not the owner until `accept_ownership` runs, so neither can come before it.
- **Deployment and upgrade.** A fresh `scripts/deploy.sh` run deploys with no guardian (zero) and spawn not paused; the
  owner then calls `set_guardian`. An in-place upgrade of `Challenge` (D-17, Sepolia) reads the two new slots as zero
  and false: no guardian, spawn not paused, games in flight unaffected (`tests::e2e::upgrade_g4`).

With a timelock, the guardian is what keeps emergencies answerable within minutes while the fix waits its 48 hours: a
guardian key outside the timelock pauses at once, and the unpause (an owner call) waits the delay like any other. A
stolen guardian key never reaches money; it can only stop new games, until the owner recovers as follows.

**Recovery after a stolen guardian key.** The owner replaces or clears the guardian (`set_guardian(new)` or
`set_guardian(0)`) and unpauses (`unpause_spawn`) in **one owner multicall, `set_guardian` first**. No state then
exists where the old guardian can act on an unpaused spawn. Never unpause first, alone or in an earlier transaction:
the thief, still the guardian, pauses again right after (or front-runs the unpause), and the owner has spent a call
for nothing. Under a timelock both calls go in **one scheduled batch**: two separate schedules leave a window, between
their executions, where the old guardian is still set on an unpaused spawn, or still set after the unpause if the
order slips.

Two stop-gaps exist without the guardian, both owner calls, so both delayed by a timelock:

- **Stop new games and game overs, restorably**: `Challenge.set_setup` to a fresh `Setup` whose wiring is not set.
  Every spawn then reverts (`'Challenge: economy not set'`, `challenge.cairo` `wiring`, called by `spawn_from`) and so
  does every move that ends a game (`challenge.cairo` `finish`, its `wiring(setup, false)` call); other moves go on. `set_setup` back to the real `Setup` restores
  everything (its once-only wiring is untouched). Its cost: a game whose end is held past its day records as
  expired and gets no reward (`economy.cairo:701`). The guardian's pause has no such cost.
- **Upgrade to a class that refuses `spawn`**: the same effect, with a class to build, rehearse and declare.

A pause is worth it on one thing only, new money in: never on the moves, the settlement, or the `Vault` (its exits,
`withdraw` and `redeem`, must stay out of any key's reach: P-56 gave its owner the upgrade and a bounded fee, no pause), where a pause would be a way to hold players'
money. The guardian follows that line. Its access control is for the audit that follows G4.

## 4. Recommendation

**At launch, (b): a 2-of-3 multisig owns `Challenge`, `Economy`, `Setup` and `Collection` (and the `Vault`, since
P-56); the deployer hands the
ownership over (two-step) at the end of the deployment. Then (d): once a pause guardian on `Challenge.spawn` exists,
a 48-hour timelock goes in front of that multisig, for every owner call.**

Why:

- The owner account (a) puts every power of section 1, including the price of every later purchase and the PAVED
  mint, behind one key. For real money that is the one option to rule out.
- A timelock from day one, with no pause in the contracts, means the first mainnet bug stays open 48 hours with only
  the `set_setup` stop-gap, itself delayed 48 hours. The first weeks of mainnet are when fixes are most likely.
- The multisig works with the contracts as they are (section 2 (b)), costs one `deploy.sh` step and a changed smoke,
  and removes the single point of failure now. The timelock adds the players' warning once a guardian makes it safe.

What would reverse it:

- The owner cannot hold three separate keys (or name a second holder): stay on (a) until they can, and say so to
  players.
- The owner wants the players' warning from day one and accepts that a fix waits 48 hours: (d) at launch.
- An audit finds a power of section 1 that a timelock must cover from the start, or a guardian lands before mainnet:
  (d) at launch.

### The owner's sentences

For the PM to put to the owner, one per option (the bracketed parts are the owner's to fill):

- (a): "On mainnet the upgrade owner of Economy, Challenge, Setup and Collection is my account [address], with no
  multisig and no timelock."
- (b): "On mainnet the upgrade owner of Economy, Challenge, Setup and Collection is a [2]-of-[3] Starknet multisig
  whose keys are held by [holders]; the deployer hands the ownership to it at the end of the deployment."
- (c): "On mainnet the upgrade owner of Economy, Challenge, Setup and Collection is a timelock with a delay of
  [48] hours, whose proposer and executor is my account [address]; every owner call waits that delay."
- (d): "On mainnet the upgrade owner of Economy, Challenge, Setup and Collection is a timelock with a delay of
  [48] hours, whose proposer and executor is a [2]-of-[3] Starknet multisig whose keys are held by [holders]."
- Recommended: "On mainnet the upgrade owner of Economy, Challenge, Setup and Collection is a [2]-of-[3] Starknet
  multisig whose keys are held by [holders]; a [48]-hour timelock goes in front of it once a pause on new games
  exists."

## For the PM

- **A timelock on `upgrade` only, with the setters immediate, cannot work with the contracts as they are**: one owner
  per contract gates every owner entry point (`contracts/src/components/ownable.cairo:96-98`, called by each setter
  and each `upgrade`, section 2 (d)). It would also leave `Challenge.set_setup` (`challenge.cairo` `set_setup`) and
  `Economy.set_router` (`economy.cairo:792-800`) immediate, and both reach the price of every later purchase.
- **`Setup` is on the money path** since D-25 E: `Challenge` reads its wiring at every spawn (`challenge.cairo` `spawn_from`, its `wiring` call),
  so `Setup`'s owner is as critical as `Economy`'s. `upgrades.md`, "Trust", still lists the owner's reach as
  `Challenge`, `Economy`, `Account` and `Collection` (and `set_lobby_class`, gone since D-24); it predates D-24 and
  D-25 E. Not edited here (allowlist).
- **No pause exists**; a guardian on `Challenge.spawn` is a code task with an access-control audit, and a
  precondition of the timelock in the recommendation.
- **`set_router` and `set_pool` are not bounded** beyond a non-zero address and the pool's tokens. A router allowlist
  or a timelock is what bounds them; the router pin (E-9b) is a deploy-time check only.
- The choice of the multisig and timelock contracts (which implementation, audited or not) is open; none is a
  dependency of the contracts today (`contracts/Scarb.lock`).
- Handing the ownership over is the owner's act on mainnet (`economy.md`, "Gates before a real-money game on
  mainnet"); `deploy.sh` has no handover step today (it refuses mainnet, `scripts/deploy.sh:316-317`).
