//! Woodsman and Herdsman (phase P4, rules of 2024 restored from `b0f837e^`).
//!
//! A forest is scored when it is closed: every tile around it exists and every road adjacent to it
//! is closed. The Woodsman gets `closed adjacent roads x 300 x bonus(size)`, the Herdsman
//! `closed adjacent cities x 300 x bonus(size)` (bonus curve `1.0235^size`, `compute_multiplier`).
//!
//! Boards (plans are written `Center, NW, N, NE, E, SE, S, SW, W`, see `types/plan.cairo`). The
//! starter tile `RFFFRFCFR`, facing South, lies at `CENTER`: city to the north, road from west to
//! east, forest to the south. Every other tile is forced into the builder's hand, as the other e2e
//! tests do.
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

use paved::constants;
use paved::events::{Event as PavedEvent, Scored};
use paved::models::builder::Builder;
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
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::views::{CharacterView, IGameViewDispatcher, IGameViewDispatcherTrait};
use snforge_std::{EventSpyAssertionsTrait, interact_with_state, spy_events};

/// Bit of a role in `Builder.characters`: the role code is the index of the bit.
const WOODSMAN_BIT: u16 = 64;
const HERDSMAN_BIT: u16 = 128;

/// Builds `plan` at (`x`, `y`) with `role` on `spot`, as the builder of the game.
fn put(
    store: TestStore,
    daily: IDailyDispatcher,
    game_id: u32,
    player_id: felt252,
    plan: Plan,
    orientation: Orientation,
    x: u32,
    y: u32,
    role: Role,
    spot: Spot,
) {
    let game = store.game(game_id);
    let builder = store.builder(game, player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = plan.into();
    store.set_tile(tile);
    daily.build(game_id, orientation, x, y, role, spot);
    // [Check] The structure state of the built tile agrees with the walks (P5-4)
    check::assert_tile_agrees(store, game_id, builder.tile_id);
}

fn builder(store: TestStore, game_id: u32, player_id: felt252) -> Builder {
    store.builder(store.game(game_id), player_id)
}

/// Reads the forest at `at` of the tile placed at (`x`, `y`) with the walk of the oracle:
/// (size, woodsman score, herdsman score, woodsmen found, herdsmen found).
fn forest_at(
    store: TestStore, game_id: u32, x: u32, y: u32, at: Spot,
) -> (u32, u32, u32, u32, u32) {
    interact_with_state(
        store.contract,
        || {
            let mut s = StoreImpl::new();
            let game = s.game(game_id);
            let tile = s.tile(game, s.tile_position(game, x, y).tile_id);
            let (count, woodsman, herdsman, woodsmen, herdsmen) = ForestCount::start(
                game, tile, at, ref s,
            );
            (count, woodsman, herdsman, woodsmen.len(), herdsmen.len())
        },
    )
}


/// The Scored event of a forest.
fn scored(game_id: u32, player_id: felt252, size: u32, points: u32) -> Daily::Event {
    Daily::Event::PavedEvent(
        PavedEvent::Scored(
            Scored { game_id, player_id, category: Category::Forest.into(), size, points },
        ),
    )
}

// Boards. Each function plays the moves of the board and stops before `last` when it is told to
// leave the board one tile short (`closing == false`), so that a test can look at the board both
// ways. `woodsman` and `herdsman` put the character of the role on the first tile.

/// Ring: four curves `RFRFFFFFR` around the corner at (`CENTER`+1, `CENTER`-1) (their common
/// corner). Facing South the curve joins its east and south edges, facing West its west and
/// south, North its north and west, East its north and east: the four roads make one closed loop
/// under the starter, and the four corners inside make the forest of 4 tiles.
fn ring(store: TestStore, daily: IDailyDispatcher, g: u32, p: felt252, role: Role, closing: bool) {
    let spot = if role == Role::None {
        Spot::None
    } else {
        Spot::SouthEast
    };
    put(store, daily, g, p, Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 1, role, spot);
    put(
        store,
        daily,
        g,
        p,
        Plan::RFRFFFFFR,
        Orientation::West,
        CENTER + 1,
        CENTER - 1,
        Role::None,
        Spot::None,
    );
    put(
        store,
        daily,
        g,
        p,
        Plan::RFRFFFFFR,
        Orientation::North,
        CENTER + 1,
        CENTER - 2,
        Role::None,
        Spot::None,
    );
    if closing {
        put(
            store,
            daily,
            g,
            p,
            Plan::RFRFFFFFR,
            Orientation::East,
            CENTER,
            CENTER - 2,
            Role::None,
            Spot::None,
        );
    }
}

/// Crossings: four road crossings `SFRFRFRFR` (a stop at the center, one road to each edge, a
/// corner forest between two roads) in a 2x2 block east of the starter. The corner of each tile
/// that faces the middle of the block belongs to the forest of 4 tiles; the 4 roads between the
/// tiles of the block are closed (each runs from a stop to a stop).
fn crossings(
    store: TestStore, daily: IDailyDispatcher, g: u32, p: felt252, role: Role, closing: bool,
) {
    let spot = if role == Role::None {
        Spot::None
    } else {
        Spot::SouthEast
    };
    put(store, daily, g, p, Plan::SFRFRFRFR, Orientation::North, CENTER + 1, CENTER, role, spot);
    put(
        store,
        daily,
        g,
        p,
        Plan::SFRFRFRFR,
        Orientation::North,
        CENTER + 2,
        CENTER,
        Role::None,
        Spot::None,
    );
    put(
        store,
        daily,
        g,
        p,
        Plan::SFRFRFRFR,
        Orientation::North,
        CENTER + 1,
        CENTER - 1,
        Role::None,
        Spot::None,
    );
    if closing {
        put(
            store,
            daily,
            g,
            p,
            Plan::SFRFRFRFR,
            Orientation::North,
            CENTER + 2,
            CENTER - 1,
            Role::None,
            Spot::None,
        );
    }
}

/// Sandwich: a straight road east of the starter, and another one above it. The forest between
/// them has 2 tiles and no open side, but both roads next to it are open at both ends.
/// The character of `role` stands on the forest of the lower tile.
fn sandwich(store: TestStore, daily: IDailyDispatcher, g: u32, p: felt252, role: Role) {
    let spot = if role == Role::None {
        Spot::None
    } else {
        Spot::North
    };
    put(store, daily, g, p, Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER, role, spot);
    put(
        store,
        daily,
        g,
        p,
        Plan::RFFFRFFFR,
        Orientation::North,
        CENTER + 1,
        CENTER + 1,
        Role::None,
        Spot::None,
    );
}

/// What closes the north of the corridors of the herdsman boards.
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
/// when `top` is not `Open`. The character of `role` stands on the east side of the first corridor.
fn corridors(
    store: TestStore,
    daily: IDailyDispatcher,
    g: u32,
    p: felt252,
    role: Role,
    top: Top,
    closing: bool,
) {
    let spot = if role == Role::None {
        Spot::None
    } else {
        Spot::East
    };
    put(store, daily, g, p, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, role, spot);
    if top == Top::Caps {
        put(
            store,
            daily,
            g,
            p,
            Plan::FFFFFFCFF,
            Orientation::North,
            CENTER,
            CENTER + 2,
            Role::None,
            Spot::None,
        );
        put(
            store,
            daily,
            g,
            p,
            Plan::FFFFFFCFF,
            Orientation::North,
            CENTER + 1,
            CENTER + 2,
            Role::None,
            Spot::None,
        );
    }
    if top == Top::Arch {
        put(
            store,
            daily,
            g,
            p,
            Plan::FFFFCCCFF,
            Orientation::North,
            CENTER,
            CENTER + 2,
            Role::None,
            Spot::None,
        );
        put(
            store,
            daily,
            g,
            p,
            Plan::FFFFCCCFF,
            Orientation::East,
            CENTER + 1,
            CENTER + 2,
            Role::None,
            Spot::None,
        );
    }
    if top != Top::Open {
        put(
            store,
            daily,
            g,
            p,
            Plan::RFFFRFCFR,
            Orientation::South,
            CENTER + 1,
            CENTER,
            Role::None,
            Spot::None,
        );
    }
    if closing {
        put(
            store,
            daily,
            g,
            p,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER + 1,
            CENTER + 1,
            Role::None,
            Spot::None,
        );
    }
}

// The forest helper alone, on boards without characters.

#[test]
#[available_gas(l2_gas: 209546591)]
fn test_forest_helper_ring_open_then_closed() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    ring(store, systems.daily, g, p, Role::None, false);
    // One tile short: a neighbour of the forest is missing.
    let (count, _, _, woodsmen, herdsmen) = forest_at(
        store, g, CENTER, CENTER - 1, Spot::SouthEast,
    );
    assert_eq!(count, 0, "open ring: size");
    assert_eq!((woodsmen, herdsmen), (0, 0), "open ring: characters");
    // Complete: 4 tiles, the loop of roads around it counted once.
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::RFRFFFFFR,
        Orientation::East,
        CENTER,
        CENTER - 2,
        Role::None,
        Spot::None,
    );
    let (count, woodsman, herdsman, _, _) = forest_at(
        store, g, CENTER, CENTER - 2, Spot::NorthEast,
    );
    assert_eq!((count, woodsman, herdsman), (4, 1, 0), "closed ring");
    // Same forest from another tile of it.
    let (count, woodsman, herdsman, _, _) = forest_at(
        store, g, CENTER + 1, CENTER - 1, Spot::SouthWest,
    );
    assert_eq!((count, woodsman, herdsman), (4, 1, 0), "closed ring, other tile");
}

#[test]
#[available_gas(l2_gas: 256935665)]
fn test_forest_helper_crossings_count_each_road() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    crossings(store, systems.daily, g, p, Role::None, true);
    let (count, woodsman, herdsman, _, _) = forest_at(
        store, g, CENTER + 1, CENTER, Spot::SouthEast,
    );
    assert_eq!((count, woodsman, herdsman), (4, 4, 0), "four distinct closed roads");
}

#[test]
#[available_gas(l2_gas: 124697469)]
fn test_forest_helper_sandwich_open_roads() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    sandwich(store, systems.daily, g, p, Role::None);
    // Every tile around the forest exists, but the roads next to it are open: not closed.
    let (count, _, _, _, _) = forest_at(store, g, CENTER + 1, CENTER, Spot::North);
    assert_eq!(count, 0, "lower tile");
    let (count, _, _, _, _) = forest_at(store, g, CENTER + 1, CENTER + 1, Spot::South);
    assert_eq!(count, 0, "upper tile");
}

#[test]
#[available_gas(l2_gas: 211788689)]
fn test_forest_helper_one_city_touched_twice_counts_once() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Role::None, Top::Arch, true);
    // The two corridors are the same city (joined by the arch): one city for 2 touches.
    let (count, woodsman, herdsman, _, _) = forest_at(store, g, CENTER, CENTER + 1, Spot::East);
    assert_eq!((count, woodsman, herdsman), (2, 0, 1), "arch");
    let (count, woodsman, herdsman, _, _) = forest_at(store, g, CENTER + 1, CENTER + 1, Spot::West);
    assert_eq!((count, woodsman, herdsman), (2, 0, 1), "arch, other tile");
}

#[test]
#[available_gas(l2_gas: 203231235)]
fn test_forest_helper_two_cities_count_twice() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Role::None, Top::Caps, true);
    let (count, woodsman, herdsman, _, _) = forest_at(store, g, CENTER, CENTER + 1, Spot::East);
    assert_eq!((count, woodsman, herdsman), (2, 0, 2), "caps");
}

#[test]
#[available_gas(l2_gas: 125033069)]
fn test_forest_helper_open_cities_do_not_count_nor_block() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Role::None, Top::Open, true);
    // Both cities are open: the forest is closed all the same, and no city counts.
    let (count, woodsman, herdsman, _, _) = forest_at(store, g, CENTER, CENTER + 1, Spot::East);
    assert_eq!((count, woodsman, herdsman), (2, 0, 0), "open cities");
}

#[test]
#[available_gas(l2_gas: 123970389)]
fn test_forest_helper_collects_the_characters_of_an_open_forest() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    sandwich(store, systems.daily, g, p, Role::Woodsman);
    // Walking from the tile of the woodsman: it is met before the open road stops the walk.
    let (count, _, _, woodsmen, herdsmen) = forest_at(store, g, CENTER + 1, CENTER, Spot::North);
    assert_eq!(count, 0, "open: no size");
    assert_eq!((woodsmen, herdsmen), (1, 0), "the woodsman is met");
}

// Scoring.

#[test]
#[available_gas(l2_gas: 156058364)]
fn test_forest_woodsman_waits_for_the_last_tile_of_the_ring() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    ring(store, systems.daily, g, p, Role::Woodsman, false);
    assert_eq!(store.game(g).score, 0, "score");
    assert_eq!(builder(store, g, p).characters, WOODSMAN_BIT, "the woodsman is still there");
}

/// By hand: the forest has 4 tiles, one closed road touches it (the loop, counted once):
/// 1 x 300 x bonus(4); bonus(4) = 10972 / 10000 (10235^2 / 10000 = 10475, 10475^2 / 10000 = 10972),
/// so 300 x 10972 / 10000 = 329.
#[test]
#[available_gas(l2_gas: 203024963)]
fn test_forest_woodsman_scores_the_closed_ring() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    ring(store, systems.daily, g, p, Role::Woodsman, false);
    let mut spy = spy_events();
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::RFRFFFFFR,
        Orientation::East,
        CENTER,
        CENTER - 2,
        Role::None,
        Spot::None,
    );
    assert_eq!(store.game(g).score, 329, "score");
    assert_eq!(builder(store, g, p).characters, 0, "the woodsman is back");
    spy.assert_emitted(@array![(systems.daily.contract_address, scored(g, p, 4, 329))]);
}

/// By hand: 4 closed roads x 300 x bonus(4) = 4 x 300 x 10972 / 10000 = 1316.
#[test]
#[available_gas(l2_gas: 258713903)]
fn test_forest_woodsman_scores_four_roads() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    crossings(store, systems.daily, g, p, Role::Woodsman, false);
    assert_eq!(store.game(g).score, 0, "score before the last tile");
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::SFRFRFRFR,
        Orientation::North,
        CENTER + 2,
        CENTER - 1,
        Role::None,
        Spot::None,
    );
    assert_eq!(store.game(g).score, 1316, "score");
    assert_eq!(builder(store, g, p).characters, 0, "the woodsman is back");
}

#[test]
#[available_gas(l2_gas: 124605213)]
fn test_forest_woodsman_stays_while_an_adjacent_road_is_open() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    sandwich(store, systems.daily, g, p, Role::Woodsman);
    assert_eq!(store.game(g).score, 0, "score");
    assert_eq!(builder(store, g, p).characters, WOODSMAN_BIT, "the woodsman waits");
}

/// By hand: the forest has 2 tiles, the city of the arch (starter cap, two corridors, two corners,
/// one more cap: 6 tiles, closed) is one city, touched twice: 1 x 300 x bonus(2) =
/// 300 x 10475 / 10000 = 314.
#[test]
#[available_gas(l2_gas: 209063349)]
fn test_forest_herdsman_scores_one_city_touched_twice_once() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Role::Herdsman, Top::Arch, false);
    assert_eq!(store.game(g).score, 0, "score before the last tile");
    let mut spy = spy_events();
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::CFFFCFFFC,
        Orientation::East,
        CENTER + 1,
        CENTER + 1,
        Role::None,
        Spot::None,
    );
    assert_eq!(store.game(g).score, 314, "score");
    assert_eq!(builder(store, g, p).characters, 0, "the herdsman is back");
    spy.assert_emitted(@array![(systems.daily.contract_address, scored(g, p, 2, 314))]);
}

/// By hand: 2 cities x 300 x bonus(2) = 2 x 300 x 10475 / 10000 = 628 (628.5 rounded down).
#[test]
#[available_gas(l2_gas: 204901007)]
fn test_forest_herdsman_scores_two_cities() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Role::Herdsman, Top::Caps, false);
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::CFFFCFFFC,
        Orientation::East,
        CENTER + 1,
        CENTER + 1,
        Role::None,
        Spot::None,
    );
    assert_eq!(store.game(g).score, 628, "score");
    assert_eq!(builder(store, g, p).characters, 0, "the herdsman is back");
}

#[test]
#[available_gas(l2_gas: 129978851)]
fn test_forest_herdsman_is_back_with_nothing_when_no_city_is_closed() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    corridors(store, systems.daily, g, p, Role::Herdsman, Top::Open, false);
    assert_eq!(builder(store, g, p).characters, HERDSMAN_BIT, "waits for the second corridor");
    let mut spy = spy_events();
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::CFFFCFFFC,
        Orientation::East,
        CENTER + 1,
        CENTER + 1,
        Role::None,
        Spot::None,
    );
    // The forest is closed, the cities are not: no point, but the character comes back.
    assert_eq!(store.game(g).score, 0, "score");
    assert_eq!(builder(store, g, p).characters, 0, "the herdsman is back");
    spy.assert_emitted(@array![(systems.daily.contract_address, scored(g, p, 2, 0))]);
}

/// P-15: one city, open, touched at two places by the forest (the board of
/// `golden/forest.cairo`, `herdsman_open_city_moves`). The 2024 walk counted it once (314); an open
/// city never counts: the Herdsman is back with a `Scored` of 0 points. The oracle's walk,
/// corrected the same way, agrees (`put` checks the structure state against it after every build).
#[test]
#[available_gas(l2_gas: 213871312)]
fn test_forest_herdsman_open_city_touched_twice_scores_nothing() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    let daily = systems.daily;
    put(
        store,
        daily,
        g,
        p,
        Plan::RFFFRFCFR,
        Orientation::South,
        CENTER + 1,
        CENTER,
        Role::None,
        Spot::None,
    );
    put(
        store,
        daily,
        g,
        p,
        Plan::CFFFCFFFC,
        Orientation::East,
        CENTER + 1,
        CENTER + 1,
        Role::Herdsman,
        Spot::West,
    );
    put(
        store,
        daily,
        g,
        p,
        Plan::FFFFCCCFF,
        Orientation::East,
        CENTER + 1,
        CENTER + 2,
        Role::None,
        Spot::None,
    );
    put(
        store,
        daily,
        g,
        p,
        Plan::CCCCCFFFC,
        Orientation::South,
        CENTER,
        CENTER + 2,
        Role::None,
        Spot::None,
    );
    assert_eq!(builder(store, g, p).characters, HERDSMAN_BIT, "the herdsman waits");
    let mut spy = spy_events();
    put(
        store,
        daily,
        g,
        p,
        Plan::CFFFCFFFC,
        Orientation::East,
        CENTER,
        CENTER + 1,
        Role::None,
        Spot::None,
    );
    // The forest of 2 tiles is closed, the only city around it is open: no city counts
    let (count, woodsman, herdsman, _, _) = forest_at(store, g, CENTER, CENTER + 1, Spot::East);
    assert_eq!((count, woodsman, herdsman), (2, 0, 0), "the walk");
    assert_eq!(store.game(g).score, 0, "score");
    assert_eq!(builder(store, g, p).characters, 0, "the herdsman is back");
    spy.assert_emitted(@array![(daily.contract_address, scored(g, p, 2, 0))]);
}

/// The Woodsman is also allowed on a road, where it counts like a Lord (weight and power 1).
/// By hand: the road has 3 tiles (two road ends and the starter), 3 x 100 x 1 x bonus(3) =
/// 3 x 100 x 10721 / 10000 = 321 (10235 x 10475 / 10000 = 10721).
#[test]
#[available_gas(l2_gas: 135015378)]
fn test_forest_woodsman_on_a_road_counts_like_a_lord() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::WFFFFFFFR,
        Orientation::North,
        CENTER + 1,
        CENTER,
        Role::Woodsman,
        Spot::West,
    );
    assert_eq!(builder(store, g, p).characters, WOODSMAN_BIT, "placed on the open road");
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::WFFFFFFFR,
        Orientation::South,
        CENTER - 1,
        CENTER,
        Role::None,
        Spot::None,
    );
    assert_eq!(store.game(g).score, 321, "score");
    assert_eq!(builder(store, g, p).characters, 0, "the woodsman is back");
}

/// The Herdsman is also allowed on a city, where it counts like a Lord (weight and power 1).
/// By hand: the city has 2 tiles (the starter cap and the new cap), 2 x 200 x 1 x bonus(2) =
/// 2 x 200 x 10475 / 10000 = 419.
#[test]
#[available_gas(l2_gas: 99271337)]
fn test_forest_herdsman_on_a_city_counts_like_a_lord() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::FFFFFFCFF,
        Orientation::North,
        CENTER,
        CENTER + 1,
        Role::Herdsman,
        Spot::South,
    );
    assert_eq!(store.game(g).score, 419, "score");
    assert_eq!(builder(store, g, p).characters, 0, "the herdsman is back");
}

// Where a role may stand.

#[test]
#[should_panic(expected: 'Role: not allowed')]
fn test_forest_woodsman_not_allowed_on_a_city() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::FFFFFFCFF,
        Orientation::North,
        CENTER,
        CENTER + 1,
        Role::Woodsman,
        Spot::South,
    );
}

#[test]
#[should_panic(expected: 'Role: not allowed')]
fn test_forest_herdsman_not_allowed_on_a_road() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::RFFFRFFFR,
        Orientation::North,
        CENTER + 1,
        CENTER,
        Role::Herdsman,
        Spot::West,
    );
}

#[test]
#[should_panic(expected: 'Role: not allowed')]
fn test_forest_lord_not_allowed_on_a_forest() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::RFFFRFFFR,
        Orientation::North,
        CENTER + 1,
        CENTER,
        Role::Lord,
        Spot::North,
    );
}

#[test]
#[should_panic(expected: 'Builder: already placed')]
fn test_forest_woodsman_only_once() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    sandwich(store, systems.daily, g, p, Role::Woodsman);
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::RFFFRFFFR,
        Orientation::North,
        CENTER + 2,
        CENTER,
        Role::Woodsman,
        Spot::South,
    );
}

#[test]
#[should_panic(expected: 'Game: structure not idle')]
fn test_forest_second_character_on_the_same_forest_is_refused() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    // The woodsman waits on the inner forest of the ring: the herdsman cannot join it there.
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::RFRFFFFFR,
        Orientation::South,
        CENTER,
        CENTER - 1,
        Role::Woodsman,
        Spot::SouthEast,
    );
    put(
        store,
        systems.daily,
        g,
        p,
        Plan::RFRFFFFFR,
        Orientation::West,
        CENTER + 1,
        CENTER - 1,
        Role::Herdsman,
        Spot::SouthWest,
    );
}

// Views.

#[test]
#[available_gas(l2_gas: 159419299)]
fn test_forest_views_list_the_two_roles() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let (g, p) = (context.game_id, context.player_id);
    let views = IGameViewDispatcher { contract_address: systems.daily.contract_address };
    assert_eq!(views.builder(g, p).available_count, 7, "seven characters");
    ring(store, systems.daily, g, p, Role::Woodsman, false);
    let builder_view = views.builder(g, p);
    assert_eq!((builder_view.placed_count, builder_view.available_count), (1, 6), "counts");
    let characters = views.characters(g, p);
    assert_eq!(characters.len(), 7, "one per role");
    let woodsman = *characters.at(5);
    let expected = CharacterView {
        role: Role::Woodsman.into(),
        placed: true,
        tile_id: 2,
        x: CENTER,
        y: CENTER - 1,
        spot: Spot::SouthEast.into(),
    };
    assert_eq!(woodsman, expected, "woodsman placed");
    let herdsman = *characters.at(6);
    let expected = CharacterView {
        role: Role::Herdsman.into(), placed: false, tile_id: 0, x: 0, y: 0, spot: 0,
    };
    assert_eq!(herdsman, expected, "herdsman not placed");
}
