//! Differential check of P5-4 on the boards that are not golden games: the gas scenarios of
//! `contracts/tests/gas.cairo` (that crate cannot reach the test-only oracle, so the sequences are
//! replayed here), the scripted Tutorial and the wonder ring of `e2e/events.cairo`. After every
//! build, `oracle::check` compares the structure state of the built tile with the walks.

use paved::models::index::Tile;
use paved::models::tile::CENTER;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::oracle::check;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, Systems, TestStore, TestStoreTrait};
use paved::types::mode::{Mode, ModeTrait};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[derive(Drop)]
struct Board {
    systems: Systems,
    store: TestStore,
    game_id: u32,
    player_id: felt252,
}

#[generate_trait]
impl BoardImpl of BoardTrait {
    fn new() -> Board {
        let (store, systems, context) = setup::spawn_game(Mode::Daily);
        Board { systems, store, game_id: context.game_id, player_id: context.player_id }
    }

    /// Builds `plan` (written over the tile in hand) and checks the built tile.
    fn build(
        self: @Board, plan: Plan, orientation: Orientation, x: u32, y: u32, role: Role, spot: Spot,
    ) {
        let game = self.store.game(*self.game_id);
        let builder = self.store.builder(game, *self.player_id);
        let mut tile = self.store.tile(game, builder.tile_id);
        tile.plan = plan.into();
        self.store.set_tile(tile);
        self.systems.daily.build(*self.game_id, orientation, x, y, role, spot);
        check::assert_tile_agrees(*self.store, *self.game_id, builder.tile_id);
    }

    fn step(self: @Board, plan: Plan, orientation: Orientation, x: u32, y: u32) {
        self.build(plan, orientation, x, y, Role::None, Spot::None);
    }
}

/// Gas scenarios a0, a and b: one move each.
#[test]
#[available_gas(l2_gas: 1000000000)]
fn test_differential_gas_scenarios_a0_a_b() {
    let board = BoardTrait::new();
    board.build(Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER, Role::None, Spot::None);
    let board = BoardTrait::new();
    board.build(Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);
    let board = BoardTrait::new();
    board.build(Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1, Role::Lord, Spot::North);
}

/// Gas scenario c: a 6-tile city closed with its character scored.
#[test]
#[available_gas(l2_gas: 1000000000)]
fn test_differential_gas_scenario_c() {
    let board = BoardTrait::new();
    board.build(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, Role::Lord, Spot::Center);
    board.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    board.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3);
    board.step(Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 4);
    board.step(Plan::FFFFFFCFF, Orientation::East, CENTER + 1, CENTER + 4);
    let game = board.store.game(board.game_id);
    assert(game.score > 0, 'Differential: city not scored');
}

/// Gas scenario d: a 12-tile city tree closed by a tile placed with a character.
#[test]
#[available_gas(l2_gas: 1000000000)]
fn test_differential_gas_scenario_d() {
    let board = BoardTrait::new();
    board.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1);
    board.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    board.step(Plan::CCCCCFFFC, Orientation::South, CENTER, CENTER + 3);
    board.step(Plan::CFFFCFFFC, Orientation::North, CENTER - 1, CENTER + 3);
    board.step(Plan::FFFFCCCFF, Orientation::North, CENTER - 2, CENTER + 3);
    board.step(Plan::FFFFCCCFF, Orientation::South, CENTER - 2, CENTER + 2);
    board.step(Plan::FFFFFFCFF, Orientation::West, CENTER - 3, CENTER + 2);
    board.step(Plan::FFFFCCCFF, Orientation::South, CENTER + 1, CENTER + 3);
    board.step(Plan::FFFFCCCFF, Orientation::North, CENTER + 1, CENTER + 4);
    board.step(Plan::FFFFCCCFF, Orientation::East, CENTER + 2, CENTER + 4);
    board
        .build(
            Plan::FFFFFFCFF, Orientation::South, CENTER + 2, CENTER + 3, Role::Lord, Spot::North,
        );
    let game = board.store.game(board.game_id);
    assert(game.score > 0, 'Differential: tree not scored');
}

/// The scripted Tutorial to its end: each step builds when the script gives a placement for the
/// tile in hand, and discards it otherwise, as the golden `tutorial_full_sequence` does.
#[test]
#[available_gas(l2_gas: 1000000000)]
fn test_differential_tutorial_full_sequence() {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);
    let game_id = context.game_id;
    let mut built = 0;
    loop {
        let game = store.game(game_id);
        if game.over {
            break;
        }
        let builder = store.builder(game, context.player_id);
        let mode: Mode = game.mode.into();
        let (orientation, _, _, _, _) = mode.parameters(game.tiles);
        if orientation == Orientation::None {
            systems.tutorial.discard(game_id);
        } else {
            systems.tutorial.build(game_id);
            check::assert_tile_agrees(store, game_id, builder.tile_id);
            built += 1;
        }
    }
    assert_eq!(built, 8);
}

/// The wonder ring of `e2e/events.cairo`: six of the eight neighbours are written without a build
/// (`Store::set_tile` places them on the structure state), the last one closes the wonder.
#[test]
#[available_gas(l2_gas: 1000000000)]
fn test_differential_wonder_ring() {
    let board = BoardTrait::new();
    board
        .build(
            Plan::WFFFFFFFR, Orientation::North, CENTER + 1, CENTER, Role::Pilgrim, Spot::Center,
        );
    let mut id = 100;
    for (x, y) in array![
        (CENTER + 1, CENTER + 1), (CENTER + 2, CENTER + 1), (CENTER + 2, CENTER),
        (CENTER + 2, CENTER - 1), (CENTER + 1, CENTER - 1), (CENTER, CENTER - 1),
    ] {
        board
            .store
            .set_tile(
                Tile {
                    game_id: board.game_id,
                    id,
                    plan: Plan::FFFFFFCFF.into(),
                    orientation: Orientation::North.into(),
                    x,
                    y,
                    occupied_spot: 0,
                },
            );
        check::assert_tile_agrees(board.store, board.game_id, id);
        id += 1;
    }
    let score_before = board.store.game(board.game_id).score;
    board.build(Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);
    assert(board.store.game(board.game_id).score > score_before, 'Differential: wonder');
    // The wonder tile itself, now closed and recovered
    check::assert_tile_agrees(board.store, board.game_id, 2);
}
