//! Access control of the native contracts (phase P2): the owner set at deployment, and players who
//! only act on their own game. Rules: `docs/architecture/native-storage.md`.

use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait, OwnableComponent};
use paved::constants;
use paved::models::tile::CENTER;
use paved::models::tournament::TournamentTrait;
use paved::systems::account::IAccountDispatcherTrait;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::leaderboard;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, IERC20DispatcherTrait, NOONE, OWNER, PLAYER, PLAYER_NAME,
    SOMEONE, TestStoreTrait,
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
#[available_gas(l2_gas: 57134000)]
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
#[available_gas(l2_gas: 61891000)]
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
#[available_gas(l2_gas: 63449000)]
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
#[available_gas(l2_gas: 59861000)]
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
#[available_gas(l2_gas: 59459000)]
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
#[available_gas(l2_gas: 57888000)]
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
#[available_gas(l2_gas: 57193000)]
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
#[available_gas(l2_gas: 124682000)]
fn test_access_game_ids_are_counted_per_contract() {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);
    assert(context.game_id == 1, 'Access: first tutorial id');
    let daily_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    assert(daily_id == 1, 'Access: first daily id');
    // The two games live in two storages.
    let tutorial_game = store.game(1);
    let daily_game = setup::TestStoreTrait::new(systems.daily.contract_address).game(1);
    assert(tutorial_game.mode != daily_game.mode, 'Access: separate games');
}

/// A non-zero class hash for the constructor checks, which do not call the lobby.
const LOBBY: felt252 = 'lobby';

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
        constructor_panic("Daily", array![owner, 0, token, LOBBY]) == 'Daily: account is zero',
        'Access: account',
    );
}

#[test]
#[available_gas(l2_gas: 554348)]
fn test_access_daily_constructor_reverts_on_zero_token() {
    let owner: felt252 = OWNER().into();
    let account: felt252 = SOMEONE().into();
    assert(
        constructor_panic("Daily", array![owner, account, 0, LOBBY]) == 'Daily: token is zero',
        'Access: token',
    );
}

#[test]
#[available_gas(l2_gas: 554978)]
fn test_access_daily_constructor_reverts_on_zero_lobby_class() {
    let owner: felt252 = OWNER().into();
    let account: felt252 = SOMEONE().into();
    let token: felt252 = ANYONE().into();
    assert(
        constructor_panic(
            "Daily", array![owner, account, token, 0],
        ) == 'Daily: lobby class is zero',
        'Access: daily lobby',
    );
}

#[test]
#[available_gas(l2_gas: 507087)]
fn test_access_tutorial_constructor_reverts_on_zero_lobby_class() {
    let owner: felt252 = OWNER().into();
    let account: felt252 = SOMEONE().into();
    assert(
        constructor_panic("Tutorial", array![owner, account, 0]) == 'Tutorial: lobby class is zero',
        'Access: tutorial lobby',
    );
}

#[test]
#[available_gas(l2_gas: 506457)]
fn test_access_tutorial_constructor_reverts_on_zero_account() {
    let owner: felt252 = OWNER().into();
    assert(
        constructor_panic("Tutorial", array![owner, 0, LOBBY]) == 'Tutorial: account is zero',
        'Access: tutorial account',
    );
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
        constructor_panic("Tutorial", array![0, account, LOBBY]) == 'Ownable: new owner is zero',
        'Access: tutorial owner',
    );
    assert(
        constructor_panic(
            "Daily", array![0, account, token, LOBBY],
        ) == 'Ownable: new owner is zero',
        'Access: daily owner',
    );
}

/// Forces PLAYER first of the tournament of the game, sponsors its prize (entries no longer feed
/// it, P-31), then moves past the end of the tournament.
fn close_tournament(
    store: setup::TestStore, systems: @setup::Systems, game_id: u32, player_id: felt252,
) -> u64 {
    let game = store.game(game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );
    leaderboard::submit(store.contract, tournament_id, player_id, 1);
    systems.daily.sponsor(2_000_000);
    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    tournament_id
}

#[test]
#[should_panic(expected: 'Tournament: invalid player')]
fn test_access_claim_reverts_for_registered_non_holder() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let tournament_id = close_tournament(store, @systems, context.game_id, context.player_id);
    // ANYONE is registered but is not at rank 1.
    start_cheat_caller_address(systems.daily.contract_address, ANYONE());
    systems.daily.claim(tournament_id, 1);
}

#[test]
#[should_panic(expected: 'Tournament: invalid player')]
fn test_access_claim_reverts_on_an_empty_rank() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let tournament_id = close_tournament(store, @systems, context.game_id, context.player_id);
    // Nobody holds rank 2 (id 0), and no registered player has id 0.
    systems.daily.claim(tournament_id, 2);
}

#[test]
#[should_panic(expected: 'Tournament: already claimed')]
fn test_access_claim_reverts_on_a_second_claim_of_the_same_rank() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let tournament_id = close_tournament(store, @systems, context.game_id, context.player_id);
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

/// The prize is sponsor-only (P-31): `sponsor` funds the current day even when no game was
/// spawned in it.
#[test]
fn test_access_sponsor_funds_a_day_without_entries() {
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let before = context.token.balance_of(PLAYER());
    systems.daily.sponsor(1000);
    let tournament_id = TournamentTrait::compute_id(0, constants::DAILY_TOURNAMENT_DURATION);
    assert(store.tournament(tournament_id).prize == 1000, 'Sponsor: prize');
    assert(before - context.token.balance_of(PLAYER()) == 1000, 'Sponsor: debit');
}

/// A game whose player is 0 can never be acted on: `builder_of` gives player 0 no builder, so
/// `surrender`, `discard` and `build` revert before `end_in_tournament`, and player 0 is never
/// submitted to the leaderboard (`docs/architecture/leaderboard.md`). The game is forced, since the
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
