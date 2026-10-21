//! G7 profile: where the gas of a move goes (`docs/architecture/g7-gas-plan.md`). Ignored tests,
//! run by hand; they assert no ceiling and change no golden.
//!
//! - `replay_*`: the scenarios of `gas.cairo` (same seed, same forced plans), whose last move is
//!   replayed piece by piece in `Challenge`'s storage (`interact_with_state`), the gas read
//!   between the pieces. The replay is the code of `PlayableComponent::build` (and of `discard`,
//!   `surrender`, `Game::assess_with`, `assess_forest`, `spawn_with`) copied in order: what it
//!   leaves out is the entry point's dispatch, the position check of `Challenge.build` and
//!   `finish`, measured apart (`real_*` against `replay_*`).
//! - `prep_*` and `real_*`: the scenario without its last move, then with it through the
//!   dispatcher. The difference of their `--detailed-resources` is the syscalls of the last move.
//! - `units`: the unit costs (a storage read, a write, an event, a Poseidon, a dictionary access).
//! - `method`: why each piece runs in a loop (below).
//!
//! The method. Sierra charges the gas of straight-line code ahead of it, at the last loop turn or
//! function entry the solver picks, and refunds the unused part at branch merges: the available gas
//! read in the middle of a function is not a running counter (a call that reads one slot reads
//! 14,070 around it, a read costs 76,780). A loop whose number of turns is known only at run time
//! is charged turn by turn. So each piece runs in a loop of `once` turns, `once` being 1 and read
//! at run time, and each figure printed includes one empty turn (`once_overhead`, printed first),
//! which the plan subtracts.
//!
//! Run: `snforge test profile_g7 --ignored --detailed-resources --max-threads 2`.

use core::dict::{Felt252Dict, Felt252DictTrait};
use core::hash::HashStateTrait;
use core::num::traits::Zero;
use core::poseidon::PoseidonTrait;
use core::testing::get_available_gas;
use paved::components::payable::{
    IERC20Dispatcher as OzERC20Dispatcher, IERC20DispatcherTrait as OzERC20DispatcherTrait,
};
use paved::constants::{self, CENTER};
use paved::day::day_id;
use paved::events::{Built, Discarded, Event, GameSpawned, Scored, game_over};
use paved::helpers::multiplier::compute_multiplier;
use paved::models::builder::{BuilderAssert, BuilderImpl, ZeroableBuilderImpl};
use paved::models::game::{Game, GameAssert, GameImpl, ZeroableGame};
use paved::models::tile::{TileAssert, TileImpl, TilePositionAssert, ZeroableTile};
use paved::quests::{achievement_entries, decode, encode, quest_entries};
use paved::seed::{SeedSource, TokenSeed};
use paved::store::{Store, StoreImpl, StoreTrait};
use paved::structure::assessment::{score_generic, score_wonder};
use paved::structure::forest::scan;
use paved::structure::owners::Tally;
use paved::structure::placement::{self, Neighborhood, NeighborhoodTrait};
use paved::structure::record::{open_of, ref_of, size_of};
use paved::structure::state::{Structures, StructuresTrait};
use paved::structure::{oriented, tables};
use paved::systems::challenge::Challenge;
use paved::systems::challenge::Challenge::InternalTrait;
use paved::systems::collection::ICollectionDispatcherTrait;
use paved::systems::economy::IEconomyDispatcherTrait;
use paved::systems::setup::ISetupDispatcherTrait;
use paved::types::category::{Category, CategoryImpl};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::{
    CheatSpan, cheat_caller_address, interact_with_state, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address, test_address,
};
use starknet::{ContractAddress, get_block_timestamp, get_contract_address};
use crate::setup::setup;
use crate::setup::setup::{IChallengeDispatcherTrait, PLAYER, Systems, TestStore, TestStoreTrait};

type Move = (Plan, Orientation, u32, u32);

#[derive(Drop)]
struct Scenario {
    systems: Systems,
    store: TestStore,
    game_id: u32,
    player_id: felt252,
}

/// `gas.cairo`'s `ScenarioTrait::new`: a paid game of `PLAYER` on the VRF mock (#645).
fn scenario() -> Scenario {
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let game_id = systems.challenge.spawn(1, Zero::zero(), 0);
    Scenario { systems, store, game_id, player_id: context.player_id }
}

/// Overwrites the plan of the tile in hand, as `gas.cairo` does before each build.
fn force(s: @Scenario, plan: Plan) {
    let game = s.store.game(*s.game_id);
    let builder = s.store.builder(game, *s.player_id);
    let mut tile = s.store.tile(game, builder.tile_id);
    tile.plan = plan.into();
    s.store.set_tile(tile);
}

fn play(s: @Scenario, moves: Span<Move>) {
    for (plan, orientation, x, y) in moves {
        force(s, *plan);
        s.systems.challenge.build(*s.game_id, *orientation, *x, *y);
    }
}

/// The scenario with every move but the last played; returns the last.
fn prepared(name: felt252) -> (Scenario, Move) {
    let s = scenario();
    let (moves, last) = moves_of(name);
    play(@s, moves.span());
    (s, last)
}

/// The moves of the scenarios of `gas.cairo`, and the last one, which is measured.
fn moves_of(name: felt252) -> (Array<Move>, Move) {
    let straight = Plan::RFFFRFFFR;
    let curve = Plan::RFRFFFFFR;
    if name == 'a0' {
        (array![], (straight, Orientation::North, CENTER + 1, CENTER))
    } else if name == 'a' {
        (array![], (Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1))
    } else if name == 'c' || name == 'scored' {
        let moves = array![
            (Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1),
            (Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2),
            (Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3),
            (Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 4),
        ];
        (moves, (Plan::FFFFFFCFF, Orientation::East, CENTER + 1, CENTER + 4))
    } else if name == 'd' {
        let moves = array![
            (Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1),
            (Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2),
            (Plan::CCCCCFFFC, Orientation::South, CENTER, CENTER + 3),
            (Plan::CFFFCFFFC, Orientation::North, CENTER - 1, CENTER + 3),
            (Plan::FFFFCCCFF, Orientation::North, CENTER - 2, CENTER + 3),
            (Plan::FFFFCCCFF, Orientation::South, CENTER - 2, CENTER + 2),
            (Plan::FFFFFFCFF, Orientation::West, CENTER - 3, CENTER + 2),
            (Plan::FFFFCCCFF, Orientation::South, CENTER + 1, CENTER + 3),
            (Plan::FFFFCCCFF, Orientation::North, CENTER + 1, CENTER + 4),
            (Plan::FFFFCCCFF, Orientation::East, CENTER + 2, CENTER + 4),
        ];
        (moves, (Plan::FFFFFFCFF, Orientation::South, CENTER + 2, CENTER + 3))
    } else if name == 'e' {
        let moves = array![
            (curve, Orientation::South, CENTER, CENTER - 1),
            (curve, Orientation::West, CENTER + 1, CENTER - 1),
            (curve, Orientation::North, CENTER + 1, CENTER - 2),
        ];
        (moves, (curve, Orientation::East, CENTER, CENTER - 2))
    } else {
        assert(name == 'f', 'Profile: unknown scenario');
        let moves = array![
            (straight, Orientation::North, CENTER + 1, CENTER),
            (curve, Orientation::West, CENTER + 2, CENTER),
            (straight, Orientation::East, CENTER + 2, CENTER - 1),
            (straight, Orientation::East, CENTER + 2, CENTER - 2),
            (curve, Orientation::North, CENTER + 2, CENTER - 3),
            (straight, Orientation::North, CENTER + 1, CENTER - 3),
            (straight, Orientation::North, CENTER, CENTER - 3),
            (curve, Orientation::East, CENTER - 1, CENTER - 3),
            (straight, Orientation::East, CENTER - 1, CENTER - 2),
            (straight, Orientation::East, CENTER - 1, CENTER - 1),
            (Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 1),
            (Plan::WFFFFFFFF, Orientation::North, CENTER + 1, CENTER - 1),
            (Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 2),
            (Plan::WFFFFFFFF, Orientation::North, CENTER + 1, CENTER - 2),
        ];
        (moves, (curve, Orientation::South, CENTER - 1, CENTER))
    }
}

/// Prints the gas spent since `since` under `label` and returns the gas available after the print,
/// so the print is not counted.
fn mark(label: ByteArray, since: u128) -> u128 {
    let now = get_available_gas();
    println!("PROFILE {} {}", label, since - now);
    get_available_gas()
}

/// The scoring arms of the assessment, summed over its structures; the rest of `assess` (the
/// starts, the finds, the neighbours' wonders) is its total less these.
#[derive(Copy, Drop, Default)]
struct Buckets {
    road_city: u128,
    forest_scan: u128,
    forest_score: u128,
    wonder: u128,
}

/// 1, read at run time: the solver cannot charge a loop of `once` turns ahead of it.
fn once() -> u32 {
    if get_available_gas() > 0 {
        1
    } else {
        0
    }
}

/// The empty turn included in each figure.
fn print_overhead(once: u32) {
    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < once {
        i += 1;
    }
    println!("PROFILE once_overhead {}", t - get_available_gas());
}

fn no_neighbourhood() -> Neighborhood {
    Neighborhood {
        tiles: array![].span(), refs: array![].span(), rows: array![].span(), wonders: 0, taken: 0,
    }
}

/// `PlayableComponent::build`, piece by piece, in the storage of the game contract, each piece in
/// a loop of `once` turns (the method, above).
fn replay_build(game_id: u32, player_id: felt252, orientation: Orientation, x: u32, y: u32) {
    let once = once();
    print_overhead(once);
    let mut store: Store = StoreImpl::new();
    let mut game = ZeroableGame::zero();
    let mut builder = ZeroableBuilderImpl::zero();
    let mut tile = ZeroableTile::zero();
    let mut around = no_neighbourhood();
    let mut structures = StructuresTrait::new(game_id);
    let mut refs: u128 = 0;
    let mut drawn: Option<(u32, Plan)> = Option::None;
    let mut b: Buckets = Default::default();
    let mut t = get_available_gas();
    let mut i: u32 = 0;
    while i < once {
        game = store.live_game(game_id);
        i += 1;
    }
    t = mark("game_read", t);
    let mut i: u32 = 0;
    while i < once {
        game.assert_exists();
        game.assert_started();
        game.assert_not_over();
        game.assert_not_expired(get_block_timestamp());
        builder = game.builder_of(player_id);
        builder.assert_exists();
        i += 1;
    }
    t = mark("checks", t);
    let mut i: u32 = 0;
    while i < once {
        tile = store.tile(game, builder.tile_id);
        tile.assert_exists();
        i += 1;
    }
    t = mark("tile_in_hand_read", t);
    let mut i: u32 = 0;
    while i < once {
        let tile_position = store.tile_position(game, x, y);
        tile_position.assert_not_exists();
        i += 1;
    }
    t = mark("position_read", t);
    let mut i: u32 = 0;
    while i < once {
        around = NeighborhoodTrait::read(game_id, x, y);
        i += 1;
    }
    t = mark("neighbourhood_read", t);
    let mut i: u32 = 0;
    while i < once {
        builder.build(ref tile, orientation, x, y);
        placement::assert_fits(tile, @around);
        i += 1;
    }
    t = mark("fit_check", t);
    let mut i: u32 = 0;
    while i < once {
        store
            .emit(
                Event::Built(
                    Built {
                        game_id,
                        player_id,
                        tile_id: tile.id,
                        plan: tile.plan,
                        orientation: orientation.into(),
                        x,
                        y,
                    },
                ),
            );
        i += 1;
    }
    t = mark("event_built", t);
    let mut i: u32 = 0;
    while i < once {
        refs = game.place_structures(tile, @around, ref structures);
        structures.track(tile, refs);
        i += 1;
    }
    t = mark("placement", t);
    let mut i: u32 = 0;
    while i < once {
        game.assess_over();
        if !game.is_over() {
            game.reseed(tile);
        }
        i += 1;
    }
    t = mark("draw_reseed", t);
    let mut i: u32 = 0;
    while i < once {
        if !game.is_over() {
            drawn = Option::Some(game.draw_plan());
        }
        i += 1;
    }
    t = mark("draw_plan", t);
    let mut i: u32 = 0;
    while i < once {
        if let Option::Some((tile_id, plan)) = drawn {
            let new_tile = builder.reveal(tile_id, plan);
            store.set_tile(new_tile);
        }
        game.set_builder(builder);
        i += 1;
    }
    t = mark("drawn_tile_write", t);
    let mut i: u32 = 0;
    while i < once {
        b = replay_assess(once, ref game, tile, refs, @around, ref structures, ref store);
        i += 1;
    }
    t = mark("assess_total", t);
    println!("PROFILE assess.road_city {}", b.road_city);
    println!("PROFILE assess.forest_scan {}", b.forest_scan);
    println!("PROFILE assess.forest_score {}", b.forest_score);
    println!("PROFILE assess.wonder {}", b.wonder);
    t = get_available_gas();
    let mut i: u32 = 0;
    while i < once {
        structures.flush(store);
        i += 1;
    }
    t = mark("flush", t);
    let mut i: u32 = 0;
    while i < once {
        if game.is_over() {
            let time = get_block_timestamp();
            let day = day_id(game.start_time, game.duration());
            if day == day_id(time, game.duration()) {
                game.day_id = day;
                game.end_time = time;
                store.set_game_end(game);
            }
        }
        i += 1;
    }
    t = mark("game_end_write", t);
    let mut i: u32 = 0;
    while i < once {
        game.built += 1;
        store.set_game_state(game);
        i += 1;
    }
    t = mark("game_state_write", t);
    let mut i: u32 = 0;
    while i < once {
        if game.is_over() {
            store.emit(game_over(game, player_id));
            let _ = encode(game);
        }
        i += 1;
    }
    t = mark("event_game_over", t);
    let _ = t;
}

/// `Game::assess_with` with `solo` true (a Challenge game), its scoring arms measured, each in a
/// loop of `once` turns.
fn replay_assess(
    once: u32,
    ref game: Game,
    tile: paved::models::tile::Tile,
    refs: u128,
    around: @Neighborhood,
    ref structures: Structures,
    ref store: Store,
) -> Buckets {
    let mut b: Buckets = Default::default();
    let mut done: Array<u32> = array![];
    let row = oriented::plan_row(tile.plan, tile.orientation);
    let mut count = oriented::start_count(row);
    let mut starts = oriented::starts(row);
    while count > 0 {
        let (_, area, rest) = oriented::next_start(starts);
        starts = rest;
        count -= 1;
        let area_row = oriented::area_row(tile.plan, tile.orientation, area);
        let category: Category = tables::row_category(area_row).into();
        let scorable = match category {
            Category::Road | Category::City | Category::Wonder | Category::Forest => true,
            _ => false,
        };
        if !scorable {
            continue;
        }
        let (root, record) = structures.find(ref_of(refs, area));
        if open_of(record) != 0 || placement::contains(done.span(), root) {
            continue;
        }
        done.append(root);
        match category {
            Category::Wonder => {
                let t = get_available_gas();
                let mut i: u32 = 0;
                while i < once {
                    score_wonder(ref game, ref store, game.player_id);
                    i += 1;
                }
                b.wonder += t - get_available_gas();
            },
            Category::Forest => {
                // [Copy] `assess_forest`, solo
                let mut open_road = false;
                let mut roads: u32 = 0;
                let mut cities: u32 = 0;
                let t = get_available_gas();
                let mut i: u32 = 0;
                while i < once {
                    let mut tally: Option<Tally> = Option::None;
                    let (o, r, c) = scan(tile, refs, area, ref structures, ref tally);
                    open_road = o;
                    roads = r;
                    cities = c;
                    i += 1;
                }
                b.forest_scan += t - get_available_gas();
                let t = get_available_gas();
                let mut i: u32 = 0;
                while i < once {
                    if !open_road {
                        let size: u32 = size_of(record).into();
                        let (num, den) = compute_multiplier(size);
                        let points = (roads + cities) * Category::Forest.base_points() * num / den;
                        game.add_score(points);
                        game.count_forest();
                        store
                            .emit(
                                Event::Scored(
                                    Scored {
                                        game_id: game.id,
                                        player_id: game.player_id,
                                        category: Category::Forest.into(),
                                        size,
                                        points,
                                    },
                                ),
                            );
                    }
                    i += 1;
                }
                b.forest_score += t - get_available_gas();
            },
            _ => {
                let t = get_available_gas();
                let mut i: u32 = 0;
                while i < once {
                    score_generic(ref game, ref store, record, category, game.player_id);
                    i += 1;
                }
                b.road_city += t - get_available_gas();
            },
        }
    }
    let mut directions = array![
        tables::NORTH, tables::EAST, tables::SOUTH, tables::WEST, tables::NORTH_WEST,
        tables::NORTH_EAST, tables::SOUTH_EAST, tables::SOUTH_WEST,
    ]
        .span();
    while let Option::Some(direction) = directions.pop_front() {
        if *around.wonders & placement::bit(*direction) != 0 {
            let wonder = oriented::wonder_area(around.tile(*direction).plan);
            let (root, record) = structures.find(around.reference(*direction, wonder));
            if open_of(record) == 0 && !placement::contains(done.span(), root) {
                done.append(root);
                let t = get_available_gas();
                let mut i: u32 = 0;
                while i < once {
                    score_wonder(ref game, ref store, game.player_id);
                    i += 1;
                }
                b.wonder += t - get_available_gas();
            }
        }
    }
    b
}

fn replay(name: felt252) {
    let (s, last) = prepared(name);
    let (plan, orientation, x, y) = last;
    force(@s, plan);
    let game_id = s.game_id;
    let player_id = s.player_id;
    interact_with_state(
        s.systems.challenge.contract_address,
        || replay_build(game_id, player_id, orientation, x, y),
    );
}

fn real(name: felt252) {
    let (s, last) = prepared(name);
    let (plan, orientation, x, y) = last;
    force(@s, plan);
    let before = get_available_gas();
    s.systems.challenge.build(s.game_id, orientation, x, y);
    println!("PROFILE real_build {}", before - get_available_gas());
}

fn prep(name: felt252) {
    let (s, last) = prepared(name);
    let (plan, _, _, _) = last;
    force(@s, plan);
}

#[test]
#[ignore]
fn test_profile_g7_replay_a0() {
    replay('a0');
}

#[test]
#[ignore]
fn test_profile_g7_replay_a() {
    replay('a');
}

#[test]
#[ignore]
fn test_profile_g7_replay_c() {
    replay('c');
}

#[test]
#[ignore]
fn test_profile_g7_replay_d() {
    replay('d');
}

#[test]
#[ignore]
fn test_profile_g7_replay_e() {
    replay('e');
}

#[test]
#[ignore]
fn test_profile_g7_replay_f() {
    replay('f');
}

#[test]
#[ignore]
fn test_profile_g7_real_a0() {
    real('a0');
}

#[test]
#[ignore]
fn test_profile_g7_real_a() {
    real('a');
}

#[test]
#[ignore]
fn test_profile_g7_real_c() {
    real('c');
}

#[test]
#[ignore]
fn test_profile_g7_real_d() {
    real('d');
}

#[test]
#[ignore]
fn test_profile_g7_real_e() {
    real('e');
}

#[test]
#[ignore]
fn test_profile_g7_real_f() {
    real('f');
}

#[test]
#[ignore]
fn test_profile_g7_prep_a0() {
    prep('a0');
}

#[test]
#[ignore]
fn test_profile_g7_prep_c() {
    prep('c');
}

#[test]
#[ignore]
fn test_profile_g7_prep_d() {
    prep('d');
}

#[test]
#[ignore]
fn test_profile_g7_prep_e() {
    prep('e');
}

#[test]
#[ignore]
fn test_profile_g7_prep_f() {
    prep('f');
}

/// The game of scenario c one tile later (`gas.cairo`'s `scored_game`), its tile limit cut to the
/// tiles drawn when `last` is set, so that the next move ends it.
fn scored(last: bool) -> Scenario {
    let (s, last_move) = prepared('scored');
    let (plan, orientation, x, y) = last_move;
    force(@s, plan);
    s.systems.challenge.build(s.game_id, orientation, x, y);
    if last {
        let mut game = s.store.game(s.game_id);
        game.tile_limit = game.tile_count.try_into().unwrap();
        s.store.set_game(game);
    }
    s
}

/// l. The game over on the last `build`, replayed (the move of a0 east of the starter).
#[test]
#[ignore]
fn test_profile_g7_replay_l() {
    let s = scored(true);
    force(@s, Plan::RFFFRFFFR);
    let game_id = s.game_id;
    let player_id = s.player_id;
    interact_with_state(
        s.systems.challenge.contract_address,
        || replay_build(game_id, player_id, Orientation::North, CENTER + 1, CENTER),
    );
    finish_parts(@s, s.store.game(s.game_id));
}

#[test]
#[ignore]
fn test_profile_g7_real_l() {
    let s = scored(true);
    force(@s, Plan::RFFFRFFFR);
    let before = get_available_gas();
    s.systems.challenge.build(s.game_id, Orientation::North, CENTER + 1, CENTER);
    println!("PROFILE real_build {}", before - get_available_gas());
}

#[test]
#[ignore]
fn test_profile_g7_prep_l() {
    let s = scored(true);
    force(@s, Plan::RFFFRFFFR);
}

/// `PlayableComponent::discard`, piece by piece (each piece in a loop of `once` turns).
fn replay_discard(game_id: u32, player_id: felt252) {
    let once = once();
    print_overhead(once);
    let store: Store = StoreImpl::new();
    let mut game = ZeroableGame::zero();
    let mut builder = ZeroableBuilderImpl::zero();
    let mut tile = ZeroableTile::zero();
    let mut drawn: Option<(u32, Plan)> = Option::None;
    let mut t = get_available_gas();
    let mut i: u32 = 0;
    while i < once {
        game = store.live_game(game_id);
        i += 1;
    }
    t = mark("game_read", t);
    let mut i: u32 = 0;
    while i < once {
        game.assert_exists();
        game.assert_started();
        game.assert_not_over();
        game.assert_not_expired(get_block_timestamp());
        builder = game.builder_of(player_id);
        builder.assert_exists();
        i += 1;
    }
    t = mark("checks", t);
    let mut i: u32 = 0;
    while i < once {
        tile = store.tile(game, builder.tile_id);
        tile.assert_exists();
        i += 1;
    }
    t = mark("tile_in_hand_read", t);
    let mut i: u32 = 0;
    while i < once {
        let score = game.score;
        builder.discard(ref game);
        store
            .emit(
                Event::Discarded(
                    Discarded {
                        game_id,
                        player_id,
                        tile_id: tile.id,
                        plan: tile.plan,
                        points: score - game.score,
                    },
                ),
            );
        i += 1;
    }
    t = mark("event_discarded", t);
    let mut i: u32 = 0;
    while i < once {
        game.assess_over();
        if !game.is_over() {
            game.reseed(tile);
        }
        i += 1;
    }
    t = mark("draw_reseed", t);
    let mut i: u32 = 0;
    while i < once {
        if !game.is_over() {
            drawn = Option::Some(game.draw_plan());
        }
        i += 1;
    }
    t = mark("draw_plan", t);
    let mut i: u32 = 0;
    while i < once {
        if let Option::Some((tile_id, plan)) = drawn {
            let tile = builder.reveal(tile_id, plan);
            store.set_tile(tile);
        }
        game.set_builder(builder);
        i += 1;
    }
    t = mark("drawn_tile_write", t);
    let mut i: u32 = 0;
    while i < once {
        if game.is_over() {
            let time = get_block_timestamp();
            let day = day_id(game.start_time, game.duration());
            if day == day_id(time, game.duration()) {
                game.day_id = day;
                game.end_time = time;
                store.set_game_end(game);
            }
        }
        i += 1;
    }
    t = mark("game_end_write", t);
    let mut i: u32 = 0;
    while i < once {
        game.discarded += 1;
        store.set_game_state(game);
        i += 1;
    }
    t = mark("game_state_write", t);
    let mut i: u32 = 0;
    while i < once {
        if game.is_over() {
            store.emit(game_over(game, player_id));
            let _ = encode(game);
        }
        i += 1;
    }
    t = mark("event_game_over", t);
    let _ = t;
}

/// A discard that does not end the game (the game of scenario c, one tile later).
#[test]
#[ignore]
fn test_profile_g7_replay_discard() {
    let s = scored(false);
    let game_id = s.game_id;
    let player_id = s.player_id;
    interact_with_state(
        s.systems.challenge.contract_address, || replay_discard(game_id, player_id),
    );
}

#[test]
#[ignore]
fn test_profile_g7_real_discard() {
    let s = scored(false);
    let before = get_available_gas();
    s.systems.challenge.discard(s.game_id);
    println!("PROFILE real_discard {}", before - get_available_gas());
}

/// s. The game over on the last `discard`, replayed, then `finish`'s calls.
#[test]
#[ignore]
fn test_profile_g7_replay_s() {
    let s = scored(true);
    let game_id = s.game_id;
    let player_id = s.player_id;
    interact_with_state(
        s.systems.challenge.contract_address, || replay_discard(game_id, player_id),
    );
    finish_parts(@s, s.store.game(s.game_id));
}

/// `PlayableComponent::surrender`, piece by piece (each piece in a loop of `once` turns).
fn replay_surrender(game_id: u32, player_id: felt252) {
    let once = once();
    print_overhead(once);
    let store: Store = StoreImpl::new();
    let mut game = ZeroableGame::zero();
    let mut t = get_available_gas();
    let mut i: u32 = 0;
    while i < once {
        game = store.live_game(game_id);
        i += 1;
    }
    t = mark("game_read", t);
    let mut i: u32 = 0;
    while i < once {
        game.assert_exists();
        game.assert_started();
        game.assert_not_over();
        let builder = game.builder_of(player_id);
        builder.assert_exists();
        game.surrender();
        i += 1;
    }
    t = mark("checks", t);
    let mut i: u32 = 0;
    while i < once {
        let time = get_block_timestamp();
        let day = day_id(game.start_time, game.duration());
        if day == day_id(time, game.duration()) {
            game.day_id = day;
            game.end_time = time;
            store.set_game_end(game);
        }
        i += 1;
    }
    t = mark("game_end_write", t);
    let mut i: u32 = 0;
    while i < once {
        store.set_game_state(game);
        i += 1;
    }
    t = mark("game_state_write", t);
    let mut i: u32 = 0;
    while i < once {
        store.emit(game_over(game, player_id));
        let _ = encode(game);
        i += 1;
    }
    t = mark("event_game_over", t);
    let _ = t;
}

/// `Challenge::finish` on a game that is over, its calls measured one by one from the test, each
/// with `Challenge` as its caller: `Setup.wiring`, `Setup.report` (and its two halves, the
/// quests' and the achievements' entries alone, on a second player), `Economy.record`.
fn finish_parts(s: @Scenario, game: Game) {
    let challenge = *s.systems.challenge.contract_address;
    let setup = *s.systems.setup;
    let economy = *s.systems.economy;
    let player_id = *s.player_id;
    let tally = decode(encode(game), player_id);
    let quests = quest_entries(tally);
    let achievements = achievement_entries(tally);
    println!("PROFILE report_entries quests={} achievements={}", quests.len(), achievements.len());
    let before = get_available_gas();
    let _ = setup.wiring();
    println!("PROFILE call_setup_wiring {}", before - get_available_gas());
    cheat_caller_address(setup.contract_address, challenge, CheatSpan::TargetCalls(1));
    let before = get_available_gas();
    setup.report(player_id, quests.span(), achievements.span());
    println!("PROFILE call_setup_report {}", before - get_available_gas());
    cheat_caller_address(setup.contract_address, challenge, CheatSpan::TargetCalls(1));
    let before = get_available_gas();
    setup.report('OTHER', quests.span(), array![].span());
    println!("PROFILE call_setup_report_quests_only {}", before - get_available_gas());
    cheat_caller_address(setup.contract_address, challenge, CheatSpan::TargetCalls(1));
    let before = get_available_gas();
    setup.report('OTHER2', array![].span(), achievements.span());
    println!("PROFILE call_setup_report_achievements_only {}", before - get_available_gas());
    cheat_caller_address(setup.contract_address, challenge, CheatSpan::TargetCalls(1));
    let before = get_available_gas();
    setup.report('OTHER3', array![].span(), array![].span());
    println!("PROFILE call_setup_report_empty {}", before - get_available_gas());
    cheat_caller_address(economy.contract_address, challenge, CheatSpan::TargetCalls(1));
    let before = get_available_gas();
    economy.record(*s.game_id, game.score);
    println!("PROFILE call_economy_record {}", before - get_available_gas());
}

/// g. The closing move in its day (a surrender), replayed, then `finish`'s calls.
#[test]
#[ignore]
fn test_profile_g7_replay_g() {
    let s = scored(false);
    let game_id = s.game_id;
    let player_id = s.player_id;
    interact_with_state(
        s.systems.challenge.contract_address, || replay_surrender(game_id, player_id),
    );
    finish_parts(@s, s.store.game(s.game_id));
}

/// k. The closing move with the largest report, replayed, then `finish`'s calls.
#[test]
#[ignore]
fn test_profile_g7_replay_k() {
    let s = scored(false);
    let mut game = s.store.game(s.game_id);
    game.score = 4500;
    game.counts = GameImpl::counts_of(20, 5, 3, 4);
    s.store.set_game(game);
    let game_id = s.game_id;
    let player_id = s.player_id;
    interact_with_state(
        s.systems.challenge.contract_address, || replay_surrender(game_id, player_id),
    );
    finish_parts(@s, s.store.game(s.game_id));
}

/// m. A spawn (stake 1, no referrer) replayed: `HostableComponent::spawn_with` piece by piece in
/// `Challenge`'s storage, on the token seed of game 2 as `gas.cairo`'s m, then the purchase and
/// the mint, each call with `Challenge` as its caller. The pause check (one read, 40,480 in G4)
/// is left out.
#[test]
#[ignore]
fn test_profile_g7_replay_m() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let before = get_available_gas();
    let wiring = systems.setup.wiring();
    println!("PROFILE call_setup_wiring {}", before - get_available_gas());
    let player_id: felt252 = PLAYER().into();
    let (game_id, unit) = interact_with_state(challenge, || replay_spawn(player_id));
    let player: ContractAddress = PLAYER();
    let usdc = OzERC20Dispatcher { contract_address: context.token.contract_address };
    cheat_caller_address(usdc.contract_address, challenge, CheatSpan::TargetCalls(1));
    let before = get_available_gas();
    usdc.transferFrom(player, wiring.economy, unit);
    println!("PROFILE call_usdc_transfer_from {}", before - get_available_gas());
    cheat_caller_address(wiring.economy, challenge, CheatSpan::TargetCalls(1));
    let before = get_available_gas();
    systems.economy.purchase(game_id, player, 0, 1, unit, Zero::zero(), 0);
    println!("PROFILE call_economy_purchase {}", before - get_available_gas());
    cheat_caller_address(wiring.collection, challenge, CheatSpan::TargetCalls(1));
    let before = get_available_gas();
    systems.collection.mint(player, game_id.into());
    println!("PROFILE call_collection_mint {}", before - get_available_gas());
}

fn replay_spawn(player_id: felt252) -> (u32, u256) {
    let once = once();
    print_overhead(once);
    let store: Store = StoreImpl::new();
    let time = get_block_timestamp();
    let mut game_id: u32 = 0;
    let mut game = ZeroableGame::zero();
    let mut seed: felt252 = 0;
    let mut tile = ZeroableTile::zero();
    let mut builder = BuilderImpl::new(0, player_id);
    let mut drawn: (u32, Plan) = (0, Plan::None);
    let mut t = get_available_gas();
    let mut i: u32 = 0;
    while i < once {
        game_id = store.uuid();
        i += 1;
    }
    t = mark("uuid", t);
    let mut i: u32 = 0;
    while i < once {
        game = GameImpl::new(game_id, time, Mode::Challenge, player_id);
        seed = TokenSeed { contract: get_contract_address() }
            .seed(Mode::Challenge, time, game.id, game.seed);
        i += 1;
    }
    t = mark("game_new_and_seed", t);
    let mut i: u32 = 0;
    while i < once {
        tile = game.start(time, seed);
        i += 1;
    }
    t = mark("start_deck_walk", t);
    let mut i: u32 = 0;
    while i < once {
        store.set_tile(tile);
        i += 1;
    }
    t = mark("starter_write_and_place", t);
    let mut i: u32 = 0;
    while i < once {
        builder = BuilderImpl::new(game.id, player_id);
        drawn = game.draw_plan();
        i += 1;
    }
    t = mark("draw_plan", t);
    let mut i: u32 = 0;
    while i < once {
        let (tile_id, plan) = drawn;
        let tile = builder.reveal(tile_id, plan);
        store.set_tile(tile);
        i += 1;
    }
    t = mark("drawn_tile_write", t);
    let mut i: u32 = 0;
    while i < once {
        store.set_game(game);
        i += 1;
    }
    t = mark("game_write", t);
    let mut i: u32 = 0;
    while i < once {
        let day = day_id(time, game.duration());
        store
            .emit(
                Event::GameSpawned(
                    GameSpawned {
                        game_id,
                        player_id,
                        mode: game.mode,
                        day_id: day,
                        start_time: time,
                        price: game.price(),
                    },
                ),
            );
        i += 1;
    }
    t = mark("event_spawned", t);
    let _ = t;
    (game_id, game.price().into())
}

#[test]
#[ignore]
fn test_profile_g7_real_m() {
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    let before = get_available_gas();
    systems.challenge.spawn(1, Zero::zero(), 0);
    println!("PROFILE real_spawn {}", before - get_available_gas());
}

/// The unit costs, in `Challenge`'s storage after a spawn (game 1 has its starter, tile 1, and a
/// tile in hand, tile 2). Each figure is ten operations less ten turns of the same empty loop.
#[test]
#[ignore]
fn test_profile_g7_units() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let game_id = context.game_id;
    start_cheat_block_timestamp_global(0);
    interact_with_state(store.contract, || units(game_id));
}

fn units(game_id: u32) {
    let s = StoreImpl::new();
    let t = get_available_gas();
    let _ = mark("mark_overhead", t);
    print_overhead(once());

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        i += 1;
    }
    let empty = t - get_available_gas();
    println!("PROFILE loop10_empty {}", empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = s.structure_slot(game_id, 1, 0);
        i += 1;
    }
    println!("PROFILE x10_storage_read_page_slot {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = s.structure_slot(game_id, 200, 3);
        i += 1;
    }
    println!("PROFILE x10_storage_read_empty_slot {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = StoreImpl::tile_with_refs(game_id, 1);
        i += 1;
    }
    println!("PROFILE x10_tile_read_and_decode {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = StoreImpl::tile_at(game_id, CENTER + 50, CENTER + 50);
        i += 1;
    }
    println!("PROFILE x10_empty_position_read {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = StoreImpl::tile_at(game_id, CENTER, CENTER);
        i += 1;
    }
    println!("PROFILE x10_taken_position_and_tile_read {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        s.set_structure_slot(game_id, 201, 0, (i + 1).into());
        i += 1;
    }
    println!("PROFILE x10_storage_write {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = s.live_game(game_id);
        i += 1;
    }
    println!("PROFILE x10_live_game_read {}", t - get_available_gas() - empty);

    let game = s.live_game(game_id);
    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        s.set_game_state(game);
        i += 1;
    }
    println!("PROFILE x10_game_state_write {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        s
            .emit(
                Event::Scored(
                    Scored { game_id, player_id: 'P', category: 2, size: 6, points: 100 },
                ),
            );
        i += 1;
    }
    println!("PROFILE x10_event_scored {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        s
            .emit(
                Event::Built(
                    Built {
                        game_id, player_id: 'P', tile_id: 3, plan: 1, orientation: 1, x: 1, y: 1,
                    },
                ),
            );
        i += 1;
    }
    println!("PROFILE x10_event_built {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        s.emit(game_over(game, 'P'));
        i += 1;
    }
    println!("PROFILE x10_event_game_over {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = PoseidonTrait::new().update(1).update(2).update(3).finalize();
        i += 1;
    }
    println!("PROFILE x10_poseidon_3 {}", t - get_available_gas() - empty);

    let mut dict: Felt252Dict<felt252> = Default::default();
    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        dict.insert(i.into(), 1);
        let _ = dict.get(i.into());
        i += 1;
    }
    println!("PROFILE x10_dict_insert_and_get {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = get_block_timestamp();
        i += 1;
    }
    println!("PROFILE x10_block_timestamp {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let _ = NeighborhoodTrait::read(game_id, CENTER + 60, CENTER + 60);
        i += 1;
    }
    println!("PROFILE x10_neighbourhood_read_all_empty {}", t - get_available_gas() - empty);

    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < 10 {
        let mut structures = StructuresTrait::new(game_id);
        let _ = structures.record(16);
        i += 1;
    }
    println!("PROFILE x10_structures_new_and_one_record {}", t - get_available_gas() - empty);
}

fn read_turns(game_id: u32, n: u32) -> u128 {
    let s = StoreImpl::new();
    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < n {
        let _ = s.structure_slot(game_id, 1, 0);
        i += 1;
    }
    t - get_available_gas()
}

fn empty_turns(n: u32) -> u128 {
    let mut i: u32 = 0;
    let t = get_available_gas();
    while i < n {
        i += 1;
    }
    t - get_available_gas()
}

#[inline(never)]
fn one_read(game_id: u32) -> felt252 {
    StoreImpl::new().structure_slot(game_id, 1, 0)
}

/// How the available gas reads around loops of n turns and around a call.
#[test]
#[ignore]
fn test_profile_g7_method() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);
    let game_id = context.game_id;
    interact_with_state(
        store.contract,
        || {
            for n in array![0_u32, 1, 2, 3, 11] {
                println!("METHOD n={} empty={} read={}", n, empty_turns(n), read_turns(game_id, n));
            }
            let t = get_available_gas();
            let _ = one_read(game_id);
            println!("METHOD call_one_read {}", t - get_available_gas());
            let t = get_available_gas();
            let _ = StoreImpl::new().live_game(game_id);
            println!("METHOD inline_live_game {}", t - get_available_gas());
        },
    );
}
