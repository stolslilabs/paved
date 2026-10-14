//! Upgrades (D-17, P-42, P-56, `docs/architecture/upgrades.md`): `Daily`, `Setup`, `Economy`,
//! `Collection` and `Vault` (vPAVED) replace their class through OpenZeppelin's
//! `UpgradeableComponent`, gated by the two-step owner; `PavedToken` has no `upgrade` at all. Since
//! D-24 `Daily` runs no `Lobby` class: its `set_lobby_class` is gone (`e2e/cold_paths_audit.cairo`
//! pins the dead `lobby_class` slot).

use core::num::traits::Zero;
use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin_interfaces::erc4626::{ERC4626ABIDispatcher, ERC4626ABIDispatcherTrait};
use openzeppelin_interfaces::upgrades::{
    IUpgradeableDispatcher, IUpgradeableDispatcherTrait, IUpgradeableSafeDispatcher,
    IUpgradeableSafeDispatcherTrait,
};
use openzeppelin_interfaces::votes::{IVotesDispatcher, IVotesDispatcherTrait};
use openzeppelin_upgrades::UpgradeableComponent;
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::systems::economy::IEconomyDispatcherTrait;
use paved::systems::vault::DEAD_ASSETS;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{ANYONE, OWNER, PLAYER};
use paved::types::mode::Mode;
use snforge_std::{
    DeclareResultTrait, EventSpyAssertionsTrait, declare, load, map_entry_address, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
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

/// One PAVED (and one vPAVED) in base units.
const ONE: u256 = 1_000_000_000_000_000_000;

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
    let challenge: felt252 = (*systems.challenge.contract_address).into();
    array![
        (
            *systems.challenge.contract_address,
            selector!("setup"),
            (*systems.setup.contract_address).into(),
        ),
        (
            *systems.setup.contract_address,
            map_entry_address(selector!("Quest_reporters"), array![challenge].span()),
            1,
        ),
        (*systems.economy.contract_address, selector!("game"), challenge),
        (*systems.collection.contract_address, selector!("daily"), challenge),
        ((*systems.economy).addresses().vault, selector!("exit_fee"), 500),
    ]
}

// Upgrade

#[test]
#[available_gas(l2_gas: 73971765)]
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
#[available_gas(l2_gas: 66002402)]
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
#[available_gas(l2_gas: 68397494)]
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
#[available_gas(l2_gas: 76139553)]
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

// Not upgradable: PavedToken

/// `PavedToken` has no `upgrade` entry point: a call to its selector finds none.
#[test]
#[available_gas(l2_gas: 62681703)]
#[feature("safe_dispatcher")]
fn test_paved_token_has_no_upgrade() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let contract = systems.economy.addresses().paved;
    start_cheat_caller_address(contract, OWNER());
    let error = IUpgradeableSafeDispatcher { contract_address: contract }
        .upgrade(class_of("UpgradeProbe"))
        .unwrap_err();
    assert(*error.at(0) == 'ENTRYPOINT_NOT_FOUND', 'Upgrade: entry point found');
    stop_cheat_caller_address(contract);
}

// The Vault (vPAVED, P-56): its upgrade keeps the shares, the PAVED behind them and the votes

/// After a paid game (its margin in the Vault) and the owner's self-delegation, the owner upgrades
/// the Vault: the new class reads the same shares, supply, fee and votes, and the PAVED behind
/// them, which the token holds, has not moved: the rate is kept.
#[test]
fn test_upgrade_of_the_vault_keeps_the_shares_the_rate_and_the_votes() {
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    let vault = systems.economy.addresses().vault;
    let paved = IERC20Dispatcher { contract_address: systems.economy.addresses().paved };
    let share = ERC4626ABIDispatcher { contract_address: vault };
    start_cheat_caller_address(vault, OWNER());
    IVotesDispatcher { contract_address: vault }.delegate(OWNER());
    stop_cheat_caller_address(vault);
    let balance = share.balance_of(OWNER());
    let supply = share.total_supply();
    let assets = paved.balance_of(vault);
    let rate = share.convert_to_assets(ONE);
    assert(assets > supply, 'Vault: margin in');
    start_cheat_caller_address(vault, OWNER());
    IUpgradeableDispatcher { contract_address: vault }.upgrade(class_of("UpgradeProbe"));
    stop_cheat_caller_address(vault);
    let probed = IUpgradeProbeDispatcher { contract_address: vault };
    let owner: felt252 = OWNER().into();
    let key = map_entry_address(selector!("ERC20_balances"), array![owner].span());
    assert(probed.probe(key) == balance.low.into(), 'Vault: balance kept');
    assert(
        probed.probe(selector!("ERC20_total_supply")) == supply.low.into(), 'Vault: supply kept',
    );
    assert(probed.probe(selector!("exit_fee")) == 500, 'Vault: fee kept');
    assert(probed.probe(selector!("owner")) == owner, 'Vault: owner kept');
    let delegate = map_entry_address(selector!("Votes_delegatee"), array![owner].span());
    assert(probed.probe(delegate) == owner, 'Vault: delegation kept');
    // The PAVED behind the shares is the token's: the rate the next class computes is the same
    assert(paved.balance_of(vault) == assets, 'Vault: assets kept');
    assert(ONE * (assets + 1) / (supply + 1) == rate, 'Vault: rate kept');
}

// Storage layout: the key variables of `Setup`'s wiring and of `Economy`, pinned by name

/// The raw slot of a map entry.
fn raw_entry(contract: ContractAddress, map: felt252, key: Array<felt252>) -> felt252 {
    *load(contract, map_entry_address(map, key.span()), 1).at(0)
}

/// The Vault's layout (P-42 since P-56): its components' variables and its fee, read at the raw
/// address of their names after a paid spawn and a delegation. A rename or a retype of a
/// substorage field fails here.
#[test]
fn test_upgrade_layout_pins_the_vault_by_name() {
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    let addresses = systems.economy.addresses();
    let vault = addresses.vault;
    let owner: felt252 = OWNER().into();
    start_cheat_caller_address(vault, OWNER());
    IVotesDispatcher { contract_address: vault }.delegate(OWNER());
    IOwnableDispatcher { contract_address: vault }.transfer_ownership(ANYONE());
    stop_cheat_caller_address(vault);
    let share = ERC4626ABIDispatcher { contract_address: vault };
    // [Ownable] flat, as in every owned contract
    assert(raw(vault, selector!("owner")) == owner, 'Pin: vault owner');
    assert(raw(vault, selector!("pending_owner")) == ANYONE().into(), 'Pin: vault pending');
    // [ERC20] the share
    assert(
        raw(vault, selector!("ERC20_total_supply")) == share.total_supply().low.into(),
        'Pin: vault supply',
    );
    assert(
        raw_entry(vault, selector!("ERC20_balances"), array![owner]) == share
            .balance_of(OWNER())
            .low
            .into(),
        'Pin: vault balances',
    );
    assert(
        raw_entry(vault, selector!("ERC20_balances"), array![vault.into()]) == DEAD_ASSETS
            .low
            .into(),
        'Pin: vault dead shares',
    );
    // [ERC4626] the asset, [Votes] the delegation (its checkpoints are a `Vec`, whose length lives
    // at a derived address, not at the name), the fee
    assert(raw(vault, selector!("ERC4626_asset")) == addresses.paved.into(), 'Pin: vault asset');
    assert(
        raw_entry(vault, selector!("Votes_delegatee"), array![owner]) == owner,
        'Pin: vault delegatee',
    );
    assert(raw(vault, selector!("exit_fee")) == 500, 'Pin: vault exit_fee');
}

/// An upgrade keeps the storage only if the new class finds every variable at its slot, and the
/// slot is the name (`docs/architecture/upgrades.md`). These are the variables of `Setup` (its
/// ownable and the wiring it holds since D-25 E; `Account` left the systems) and of `Economy` that
/// hold their wiring and their money terms, read at the raw address of their name
/// after a paid spawn. A rename or a retype fails here; whoever adds one adds it here.
#[test]
fn test_upgrade_layout_pins_setup_and_economy_by_name() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let wiring = systems.setup.contract_address;
    let economy = systems.economy.contract_address;
    let addresses = systems.economy.addresses();
    let (pool_key, _) = systems.economy.pool();

    // [Setup] the ownable, the two addresses set once
    start_cheat_caller_address(wiring, OWNER());
    IOwnableDispatcher { contract_address: wiring }.transfer_ownership(ANYONE());
    stop_cheat_caller_address(wiring);
    assert(raw(wiring, selector!("owner")) == OWNER().into(), 'Pin: setup owner');
    assert(raw(wiring, selector!("pending_owner")) == ANYONE().into(), 'Pin: setup pending');
    assert(raw(wiring, selector!("economy")) == economy.into(), 'Pin: setup economy');
    assert(
        raw(wiring, selector!("collection")) == systems.collection.contract_address.into(),
        'Pin: setup collection',
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
