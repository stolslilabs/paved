//! Gas baseline of one `Daily.build` call on five scenarios (phase P0).
//!
//! Each test plays a deterministic sequence of moves and isolates the L2 (Sierra) gas of the LAST
//! `build` call only: the gas available to the test is read right before and right after that
//! call, so the setup, the spawn and the preparatory moves are excluded. Every scenario asserts a
//! ceiling set 5 % above the figure measured on the pinned toolchain, so a regression fails CI.
//!
//! The tile held by the builder is overwritten with the plan we want (same technique as the e2e
//! tests), so the sequences do not depend on the random draw. Plans are kept within the
//! composition of the deck: no plan is used more often than the Base deck contains it.
//!
//! Plans are written `Center, NW, N, NE, E, SE, S, SW, W` (see `types/plan.cairo`). Used below:
//! - `RFFFRFFFR`: a straight W-E road.
//! - `FFCFFFCFF`: two separate city caps, on the N and S edges.
//! - `CFFFCFFFC`: a city corridor, W-E when facing North, N-S when facing East.
//! - `FFFFCCCFF`: a city corner, E+S when facing North, S+W East, W+N South, N+E West.
//! - `CCCCCFFFC`: a city T-junction, N+E+W when facing North, S+E+W when facing South.
//! - `FFFFFFCFF`: a city cap on the S edge, facing North; W edge facing East, N edge facing South.
//! - `RFRFFFFFR`: a road curve N+W facing North, E+N East, S+E South, W+S West; one forest in the
//!   corner between the roads and one around the outside.
//! - `RFFFRFFFR`: a straight road, W-E facing North, N-S facing East, forests on both sides.
//! - `WFFFFFFFF`: a wonder (its centre) in a ring of forest on every edge.
//! The starter tile (`RFFFRFCFR`, facing South) is a city cap on its N edge with a W-E road.

use core::testing::get_available_gas;
use paved::constants::CENTER;
use paved::structure::placement::role_bit;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use crate::setup::setup;
use crate::setup::setup::{IDailyDispatcherTrait, Systems, TestStore, TestStoreTrait};

// Ceilings: measured figure + 5 %, rounded up (see docs/measures/baseline.md).
pub const CEILING_OPEN: u128 = 5869212;
pub const CEILING_SIMPLE: u128 = 5329081;
pub const CEILING_CHARACTER: u128 = 6350300;
pub const CEILING_CLOSE_LARGE: u128 = 6392332;
pub const CEILING_WORST_CASE: u128 = 7325796;
pub const CEILING_FOREST: u128 = 9756082;
pub const CEILING_FOREST_WORST: u128 = 19956685;

#[derive(Drop)]
struct Scenario {
    systems: Systems,
    store: TestStore,
    game_id: u32,
    player_id: felt252,
}

#[generate_trait]
impl ScenarioImpl of ScenarioTrait {
    fn new() -> Scenario {
        let (store, systems, context) = setup::spawn_game(Mode::Daily);
        Scenario { systems, store, game_id: context.game_id, player_id: context.player_id }
    }

    /// Overwrites the plan of the tile held by the builder, then builds it. Returns the L2 gas
    /// consumed by the `build` call alone.
    fn build(
        self: @Scenario,
        plan: Plan,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    ) -> u128 {
        let game = self.store.game(*self.game_id);
        let builder = self.store.builder(game, *self.player_id);
        let mut tile = self.store.tile(game, builder.tile_id);
        tile.plan = plan.into();
        self.store.set_tile(tile);

        let before = get_available_gas();
        self.systems.daily.build(*self.game_id, orientation, x, y, role, spot);
        let after = get_available_gas();
        before - after
    }

    /// Builds a tile without a character.
    fn step(self: @Scenario, plan: Plan, orientation: Orientation, x: u32, y: u32) {
        self.build(plan, orientation, x, y, Role::None, Spot::None);
    }
}

fn report(name: ByteArray, gas: u128, ceiling: u128) {
    println!("GAS {}: {}", name, gas);
    assert(gas <= ceiling, 'Gas: above ceiling');
}

/// a0. Open simple move: a road tile east of the starter tile; it closes nothing, no character.
#[test]
fn test_gas_a0_open_simple_move() {
    let s = ScenarioTrait::new();
    let gas = s
        .build(Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER, Role::None, Spot::None);
    report("a0_open_simple_move", gas, CEILING_OPEN);
}

/// a. Simple move that closes a 2-tile city: the new tile's S cap meets the starter's N cap (the
/// city is scored only if a character is in it, none here), no character.
#[test]
fn test_gas_a_simple_move() {
    let s = ScenarioTrait::new();
    let gas = s
        .build(Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);
    report("a_simple_move", gas, CEILING_SIMPLE);
}

/// b. Same move as (a) with a character placed on the new tile.
#[test]
fn test_gas_b_move_with_character() {
    let s = ScenarioTrait::new();
    let gas = s
        .build(Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1, Role::Lord, Spot::North);
    report("b_move_with_character", gas, CEILING_CHARACTER);
}

/// c. Closes a 6-tile city that holds one character (scoring and character recovery included).
///
/// starter (cap N) - corridor - corridor - corridor - corner - cap, going north then east.
#[test]
fn test_gas_c_close_large_city() {
    let s = ScenarioTrait::new();
    // The character sits on the first corridor, which is idle when it is placed.
    s.build(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, Role::Lord, Spot::Center);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 4);
    // The cap closes the city: the character is scored and recovered.
    let gas = s
        .build(Plan::FFFFFFCFF, Orientation::East, CENTER + 1, CENTER + 4, Role::None, Spot::None);
    let game = s.store.game(s.game_id);
    assert(game.score > 0, 'Gas: city not scored');
    report("c_close_large_city", gas, CEILING_CLOSE_LARGE);
}

/// d. Worst case we can build: the last tile of a 12-tile city tree, placed with a character.
///
/// The city is a tree rooted on the starter tile: two corridors and a T-junction going north, then
/// two arms of four and three tiles that stay open until the last move. The last tile (a cap)
/// closes the second arm and therefore the whole tree. On this single move:
/// - the conflict check (`assert_structure_idle`) walks the 11 existing tiles, none of them holds
///   a character, so the walk is not short-circuited;
/// - the assessment walks the whole closed tree again (12 tiles), finds the new character, solves
///   it, recovers it and scores the structure.
/// Every earlier closing attempt stops at the first open end, so only the last move pays for the
/// whole tree.
#[test]
fn test_gas_d_worst_case() {
    let s = ScenarioTrait::new();
    // [Spine] going north from the starter tile, ending on a T-junction
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1);
    s.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    s.step(Plan::CCCCCFFFC, Orientation::South, CENTER, CENTER + 3);
    // [West arm] corridor, corner, corner, cap
    s.step(Plan::CFFFCFFFC, Orientation::North, CENTER - 1, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER - 2, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::South, CENTER - 2, CENTER + 2);
    s.step(Plan::FFFFFFCFF, Orientation::West, CENTER - 3, CENTER + 2);
    // [East arm] corner, corner, corner, then the closing cap with a character
    s.step(Plan::FFFFCCCFF, Orientation::South, CENTER + 1, CENTER + 3);
    s.step(Plan::FFFFCCCFF, Orientation::North, CENTER + 1, CENTER + 4);
    s.step(Plan::FFFFCCCFF, Orientation::East, CENTER + 2, CENTER + 4);
    let gas = s
        .build(
            Plan::FFFFFFCFF, Orientation::South, CENTER + 2, CENTER + 3, Role::Lord, Spot::North,
        );
    let game = s.store.game(s.game_id);
    assert(game.score > 0, 'Gas: tree not scored');
    report("d_worst_case", gas, CEILING_WORST_CASE);
}

/// e. Closes a forest of 4 tiles that holds a Woodsman (scoring, character recovery and the forest
/// scan included).
///
/// Four road curves under the starter close a loop of road around one corner; their inner corners
/// are one forest. The Woodsman waits on the first curve, the fourth closes the loop and scores
/// 1 road x 300 x bonus(4) = 329 (the P4 golden `daily_forest_woodsman_ring`).
#[test]
fn test_gas_e_close_forest() {
    let s = ScenarioTrait::new();
    s
        .build(
            Plan::RFRFFFFFR,
            Orientation::South,
            CENTER,
            CENTER - 1,
            Role::Woodsman,
            Spot::SouthEast,
        );
    s.step(Plan::RFRFFFFFR, Orientation::West, CENTER + 1, CENTER - 1);
    s.step(Plan::RFRFFFFFR, Orientation::North, CENTER + 1, CENTER - 2);
    let gas = s
        .build(Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2, Role::None, Spot::None);
    let game = s.store.game(s.game_id);
    assert(game.score == 329, 'Gas: forest not scored');
    report("e_close_forest", gas, CEILING_FOREST);
}

/// f. Worst forest scan we can build: the last tile closes a forest of 16 nodes that holds a
/// Woodsman, inside a loop of 12 road tiles.
///
/// The starter tile is the top edge of the loop (its south forest is the inside). The loop goes
/// east along the top, down the right column, west along the bottom, up the left column; four
/// wonder tiles (`WFFFFFFFF`, every edge forest) fill the 2 x 2 inside. The last tile is the
/// top-left curve: it closes the loop of road and the forest, and the scan walks the 16 nodes (the
/// four wonder tiles, the eight inner sides of the straights, the four inner corners), every tile
/// of the inside read from its position. The Woodsman waits on the first straight.
///
/// ```text
///   y=0    curve*  starter  straight  curve
///   y=-1   straight  wonder  wonder   straight
///   y=-2   straight  wonder  wonder   straight
///   y=-3   curve   straight  straight curve        (* the last tile)
///          x=-1    x=0      x=1       x=2
/// ```
#[test]
fn test_gas_f_worst_forest_scan() {
    let s = ScenarioTrait::new();
    let straight = Plan::RFFFRFFFR;
    let curve = Plan::RFRFFFFFR;
    // [Top and right] the first straight carries the Woodsman on its inner forest
    s.build(straight, Orientation::North, CENTER + 1, CENTER, Role::Woodsman, Spot::South);
    s.step(curve, Orientation::West, CENTER + 2, CENTER);
    s.step(straight, Orientation::East, CENTER + 2, CENTER - 1);
    s.step(straight, Orientation::East, CENTER + 2, CENTER - 2);
    s.step(curve, Orientation::North, CENTER + 2, CENTER - 3);
    // [Bottom and left]
    s.step(straight, Orientation::North, CENTER + 1, CENTER - 3);
    s.step(straight, Orientation::North, CENTER, CENTER - 3);
    s.step(curve, Orientation::East, CENTER - 1, CENTER - 3);
    s.step(straight, Orientation::East, CENTER - 1, CENTER - 2);
    s.step(straight, Orientation::East, CENTER - 1, CENTER - 1);
    // [Inside] the four wonders
    s.step(Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 1);
    s.step(Plan::WFFFFFFFF, Orientation::North, CENTER + 1, CENTER - 1);
    s.step(Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 2);
    s.step(Plan::WFFFFFFFF, Orientation::North, CENTER + 1, CENTER - 2);
    // [Last tile] the top-left curve closes the loop and the forest
    let gas = s.build(curve, Orientation::South, CENTER - 1, CENTER, Role::None, Spot::None);
    let game = s.store.game(s.game_id);
    // The forest scores exactly this, and its Woodsman is back in the builder's hand
    assert_eq!(game.score, 434);
    let builder = s.store.builder(game, s.player_id);
    let woodsman: u8 = Role::Woodsman.into();
    assert(builder.characters & role_bit(woodsman) == 0, 'Gas: Woodsman not recovered');
    println!("SCORE f_worst_forest_scan: {}", game.score);
    report("f_worst_forest_scan", gas, CEILING_FOREST_WORST);
}
