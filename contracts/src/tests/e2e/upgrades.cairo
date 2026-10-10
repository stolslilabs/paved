//! Upgrades (D-17, P-42, `docs/architecture/upgrades.md`): `Daily`, `Tutorial`, `Account`,
//! `Economy` and `Collection` replace their class through OpenZeppelin's `UpgradeableComponent`,
//! gated by the two-step owner; `Daily` and `Tutorial` take a new `Lobby` class from their owner;
//! `PavedToken` and `Vault` have no `upgrade` at all.

use core::num::traits::Zero;
use openzeppelin_interfaces::upgrades::{
    IUpgradeableDispatcher, IUpgradeableDispatcherTrait, IUpgradeableSafeDispatcher,
    IUpgradeableSafeDispatcherTrait,
};
use openzeppelin_upgrades::UpgradeableComponent;
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::economy::economy::IEconomyDispatcherTrait;
use paved::systems::daily::Daily;
use paved::systems::lobby::{
    ILobbyClassDispatcher, ILobbyClassDispatcherTrait, ILobbyClassSafeDispatcher,
    ILobbyClassSafeDispatcherTrait, LobbyClassSet,
};
use paved::systems::tutorial::{ITutorialDispatcherTrait, Tutorial};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{ANYONE, IDailyDispatcherTrait, OWNER, PLAYER};
use paved::types::mode::Mode;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, load,
    map_entry_address, spy_events, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::{ClassHash, ContractAddress};

/// The class a contract is upgraded to: it reads any storage slot of the contract, so that a value
/// stored before the upgrade is read back through the new class.
#[starknet::interface]
pub trait IUpgradeProbe<TContractState> {
    fn probe(self: @TContractState, address: felt252) -> felt252;
}

#[starknet::contract]
pub mod UpgradeProbe {
    use starknet::SyscallResultTrait;
    use starknet::storage_access::{storage_address_from_base, storage_base_address_from_felt252};

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl UpgradeProbeImpl of super::IUpgradeProbe<ContractState> {
        fn probe(self: @ContractState, address: felt252) -> felt252 {
            let base = storage_base_address_from_felt252(address);
            starknet::syscalls::storage_read_syscall(0, storage_address_from_base(base))
                .unwrap_syscall()
        }
    }
}

/// The `spawn` of a `Lobby` class that writes nothing and returns `LOBBY_MARK`, so that a spawn
/// shows which class it ran.
pub const LOBBY_MARK: u32 = 4242;

#[starknet::interface]
pub trait ILobbyProbe<TContractState> {
    fn spawn(
        ref self: TContractState, mode: Mode, stake: u8, referrer: ContractAddress, min_out: u256,
    ) -> u32;
}

#[starknet::contract]
pub mod LobbyProbe {
    use paved::types::mode::Mode;
    use starknet::ContractAddress;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl LobbyProbeImpl of super::ILobbyProbe<ContractState> {
        fn spawn(
            ref self: ContractState,
            mode: Mode,
            stake: u8,
            referrer: ContractAddress,
            min_out: u256,
        ) -> u32 {
            super::LOBBY_MARK
        }
    }
}

fn class_of(name: ByteArray) -> ClassHash {
    *declare(name).unwrap().contract_class().class_hash
}

/// The raw slot of a plain storage variable.
fn raw(contract: ContractAddress, name: felt252) -> felt252 {
    *load(contract, name, 1).at(0)
}

/// Every upgradable contract, with one storage variable its constructor or the setup wrote: its
/// name (the slot) and its value.
fn upgradables(systems: @setup::Systems) -> Array<(ContractAddress, felt252, felt252)> {
    let lobby: felt252 = class_of("Lobby").into();
    let daily: felt252 = (*systems.daily.contract_address).into();
    array![
        (*systems.daily.contract_address, selector!("lobby_class"), lobby),
        (*systems.tutorial.contract_address, selector!("lobby_class"), lobby),
        (
            *systems.account.contract_address,
            selector!("economy"),
            (*systems.economy.contract_address).into(),
        ),
        (*systems.economy.contract_address, selector!("game"), daily),
        (*systems.collection.contract_address, selector!("daily"), daily),
    ]
}

// Upgrade

#[test]
#[available_gas(l2_gas: 75279000)]
#[feature("safe_dispatcher")]
fn test_upgrade_reverts_for_non_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let probe = class_of("UpgradeProbe");
    for (contract, _, _) in upgradables(@systems) {
        let upgradeable = IUpgradeableSafeDispatcher { contract_address: contract };
        // A stranger, then the pending owner before it accepts
        start_cheat_caller_address(contract, ANYONE());
        let error = upgradeable.upgrade(probe).unwrap_err();
        assert(*error.at(0) == 'Ownable: caller is not owner', 'Upgrade: stranger');
        start_cheat_caller_address(contract, OWNER());
        IOwnableDispatcher { contract_address: contract }.transfer_ownership(ANYONE());
        start_cheat_caller_address(contract, ANYONE());
        let error = upgradeable.upgrade(probe).unwrap_err();
        assert(*error.at(0) == 'Ownable: caller is not owner', 'Upgrade: pending owner');
        stop_cheat_caller_address(contract);
    }
}

#[test]
#[available_gas(l2_gas: 67316000)]
#[feature("safe_dispatcher")]
fn test_upgrade_reverts_on_zero_class_hash() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    for (contract, _, _) in upgradables(@systems) {
        start_cheat_caller_address(contract, OWNER());
        let error = IUpgradeableSafeDispatcher { contract_address: contract }
            .upgrade(Zero::zero())
            .unwrap_err();
        assert(*error.at(0) == 'Class hash cannot be zero', 'Upgrade: zero class');
        stop_cheat_caller_address(contract);
    }
}

/// The owner replaces the class: OpenZeppelin's `Upgraded` is emitted, and the value stored before
/// is read back through the new class.
#[test]
#[available_gas(l2_gas: 69696000)]
fn test_upgrade_by_owner_emits_and_keeps_the_state() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let probe = class_of("UpgradeProbe");
    for (contract, slot, value) in upgradables(@systems) {
        assert(value != 0, 'Upgrade: value set');
        let mut spy = spy_events();
        start_cheat_caller_address(contract, OWNER());
        IUpgradeableDispatcher { contract_address: contract }.upgrade(probe);
        stop_cheat_caller_address(contract);
        let event = UpgradeableComponent::Event::Upgraded(
            UpgradeableComponent::Upgraded { class_hash: probe },
        );
        spy.assert_emitted(@array![(contract, event)]);
        let probed = IUpgradeProbeDispatcher { contract_address: contract };
        assert(probed.probe(slot) == value, 'Upgrade: state kept');
        assert(probed.probe(selector!("owner")) == OWNER().into(), 'Upgrade: owner kept');
    }
}

/// After a two-step transfer, the new owner upgrades and the old one no longer can.
#[test]
#[available_gas(l2_gas: 77421000)]
#[feature("safe_dispatcher")]
fn test_upgrade_follows_the_ownership_transfer() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let probe = class_of("UpgradeProbe");
    for (contract, _, _) in upgradables(@systems) {
        let ownable = IOwnableDispatcher { contract_address: contract };
        start_cheat_caller_address(contract, OWNER());
        ownable.transfer_ownership(ANYONE());
        start_cheat_caller_address(contract, ANYONE());
        ownable.accept_ownership();
        start_cheat_caller_address(contract, OWNER());
        let error = IUpgradeableSafeDispatcher { contract_address: contract }
            .upgrade(probe)
            .unwrap_err();
        assert(*error.at(0) == 'Ownable: caller is not owner', 'Upgrade: old owner');
        start_cheat_caller_address(contract, ANYONE());
        IUpgradeableDispatcher { contract_address: contract }.upgrade(probe);
        stop_cheat_caller_address(contract);
        let probed = IUpgradeProbeDispatcher { contract_address: contract };
        assert(probed.probe(selector!("owner")) == ANYONE().into(), 'Upgrade: new owner');
    }
}

// Not upgradable: PavedToken and Vault

/// `PavedToken` and `Vault` have no `upgrade` entry point: a call to its selector finds none.
#[test]
#[available_gas(l2_gas: 64993000)]
#[feature("safe_dispatcher")]
fn test_paved_token_and_vault_have_no_upgrade() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let addresses = systems.economy.addresses();
    let probe = class_of("UpgradeProbe");
    let contracts: Array<ContractAddress> = array![addresses.paved, addresses.vault];
    for contract in contracts {
        start_cheat_caller_address(contract, OWNER());
        let error = IUpgradeableSafeDispatcher { contract_address: contract }
            .upgrade(probe)
            .unwrap_err();
        assert(*error.at(0) == 'ENTRYPOINT_NOT_FOUND', 'Upgrade: entry point found');
        stop_cheat_caller_address(contract);
    }
}

// The Lobby class

fn games(systems: @setup::Systems) -> Array<ContractAddress> {
    array![*systems.daily.contract_address, *systems.tutorial.contract_address]
}

#[test]
#[available_gas(l2_gas: 64936000)]
#[feature("safe_dispatcher")]
fn test_set_lobby_class_reverts_for_non_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let probe = class_of("LobbyProbe");
    for contract in games(@systems) {
        start_cheat_caller_address(contract, ANYONE());
        let error = ILobbyClassSafeDispatcher { contract_address: contract }
            .set_lobby_class(probe)
            .unwrap_err();
        assert(*error.at(0) == 'Ownable: caller is not owner', 'Lobby class: stranger');
        stop_cheat_caller_address(contract);
    }
}

#[test]
#[available_gas(l2_gas: 64337000)]
#[feature("safe_dispatcher")]
fn test_set_lobby_class_reverts_on_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let tutorial = systems.tutorial.contract_address;
    start_cheat_caller_address(daily, OWNER());
    let error = ILobbyClassSafeDispatcher { contract_address: daily }
        .set_lobby_class(Zero::zero())
        .unwrap_err();
    assert(*error.at(0) == Daily::errors::ZERO_LOBBY_CLASS, 'Lobby class: daily zero');
    start_cheat_caller_address(tutorial, OWNER());
    let error = ILobbyClassSafeDispatcher { contract_address: tutorial }
        .set_lobby_class(Zero::zero())
        .unwrap_err();
    assert(*error.at(0) == Tutorial::errors::ZERO_LOBBY_CLASS, 'Lobby class: tutorial zero');
}

/// The owner sets a new `Lobby` class: `LobbyClassSet` is emitted, the slot holds it, and the next
/// spawn runs it.
#[test]
#[available_gas(l2_gas: 66200000)]
fn test_set_lobby_class_by_owner_runs_the_new_class() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let probe = class_of("LobbyProbe");
    let daily = systems.daily.contract_address;
    let tutorial = systems.tutorial.contract_address;
    let mut spy = spy_events();
    for contract in games(@systems) {
        start_cheat_caller_address(contract, OWNER());
        ILobbyClassDispatcher { contract_address: contract }.set_lobby_class(probe);
        assert(raw(contract, selector!("lobby_class")) == probe.into(), 'Lobby class: stored');
        start_cheat_caller_address(contract, PLAYER());
    }
    let event = LobbyClassSet { class_hash: probe };
    spy
        .assert_emitted(
            @array![(daily, Daily::Event::LobbyClassSet(LobbyClassSet { class_hash: probe }))],
        );
    spy.assert_emitted(@array![(tutorial, Tutorial::Event::LobbyClassSet(event))]);
    assert(systems.daily.spawn(1, Zero::zero(), 0) == LOBBY_MARK, 'Lobby class: daily runs it');
    assert(systems.tutorial.spawn() == LOBBY_MARK, 'Lobby class: tutorial runs it');
}

/// A new owner sets the class after a two-step transfer; the old owner no longer can.
#[test]
#[available_gas(l2_gas: 68824000)]
#[feature("safe_dispatcher")]
fn test_set_lobby_class_follows_the_ownership_transfer() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let probe = class_of("LobbyProbe");
    for contract in games(@systems) {
        let ownable = IOwnableDispatcher { contract_address: contract };
        start_cheat_caller_address(contract, OWNER());
        ownable.transfer_ownership(ANYONE());
        start_cheat_caller_address(contract, ANYONE());
        ownable.accept_ownership();
        start_cheat_caller_address(contract, OWNER());
        let error = ILobbyClassSafeDispatcher { contract_address: contract }
            .set_lobby_class(probe)
            .unwrap_err();
        assert(*error.at(0) == 'Ownable: caller is not owner', 'Lobby class: old owner');
        start_cheat_caller_address(contract, ANYONE());
        ILobbyClassDispatcher { contract_address: contract }.set_lobby_class(probe);
        stop_cheat_caller_address(contract);
        assert(raw(contract, selector!("lobby_class")) == probe.into(), 'Lobby class: new owner');
    }
}

// Storage layout: the key variables of `Account` and `Economy`, pinned by name

/// The raw slot of a map entry.
fn raw_entry(contract: ContractAddress, map: felt252, key: Array<felt252>) -> felt252 {
    *load(contract, map_entry_address(map, key.span()), 1).at(0)
}

/// An upgrade keeps the storage only if the new class finds every variable at its slot, and the
/// slot is the name (`docs/architecture/upgrades.md`). These are the variables of `Account` and
/// `Economy` that hold their wiring and their money terms, read at the raw address of their name
/// after a paid spawn. A rename or a retype fails here; whoever adds one adds it here.
#[test]
fn test_upgrade_layout_pins_account_and_economy_by_name() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    let account = systems.account.contract_address;
    let economy = systems.economy.contract_address;
    let addresses = systems.economy.addresses();
    let (pool_key, _) = systems.economy.pool();

    // [Account] the ownable, the two addresses set once
    start_cheat_caller_address(account, OWNER());
    IOwnableDispatcher { contract_address: account }.transfer_ownership(ANYONE());
    stop_cheat_caller_address(account);
    assert(raw(account, selector!("owner")) == OWNER().into(), 'Pin: account owner');
    assert(raw(account, selector!("pending_owner")) == ANYONE().into(), 'Pin: account pending');
    assert(raw(account, selector!("economy")) == economy.into(), 'Pin: account economy');
    assert(
        raw(account, selector!("collection")) == systems.collection.contract_address.into(),
        'Pin: account collection',
    );

    // [Economy] the ownable, the addresses, the pool, the packed records, the purchase's maps
    assert(raw(economy, selector!("owner")) == OWNER().into(), 'Pin: economy owner');
    assert(raw(economy, selector!("pending_owner")) == 0, 'Pin: economy pending');
    assert(raw(economy, selector!("game")) == addresses.game.into(), 'Pin: economy game');
    assert(raw(economy, selector!("paved")) == addresses.paved.into(), 'Pin: economy paved');
    assert(raw(economy, selector!("usdc")) == addresses.usdc.into(), 'Pin: economy usdc');
    assert(raw(economy, selector!("vault")) == addresses.vault.into(), 'Pin: economy vault');
    assert(raw(economy, selector!("router")) == addresses.router.into(), 'Pin: economy router');
    assert(raw(economy, selector!("pool_fee")) == pool_key.fee.into(), 'Pin: economy pool_fee');
    assert(
        raw(economy, selector!("tick_spacing")) == pool_key.tick_spacing.into(),
        'Pin: economy tick_spacing',
    );
    assert(raw(economy, selector!("config")) != 0, 'Pin: economy config');
    assert(raw(economy, selector!("ema")) != 0, 'Pin: economy ema');
    assert(raw(economy, selector!("guard")) != 0, 'Pin: economy guard');
    let game: felt252 = context.game_id.into();
    assert(
        raw_entry(economy, selector!("players"), array![game]) == PLAYER().into(),
        'Pin: economy players',
    );
    assert(raw_entry(economy, selector!("terms"), array![game]) != 0, 'Pin: economy terms');
}
