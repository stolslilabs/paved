//! The `Matchmaker` system (#639, `docs/architecture/matchmaker.md`) over the devnet VRF mock and a
//! real `Setup`: the callers' checks, the VRF draw, "Next" for Cobbles, the attack's start and
//! settlement, the shields, the NPC villages, the storage pinned by name, and random sequences of
//! calls that check the invariants of the composed pieces (crowns, buckets, shields) after every
//! call (section 4).
//!
//! The VRF component refuses a second draw in one transaction by its hash, so every draw below runs
//! under its own cheated hash (`tx`).

use core::hash::HashStateTrait;
use core::poseidon::{PoseidonTrait, poseidon_hash_span};
use paved::components::bucketable::BucketableComponent::{
    BucketEntered, BucketLeft, Event as BucketEvent,
};
use paved::components::bucketable::{
    IBucketableDispatcher, IBucketableDispatcherTrait, Place, TOP_BUCKET, bucket_of,
};
use paved::components::crownable::CrownableComponent::{CrownsSettled, Event as CrownEvent};
use paved::components::crownable::{ICrownableDispatcher, ICrownableDispatcherTrait};
use paved::components::shieldable::ShieldableComponent::{
    Event as ShieldEvent, ShieldDropped, ShieldRaised, ShieldReleased,
};
use paved::components::shieldable::{
    ATTACK_SHIELD, INITIAL_SHIELD, IShieldableDispatcher, IShieldableDispatcherTrait, QUEUE_ATTACK,
    QUEUE_INITIAL,
};
use paved::mocks::vrf::MockVrfProvider::MOCK_TAG;
use paved::systems::matchmaker::Matchmaker::{
    AttackStarted, Event as MatchmakerEvent, OpponentDrawn, VillageJoined,
};
use paved::systems::matchmaker::{
    IMatchmakerAdminDispatcher, IMatchmakerAdminDispatcherTrait, IMatchmakerAdminSafeDispatcher,
    IMatchmakerAdminSafeDispatcherTrait, IMatchmakerDispatcher, IMatchmakerDispatcherTrait,
    IMatchmakerSafeDispatcher, IMatchmakerSafeDispatcherTrait, MATCH_KIND, Match, NEXT_PRICE,
    NEXT_REASON, STATUS_NONE, STATUS_NPC, STATUS_PLAYER,
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
    crowns: ICrownableDispatcher,
    buckets: IBucketableDispatcher,
    shields: IShieldableDispatcher,
    setup: ISetupDispatcher,
    provider: ContractAddress,
}

fn shield_event(event: ShieldEvent) -> MatchmakerEvent {
    MatchmakerEvent::ShieldableEvent(event)
}

fn bucket_event(event: BucketEvent) -> MatchmakerEvent {
    MatchmakerEvent::BucketableEvent(event)
}

fn crown_event(event: CrownEvent) -> MatchmakerEvent {
    MatchmakerEvent::CrownableEvent(event)
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
        crowns: ICrownableDispatcher { contract_address: matchmaker },
        buckets: IBucketableDispatcher { contract_address: matchmaker },
        shields: IShieldableDispatcher { contract_address: matchmaker },
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
    assert_eq!(world.matchmaker.village(ALICE()).status, STATUS_PLAYER);
    let shield = world.shields.shield(ALICE());
    assert!(shield.up);
    assert_eq!(shield.queue, QUEUE_INITIAL);
    assert_eq!(shield.until, START + INITIAL_SHIELD);
    assert!(!world.buckets.place(ALICE()).listed);
    assert_eq!(world.crowns.crowns(ALICE()), 0);
    let address = world.matchmaker.contract_address;
    spy
        .assert_emitted(
            @array![
                (address, MatchmakerEvent::VillageJoined(VillageJoined { village: ALICE() })),
                (
                    address,
                    shield_event(
                        ShieldEvent::ShieldRaised(
                            ShieldRaised {
                                village: ALICE(),
                                queue: QUEUE_INITIAL,
                                until: START + INITIAL_SHIELD,
                            },
                        ),
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
    assert_eq!(current, Match { opponent: NPC_1(), offer: 30, cost: 19, started: false });
    spy
        .assert_emitted(
            @array![
                (
                    world.matchmaker.contract_address,
                    MatchmakerEvent::OpponentDrawn(
                        OpponentDrawn {
                            attacker: ALICE(),
                            opponent: NPC_1(),
                            offer: 30,
                            cost: 19,
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
    assert_eq!(offer, 30);
    let until = START + INITIAL_SHIELD + 10 + ATTACK_SHIELD;
    let shield = world.shields.shield(BOB());
    assert!(shield.up);
    assert_eq!(shield.queue, QUEUE_ATTACK);
    assert_eq!(shield.until, until);
    assert!(!world.buckets.place(BOB()).listed);
    let address = world.matchmaker.contract_address;
    spy
        .assert_emitted(
            @array![
                (
                    address,
                    bucket_event(BucketEvent::BucketLeft(BucketLeft { village: BOB(), bucket: 0 })),
                ),
                (
                    address,
                    shield_event(
                        ShieldEvent::ShieldRaised(
                            ShieldRaised { village: BOB(), queue: QUEUE_ATTACK, until },
                        ),
                    ),
                ),
                (
                    address,
                    MatchmakerEvent::AttackStarted(
                        AttackStarted { attacker: ALICE(), defender: BOB(), offer: 30, cost: 19 },
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
                    crown_event(
                        CrownEvent::CrownsSettled(
                            CrownsSettled {
                                attacker: ALICE(),
                                defender: BOB(),
                                stars: 3,
                                offer: 30,
                                cost: 19,
                                gained: 0,
                                lost: 0,
                                attacker_crowns: 0,
                                defender_crowns: 0,
                            },
                        ),
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
    assert_eq!(world.matchmaker.terms(ALICE(), BOB()), (38, 14));
    search(world, ALICE(), 'TX1');
    let (_, offer) = start(world, ALICE());
    assert_eq!(offer, 38);
    as_operator(world);
    // Two stars: two thirds of 38, rounded up
    let outcome = world.matchmaker.settle(ALICE(), 2);
    assert_eq!(outcome.gained, 26);
    assert_eq!(world.crowns.crowns(ALICE()), 1_026);
    assert_eq!(world.crowns.crowns(BOB()), 1_074);
    // Bob comes back in bucket 10 once his shield ends
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD + ATTACK_SHIELD);
    assert_eq!(world.matchmaker.release_shields(1), 1);
    assert_eq!(world.buckets.place(BOB()).bucket, 10);
    assert!(world.buckets.place(BOB()).listed);
}

#[test]
fn test_failed_attack_gives_the_cost_to_the_defender() {
    let world = two_players();
    as_operator(world);
    world.matchmaker.set_crowns(ALICE(), 1_000);
    world.matchmaker.set_crowns(BOB(), 1_000);
    stop_cheat_caller_address(world.matchmaker.contract_address);
    search(world, ALICE(), 'TX1');
    start(world, ALICE());
    // The cost fixed at the draw: 19 at an even gap, even if the crowns move before the end
    as_operator(world);
    world.matchmaker.set_crowns(BOB(), 1_500);
    let outcome = world.matchmaker.settle(ALICE(), 0);
    assert_eq!(outcome.lost, 19);
    assert_eq!(world.crowns.crowns(ALICE()), 981);
    assert_eq!(world.crowns.crowns(BOB()), 1_519);
}

#[test]
fn test_settle_moves_the_attackers_bucket() {
    let world = two_players();
    as_operator(world);
    world.matchmaker.set_crowns(ALICE(), 90);
    world.matchmaker.set_crowns(BOB(), 110);
    stop_cheat_caller_address(world.matchmaker.contract_address);
    search(world, ALICE(), 'TX1');
    start(world, ALICE());
    let mut spy = spy_events();
    as_operator(world);
    // Gap +20: offer 31, three stars win 31 of Bob's 110
    let outcome = world.matchmaker.settle(ALICE(), 3);
    assert_eq!(outcome.attacker, 121);
    assert_eq!(outcome.defender, 79);
    assert_eq!(world.buckets.place(ALICE()), Place { bucket: 1, index: 0, listed: true });
    // The defender is shielded: only its crowns change, its bucket comes at release
    assert!(!world.buckets.place(BOB()).listed);
    let address = world.matchmaker.contract_address;
    spy
        .assert_emitted(
            @array![
                (
                    address,
                    bucket_event(
                        BucketEvent::BucketLeft(BucketLeft { village: ALICE(), bucket: 0 }),
                    ),
                ),
                (
                    address,
                    bucket_event(
                        BucketEvent::BucketEntered(BucketEntered { village: ALICE(), bucket: 1 }),
                    ),
                ),
            ],
        );
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD + ATTACK_SHIELD);
    world.matchmaker.release_shields(2);
    assert_eq!(world.buckets.place(BOB()).bucket, 0);
}

#[test]
fn test_attack_by_a_shielded_player_drops_its_shield() {
    let world = world();
    set_npc(world, 1, 0);
    join(world, ALICE());
    search(world, ALICE(), 'TX1');
    let mut spy = spy_events();
    start(world, ALICE());
    assert!(world.buckets.place(ALICE()).listed);
    assert!(!world.shields.shield(ALICE()).up);
    // The NPC stays in the pool, with no shield
    assert!(world.buckets.place(NPC_1()).listed);
    assert!(!world.shields.shield(NPC_1()).up);
    let address = world.matchmaker.contract_address;
    spy
        .assert_emitted(
            @array![
                (
                    address,
                    shield_event(ShieldEvent::ShieldDropped(ShieldDropped { village: ALICE() })),
                ),
                (
                    address,
                    bucket_event(
                        BucketEvent::BucketEntered(BucketEntered { village: ALICE(), bucket: 0 }),
                    ),
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
                (
                    address,
                    shield_event(ShieldEvent::ShieldReleased(ShieldReleased { village: ALICE() })),
                ),
                (
                    address,
                    shield_event(ShieldEvent::ShieldReleased(ShieldReleased { village: BOB() })),
                ),
            ],
        );
    assert!(world.shields.shield(CAROL()).up);
    assert!(world.buckets.place(BOB()).listed);
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
    assert_eq!(offer, 45);
    as_operator(world);
    let outcome = world.matchmaker.settle(ALICE(), 3);
    assert_eq!(outcome.attacker, 45);
    assert_eq!(world.crowns.crowns(NPC_1()), 200);
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
fn test_set_npc_moves_it_and_remove_npc_takes_it_out() {
    let world = world();
    set_npc(world, 1, 150);
    assert_eq!(world.buckets.bucket_size(1), 1);
    assert_eq!(world.matchmaker.village(NPC_1()).status, STATUS_NPC);
    set_npc(world, 1, 290);
    assert_eq!(world.buckets.place(NPC_1()), Place { bucket: 2, index: 0, listed: true });
    assert_eq!(world.crowns.crowns(NPC_1()), 290);
    start_cheat_caller_address(world.matchmaker.contract_address, OWNER());
    world.admin.remove_npc(1);
    assert_eq!(world.buckets.bucket_size(2), 0);
    assert_eq!(world.buckets.registry(), 0);
    assert_eq!(world.matchmaker.village(NPC_1()).status, STATUS_NONE);
    // Set again, it comes back
    world.admin.set_npc(1, 10);
    assert_eq!(world.buckets.place(NPC_1()), Place { bucket: 0, index: 0, listed: true });
}

#[test]
#[feature("safe_dispatcher")]
fn test_remove_npc_twice_fails() {
    let world = world();
    set_npc(world, 1, 150);
    start_cheat_caller_address(world.matchmaker.contract_address, OWNER());
    world.admin.remove_npc(1);
    let admin = IMatchmakerAdminSafeDispatcher {
        contract_address: world.matchmaker.contract_address,
    };
    match admin.remove_npc(1) {
        Result::Ok(_) => panic!("removed twice"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: not an npc'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_join_an_npc_address_fails() {
    let world = world();
    as_operator(world);
    match safe(world).join(NPC_1()) {
        Result::Ok(_) => panic!("joined an npc address"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: npc cannot play'),
    }
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
fn test_set_crowns_of_a_stranger_fails() {
    let world = world();
    as_operator(world);
    match safe(world).set_crowns(ALICE(), 10) {
        Result::Ok(_) => panic!("stranger crowned"),
        Result::Err(error) => assert_eq!(*error.at(0), 'Matchmaker: not joined'),
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
    match admin.remove_npc(1) {
        Result::Ok(_) => panic!("stranger removed an npc"),
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

// Storage pinned by name (`docs/architecture/upgrades.md`): each piece's own scope

fn raw(contract: ContractAddress, name: felt252) -> felt252 {
    *load(contract, name, 1).at(0)
}

fn raw_entry(contract: ContractAddress, map: felt252, key: Array<felt252>) -> felt252 {
    *load(contract, map_entry_address(map, key.span()), 1).at(0)
}

#[test]
fn test_storage_is_pinned_by_name() {
    let world = two_players();
    join(world, CAROL());
    as_operator(world);
    world.matchmaker.set_crowns(ALICE(), 50);
    stop_cheat_caller_address(world.matchmaker.contract_address);
    search(world, ALICE(), 'TX1');
    let address = world.matchmaker.contract_address;
    let alice: felt252 = ALICE().into();
    // The system's own
    assert(raw(address, selector!("owner")) == OWNER().into(), 'Pin: owner');
    assert(raw(address, selector!("setup")) == world.setup.contract_address.into(), 'Pin: setup');
    assert(raw(address, selector!("vrf_provider")) == world.provider.into(), 'Pin: vrf_provider');
    // Status player, one draw
    assert(raw_entry(address, selector!("villages"), array![alice]) == 0x101, 'Pin: villages');
    assert(
        raw_entry(address, selector!("match_opponents"), array![alice]) == BOB().into(),
        'Pin: match_opponents',
    );
    // Gap -50: offer 25, cost 22
    assert(
        raw_entry(address, selector!("match_states"), array![alice]) == 25 + 22 * 0x100,
        'Pin: match_states',
    );
    assert(
        raw_entry(address, selector!("operators"), array![OPERATOR().into()]) == 1,
        'Pin: operators',
    );
    // Crownable
    assert(raw_entry(address, selector!("crown_counts"), array![alice]) == 50, 'Pin: crown_counts');
    // Bucketable
    assert(raw(address, selector!("bucket_registry")) == 1, 'Pin: bucket_registry');
    assert(raw_entry(address, selector!("bucket_sizes"), array![0]) == 2, 'Pin: bucket_sizes');
    let slot = raw_entry(address, selector!("bucket_slots"), array![0, 0]);
    assert(slot == alice || slot == BOB().into(), 'Pin: bucket_slots');
    assert(raw_entry(address, selector!("bucket_places"), array![alice]) != 0, 'Pin: places');
    // Shieldable: Carol's initial shield is entry 2 of queue 1
    assert(raw_entry(address, selector!("shield_queues"), array![1]) != 0, 'Pin: shield_queues');
    assert(
        raw_entry(address, selector!("shield_entries"), array![1, 2]) == CAROL().into(),
        'Pin: shield_entries',
    );
    assert(raw_entry(address, selector!("shields"), array![CAROL().into()]) != 0, 'Pin: shields');
    let setup = world.setup.contract_address;
    assert(raw_entry(setup, selector!("spenders"), array![address.into()]) == 1, 'Pin: spenders');
}

// Fuzz: random sequences of calls keep the invariants of the composed pieces

fn village_at(id: u32) -> ContractAddress {
    let address: felt252 = 0x1000 + id.into();
    address.try_into().unwrap()
}

fn npc_at(id: u8) -> ContractAddress {
    let address: felt252 = id.into();
    address.try_into().unwrap()
}

/// Bit b set iff bucket b is non-empty, and every slot below a size holds a listed village whose
/// place says so (so no village is in two slots); the listed count matches the sizes.
fn assert_buckets(world: World, villages: Span<ContractAddress>) {
    let mut bits: u256 = world.buckets.registry().into();
    let mut listed: u32 = 0;
    let mut bucket: u8 = 0;
    loop {
        let size = world.buckets.bucket_size(bucket);
        assert((bits % 2 == 1) == (size > 0), 'bit != non-empty');
        bits /= 2;
        let mut index: u32 = 0;
        while index < size {
            let address = world.buckets.slot(bucket, index);
            let place = world.buckets.place(address);
            assert(place == Place { bucket, index, listed: true }, 'slot village elsewhere');
            index += 1;
        }
        listed += size;
        if bucket == TOP_BUCKET {
            break;
        }
        bucket += 1;
    }
    assert(bits == 0, 'bit past the top bucket');
    let mut count: u32 = 0;
    for address in villages {
        if world.buckets.place(*address).listed {
            count += 1;
        }
    }
    assert(count == listed, 'listed count != sizes');
}

/// Every player in exactly one place, its slot (in the bucket of its crowns) or its live shield
/// entry; every NPC listed, or out of both once removed.
fn assert_villages(world: World, villages: Span<ContractAddress>) {
    for address in villages {
        let address = *address;
        let status = world.matchmaker.village(address).status;
        let place = world.buckets.place(address);
        let shield = world.shields.shield(address);
        if place.listed {
            assert(status != STATUS_NONE, 'listed stranger');
            assert(!shield.up, 'listed and shielded');
            assert(place.bucket == bucket_of(world.crowns.crowns(address)), 'wrong bucket');
            assert(place.index < world.buckets.bucket_size(place.bucket), 'index past size');
            assert(world.buckets.slot(place.bucket, place.index) == address, 'slot not village');
        } else if shield.up {
            assert(status == STATUS_PLAYER, 'shielded non-player');
            let queue = world.shields.queue(shield.queue);
            assert(queue.head <= shield.seq && shield.seq < queue.tail, 'shield entry not live');
            assert(
                world.shields.queue_entry(shield.queue, shield.seq) == address, 'entry elsewhere',
            );
        } else {
            assert(status == STATUS_NONE, 'joined village nowhere');
        }
    }
}

fn next_random(ref state: felt252) -> u256 {
    state = PoseidonTrait::new().update(state).update('MATCHMAKER').finalize();
    state.into()
}

/// Runs `steps` random calls through the system; the buckets are checked whole every `every` steps
/// and at the end, the villages after every step. Returns the attacks settled and the shields
/// released by `release_shields`.
#[feature("safe_dispatcher")]
fn run_sequence(seed: felt252, steps: u32, every: u32) -> (u32, u32) {
    let world = world();
    let address = world.matchmaker.contract_address;
    let mut attacks: u32 = 0;
    let mut releases: u32 = 0;
    let mut state = seed;
    let mut now = START;
    let mut hash: felt252 = 'FUZZ';
    let mut joined: Array<ContractAddress> = array![];
    // Bit `id` set once NPC `id` is in `joined`
    let mut npcs: u8 = 0;
    let mut players: u32 = 0;
    let mut step: u32 = 0;
    while step != steps {
        let r = next_random(ref state);
        let op = r % 8;
        if op == 0 || players < 2 {
            join(world, village_at(players));
            joined.append(village_at(players));
            players += 1;
        } else if op == 1 {
            let id: u8 = 1 + ((r / 8) % 3).try_into().unwrap();
            let bit: u8 = if id == 1 {
                2
            } else if id == 2 {
                4
            } else {
                8
            };
            if npcs & bit == 0 {
                joined.append(npc_at(id));
                npcs = npcs | bit;
            }
            start_cheat_caller_address(address, OWNER());
            let listed = world.buckets.place(npc_at(id)).listed;
            if listed && (r / 32) % 3 == 0 {
                world.admin.remove_npc(id);
            } else {
                world.admin.set_npc(id, ((r / 64) % 300).try_into().unwrap());
            }
            stop_cheat_caller_address(address);
        } else if op == 2 {
            let id: u32 = ((r / 8) % players.into()).try_into().unwrap();
            as_operator(world);
            world.matchmaker.set_crowns(village_at(id), ((r / 1024) % 30_000).try_into().unwrap());
            stop_cheat_caller_address(address);
        } else if op == 3 {
            now += ((r / 8) % (10 * 3600)).try_into().unwrap();
            start_cheat_block_timestamp_global(now);
        } else if op == 4 {
            releases += world.matchmaker.release_shields(((r / 8) % 4).try_into().unwrap());
        } else {
            // An attack: draw, start, settle
            let attacker = village_at(((r / 8) % players.into()).try_into().unwrap());
            hash += 1;
            tx(hash);
            as_player(world, attacker);
            let drawn = safe(world).search();
            stop_cheat_caller_address(address);
            if let Result::Ok(defender) = drawn {
                assert(defender != attacker, 'fuzz: self match');
                assert(world.buckets.place(defender).listed, 'fuzz: drawn unlisted');
                let npc = world.matchmaker.village(defender).status == STATUS_NPC;
                let before: u64 = world.crowns.crowns(attacker).into()
                    + world.crowns.crowns(defender).into();
                start(world, attacker);
                let stars: u8 = ((r / 0x10000) % 4).try_into().unwrap();
                as_operator(world);
                let outcome = world.matchmaker.settle(attacker, stars);
                stop_cheat_caller_address(address);
                attacks += 1;
                if !npc {
                    let after: u64 = outcome.attacker.into() + outcome.defender.into();
                    assert(before == after, 'fuzz: crowns not conserved');
                }
            }
        }
        assert_villages(world, joined.span());
        step += 1;
        if step % every == 0 || step == steps {
            assert_buckets(world, joined.span());
        }
    }
    (attacks, releases)
}

#[test]
#[fuzzer(runs: 16, seed: 639)]
fn test_fuzz_pool_invariants(seed: felt252) {
    let (_attacks, _releases) = run_sequence(seed, 24, 4);
}

#[test]
fn test_pool_invariants_long_sequence() {
    let (attacks, releases) = run_sequence('LONG', 120, 40);
    assert(attacks >= 20 && releases >= 3, 'sequence too quiet');
}
