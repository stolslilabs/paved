//! `Challenge.build` refuses a position that cannot be on the board with `'Challenge: invalid
//! position'`, before any read or write. A build reads the 8 neighbours of `(x, y)`, so the
//! positions that could never be valid are exactly those where `x - 1`, `x + 1`, `y - 1` or `y + 1`
//! leaves `u32`: `x` or `y` equal to 0 or to `u32::MAX`. The board has no other bound (`CENTER`
//! is only where the starter tile lies). Before the check, `build(.., 0, 0)` reverted with a raw
//! `u32_sub Overflow`.

use paved::models::tile::{CENTER, Tile};
use paved::systems::challenge::{IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, Systems, TestStore, TestStoreTrait};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;

const MAX: u32 = 0xffffffff;
const INVALID: felt252 = 'Challenge: invalid position';
/// Tile ids (this one and the next) no draw reaches in these tests.
const OTHER: u32 = 50;

fn safe(systems: @Systems) -> IChallengeSafeDispatcher {
    IChallengeSafeDispatcher { contract_address: *systems.challenge.contract_address }
}

/// The reason `build` reverts with at (`x`, `y`).
#[feature("safe_dispatcher")]
fn reason_at(systems: @Systems, game_id: u32, x: u32, y: u32) -> felt252 {
    *safe(systems).build(game_id, Orientation::North, x, y).unwrap_err().at(0)
}

/// Sets the plan of the tile in hand.
fn force_plan(store: TestStore, game_id: u32, plan: Plan) {
    let game = store.game(game_id);
    let builder = store.builder(game, setup::PLAYER().into());
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = plan.into();
    store.set_tile(tile);
}

/// Writes a road tile (`RFFFRFFFR`) at (`x`, `y`), without a build.
fn write_road(store: TestStore, game_id: u32, id: u32, orientation: Orientation, x: u32, y: u32) {
    store
        .set_tile(
            Tile {
                game_id,
                id,
                plan: Plan::RFFFRFFFR.into(),
                orientation: orientation.into(),
                x,
                y,
                owner: 0,
            },
        );
}

#[test]
#[feature("safe_dispatcher")]
fn test_position_lower_edge_reverts_named() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let id = context.game_id;
    assert(reason_at(@systems, id, 0, 0) == INVALID, 'Position: (0, 0)');
    assert(reason_at(@systems, id, 0, CENTER) == INVALID, 'Position: (0, CENTER)');
    assert(reason_at(@systems, id, CENTER, 0) == INVALID, 'Position: (CENTER, 0)');
    assert(reason_at(@systems, id, 0, 1) == INVALID, 'Position: (0, 1)');
    assert(reason_at(@systems, id, 1, 0) == INVALID, 'Position: (1, 0)');
}

#[test]
#[feature("safe_dispatcher")]
fn test_position_upper_edge_reverts_named() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let id = context.game_id;
    assert(reason_at(@systems, id, MAX, MAX) == INVALID, 'Position: (MAX, MAX)');
    assert(reason_at(@systems, id, MAX, CENTER) == INVALID, 'Position: (MAX, CENTER)');
    assert(reason_at(@systems, id, CENTER, MAX) == INVALID, 'Position: (CENTER, MAX)');
    assert(reason_at(@systems, id, 0, MAX) == INVALID, 'Position: (0, MAX)');
}

/// The refused build leaves the tile in hand and the game as it was.
#[test]
#[feature("safe_dispatcher")]
fn test_position_refused_build_changes_nothing() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let before = store.game(context.game_id);
    let held = store.builder(before, setup::PLAYER().into()).tile_id;
    assert(reason_at(@systems, context.game_id, 0, 0) == INVALID, 'Position: refused');
    let after = store.game(context.game_id);
    assert(after.built == before.built && after.seed == before.seed, 'Position: moved');
    assert(store.builder(after, setup::PLAYER().into()).tile_id == held, 'Position: tile in hand');
}

/// The first valid positions are not refused: they pass the check and the neighbour reads (which
/// is what the check protects), and stop only where a build with no neighbour stops.
#[test]
#[feature("safe_dispatcher")]
fn test_position_nearest_valid_is_not_refused() {
    let (_, systems, context) = setup::spawn_game(Mode::Challenge);
    let id = context.game_id;
    assert(reason_at(@systems, id, 1, 1) == 'Tile: no neighbors', 'Position: (1, 1)');
    assert(reason_at(@systems, id, MAX - 1, MAX - 1) == 'Tile: no neighbors', 'Position: MAX-1');
    assert(reason_at(@systems, id, 1, MAX - 1) == 'Tile: no neighbors', 'Position: (1, MAX-1)');
}

/// A tile that lies on the edge-adjacent column or row takes a neighbour: the build is accepted.
#[test]
fn test_position_edge_adjacent_builds() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let id = context.game_id;
    // [West] x = 1 is valid: a tile at (1, CENTER), the build at (2, CENTER)
    write_road(store, id, OTHER, Orientation::North, 1, CENTER);
    force_plan(store, id, Plan::RFFFRFFFR);
    systems.challenge.build(id, Orientation::North, 2, CENTER);
    assert(store.game(id).built == 1, 'Position: west edge');
    // [East] x = MAX - 1 is valid: a tile at (MAX - 2, CENTER), the build at (MAX - 1, CENTER)
    write_road(store, id, OTHER + 1, Orientation::North, MAX - 2, CENTER);
    force_plan(store, id, Plan::RFFFRFFFR);
    systems.challenge.build(id, Orientation::North, MAX - 1, CENTER);
    assert(store.game(id).built == 2, 'Position: east edge');
}

/// An accepted `build` at x = 1, then at y = 1: the neighbour lies on the board, and the build
/// passes the check and lands.
#[test]
fn test_position_build_at_one_is_accepted() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let id = context.game_id;
    // [x = 1] a tile at (2, CENTER), the build at (1, CENTER)
    write_road(store, id, OTHER, Orientation::North, 2, CENTER);
    force_plan(store, id, Plan::RFFFRFFFR);
    systems.challenge.build(id, Orientation::North, 1, CENTER);
    assert(store.game(id).built == 1, 'Position: x = 1');
    // [y = 1] a tile at (CENTER, 2), the build at (CENTER, 1)
    write_road(store, id, OTHER + 1, Orientation::North, CENTER, 2);
    force_plan(store, id, Plan::RFFFRFFFR);
    systems.challenge.build(id, Orientation::North, CENTER, 1);
    assert(store.game(id).built == 2, 'Position: y = 1');
}

/// The position check comes before the game is read: `build(999, .., 0, 0)` on a game that does
/// not exist reverts with the position error, not `'Game: does not exist'`.
#[test]
#[feature("safe_dispatcher")]
fn test_position_invalid_takes_precedence_over_a_missing_game() {
    let (_, systems, _) = setup::spawn_game(Mode::Challenge);
    assert(reason_at(@systems, 999, 0, 0) == INVALID, 'Position: invalid first');
    // The same game at a valid position fails on the game
    assert(reason_at(@systems, 999, CENTER, CENTER) == 'Game: does not exist', 'Position: game');
}
