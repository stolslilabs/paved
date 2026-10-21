//! The `Matchmaker` system (#639, `docs/architecture/matchmaker.md`) over the devnet VRF mock and a
//! real `Setup`: the callers' checks, the VRF draw, "Next" for Cobbles, the attack's start and
//! settlement, the shields, the NPC villages, and the storage pinned by name.
//!
//! The VRF component refuses a second draw in one transaction by its hash, so every draw below runs
//! under its own cheated hash (`tx`).

use core::poseidon::poseidon_hash_span;
use paved::matchmaker::pool::{ATTACK_SHIELD, INITIAL_SHIELD, QUEUE_ATTACK, QUEUE_INITIAL};
use paved::matchmaker::village::{STATUS_POOL, STATUS_SHIELDED};
use paved::mocks::vrf::MockVrfProvider::MOCK_TAG;
use paved::systems::matchmaker::Matchmaker::{
    AttackStarted, CrownsSettled, Event as MatchmakerEvent, OpponentDrawn, ShieldDropped,
    ShieldRaised, ShieldReleased, VillageJoined,
};
use paved::systems::matchmaker::{
    IMatchmakerAdminDispatcher, IMatchmakerAdminDispatcherTrait, IMatchmakerAdminSafeDispatcher,
    IMatchmakerAdminSafeDispatcherTrait, IMatchmakerDispatcher, IMatchmakerDispatcherTrait,
    IMatchmakerSafeDispatcher, IMatchmakerSafeDispatcherTrait, MATCH_KIND, Match, NEXT_PRICE,
    NEXT_REASON,
};
use paved::systems::setup::Setup::{CobblesSpent, Event as SetupEvent};
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupDispatcher, ISetupDispatcherTrait,
    ISetupSpendDispatcher, ISetupSpendDispatcherTrait, ISetupSpendSafeDispatcher,
    ISetupSpendSafeDispatcherTrait, ISetupStoryDispatcher, ISetupStoryDispatcherTrait,
};
use paved::vrf::draw_salt;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, load,
    map_entry_address, spy_events, start_cheat_block_timestamp_global, start_cheat_caller_address,
    start_cheat_transaction_hash_global, stop_cheat_caller_address,
};
use starknet::ContractAddress;

const START: u64 = 1_800_000_000;

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn OPERATOR() -> ContractAddress {
    'OPERATOR'.try_into().unwrap()
}

fn REPORTER() -> ContractAddress {
    'REPORTER'.try_into().unwrap()
}

fn ALICE() -> ContractAddress {
    'ALICE'.try_into().unwrap()
}

fn BOB() -> ContractAddress {
    'BOB'.try_into().unwrap()
}

fn CAROL() -> ContractAddress {
    'CAROL'.try_into().unwrap()
}

fn NPC_1() -> ContractAddress {
    1.try_into().unwrap()
}

#[derive(Copy, Drop)]
struct World {
    matchmaker: IMatchmakerDispatcher,
    admin: IMatchmakerAdminDispatcher,
    setup: ISetupDispatcher,
    provider: ContractAddress,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `Setup`, the VRF mock and `Matchmaker`; `OPERATOR` an operator, `Matchmaker` a spender of
/// `Setup`, `REPORTER` a reporter (to credit cobbles). No village yet.
fn world() -> World {
    start_cheat_block_timestamp_global(START);
    let setup = deploy("Setup", array![OWNER().into()]);
    let provider = deploy("MockVrfProvider", array![]);
    let matchmaker = deploy("Matchmaker", array![OWNER().into(), setup.into(), provider.into()]);
    let world = World {
        matchmaker: IMatchmakerDispatcher { contract_address: matchmaker },
        admin: IMatchmakerAdminDispatcher { contract_address: matchmaker },
        setup: ISetupDispatcher { contract_address: setup },
        provider,
    };
    start_cheat_caller_address(matchmaker, OWNER());
    world.admin.set_operator(OPERATOR(), true);
    stop_cheat_caller_address(matchmaker);
    start_cheat_caller_address(setup, OWNER());
    world.setup.set_reporter(REPORTER(), true);
    ISetupSpendDispatcher { contract_address: setup }.set_spender(matchmaker, true);
    stop_cheat_caller_address(setup);
    world
}

fn safe(world: World) -> IMatchmakerSafeDispatcher {
    IMatchmakerSafeDispatcher { contract_address: world.matchmaker.contract_address }
}

fn as_operator(world: World) {
    start_cheat_caller_address(world.matchmaker.contract_address, OPERATOR());
}

fn as_player(world: World, player: ContractAddress) {
    start_cheat_caller_address(world.matchmaker.contract_address, player);
}

fn join(world: World, player: ContractAddress) {
    as_operator(world);
    world.matchmaker.join(player);
    stop_cheat_caller_address(world.matchmaker.contract_address);
}

fn set_npc(world: World, npc_id: u8, crowns: u32) {
    start_cheat_caller_address(world.matchmaker.contract_address, OWNER());
    world.admin.set_npc(npc_id, crowns);
    stop_cheat_caller_address(world.matchmaker.contract_address);
}

/// Credits `player` 30 cobbles (the three stars of a Story level, through the reporter).
fn credit(world: World, player: ContractAddress) {
    let setup = world.setup.contract_address;
    start_cheat_caller_address(setup, REPORTER());
    ISetupStoryDispatcher { contract_address: setup }.credit_story(player.into(), 1, 1, 0, 3);
    stop_cheat_caller_address(setup);
}

fn cobbles(world: World, player: ContractAddress) -> u64 {
    ISetupCobblesDispatcher { contract_address: world.setup.contract_address }
        .account(player.into())
        .cobbles
}

/// Runs what follows in the transaction `hash`.
fn tx(hash: felt252) {
    start_cheat_transaction_hash_global(hash);
}

fn search(world: World, player: ContractAddress, hash: felt252) -> ContractAddress {
    tx(hash);
    as_player(world, player);
    let opponent = world.matchmaker.search();
    stop_cheat_caller_address(world.matchmaker.contract_address);
    opponent
}

fn start(world: World, attacker: ContractAddress) -> (ContractAddress, u8) {
    as_operator(world);
    let result = world.matchmaker.start_attack(attacker);
    stop_cheat_caller_address(world.matchmaker.contract_address);
    result
}

/// Alice and Bob joined, their initial shields over and released: both in bucket 0.
fn two_players() -> World {
    let world = world();
    join(world, ALICE());
    join(world, BOB());
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD);
    assert_eq!(world.matchmaker.release_shields(2), 2);
    world
}

// Joining

#[test]
fn test_join_shields_the_new_village() {
    let world = world();
    let mut spy = spy_events();
    join(world, ALICE());
    let village = world.matchmaker.village(ALICE());
    assert_eq!(village.status, STATUS_SHIELDED);
    assert_eq!(village.queue, QUEUE_INITIAL);
    assert_eq!(village.shield_until, START + INITIAL_SHIELD);
    assert_eq!(village.crowns, 0);
    let address = world.matchmaker.contract_address;
    spy
        .assert_emitted(
            @array![
                (address, MatchmakerEvent::VillageJoined(VillageJoined { village: ALICE() })),
                (
                    address,
                    MatchmakerEvent::ShieldRaised(
                        ShieldRaised {
                            village: ALICE(), queue: QUEUE_INITIAL, until: START + INITIAL_SHIELD,
                        },
                    ),
                ),
            ],
        );
}

#[test]
#[feature("safe_dispatcher")]
fn test_join_by_a_non_operator_fails() {
    let world = world();
    as_player(world, ALICE());
    match safe(world).join(ALICE()) {
        Result::Ok(_) => panic!("join by a player"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: not operator'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_join_zero_fails() {
    let world = world();
    as_operator(world);
    match safe(world).join(0.try_into().unwrap()) {
        Result::Ok(_) => panic!("joined zero"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: village is zero'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_join_twice_fails() {
    let world = world();
    join(world, ALICE());
    as_operator(world);
    match safe(world).join(ALICE()) {
        Result::Ok(_) => panic!("joined twice"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: already joined'),
    }
}

// The draw

#[test]
fn test_search_draws_from_the_vrf() {
    let world = world();
    set_npc(world, 1, 0);
    join(world, ALICE());
    let mut spy = spy_events();
    let opponent = search(world, ALICE(), 'TX1');
    assert(opponent == NPC_1(), 'not the npc');
    assert_eq!(world.matchmaker.village(ALICE()).draws, 1);
    let current = world.matchmaker.current_match(ALICE());
    assert_eq!(current, Match { opponent: NPC_1(), offer: 25, started: false });
    spy
        .assert_emitted(
            @array![
                (
                    world.matchmaker.contract_address,
                    MatchmakerEvent::OpponentDrawn(
                        OpponentDrawn {
                            attacker: ALICE(),
                            opponent: NPC_1(),
                            offer: 25,
                            draw_index: 0,
                            paid: false,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn test_search_salt_is_the_attackers_draw() {
    // The client's `request_random` salt: kind, attacker, draw index
    let salt = draw_salt(MATCH_KIND, ALICE().into(), 0);
    let expected = poseidon_hash_span(array!['PAVED_DRAW', MATCH_KIND, ALICE().into(), 0].span());
    assert_eq!(salt, expected);
}

#[test]
fn test_search_picks_by_the_random_among_a_bucket() {
    // Three NPCs in bucket 0: the slot is the mock's random (without its lowest bit) modulo 3
    let world = world();
    set_npc(world, 1, 0);
    set_npc(world, 2, 10);
    set_npc(world, 3, 20);
    join(world, ALICE());
    let opponent = search(world, ALICE(), 'TX1');
    let chain_id = starknet::get_tx_info().unbox().chain_id;
    let salt = draw_salt(MATCH_KIND, ALICE().into(), 0);
    let seed = poseidon_hash_span(
        array![salt, world.matchmaker.contract_address.into(), chain_id].span(),
    );
    let random = poseidon_hash_span(
        array![poseidon_hash_span(array![seed, MOCK_TAG].span()), 0].span(),
    );
    let random: u256 = random.into();
    let index: u32 = ((random / 2) % 3).try_into().unwrap();
    let expected: felt252 = (index + 1).into();
    assert(opponent == expected.try_into().unwrap(), 'not the drawn slot');
}

#[test]
#[feature("safe_dispatcher")]
fn test_search_with_no_one_else_fails() {
    let world = world();
    join(world, ALICE());
    tx('TX1');
    as_player(world, ALICE());
    match safe(world).search() {
        Result::Ok(_) => panic!("found someone"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: no opponent'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_search_by_a_stranger_fails() {
    let world = world();
    set_npc(world, 1, 0);
    tx('TX1');
    as_player(world, ALICE());
    match safe(world).search() {
        Result::Ok(_) => panic!("stranger searched"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: not joined'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_search_by_an_npc_fails() {
    let world = world();
    set_npc(world, 1, 0);
    join(world, ALICE());
    tx('TX1');
    as_player(world, NPC_1());
    match safe(world).search() {
        Result::Ok(_) => panic!("npc searched"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: npc cannot play'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_search_again_while_the_opponent_waits_fails() {
    let world = world();
    set_npc(world, 1, 0);
    join(world, ALICE());
    search(world, ALICE(), 'TX1');
    tx('TX2');
    as_player(world, ALICE());
    match safe(world).search() {
        Result::Ok(_) => panic!("free re-draw"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: opponent drawn'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_two_draws_in_one_transaction_fail() {
    let world = two_players();
    set_npc(world, 1, 0);
    search(world, ALICE(), 'TX1');
    credit(world, ALICE());
    as_player(world, ALICE());
    match safe(world).next() {
        Result::Ok(_) => panic!("second draw in a tx"),
        Result::Err(error) => assert_eq!(*error.at(0), 'VRF: one draw per tx'),
    }
}

// Next

#[test]
fn test_next_spends_cobbles_and_draws_again() {
    let world = two_players();
    set_npc(world, 1, 0);
    credit(world, ALICE());
    search(world, ALICE(), 'TX1');
    let mut spy = spy_events();
    tx('TX2');
    as_player(world, ALICE());
    world.matchmaker.next();
    assert_eq!(cobbles(world, ALICE()), 30 - NEXT_PRICE.into());
    assert_eq!(world.matchmaker.village(ALICE()).draws, 2);
    spy
        .assert_emitted(
            @array![
                (
                    world.setup.contract_address,
                    SetupEvent::CobblesSpent(
                        CobblesSpent {
                            player_id: ALICE().into(),
                            spender: world.matchmaker.contract_address,
                            reason: NEXT_REASON,
                            cobbles: NEXT_PRICE,
                            balance: 30 - NEXT_PRICE.into(),
                        },
                    ),
                ),
            ],
        );
}

#[test]
#[feature("safe_dispatcher")]
fn test_next_without_cobbles_fails() {
    let world = two_players();
    search(world, ALICE(), 'TX1');
    tx('TX2');
    as_player(world, ALICE());
    match safe(world).next() {
        Result::Ok(_) => panic!("free next"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Setup: not enough cobbles'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_next_with_nothing_drawn_fails() {
    let world = two_players();
    credit(world, ALICE());
    tx('TX1');
    as_player(world, ALICE());
    match safe(world).next() {
        Result::Ok(_) => panic!("next with nothing drawn"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: nothing drawn'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_next_when_matchmaker_is_not_a_spender_fails() {
    let world = two_players();
    credit(world, ALICE());
    start_cheat_caller_address(world.setup.contract_address, OWNER());
    ISetupSpendDispatcher { contract_address: world.setup.contract_address }
        .set_spender(world.matchmaker.contract_address, false);
    stop_cheat_caller_address(world.setup.contract_address);
    search(world, ALICE(), 'TX1');
    tx('TX2');
    as_player(world, ALICE());
    match safe(world).next() {
        Result::Ok(_) => panic!("spent without allowance"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Setup: not spender'),
    }
    assert_eq!(cobbles(world, ALICE()), 30);
}

// Setup's spend

#[test]
#[feature("safe_dispatcher")]
fn test_spend_cobbles_by_a_stranger_fails() {
    let world = world();
    credit(world, ALICE());
    let setup = ISetupSpendSafeDispatcher { contract_address: world.setup.contract_address };
    start_cheat_caller_address(world.setup.contract_address, ALICE());
    match setup.spend_cobbles(ALICE().into(), 1, 'X') {
        Result::Ok(_) => panic!("stranger spent"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Setup: not spender'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_spend_zero_cobbles_fails() {
    let world = world();
    let setup = ISetupSpendSafeDispatcher { contract_address: world.setup.contract_address };
    start_cheat_caller_address(world.setup.contract_address, world.matchmaker.contract_address);
    match setup.spend_cobbles(ALICE().into(), 0, 'X') {
        Result::Ok(_) => panic!("spent zero"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Setup: invalid cobbles'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_spender_by_a_stranger_fails() {
    let world = world();
    let setup = ISetupSpendSafeDispatcher { contract_address: world.setup.contract_address };
    start_cheat_caller_address(world.setup.contract_address, ALICE());
    match setup.set_spender(ALICE(), true) {
        Result::Ok(_) => panic!("stranger allowed"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Ownable: caller is not owner'),
    }
}

// The attack

#[test]
fn test_attack_on_a_player_shields_it_and_settles_crowns() {
    let world = two_players();
    let opponent = search(world, ALICE(), 'TX1');
    assert(opponent == BOB(), 'not bob');
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD + 10);
    let mut spy = spy_events();
    let (defender, offer) = start(world, ALICE());
    assert(defender == BOB(), 'not bob');
    assert_eq!(offer, 25);
    let until = START + INITIAL_SHIELD + 10 + ATTACK_SHIELD;
    let bob = world.matchmaker.village(BOB());
    assert_eq!(bob.status, STATUS_SHIELDED);
    assert_eq!(bob.queue, QUEUE_ATTACK);
    assert_eq!(bob.shield_until, until);
    let address = world.matchmaker.contract_address;
    spy
        .assert_emitted(
            @array![
                (
                    address,
                    MatchmakerEvent::ShieldRaised(
                        ShieldRaised { village: BOB(), queue: QUEUE_ATTACK, until },
                    ),
                ),
                (
                    address,
                    MatchmakerEvent::AttackStarted(
                        AttackStarted { attacker: ALICE(), defender: BOB(), offer: 25 },
                    ),
                ),
            ],
        );
    // Bob had no crowns: a 3-star win takes what he has, 0
    as_operator(world);
    let outcome = world.matchmaker.settle(ALICE(), 3);
    assert_eq!(outcome.gained, 0);
    assert_eq!(world.matchmaker.current_match(ALICE()).opponent.into(), 0);
    spy
        .assert_emitted(
            @array![
                (
                    address,
                    MatchmakerEvent::CrownsSettled(
                        CrownsSettled {
                            attacker: ALICE(),
                            defender: BOB(),
                            stars: 3,
                            offer: 25,
                            gained: 0,
                            lost: 0,
                            attacker_crowns: 0,
                            defender_crowns: 0,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn test_attack_settles_crowns_between_players() {
    let world = two_players();
    as_operator(world);
    world.matchmaker.set_crowns(ALICE(), 1_000);
    world.matchmaker.set_crowns(BOB(), 1_100);
    stop_cheat_caller_address(world.matchmaker.contract_address);
    search(world, ALICE(), 'TX1');
    let (_, offer) = start(world, ALICE());
    assert_eq!(offer, 30);
    as_operator(world);
    let outcome = world.matchmaker.settle(ALICE(), 2);
    assert_eq!(outcome.gained, 20);
    assert_eq!(world.matchmaker.village(ALICE()).crowns, 1_020);
    assert_eq!(world.matchmaker.village(BOB()).crowns, 1_080);
    // Bob comes back in bucket 10 once his shield ends
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD + ATTACK_SHIELD);
    assert_eq!(world.matchmaker.release_shields(1), 1);
    let bob = world.matchmaker.village(BOB());
    assert_eq!(bob.status, STATUS_POOL);
    assert_eq!(bob.bucket, 10);
}

#[test]
fn test_attack_by_a_shielded_player_drops_its_shield() {
    let world = world();
    set_npc(world, 1, 0);
    join(world, ALICE());
    search(world, ALICE(), 'TX1');
    let mut spy = spy_events();
    start(world, ALICE());
    assert_eq!(world.matchmaker.village(ALICE()).status, STATUS_POOL);
    // The NPC stays in the pool, with no shield
    assert_eq!(world.matchmaker.village(NPC_1()).status, STATUS_POOL);
    spy
        .assert_emitted(
            @array![
                (
                    world.matchmaker.contract_address,
                    MatchmakerEvent::ShieldDropped(ShieldDropped { village: ALICE() }),
                ),
            ],
        );
}

#[test]
fn test_attack_start_releases_expired_shields() {
    let world = world();
    set_npc(world, 1, 0);
    join(world, ALICE());
    join(world, BOB());
    join(world, CAROL());
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD);
    search(world, ALICE(), 'TX1');
    let mut spy = spy_events();
    start(world, ALICE());
    // Alice's own entry is released first (it ends first), then Bob's; Carol waits
    let address = world.matchmaker.contract_address;
    spy
        .assert_emitted(
            @array![
                (address, MatchmakerEvent::ShieldReleased(ShieldReleased { village: ALICE() })),
                (address, MatchmakerEvent::ShieldReleased(ShieldReleased { village: BOB() })),
            ],
        );
    assert_eq!(world.matchmaker.village(CAROL()).status, STATUS_SHIELDED);
}

#[test]
#[feature("safe_dispatcher")]
fn test_second_attacker_on_a_shielded_village_fails_then_searches_free() {
    let world = two_players();
    join(world, CAROL());
    start_cheat_block_timestamp_global(START + 2 * INITIAL_SHIELD);
    world.matchmaker.release_shields(1);
    // Alice (bucket 40) and Carol (bucket 60) are each alone; Bob (bucket 50) is nearest to both
    as_operator(world);
    world.matchmaker.set_crowns(ALICE(), 4_000);
    world.matchmaker.set_crowns(BOB(), 5_000);
    world.matchmaker.set_crowns(CAROL(), 6_000);
    stop_cheat_caller_address(world.matchmaker.contract_address);
    assert(search(world, ALICE(), 'TX1') == BOB(), 'alice not on bob');
    assert(search(world, CAROL(), 'TX2') == BOB(), 'carol not on bob');
    start(world, ALICE());
    as_operator(world);
    match safe(world).start_attack(CAROL()) {
        Result::Ok(_) => panic!("attacked a shielded village"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: opponent shielded'),
    }
    // Bob left the pool: Carol's search is free again, and draws Alice
    assert(search(world, CAROL(), 'TX3') == ALICE(), 'carol not on alice');
}

#[test]
#[feature("safe_dispatcher")]
fn test_start_without_a_draw_fails() {
    let world = two_players();
    as_operator(world);
    match safe(world).start_attack(ALICE()) {
        Result::Ok(_) => panic!("started without a draw"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: nothing drawn'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_start_twice_fails() {
    let world = two_players();
    search(world, ALICE(), 'TX1');
    start(world, ALICE());
    as_operator(world);
    match safe(world).start_attack(ALICE()) {
        Result::Ok(_) => panic!("started twice"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: attack started'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_start_by_a_non_operator_fails() {
    let world = two_players();
    search(world, ALICE(), 'TX1');
    as_player(world, ALICE());
    match safe(world).start_attack(ALICE()) {
        Result::Ok(_) => panic!("player started"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: not operator'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_search_during_an_attack_fails() {
    let world = two_players();
    search(world, ALICE(), 'TX1');
    start(world, ALICE());
    tx('TX2');
    as_player(world, ALICE());
    match safe(world).search() {
        Result::Ok(_) => panic!("searched mid-attack"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: attack started'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_settle_without_an_attack_fails() {
    let world = two_players();
    search(world, ALICE(), 'TX1');
    as_operator(world);
    match safe(world).settle(ALICE(), 3) {
        Result::Ok(_) => panic!("settled without an attack"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: no attack'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_settle_four_stars_fails() {
    let world = two_players();
    search(world, ALICE(), 'TX1');
    start(world, ALICE());
    as_operator(world);
    match safe(world).settle(ALICE(), 4) {
        Result::Ok(_) => panic!("four stars"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: invalid stars'),
    }
}

#[test]
fn test_win_against_an_npc_mints_crowns() {
    let world = world();
    set_npc(world, 1, 200);
    join(world, ALICE());
    search(world, ALICE(), 'TX1');
    let (_, offer) = start(world, ALICE());
    assert_eq!(offer, 35);
    as_operator(world);
    let outcome = world.matchmaker.settle(ALICE(), 3);
    assert_eq!(outcome.attacker, 35);
    assert_eq!(world.matchmaker.village(NPC_1()).crowns, 200);
}

// Shields, NPCs, owner

#[test]
#[feature("safe_dispatcher")]
fn test_release_shields_is_bounded() {
    let world = world();
    match safe(world).release_shields(17) {
        Result::Ok(_) => panic!("released 17"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: too many releases'),
    }
}

#[test]
fn test_remove_npc_takes_it_out() {
    let world = world();
    set_npc(world, 1, 150);
    assert_eq!(world.matchmaker.bucket_size(1), 1);
    start_cheat_caller_address(world.matchmaker.contract_address, OWNER());
    world.admin.remove_npc(1);
    assert_eq!(world.matchmaker.bucket_size(1), 0);
    assert_eq!(world.matchmaker.registry(), 0);
}

#[test]
#[feature("safe_dispatcher")]
fn test_set_npc_zero_fails() {
    let world = world();
    start_cheat_caller_address(world.matchmaker.contract_address, OWNER());
    let admin = IMatchmakerAdminSafeDispatcher {
        contract_address: world.matchmaker.contract_address,
    };
    match admin.set_npc(0, 10) {
        Result::Ok(_) => panic!("npc 0"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: invalid npc'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_owner_calls_by_a_stranger_fail() {
    let world = world();
    start_cheat_caller_address(world.matchmaker.contract_address, ALICE());
    let admin = IMatchmakerAdminSafeDispatcher {
        contract_address: world.matchmaker.contract_address,
    };
    match admin.set_npc(1, 10) {
        Result::Ok(_) => panic!("stranger set an npc"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Ownable: caller is not owner'),
    }
    match admin.set_operator(ALICE(), true) {
        Result::Ok(_) => panic!("stranger set an operator"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Ownable: caller is not owner'),
    }
    match admin.set_setup(ALICE()) {
        Result::Ok(_) => panic!("stranger set setup"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Ownable: caller is not owner'),
    }
    match admin.set_vrf_provider(ALICE()) {
        Result::Ok(_) => panic!("stranger set the provider"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Ownable: caller is not owner'),
    }
}

// Storage pinned by name (`docs/architecture/upgrades.md`)

fn raw(contract: ContractAddress, name: felt252) -> felt252 {
    *load(contract, name, 1).at(0)
}

fn raw_entry(contract: ContractAddress, map: felt252, key: Array<felt252>) -> felt252 {
    *load(contract, map_entry_address(map, key.span()), 1).at(0)
}

#[test]
fn test_storage_is_pinned_by_name() {
    let world = two_players();
    search(world, ALICE(), 'TX1');
    let address = world.matchmaker.contract_address;
    assert(raw(address, selector!("owner")) == OWNER().into(), 'Pin: owner');
    assert(raw(address, selector!("setup")) == world.setup.contract_address.into(), 'Pin: setup');
    assert(raw(address, selector!("vrf_provider")) == world.provider.into(), 'Pin: vrf_provider');
    assert(raw(address, selector!("registry")) == 1, 'Pin: registry');
    assert(raw_entry(address, selector!("bucket_sizes"), array![0]) == 2, 'Pin: bucket_sizes');
    let slot = raw_entry(address, selector!("slots"), array![0, 0]);
    assert(slot == ALICE().into() || slot == BOB().into(), 'Pin: slots');
    assert(raw_entry(address, selector!("villages"), array![ALICE().into()]) != 0, 'Pin: villages');
    assert(raw_entry(address, selector!("queues"), array![1]) != 0, 'Pin: queues');
    assert(
        raw_entry(address, selector!("queue_entries"), array![1, 0]) == ALICE().into(),
        'Pin: queue_entries',
    );
    assert(
        raw_entry(address, selector!("match_opponents"), array![ALICE().into()]) == BOB().into(),
        'Pin: match_opponents',
    );
    assert(
        raw_entry(address, selector!("match_states"), array![ALICE().into()]) == 25,
        'Pin: match_states',
    );
    assert(
        raw_entry(address, selector!("operators"), array![OPERATOR().into()]) == 1,
        'Pin: operators',
    );
    let setup = world.setup.contract_address;
    assert(raw_entry(setup, selector!("spenders"), array![address.into()]) == 1, 'Pin: spenders');
}
