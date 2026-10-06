//! Access control of the native contracts (phase P2): the owner set at deployment, and players who
//! only act on their own game. Rules: `docs/architecture/native-storage.md`.

use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait, OwnableComponent};
use paved::models::tile::CENTER;
use paved::systems::account::IAccountDispatcherTrait;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, NOONE, OWNER, PLAYER, PLAYER_NAME, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use snforge_std::{
    DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
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
fn test_access_owner_is_set_at_deployment() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    for ownable in ownables(@systems) {
        assert(ownable.owner() == OWNER(), 'Access: owner');
    }
}

#[test]
fn test_access_owner_transfers_ownership() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    for ownable in ownables(@systems) {
        let mut spy = spy_events();
        start_cheat_caller_address(ownable.contract_address, OWNER());
        ownable.transfer_ownership(ANYONE());
        stop_cheat_caller_address(ownable.contract_address);
        assert(ownable.owner() == ANYONE(), 'Access: new owner');
        let event = OwnableComponent::Event::OwnershipTransferred(
            OwnableComponent::OwnershipTransferred { previous_owner: OWNER(), new_owner: ANYONE() },
        );
        spy.assert_emitted(@array![(ownable.contract_address, event)]);
    }
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_transfer_ownership_reverts_for_non_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    // The setup keeps PLAYER as the caller of Daily.
    IOwnableDispatcher { contract_address: systems.daily.contract_address }
        .transfer_ownership(PLAYER());
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
