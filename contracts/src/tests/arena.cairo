//! The PvP attacks (`systems/arena.cairo`, `docs/architecture/pvp-attacks.md`, #643): the attack's
//! start on the opponent drawn in `Matchmaker` (its shield, the hold of the 0-star cost), the
//! snapshot of the defender's village, each move (the territory, the fit, the next tile drawn by
//! the VRF), the finish (the replay, the stars, the crowns settled, the village reward granted),
//! quitting (a surrender, and an attack left open), a move after the end, a second attack while one
//! is open, the NPC villages on their Story level, the storage pinned by name, the gas of each
//! call, and the pieces alone (`DeckableComponent`, `RecordableComponent`, the hold of
//! `CrownableComponent`), fuzzed where crowns or the deck's invariant are at stake.
//!
//! The VRF component refuses a second draw in one transaction by its hash, so each call that draws
//! runs under its own cheated hash (`tx`).

use core::num::traits::Zero;
use core::poseidon::poseidon_hash_span;
use core::testing::get_available_gas;
use paved::components::crownable::CrownableComponent::InternalTrait as CrownableInternal;
use paved::components::crownable::{
    CrownableComponent, ICrownableDispatcher, ICrownableDispatcherTrait,
};
use paved::components::deckable::DeckableComponent::InternalTrait as DeckableInternal;
use paved::components::deckable::{
    Deck, DeckableComponent, IDeckableDispatcher, IDeckableDispatcherTrait,
};
use paved::components::recordable::RecordableComponent::{
    AttackPlayed, Event as RecordEvent, InternalTrait as RecordableInternal,
};
use paved::components::recordable::{
    AttackMove, IRecordableDispatcher, IRecordableDispatcherTrait, RecordableComponent,
};
use paved::components::shieldable::{
    INITIAL_SHIELD, IShieldableDispatcher, IShieldableDispatcherTrait,
};
use paved::constants::CENTER;
use paved::helpers::random_deck::draw_from_bitmap;
use paved::matchmaker::crowns::{cost_of, offer_of, prize_of, settle};
use paved::matchmaker::stars::stars_of;
use paved::mocks::vrf::MockVrfProvider::MOCK_TAG;
use paved::systems::arena::Arena::{
    AttackFinished, AttackOpened, AttackSkipped, Event as ArenaEvent,
};
use paved::systems::arena::{
    ATTACK_KIND, Arena, Attack, IArenaAdminDispatcher, IArenaAdminDispatcherTrait,
    IArenaAdminSafeDispatcher, IArenaAdminSafeDispatcherTrait, IArenaDispatcher,
    IArenaDispatcherTrait, IArenaSafeDispatcher, IArenaSafeDispatcherTrait, NpcLevel,
    STATUS_FINISHED, STATUS_OPEN, STATUS_SKIPPED, STATUS_SURRENDERED, draw_index,
};
use paved::systems::matchmaker::{
    IMatchmakerAdminDispatcher, IMatchmakerAdminDispatcherTrait, IMatchmakerDispatcher,
    IMatchmakerDispatcherTrait, IMatchmakerSafeDispatcher, IMatchmakerSafeDispatcherTrait,
    Matchmaker,
};
use paved::systems::rewards::{
    DAILY_CAP, IRewardsAdminDispatcher, IRewardsAdminDispatcherTrait, IRewardsDispatcher,
    IRewardsDispatcherTrait,
};
use paved::systems::setup::{
    ISetupDispatcher, ISetupDispatcherTrait, ISetupRewardsDispatcher, ISetupRewardsDispatcherTrait,
    ISetupSpendDispatcher, ISetupSpendDispatcherTrait, level_floor,
};
use paved::systems::story::{IStoryDispatcher, IStoryDispatcherTrait, StoryTile};
use paved::systems::village::{
    IVillageAdminDispatcher, IVillageAdminDispatcherTrait, IVillageDispatcher,
    IVillageDispatcherTrait,
};
use paved::vrf::draw_salt;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, load,
    map_entry_address, spy_events, start_cheat_block_timestamp_global, start_cheat_caller_address,
    start_cheat_transaction_hash_global, stop_cheat_caller_address, store,
};
use starknet::ContractAddress;

// Ceilings of the L2 gas of each new call (the test profile, `test_arena_gas_*`): the figure
// measured on the VPS (snforge 0.64.0) + 5 %, rounded up.
pub const CEILING_START: u128 = 19632710;
pub const CEILING_PLAY: u128 = 4677543;
pub const CEILING_FINISH_38: u128 = 347054382;
pub const CEILING_SURRENDER: u128 = 4012881;

const START: u64 = 1_800_000_000;
/// The territory cap of the test villages: 41 cells, so a village holds 38 placed tiles.
const CAP: u8 = 41;

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn OPERATOR() -> ContractAddress {
    'OPERATOR'.try_into().unwrap()
}

fn PLACER() -> ContractAddress {
    'PLACER'.try_into().unwrap()
}

fn ALICE() -> ContractAddress {
    'ALICE'.try_into().unwrap()
}

fn BOB() -> ContractAddress {
    'BOB'.try_into().unwrap()
}

fn ANYONE() -> ContractAddress {
    'ANYONE'.try_into().unwrap()
}

fn NPC_1() -> ContractAddress {
    1.try_into().unwrap()
}

#[derive(Copy, Drop)]
struct World {
    arena: IArenaDispatcher,
    admin: IArenaAdminDispatcher,
    matchmaker: IMatchmakerDispatcher,
    crowns: ICrownableDispatcher,
    village: IVillageDispatcher,
    story: IStoryDispatcher,
    rewards: IRewardsDispatcher,
    setup: ContractAddress,
    provider: ContractAddress,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// Every system an attack touches, wired as the deployment will: `Arena` an operator of
/// `Matchmaker`, `Matchmaker` a spender and a reporter of `Setup`, `Rewards` granted by `Setup`,
/// `Village` a spender of `Setup` with `PLACER` placing; `OPERATOR` joins the villages. No
/// village yet.
fn world() -> World {
    start_cheat_block_timestamp_global(START);
    let setup = deploy("Setup", array![OWNER().into()]);
    let provider = deploy("MockVrfProvider", array![]);
    let village = deploy("Village", array![OWNER().into(), setup.into(), CAP.into()]);
    let matchmaker = deploy("Matchmaker", array![OWNER().into(), setup.into(), provider.into()]);
    let story = deploy("Story", array![OWNER().into(), setup.into()]);
    let arena = deploy(
        "Arena",
        array![OWNER().into(), matchmaker.into(), village.into(), story.into(), provider.into()],
    );
    let rewards = deploy(
        "Rewards",
        array![OWNER().into(), setup.into(), village.into(), provider.into(), DAILY_CAP.into()],
    );
    let world = World {
        arena: IArenaDispatcher { contract_address: arena },
        admin: IArenaAdminDispatcher { contract_address: arena },
        matchmaker: IMatchmakerDispatcher { contract_address: matchmaker },
        crowns: ICrownableDispatcher { contract_address: matchmaker },
        village: IVillageDispatcher { contract_address: village },
        story: IStoryDispatcher { contract_address: story },
        rewards: IRewardsDispatcher { contract_address: rewards },
        setup,
        provider,
    };
    start_cheat_caller_address(matchmaker, OWNER());
    let mm_admin = IMatchmakerAdminDispatcher { contract_address: matchmaker };
    mm_admin.set_operator(OPERATOR(), true);
    mm_admin.set_operator(arena, true);
    stop_cheat_caller_address(matchmaker);
    start_cheat_caller_address(setup, OWNER());
    let setup_admin = ISetupDispatcher { contract_address: setup };
    setup_admin.set_reporter(matchmaker, true);
    setup_admin.set_reporter(rewards, true);
    ISetupSpendDispatcher { contract_address: setup }.set_spender(matchmaker, true);
    ISetupSpendDispatcher { contract_address: setup }.set_spender(village, true);
    ISetupRewardsDispatcher { contract_address: setup }.set_rewards(rewards);
    stop_cheat_caller_address(setup);
    start_cheat_caller_address(rewards, OWNER());
    IRewardsAdminDispatcher { contract_address: rewards }.set_granter(setup, true);
    stop_cheat_caller_address(rewards);
    start_cheat_caller_address(village, OWNER());
    IVillageAdminDispatcher { contract_address: village }.set_placer(PLACER(), true);
    stop_cheat_caller_address(village);
    world
}

/// A coordinate relative to the starter, in the game's.
fn at(d: i32) -> u32 {
    if d >= 0 {
        CENTER + d.try_into().unwrap()
    } else {
        CENTER - (-d).try_into().unwrap()
    }
}

fn found(world: World, player: ContractAddress) {
    start_cheat_caller_address(world.village.contract_address, player);
    world.village.found();
    stop_cheat_caller_address(world.village.contract_address);
}

fn place(world: World, player: ContractAddress, plan: u8, orientation: u8, x: i32, y: i32) {
    start_cheat_caller_address(world.village.contract_address, PLACER());
    world.village.place(player.into(), plan, orientation, at(x), at(y));
    stop_cheat_caller_address(world.village.contract_address);
}

/// The unit of the XP in `Setup`'s account slot: its bits [224, 251).
const XP_UNIT: felt252 = 0x100000000000000000000000000000000000000000000000000000000;

/// Writes `who`'s account on `Setup`: `cobbles` and the XP of `level`'s floor (#641).
fn fund(world: World, who: ContractAddress, cobbles: u64, level: u16) {
    let slot = map_entry_address(selector!("accounts"), array![who.into()].span());
    let xp: felt252 = level_floor(level).into();
    store(world.setup, slot, array![cobbles.into() + xp * XP_UNIT].span());
}

fn buy(world: World, player: ContractAddress, x: i32, y: i32) {
    start_cheat_caller_address(world.village.contract_address, player);
    world.village.buy_parcel(at(x), at(y));
    stop_cheat_caller_address(world.village.contract_address);
}

/// Runs what follows in the transaction `hash`.
fn tx(hash: felt252) {
    start_cheat_transaction_hash_global(hash);
}

fn join(world: World, player: ContractAddress, crowns: u32) {
    let address = world.matchmaker.contract_address;
    start_cheat_caller_address(address, OPERATOR());
    world.matchmaker.join(player);
    stop_cheat_caller_address(address);
}

fn set_crowns(world: World, player: ContractAddress, crowns: u32) {
    let address = world.matchmaker.contract_address;
    start_cheat_caller_address(address, OPERATOR());
    world.matchmaker.set_crowns(player, crowns);
    stop_cheat_caller_address(address);
}

fn search(world: World, player: ContractAddress, hash: felt252) -> ContractAddress {
    tx(hash);
    let address = world.matchmaker.contract_address;
    start_cheat_caller_address(address, player);
    let opponent = world.matchmaker.search();
    stop_cheat_caller_address(address);
    opponent
}

fn start(world: World, hash: felt252) -> u32 {
    tx(hash);
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    let id = world.arena.start();
    stop_cheat_caller_address(world.arena.contract_address);
    id
}

fn play(world: World, orientation: u8, x: i32, y: i32, hash: felt252) -> u8 {
    tx(hash);
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    let stars = world.arena.play(false, orientation, at(x), at(y));
    stop_cheat_caller_address(world.arena.contract_address);
    stars
}

fn discard(world: World, hash: felt252) -> u8 {
    tx(hash);
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    let stars = world.arena.play(true, 0, 0, 0);
    stop_cheat_caller_address(world.arena.contract_address);
    stars
}

fn surrender(world: World) {
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    world.arena.surrender();
    stop_cheat_caller_address(world.arena.contract_address);
}

fn safe(world: World) -> IArenaSafeDispatcher {
    IArenaSafeDispatcher { contract_address: world.arena.contract_address }
}

fn hand(world: World) -> u8 {
    let id = world.arena.attack(ALICE()).id;
    IDeckableDispatcher { contract_address: world.arena.contract_address }.deck(ALICE(), id).hand
}

/// What the mock's first consume of a transaction gives `consumer` for `salt`.
fn mock_random(salt: felt252, consumer: ContractAddress) -> felt252 {
    let chain_id = starknet::get_tx_info().unbox().chain_id;
    let seed = poseidon_hash_span(array![salt, consumer.into(), chain_id].span());
    let random = poseidon_hash_span(array![seed, MOCK_TAG].span());
    poseidon_hash_span(array![random, 0].span())
}

/// Alice and Bob in the pool at `crowns` each (their initial shields over); Bob's village founded
/// with a stop (`SFRFRFRFR`, plan 17) on each side of the starter's road, closing it.
fn duel(crowns: u32) -> World {
    let world = world();
    join(world, ALICE(), 0);
    join(world, BOB(), 0);
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD);
    assert_eq!(world.matchmaker.release_shields(2), 2);
    set_crowns(world, ALICE(), crowns);
    set_crowns(world, BOB(), crowns);
    found(world, BOB());
    place(world, BOB(), 17, 1, 1, 0);
    place(world, BOB(), 17, 1, -1, 0);
    world
}

/// `duel(1000)`, Bob drawn by Alice and her attack started.
fn started() -> World {
    let world = duel(1000);
    assert(search(world, ALICE(), 'S1') == BOB(), 'Bob not drawn');
    assert_eq!(start(world, 'A0'), 1);
    world
}

// The stars (`paved::matchmaker::stars`)

#[test]
fn test_stars_at_the_thresholds() {
    assert_eq!(stars_of(69, 100), 0);
    assert_eq!(stars_of(70, 100), 1);
    assert_eq!(stars_of(84, 100), 1);
    assert_eq!(stars_of(85, 100), 2);
    assert_eq!(stars_of(109, 100), 2);
    assert_eq!(stars_of(110, 100), 3);
    assert_eq!(stars_of(5000, 100), 3);
}

#[test]
fn test_stars_round_against_the_attacker() {
    // 70 % of 1,001 is 700.7: 700 is short, 701 earns the star
    assert_eq!(stars_of(700, 1001), 0);
    assert_eq!(stars_of(701, 1001), 1);
}

#[test]
fn test_stars_of_a_zero_score_or_target() {
    assert_eq!(stars_of(0, 0), 0);
    assert_eq!(stars_of(0, 100), 0);
    assert_eq!(stars_of(1, 0), 3);
}

#[test]
fn test_stars_at_the_u32_bound() {
    let max = 0xffffffff_u32;
    assert_eq!(stars_of(max, max), 2);
    assert_eq!(stars_of(max, 1), 3);
    assert_eq!(stars_of(1, max), 0);
}

#[test]
#[fuzzer(runs: 256)]
fn test_stars_are_monotone_and_bounded(score: u32, target: u32, more: u32) {
    let stars = stars_of(score, target);
    assert(stars <= 3, 'Stars: above 3');
    let higher = if score > 0xffffffff - more {
        0xffffffff
    } else {
        score + more
    };
    assert(stars_of(higher, target) >= stars, 'Stars: not monotone');
}

// The start

#[test]
fn test_arena_start_snapshots_the_village() {
    let world = duel(1000);
    search(world, ALICE(), 'S1');
    let target = world.village.village(BOB().into()).score;
    assert(target != 0, 'Bob scores nothing');
    let mut spy = spy_events();
    start(world, 'A0');
    let attack = world.arena.attack(ALICE());
    assert_eq!(attack.id, 1);
    assert_eq!(attack.status, STATUS_OPEN);
    assert_eq!(attack.defender, BOB());
    assert!(!attack.npc);
    assert_eq!(attack.parcels, 0);
    assert_eq!(attack.target, target);
    assert_eq!(attack.started_at, START + INITIAL_SHIELD);
    let deck = IDeckableDispatcher { contract_address: world.arena.contract_address }
        .deck(ALICE(), 1);
    assert_eq!((deck.size, deck.drawn, deck.hand), (2, 1, 17));
    spy
        .assert_emitted(
            @array![
                (
                    world.arena.contract_address,
                    ArenaEvent::AttackOpened(
                        AttackOpened {
                            attacker: ALICE(),
                            defender: BOB(),
                            id: 1,
                            npc: false,
                            offer: offer_of(1000, 1000),
                            target,
                            tiles: 2,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn test_arena_start_shields_the_defender_and_holds_the_cost() {
    let world = started();
    let shields = IShieldableDispatcher { contract_address: world.matchmaker.contract_address };
    assert!(shields.shield(BOB()).up);
    let cost: u32 = cost_of(1000, 1000).into();
    assert_eq!(world.crowns.crowns(ALICE()), 1000 - cost);
    assert_eq!(world.crowns.held(ALICE()), cost);
    assert_eq!(world.crowns.crowns(BOB()), 1000);
}

/// The first tile is the VRF's: the mock's random of the salt `(ATTACK, Alice, draw 0 of attack
/// 1)` picks it among the deck's tiles.
#[test]
fn test_arena_draw_is_the_vrf_salt() {
    let world = duel(1000);
    // A deck of two plans: the two stops, and a straight road east of the east one
    fund(world, BOB(), 1_000, 5);
    buy(world, BOB(), 2, 0);
    place(world, BOB(), 10, 1, 2, 0);
    search(world, ALICE(), 'S1');
    tx('A0');
    let salt = draw_salt(ATTACK_KIND, ALICE().into(), draw_index(1, 0));
    let random = mock_random(salt, world.arena.contract_address);
    let (card, _) = draw_from_bitmap(random, 3, 0);
    let plans: Array<u8> = array![17, 17, 10];
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    world.arena.start();
    stop_cheat_caller_address(world.arena.contract_address);
    assert_eq!(hand(world), *plans.at((card - 1).into()));
}

#[test]
#[feature("safe_dispatcher")]
fn test_arena_start_without_a_draw_fails() {
    let world = duel(1000);
    tx('A0');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    match safe(world).start() {
        Result::Ok(_) => panic!("started with nothing drawn"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Matchmaker: nothing drawn'),
    }
}

/// An opponent that cannot be attacked is skipped, not a trap: the start does not revert, the
/// match is cancelled (the next `search` is free, no "Next" to pay), nothing moves, no shield.
fn assert_skipped(world: World, defender: ContractAddress, crowns: u32) {
    let mut spy = spy_events();
    assert_eq!(start(world, 'A0'), 1);
    let attack = world.arena.attack(ALICE());
    assert_eq!((attack.id, attack.status, attack.defender), (1, STATUS_SKIPPED, defender));
    assert(world.matchmaker.current_match(ALICE()).opponent.is_zero(), 'match not cancelled');
    assert_eq!(world.crowns.crowns(ALICE()), crowns);
    assert_eq!(world.crowns.held(ALICE()), 0);
    spy
        .assert_emitted(
            @array![
                (
                    world.arena.contract_address,
                    ArenaEvent::AttackSkipped(AttackSkipped { attacker: ALICE(), defender, id: 1 }),
                ),
            ],
        );
    // The next search is free, and the next start has the next number
    assert(search(world, ALICE(), 'S2') == defender, 'not drawn again');
    assert_eq!(start(world, 'A1'), 2);
    assert_eq!(world.arena.attack(ALICE()).status, STATUS_SKIPPED);
}

#[test]
fn test_arena_start_on_an_empty_village_skips_it() {
    let world = world();
    join(world, ALICE(), 0);
    join(world, BOB(), 0);
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD);
    world.matchmaker.release_shields(2);
    set_crowns(world, ALICE(), 1000);
    set_crowns(world, BOB(), 1000);
    found(world, BOB());
    search(world, ALICE(), 'S1');
    assert_skipped(world, BOB(), 1000);
    let shields = IShieldableDispatcher { contract_address: world.matchmaker.contract_address };
    assert!(!shields.shield(BOB()).up);
}

#[test]
fn test_arena_start_on_a_village_never_founded_skips_it() {
    let world = world();
    join(world, ALICE(), 0);
    join(world, BOB(), 0);
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD);
    world.matchmaker.release_shields(2);
    search(world, ALICE(), 'S1');
    assert_skipped(world, BOB(), 0);
}

// The moves

#[test]
fn test_arena_attack_finishes_settles_and_rewards() {
    let world = started();
    let target = world.arena.attack(ALICE()).target;
    let mut spy = spy_events();
    assert_eq!(play(world, 1, 1, 0, 'A1'), 0);
    assert_eq!(world.arena.attack(ALICE()).status, STATUS_OPEN);
    // The last move finishes: the same village, the same score, 2 stars (100 %)
    let stars = play(world, 1, -1, 0, 'A2');
    let attack = world.arena.attack(ALICE());
    assert_eq!(attack.status, STATUS_FINISHED);
    assert_eq!(attack.score, target);
    assert_eq!(stars, 2);
    assert_eq!(attack.stars, 2);
    // The crowns: the hold back, then 2 stars of the offer taken from Bob
    let prize = prize_of(offer_of(1000, 1000), 2);
    assert_eq!(world.crowns.crowns(ALICE()), 1000 + prize);
    assert_eq!(world.crowns.crowns(BOB()), 1000 - prize);
    assert_eq!(world.crowns.held(ALICE()), 0);
    // The village reward of the attack (#642), granted through `Setup.report_pvp`
    assert_eq!(world.rewards.grants(ALICE().into()).pending, 1);
    // The replay's source
    let moves = IRecordableDispatcher { contract_address: world.arena.contract_address }
        .moves(ALICE(), 1);
    assert_eq!(moves.len(), 2);
    assert_eq!(
        *moves.at(1), AttackMove { plan: 17, discard: false, orientation: 1, x: at(-1), y: at(0) },
    );
    spy
        .assert_emitted(
            @array![
                (
                    world.arena.contract_address,
                    ArenaEvent::RecordableEvent(
                        RecordEvent::AttackPlayed(
                            AttackPlayed {
                                attacker: ALICE(),
                                id: 1,
                                index: 0,
                                plan: 17,
                                discard: false,
                                orientation: 1,
                                x: at(1),
                                y: at(0),
                            },
                        ),
                    ),
                ),
                (
                    world.arena.contract_address,
                    ArenaEvent::AttackFinished(
                        AttackFinished {
                            attacker: ALICE(),
                            defender: BOB(),
                            id: 1,
                            game_id: attack.board + 1,
                            score: target,
                            stars: 2,
                            surrendered: false,
                            gained: prize,
                            lost: 0,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn test_arena_discards_score_nothing_and_lose_the_cost() {
    let world = started();
    discard(world, 'A1');
    assert_eq!(discard(world, 'A2'), 0);
    let attack = world.arena.attack(ALICE());
    assert_eq!((attack.status, attack.score, attack.stars), (STATUS_FINISHED, 0, 0));
    let cost: u32 = cost_of(1000, 1000).into();
    assert_eq!(world.crowns.crowns(ALICE()), 1000 - cost);
    assert_eq!(world.crowns.crowns(BOB()), 1000 + cost);
}

#[test]
#[feature("safe_dispatcher")]
fn test_arena_move_outside_the_territory_fails() {
    let world = started();
    tx('A1');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    match safe(world).play(false, 1, at(2), at(0)) {
        Result::Ok(_) => panic!("played outside"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: outside territory'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_arena_move_that_does_not_fit_fails() {
    let world = started();
    tx('A1');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    // North of the starter: its city cap faces a road
    match safe(world).play(false, 1, at(0), at(1)) {
        Result::Ok(_) => panic!("played a misfit"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Tile: cannot place'),
    }
    match safe(world).play(false, 1, at(0), at(0)) {
        Result::Ok(_) => panic!("played on the starter"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Tile: already exists'),
    }
    match safe(world).play(false, 1, at(1), at(1)) {
        Result::Ok(_) => panic!("played with no neighbour"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Tile: no neighbors'),
    }
    match safe(world).play(false, 5, at(1), at(0)) {
        Result::Ok(_) => panic!("played a bad orientation"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: invalid orientation'),
    }
}

/// The snapshot: what the defender does during the attack changes nothing of it.
#[test]
fn test_arena_snapshot_holds_when_the_village_grows() {
    let world = started();
    let target = world.arena.attack(ALICE()).target;
    fund(world, BOB(), 1_000, 5);
    buy(world, BOB(), 2, 0);
    place(world, BOB(), 17, 1, 2, 0);
    assert!(world.village.village(BOB().into()).score != target);
    // The cell bought after the start is not in the attacked territory, the deck has 2 tiles
    play(world, 1, 1, 0, 'A1');
    tx('A2');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    match safe(world).play(false, 1, at(2), at(0)) {
        Result::Ok(_) => panic!("played on a new cell"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: outside territory'),
    }
    stop_cheat_caller_address(world.arena.contract_address);
    assert_eq!(play(world, 1, -1, 0, 'A3'), 2);
    assert_eq!(world.arena.attack(ALICE()).score, target);
}

/// A parcel bought before the start is in the attacked territory.
#[test]
fn test_arena_plays_on_a_parcel() {
    let world = duel(1000);
    fund(world, BOB(), 1_000, 5);
    buy(world, BOB(), 2, 0);
    place(world, BOB(), 10, 1, 2, 0);
    search(world, ALICE(), 'S1');
    start(world, 'A0');
    assert_eq!(world.arena.attack(ALICE()).parcels, 1);
    // Whatever the order: a stop west, then east, then the road at (2, 0) beyond the east stop
    let mut n: felt252 = 1;
    let mut west = false;
    let mut east = false;
    while world.arena.attack(ALICE()).status == STATUS_OPEN {
        let plan = hand(world);
        if plan == 10 && east {
            play(world, 1, 2, 0, n);
        } else if plan == 17 && !west {
            play(world, 1, -1, 0, n);
            west = true;
        } else if plan == 17 {
            play(world, 1, 1, 0, n);
            east = true;
        } else {
            discard(world, n);
        }
        n += 1;
    }
    assert_eq!(world.arena.attack(ALICE()).status, STATUS_FINISHED);
}

// Quitting, the end, one attack at a time

#[test]
fn test_arena_surrender_is_a_defeat() {
    let world = started();
    play(world, 1, 1, 0, 'A1');
    let mut spy = spy_events();
    surrender(world);
    let attack = world.arena.attack(ALICE());
    assert_eq!((attack.status, attack.stars), (STATUS_SURRENDERED, 0));
    let cost: u32 = cost_of(1000, 1000).into();
    assert_eq!(world.crowns.crowns(ALICE()), 1000 - cost);
    assert_eq!(world.crowns.crowns(BOB()), 1000 + cost);
    assert_eq!(world.crowns.held(ALICE()), 0);
    spy
        .assert_emitted(
            @array![
                (
                    world.arena.contract_address,
                    ArenaEvent::AttackFinished(
                        AttackFinished {
                            attacker: ALICE(),
                            defender: BOB(),
                            id: 1,
                            game_id: 0,
                            score: 0,
                            stars: 0,
                            surrendered: true,
                            gained: 0,
                            lost: cost,
                        },
                    ),
                ),
            ],
        );
}

/// An attack left open keeps the hold and blocks its attacker: no other start, no other draw.
#[test]
#[feature("safe_dispatcher")]
fn test_arena_second_attack_while_one_is_open_fails() {
    let world = started();
    tx('A9');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    match safe(world).start() {
        Result::Ok(_) => panic!("two attacks open"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: attack open'),
    }
    stop_cheat_caller_address(world.arena.contract_address);
    tx('S2');
    start_cheat_caller_address(world.matchmaker.contract_address, ALICE());
    let matchmaker = IMatchmakerSafeDispatcher {
        contract_address: world.matchmaker.contract_address,
    };
    match matchmaker.search() {
        Result::Ok(_) => panic!("drew during an attack"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Matchmaker: attack started'),
    }
    let cost: u32 = cost_of(1000, 1000).into();
    assert_eq!(world.crowns.held(ALICE()), cost);
}

#[test]
#[feature("safe_dispatcher")]
fn test_arena_move_after_the_end_fails() {
    let world = started();
    play(world, 1, 1, 0, 'A1');
    play(world, 1, -1, 0, 'A2');
    tx('A3');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    match safe(world).play(true, 0, 0, 0) {
        Result::Ok(_) => panic!("played after the end"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: no attack'),
    }
    match safe(world).surrender() {
        Result::Ok(_) => panic!("surrendered after the end"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: no attack'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_arena_move_after_a_surrender_fails() {
    let world = started();
    surrender(world);
    tx('A1');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    match safe(world).play(false, 1, at(1), at(0)) {
        Result::Ok(_) => panic!("played after a surrender"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: no attack'),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn test_arena_no_move_without_an_attack() {
    let world = duel(1000);
    tx('A1');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    match safe(world).play(true, 0, 0, 0) {
        Result::Ok(_) => panic!("played with no attack"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: no attack'),
    }
}

/// No timeout (open point 4, `ATTACK_TIMEOUT` 0): nobody else ends an attack, however old.
#[test]
#[feature("safe_dispatcher")]
fn test_arena_expire_with_no_timeout_fails() {
    let world = started();
    start_cheat_block_timestamp_global(START + 365 * 86400);
    start_cheat_caller_address(world.arena.contract_address, ANYONE());
    match safe(world).expire(ALICE()) {
        Result::Ok(_) => panic!("expired"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: no timeout'),
    }
}

/// After an attack, the next one has the next number; the moves of the first stay readable.
#[test]
fn test_arena_attacks_are_numbered() {
    let world = started();
    play(world, 1, 1, 0, 'A1');
    play(world, 1, -1, 0, 'A2');
    // Bob is shielded: Alice draws again once his shield is down
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD + 9 * 3600);
    world.matchmaker.release_shields(2);
    search(world, ALICE(), 'S2');
    assert_eq!(start(world, 'B0'), 2);
    let records = IRecordableDispatcher { contract_address: world.arena.contract_address };
    assert_eq!(records.moves(ALICE(), 1).len(), 2);
    assert_eq!(records.moves(ALICE(), 2).len(), 0);
}

// NPC villages (Story levels)

/// Alice alone in the pool with NPC 1, mapped to level 1 of campaign 1: two stops after the usual
/// starter, target `target`.
fn npc_duel(target: u32) -> World {
    let world = world();
    join(world, ALICE(), 0);
    start_cheat_block_timestamp_global(START + INITIAL_SHIELD);
    world.matchmaker.release_shields(1);
    start_cheat_caller_address(world.matchmaker.contract_address, OWNER());
    IMatchmakerAdminDispatcher { contract_address: world.matchmaker.contract_address }
        .set_npc(1, 0);
    stop_cheat_caller_address(world.matchmaker.contract_address);
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_campaign(1, 1, 0);
    let starter = StoryTile { plan: 9, orientation: 3, x: CENTER, y: CENTER };
    world.story.set_level(1, 1, array![17, 17].span(), starter, array![].span(), target);
    stop_cheat_caller_address(world.story.contract_address);
    world
}

fn map_npc(world: World) {
    start_cheat_caller_address(world.arena.contract_address, OWNER());
    world.admin.set_npc_level(1, 1, 1);
    stop_cheat_caller_address(world.arena.contract_address);
}

#[test]
fn test_arena_npc_attack_on_its_story_level() {
    let world = npc_duel(1);
    map_npc(world);
    assert(search(world, ALICE(), 'S1') == NPC_1(), 'NPC not drawn');
    start(world, 'A0');
    let attack = world.arena.attack(ALICE());
    assert!(attack.npc);
    assert_eq!(attack.target, 1);
    // The board is open: no territory
    play(world, 1, 1, 0, 'A1');
    assert_eq!(play(world, 1, -1, 0, 'A2'), 3);
    // A win against an NPC mints the attacker's prize; the NPC's crowns stay
    assert_eq!(world.crowns.crowns(ALICE()), prize_of(offer_of(0, 0), 3));
    assert_eq!(world.crowns.crowns(NPC_1()), 0);
}

#[test]
fn test_arena_npc_without_a_level_is_skipped() {
    let world = npc_duel(1);
    search(world, ALICE(), 'S1');
    assert_skipped(world, NPC_1(), 0);
}

#[test]
#[feature("safe_dispatcher")]
fn test_arena_admin_is_the_owner() {
    let world = world();
    let admin = IArenaAdminSafeDispatcher { contract_address: world.arena.contract_address };
    start_cheat_caller_address(world.arena.contract_address, ANYONE());
    match admin.set_npc_level(1, 1, 1) {
        Result::Ok(_) => panic!("a stranger mapped an NPC"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Ownable: caller is not owner'),
    }
    match admin.set_wiring(ANYONE(), ANYONE(), ANYONE()) {
        Result::Ok(_) => panic!("a stranger rewired"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Ownable: caller is not owner'),
    }
    start_cheat_caller_address(world.arena.contract_address, OWNER());
    match admin.set_npc_level(0, 1, 1) {
        Result::Ok(_) => panic!("mapped NPC 0"),
        Result::Err(data) => assert_eq!(*data.at(0), 'Arena: invalid npc'),
    }
    world.admin.set_npc_level(7, 2, 3);
    assert_eq!(world.arena.npc_level(7), NpcLevel { campaign: 2, level: 3 });
    world.admin.set_npc_level(7, 0, 3);
    assert_eq!(world.arena.npc_level(7), NpcLevel { campaign: 0, level: 0 });
}

// Storage pinned by name (`docs/architecture/upgrades.md`)

fn raw(address: ContractAddress, name: felt252) -> felt252 {
    *load(address, name, 1).at(0)
}

fn raw_entry(address: ContractAddress, name: felt252, keys: Array<felt252>) -> felt252 {
    *load(address, map_entry_address(name, keys.span()), 1).at(0)
}

#[test]
fn test_arena_storage_is_pinned_by_name() {
    let world = started();
    play(world, 1, 1, 0, 'A1');
    let address = world.arena.contract_address;
    let alice: felt252 = ALICE().into();
    let attack = world.arena.attack(ALICE());
    assert(raw(address, selector!("owner")) == OWNER().into(), 'Pin: owner');
    assert(
        raw(address, selector!("matchmaker")) == world.matchmaker.contract_address.into(),
        'Pin: matchmaker',
    );
    assert(
        raw(address, selector!("village")) == world.village.contract_address.into(), 'Pin: village',
    );
    assert(raw(address, selector!("story")) == world.story.contract_address.into(), 'Pin: story');
    assert(raw(address, selector!("vrf_provider")) == world.provider.into(), 'Pin: vrf_provider');
    let word: u256 = raw_entry(address, selector!("attacks"), array![alice]).into();
    assert(word.low & 0xffffffffff == 1 + 0x100000000, 'Pin: attacks');
    assert(word.high & 0xffffffffffffffff == attack.started_at.into(), 'Pin: attacks high');
    assert(
        raw_entry(address, selector!("attack_defenders"), array![alice]) == BOB().into(),
        'Pin: attack_defenders',
    );
    // Deckable: 2 tiles, 2 drawn, the second in hand
    let deck: u256 = raw_entry(address, selector!("deck_states"), array![alice, 1]).into();
    assert(deck.low == 2 + 2 * 0x100 + 17 * 0x10000, 'Pin: deck_states');
    assert(
        raw_entry(address, selector!("deck_plans"), array![alice, 1, 0]) == 17 + 17 * 0x100,
        'Pin: deck_plans',
    );
    // Recordable: one move
    assert(
        raw_entry(address, selector!("record_sizes"), array![alice, 1]) == 1, 'Pin: record_sizes',
    );
    let move: felt252 = 17
        + 1 * 0x10000
        + at(1).into() * 0x100000000
        + at(0).into() * 0x10000000000000000;
    assert(
        raw_entry(address, selector!("record_moves"), array![alice, 1, 0]) == move,
        'Pin: record_moves',
    );
    // The hold, in `Matchmaker`'s `CrownableComponent`
    let cost: felt252 = cost_of(1000, 1000).into();
    assert(
        raw_entry(
            world.matchmaker.contract_address, selector!("crown_holds"), array![alice],
        ) == cost,
        'Pin: crown_holds',
    );
    start_cheat_caller_address(address, OWNER());
    world.admin.set_npc_level(3, 1, 2);
    assert(
        raw_entry(address, selector!("npc_levels"), array![3]) == 1 + 2 * 0x100, 'Pin: npc_levels',
    );
}

// The pieces alone

type Crowns = CrownableComponent::ComponentState<Matchmaker::ContractState>;
type Decks = DeckableComponent::ComponentState<Arena::ContractState>;
type Records = RecordableComponent::ComponentState<Arena::ContractState>;

fn village_at(id: u32) -> ContractAddress {
    let address: felt252 = 0x1000 + id.into();
    address.try_into().unwrap()
}

#[test]
fn test_hold_takes_at_most_the_count() {
    let mut crowns: Crowns = CrownableComponent::component_state_for_testing();
    let a = village_at(1);
    crowns.set(a, 12);
    assert_eq!(crowns.hold(a, 20), 0);
    assert_eq!(crowns.held_of(a), 12);
    assert_eq!(crowns.release(a), 12);
    assert_eq!(crowns.held_of(a), 0);
    // Nothing to hold, nothing held
    let b = village_at(2);
    assert_eq!(crowns.hold(b, 20), 0);
    assert_eq!(crowns.held_of(b), 0);
    assert_eq!(crowns.release(b), 0);
}

#[test]
#[should_panic(expected: 'Crowns: already held')]
fn test_hold_twice_fails() {
    let mut crowns: Crowns = CrownableComponent::component_state_for_testing();
    let a = village_at(1);
    crowns.set(a, 100);
    crowns.hold(a, 20);
    crowns.hold(a, 20);
}

/// The hold changes no settlement: holding the cost at the start, giving it back, then settling is
/// the settlement of #639 at every count, stars and terms; crowns stay conserved between players.
#[test]
#[fuzzer(runs: 64, seed: 643)]
fn test_hold_then_settle_is_the_settlement(attacker: u32, defender: u32, terms: u32, stars: u8) {
    let mut crowns: Crowns = CrownableComponent::component_state_for_testing();
    let a = village_at(1);
    let d = village_at(2);
    let offer: u8 = (terms % 59 + 1).try_into().unwrap();
    let cost: u8 = ((terms / 59) % 40).try_into().unwrap();
    let stars = stars % 4;
    crowns.set(a, attacker);
    crowns.set(d, defender);
    let during = crowns.hold(a, cost);
    assert(during + crowns.held_of(a) == attacker, 'Hold: not conserved');
    crowns.release(a);
    let outcome = crowns.settle(a, d, offer, cost, stars, false);
    assert(outcome == settle(attacker, defender, offer, cost, stars, false), 'Hold: settlement');
    let before: u64 = attacker.into() + defender.into();
    let after: u64 = crowns.crowns_of(a).into() + crowns.crowns_of(d).into();
    assert(before == after, 'Hold: crowns not conserved');
}

#[test]
fn test_deck_draws_every_tile_once() {
    let mut decks: Decks = DeckableComponent::component_state_for_testing();
    let a = village_at(1);
    let plans: Array<u8> = array![
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 1, 2, 3, 4, 5, 6, 7, 8,
        9, 10, 11, 12, 13, 14,
    ];
    decks.load(a, 1, plans.span());
    let mut counts: Felt252Dict<u8> = Default::default();
    let mut n: felt252 = 0;
    while decks.left(a, 1) != 0 {
        let plan = decks.draw(a, 1, n * 7919 + 13);
        assert_eq!(decks.take(a, 1), plan);
        counts.insert(plan.into(), counts.get(plan.into()) + 1);
        n += 1;
    }
    assert_eq!(n, 33);
    let deck = decks.deck_of(a, 1);
    assert_eq!(deck, Deck { size: 33, drawn: 33, hand: 0, bitmap: 0x1ffffffff });
    let mut plan: felt252 = 1;
    while plan != 20 {
        let expected = if plan == 15 || plan == 16 || plan == 17 || plan == 18 || plan == 19 {
            1
        } else {
            2
        };
        assert_eq!(counts.get(plan), expected);
        plan += 1;
    }
}

/// Every random sequence draws each tile of a full deck (99) exactly once.
#[test]
#[fuzzer(runs: 8, seed: 643)]
fn test_deck_fuzz_full_deck(seed: felt252) {
    let mut decks: Decks = DeckableComponent::component_state_for_testing();
    let a = village_at(1);
    let mut plans: Array<u8> = array![];
    let mut i: u32 = 0;
    while i < 99 {
        plans.append((i % 19 + 1).try_into().unwrap());
        i += 1;
    }
    decks.load(a, 1, plans.span());
    let mut n: felt252 = 0;
    while decks.left(a, 1) != 0 {
        decks.draw(a, 1, poseidon_hash_span(array![seed, n].span()));
        decks.take(a, 1);
        n += 1;
    }
    let deck = decks.deck_of(a, 1);
    assert_eq!((deck.size, deck.drawn), (99, 99));
    assert(deck.bitmap == 0x7ffffffffffffffffffffffff, 'Deck: not every tile once');
}

#[test]
#[should_panic(expected: 'Deck: tile in hand')]
fn test_deck_draw_with_a_tile_in_hand_fails() {
    let mut decks: Decks = DeckableComponent::component_state_for_testing();
    let a = village_at(1);
    decks.load(a, 1, array![1, 2].span());
    decks.draw(a, 1, 1);
    decks.draw(a, 1, 2);
}

#[test]
#[should_panic(expected: 'Deck: invalid size')]
fn test_deck_of_100_fails() {
    let mut decks: Decks = DeckableComponent::component_state_for_testing();
    let mut plans: Array<u8> = array![];
    let mut i: u32 = 0;
    while i < 100 {
        plans.append(1);
        i += 1;
    }
    decks.load(village_at(1), 1, plans.span());
}

#[test]
fn test_record_round_trips() {
    let mut records: Records = RecordableComponent::component_state_for_testing();
    let a = village_at(1);
    let built = AttackMove { plan: 19, discard: false, orientation: 4, x: 0xfffffffe, y: 1 };
    let dropped = AttackMove { plan: 3, discard: true, orientation: 0, x: 0, y: 0 };
    assert_eq!(records.append(a, 5, built), 0);
    assert_eq!(records.append(a, 5, dropped), 1);
    assert_eq!(records.moves_of(a, 5), array![built, dropped]);
    assert_eq!(records.size_of(a, 4), 0);
}

// Gas: the L2 gas of each call alone

/// Bob's village of 38 stops (`SFRFRFRFR`): the 6 cells of the start a stop fits (not north or
/// south of the starter), then 32 parcels in three rows east and west of it. The cells, in an
/// order where each has a placed side neighbour.
fn big_village_cells() -> Array<(i32, i32)> {
    let mut cells: Array<(i32, i32)> = array![(1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)];
    let mut x: i32 = 2;
    while x <= 6 {
        cells.append((x, 0));
        cells.append((x, 1));
        cells.append((x, -1));
        x += 1;
    }
    let mut x: i32 = -2;
    while x >= -7 {
        cells.append((x, 0));
        cells.append((x, 1));
        if cells.len() < 38 {
            cells.append((x, -1));
        }
        x -= 1;
    }
    cells
}

fn big_duel() -> World {
    let world = duel(1000);
    fund(world, BOB(), 1_000_000_000, 100);
    let cells = big_village_cells();
    let mut i = 0;
    while i < cells.len() {
        let (x, y) = *cells.at(i);
        if i >= 2 {
            if x < -1 || x > 1 {
                buy(world, BOB(), x, y);
            }
            place(world, BOB(), 17, 1, x, y);
        }
        i += 1;
    }
    assert_eq!(world.village.village(BOB().into()).tiles, 38);
    search(world, ALICE(), 'S1');
    world
}

#[test]
fn test_arena_gas_start_and_play() {
    let world = big_duel();
    tx('A0');
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    let before = get_available_gas();
    world.arena.start();
    let start_gas = before - get_available_gas();
    println!("GAS arena_start_38: {}", start_gas);
    assert(start_gas <= CEILING_START, 'Gas: start above ceiling');
    tx('A1');
    let before = get_available_gas();
    world.arena.play(false, 1, at(1), at(0));
    let play_gas = before - get_available_gas();
    println!("GAS arena_play: {}", play_gas);
    assert(play_gas <= CEILING_PLAY, 'Gas: play above ceiling');
}

/// The last move of a 38-tile attack: its check, the replay of the 38 moves, the stars and the
/// settlement in `Matchmaker` (with `Setup`'s report and the reward's grant).
#[test]
fn test_arena_gas_finish_38() {
    let world = big_duel();
    start(world, 'A0');
    let cells = big_village_cells();
    let mut i = 0;
    let mut gas = 0;
    while i < cells.len() {
        let (x, y) = *cells.at(i);
        tx(i.into() + 1);
        start_cheat_caller_address(world.arena.contract_address, ALICE());
        let before = get_available_gas();
        world.arena.play(false, 1, at(x), at(y));
        gas = before - get_available_gas();
        i += 1;
    }
    let attack = world.arena.attack(ALICE());
    assert_eq!(attack.status, STATUS_FINISHED);
    assert_eq!(attack.score, attack.target);
    assert_eq!(attack.stars, stars_of(attack.score, attack.target));
    println!("GAS arena_finish_38: {}", gas);
    assert(gas <= CEILING_FINISH_38, 'Gas: finish above ceiling');
}

#[test]
fn test_arena_gas_surrender() {
    let world = started();
    start_cheat_caller_address(world.arena.contract_address, ALICE());
    let before = get_available_gas();
    world.arena.surrender();
    let gas = before - get_available_gas();
    println!("GAS arena_surrender: {}", gas);
    assert(gas <= CEILING_SURRENDER, 'Gas: surrender above ceiling');
}
