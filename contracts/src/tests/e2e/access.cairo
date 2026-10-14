//! Access control of the native contracts (phase P2): the owner set at deployment, and players who
//! only act on their own game. Rules: `docs/architecture/native-storage.md`.

use paved::components::ownable::{
    IOwnableDispatcher, IOwnableDispatcherTrait, IOwnableSafeDispatcher,
    IOwnableSafeDispatcherTrait, OwnableComponent,
};
use paved::constants;
use paved::mocks::account::{IMockAccountDispatcher, IMockAccountDispatcherTrait};
use paved::models::tile::CENTER;
use paved::systems::challenge::{
    IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait, IChallengeSetupDispatcher,
    IChallengeSetupDispatcherTrait,
};
use paved::systems::collection::{IERC721SoulboundDispatcher, IERC721SoulboundDispatcherTrait};
use paved::systems::economy::{
    DAY, IEconomyDispatcher, IEconomyDispatcherTrait, IEconomySafeDispatcher,
    IEconomySafeDispatcherTrait,
};
use paved::systems::setup::{ISetupDispatcher, ISetupDispatcherTrait, Setup, Wiring};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, IERC20DispatcherTrait, NOONE, OWNER, PLAYER, SOMEONE,
    TestStoreTrait,
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
        IOwnableDispatcher { contract_address: *systems.challenge.contract_address },
        IOwnableDispatcher { contract_address: *systems.setup.contract_address },
        IOwnableDispatcher { contract_address: *systems.economy.contract_address },
        IOwnableDispatcher { contract_address: *systems.collection.contract_address },
        IOwnableDispatcher { contract_address: systems.economy.addresses().vault },
    ]
}

#[test]
#[available_gas(l2_gas: 62292279)]
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
#[available_gas(l2_gas: 68982281)]
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
#[available_gas(l2_gas: 71195754)]
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
#[available_gas(l2_gas: 64957977)]
fn test_access_new_owner_holds_the_power() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.setup.contract_address };
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
    let ownable = IOwnableDispatcher { contract_address: systems.setup.contract_address };
    propose(ownable, OWNER(), ANYONE());
    accept(ownable, ANYONE());
    propose(ownable, OWNER(), NOONE());
}

#[test]
#[should_panic(expected: 'Ownable: caller not pending')]
fn test_access_accept_ownership_reverts_for_wrong_caller() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.challenge.contract_address };
    propose(ownable, OWNER(), ANYONE());
    accept(ownable, NOONE());
}

#[test]
#[should_panic(expected: 'Ownable: caller not pending')]
fn test_access_accept_ownership_reverts_for_the_owner_itself() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.challenge.contract_address };
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
    let ownable = IOwnableDispatcher { contract_address: systems.setup.contract_address };
    propose(ownable, OWNER(), ANYONE());
    accept(ownable, ANYONE());
    // The pending owner was cleared by the first accept.
    accept(ownable, ANYONE());
}

#[test]
#[should_panic(expected: 'Ownable: caller not pending')]
fn test_access_new_proposal_overwrites_the_pending_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.setup.contract_address };
    propose(ownable, OWNER(), ANYONE());
    propose(ownable, OWNER(), NOONE());
    assert(ownable.pending_owner() == NOONE(), 'Access: pending overwritten');
    // The first candidate can no longer accept.
    accept(ownable, ANYONE());
}

#[test]
#[available_gas(l2_gas: 64535877)]
fn test_access_overwriting_proposal_lets_the_second_candidate_accept() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.setup.contract_address };
    propose(ownable, OWNER(), ANYONE());
    propose(ownable, OWNER(), NOONE());
    accept(ownable, NOONE());
    assert(ownable.owner() == NOONE(), 'Access: second candidate owns');
}

#[test]
#[should_panic(expected: 'Ownable: new owner is zero')]
fn test_access_transfer_ownership_reverts_to_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownable = IOwnableDispatcher { contract_address: systems.setup.contract_address };
    start_cheat_caller_address(ownable.contract_address, OWNER());
    ownable.transfer_ownership(0.try_into().unwrap());
}

/// Any account may play (D-25): an address that never registered anywhere, only funded, spawns a
/// paid game that is its own (its id is the address), minted to it, and plays it.
#[test]
fn test_access_daily_spawn_by_an_unregistered_address() {
    let (store, systems, _) = setup::spawn_game(Mode::None);
    let stranger: ContractAddress = 'STRANGER'.try_into().unwrap();
    let challenge = systems.challenge.contract_address;
    let usdc = systems.economy.addresses().usdc;
    setup::fund(usdc, challenge, stranger);
    start_cheat_caller_address(challenge, stranger);
    let game_id = systems.challenge.spawn(1, core::num::traits::Zero::zero(), 0);
    assert(store.game(game_id).player_id == stranger.into(), 'Access: stranger game');
    let erc721 = IERC721SoulboundDispatcher {
        contract_address: systems.collection.contract_address,
    };
    assert(erc721.owner_of(game_id.into()) == stranger, 'Access: stranger token');
    systems.challenge.surrender(game_id);
    assert(store.game(game_id).over, 'Access: stranger over');
}


/// A registration in the old registry (now a mock, P-53 ruling 5) changes nothing for `Daily`
/// (D-25 E): PLAYER is registered and STRANGER is not; each spawns, and each, named as the other's
/// referrer, is paid the same 5 % of 2 USDC.
#[test]
fn test_access_a_registration_changes_nothing() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let registry = IMockAccountDispatcher { contract_address: deploy_mock_account() };
    start_cheat_caller_address(registry.contract_address, PLAYER());
    registry.register('PLAYER');
    stop_cheat_caller_address(registry.contract_address);
    let stranger: ContractAddress = 'STRANGER'.try_into().unwrap();
    assert(registry.player(PLAYER().into()) == 'PLAYER', 'Mock: registered');
    assert(registry.player(stranger.into()) == 0, 'Mock: stranger registered');
    let challenge = systems.challenge.contract_address;
    let token = context.token;
    setup::fund(token.contract_address, challenge, stranger);
    // [Registered] pays the unregistered referrer
    start_cheat_caller_address(challenge, PLAYER());
    systems.challenge.spawn(1, stranger, 0);
    assert(token.balance_of(stranger) - setup::FUNDS == 100_000, 'Mock: stranger not paid');
    // [Unregistered] pays the registered referrer
    let before = token.balance_of(PLAYER());
    start_cheat_caller_address(challenge, stranger);
    systems.challenge.spawn(1, PLAYER(), 0);
    assert(token.balance_of(PLAYER()) - before == 100_000, 'Mock: player not paid');
}

fn deploy_mock_account() -> ContractAddress {
    let class = declare("MockAccount").unwrap().contract_class();
    let (address, _) = class.deploy(@array![]).unwrap();
    address
}

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_build_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    start_cheat_caller_address(systems.challenge.contract_address, NOONE());
    systems.challenge.build(context.game_id, Orientation::North, CENTER, CENTER + 1);
}

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_discard_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    start_cheat_caller_address(systems.challenge.contract_address, NOONE());
    systems.challenge.discard(context.game_id);
}

#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_surrender_reverts_on_another_players_game() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    start_cheat_caller_address(systems.challenge.contract_address, NOONE());
    systems.challenge.surrender(context.game_id);
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
#[available_gas(l2_gas: 484775)]
fn test_access_daily_constructor_reverts_on_zero_token() {
    let owner: felt252 = OWNER().into();
    assert(
        constructor_panic("Challenge", array![owner, 0, SETUP]) == 'Challenge: token is zero',
        'Access: token',
    );
}

#[test]
#[available_gas(l2_gas: 485405)]
fn test_access_daily_constructor_reverts_on_zero_setup() {
    let owner: felt252 = OWNER().into();
    let token: felt252 = ANYONE().into();
    assert(
        constructor_panic("Challenge", array![owner, token, 0]) == 'Challenge: setup is zero',
        'Access: challenge setup',
    );
}

/// `Daily`'s `Setup` is the owner's to set (an upgrade in place does not run the constructor):
/// never zero, and it emits `SetupSet`.
#[test]
fn test_access_daily_owner_sets_the_setup() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    let admin = IChallengeSetupDispatcher { contract_address: challenge };
    assert(admin.setup() == systems.setup.contract_address, 'Access: setup at deploy');
    let mut spy = spy_events();
    start_cheat_caller_address(challenge, OWNER());
    admin.set_setup(SOMEONE());
    stop_cheat_caller_address(challenge);
    assert(admin.setup() == SOMEONE(), 'Access: setup set');
    spy
        .assert_emitted(
            @array![
                (
                    challenge,
                    paved::systems::challenge::Challenge::Event::SetupSet(
                        paved::systems::challenge::SetupSet { setup: SOMEONE() },
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_daily_set_setup_reverts_for_a_player() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    start_cheat_caller_address(challenge, PLAYER());
    IChallengeSetupDispatcher { contract_address: challenge }.set_setup(SOMEONE());
}

#[test]
#[should_panic(expected: 'Challenge: setup is zero')]
fn test_access_daily_set_setup_reverts_on_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    start_cheat_caller_address(challenge, OWNER());
    IChallengeSetupDispatcher { contract_address: challenge }
        .set_setup(core::num::traits::Zero::zero());
}


#[test]
#[available_gas(l2_gas: 877191)]
fn test_access_constructors_revert_on_zero_owner() {
    let token: felt252 = ANYONE().into();
    assert(
        constructor_panic("Setup", array![0]) == 'Ownable: new owner is zero',
        'Access: setup owner',
    );
    assert(
        constructor_panic("Challenge", array![0, token, SETUP]) == 'Ownable: new owner is zero',
        'Access: challenge owner',
    );
}


/// A game whose player is 0 can never be acted on: `builder_of` gives player 0 no builder, so
/// `surrender`, `discard` and `build` revert before `end_in_day`. The game is forced, since the
/// token refuses the zero address before a game of player 0 can be paid for (`ERC20: mint to 0`).
#[test]
#[should_panic(expected: 'Builder: does not exist')]
fn test_access_daily_player_zero_cannot_end_its_game() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let mut game = store.game(context.game_id);
    game.player_id = 0;
    store.set_game(game);
    let zero: ContractAddress = 0.try_into().unwrap();
    start_cheat_caller_address(systems.challenge.contract_address, zero);
    systems.challenge.surrender(context.game_id);
}

// Setup's wiring (D-25 E): the owner sets each address once, never zero; `wiring` reads both

/// A fresh `Setup` of `OWNER`, its wiring not set.
fn fresh_setup() -> ISetupDispatcher {
    let class = declare("Setup").unwrap().contract_class();
    let owner: felt252 = OWNER().into();
    let (address, _) = class.deploy(@array![owner]).unwrap();
    ISetupDispatcher { contract_address: address }
}

fn ECONOMY() -> ContractAddress {
    'ECONOMY'.try_into().unwrap()
}

fn COLLECTION() -> ContractAddress {
    'COLLECTION'.try_into().unwrap()
}

fn zero() -> ContractAddress {
    core::num::traits::Zero::zero()
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_setup_set_economy_reverts_for_non_owner() {
    let setup = fresh_setup();
    start_cheat_caller_address(setup.contract_address, ANYONE());
    setup.set_economy(ECONOMY());
}

#[test]
#[should_panic(expected: 'Setup: economy already set')]
fn test_access_setup_set_economy_reverts_twice() {
    let setup = fresh_setup();
    start_cheat_caller_address(setup.contract_address, OWNER());
    setup.set_economy(ECONOMY());
    setup.set_economy(ANYONE());
}

#[test]
#[should_panic(expected: 'Setup: economy is zero')]
fn test_access_setup_set_economy_reverts_on_zero() {
    let setup = fresh_setup();
    start_cheat_caller_address(setup.contract_address, OWNER());
    setup.set_economy(zero());
}

#[test]
fn test_access_setup_set_economy_emits_economy_set() {
    let setup = fresh_setup();
    assert(setup.wiring() == Wiring { economy: zero(), collection: zero() }, 'Setup: before');
    let mut spy = spy_events();
    start_cheat_caller_address(setup.contract_address, OWNER());
    setup.set_economy(ECONOMY());
    assert(
        setup.wiring() == Wiring { economy: ECONOMY(), collection: zero() }, 'Setup: economy after',
    );
    spy
        .assert_emitted(
            @array![
                (
                    setup.contract_address,
                    Setup::Event::EconomySet(Setup::EconomySet { economy: ECONOMY() }),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_setup_set_collection_reverts_for_non_owner() {
    let setup = fresh_setup();
    start_cheat_caller_address(setup.contract_address, ANYONE());
    setup.set_collection(COLLECTION());
}

#[test]
#[should_panic(expected: 'Setup: collection already set')]
fn test_access_setup_set_collection_reverts_twice() {
    let setup = fresh_setup();
    start_cheat_caller_address(setup.contract_address, OWNER());
    setup.set_collection(COLLECTION());
    setup.set_collection(ANYONE());
}

#[test]
#[should_panic(expected: 'Setup: collection is zero')]
fn test_access_setup_set_collection_reverts_on_zero() {
    let setup = fresh_setup();
    start_cheat_caller_address(setup.contract_address, OWNER());
    setup.set_collection(zero());
}

#[test]
fn test_access_setup_set_collection_emits_collection_set() {
    let setup = fresh_setup();
    let mut spy = spy_events();
    start_cheat_caller_address(setup.contract_address, OWNER());
    setup.set_collection(COLLECTION());
    assert(
        setup.wiring() == Wiring { economy: zero(), collection: COLLECTION() },
        'Setup: collection after',
    );
    spy
        .assert_emitted(
            @array![
                (
                    setup.contract_address,
                    Setup::Event::CollectionSet(Setup::CollectionSet { collection: COLLECTION() }),
                ),
            ],
        );
}

/// The pending owner holds no power over the wiring before it accepts.
#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_access_setup_wiring_reverts_for_the_pending_owner() {
    let setup = fresh_setup();
    propose(IOwnableDispatcher { contract_address: setup.contract_address }, OWNER(), ANYONE());
    start_cheat_caller_address(setup.contract_address, ANYONE());
    setup.set_economy(ECONOMY());
}

/// The deployment's wiring, read back through the one view.
#[test]
fn test_access_setup_wiring_of_the_deployment() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    assert(
        systems
            .setup
            .wiring() == Wiring {
                economy: systems.economy.contract_address,
                collection: systems.collection.contract_address,
            },
        'Setup: deployment wiring',
    );
}

/// The constructor's `OwnershipTransferred { previous_owner: 0, new_owner }` (the indexer reads it
/// as the first owner), for every ownable: the spy is set before the deployments.
#[test]
fn test_access_constructor_emits_ownership_transferred() {
    let mut spy = spy_events();
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let ownables = ownables(@systems);
    assert(ownables.len() == 5, 'Access: five ownables');
    for ownable in ownables {
        let event = OwnableComponent::Event::OwnershipTransferred(
            OwnableComponent::OwnershipTransferred { previous_owner: zero(), new_owner: OWNER() },
        );
        spy.assert_emitted(@array![(ownable.contract_address, event)]);
        assert(ownable.owner() == OWNER(), 'Access: constructor owner');
    }
}

/// `accept_ownership` by the zero caller with no proposal passes the pending check (0 == 0): only
/// `set_owner`'s zero check stops it, with `'Ownable: new owner is zero'`. Nothing changes.
#[test]
#[feature("safe_dispatcher")]
fn test_access_accept_ownership_by_zero_without_proposal_reverts() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    for ownable in ownables(@systems) {
        let safe = IOwnableSafeDispatcher { contract_address: ownable.contract_address };
        start_cheat_caller_address(ownable.contract_address, zero());
        let reason = *safe.accept_ownership().unwrap_err().at(0);
        stop_cheat_caller_address(ownable.contract_address);
        assert(reason == 'Ownable: new owner is zero', 'Access: zero accept');
        assert(ownable.owner() == OWNER(), 'Access: owner kept');
        assert(ownable.pending_owner() == zero(), 'Access: no pending');
    }
}

/// The pending owner holds no power until it accepts: its `transfer_ownership` reverts, and the
/// proposal stands.
#[test]
#[feature("safe_dispatcher")]
fn test_access_pending_owner_cannot_transfer() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    for ownable in ownables(@systems) {
        propose(ownable, OWNER(), ANYONE());
        let safe = IOwnableSafeDispatcher { contract_address: ownable.contract_address };
        start_cheat_caller_address(ownable.contract_address, ANYONE());
        let reason = *safe.transfer_ownership(NOONE()).unwrap_err().at(0);
        stop_cheat_caller_address(ownable.contract_address);
        assert(reason == 'Ownable: caller is not owner', 'Access: pending transfers');
        assert(ownable.owner() == OWNER(), 'Access: owner kept');
        assert(ownable.pending_owner() == ANYONE(), 'Access: proposal kept');
    }
}

/// Documented behaviour (the PM's ruling, 2026-10-14): `set_setup` is an owner power with no
/// guard. A game bought on Economy A, then `set_setup` to a `Setup` wired to Economy B: the
/// game's ending move reverts, since B never sold it. Without Challenge on S2's reporters the move
/// reverts earlier, at the report (`'Quest: not reporter'`); with it, at `B.record`
/// (`'Economy: unknown game'`). The game stays in flight, and A cannot settle it.
#[test]
#[feature("safe_dispatcher")]
fn test_set_setup_with_a_game_in_flight_blocks_its_ending() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let game_id = context.game_id;
    let challenge = systems.challenge.contract_address;
    // [Setup] S2, wired to a second economy B that recognises Challenge as its game
    let (economy_b, _) = setup::deploy_economy();
    start_cheat_caller_address(economy_b, OWNER());
    IEconomyDispatcher { contract_address: economy_b }.set_game(challenge);
    stop_cheat_caller_address(economy_b);
    let s2 = fresh_setup();
    start_cheat_caller_address(s2.contract_address, OWNER());
    s2.set_economy(economy_b);
    s2.set_collection(systems.collection.contract_address);
    stop_cheat_caller_address(s2.contract_address);
    // [Owner] re-points Challenge to S2 with the game in flight
    start_cheat_caller_address(challenge, OWNER());
    IChallengeSetupDispatcher { contract_address: challenge }.set_setup(s2.contract_address);
    start_cheat_caller_address(challenge, PLAYER());
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    // [S2 has not allowlisted Challenge] the report refuses
    let reason = *safe.surrender(game_id).unwrap_err().at(0);
    assert(reason == 'Quest: not reporter', 'Access: not reporter');
    // [Allowlisted] the report passes and B refuses the game it never sold
    start_cheat_caller_address(s2.contract_address, OWNER());
    s2.set_reporter(challenge, true);
    stop_cheat_caller_address(s2.contract_address);
    let reason = *safe.surrender(game_id).unwrap_err().at(0);
    assert(reason == 'Economy: unknown game', 'Access: unknown game');
    // [Effect] the game is still in flight, and A never recorded it
    assert(!store.game(game_id).over, 'Access: game ended');
    let terms = systems.economy.terms(game_id);
    assert(!terms.recorded, 'Access: recorded');
    start_cheat_block_timestamp_global(2 * DAY);
    let settle = IEconomySafeDispatcher { contract_address: systems.economy.contract_address }
        .settle(array![game_id].span());
    assert(*settle.unwrap_err().at(0) == 'Economy: not recorded', 'Access: settled');
}
