# Upgrades (D-17, P-42)

Since Dojo left (P2), nothing redeployed the game but a full redeploy, which loses every game, player and stake. D-17
(owner, 2026-10-10) asks for contracts that are upgraded in place; P-42 (PM, 2026-10-10) fixes the design below. Brief:
`docs/briefs/u1-upgradable.md`. It lands before the Sepolia deployment, so the Sepolia contracts are upgradable from
day one and the playtest data survives fixes.

## What is upgradable

Names in the tables of this note: a row or a column about the contract in today's tree says `Challenge`; one about
the deployed Sepolia contract or a past step ("was written by", "run by") says `Daily`, its name before D-23.

| Contract | Upgradable | Owner | Why |
|---|---|---|---|
| `Challenge` (named `Daily` before D-23) | yes | constructor `owner` | the game (the prize pools left with D-20) |
| `Tutorial` | yes | constructor `owner` | the tutorial game |
| `Account` | removed (D-25 E) | | the player registry and the wiring until step E; deleted, a minimal mock serves one test (below) |
| `Setup` | yes | constructor `owner` | the quests and achievements (D-24) and, since D-25 E, the wiring `Challenge` reads |
| `Economy` | yes | constructor `owner` | the minter of PAVED and the purchase and settlement logic; holds nothing between transactions |
| `Collection` | yes | constructor `owner` | the game NFTs |
| `Lobby` | no instance | none | a declared class, run by `Daily` and `Tutorial`; replaced by `set_lobby_class` (below) |
| `PavedToken` | **no** | none (admin cleared by `set_minter`) | a standard ERC20; an upgrade key would be a mint and seize key |
| `Vault` (vPAVED) | yes, since P-56 | constructor `owner` | the stakers' PAVED behind an ERC4626 share with votes; its owner may also set the exit fee (0 to 1,000 bps). Before P-56: not upgradable, no owner (a custody key) |

## Mechanism

- **`upgrade(new_class_hash)`** is OpenZeppelin's `UpgradeableComponent` (`openzeppelin_upgrades` `=4.0.1`, the
  release of `openzeppelin_token =4.0.1`): `replace_class_syscall`, then OpenZeppelin's `Upgraded { class_hash }`
  event. It reverts on a zero class hash (`Class hash cannot be zero`). The entry point is OpenZeppelin's
  `IUpgradeable` (`openzeppelin_interfaces::upgrades`). The component has no storage.
- **The gate** is the repository's own `OwnableComponent` (`components/ownable.cairo`): `upgrade` first checks
  `assert_only_owner` (`Ownable: caller is not owner`). It is two-step: `transfer_ownership(new)` only records a
  pending owner, `accept_ownership()` by that address completes it. `Daily`, `Tutorial` and `Account` already
  embedded it; `Economy` and `Collection`, which had a one-step `owner` field, embed it now. OpenZeppelin's
  `OwnableComponent` is not used: its storage is `Ownable_owner` and `Ownable_pending_owner`, so switching would
  move the owner of `Daily`, `Tutorial` and `Account` to new slots and break the layout `Lobby` shares with them (it
  checks `owner` for the quest and achievement definitions). Its size was not measured.
- **Before U-1** the repository's `OwnableComponent` carried its own `upgrade` (same `Upgraded` event, same keys and
  data: the selector of `Upgraded` and one `class_hash` felt). It is removed, so each contract has one `upgrade`, the
  OpenZeppelin one. The error of a zero class hash changes from `Ownable: class hash is zero` to OpenZeppelin's.
- **The owner** is the deployer: `scripts/deploy.sh` passes it to the five constructors and its smoke reads
  `owner()` back on each. On mainnet the owner is the owner's account, later a multisig or a timelock (an owner's act,
  `economy.md`, "Gates before a real-money game on mainnet").

## The Lobby path (ended with D-24)

**Since D-24 this path is history**: `Challenge` runs its cold paths itself, `set_lobby_class`, `ILobbyClass` and
`LobbyClassSet` are gone, and the `Lobby` class is deleted (the name is kept for multiplayer, P-51 (2)). `lobby_class`
stays declared in `Challenge`, dead (below, "Dead slots since D-21 and D-24"). Sepolia is not upgraded to these classes:
P-53 decided one fresh deployment, where `Challenge`'s constructor sets `setup`. The old Sepolia `Daily` and `Tutorial` keep
their `Lobby`. What follows is the path as it was.

`Daily` and `Tutorial` run `spawn`, `claim`, `sponsor`, `discard`, `surrender`, the reports and the quest definitions in
the `Lobby` class by library call (P-26). P-26 made its class hash, `lobby_class`, immutable. P-42 reverses that:

- **`set_lobby_class(class_hash)`** (gone since D-24, see above) on `Daily` and on `Tutorial` (interface `ILobbyClass`, `systems/lobby.cairo`): the
  owner only (`Ownable: caller is not owner`), never zero (`Daily: lobby class is zero`,
  `Tutorial: lobby class is zero`), emits `LobbyClassSet { class_hash }` from the game contract. The next call runs
  the new class.
- **No view** returns `lobby_class`: it is read at its raw slot, `sn_keccak("lobby_class")`
  (`starknet_getStorageAt`). A view would cost `Daily` room it does not have.
- The class must be declared first, as `deploy.sh` checks for the constructors; an undeclared class makes every
  library call revert until the owner sets a declared one.
- **Alternatives measured** (CASM felts of `Daily`, `scripts/class-sizes.sh`; main before U-1: 72,607):

  | Option | `Daily` | `Lobby` | Note |
  |---|---|---|---|
  | OpenZeppelin `upgrade` only, no setter | 72,622 (+15) | 61,301 | the floor of U-1 |
  | (a) `set_lobby_class` in `Daily` (built) | 72,947 (+340) | 61,301 | as P-42 asks |
  | (b) `set_lobby_class` runs in `Lobby`, `Daily` keeps a wrapper | 72,811 (+204) | 61,647 (+346) | `Lobby` declares `lobby_class`; a broken `Lobby` can no longer set its successor, `upgrade` stays the way out |
  | (c) no setter: the owner upgrades to a one-shot migration class that writes `lobby_class` and replaces the class back, both calls in one multicall | 72,622 (+15) | 61,301 | nothing in `Daily`; one more class to declare per change |
  | (a) and the view `current_tournament_id` dropped | 72,865 (+258) | 61,301 | dropping a view saves 82 |

  P-44 (PM, 2026-10-10) chose (a) and set `Daily`'s cap to 72,947 (`class-headroom.md`, "Cap of `Daily` after
  U-1").

## Storage layout discipline

An upgrade replaces the code and keeps the storage. The new class reads the old values only if it finds them at the
same addresses, and a variable's address is its name (`sn_keccak(name)`, or a hash of the name and the keys for a
map). So, for every upgradable contract and for `Lobby`:

- **Never rename or retype a storage variable.** A rename moves it to a fresh, empty slot; a retype reads the old
  bytes with the new type's packing (the packed records of `Economy`, `Terms`, `Outcome`, `Config`, `Guard`, are the
  sharpest case).
- **Add new fields only.** A new variable gets a new name; a variable no longer used stays declared (or its name is
  never reused).
- **Components keep their substorage names and stay flat** (`#[substorage(v0)]`): `ownable`, `upgradeable`,
  `hostable`, `payable`, `playable`, `tutoriable`, `quest`, `achievement`, `manageable`. The variables of a flat
  component sit at their own names, so `owner` of `Economy` and `Collection` kept its slot when the field moved into
  `OwnableComponent`.
- **`Lobby` and `Daily`/`Tutorial` share one layout (P-26).** `Lobby`'s code runs on the game contract's storage. A
  new class of either side keeps the other's names; a new `Lobby` class set by `set_lobby_class` is held to the
  same rule as an upgrade.
- **Pins.** `tests::e2e::cold_paths_audit::test_daily_pins_its_storage_variables_by_name` (`owner`,
  `pending_owner`, `token_address`, `setup`, `guardian`, `spawn_paused`, and since #645 `vrf_provider`,
  `vrf_last_draw_tx` and `vrf_spawn_counts` of `Challenge`; it replaced the pin of the variables `Lobby` shared with
  `Daily`, `test_lobby_and_daily_pin_every_shared_storage_variable_by_name`, at D-24) and `tests::e2e::upgrades::test_upgrade_layout_pins_setup_and_economy_by_name` (the
  ownable and the wiring of `Setup`, `economy` and `collection`, which were `Account`'s pins until D-25 E; the
  addresses, pool, packed records and purchase maps of `Economy`) read each variable at the
  raw address of its name. Whoever adds a variable adds it there.
- **Packed slots keep their bits.** A field added to a packed slot takes bits that are free in every slot written
  before, so that an old slot reads the new field as 0; dead bits are never reused. The tile slot
  (`PavedStorage.tiles`, `(game_id, tile_id)`, shared by `Daily`, `Tutorial` and `Lobby`) since D-19:

  | Bits | Field |
  |---|---|
  | 0..8 | plan |
  | 8..16 | orientation |
  | 16..48 | x |
  | 48..80 | y |
  | 80..88 | the occupied spot, dead since D-18: never read, written 0, never reused |
  | 88..96 | never stored: the tile id that `Store::tile_slot_at` adds in memory |
  | 96..104 | the owner's seat (D-19; 0 is the game's player, what every slot written before D-19 reads) |
  | 104..128 | free (24 bits) |
  | 128..236 | the refs of the tile's nodes on the structure state (108 bits) |
  | 236..251 | free (15 bits, under the felt's bound) |

  Free bits: 47 before D-19 (96..128 and 236..251), 39 after. A seat-0 tile (every tile of Daily and Tutorial) packs
  bit for bit as before D-19: `tests::owners::test_owners_seat_zero_slot_is_the_d18_packing` reads a placed tile at
  the raw address of `tiles` and compares it with D-18's packing.
- **Before an upgrade on a public network:** the new class is built from a commit that passes those pins, the storage
  of the old class is diffed against the new one by name and type (the `#[storage]` structs and the components), and
  the upgrade is rehearsed on devnet from the deployed state (`--rehearse`).
- **Before an upgrade on a public network, the way out stays:** the new class keeps `upgrade`, the ownable entry
  points (`owner`, `transfer_ownership`, `accept_ownership`) and, for `Daily` and `Tutorial`, `set_lobby_class`, and
  it is never the `Lobby` class. Only class hash 0 is refused: a class without these entry points freezes the contract
  for good, with no owner able to upgrade it again.

## Dead slots since D-21 and D-24 (P-42)

Declared, never written or read again, never reused; a comment says so where each is declared. "Declared in" is
today's tree (`Challenge`); "Was written by" is the past (`Daily`, `Lobby`).

| Slot | Declared in | Was written by |
|---|---|---|
| `lobby_class: ClassHash` | `Challenge` (`systems/challenge.cairo`) | `Daily`'s constructor and `set_lobby_class` (gone) |
| `Quest_definitions`, `Quest_tasks`, `Quest_conditions`, `Quest_progress`, `Quest_records`, `Quest_held`, `Quest_reporters` (the flat `quest` substorage) | `Challenge` | the definitions and the reports run in `Lobby` (now `Setup`'s, in `Setup`'s own storage) |
| `Achievement_definitions`, `Achievement_extra_tasks`, `Achievement_reporters` (the flat `achievement` substorage) | `Challenge` | the same |
| `tutoriable` (empty substorage) | was `Lobby`'s and `Tutorial`'s | nothing: its storage was empty, so `Challenge` holds no slot of it |

`Challenge` keeps the `quest` and `achievement` members as `#[substorage(v0)]` of quiver's component storages without
declaring the components, so the slots keep their names and the quiver events leave `Challenge`'s ABI. On Sepolia the dead
slots keep what they hold (the definitions of the accepted list, `lobby_class`); `Setup`'s storage is fresh, and past
progress is not migrated (P-51 (5)). `Tutorial`'s whole storage stays as it is, in a contract nobody uses after the
upgrade.

**Pins.** `tests::e2e::cold_paths_audit::test_daily_pins_the_dead_fields_by_name` pins the D-24 slots with D-20's:
the address `Challenge` resolves through each member's name (a test-only accessor, `Challenge::DeadFieldsTrait::dead_addresses`,
for `lobby_class` and the ten quiver members; `HostableComponent::DeadFieldsTrait` for `sponsorships`; `PavedStorage`
for `tournaments` and `rankings`) equals the address computed from the literal name, and sentinels written at every one
survive a whole game (the accepted list defined on `Setup`, then spawn, build, discard and surrender, each game over
reported to `Setup`).

**New live slot**: `Challenge.setup: ContractAddress`, written by the constructor and by the owner's `set_setup` (P-42).
Since step E it is the one address `Challenge` reads its wiring from (below).

**Rule for any future in-place upgrade of a game contract without `setup`** (an old `Daily`; D-17; mainnet later; not
Sepolia, P-53): deploy `Setup` and call `Setup.set_reporter(game, true)` first, then send the game's `upgrade` and
`set_setup(Setup)` in one owner multicall, and read `setup()` back. Until step E, a zero `setup` let a game over end and be recorded with
its progress lost; since step E the wiring is `Setup`'s, so with a zero `setup` a spawn and a game over both revert
(`'Challenge: setup is zero'`, `'Daily: ...'` before D-23) and the game stays live until `set_setup` runs. Before such an upgrade, `Setup` also needs
`set_economy` and `set_collection` (the addresses the old `Account` held).

**Re-pointing `Challenge` to another `Setup` (`set_setup`) re-points the whole wiring** since D-25 E: every later spawn
pays into and mints from, and every later game over records into, the new `Setup`'s economy and collection, not only
the reports. Re-point only with no game in flight: a game bought under one economy would be recorded on another, whose
`record` refuses a game it never sold (`'Economy: unknown game'`), so that game could not end (security note 1 and
economy note N1 of #350).

**`Setup`'s setters are once-only.** A wrong address is fixed in one of two ways:
- an upgrade of `Setup` to a class that can write the slot (owner only; the slots are pinned by name);
- a new `Setup`, wired and allowlisting `Challenge`, then `Challenge.set_setup` to it (under the rule above). This loses the old
  `Setup`'s reporters and tutorial claims; the quests and achievements are event mode, so their state is the indexer's
  and stays readable from the old `Setup`'s events.

## New live slots since G4 (P-42)

The pause guardian on `Challenge.spawn` (G4, `upgrade-owner.md`, section 3) appends two variables to `Challenge`, after
`setup`; nothing is renamed, retyped or reused:

| Slot | Type | Written by | After an in-place upgrade |
|---|---|---|---|
| `guardian` (`selector!("guardian")`) | `ContractAddress` | the owner's `set_guardian` only (zero: no guardian) | 0: no guardian |
| `spawn_paused` (`selector!("spawn_paused")`) | `bool` | `pause_spawn` (the guardian or the owner) and the owner's `unpause_spawn` | 0: spawn not paused |

**Pins.** `test_daily_pins_its_storage_variables_by_name` reads both at the raw address of their names: 0 on a fresh
deployment, the guardian and 1 after `set_guardian` and `pause_spawn`, 0 again after `unpause_spawn`.
`tests::e2e::upgrade_g4::test_upgrade_g4_starts_unpaused_and_keeps_the_game_in_flight` gives `Challenge` a class
without the two slots (the frozen spawn of `legacy_g1`), spawns a game, reads both raw slots as 0, upgrades back to the
G4 class, and then reads no guardian and no pause; a new game spawns and the game in flight ends and is recorded.

**On Sepolia (D-17)** the upgrade of `Challenge` to the G4 class is the owner's `upgrade` alone: no setter is needed,
spawn stays open, games in flight are unaffected. The owner sets a guardian afterwards (`set_guardian`), if any.

## New live slots and bits since CHALLENGE-VRF (#645, P-42)

The Challenge on the VRF (`challenge-vrf.md`) appends three variables to `Challenge`, after `spawn_paused`, and takes 11
bits of `GameState` that every slot written before holds as 0; nothing is renamed, retyped or reused:

| Slot | Type | Written by | After an in-place upgrade |
|---|---|---|---|
| `vrf_provider` (the flat `drawable` substorage of `DrawableComponent`) | `ContractAddress` | the owner's `set_vrf_provider` only | 0: no provider, so no spawn and no drawing move until the owner sets it |
| `vrf_last_draw_tx` (the same) | `felt252` | each draw: the hash of its transaction | 0 |
| `vrf_spawn_counts` (`Map<ContractAddress, u32>`) | the spawns each player drew, the index of the next spawn's salt | 0 for every player |

The high half of `GameState`'s second slot (`PavedStorage.game_states`), since #645:

| Bits | Field |
|---|---|
| 0..8 | `tile_count` |
| 8..40 | `score` |
| 40..48 | `discarded` |
| 48..56 | `built` |
| 56 | `over` |
| 64..72 | `held_tile` |
| 72..88 | the roles before D-18: dead, written 0, never reused |
| 88..111 | the four counters (23 bits) |
| 111 | the free mark (cobbles v1) |
| 112..117 | `next`: the plan of tile `held_tile + 1` (#645) |
| 117..122 | `after`: the plan of tile `held_tile + 2` (#645) |
| 122 | the VRF mark (#645) |

The high half stays below 2^123, so the slot (`tiles + high x 2^128`) stays under the felt's bound. A game spawned
before #645 reads its queue and mark as 0: its first move under the new class fills both from one draw
(`challenge-vrf.md`, section 2.4).

**A rollback is not free.** A class from before #645 reads every bit above 88 of `GameState` as its counters, into a
`u32`: it cannot read a game that has a queue (the read panics). Roll `Challenge` back to such a class only with no VRF
game in flight. The frozen classes of the tests are given a game without a queue
(`tests::e2e::upgrade_d18::install_before_d18`).

**Pins.** `test_daily_pins_its_storage_variables_by_name` reads `vrf_provider`, `vrf_last_draw_tx` and the entry of
`vrf_spawn_counts` at the raw address of their names, before and after a spawn in a known transaction.
`tests::e2e::store::test_store_round_trips_at_maximum_values` sets every bit of the queue with the counters and the free
mark at their maximum, and reads them all back.

## The Vault's layout and Economy's split since P-56 (P-42)

**The Vault** is a new class at a new address (the fresh Sepolia of D-27), so nothing of the former `Vault` carries
over and no slot is dead. From its first deployment on it follows P-42's rules.

- Its substorage names are pinned by `test_upgrade_layout_pins_the_vault_by_name`, read at the raw address of each
  name after a paid spawn, a delegation and a pending transfer:
  - `owner` and `pending_owner`, flat;
  - `ERC20_total_supply` and `ERC20_balances`, the owner's entry and the dead shares';
  - `ERC4626_asset`;
  - `Votes_delegatee` and `Votes_total_checkpoints`;
  - `exit_fee`.
- `test_upgrade_of_the_vault_keeps_the_shares_the_rate_and_the_votes` upgrades it to the probe class. The probe then
  reads the same balance, supply, fee, owner and delegation, and the PAVED behind the shares (the token's balance of
  the Vault) has not moved, so the rate is kept.
- The Vault joins the four other contracts in the shared upgrade tests (owner only, zero class refused, `Upgraded`, a
  value read back through the probe, the two-step transfer).

**`Economy.config`** keeps its slot and its packed felt, and gains `referral_bps` in its top bits, stored plus one. A
`Config` packed by an earlier class has 0 there and reads back as the default, 500 bps, the former constant.
`test_config_stored_before_the_referral_reads_it_at_its_default` writes such a felt into the slot and reads it back,
then configures a referral of 0, which round-trips. No other `Economy` slot changes. `Purchased` gains `vault_paved`,
and `EconomyConfigured` gains `referral_bps` (appended).

## Dead slots since D-25 E (P-42)

`Account` left the systems (P-53 ruling 5): a player is the wallet address. Two members of the `paved` storage node
(`store.cairo`, `PavedStorage`), declared in every game contract's layout, are now dead. Their names do not change.
"Declared in" is today's tree (`Challenge`); "Was written by" is the past (`Daily`).

| Slot | Declared in | Was written by |
|---|---|---|
| `account: ContractAddress` (`pedersen(selector!("paved"), selector!("account"))`) | `Challenge`, through `PavedStorage` | `Store.initialize` in `Daily`'s constructor (gone: the constructor has no `account_address` since E) |
| `players: Map<felt252, Slots2>` (name, master) | `Challenge`, through `PavedStorage` | nothing in a game contract: `Account` kept the players in its own storage, and `Store.player` read `Account` when `account` was set |

**Pins.** `tests::e2e::cold_paths_audit::test_daily_pins_the_dead_fields_by_name` pins both with the D-20 and D-24
slots: `PavedStorage.account` and `PavedStorage.players.entry(player)` resolve to the addresses computed from the
literal names, and sentinels at `account` and at both slots of `players` survive a whole game (whose spawn reads the
wiring from `Setup`, never the `account` slot).

**New live slots** in `Setup`: `economy: ContractAddress` and `collection: ContractAddress`, each written once by the
owner (`set_economy`, `set_collection`), pinned by name in `test_upgrade_layout_pins_setup_and_economy_by_name`.

**The mock `Account`.** P-53 ruling 5: the Account belongs in the mocks. `Account` is deleted from the systems (git
history keeps it: `git show aff59e06:contracts/src/systems/account.cairo`), and `MockAccount`
(`contracts/src/mocks/account.cairo`) keeps a registration and the player view, nothing else. Its one user,
`tests::e2e::access::test_access_a_registration_changes_nothing`, shows that `Challenge` plays and pays a referrer the same
whether the address registered or not. `deploy.sh` never deploys it and `abis.sh` writes no ABI for it. No other test
needs it: the layout pin moved to `Setup`'s wiring; the frozen classes of the D-18 and D-19 upgrade tests never spawn,
so their copy of `Store.player` was dead code and went; and Sepolia gets a fresh deployment (P-53), so no `--rehearse`
of an upgrade from the `Account` layout remains. `deploy.sh --d18` still declares the `Account` of 06c024d
from the pinned commit (`scripts/check-artifact-names.sh` accepts that name in the pinned paths only).

## D-20 on Sepolia (superseded by P-53: fresh deployment)

P-53 decided one fresh Sepolia deployment after D-23b, so **no D-20 upgrade runs on Sepolia**: the fresh deployment
starts with the D-20 classes. The funds were read anyway (P-48 (4)): on 2026-10-13, block 16,538,960, `balanceOf(Daily)`
on MockUSDC was 0 and `Daily` had never emitted `Sponsored`, `Claimed` or `Reclaimed` (`leaderboard.md`, "As built:
D-20").

Lesson for any future in-place upgrade that removes a token path: set the new `Lobby` class and upgrade `Daily` in one
multicall (no window where an old `Lobby` runs under a new `Daily` or the reverse), and hold the upgrade if a balance
re-read right before it is not 0 (after it, no path could send that balance out but another `upgrade`).

**Dead fields under P-42**, declared, never written or read again, never reused (a comment says so where each is
declared): `PavedStorage.tournaments` (`store.cairo`), `PavedStorage.rankings` (`store.cairo`) and
`HostableComponent.sponsorships` (`components/hostable.cairo`, flat in `Daily` and `Tutorial`). Their names keep
"tournament" and "sponsor": a storage name never changes.
`tests::e2e::lobby_audit::test_lobby_and_daily_pin_the_dead_fields_by_name` pins all three by name: the address the
code resolves through each field (in `Daily`'s and `Lobby`'s `HostableComponent`, and in `PavedStorage`) must equal the
one computed from the literal name, and sentinels written there must survive a whole game through `Daily` and its
`Lobby`. D-20 touches no structure state (`structure-state.md`).

## Not upgradable: migrations

A fix to `PavedToken` is a migration to a new contract, never an in-place upgrade (the `Vault` too until P-56; it is
upgradable since, and its outline below stays as the record). Outline, to detail in its own brief when needed:

- **`Vault` (before P-56).** Deploy `Vault` v2. Upgrade `Economy` to a class that points the margin at v2 (its `vault` has no
  setter: the new class writes it once, in a migration call). Stakers move themselves: `unstake` and `claim` on v1 keep
  working (no owner can stop them), then `stake` on v2. USDC that reached v1 stays claimable there. The client shows
  both until v1 is empty. No balance is moved by anyone but its staker.
- **`PavedToken`.** Deploy `PavedToken` v2 with no initial mint, its minter `Economy`. Upgrade `Economy` to a class
  that mints v2 and offers `migrate(amount)`: it pulls `amount` of v1 from the caller (`transferFrom`, approve first)
  and burns it (`burn` of its own balance), then mints `amount` of v2 to the caller, in one call, so the supply is
  conserved. The Vault holds v1 stakes: a `PavedToken` migration needs a `Vault` migration too. The PAVED/USDC pool and
  its LP are recreated on v2 (an owner's act on mainnet).
- Both keep v1 readable forever; nothing is destroyed.

## Trust

Facts checked against `main` at 27dc96dd. The detail, entry point by entry point, is in `upgrade-owner.md` (#361); this
section is the summary.

The upgrade owner of a contract can replace its code with `upgrade` (only class hash 0 is refused). Five contracts have
an owner, each its own (`contracts/src/components/ownable.cairo:96-98`):

- `Challenge`, the game (`challenge.cairo:223-226`).
- `Economy`, the only minter of PAVED: a new class can mint (`economy.cairo:906-912`).
- `Setup`, the quests and achievements and, since D-25 E, the wiring `Challenge` reads at every spawn
  (`challenge.cairo:315`; `Setup.upgrade` is `setup.cairo:353-356`). Its owner is on the money path: a new class can name any
  economy and take the price of every later spawn, or block every game over (`challenge.cairo:394-395`).
- `Collection`, the game NFTs, which hold no value (`collection.cairo:366-369`).
- `Vault` (vPAVED, since P-56), the stakers' PAVED and the votes: a new class can move them. Its owner also sets the
  exit fee, bounded to 0 to 1,000 bps.

That is the custody of the PAVED supply, of the price of every later purchase and, since P-56, of the staked PAVED. The
owner cannot touch the PAVED held outside the `Vault`, except through what `Economy` mints. `PavedToken` has no owner, but its only minter is `Economy` for good
(`token.cairo:128-134`).

Three owner calls are as strong as an upgrade for new money, each taking the price of every later purchase without
changing the class of `Challenge` or `Economy`: `Challenge.set_setup` (`challenge.cairo:206-213`), `Economy.set_router`
(`economy.cairo:792-800`) and `Setup.upgrade`. `Economy.set_pool` (`economy.cairo:777-780`) and `Setup.set_reporter`
(`setup.cairo:284-290`) are not bounded either. `Economy.configure` is bounded and reaches later purchases only
(`economy.cairo:772-775`).

History: until D-24, `set_lobby_class` on `Daily` and `Tutorial` was as strong as `upgrade` (a `Lobby` class ran by
library call on the game contract's storage). It left with the `Lobby` path (above); `contracts/src` has no
`set_lobby_class`. `Account` was an upgradable contract until D-25 E deleted it (above).

One pause exists since G4: a guardian set by `Challenge`'s owner (`set_guardian`) may pause `Challenge.spawn`, and only
the owner unpauses (`upgrade-owner.md`, section 3). Nothing else pauses: the moves, the game-over report, the record and
the settlement go on, and the `Vault` has no pause. The mainnet gate on who owns the upgrades (an owner account, a
multisig, a timelock) is weighed in `upgrade-owner.md`: a multisig at launch, a timelock in front of it once a pause
guardian exists. The other gate of `docs/programme/PLAN.md` that follows, bounds on `set_router` and `set_pool`, is
open.

## Tests

`contracts/src/tests/e2e/upgrades.cairo`:

- `upgrade` by a stranger, and by a pending owner before it accepts, reverts; to class hash 0 reverts; by the owner,
  to a probe class, emits OpenZeppelin's `Upgraded` and a value stored before reads back through the probe (for each of
  `Challenge`, `Setup`, `Economy`, `Collection`; `Tutorial` left at D-21, `Account` at D-25 E); after a two-step transfer the new owner upgrades and the old
  one cannot.
- `set_lobby_class` (until D-24; no longer in `contracts/src`): owner only, non-zero, emits `LobbyClassSet`, and the next `spawn` of `Daily` and of `Tutorial`
  runs the new class (a probe whose `spawn` returns a mark); after a transfer, the new owner sets it.
- `PavedToken`: a call to `upgrade` finds no entry point (`ENTRYPOINT_NOT_FOUND`). The `Vault` is in the shared tests
  since P-56, and has its own upgrade test and layout pins (above).
- The layout pins above. Two-step ownership: `tests::e2e::access`.
