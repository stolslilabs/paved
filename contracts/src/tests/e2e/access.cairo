//! Access control of the native contracts (phase P2): the owner set at deployment, and players who
//! only act on their own game. Rules: `docs/architecture/native-storage.md`.

use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait, OwnableComponent};
use paved::constants;
use paved::models::tile::CENTER;
use paved::models::tournament::TournamentTrait;
use paved::systems::account::IAccountDispatcherTrait;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, NOONE, OWNER, PLAYER, PLAYER_NAME, SOMEONE, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn ownables(systems: @setup::Systems) -> Array<IOwnableDispatcher> {
    array![
        IOwnableDispatcher { contract_address: *systems.account.contract_address },
        IOwnableDispatcher { contract_address: *systems.tutorial.contract_address },
        IOwnableDispatcher { contract_address: *systems.daily.contract_address },
    ]
}

#[test]
#[available_gas(l2_gas: 23647712)]
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
#[available_gas(l2_gas: 28663961)]
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
#[available_gas(l2_gas: 30322887)]
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
#[available_gas(l2_gas: 26512332)]
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
    let ownable = IOwnableDispatcher { contract_address: systems.tutorial.contract_address };
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
#[available_gas(l2_gas: 26090232)]
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
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_upgrade_reverts_for_non_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let class_hash = *declare("Account").unwrap().contract_class().class_hash;
    IOwnableDispatcher { contract_address: systems.tutorial.contract_address }.upgrade(class_hash);
}

#[test]
#[should_panic(expected: 'Ownable: class hash is zero')]
fn test_access_upgrade_reverts_on_zero_class_hash() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.account.contract_address };
    start_cheat_caller_address(ownable.contract_address, OWNER());
    ownable.upgrade(0.try_into().unwrap());
}

#[test]
#[available_gas(l2_gas: 24438204)]
fn test_access_owner_upgrades_and_state_is_kept() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.account.contract_address };
    // Same class: the storage must survive the replacement.
    let class_hash = *declare("Account").unwrap().contract_class().class_hash;
    let mut spy = spy_events();
    start_cheat_caller_address(ownable.contract_address, OWNER());
    ownable.upgrade(class_hash);
    stop_cheat_caller_address(ownable.contract_address);
    let event = OwnableComponent::Event::Upgraded(OwnableComponent::Upgraded { class_hash });
    spy.assert_emitted(@array![(ownable.contract_address, event)]);
    assert(systems.account.player(context.player_id).name == PLAYER_NAME, 'Access: player kept');
}

#[test]
#[should_panic(expected: 'Player: Already exist')]
fn test_access_account_creates_once_per_address() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    start_cheat_caller_address(systems.account.contract_address, PLAYER());
    systems.account.create('AGAIN', PLAYER());
}

#[test]
#[available_gas(l2_gas: 23707394)]
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
    systems.daily.spawn();
}

#[test]
#[should_panic(expected: 'Player: Does not exist')]
fn test_access_tutorial_spawn_reverts_for_unregistered_caller() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let stranger: ContractAddress = 'STRANGER'.try_into().unwrap();
    start_cheat_caller_address(systems.tutorial.contract_address, stranger);
    systems.tutorial.spawn();
}

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_build_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Daily);
    start_cheat_caller_address(systems.daily.contract_address, NOONE());
    systems
        .daily
        .build(context.game_id, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);
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

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_tutorial_build_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    start_cheat_caller_address(systems.tutorial.contract_address, NOONE());
    systems.tutorial.build(context.game_id);
}

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_tutorial_surrender_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    start_cheat_caller_address(systems.tutorial.contract_address, NOONE());
    systems.tutorial.surrender(context.game_id);
}

#[test]
#[available_gas(l2_gas: 84146179)]
fn test_access_game_ids_are_counted_per_contract() {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);
    assert(context.game_id == 1, 'Access: first tutorial id');
    let daily_id = systems.daily.spawn();
    assert(daily_id == 1, 'Access: first daily id');
    // The two games live in two storages.
    let tutorial_game = store.game(1);
    let daily_game = setup::TestStoreTrait::new(systems.daily.contract_address).game(1);
    assert(tutorial_game.mode != daily_game.mode, 'Access: separate games');
}

/// The first felt of the panic raised by the constructor of `name` deployed with `calldata`.
fn constructor_panic(name: ByteArray, calldata: Array<felt252>) -> felt252 {
    let class = declare(name).unwrap().contract_class();
    let panic = class.deploy(@calldata).unwrap_err();
    *panic.at(0)
}

#[test]
#[available_gas(l2_gas: 506142)]
fn test_access_daily_constructor_reverts_on_zero_account() {
    let owner: felt252 = OWNER().into();
    let token: felt252 = SOMEONE().into();
    assert(
        constructor_panic("Daily", array![owner, 0, token]) == 'Daily: account is zero',
        'Access: account',
    );
}

#[test]
#[available_gas(l2_gas: 506142)]
fn test_access_daily_constructor_reverts_on_zero_token() {
    let owner: felt252 = OWNER().into();
    let account: felt252 = SOMEONE().into();
    assert(
        constructor_panic("Daily", array![owner, account, 0]) == 'Daily: token is zero',
        'Access: token',
    );
}

#[test]
#[available_gas(l2_gas: 465959)]
fn test_access_tutorial_constructor_reverts_on_zero_account() {
    let owner: felt252 = OWNER().into();
    assert(
        constructor_panic("Tutorial", array![owner, 0]) == 'Tutorial: account is zero',
        'Access: tutorial account',
    );
}

#[test]
#[available_gas(l2_gas: 1327032)]
fn test_access_constructors_revert_on_zero_owner() {
    let account: felt252 = SOMEONE().into();
    let token: felt252 = ANYONE().into();
    assert(
        constructor_panic("Account", array![0]) == 'Ownable: new owner is zero',
        'Access: account owner',
    );
    assert(
        constructor_panic("Tutorial", array![0, account]) == 'Ownable: new owner is zero',
        'Access: tutorial owner',
    );
    assert(
        constructor_panic("Daily", array![0, account, token]) == 'Ownable: new owner is zero',
        'Access: daily owner',
    );
}

/// Forces PLAYER first of the tournament of the game, then moves past the end of the tournament.
fn close_tournament(store: setup::TestStore, game_id: u32, player_id: felt252) -> u64 {
    let game = store.game(game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );
    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = player_id;
    tournament.top1_score = 1;
    store.set_tournament(tournament);
    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    tournament_id
}

#[test]
#[should_panic(expected: 'Tournament: invalid player')]
fn test_access_claim_reverts_for_registered_non_holder() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let tournament_id = close_tournament(store, context.game_id, context.player_id);
    // ANYONE is registered but is not at rank 1.
    start_cheat_caller_address(systems.daily.contract_address, ANYONE());
    systems.daily.claim(tournament_id, 1);
}

#[test]
#[should_panic(expected: 'Tournament: invalid player')]
fn test_access_claim_reverts_on_an_empty_rank() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let tournament_id = close_tournament(store, context.game_id, context.player_id);
    // Nobody holds rank 2 (id 0), and no registered player has id 0.
    systems.daily.claim(tournament_id, 2);
}

#[test]
#[should_panic(expected: 'Tournament: already claimed')]
fn test_access_claim_reverts_on_a_second_claim_of_the_same_rank() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let tournament_id = close_tournament(store, context.game_id, context.player_id);
    systems.daily.claim(tournament_id, 1);
    systems.daily.claim(tournament_id, 1);
}

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_tutorial_discard_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    start_cheat_caller_address(systems.tutorial.contract_address, NOONE());
    systems.tutorial.discard(context.game_id);
}

/// `sponsor` only adds to a tournament that exists, that is one that has at least one entry fee:
/// with no game spawned in the current period it reverts, and the caller pays nothing.
#[test]
#[should_panic(expected: 'Tournament: not found')]
fn test_access_sponsor_reverts_without_a_current_tournament() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    systems.daily.sponsor(1000);
}
