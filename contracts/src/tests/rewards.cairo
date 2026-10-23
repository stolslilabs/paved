//! The village rewards and the tiers (`systems/rewards.cairo`,
//! `docs/architecture/village-rewards.md`, #642): the grant through `Setup` under the daily cap,
//! the offer drawn by the VRF from the base deck, the claim (placed in the village, merged as a
//! copy, or taken as Cobbles), the tiers, the skins reserved to a tier, access, the storage pins,
//! and a fuzz of the ledger's invariants.
//!
//! The VRF component refuses a second draw in one transaction by its hash, so each `open_reward`
//! below runs under its own cheated hash (`with_tx`).

use core::poseidon::poseidon_hash_span;
use core::testing::get_available_gas;
use paved::constants::CENTER;
use paved::mocks::vrf::MockVrfProvider::MOCK_TAG;
use paved::systems::rewards::Rewards::{
    Event as RewardsEvent, RewardClaimed, RewardGranted, RewardOpened,
};
use paved::systems::rewards::{
    CHOICE_COBBLES, CHOICE_MERGE, CHOICE_PLACE, DAILY_CAP, IRewardsAdminDispatcher,
    IRewardsAdminDispatcherTrait, IRewardsDispatcher, IRewardsDispatcherTrait, REWARD_COBBLES,
    REWARD_KIND, RewardGrants, RewardOffer, SOURCE_CHALLENGE, SOURCE_PVP, SOURCE_STORY, offer_plans,
    tier_of,
};
use paved::systems::setup::Setup::{CobblesClaimed, Event as SetupEvent};
use paved::systems::setup::{
    CLAIM_REWARD, ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupDispatcher,
    ISetupDispatcherTrait, ISetupLeagueDispatcher, ISetupLeagueDispatcherTrait,
    ISetupRewardsDispatcher, ISetupRewardsDispatcherTrait, ISetupSkinsDispatcher,
    ISetupSkinsDispatcherTrait, ISetupStoryDispatcher, ISetupStoryDispatcherTrait,
};
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

// Ceilings of the L2 gas of each new call (the test profile, `test_rewards_gas_*`): the figure
// measured on the VPS (snforge 0.64.0) + 5 %, rounded up.
pub const CEILING_GRANT: u128 = 487266;
pub const CEILING_REPORT_WITH_GRANT: u128 = 871534;
pub const CEILING_OPEN: u128 = 1431794;
pub const CEILING_CLAIM_COBBLES: u128 = 943551;
pub const CEILING_CLAIM_MERGE: u128 = 563695;
pub const CEILING_CLAIM_PLACE: u128 = 4963999;
pub const CEILING_SET_SKIN_TIER: u128 = 308438;
pub const CEILING_BUY_GATED_SKIN: u128 = 1048020;

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

/// A mode system that reports to `Setup` (as `Challenge`, `Story` and `Matchmaker` do).
fn REPORTER() -> ContractAddress {
    'REPORTER'.try_into().unwrap()
}

fn ANYONE() -> ContractAddress {
    'ANYONE'.try_into().unwrap()
}

#[derive(Copy, Drop)]
struct World {
    rewards: IRewardsDispatcher,
    admin: IRewardsAdminDispatcher,
    setup: ContractAddress,
    village: IVillageDispatcher,
    provider: ContractAddress,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `Setup`, `Village`, the VRF mock and `Rewards`, wired as the deployment will: `Rewards` a
/// granter-allowed reporter of `Setup` and a placer of `Village`, `Setup` a granter of `Rewards`
/// and set on it; `REPORTER` a reporter of `Setup`; the player's village founded.
fn world() -> World {
    let setup = deploy("Setup", array![OWNER().into()]);
    let village = deploy("Village", array![OWNER().into(), setup.into(), 38]);
    let provider = deploy("MockVrfProvider", array![]);
    let rewards = deploy(
        "Rewards",
        array![OWNER().into(), setup.into(), village.into(), provider.into(), DAILY_CAP.into()],
    );
    let world = World {
        rewards: IRewardsDispatcher { contract_address: rewards },
        admin: IRewardsAdminDispatcher { contract_address: rewards },
        setup,
        village: IVillageDispatcher { contract_address: village },
        provider,
    };
    start_cheat_caller_address(rewards, OWNER());
    world.admin.set_granter(setup, true);
    stop_cheat_caller_address(rewards);
    start_cheat_caller_address(setup, OWNER());
    ISetupDispatcher { contract_address: setup }.set_reporter(rewards, true);
    ISetupDispatcher { contract_address: setup }.set_reporter(REPORTER(), true);
    ISetupRewardsDispatcher { contract_address: setup }.set_rewards(rewards);
    stop_cheat_caller_address(setup);
    start_cheat_caller_address(village, OWNER());
    IVillageAdminDispatcher { contract_address: village }.set_placer(rewards, true);
    stop_cheat_caller_address(village);
    start_cheat_caller_address(village, PLAYER());
    world.village.found();
    stop_cheat_caller_address(village);
    world
}

/// A Challenge game over of `PLAYER`, as `Challenge.finish` reports it (a free game: no quest).
fn game_over(world: World) {
    start_cheat_caller_address(world.setup, REPORTER());
    ISetupDispatcher { contract_address: world.setup }
        .report(PLAYER().into(), array![].span(), array![].span());
    stop_cheat_caller_address(world.setup);
}

/// Runs what follows in the transaction `tx`.
fn with_tx(tx: felt252) {
    start_cheat_transaction_hash_global(tx);
}

/// Opens `PLAYER`'s next reward in the transaction `tx`.
fn open(world: World, tx: felt252) -> RewardOffer {
    with_tx(tx);
    start_cheat_caller_address(world.rewards.contract_address, PLAYER());
    let offer = world.rewards.open_reward();
    stop_cheat_caller_address(world.rewards.contract_address);
    offer
}

fn claim(world: World, choice: u8, slot: u8, orientation: u8, x: u32, y: u32) -> u32 {
    start_cheat_caller_address(world.rewards.contract_address, PLAYER());
    let copies = world.rewards.claim_reward(choice, slot, orientation, x, y);
    stop_cheat_caller_address(world.rewards.contract_address);
    copies
}

/// Writes `PLAYER`'s open offer: the plans of the three slots, index `index`.
fn set_offer(world: World, index: u32, plans: (u8, u8, u8)) {
    let (a, b, c) = plans;
    let slot = map_entry_address(selector!("offers"), array![PLAYER().into()].span());
    let word: felt252 = a.into() + b.into() * 0x100 + c.into() * 0x10000 + index.into() * 0x1000000;
    store(world.rewards.contract_address, slot, array![word].span());
}

/// What the mock's first consume of a transaction gives `consumer` for `salt`.
fn mock_random(salt: felt252, consumer: ContractAddress) -> felt252 {
    let chain_id = starknet::get_tx_info().unbox().chain_id;
    let seed = poseidon_hash_span(array![salt, consumer.into(), chain_id].span());
    let random = poseidon_hash_span(array![seed, MOCK_TAG].span());
    poseidon_hash_span(array![random, 0].span())
}

fn cobbles_of(world: World) -> u64 {
    ISetupCobblesDispatcher { contract_address: world.setup }.account(PLAYER().into()).cobbles
}

// The tier

#[test]
fn test_rewards_tier_is_floor_of_log2() {
    assert_eq!(tier_of(0), 0);
    assert_eq!(tier_of(1), 0);
    assert_eq!(tier_of(2), 1);
    assert_eq!(tier_of(3), 1);
    assert_eq!(tier_of(4), 2);
    assert_eq!(tier_of(7), 2);
    assert_eq!(tier_of(8), 3);
    assert_eq!(tier_of(16), 4);
    assert_eq!(tier_of(31), 4);
    assert_eq!(tier_of(32), 5);
    assert_eq!(tier_of(0xffffffff), 31);
}

// The offer's plans: three lanes of 64 bits, each a draw of the base deck's 72 tiles

#[test]
fn test_rewards_offer_follows_the_base_deck() {
    // Lane values 0 to 71 cover the deck once: each plan as often as the deck holds it.
    let mut counts: Array<u32> = array![];
    let mut plan: u8 = 0;
    while plan <= 19 {
        let mut count: u32 = 0;
        let mut index: u128 = 0;
        while index < 72 {
            let (a, _, _) = offer_plans(index.into());
            if a == plan {
                count += 1;
            }
            index += 1;
        }
        counts.append(count);
        plan += 1;
    }
    // Plan codes 1 to 19 in `Plan` order; the base deck's counts (`elements/decks/base.cairo`)
    let expected: Array<u32> = array![0, 1, 4, 3, 3, 3, 2, 5, 5, 4, 8, 5, 3, 9, 3, 3, 4, 1, 4, 2];
    let mut total: u32 = 0;
    for count in counts.span() {
        total += *count;
    }
    assert_eq!(total, 72);
    assert_eq!(counts.span(), expected.span());
}

#[test]
fn test_rewards_offer_lanes_are_independent() {
    let lane: felt252 = 0x10000000000000000;
    let high: felt252 = 0x100000000000000000000000000000000;
    // Lane 1: 0 (the full city); lane 2: 13 (index 13); lane 3: 71 (the last tile)
    let random = 0 + 13 * lane + 71 * high;
    let (a, b, c) = offer_plans(random);
    let (a0, _, _) = offer_plans(0);
    let (b0, _, _) = offer_plans(13);
    let (c0, _, _) = offer_plans(71);
    assert_eq!((a, b, c), (a0, b0, c0));
}

#[test]
#[fuzzer(runs: 64, seed: 642)]
fn test_rewards_offer_plans_are_valid(random: felt252) {
    let (a, b, c) = offer_plans(random);
    assert!(a >= 1 && a <= 19 && b >= 1 && b <= 19 && c >= 1 && c <= 19);
}

// The grant

#[test]
fn test_rewards_a_game_over_grants_a_reward() {
    let world = world();
    let mut spy = spy_events();
    start_cheat_block_timestamp_global(5 * 86400 + 7);
    game_over(world);
    assert_eq!(
        world.rewards.grants(PLAYER().into()),
        RewardGrants { day: 5, today: 1, pending: 1, opened: 0 },
    );
    spy
        .assert_emitted(
            @array![
                (
                    world.rewards.contract_address,
                    RewardsEvent::RewardGranted(
                        RewardGranted {
                            player_id: PLAYER().into(),
                            source: SOURCE_CHALLENGE,
                            day: 5,
                            today: 1,
                            pending: 1,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn test_rewards_a_story_star_and_an_attack_grant() {
    let world = world();
    let mut spy = spy_events();
    start_cheat_caller_address(world.setup, REPORTER());
    ISetupStoryDispatcher { contract_address: world.setup }
        .credit_story(PLAYER().into(), 1, 1, 0, 2);
    ISetupLeagueDispatcher { contract_address: world.setup }.report_pvp(PLAYER().into(), 0);
    stop_cheat_caller_address(world.setup);
    assert_eq!(world.rewards.grants(PLAYER().into()).pending, 2);
    spy
        .assert_emitted(
            @array![
                (
                    world.rewards.contract_address,
                    RewardsEvent::RewardGranted(
                        RewardGranted {
                            player_id: PLAYER().into(),
                            source: SOURCE_STORY,
                            day: 0,
                            today: 1,
                            pending: 1,
                        },
                    ),
                ),
                (
                    world.rewards.contract_address,
                    RewardsEvent::RewardGranted(
                        RewardGranted {
                            player_id: PLAYER().into(),
                            source: SOURCE_PVP,
                            day: 0,
                            today: 2,
                            pending: 2,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn test_rewards_the_daily_cap_holds_and_resets_the_next_day() {
    let world = world();
    start_cheat_block_timestamp_global(86400);
    let mut i: u16 = 0;
    while i < DAILY_CAP {
        game_over(world);
        i += 1;
    }
    // At the cap the game over still goes through, granting nothing
    game_over(world);
    assert_eq!(
        world.rewards.grants(PLAYER().into()),
        RewardGrants { day: 1, today: DAILY_CAP, pending: DAILY_CAP.into(), opened: 0 },
    );
    // The grant itself says so
    start_cheat_caller_address(world.rewards.contract_address, world.setup);
    assert!(!world.rewards.grant(PLAYER().into(), SOURCE_CHALLENGE));
    stop_cheat_caller_address(world.rewards.contract_address);
    // The next day: none granted today, the pending ones kept
    start_cheat_block_timestamp_global(2 * 86400);
    assert_eq!(
        world.rewards.grants(PLAYER().into()),
        RewardGrants { day: 2, today: 0, pending: DAILY_CAP.into(), opened: 0 },
    );
    game_over(world);
    assert_eq!(world.rewards.grants(PLAYER().into()).pending, DAILY_CAP.into() + 1);
}

#[test]
fn test_rewards_the_owner_sets_the_cap() {
    let world = world();
    start_cheat_caller_address(world.rewards.contract_address, OWNER());
    world.admin.set_daily_cap(1);
    stop_cheat_caller_address(world.rewards.contract_address);
    assert_eq!(world.admin.daily_cap(), 1);
    game_over(world);
    game_over(world);
    assert_eq!(world.rewards.grants(PLAYER().into()).pending, 1);
}

#[test]
#[should_panic(expected: 'Rewards: invalid cap')]
fn test_rewards_a_cap_of_zero_is_refused() {
    let world = world();
    start_cheat_caller_address(world.rewards.contract_address, OWNER());
    world.admin.set_daily_cap(0);
}

#[test]
#[should_panic(expected: 'Rewards: not granter')]
fn test_rewards_only_a_granter_grants() {
    let world = world();
    start_cheat_caller_address(world.rewards.contract_address, ANYONE());
    world.rewards.grant(PLAYER().into(), SOURCE_CHALLENGE);
}

#[test]
fn test_rewards_no_rewards_set_grants_nothing() {
    let world = world();
    start_cheat_caller_address(world.setup, OWNER());
    ISetupRewardsDispatcher { contract_address: world.setup }.set_rewards(0.try_into().unwrap());
    stop_cheat_caller_address(world.setup);
    game_over(world);
    assert_eq!(world.rewards.grants(PLAYER().into()).pending, 0);
}

// The offer

#[test]
fn test_rewards_open_draws_three_tiles_from_the_vrf() {
    let world = world();
    game_over(world);
    let mut spy = spy_events();
    let offer = open(world, 'TX1');
    let random = mock_random(
        draw_salt(REWARD_KIND, PLAYER().into(), 0), world.rewards.contract_address,
    );
    let (plan_1, plan_2, plan_3) = offer_plans(random);
    assert_eq!(offer, RewardOffer { index: 0, plan_1, plan_2, plan_3 });
    assert_eq!(world.rewards.offer(PLAYER().into()), offer);
    assert_eq!(
        world.rewards.grants(PLAYER().into()),
        RewardGrants { day: 0, today: 1, pending: 0, opened: 1 },
    );
    spy
        .assert_emitted(
            @array![
                (
                    world.rewards.contract_address,
                    RewardsEvent::RewardOpened(
                        RewardOpened {
                            player_id: PLAYER().into(), index: 0, plan_1, plan_2, plan_3,
                        },
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Rewards: no reward')]
fn test_rewards_open_needs_a_reward() {
    let world = world();
    open(world, 'TX1');
}

#[test]
#[should_panic(expected: 'Rewards: offer open')]
fn test_rewards_one_offer_at_a_time() {
    let world = world();
    game_over(world);
    game_over(world);
    open(world, 'TX1');
    open(world, 'TX2');
}

#[test]
#[should_panic(expected: 'VRF: one draw per tx')]
fn test_rewards_one_draw_per_transaction() {
    let world = world();
    game_over(world);
    game_over(world);
    open(world, 'TX1');
    claim(world, CHOICE_COBBLES, 0, 0, 0, 0);
    open(world, 'TX1');
}

#[test]
fn test_rewards_each_offer_has_its_own_salt() {
    let world = world();
    game_over(world);
    game_over(world);
    open(world, 'TX1');
    claim(world, CHOICE_COBBLES, 0, 0, 0, 0);
    let offer = open(world, 'TX2');
    let random = mock_random(
        draw_salt(REWARD_KIND, PLAYER().into(), 1), world.rewards.contract_address,
    );
    let (plan_1, plan_2, plan_3) = offer_plans(random);
    assert_eq!(offer, RewardOffer { index: 1, plan_1, plan_2, plan_3 });
}

// The claim

#[test]
fn test_rewards_take_cobbles() {
    let world = world();
    game_over(world);
    open(world, 'TX1');
    let mut spy = spy_events();
    assert_eq!(claim(world, CHOICE_COBBLES, 0, 0, 0, 0), 0);
    assert_eq!(cobbles_of(world), REWARD_COBBLES.into());
    assert_eq!(world.rewards.offer(PLAYER().into()).plan_1, 0);
    spy
        .assert_emitted(
            @array![
                (
                    world.setup,
                    SetupEvent::CobblesClaimed(
                        CobblesClaimed {
                            player_id: PLAYER().into(),
                            kind: CLAIM_REWARD,
                            id: 0,
                            period: 0,
                            cobbles: REWARD_COBBLES,
                            balance: REWARD_COBBLES.into(),
                        },
                    ),
                ),
            ],
        );
    spy
        .assert_emitted(
            @array![
                (
                    world.rewards.contract_address,
                    RewardsEvent::RewardClaimed(
                        RewardClaimed {
                            player_id: PLAYER().into(),
                            index: 0,
                            choice: CHOICE_COBBLES,
                            plan: 0,
                            copies: 0,
                            tier: 0,
                            cobbles: REWARD_COBBLES,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn test_rewards_merge_adds_a_copy_and_raises_the_tier() {
    let world = world();
    let mut index: u32 = 0;
    while index < 4 {
        set_offer(world, index, (10, 3, 7));
        assert_eq!(claim(world, CHOICE_MERGE, 0, 0, 0, 0), index + 1);
        index += 1;
    }
    assert_eq!(world.rewards.tier(PLAYER().into(), 10), 2);
    assert_eq!(*world.rewards.copies(PLAYER().into()).at(9), 4);
    assert_eq!(world.rewards.copies(PLAYER().into()).len(), 19);
    // The slot chooses the plan
    set_offer(world, 4, (10, 3, 7));
    assert_eq!(claim(world, CHOICE_MERGE, 2, 0, 0, 0), 1);
    assert_eq!(world.rewards.tier(PLAYER().into(), 7), 0);
    assert_eq!(world.rewards.tier(PLAYER().into(), 0), 0);
    assert_eq!(world.rewards.tier(PLAYER().into(), 20), 0);
    // The village is not touched
    assert_eq!(world.village.village(PLAYER().into()).tiles, 0);
}

#[test]
fn test_rewards_place_builds_the_tile_and_counts_a_copy() {
    let world = world();
    set_offer(world, 0, (3, 10, 7));
    let mut spy = spy_events();
    assert_eq!(claim(world, CHOICE_PLACE, 1, 1, CENTER + 1, CENTER), 1);
    let tiles = world.village.tiles(PLAYER().into());
    assert_eq!(tiles.len(), 2);
    assert_eq!(*tiles.at(1).plan, 10);
    assert_eq!(world.rewards.tier(PLAYER().into(), 10), 0);
    assert_eq!(*world.rewards.copies(PLAYER().into()).at(9), 1);
    spy
        .assert_emitted(
            @array![
                (
                    world.rewards.contract_address,
                    RewardsEvent::RewardClaimed(
                        RewardClaimed {
                            player_id: PLAYER().into(),
                            index: 0,
                            choice: CHOICE_PLACE,
                            plan: 10,
                            copies: 1,
                            tier: 0,
                            cobbles: 0,
                        },
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'Village: cell not owned')]
fn test_rewards_place_keeps_the_territory_rule() {
    let world = world();
    set_offer(world, 0, (10, 10, 10));
    claim(world, CHOICE_PLACE, 0, 1, CENTER + 2, CENTER);
}

#[test]
#[should_panic(expected: 'Village: no village')]
fn test_rewards_place_needs_a_village() {
    let world = world();
    let slot = map_entry_address(selector!("villages"), array![PLAYER().into()].span());
    store(world.village.contract_address, slot, array![0].span());
    set_offer(world, 0, (10, 10, 10));
    claim(world, CHOICE_PLACE, 0, 1, CENTER + 1, CENTER);
}

#[test]
#[should_panic(expected: 'Rewards: no offer')]
fn test_rewards_claim_needs_an_offer() {
    let world = world();
    claim(world, CHOICE_COBBLES, 0, 0, 0, 0);
}

#[test]
#[should_panic(expected: 'Rewards: no offer')]
fn test_rewards_an_offer_is_claimed_once() {
    let world = world();
    set_offer(world, 0, (10, 10, 10));
    claim(world, CHOICE_MERGE, 0, 0, 0, 0);
    claim(world, CHOICE_MERGE, 0, 0, 0, 0);
}

#[test]
#[should_panic(expected: 'Rewards: invalid choice')]
fn test_rewards_an_unknown_choice_is_refused() {
    let world = world();
    set_offer(world, 0, (10, 10, 10));
    claim(world, 4, 0, 0, 0, 0);
}

#[test]
#[should_panic(expected: 'Rewards: invalid slot')]
fn test_rewards_a_fourth_slot_is_refused() {
    let world = world();
    set_offer(world, 0, (10, 10, 10));
    claim(world, CHOICE_MERGE, 3, 0, 0, 0);
}

#[test]
#[should_panic(expected: 'Quest: not reporter')]
fn test_rewards_only_a_reporter_credits_a_reward() {
    let world = world();
    start_cheat_caller_address(world.setup, ANYONE());
    ISetupRewardsDispatcher { contract_address: world.setup }.credit_reward(PLAYER().into(), 0, 5);
}

// Tier-gated skins

fn gated_skin(world: World, min_tier: u8) -> ISetupSkinsDispatcher {
    let skins = ISetupSkinsDispatcher { contract_address: world.setup };
    start_cheat_caller_address(world.setup, OWNER());
    skins.set_skin_price(4, 10, 50);
    skins.set_skin_tier(4, 10, min_tier);
    stop_cheat_caller_address(world.setup);
    let slot = map_entry_address(selector!("accounts"), array![PLAYER().into()].span());
    store(world.setup, slot, array![100].span());
    skins
}

#[test]
#[should_panic(expected: 'Setup: tier too low')]
fn test_rewards_a_reserved_skin_needs_its_tier() {
    let world = world();
    let skins = gated_skin(world, 1);
    set_offer(world, 0, (10, 10, 10));
    claim(world, CHOICE_MERGE, 0, 0, 0, 0);
    start_cheat_caller_address(world.setup, PLAYER());
    skins.buy_skin(4, 10);
}

#[test]
fn test_rewards_a_reserved_skin_is_sold_at_its_tier() {
    let world = world();
    let skins = gated_skin(world, 1);
    assert_eq!(skins.skin_tier(4, 10), 1);
    set_offer(world, 0, (10, 10, 10));
    claim(world, CHOICE_MERGE, 0, 0, 0, 0);
    set_offer(world, 1, (10, 10, 10));
    claim(world, CHOICE_MERGE, 0, 0, 0, 0);
    start_cheat_caller_address(world.setup, PLAYER());
    skins.buy_skin(4, 10);
    assert_eq!(skins.skins(PLAYER().into(), 4), 1_u32 * 0x400);
}

#[test]
#[should_panic(expected: 'Setup: tier too low')]
fn test_rewards_a_reserved_skin_without_rewards_is_not_sold() {
    let world = world();
    let skins = gated_skin(world, 1);
    start_cheat_caller_address(world.setup, OWNER());
    ISetupRewardsDispatcher { contract_address: world.setup }.set_rewards(0.try_into().unwrap());
    stop_cheat_caller_address(world.setup);
    start_cheat_caller_address(world.setup, PLAYER());
    skins.buy_skin(4, 10);
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_rewards_only_the_owner_reserves_a_skin() {
    let world = world();
    start_cheat_caller_address(world.setup, ANYONE());
    ISetupSkinsDispatcher { contract_address: world.setup }.set_skin_tier(4, 10, 1);
}

// Access

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_rewards_only_the_owner_sets_a_granter() {
    let world = world();
    start_cheat_caller_address(world.rewards.contract_address, ANYONE());
    world.admin.set_granter(ANYONE(), true);
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_rewards_only_the_owner_sets_the_rewards_of_setup() {
    let world = world();
    start_cheat_caller_address(world.setup, ANYONE());
    ISetupRewardsDispatcher { contract_address: world.setup }.set_rewards(ANYONE());
}

#[test]
fn test_rewards_admin_views() {
    let world = world();
    assert_eq!(world.admin.setup(), world.setup);
    assert_eq!(world.admin.village(), world.village.contract_address);
    assert!(world.admin.is_granter(world.setup));
    assert!(!world.admin.is_granter(ANYONE()));
    assert_eq!(
        ISetupRewardsDispatcher { contract_address: world.setup }.rewards(),
        world.rewards.contract_address,
    );
}

// Storage pins (`docs/architecture/upgrades.md`): each variable at the raw address of its name.

fn raw(contract: ContractAddress, address: felt252) -> felt252 {
    *load(contract, address, 1).at(0)
}

#[test]
fn test_rewards_pins_its_storage_variables_by_name() {
    let world = world();
    let rewards = world.rewards.contract_address;
    assert_eq!(raw(rewards, selector!("owner")), OWNER().into());
    assert_eq!(raw(rewards, selector!("setup")), world.setup.into());
    assert_eq!(raw(rewards, selector!("village")), world.village.contract_address.into());
    assert_eq!(raw(rewards, selector!("vrf_provider")), world.provider.into());
    assert_eq!(raw(rewards, selector!("daily_cap")), DAILY_CAP.into());
    assert_eq!(
        raw(rewards, map_entry_address(selector!("granters"), array![world.setup.into()].span())),
        1,
    );
    // `grants`: day [0, 32) · today [32, 48) · pending [48, 80) · opened [80, 112)
    start_cheat_block_timestamp_global(3 * 86400);
    game_over(world);
    game_over(world);
    open(world, 'TX1');
    let grants = map_entry_address(selector!("grants"), array![PLAYER().into()].span());
    assert_eq!(
        raw(rewards, grants),
        3 + 2 * 0x100000000 + 1 * 0x1000000000000 + 1 * 0x100000000000000000000,
    );
    // `offers`: plan_1 [0, 8) · plan_2 [8, 16) · plan_3 [16, 24) · index [24, 56)
    set_offer(world, 1, (10, 3, 7));
    assert_eq!(
        world.rewards.offer(PLAYER().into()),
        RewardOffer { index: 1, plan_1: 10, plan_2: 3, plan_3: 7 },
    );
    claim(world, CHOICE_MERGE, 0, 0, 0, 0);
    let copies = map_entry_address(selector!("copies"), array![PLAYER().into(), 10].span());
    assert_eq!(raw(rewards, copies), 1);
    // `Setup`'s appended variables
    assert_eq!(raw(world.setup, selector!("rewards")), rewards.into());
    let skins = ISetupSkinsDispatcher { contract_address: world.setup };
    start_cheat_caller_address(world.setup, OWNER());
    skins.set_skin_tier(4, 10, 3);
    stop_cheat_caller_address(world.setup);
    assert_eq!(
        raw(world.setup, map_entry_address(selector!("skin_tiers"), array![4, 10].span())), 3,
    );
}

// The ledger's invariants, over a random sequence of games, opens and claims across days: every
// grant is within the day's cap; granted = pending + opened; each opened reward is claimed at most
// once, and the copies plus the Cobbles' claims equal the claims made.

#[test]
#[fuzzer(runs: 8, seed: 6420)]
fn test_rewards_fuzz_ledger(seed: u64) {
    let world = world();
    let mut state: u128 = seed.into();
    let mut granted: u32 = 0;
    let mut merged: u32 = 0;
    let mut sold: u32 = 0;
    let mut open_offer = false;
    let mut tx: felt252 = 1;
    let mut step: u32 = 0;
    let mut day: u64 = 1;
    let mut today: u16 = 0;
    start_cheat_block_timestamp_global(day * 86400);
    while step < 40 {
        state = (state * 6364136223846793005 + 1442695040888963407) % 0x10000000000000000;
        let pick = (state / 0x100000000) % 8;
        if pick < 4 {
            game_over(world);
            if today < DAILY_CAP {
                today += 1;
                granted += 1;
            }
        } else if pick == 4 {
            day += 1;
            today = 0;
            start_cheat_block_timestamp_global(day * 86400 + 5);
        } else if pick == 5 {
            if !open_offer && world.rewards.grants(PLAYER().into()).pending != 0 {
                tx += 1;
                open(world, tx);
                open_offer = true;
            }
        } else if open_offer {
            if pick == 6 {
                claim(world, CHOICE_MERGE, (state % 3).try_into().unwrap(), 0, 0, 0);
                merged += 1;
            } else {
                claim(world, CHOICE_COBBLES, 0, 0, 0, 0);
                sold += 1;
            }
            open_offer = false;
        }
        let grants = world.rewards.grants(PLAYER().into());
        assert!(grants.today <= DAILY_CAP);
        assert_eq!(grants.today, today);
        assert_eq!(grants.pending + grants.opened, granted);
        step += 1;
    }
    let mut copies: u32 = 0;
    for count in world.rewards.copies(PLAYER().into()) {
        copies += count;
    }
    assert_eq!(copies, merged);
    assert_eq!(cobbles_of(world), sold.into() * REWARD_COBBLES.into());
    let opened = world.rewards.grants(PLAYER().into()).opened;
    let claimed = merged + sold;
    assert_eq!(opened, claimed + if open_offer {
        1
    } else {
        0
    });
}

// Gas (the test profile): the L2 gas of each new call, against its ceiling.

fn report(name: ByteArray, gas: u128, ceiling: u128) {
    println!("gas {}: {}", name, gas);
    assert!(gas <= ceiling, "gas {} above its ceiling: {} > {}", name, gas, ceiling);
}

#[test]
fn test_rewards_gas_grant() {
    let world = world();
    game_over(world);
    start_cheat_caller_address(world.rewards.contract_address, world.setup);
    let before = get_available_gas();
    world.rewards.grant(PLAYER().into(), SOURCE_CHALLENGE);
    let after = get_available_gas();
    report("rewards_grant", before - after, CEILING_GRANT);
}

/// A free game's game over (no quest, no achievement entries) and its grant: the most `report`
/// can add with a reward.
#[test]
fn test_rewards_gas_report_with_grant() {
    let world = world();
    game_over(world);
    start_cheat_caller_address(world.setup, REPORTER());
    let setup = ISetupDispatcher { contract_address: world.setup };
    let before = get_available_gas();
    setup.report(PLAYER().into(), array![].span(), array![].span());
    let after = get_available_gas();
    report("rewards_report_with_grant", before - after, CEILING_REPORT_WITH_GRANT);
}

#[test]
fn test_rewards_gas_open() {
    let world = world();
    game_over(world);
    game_over(world);
    open(world, 'TX1');
    claim(world, CHOICE_COBBLES, 0, 0, 0, 0);
    with_tx('TX2');
    start_cheat_caller_address(world.rewards.contract_address, PLAYER());
    let before = get_available_gas();
    world.rewards.open_reward();
    let after = get_available_gas();
    report("rewards_open", before - after, CEILING_OPEN);
}

#[test]
fn test_rewards_gas_claim_cobbles() {
    let world = world();
    set_offer(world, 0, (10, 10, 10));
    start_cheat_caller_address(world.rewards.contract_address, PLAYER());
    let before = get_available_gas();
    world.rewards.claim_reward(CHOICE_COBBLES, 0, 0, 0, 0);
    let after = get_available_gas();
    report("rewards_claim_cobbles", before - after, CEILING_CLAIM_COBBLES);
}

#[test]
fn test_rewards_gas_claim_merge() {
    let world = world();
    set_offer(world, 0, (10, 10, 10));
    start_cheat_caller_address(world.rewards.contract_address, PLAYER());
    let before = get_available_gas();
    world.rewards.claim_reward(CHOICE_MERGE, 0, 0, 0, 0);
    let after = get_available_gas();
    report("rewards_claim_merge", before - after, CEILING_CLAIM_MERGE);
}

/// A tile that closes nothing (as `Village`'s `place_open`), through `Village.place`.
#[test]
fn test_rewards_gas_claim_place() {
    let world = world();
    set_offer(world, 0, (10, 10, 10));
    start_cheat_caller_address(world.rewards.contract_address, PLAYER());
    let before = get_available_gas();
    world.rewards.claim_reward(CHOICE_PLACE, 0, 1, CENTER + 1, CENTER);
    let after = get_available_gas();
    report("rewards_claim_place", before - after, CEILING_CLAIM_PLACE);
}

#[test]
fn test_rewards_gas_set_skin_tier() {
    let world = world();
    let skins = ISetupSkinsDispatcher { contract_address: world.setup };
    start_cheat_caller_address(world.setup, OWNER());
    let before = get_available_gas();
    skins.set_skin_tier(4, 10, 2);
    let after = get_available_gas();
    report("setup_set_skin_tier", before - after, CEILING_SET_SKIN_TIER);
}

/// `buy_skin` of a skin reserved to tier 1, its tier read on `Rewards`.
#[test]
fn test_rewards_gas_buy_gated_skin() {
    let world = world();
    let skins = gated_skin(world, 1);
    set_offer(world, 0, (10, 10, 10));
    claim(world, CHOICE_MERGE, 0, 0, 0, 0);
    set_offer(world, 1, (10, 10, 10));
    claim(world, CHOICE_MERGE, 0, 0, 0, 0);
    start_cheat_caller_address(world.setup, PLAYER());
    let before = get_available_gas();
    skins.buy_skin(4, 10);
    let after = get_available_gas();
    report("setup_buy_gated_skin", before - after, CEILING_BUY_GATED_SKIN);
}
