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
| `Account` | yes | constructor `owner` | the player registry, read by `Daily`, `Tutorial` and `Lobby` |
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

## The Lobby path

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

  The PM's cap for `Daily` is 72,607; the choice is the PM's (U-1 report).

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
- **Pins.** `tests::e2e::lobby_audit::test_lobby_and_daily_pin_every_shared_storage_variable_by_name` (the variables
  `Lobby` shares with `Daily`) and `tests::e2e::upgrades::test_upgrade_layout_pins_account_and_economy_by_name` (the
  wiring of `Account`, the addresses, pool, packed records and purchase maps of `Economy`) read each variable at the
  raw address of its name. Whoever adds a variable adds it there.
- **Before an upgrade on a public network:** the new class is built from a commit that passes those pins, the storage
  of the old class is diffed against the new one by name and type (the `#[storage]` structs and the components), and
  the upgrade is rehearsed on devnet from the deployed state (`--rehearse`).

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
`Economy` mints. Hence the mainnet gate: an owner account, later a multisig or a timelock.

## Tests

`contracts/src/tests/e2e/upgrades.cairo`:

- `upgrade` by a stranger, and by a pending owner before it accepts, reverts; to class hash 0 reverts; by the owner,
  to a probe class, emits OpenZeppelin's `Upgraded` and a value stored before reads back through the probe (for each of
  `Daily`, `Tutorial`, `Account`, `Economy`, `Collection`); after a two-step transfer the new owner upgrades and the old
  one cannot.
- `set_lobby_class`: owner only, non-zero, emits `LobbyClassSet`, and the next `spawn` of `Daily` and of `Tutorial`
  runs the new class (a probe whose `spawn` returns a mark); after a transfer, the new owner sets it.
- `PavedToken` and `Vault`: a call to `upgrade` finds no entry point (`ENTRYPOINT_NOT_FOUND`).
- The layout pins above. Two-step ownership on all five: `tests::e2e::access`.
