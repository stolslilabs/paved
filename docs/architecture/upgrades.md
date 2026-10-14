# Upgrades (D-17, P-42)

Since Dojo left (P2), nothing redeployed the game but a full redeploy, which loses every game, player and stake. D-17
(owner, 2026-10-10) asks for contracts that are upgraded in place; P-42 (PM, 2026-10-10) fixes the design below. Brief:
`docs/briefs/u1-upgradable.md`. It lands before the Sepolia deployment, so the Sepolia contracts are upgradable from
day one and the playtest data survives fixes.

## What is upgradable

| Contract | Upgradable | Owner | Why |
|---|---|---|---|
| `Daily` | yes | constructor `owner` | the game; holds the sponsored prize pools |
| `Tutorial` | yes | constructor `owner` | the tutorial game |
| `Account` | removed (D-25 E) | | the player registry and the wiring until step E; deleted, no mock (below) |
| `Setup` | yes | constructor `owner` | the quests and achievements (D-24) and, since D-25 E, the wiring `Daily` reads |
| `Economy` | yes | constructor `owner` | the minter of PAVED and the purchase and settlement logic; holds nothing between transactions |
| `Collection` | yes | constructor `owner` | the game NFTs |
| `Lobby` | no instance | none | a declared class, run by `Daily` and `Tutorial`; replaced by `set_lobby_class` (below) |
| `PavedToken` | **no** | none (admin cleared by `set_minter`) | a standard ERC20; an upgrade key would be a mint and seize key |
| `Vault` | **no** | none | holds the stakers' PAVED and their USDC dividends; an upgrade key would be a custody key |

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

**Since D-24 this path is history**: `Daily` runs its cold paths itself, `set_lobby_class`, `ILobbyClass` and
`LobbyClassSet` are gone, and the `Lobby` class is deleted (the name is kept for multiplayer, P-51 (2)). `lobby_class`
stays declared in `Daily`, dead (below, "Dead slots since D-21 and D-24"). Sepolia is not upgraded to these classes:
P-53 decided one fresh deployment, where `Daily`'s constructor sets `setup`. The old Sepolia `Daily` and `Tutorial` keep
their `Lobby`. What follows is the path as it was.

`Daily` and `Tutorial` run `spawn`, `claim`, `sponsor`, `discard`, `surrender`, the reports and the quest definitions in
the `Lobby` class by library call (P-26). P-26 made its class hash, `lobby_class`, immutable. P-42 reverses that:

- **`set_lobby_class(class_hash)`** on `Daily` and on `Tutorial` (interface `ILobbyClass`, `systems/lobby.cairo`): the
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
  `pending_owner`, `token_address` and `setup` of `Daily`; it replaced the pin of the variables `Lobby` shared with
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

Declared, never written or read again, never reused; a comment says so where each is declared.

| Slot | Declared in | Was written by |
|---|---|---|
| `lobby_class: ClassHash` | `Daily` (`systems/daily.cairo`) | the constructor and `set_lobby_class` (gone) |
| `Quest_definitions`, `Quest_tasks`, `Quest_conditions`, `Quest_progress`, `Quest_records`, `Quest_held`, `Quest_reporters` (the flat `quest` substorage) | `Daily` | the definitions and the reports run in `Lobby` (now `Setup`'s, in `Setup`'s own storage) |
| `Achievement_definitions`, `Achievement_extra_tasks`, `Achievement_reporters` (the flat `achievement` substorage) | `Daily` | the same |
| `tutoriable` (empty substorage) | was `Lobby`'s and `Tutorial`'s | nothing: its storage was empty, so `Daily` holds no slot of it |

`Daily` keeps the `quest` and `achievement` members as `#[substorage(v0)]` of quiver's component storages without
declaring the components, so the slots keep their names and the quiver events leave `Daily`'s ABI. On Sepolia the dead
slots keep what they hold (the definitions of the accepted list, `lobby_class`); `Setup`'s storage is fresh, and past
progress is not migrated (P-51 (5)). `Tutorial`'s whole storage stays as it is, in a contract nobody uses after the
upgrade.

**Pins.** `tests::e2e::cold_paths_audit::test_daily_pins_the_dead_fields_by_name` pins the D-24 slots with D-20's:
the address `Daily` resolves through each member's name (a test-only accessor, `Daily::DeadFieldsTrait::dead_addresses`,
for `lobby_class` and the ten quiver members; `HostableComponent::DeadFieldsTrait` for `sponsorships`; `PavedStorage`
for `tournaments` and `rankings`) equals the address computed from the literal name, and sentinels written at every one
survive a whole game (the accepted list defined on `Setup`, then spawn, build, discard and surrender, each game over
reported to `Setup`).

**New live slot**: `Daily.setup: ContractAddress`, written by the constructor and by the owner's `set_setup` (P-42).
Since step E it is the one address `Daily` reads its wiring from (below).

**Rule for any future in-place upgrade of a `Daily` without `setup`** (D-17; mainnet later; not Sepolia, P-53): deploy
`Setup` and call `Setup.set_reporter(Daily, true)` first, then send `Daily.upgrade` and `Daily.set_setup(Setup)` in one
owner multicall, and read `Daily.setup()` back. Until step E, a zero `setup` let a game over end and be recorded with
its progress lost; since step E the wiring is `Setup`'s, so with a zero `setup` a spawn and a game over both revert
(`'Daily: setup is zero'`) and the game stays live until `set_setup` runs. Before such an upgrade, `Setup` also needs
`set_economy` and `set_collection` (the addresses the old `Account` held).

## Dead slots since D-25 E (P-42)

`Account` left the systems (P-53 ruling 5): a player is the wallet address. Two members of the `paved` storage node
(`store.cairo`, `PavedStorage`), declared in every game contract's layout, are now dead. Their names do not change.

| Slot | Declared in | Was written by |
|---|---|---|
| `account: ContractAddress` (`pedersen(selector!("paved"), selector!("account"))`) | `Daily`, through `PavedStorage` | `Store.initialize` in `Daily`'s constructor (gone: the constructor has no `account_address` since E) |
| `players: Map<felt252, Slots2>` (name, master) | `Daily`, through `PavedStorage` | nothing in a game contract: `Account` kept the players in its own storage, and `Store.player` read `Account` when `account` was set |

**Pins.** `tests::e2e::cold_paths_audit::test_daily_pins_the_dead_fields_by_name` pins both with the D-20 and D-24
slots: `PavedStorage.account` and `PavedStorage.players.entry(player)` resolve to the addresses computed from the
literal names, and sentinels at `account` and at both slots of `players` survive a whole game (whose spawn reads the
wiring from `Setup`, never the `account` slot).

**New live slots** in `Setup`: `economy: ContractAddress` and `collection: ContractAddress`, each written once by the
owner (`set_economy`, `set_collection`), pinned by name in `test_upgrade_layout_pins_setup_and_economy_by_name`.

**No mock `Account`.** P-53 ruling 5 keeps a mock for the tests that need one. None does after step E: the layout pin
moved to `Setup`'s wiring; the frozen classes of the D-18 and D-19 upgrade tests (`DailyBeforeD18`, `DailyBeforeD19`)
never spawn, so their copy of `Store.player` was dead code and went; and Sepolia gets a fresh deployment (P-53), so no
`--rehearse` of an upgrade from the `Account` layout remains. `Account` is deleted; git history keeps it
(`git show aff59e06:contracts/src/systems/account.cairo`). `deploy.sh --d18` still declares the `Account` of 06c024d
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

A fix to `PavedToken` or `Vault` is a migration to a new contract, never an in-place upgrade. Outline, to detail in
its own brief when needed:

- **`Vault`.** Deploy `Vault` v2. Upgrade `Economy` to a class that points the margin at v2 (its `vault` has no
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

The upgrade owner can replace the code of `Daily` (which holds the sponsored prize pools), of `Economy` (the only
minter of PAVED: a new class can mint) and of `Account` and `Collection`. That is the custody of the prizes and of the
PAVED supply. It cannot touch `Vault` (stakers' PAVED and USDC) or the PAVED already held, except through what
`Economy` mints.

`set_lobby_class` on `Daily` and `Tutorial` is as strong as `upgrade`. A `Lobby` class runs by library call on the game
contract's storage, so a new one can move the prize pools, rewrite `owner`, or replace the class
(`replace_class_syscall`). Whoever may set the `Lobby` class holds the same keys as the upgrade owner.

Hence the mainnet gate, for `upgrade` and `set_lobby_class` alike: an owner account, later a multisig or a timelock.

## Tests

`contracts/src/tests/e2e/upgrades.cairo`:

- `upgrade` by a stranger, and by a pending owner before it accepts, reverts; to class hash 0 reverts; by the owner,
  to a probe class, emits OpenZeppelin's `Upgraded` and a value stored before reads back through the probe (for each of
  `Daily`, `Setup`, `Economy`, `Collection`; `Tutorial` left at D-21, `Account` at D-25 E); after a two-step transfer the new owner upgrades and the old
  one cannot.
- `set_lobby_class`: owner only, non-zero, emits `LobbyClassSet`, and the next `spawn` of `Daily` and of `Tutorial`
  runs the new class (a probe whose `spawn` returns a mark); after a transfer, the new owner sets it.
- `PavedToken` and `Vault`: a call to `upgrade` finds no entry point (`ENTRYPOINT_NOT_FOUND`).
- The layout pins above. Two-step ownership on all four: `tests::e2e::access`.
