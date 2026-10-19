//! Story mode on chain (`systems/story.cairo`, `docs/architecture/story-mode.md`): the owner's
//! campaigns and levels, the runs a player submits, the stars and their cobbles paid by `Setup`.
//!
//! The levels of campaign 1 are three of the Tutorial plan (`docs/client/story-mode.md`): level 1
//! "First stone" (best 321), level 4 "The price of a discard" (788, with a discard) and level 10
//! "The monastery" (900, five tiles placed before the first draw), each replayed on its best line.
//! Campaign 2 has one level of 38 tiles (the Simple deck's played count) and campaign 3 one of the
//! whole deck (72 tiles): their decks and lines come from the client engine
//! (`packages/game-core/src/engine/game.ts`, deck `story`), a greedy line on a Simple draw and on a
//! shuffle of the base deck, and the score each line gets there is the one asserted here (a parity
//! check of the two engines on long decks).

use core::testing::get_available_gas;
use paved::constants::CENTER;
use paved::systems::setup::Setup::{CobblesClaimed, Event as SetupEvent};
use paved::systems::setup::{
    ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupDispatcher, ISetupDispatcherTrait,
    ISetupStoryDispatcher, ISetupStoryDispatcherTrait,
};
use paved::systems::story::Story::{Event as StoryEvent, RunSubmitted};
use paved::systems::story::{
    IStoryDispatcher, IStoryDispatcherTrait, IStorySetupDispatcher, IStorySetupDispatcherTrait,
    StoryCampaign, StoryMove, StoryTile, star_unit, stars_at, stars_of, stars_over,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

// Ceiling of the L2 gas of one `submit_run` of the 38-tile level (`test_story_gas_submit_38`), on
// the test profile: the figure measured on the VPS (160,534,980) + 5 %, rounded up.
pub const CEILING_SUBMIT_38: u128 = 168561729;

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn PLAYER() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

fn ANYONE() -> ContractAddress {
    'ANYONE'.try_into().unwrap()
}

#[derive(Copy, Drop)]
struct World {
    story: IStoryDispatcher,
    setup: ISetupDispatcher,
}

fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let class = declare(name).unwrap().contract_class();
    let (address, _) = class.deploy(@calldata).unwrap();
    address
}

/// `Setup` and `Story`, `Story` allowlisted as a reporter; no campaign yet.
fn world() -> World {
    let setup = deploy("Setup", array![OWNER().into()]);
    let story = deploy("Story", array![OWNER().into(), setup.into()]);
    let world = World {
        story: IStoryDispatcher { contract_address: story },
        setup: ISetupDispatcher { contract_address: setup },
    };
    start_cheat_caller_address(setup, OWNER());
    world.setup.set_reporter(story, true);
    stop_cheat_caller_address(setup);
    world
}

/// A coordinate relative to the starter, as the client plan writes them, in the game's.
fn at(d: i32) -> u32 {
    if d >= 0 {
        CENTER + d.try_into().unwrap()
    } else {
        CENTER - (-d).try_into().unwrap()
    }
}

/// The moves of a line written `(orientation, dx, dy)`, orientation 0 for a discard, as the client
/// sends them: `discard` set and zeros for a discard, the game's coordinates for a build.
fn moves(line: Array<(u8, i32, i32)>) -> Span<StoryMove> {
    let mut moves: Array<StoryMove> = array![];
    for (o, x, y) in line {
        if o == 0 {
            moves.append(StoryMove { discard: true, orientation: 0, x: 0, y: 0 });
        } else {
            moves.append(StoryMove { discard: false, orientation: o, x: at(x), y: at(y) });
        }
    }
    moves.span()
}

fn starter() -> StoryTile {
    // `RFFFRFCFR` facing South at the centre
    StoryTile { plan: 9, orientation: 3, x: CENTER, y: CENTER }
}

fn tile(plan: u8, o: u8, x: i32, y: i32) -> StoryTile {
    StoryTile { plan, orientation: o, x: at(x), y: at(y) }
}

// Plan codes (`types/plan.cairo`): 1 CCCCCCCCC, 3 CCCCCFRFC, 5 FFCFFFCFF, 7 FFFFCCCFF,
// 13 RFRFFFFFR, 14 RFRFRFCFF, 17 SFRFRFRFR, 18 WFFFFFFFF. Orientations: 1 North, 2 East,
// 3 South, 4 West.

/// Tutorial level 1, "First stone": a road of 3 closed by two crossroads, 321.
fn first_stone() -> (Array<u8>, Array<(u8, i32, i32)>) {
    (array![17, 17], array![(1, 1, 0), (1, -1, 0)])
}

/// Tutorial level 4, "The price of a discard": two cities of 2, one discard, 788.
fn price_of_a_discard() -> (Array<u8>, Array<(u8, i32, i32)>) {
    (array![5, 1, 14, 17], array![(1, 0, 1), (0, 0, 0), (1, 0, 2), (1, 1, 0)])
}

/// Tutorial level 10, "The monastery": the wonder and four neighbours placed; 900.
fn monastery() -> (Array<u8>, Array<StoryTile>, Array<(u8, i32, i32)>) {
    (
        array![5, 13, 3],
        array![
            tile(18, 1, 0, -1), tile(13, 2, -1, 0), tile(14, 4, 1, 0), tile(7, 2, -1, -1),
            tile(7, 1, 1, -1),
        ],
        array![(1, -1, -2), (3, 0, -2), (2, 1, -2)],
    )
}

/// deck_38: 37 drawn tiles after the starter, 36 built and 1 discarded; 5629 points.
pub fn deck_38_plans() -> Array<u8> {
    array![
        14, 9, 8, 1, 13, 7, 10, 13, 15, 13, 18, 16, 7, 2, 13, 7, 12, 12, 10, 12, 10, 15, 10, 16, 13,
        3, 16, 4, 10, 2, 17, 5, 13, 11, 4, 9, 5,
    ]
}

pub fn deck_38_moves() -> Array<(u8, i32, i32)> {
    array![
        (1, 0, 1), (1, 1, 0), (3, 1, -1), (0, 0, 0), (4, 0, -1), (2, -1, 1), (2, 0, 2), (1, 1, 1),
        (3, -1, 0), (1, 2, 0), (1, 2, -1), (2, 2, 1), (1, 1, -2), (1, -2, 1), (1, 0, -2),
        (3, -1, 2), (2, -1, -1), (4, -2, -1), (2, 0, 3), (3, 1, 2), (1, -2, 0), (1, -3, 0),
        (2, 3, 0), (3, -1, -2), (2, 3, -1), (1, -3, 1), (3, 2, 2), (1, 2, -2), (1, 0, -3),
        (3, 3, -2), (1, 0, 4), (1, 1, 3), (4, 3, 1), (4, 1, -3), (1, 2, -3), (3, -3, -1),
        (1, -1, 3),
    ]
}

/// deck_72: 71 drawn tiles after the starter, 71 built and 0 discarded; 16546 points.
pub fn deck_72_plans() -> Array<u8> {
    array![
        3, 10, 7, 13, 8, 5, 2, 9, 7, 16, 18, 10, 3, 9, 15, 8, 8, 13, 6, 10, 13, 3, 7, 10, 16, 11,
        13, 12, 11, 13, 4, 13, 13, 19, 7, 11, 10, 6, 13, 18, 15, 5, 8, 8, 11, 10, 15, 14, 11, 19,
        14, 10, 18, 16, 12, 16, 18, 2, 17, 7, 5, 9, 4, 1, 2, 10, 13, 4, 14, 12, 2,
    ]
}

pub fn deck_72_moves() -> Array<(u8, i32, i32)> {
    array![
        (2, 0, 1), (1, 1, 0), (1, 0, -1), (2, -1, 0), (1, 0, 2), (2, 1, 1), (3, 1, -1), (2, 2, 1),
        (3, 0, -2), (2, -1, 1), (1, -1, -1), (2, -2, 0), (1, 2, -1), (3, 0, 3), (1, 2, 0),
        (1, 0, 4), (3, 1, 2), (4, -1, 2), (2, 1, -2), (2, 2, 2), (2, 3, 1), (3, 2, -2), (1, 0, -3),
        (2, -2, 1), (2, 2, 3), (2, 3, -1), (1, -2, -1), (1, 1, 3), (3, -2, 2), (1, -3, 0),
        (1, -1, -2), (2, -1, 3), (4, 3, 0), (3, -3, -1), (1, -2, -2), (1, 4, 1), (1, 0, 5),
        (4, 1, -3), (3, 1, 4), (1, -1, -3), (3, 0, -4), (1, 2, -3), (3, 2, -4), (1, -2, 3),
        (3, 3, -2), (2, -1, 4), (4, -3, 2), (3, -2, -3), (4, 2, 4), (1, 4, -1), (3, 1, -4),
        (2, 3, 2), (1, -3, -2), (2, -1, 5), (4, 3, 3), (2, 4, 2), (1, -4, -1), (1, 5, 1),
        (1, 1, -5), (4, 4, 0), (2, 0, 6), (4, -1, 6), (1, 5, 0), (1, 2, 5), (2, 3, -4), (2, -3, 1),
        (2, 0, -5), (1, 3, 4), (2, 4, 3), (2, 1, 6), (1, 3, 5),
    ]
}

/// Campaign 1: three Tutorial levels; campaign 2: the 38-tile level (opens at 2 stars per level of
/// campaign 1); campaign 3: the whole deck (open to all: unlock average 0).
fn campaigns(world: World) {
    let story = world.story;
    start_cheat_caller_address(story.contract_address, OWNER());
    story.set_campaign(1, 3, 2);
    let (plans, _) = first_stone();
    story.set_level(1, 1, plans.span(), starter(), array![].span(), 321);
    let (plans, _) = price_of_a_discard();
    story.set_level(1, 2, plans.span(), starter(), array![].span(), 788);
    let (plans, placed, _) = monastery();
    story.set_level(1, 3, plans.span(), starter(), placed.span(), 900);
    story.set_campaign(2, 1, 2);
    story.set_level(2, 1, deck_38_plans().span(), starter(), array![].span(), 5629);
    story.set_campaign(3, 1, 0);
    story.set_level(3, 1, deck_72_plans().span(), starter(), array![].span(), 16546);
    stop_cheat_caller_address(story.contract_address);
}

fn submit(
    world: World,
    player: ContractAddress,
    campaign_id: u8,
    level_id: u8,
    line: Array<(u8, i32, i32)>,
) -> u8 {
    start_cheat_caller_address(world.story.contract_address, player);
    let stars = world.story.submit_run(campaign_id, level_id, moves(line));
    stop_cheat_caller_address(world.story.contract_address);
    stars
}

fn cobbles(world: World, player: ContractAddress) -> u64 {
    ISetupCobblesDispatcher { contract_address: world.setup.contract_address }
        .account(player.into())
        .cobbles
}

fn set_target(world: World, target: u32) {
    let (plans, _) = first_stone();
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_level(1, 1, plans.span(), starter(), array![].span(), target);
    stop_cheat_caller_address(world.story.contract_address);
}

/// The claim of star `star` of level 1 of campaign 1 (`id` 0x101).
fn claim(player_id: felt252, star: u8, cobbles: u8, balance: u64) -> SetupEvent {
    SetupEvent::CobblesClaimed(
        CobblesClaimed { player_id, kind: 3, id: 0x101, period: star.into(), cobbles, balance },
    )
}

// Stars

#[test]
fn test_story_stars_of() {
    assert(stars_of(0, 321) == 1, 'Story: 0 finishes');
    assert(stars_of(320, 321) == 2, 'Story: 99 % is 2');
    assert(stars_of(321, 321) == 3, 'Story: the target is 3');
    assert(stars_of(5000, 321) == 3, 'Story: above is 3');
    // 70 % of 458 is 320.6, rounded up 321; of 459, 321.3, rounded up 322
    assert(stars_of(321, 458) == 2, 'Story: at 70 % rounded up');
    assert(stars_of(321, 459) == 1, 'Story: under 70 % rounded up');
    assert(stars_of(7, 10) == 2, 'Story: exactly 70 %');
    assert(stars_of(6, 10) == 1, 'Story: 60 %');
}

#[test]
fn test_story_star_bits() {
    assert(star_unit(1) == 1, 'Story: unit of level 1');
    assert(star_unit(3) == 16, 'Story: unit of level 3');
    assert(star_unit(64) == 0x40000000000000000000000000000000, 'Story: unit of level 64');
    let word: u128 = 3 + 2 * 4 + 1 * 16;
    assert(stars_at(word, 1) == 3, 'Story: level 1');
    assert(stars_at(word, 2) == 2, 'Story: level 2');
    assert(stars_at(word, 3) == 1, 'Story: level 3');
    assert(stars_at(word, 4) == 0, 'Story: level 4');
    assert(stars_over(word, 3) == 6, 'Story: over 3 levels');
    assert(stars_over(word, 2) == 5, 'Story: over 2 levels');
    assert(stars_over(word, 1) == 3, 'Story: over 1 level');
    assert(stars_over(word, 0) == 0, 'Story: over no level');
    assert(stars_over(word, 64) == 6, 'Story: over 64 levels');
}

// Set-up

#[test]
fn test_story_set_up() {
    let world = world();
    campaigns(world);
    let story = world.story;
    assert(story.campaign(1) == StoryCampaign { level_count: 3, unlock_average: 2 }, 'Story: c1');
    assert(story.campaign(3) == StoryCampaign { level_count: 1, unlock_average: 0 }, 'Story: c3');
    assert(story.campaign(4) == StoryCampaign { level_count: 0, unlock_average: 0 }, 'Story: c4');
    let (plans, placed, _) = monastery();
    let level = story.level(1, 3);
    assert(level.plans == plans, 'Story: plans');
    assert(level.placed == placed, 'Story: placed');
    assert(level.starter == starter(), 'Story: starter');
    assert(level.target == 900, 'Story: target');
    // Several pages of plans read back in order
    assert(story.level(3, 1).plans == deck_72_plans(), 'Story: 72 plans');
    assert(story.level(2, 1).plans == deck_38_plans(), 'Story: 38 plans');
    let setup = IStorySetupDispatcher { contract_address: story.contract_address }.setup();
    assert(setup == world.setup.contract_address, 'Story: setup');
}

#[test]
#[should_panic(expected: ('Ownable: caller is not owner',))]
fn test_story_set_campaign_owner_only() {
    let world = world();
    start_cheat_caller_address(world.story.contract_address, ANYONE());
    world.story.set_campaign(1, 11, 2);
}

#[test]
#[should_panic(expected: ('Ownable: caller is not owner',))]
fn test_story_set_level_owner_only() {
    let world = world();
    campaigns(world);
    let (plans, _) = first_stone();
    start_cheat_caller_address(world.story.contract_address, ANYONE());
    world.story.set_level(1, 1, plans.span(), starter(), array![].span(), 1);
}

#[test]
#[should_panic(expected: ('Story: invalid campaign',))]
fn test_story_set_campaign_no_gap() {
    let world = world();
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_campaign(2, 11, 2);
}

#[test]
#[should_panic(expected: ('Story: invalid level count',))]
fn test_story_set_campaign_too_many_levels() {
    let world = world();
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_campaign(1, 65, 2);
}

#[test]
#[should_panic(expected: ('Story: invalid level',))]
fn test_story_set_level_beyond_its_campaign() {
    let world = world();
    campaigns(world);
    let (plans, _) = first_stone();
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_level(1, 4, plans.span(), starter(), array![].span(), 321);
}

#[test]
#[should_panic(expected: ('Story: invalid plan',))]
fn test_story_set_level_unknown_plan() {
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_level(1, 1, array![17, 20].span(), starter(), array![].span(), 321);
}

#[test]
#[should_panic(expected: ('Story: invalid tile',))]
fn test_story_set_level_placed_on_the_starter() {
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_level(1, 1, array![17].span(), starter(), array![tile(1, 1, 0, 0)].span(), 1);
}

#[test]
fn test_story_set_level_more_levels_later() {
    // The owner adds levels to a campaign: the count first, then the level
    let world = world();
    campaigns(world);
    let (plans, _) = first_stone();
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_campaign(1, 4, 2);
    world.story.set_level(1, 4, plans.span(), starter(), array![].span(), 321);
    stop_cheat_caller_address(world.story.contract_address);
    assert(world.story.level(1, 4).target == 321, 'Story: level 4 added');
}

// Runs

#[test]
fn test_story_submit_a_full_run() {
    let world = world();
    campaigns(world);
    let mut spy = spy_events();
    let (_, line) = first_stone();
    assert(submit(world, PLAYER(), 1, 1, line) == 3, 'Story: 3 stars');
    let player: felt252 = PLAYER().into();
    assert(world.story.best_score(player, 1, 1) == 321, 'Story: best score');
    assert(world.story.stars(player, 1, 1) == 3, 'Story: stars kept');
    let progress = world.story.progress(player, 1);
    assert(progress.stars == 3 && progress.total == 3, 'Story: progress');
    assert(cobbles(world, PLAYER()) == 30, 'Story: 5 + 10 + 15 cobbles');
    // One claim per star on the ledger, then the run
    let setup = world.setup.contract_address;
    spy
        .assert_emitted(
            @array![
                (setup, claim(player, 1, 5, 5)), (setup, claim(player, 2, 10, 15)),
                (setup, claim(player, 3, 15, 30)),
            ],
        );
    let run = StoryEvent::RunSubmitted(
        RunSubmitted {
            player_id: player,
            campaign_id: 1,
            level_id: 1,
            game_id: 1,
            score: 321,
            stars: 3,
            best_stars: 3,
            gained: 3,
            cobbles: 30,
        },
    );
    spy.assert_emitted(@array![(world.story.contract_address, run)]);
}

#[test]
fn test_story_submit_with_a_discard() {
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    let (_, line) = price_of_a_discard();
    assert(submit(world, PLAYER(), 1, 2, line) == 3, 'Story: 3 stars');
    assert(world.story.best_score(PLAYER().into(), 1, 2) == 788, 'Story: 788');
    assert(cobbles(world, PLAYER()) == 60, 'Story: 30 per level');
}

#[test]
fn test_story_submit_with_placed_tiles() {
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    let (_, line) = price_of_a_discard();
    submit(world, PLAYER(), 1, 2, line);
    let (_, _, line) = monastery();
    assert(submit(world, PLAYER(), 1, 3, line) == 3, 'Story: 3 stars');
    assert(world.story.best_score(PLAYER().into(), 1, 3) == 900, 'Story: the wonder');
    let progress = world.story.progress(PLAYER().into(), 1);
    assert(progress.stars == 3 + 3 * 4 + 3 * 16 && progress.total == 9, 'Story: 2 bits per level');
}

#[test]
#[should_panic(expected: ('Tile: no neighbors',))]
fn test_story_illegal_move_no_neighbour() {
    let world = world();
    campaigns(world);
    submit(world, PLAYER(), 1, 1, array![(1, 1, 0), (1, 5, 5)]);
}

#[test]
#[should_panic(expected: ('Tile: cannot place',))]
fn test_story_illegal_move_edges() {
    // A crossroads north of the starter: a road against its city
    let world = world();
    campaigns(world);
    submit(world, PLAYER(), 1, 1, array![(1, 1, 0), (1, 0, 1)]);
}

#[test]
#[should_panic(expected: ('Tile: already exists',))]
fn test_story_illegal_move_taken() {
    let world = world();
    campaigns(world);
    submit(world, PLAYER(), 1, 1, array![(1, 1, 0), (1, 1, 0)]);
}

#[test]
#[should_panic(expected: ('Story: invalid position',))]
fn test_story_illegal_move_position() {
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.story.contract_address, PLAYER());
    let moves = array![
        StoryMove { discard: false, orientation: 1, x: CENTER + 1, y: CENTER },
        StoryMove { discard: false, orientation: 1, x: 0, y: CENTER },
    ];
    world.story.submit_run(1, 1, moves.span());
}

#[test]
#[should_panic(expected: ('Story: invalid orientation',))]
fn test_story_illegal_move_orientation() {
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.story.contract_address, PLAYER());
    let moves = array![
        StoryMove { discard: false, orientation: 1, x: CENTER + 1, y: CENTER },
        StoryMove { discard: false, orientation: 5, x: CENTER - 1, y: CENTER },
    ];
    world.story.submit_run(1, 1, moves.span());
}

#[test]
fn test_story_discard_ignores_its_position() {
    // A discard is a discard whatever its other fields hold: the first tile thrown away, the
    // second closes nothing (a road of 2 left open): 1 star
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.story.contract_address, PLAYER());
    let moves = array![
        StoryMove { discard: true, orientation: 3, x: 0, y: 5 },
        StoryMove { discard: false, orientation: 1, x: CENTER + 1, y: CENTER },
    ];
    assert(world.story.submit_run(1, 1, moves.span()) == 1, 'Story: 1 star');
}

#[test]
#[should_panic(expected: ('Story: invalid moves',))]
fn test_story_run_not_finished() {
    let world = world();
    campaigns(world);
    submit(world, PLAYER(), 1, 1, array![(1, 1, 0)]);
}

#[test]
#[should_panic(expected: ('Story: invalid moves',))]
fn test_story_run_too_long() {
    let world = world();
    campaigns(world);
    submit(world, PLAYER(), 1, 1, array![(1, 1, 0), (1, -1, 0), (0, 0, 0)]);
}

#[test]
#[should_panic(expected: ('Story: invalid level',))]
fn test_story_no_such_level() {
    let world = world();
    campaigns(world);
    submit(world, PLAYER(), 1, 4, array![(1, 1, 0)]);
}

#[test]
#[should_panic(expected: ('Story: invalid campaign',))]
fn test_story_no_such_campaign() {
    let world = world();
    campaigns(world);
    submit(world, PLAYER(), 4, 1, array![(1, 1, 0)]);
}

#[test]
#[should_panic(expected: ('Story: no level',))]
fn test_story_level_not_set() {
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_campaign(3, 2, 0);
    stop_cheat_caller_address(world.story.contract_address);
    submit(world, PLAYER(), 3, 2, array![(1, 1, 0)]);
}

// Locks

#[test]
#[should_panic(expected: ('Story: level locked',))]
fn test_story_level_locked() {
    let world = world();
    campaigns(world);
    let (_, line) = price_of_a_discard();
    submit(world, PLAYER(), 1, 2, line);
}

#[test]
#[should_panic(expected: ('Story: level locked',))]
fn test_story_level_locked_for_another_player() {
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    let (_, line) = price_of_a_discard();
    submit(world, ANYONE(), 1, 2, line);
}

#[test]
#[should_panic(expected: ('Story: campaign locked',))]
fn test_story_campaign_locked() {
    // 3 stars over the 3 levels of campaign 1: 6 are needed
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    submit(world, PLAYER(), 2, 1, deck_38_moves());
}

#[test]
fn test_story_campaign_unlocked_on_stars() {
    // 6 stars over the 3 levels of campaign 1, level 3 not played: campaign 2 opens
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    let (_, line) = price_of_a_discard();
    submit(world, PLAYER(), 1, 2, line);
    assert(submit(world, PLAYER(), 2, 1, deck_38_moves()) == 3, 'Story: 3 stars');
    assert(world.story.best_score(PLAYER().into(), 2, 1) == 5629, 'Story: the client score');
    assert(cobbles(world, PLAYER()) == 90, 'Story: 3 levels of 30');
}

/// Campaign 1: level 1 at 1 star (its target raised to 459), level 2 at 3 stars: 4 stars held.
fn four_stars(world: World) {
    set_target(world, 459);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    set_target(world, 321);
    let (_, line) = price_of_a_discard();
    submit(world, PLAYER(), 1, 2, line);
}

#[test]
#[should_panic(expected: ('Story: campaign locked',))]
fn test_story_removed_level_stars_do_not_unlock() {
    // The owner cuts campaign 1 to its first level: 2 stars are needed over it, it holds 1 (the
    // 3 stars of the level removed do not count)
    let world = world();
    campaigns(world);
    four_stars(world);
    assert(world.story.progress(PLAYER().into(), 1).total == 4, 'Story: 4 stars held');
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_campaign(1, 1, 2);
    stop_cheat_caller_address(world.story.contract_address);
    submit(world, PLAYER(), 2, 1, deck_38_moves());
}

#[test]
fn test_story_open_campaign_stays_open_after_added_levels() {
    // Campaign 2 opened at 6 stars over 3 levels and its level 1 finished; the owner adds a level
    // to campaign 1 (8 stars needed now): the finished level 1 replays, a new player stays out
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    let (_, line) = price_of_a_discard();
    submit(world, PLAYER(), 1, 2, line);
    submit(world, PLAYER(), 2, 1, deck_38_moves());
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_campaign(1, 4, 2);
    stop_cheat_caller_address(world.story.contract_address);
    assert(submit(world, PLAYER(), 2, 1, deck_38_moves()) == 3, 'Story: replayed');
    assert(cobbles(world, PLAYER()) == 90, 'Story: nothing paid twice');
}

#[test]
#[should_panic(expected: ('Story: campaign locked',))]
fn test_story_added_levels_raise_the_bar_for_a_new_player() {
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    let (_, line) = price_of_a_discard();
    submit(world, PLAYER(), 1, 2, line);
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_campaign(1, 4, 2);
    stop_cheat_caller_address(world.story.contract_address);
    submit(world, PLAYER(), 2, 1, deck_38_moves());
}

// Stars, corrections, payments

#[test]
fn test_story_improvements_pay_the_new_stars_only() {
    let world = world();
    campaigns(world);
    let player: felt252 = PLAYER().into();
    // 321 against 459: under 70 % rounded up (322), 1 star, 5 cobbles
    set_target(world, 459);
    let (_, line) = first_stone();
    assert(submit(world, PLAYER(), 1, 1, line) == 1, 'Story: 1 star');
    assert(cobbles(world, PLAYER()) == 5, 'Story: 5');
    // The owner corrects the target to 458: 70 % rounded up is 321, 2 stars, the second paid
    set_target(world, 458);
    let (_, line) = first_stone();
    assert(submit(world, PLAYER(), 1, 1, line) == 2, 'Story: 2 stars');
    assert(cobbles(world, PLAYER()) == 15, 'Story: + 10');
    // To 321: 3 stars, the third paid
    set_target(world, 321);
    let mut spy = spy_events();
    let (_, line) = first_stone();
    assert(submit(world, PLAYER(), 1, 1, line) == 3, 'Story: 3 stars');
    assert(cobbles(world, PLAYER()) == 30, 'Story: + 15');
    let run = StoryEvent::RunSubmitted(
        RunSubmitted {
            player_id: player,
            campaign_id: 1,
            level_id: 1,
            game_id: 3,
            score: 321,
            stars: 3,
            best_stars: 3,
            gained: 1,
            cobbles: 15,
        },
    );
    spy.assert_emitted(@array![(world.story.contract_address, run)]);
    assert(world.story.progress(player, 1).total == 3, 'Story: 3 stars held');
}

#[test]
fn test_story_no_double_payment() {
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    let (_, line) = first_stone();
    assert(submit(world, PLAYER(), 1, 1, line) == 3, 'Story: 3 stars again');
    assert(cobbles(world, PLAYER()) == 30, 'Story: paid once');
    // A worse run keeps the best stars and score, and pays nothing
    set_target(world, 1000);
    let (_, line) = first_stone();
    assert(submit(world, PLAYER(), 1, 1, line) == 1, 'Story: 1 star now');
    assert(world.story.stars(PLAYER().into(), 1, 1) == 3, 'Story: best stars kept');
    assert(world.story.best_score(PLAYER().into(), 1, 1) == 321, 'Story: best score kept');
    assert(cobbles(world, PLAYER()) == 30, 'Story: nothing more');
    // Another player is paid on its own
    let (_, line) = first_stone();
    submit(world, ANYONE(), 1, 1, line);
    assert(cobbles(world, ANYONE()) == 5, 'Story: its own first star');
}

#[test]
fn test_story_level_corrected_deck() {
    // The owner replaces the deck of level 1: a run of the new deck is replayed on it
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_level(1, 1, array![17, 17, 17].span(), starter(), array![].span(), 600);
    stop_cheat_caller_address(world.story.contract_address);
    assert(world.story.level(1, 1).plans == array![17, 17, 17], 'Story: new deck');
    // The best line of the old deck, then a crossroads east of the first: a road of 2 more
    let stars = submit(world, PLAYER(), 1, 1, array![(1, 1, 0), (1, -1, 0), (1, 2, 0)]);
    let score = world.story.best_score(PLAYER().into(), 1, 1);
    assert(score > 321, 'Story: the third tile scores');
    assert(stars == stars_of(score, 600), 'Story: stars of the new target');
}

#[test]
#[should_panic(expected: ('Story: invalid moves',))]
fn test_story_level_corrected_old_run_refused() {
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.story.contract_address, OWNER());
    world.story.set_level(1, 1, array![17, 17, 17].span(), starter(), array![].span(), 600);
    stop_cheat_caller_address(world.story.contract_address);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
}

#[test]
#[should_panic(expected: ('Quest: not reporter',))]
fn test_story_credit_reporter_only() {
    let world = world();
    start_cheat_caller_address(world.setup.contract_address, ANYONE());
    ISetupStoryDispatcher { contract_address: world.setup.contract_address }
        .credit_story(ANYONE().into(), 1, 1, 0, 3);
}

#[test]
#[should_panic(expected: ('Setup: invalid stars',))]
fn test_story_credit_no_star() {
    let world = world();
    start_cheat_caller_address(world.setup.contract_address, world.story.contract_address);
    ISetupStoryDispatcher { contract_address: world.setup.contract_address }
        .credit_story(ANYONE().into(), 1, 1, 2, 2);
}

#[test]
#[should_panic(expected: ('Quest: not reporter',))]
fn test_story_run_unpaid_without_the_reporter() {
    // `Setup`'s owner revokes `Story`: a run that gains a star reverts (the emergency stop)
    let world = world();
    campaigns(world);
    start_cheat_caller_address(world.setup.contract_address, OWNER());
    world.setup.set_reporter(world.story.contract_address, false);
    stop_cheat_caller_address(world.setup.contract_address);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
}

#[test]
#[should_panic(expected: ('Ownable: caller is not owner',))]
fn test_story_set_setup_owner_only() {
    let world = world();
    start_cheat_caller_address(world.story.contract_address, ANYONE());
    IStorySetupDispatcher { contract_address: world.story.contract_address }.set_setup(ANYONE());
}

// Gas

/// The L2 gas of one `submit_run` of the 38-tile level (37 drawn, 36 built, 13 structures
/// scored), the setup and the levels before it excluded.
#[test]
fn test_story_gas_submit_38() {
    let world = world();
    campaigns(world);
    let (_, line) = first_stone();
    submit(world, PLAYER(), 1, 1, line);
    let (_, line) = price_of_a_discard();
    submit(world, PLAYER(), 1, 2, line);
    let moves = moves(deck_38_moves());
    start_cheat_caller_address(world.story.contract_address, PLAYER());
    let before = get_available_gas();
    world.story.submit_run(2, 1, moves);
    let gas = before - get_available_gas();
    println!("gas: submit_run of 38 tiles: {}", gas);
    assert(gas <= CEILING_SUBMIT_38, 'Story: gas of 38 tiles');
}

/// The whole deck, 72 tiles (71 drawn, all built): the gas of the largest level the plan allows,
/// and the score of the client engine.
#[test]
fn test_story_gas_submit_72() {
    let world = world();
    campaigns(world);
    let moves = moves(deck_72_moves());
    start_cheat_caller_address(world.story.contract_address, PLAYER());
    let before = get_available_gas();
    assert(world.story.submit_run(3, 1, moves) == 3, 'Story: 3 stars');
    let gas = before - get_available_gas();
    println!("gas: submit_run of 72 tiles: {}", gas);
    assert(world.story.best_score(PLAYER().into(), 3, 1) == 16546, 'Story: the client score');
}
