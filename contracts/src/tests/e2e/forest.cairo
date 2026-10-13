//! Forests, and the rule that every structure scores once on the move that closes it (D-18, P-45).
//!
//! A forest is closed when every tile around it exists and every road adjacent to it is closed.
//! Since D-18 it scores with no character: `(distinct closed adjacent roads + distinct closed
//! adjacent cities) x 300 x bonus(size)` (bonus curve `1.0235^size`, `compute_multiplier`), what a
//! Woodsman and a Herdsman scored together before. A city counts only when it is closed (P-15). A
//! forest that closes with 0 points still emits its `Scored` and counts once in `count_forest`
//! (ruling 3 of the D-18b brief: the quests' unit is the forest closure).
//!
//! Boards (plans are written `Center, NW, N, NE, E, SE, S, SW, W`, see `types/plan.cairo`). The
//! starter tile `RFFFRFCFR`, facing South, lies at `CENTER`: city to the north, road from west to
//! east, forest to the south. Every other tile is forced into the builder's hand, as the other e2e
//! tests do, or written into storage (`Store::set_tile`, the boards of "Once per move").
//!
//! - ring: four road curves `RFRFFFFFR` around one corner. Their roads form a closed loop and the
//!   four inner corner forests join in one forest of 4 tiles bounded by that single road.
//! - crossings: four road crossings `SFRFRFRFR` in a 2x2 block. The four inner corner forests join
//!   in one forest of 4 tiles bounded by four distinct closed roads (stop to stop).
//! - sandwich: two straight roads `RFFFRFFFR` one above the other, the forest between them has 2
//!   tiles and is bounded by two roads that are still open.
//! - arch: two vertical city corridors `CFFFCFFFC` side by side, joined by a city arch on top and
//!   closed below by the starter and by one more cap: the forest between the corridors (2 tiles)
//!   touches one city twice.
//! - caps: the same two corridors closed by their own caps: the forest touches two cities.
//! - open cities: the two corridors alone, both cities open.
//!
//! After every build, `put` checks the structure state against the oracle's walks and that the
//! move scored exactly what the walks give (`oracle::check::assert_move_scored`). The figures
//! "by hand" below use bonus(2) = 10475, bonus(4) = 10972, bonus(5) = 11229, bonus(7) = 11763
//! (out of 10000).

use core::num::traits::Zero;
use paved::events::{Event as PavedEvent, Scored};
use paved::models::game::GameTrait;
use paved::models::index::Tile;
use paved::models::tile::CENTER;
use paved::store::{StoreImpl, StoreTrait};
use paved::systems::daily::{Daily, IDailyDispatcher};
use paved::tests::oracle::check;
use paved::tests::oracle::forest::ForestCount;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, TestStore, TestStoreTrait};
use paved::types::category::Category;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::spot::Spot;
use snforge_std::{
    EventSpy, EventSpyAssertionsTrait, EventSpyTrait, interact_with_state, spy_events,
};

/// Builds `plan` at (`x`, `y`) as the builder of the game, then checks the structure state and
/// what the move scored against the oracle.
fn put(
    store: TestStore,
    daily: IDailyDispatcher,
    game_id: u32,
    player_id: felt252,
    plan: Plan,
    orientation: Orientation,
    x: u32,
    y: u32,
) {
    let game = store.game(game_id);
    let before = game.score;
    let builder = store.builder(game, player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = plan.into();
    store.set_tile(tile);
    daily.build(game_id, orientation, x, y);
    // [Check] The structure state of the built tile agrees with the walks (P5-4), and the move
    // scored what the walks give (D-18b)
    check::assert_tile_agrees(store, game_id, builder.tile_id);
    check::assert_move_scored(store, game_id, builder.tile_id, before);
}

/// Writes a placed tile into storage, without a build (`Store::set_tile` places it on the
/// structure state; nothing scores).
fn write(store: TestStore, game_id: u32, id: u32, plan: Plan, orientation: Orientation, x: u32, y: u32) {
    store.set_tile(Tile { game_id, id, plan: plan.into(), orientation: orientation.into(), x, y });
}

/// Reads the forest at `at` of the tile placed at (`x`, `y`) with the walk of the oracle:
/// (size, distinct closed roads, distinct closed cities); size 0 when it is not finished.
fn forest_at(store: TestStore, game_id: u32, x: u32, y: u32, at: Spot) -> (u32, u32, u32) {
    interact_with_state(
        store.contract,
        || {
            let mut s = StoreImpl::new();
            let game = s.game(game_id);
            let tile = s.tile(game, s.tile_position(game, x, y).tile_id);
            ForestCount::start(game, tile, at, ref s)
        },
    )
}

/// The Scored event of a structure.
fn scored(
    game_id: u32, player_id: felt252, category: Category, size: u32, points: u32,
) -> Daily::Event {
    Daily::Event::PavedEvent(
        PavedEvent::Scored(Scored { game_id, player_id, category: category.into(), size, points }),
    )
}

/// The `Scored` events of `category` the spy caught.
fn count_scored(ref spy: EventSpy, category: Category) -> u32 {
    let code: u8 = category.into();
    let mut count = 0;
    for (_, event) in spy.get_events().events {
        if *event.keys.at(0) == selector!("Scored") && *event.data.at(1) == code.into() {
            count += 1;
        }
    }
    count
}

// Boards. Each function plays the moves of the board and stops before `last` when it is told to
// leave the board one tile short (`closing == false`), so that a test can look at the board both
// ways.

/// Ring: four curves `RFRFFFFFR` around the corner at (`CENTER`+1, `CENTER`-1) (their common
/// corner). Facing South the curve joins its east and south edges, facing West its west and
/// south, North its north and west, East its north and east: the four roads make one closed loop
/// under the starter, and the four corners inside make the forest of 4 tiles.
fn ring(store: TestStore, daily: IDailyDispatcher, g: u32, p: felt252, closing: bool) {
    put(store, daily, g, p, Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 1);
    put(store, daily, g, p, Plan::RFRFFFFFR, Orientation::West, CENTER + 1, CENTER - 1);
    put(store, daily, g, p, Plan::RFRFFFFFR, Orientation::North, CENTER + 1, CENTER - 2);
    if closing {
        put(store, daily, g, p, Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2);
    }
}

/// Crossings: four road crossings `SFRFRFRFR` (a stop at the center, one road to each edge, a
/// corner forest between two roads) in a 2x2 block east of the starter. The corner of each tile
/// that faces the middle of the block belongs to the forest of 4 tiles; the 4 roads between the
/// tiles of the block are closed (each runs from a stop to a stop).
fn crossings(store: TestStore, daily: IDailyDispatcher, g: u32, p: felt252, closing: bool) {
    put(store, daily, g, p, Plan::SFRFRFRFR, Orientation::North, CENTER + 1, CENTER);
    put(store, daily, g, p, Plan::SFRFRFRFR, Orientation::North, CENTER + 2, CENTER);
    put(store, daily, g, p, Plan::SFRFRFRFR, Orientation::North, CENTER + 1, CENTER - 1);
    if closing {
        put(store, daily, g, p, Plan::SFRFRFRFR, Orientation::North, CENTER + 2, CENTER - 1);
    }
}

/// Sandwich: a straight road east of the starter, and another one above it. The forest between
/// them has 2 tiles and no open side, but both roads next to it are open at both ends.
fn sandwich(store: TestStore, daily: IDailyDispatcher, g: u32, p: felt252) {
    put(store, daily, g, p, Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER);
    put(store, daily, g, p, Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER + 1);
}

/// What closes the north of the corridors of the city boards.
#[derive(Copy, Drop, PartialEq)]
enum Top {
    /// Nothing: the corridors stay open to the north.
    Open,
    /// Two caps, one per corridor.
    Caps,
    /// A city arch over both corridors.
    Arch,
}

/// Corridors: two vertical city corridors `CFFFCFFFC` (facing East) at (`CENTER`, `CENTER`+1) and
/// (`CENTER`+1, `CENTER`+1); the forest between them has 2 tiles. The first corridor sits on the
/// city cap of the starter, so its city is closed to the south. The second one is built last, it
/// is closed to the south by a city cap (a copy of the starter, east of it) that is built before,
/// when `top` is not `Open`.
fn corridors(
    store: TestStore, daily: IDailyDispatcher, g: u32, p: felt252, top: Top, closing: bool,
) {
    put(store, daily, g, p, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1);
    if top == Top::Caps {
        put(store, daily, g, p, Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 2);
        put(store, daily, g, p, Plan::FFFFFFCFF, Orientation::North, CENTER + 1, CENTER + 2);
    }
    if top == Top::Arch {
        put(store, daily, g, p, Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 2);
        put(store, daily, g, p, Plan::FFFFCCCFF, Orientation::East, CENTER + 1, CENTER + 2);
    }
    if top != Top::Open {
        put(store, daily, g, p, Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER);
    }
    if closing {
        put(store, daily, g, p, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1);
    }
}

// The forest walk of the oracle alone.

#[test]
#[available_gas(l2_gas: 400000000)]
fn test_forest_walk_ring_open_then_closed() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    ring(store, systems.daily, g, p, false);
    // One tile short: a neighbour of the forest is missing.
    assert_eq!(forest_at(store, g, CENTER, CENTER - 1, Spot::SouthEast), (0, 0, 0), "open");
    put(store, systems.daily, g, p, Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2);
    // Closed: 4 tiles, one road (the loop), no city.
    assert_eq!(forest_at(store, g, CENTER, CENTER - 1, Spot::SouthEast), (4, 1, 0), "closed");
}

#[test]
#[available_gas(l2_gas: 400000000)]
fn test_forest_walk_crossings_count_each_road() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    crossings(store, systems.daily, g, p, true);
    assert_eq!(forest_at(store, g, CENTER + 1, CENTER, Spot::SouthEast), (4, 4, 0), "crossings");
}

#[test]
#[available_gas(l2_gas: 300000000)]
fn test_forest_walk_sandwich_open_roads() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    sandwich(store, systems.daily, g, p);
    // The forest has no open side of its own, but its roads are open: not finished.
    assert_eq!(forest_at(store, g, CENTER + 1, CENTER, Spot::North), (0, 0, 0), "sandwich");
}

#[test]
#[available_gas(l2_gas: 400000000)]
fn test_forest_walk_one_city_touched_twice_counts_once() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Top::Arch, true);
    assert_eq!(forest_at(store, g, CENTER, CENTER + 1, Spot::East), (2, 0, 1), "arch");
}

#[test]
#[available_gas(l2_gas: 400000000)]
fn test_forest_walk_two_cities_count_twice() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Top::Caps, true);
    assert_eq!(forest_at(store, g, CENTER, CENTER + 1, Spot::East), (2, 0, 2), "caps");
}

#[test]
#[available_gas(l2_gas: 300000000)]
fn test_forest_walk_open_cities_do_not_count_nor_block() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Top::Open, true);
    // Both cities are open: the forest is closed all the same, and no city counts.
    assert_eq!(forest_at(store, g, CENTER, CENTER + 1, Spot::East), (2, 0, 0), "open cities");
}

// Scoring.

/// "Closed structure left unscored" fires: the last curve of the ring written into storage
/// (no build, so nothing scores) leaves a closed road and a closed forest that the board check
/// finds unscored.
#[test]
#[should_panic(expected: ('Check: board points differ',))]
#[available_gas(l2_gas: 500000000)]
fn test_forest_oracle_finds_a_closed_structure_left_unscored() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    ring(store, systems.daily, g, p, false);
    check::assert_board_scored(store, g, 0);
    write(store, g, 100, Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2);
    check::assert_board_scored(store, g, 0);
}

#[test]
#[available_gas(l2_gas: 300000000)]
fn test_forest_ring_one_tile_short_scores_nothing() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    ring(store, systems.daily, g, p, false);
    assert_eq!(store.game(g).score, 0, "score");
    assert_eq!(store.game(g).forests(), 0, "no forest");
}

/// The last curve closes the loop of road and the forest inside it, on the same move. By hand:
/// the road has 4 nodes, 4 x 100 x 10972 / 10000 = 438; the forest has 4 tiles and one closed
/// road around it (the loop, counted once), 1 x 300 x 10972 / 10000 = 329. The move scores 767.
#[test]
#[available_gas(l2_gas: 500000000)]
fn test_forest_ring_closes_with_its_road() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    ring(store, systems.daily, g, p, false);
    let mut spy = spy_events();
    put(store, systems.daily, g, p, Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2);
    assert_eq!(store.game(g).score, 767, "score");
    let daily = systems.daily.contract_address;
    spy
        .assert_emitted(
            @array![
                (daily, scored(g, p, Category::Road, 4, 438)),
                (daily, scored(g, p, Category::Forest, 4, 329)),
            ],
        );
    assert_eq!(store.game(g).forests(), 1, "one forest");
}

/// By hand: the forest scores its 4 closed roads x 300 x bonus(4) = 4 x 300 x 10972 / 10000 =
/// 1316 (the roads that close on the same move score too: the oracle checks the total).
#[test]
#[available_gas(l2_gas: 500000000)]
fn test_forest_scores_four_roads() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    crossings(store, systems.daily, g, p, false);
    let mut spy = spy_events();
    put(store, systems.daily, g, p, Plan::SFRFRFRFR, Orientation::North, CENTER + 2, CENTER - 1);
    spy
        .assert_emitted(
            @array![(systems.daily.contract_address, scored(g, p, Category::Forest, 4, 1316))],
        );
    assert_eq!(count_scored(ref spy, Category::Forest), 1, "one forest");
}

/// A forest whose own edges are all placed waits while a road next to it is open: no `Scored`.
#[test]
#[available_gas(l2_gas: 300000000)]
fn test_forest_waits_while_an_adjacent_road_is_open() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    let mut spy = spy_events();
    sandwich(store, systems.daily, g, p);
    assert_eq!(count_scored(ref spy, Category::Forest), 0, "no forest scored");
    assert_eq!(store.game(g).forests(), 0, "no forest counted");
}

/// By hand: the forest has 2 tiles, the city of the arch (starter cap, two corridors, two
/// corners, one more cap: 6 tiles, closed) is one city, touched twice: 1 x 300 x 10475 / 10000 =
/// 314.
#[test]
#[available_gas(l2_gas: 500000000)]
fn test_forest_scores_one_city_touched_twice_once() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Top::Arch, false);
    let mut spy = spy_events();
    put(store, systems.daily, g, p, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1);
    spy
        .assert_emitted(
            @array![(systems.daily.contract_address, scored(g, p, Category::Forest, 2, 314))],
        );
}

/// By hand: 2 cities x 300 x bonus(2) = 2 x 300 x 10475 / 10000 = 628 (628.5 rounded down).
#[test]
#[available_gas(l2_gas: 500000000)]
fn test_forest_scores_two_cities() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Top::Caps, false);
    let mut spy = spy_events();
    put(store, systems.daily, g, p, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1);
    spy
        .assert_emitted(
            @array![(systems.daily.contract_address, scored(g, p, Category::Forest, 2, 628))],
        );
}

/// Ruling 3 of D-18b: a forest that closes with 0 points (no closed road or city around it)
/// still emits its `Scored`, category FOREST, points 0, and counts once in `count_forest`.
#[test]
#[available_gas(l2_gas: 300000000)]
fn test_forest_closing_with_zero_points_emits_and_counts_once() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Top::Open, false);
    let mut spy = spy_events();
    put(store, systems.daily, g, p, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1);
    // The forest is closed, the cities are not: no point, one event, one forest counted
    spy
        .assert_emitted(
            @array![(systems.daily.contract_address, scored(g, p, Category::Forest, 2, 0))],
        );
    assert_eq!(count_scored(ref spy, Category::Forest), 1, "one event");
    assert_eq!(store.game(g).forests(), 1, "one forest counted");
}

/// P-15: one city, open, touched at two places by the forest (the board of
/// `golden/forest.cairo`, `herdsman_open_city_moves`). The 2024 walk counted it once (314); an open
/// city never counts: the forest scores 0, with its `Scored`.
#[test]
#[available_gas(l2_gas: 500000000)]
fn test_forest_open_city_touched_twice_scores_nothing() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    let daily = systems.daily;
    put(store, daily, g, p, Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER);
    put(store, daily, g, p, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1);
    put(store, daily, g, p, Plan::FFFFCCCFF, Orientation::East, CENTER + 1, CENTER + 2);
    put(store, daily, g, p, Plan::CCCCCFFFC, Orientation::South, CENTER, CENTER + 2);
    let mut spy = spy_events();
    put(store, daily, g, p, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1);
    // The forest of 2 tiles is closed, the only city around it is open: no city counts
    assert_eq!(forest_at(store, g, CENTER, CENTER + 1, Spot::East), (2, 0, 0), "the walk");
    spy.assert_emitted(@array![(daily.contract_address, scored(g, p, Category::Forest, 2, 0))]);
}

// Once per move: a root that the built tile reaches from two start spots scores once (D-18b,
// ruling 4). Each board is written into storage far from the starter, the closing tile is built.

/// The origin of the boards written below.
const OX: u32 = CENTER + 20;
const OY: u32 = CENTER + 20;

/// Road: a road stop `SFRFRFFFR` (facing North: arms north, east and west) closes a loop of three
/// curves through its north and east arms, two start spots of one road. By hand: the road has 5
/// nodes (two arms and three curves), 5 x 100 x 11229 / 10000 = 561, once; the forest inside the
/// loop (4 corners, one road around it) closes too, 1 x 300 x 10972 / 10000 = 329. The move scores
/// 890.
#[test]
#[available_gas(l2_gas: 500000000)]
fn test_once_per_move_road_reached_from_two_start_spots() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    write(store, g, 100, Plan::RFRFFFFFR, Orientation::South, OX, OY + 1);
    write(store, g, 101, Plan::RFRFFFFFR, Orientation::West, OX + 1, OY + 1);
    write(store, g, 102, Plan::RFRFFFFFR, Orientation::North, OX + 1, OY);
    let mut spy = spy_events();
    put(store, systems.daily, g, p, Plan::SFRFRFFFR, Orientation::North, OX, OY);
    spy
        .assert_emitted(
            @array![(systems.daily.contract_address, scored(g, p, Category::Road, 5, 561))],
        );
    assert_eq!(count_scored(ref spy, Category::Road), 1, "the road scores once");
    assert_eq!(store.game(g).score, 890, "score");
}

/// City: a tile of two city caps `FFCFFFCFF` (facing North) closes a ring of five city tiles
/// that joins its north and south caps, two start spots of one city. By hand: the city has 7
/// nodes, 7 x 200 x 11763 / 10000 = 1646, once.
#[test]
#[available_gas(l2_gas: 500000000)]
fn test_once_per_move_city_reached_from_two_start_spots() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    write(store, g, 100, Plan::FFFFCCCFF, Orientation::North, OX, OY + 1);
    write(store, g, 101, Plan::FFFFCCCFF, Orientation::East, OX + 1, OY + 1);
    write(store, g, 102, Plan::CFFFCFFFC, Orientation::East, OX + 1, OY);
    write(store, g, 103, Plan::FFFFCCCFF, Orientation::South, OX + 1, OY - 1);
    write(store, g, 104, Plan::FFFFCCCFF, Orientation::West, OX, OY - 1);
    let mut spy = spy_events();
    put(store, systems.daily, g, p, Plan::FFCFFFCFF, Orientation::North, OX, OY);
    spy
        .assert_emitted(
            @array![(systems.daily.contract_address, scored(g, p, Category::City, 7, 1646))],
        );
    assert_eq!(count_scored(ref spy, Category::City), 1, "the city scores once");
    assert_eq!(store.game(g).score, 1646, "score");
}

/// Forest, and wonders around the built tile: a loop of road (12 tiles, a T-junction on its left
/// column) holds a 2 x 2 inside: a straight road (the built tile, top left), a wonder with a road
/// stub (top right) that ends the straight road, and two wonders. The straight road's north and
/// south forests join through the forest ring of the wonder with the stub: two start spots of one
/// forest. The built tile also closes its own road (the T's east arm, the straight, the stub) and
/// the three wonders around it, each once.
///
/// ```text
///   y=+1   curve    straight  straight  curve
///   y= 0   T        STRAIGHT* wonder+R  straight
///   y=-1   straight wonder    wonder    straight
///   y=-2   curve    straight  straight  curve
///          x=-1     x=0       x=1       x=2         (* built; the rest is written)
/// ```
#[test]
#[available_gas(l2_gas: 900000000)]
fn test_once_per_move_forest_reached_from_two_start_spots() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    let straight = Plan::RFFFRFFFR;
    let curve = Plan::RFRFFFFFR;
    // [Loop] top, right, bottom, left (the T-junction `SFRFRFFFR` facing East: north, east, south)
    write(store, g, 100, curve, Orientation::South, OX - 1, OY + 1);
    write(store, g, 101, straight, Orientation::North, OX, OY + 1);
    write(store, g, 102, straight, Orientation::North, OX + 1, OY + 1);
    write(store, g, 103, curve, Orientation::West, OX + 2, OY + 1);
    write(store, g, 104, straight, Orientation::East, OX + 2, OY);
    write(store, g, 105, straight, Orientation::East, OX + 2, OY - 1);
    write(store, g, 106, curve, Orientation::North, OX + 2, OY - 2);
    write(store, g, 107, straight, Orientation::North, OX + 1, OY - 2);
    write(store, g, 108, straight, Orientation::North, OX, OY - 2);
    write(store, g, 109, curve, Orientation::East, OX - 1, OY - 2);
    write(store, g, 110, straight, Orientation::East, OX - 1, OY - 1);
    write(store, g, 111, Plan::SFRFRFFFR, Orientation::East, OX - 1, OY);
    // [Inside] the wonder that ends the straight road, and two wonders below
    write(store, g, 112, Plan::WFFFFFFFR, Orientation::North, OX + 1, OY);
    write(store, g, 113, Plan::WFFFFFFFF, Orientation::North, OX, OY - 1);
    write(store, g, 114, Plan::WFFFFFFFF, Orientation::North, OX + 1, OY - 1);
    let mut spy = spy_events();
    put(store, systems.daily, g, p, straight, Orientation::North, OX, OY);
    assert_eq!(count_scored(ref spy, Category::Forest), 1, "the forest scores once");
    assert_eq!(count_scored(ref spy, Category::Road), 1, "the road scores once");
    assert_eq!(count_scored(ref spy, Category::Wonder), 3, "each wonder once");
    assert_eq!(store.game(g).forests(), 1, "one forest counted");
    assert_eq!(store.game(g).wonders(), 3, "three wonders counted");
    assert!(store.game(g).score.is_non_zero());
}
