//! Access control of the native contracts (phase P2): the owner set at deployment, and players who
//! only act on their own game. Rules: `docs/architecture/native-storage.md`.

use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait, OwnableComponent};
use paved::constants;
use paved::models::tile::CENTER;
use paved::systems::account::IAccountDispatcherTrait;
use paved::systems::daily::{IDailySetupDispatcher, IDailySetupDispatcherTrait};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, IERC20DispatcherTrait, NOONE, OWNER, PLAYER, PLAYER_NAME,
    SOMEONE, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn ownables(systems: @setup::Systems) -> Array<IOwnableDispatcher> {
    array![
        IOwnableDispatcher { contract_address: *systems.account.contract_address },
        IOwnableDispatcher { contract_address: *systems.daily.contract_address },
        IOwnableDispatcher { contract_address: *systems.setup.contract_address },
        IOwnableDispatcher { contract_address: *systems.economy.contract_address },
        IOwnableDispatcher { contract_address: *systems.collection.contract_address },
    ]
}

#[test]
#[available_gas(l2_gas: 64186000)]
fn test_access_owner_is_set_at_deployment() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    for ownable in ownables(@systems) {
        assert(ownable.owner() == OWNER(), 'Access: owner');
    }
}

fn propose(ownable: IOwnableDispatcher, from: ContractAddress, to: ContractAddress) {
    start_cheat_caller_address(ownable.contract_address, from);
    ownable.transfer_ownership(to);
    stop_cheat_caller_address(ownable.contract_address);
}

fn accept(ownable: IOwnableDispatcher, caller: ContractAddress) {
    start_cheat_caller_address(ownable.contract_address, caller);
    ownable.accept_ownership();
    stop_cheat_caller_address(ownable.contract_address);
}

#[test]
#[available_gas(l2_gas: 72538000)]
fn test_access_transfer_ownership_only_proposes() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    for ownable in ownables(@systems) {
        let mut spy = spy_events();
        propose(ownable, OWNER(), ANYONE());
        assert(ownable.owner() == OWNER(), 'Access: owner unchanged');
        assert(ownable.pending_owner() == ANYONE(), 'Access: pending owner');
        let event = OwnableComponent::Event::OwnershipTransferStarted(
            OwnableComponent::OwnershipTransferStarted {
                previous_owner: OWNER(), new_owner: ANYONE(),
            },
        );
        spy.assert_emitted(@array![(ownable.contract_address, event)]);
    }
}

#[test]
#[available_gas(l2_gas: 75295000)]
fn test_access_pending_owner_accepts_ownership() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    for ownable in ownables(@systems) {
        propose(ownable, OWNER(), ANYONE());
        let mut spy = spy_events();
        accept(ownable, ANYONE());
        assert(ownable.owner() == ANYONE(), 'Access: new owner');
        assert(ownable.pending_owner() == 0.try_into().unwrap(), 'Access: pending cleared');
        let event = OwnableComponent::Event::OwnershipTransferred(
            OwnableComponent::OwnershipTransferred { previous_owner: OWNER(), new_owner: ANYONE() },
        );
        spy.assert_emitted(@array![(ownable.contract_address, event)]);
    }
}

#[test]
#[available_gas(l2_gas: 66707000)]
fn test_access_new_owner_holds_the_power() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.account.contract_address };
    propose(ownable, OWNER(), ANYONE());
    accept(ownable, ANYONE());
    // The new owner proposes in turn.
    propose(ownable, ANYONE(), NOONE());
    assert(ownable.pending_owner() == NOONE(), 'Access: new owner proposes');
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_old_owner_cannot_transfer_after_accept() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.account.contract_address };
    propose(ownable, OWNER(), ANYONE());
    accept(ownable, ANYONE());
    propose(ownable, OWNER(), NOONE());
}

#[test]
#[should_panic(expected: 'Ownable: caller not pending')]
fn test_access_accept_ownership_reverts_for_wrong_caller() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.daily.contract_address };
    propose(ownable, OWNER(), ANYONE());
    accept(ownable, NOONE());
}

#[test]
#[should_panic(expected: 'Ownable: caller not pending')]
fn test_access_accept_ownership_reverts_for_the_owner_itself() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.daily.contract_address };
    propose(ownable, OWNER(), ANYONE());
    accept(ownable, OWNER());
}

#[test]
#[should_panic(expected: 'Ownable: caller not pending')]
fn test_access_accept_ownership_reverts_without_proposal() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.setup.contract_address };
    accept(ownable, ANYONE());
}

#[test]
#[should_panic(expected: 'Ownable: caller not pending')]
fn test_access_accept_ownership_twice_reverts() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.account.contract_address };
    propose(ownable, OWNER(), ANYONE());
    accept(ownable, ANYONE());
    // The pending owner was cleared by the first accept.
    accept(ownable, ANYONE());
}

#[test]
#[should_panic(expected: 'Ownable: caller not pending')]
fn test_access_new_proposal_overwrites_the_pending_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.account.contract_address };
    propose(ownable, OWNER(), ANYONE());
    propose(ownable, OWNER(), NOONE());
    assert(ownable.pending_owner() == NOONE(), 'Access: pending overwritten');
    // The first candidate can no longer accept.
    accept(ownable, ANYONE());
}

#[test]
#[available_gas(l2_gas: 66285000)]
fn test_access_overwriting_proposal_lets_the_second_candidate_accept() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.account.contract_address };
    propose(ownable, OWNER(), ANYONE());
    propose(ownable, OWNER(), NOONE());
    accept(ownable, NOONE());
    assert(ownable.owner() == NOONE(), 'Access: second candidate owns');
}

#[test]
#[should_panic(expected: 'Ownable: new owner is zero')]
fn test_access_transfer_ownership_reverts_to_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.account.contract_address };
    start_cheat_caller_address(ownable.contract_address, OWNER());
    ownable.transfer_ownership(0.try_into().unwrap());
}

#[test]
#[should_panic(expected: 'Player: Already exist')]
fn test_access_account_creates_once_per_address() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    start_cheat_caller_address(systems.account.contract_address, PLAYER());
    systems.account.create('AGAIN', PLAYER());
}

#[test]
#[available_gas(l2_gas: 63919000)]
fn test_access_account_player_view() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let player = systems.account.player(context.player_id);
    assert(player.id == context.player_id, 'Access: player id');
    assert(player.name == PLAYER_NAME, 'Access: player name');
    let unknown = systems.account.player('UNKNOWN');
    assert(unknown.id == 'UNKNOWN', 'Access: unknown id');
    assert(unknown.name == 0, 'Access: unknown name');
}

#[test]
#[should_panic(expected: 'Player: Does not exist')]
fn test_access_daily_spawn_reverts_for_unregistered_caller() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let stranger: ContractAddress = 'STRANGER'.try_into().unwrap();
    start_cheat_caller_address(systems.daily.contract_address, stranger);
    systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
}


#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_build_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    start_cheat_caller_address(systems.daily.contract_address, NOONE());
    systems.daily.build(context.game_id, Orientation::North, CENTER, CENTER + 1);
}

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_discard_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    start_cheat_caller_address(systems.daily.contract_address, NOONE());
    systems.daily.discard(context.game_id);
}

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_surrender_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    start_cheat_caller_address(systems.daily.contract_address, NOONE());
    systems.daily.surrender(context.game_id);
}


/// A non-zero address for the constructor checks, which do not call `Setup`.
const SETUP: felt252 = 'setup';

/// The first felt of the panic raised by the constructor of `name` deployed with `calldata`.
fn constructor_panic(name: ByteArray, calldata: Array<felt252>) -> felt252 {
    let class = declare(name).unwrap().contract_class();
    let panic = class.deploy(@calldata).unwrap_err();
    *panic.at(0)
}

#[test]
#[available_gas(l2_gas: 554348)]
fn test_access_daily_constructor_reverts_on_zero_account() {
    let owner: felt252 = OWNER().into();
    let token: felt252 = SOMEONE().into();
    assert(
        constructor_panic("Daily", array![owner, 0, token, SETUP]) == 'Daily: account is zero',
        'Access: account',
    );
}

#[test]
#[available_gas(l2_gas: 554348)]
fn test_access_daily_constructor_reverts_on_zero_token() {
    let owner: felt252 = OWNER().into();
    let account: felt252 = SOMEONE().into();
    assert(
        constructor_panic("Daily", array![owner, account, 0, SETUP]) == 'Daily: token is zero',
        'Access: token',
    );
}

#[test]
#[available_gas(l2_gas: 554978)]
fn test_access_daily_constructor_reverts_on_zero_setup() {
    let owner: felt252 = OWNER().into();
    let account: felt252 = SOMEONE().into();
    let token: felt252 = ANYONE().into();
    assert(
        constructor_panic("Daily", array![owner, account, token, 0]) == 'Daily: setup is zero',
        'Access: daily setup',
    );
}

/// `Daily`'s `Setup` is the owner's to set (an upgrade in place does not run the constructor):
/// never zero, and it emits `SetupSet`.
#[test]
fn test_access_daily_owner_sets_the_setup() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailySetupDispatcher { contract_address: daily };
    assert(admin.setup() == systems.setup.contract_address, 'Access: setup at deploy');
    let mut spy = spy_events();
    start_cheat_caller_address(daily, OWNER());
    admin.set_setup(SOMEONE());
    stop_cheat_caller_address(daily);
    assert(admin.setup() == SOMEONE(), 'Access: setup set');
    spy
        .assert_emitted(
            @array![
                (
                    daily,
                    paved::systems::daily::Daily::Event::SetupSet(
                        paved::systems::daily::SetupSet { setup: SOMEONE() },
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_daily_set_setup_reverts_for_a_player() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    start_cheat_caller_address(daily, PLAYER());
    IDailySetupDispatcher { contract_address: daily }.set_setup(SOMEONE());
}

#[test]
#[should_panic(expected: 'Daily: setup is zero')]
fn test_access_daily_set_setup_reverts_on_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    start_cheat_caller_address(daily, OWNER());
    IDailySetupDispatcher { contract_address: daily }.set_setup(core::num::traits::Zero::zero());
}


#[test]
#[available_gas(l2_gas: 1415736)]
fn test_access_constructors_revert_on_zero_owner() {
    let account: felt252 = SOMEONE().into();
    let token: felt252 = ANYONE().into();
    assert(
        constructor_panic("Account", array![0]) == 'Ownable: new owner is zero',
        'Access: account owner',
    );
    assert(
        constructor_panic("Setup", array![0]) == 'Ownable: new owner is zero',
        'Access: setup owner',
    );
    assert(
        constructor_panic(
            "Daily", array![0, account, token, SETUP],
        ) == 'Ownable: new owner is zero',
        'Access: daily owner',
    );
}


/// A game whose player is 0 can never be acted on: `builder_of` gives player 0 no builder, so
/// `surrender`, `discard` and `build` revert before `end_in_day`. The game is forced, since the
/// token refuses the zero address before a game of player 0 can be paid for (`ERC20: mint to 0`).
#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_player_zero_cannot_end_its_game() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let mut game = store.game(context.game_id);
    game.player_id = 0;
    store.set_game(game);
    let zero: ContractAddress = 0.try_into().unwrap();
    start_cheat_caller_address(systems.daily.contract_address, zero);
    systems.daily.surrender(context.game_id);
}

/// A fresh `Account` of `OWNER`, its economy not set.
fn fresh_account() -> paved::systems::account::IAccountDispatcher {
    let class = declare("Account").unwrap().contract_class();
    let owner: felt252 = OWNER().into();
    let (address, _) = class.deploy(@array![owner]).unwrap();
    paved::systems::account::IAccountDispatcher { contract_address: address }
}

fn ECONOMY() -> ContractAddress {
    'ECONOMY'.try_into().unwrap()
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_account_set_economy_reverts_for_non_owner() {
    let account = fresh_account();
    start_cheat_caller_address(account.contract_address, ANYONE());
    account.set_economy(ECONOMY());
}

#[test]
#[should_panic(expected: 'Account: economy already set')]
fn test_access_account_set_economy_reverts_twice() {
    let account = fresh_account();
    start_cheat_caller_address(account.contract_address, OWNER());
    account.set_economy(ECONOMY());
    account.set_economy(ANYONE());
}

#[test]
#[should_panic(expected: 'Account: economy is zero')]
fn test_access_account_set_economy_reverts_on_zero() {
    let account = fresh_account();
    start_cheat_caller_address(account.contract_address, OWNER());
    account.set_economy(core::num::traits::Zero::zero());
}

#[test]
#[available_gas(l2_gas: 2490978)]
fn test_access_account_set_economy_emits_economy_set() {
    let account = fresh_account();
    assert(account.economy() == core::num::traits::Zero::zero(), 'Account: economy before');
    let mut spy = spy_events();
    start_cheat_caller_address(account.contract_address, OWNER());
    account.set_economy(ECONOMY());
    assert(account.economy() == ECONOMY(), 'Account: economy after');
    spy
        .assert_emitted(
            @array![
                (
                    account.contract_address,
                    paved::systems::account::Account::Event::EconomySet(
                        paved::systems::account::Account::EconomySet { economy: ECONOMY() },
                    ),
                ),
            ],
        );
}

fn COLLECTION() -> ContractAddress {
    'COLLECTION'.try_into().unwrap()
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_account_set_collection_reverts_for_non_owner() {
    let account = fresh_account();
    start_cheat_caller_address(account.contract_address, ANYONE());
    account.set_collection(COLLECTION());
}

#[test]
#[should_panic(expected: 'Account: collection already set')]
fn test_access_account_set_collection_reverts_twice() {
    let account = fresh_account();
    start_cheat_caller_address(account.contract_address, OWNER());
    account.set_collection(COLLECTION());
    account.set_collection(ANYONE());
}

#[test]
#[should_panic(expected: 'Account: collection is zero')]
fn test_access_account_set_collection_reverts_on_zero() {
    let account = fresh_account();
    start_cheat_caller_address(account.contract_address, OWNER());
    account.set_collection(core::num::traits::Zero::zero());
}

#[test]
fn test_access_account_set_collection_emits_collection_set() {
    let account = fresh_account();
    assert(account.collection() == core::num::traits::Zero::zero(), 'Account: collection before');
    let mut spy = spy_events();
    start_cheat_caller_address(account.contract_address, OWNER());
    account.set_collection(COLLECTION());
    assert(account.collection() == COLLECTION(), 'Account: collection after');
    spy
        .assert_emitted(
            @array![
                (
                    account.contract_address,
                    paved::systems::account::Account::Event::CollectionSet(
                        paved::systems::account::Account::CollectionSet {
                            collection: COLLECTION(),
                        },
                    ),
                ),
            ],
        );
}
