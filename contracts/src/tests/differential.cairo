//! Differential check of P5-4 on the boards that are not golden games: the gas scenarios of
//! `contracts/tests/gas.cairo` (that crate cannot reach the test-only oracle, so the sequences are
//! replayed here) and the wonder ring of `e2e/events.cairo`. After every
//! build, `oracle::check` compares the structure state of the built tile with the walks, and the
//! points the move scored with the points the walks give it (D-18b).

use paved::models::index::Tile;
use paved::models::tile::CENTER;
use paved::store::{StoreImpl, StoreTrait};
use paved::structure::record::ref_of;
use paved::structure::state::StructuresTrait;
use paved::tests::oracle::check;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, Systems, TestStore, TestStoreTrait};
use paved::types::mode::{Mode, ModeTrait};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::interact_with_state;

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
        let (store, systems, context) = setup::spawn_game(Mode::Challenge);
        Board { systems, store, game_id: context.game_id, player_id: context.player_id }
    }

    /// Builds `plan` (written over the tile in hand) and checks the built tile and what it
    /// scored.
    fn build(self: @Board, plan: Plan, orientation: Orientation, x: u32, y: u32) {
        let game = self.store.game(*self.game_id);
        let before = game.score;
        let builder = self.store.builder(game, *self.player_id);
        let mut tile = self.store.tile(game, builder.tile_id);
        tile.plan = plan.into();
        self.store.set_tile(tile);
        self.systems.challenge.build(*self.game_id, orientation, x, y);
        check::assert_tile_agrees(*self.store, *self.game_id, builder.tile_id);
        check::assert_move_scored(*self.store, *self.game_id, builder.tile_id, before);
    }

    fn step(self: @Board, plan: Plan, orientation: Orientation, x: u32, y: u32) {
        self.build(plan, orientation, x, y);
    }
}

/// Gas scenarios a0 and a (and b, whose move is a's since D-18 took its Lord): one move each.
#[test]
#[available_gas(l2_gas: 321647000)]
fn test_differential_gas_scenarios_a0_a_b() {
    let board = BoardTrait::new();
    board.build(Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER);
    let board = BoardTrait::new();
    board.build(Plan::FFCFFFCFF, Orientation::North, CENTER, CENTER + 1);
}

/// Gas scenario c: a 6-tile city closed and scored.
#[test]
#[available_gas(l2_gas: 306303000)]
fn test_differential_gas_scenario_c() {
    let board = BoardTrait::new();
    board.build(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1);
    board.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2);
    board.step(Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3);
    board.step(Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 4);
    board.step(Plan::FFFFFFCFF, Orientation::East, CENTER + 1, CENTER + 4);
    let game = board.store.game(board.game_id);
    assert(game.score > 0, 'Differential: city not scored');
}

/// Gas scenario d: a 12-tile city tree closed and scored.
#[test]
#[available_gas(l2_gas: 582165000)]
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
    board.build(Plan::FFFFFFCFF, Orientation::South, CENTER + 2, CENTER + 3);
    let game = board.store.game(board.game_id);
    assert(game.score > 0, 'Differential: tree not scored');
}

/// Gas scenario e: four road curves close a loop of road and the forest of 4 tiles inside it. The
/// score the oracle's walks give the board is `SCORE_E` of `contracts/tests/gas.cairo`.
#[test]
#[available_gas(l2_gas: 360171000)]
fn test_differential_gas_scenario_e() {
    let board = BoardTrait::new();
    board.step(Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 1);
    board.step(Plan::RFRFFFFFR, Orientation::West, CENTER + 1, CENTER - 1);
    board.step(Plan::RFRFFFFFR, Orientation::North, CENTER + 1, CENTER - 2);
    board.step(Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2);
    let expected = check::board_points(board.store, board.game_id);
    println!("SCORE e (oracle): {}", expected);
    assert_eq!(board.store.game(board.game_id).score, expected);
}

/// Gas scenario f: a loop of 12 road tiles around four wonders; the last curve closes the loop and
/// the forest of 16 nodes. The score the oracle's walks give the board is `SCORE_F` of
/// `contracts/tests/gas.cairo`.
#[test]
#[available_gas(l2_gas: 1353892000)]
fn test_differential_gas_scenario_f() {
    let board = BoardTrait::new();
    let straight = Plan::RFFFRFFFR;
    let curve = Plan::RFRFFFFFR;
    board.step(straight, Orientation::North, CENTER + 1, CENTER);
    board.step(curve, Orientation::West, CENTER + 2, CENTER);
    board.step(straight, Orientation::East, CENTER + 2, CENTER - 1);
    board.step(straight, Orientation::East, CENTER + 2, CENTER - 2);
    board.step(curve, Orientation::North, CENTER + 2, CENTER - 3);
    board.step(straight, Orientation::North, CENTER + 1, CENTER - 3);
    board.step(straight, Orientation::North, CENTER, CENTER - 3);
    board.step(curve, Orientation::East, CENTER - 1, CENTER - 3);
    board.step(straight, Orientation::East, CENTER - 1, CENTER - 2);
    board.step(straight, Orientation::East, CENTER - 1, CENTER - 1);
    board.step(Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 1);
    board.step(Plan::WFFFFFFFF, Orientation::North, CENTER + 1, CENTER - 1);
    board.step(Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 2);
    board.step(Plan::WFFFFFFFF, Orientation::North, CENTER + 1, CENTER - 2);
    board.step(curve, Orientation::South, CENTER - 1, CENTER);
    let expected = check::board_points(board.store, board.game_id);
    println!("SCORE f (oracle): {}", expected);
    assert_eq!(board.store.game(board.game_id).score, expected);
}

/// Two areas of one tile join one structure (the re-rooting branch of
/// `structure::placement::place`):
/// the last tile, a road crossing, has an area that joins one structure while a later area of the
/// same tile joins two others, one of them the same structure, so that the first root becomes a
/// child and the refs of the first area are put back on the final root. The board was found by a
/// search over legal boards (a model of the placement in Python, not kept) and then confirmed
/// here: the coverage run of the test reaches those lines. Every move is checked against the walks.
#[test]
#[available_gas(l2_gas: 733532000)]
fn test_differential_two_areas_of_one_tile_join_one_structure() {
    let board = BoardTrait::new();
    board.step(Plan::FFCFFFCFF, Orientation::South, CENTER, CENTER + 1);
    board.step(Plan::RFRFFFCFR, Orientation::South, CENTER + 1, CENTER + 1);
    board.step(Plan::FFFFFFCFF, Orientation::North, CENTER + 1, CENTER + 2);
    board.step(Plan::SFRFRFRFR, Orientation::North, CENTER + 2, CENTER + 1);
    board.step(Plan::RFFFRFFFR, Orientation::South, CENTER, CENTER - 1);
    board.step(Plan::RFRFFFCFR, Orientation::North, CENTER + 1, CENTER - 1);
    board.step(Plan::RFFFRFFFR, Orientation::West, CENTER + 2, CENTER + 2);
    board.step(Plan::CFFFCFFFC, Orientation::East, CENTER - 1, CENTER + 1);
    board.step(Plan::FFCFFFFFC, Orientation::West, CENTER, CENTER + 2);
    board.step(Plan::RFRFFFCFR, Orientation::East, CENTER - 1, CENTER - 1);
    board.step(Plan::RFRFFFCFR, Orientation::South, CENTER - 1, CENTER);
    let game = board.store.game(board.game_id);
    let last = board.store.builder(game, board.player_id);
    board.step(Plan::SFRFRFRFR, Orientation::South, CENTER + 1, CENTER);
    // The last tile's areas 2 and 6, and 3 and 5, each pair one structure: the refs of the pair
    // resolve to one root (and, the re-rooting having put them back on it, are that root).
    interact_with_state(
        board.store.contract,
        || {
            let (_, refs) = StoreImpl::tile_with_refs(board.game_id, last.tile_id);
            let mut structures = StructuresTrait::new(board.game_id);
            for (first, second) in array![(2_u8, 6_u8), (3_u8, 5_u8)] {
                let (root, _) = structures.find(ref_of(refs, first));
                let (other, _) = structures.find(ref_of(refs, second));
                assert_eq!(root, other);
                assert_eq!(ref_of(refs, first), root);
                assert_eq!(ref_of(refs, second), root);
            }
        },
    );
}

/// The wonder ring of `e2e/events.cairo`: six of the eight neighbours are written without a build
/// (`Store::set_tile` places them on the structure state), the last one closes the wonder.
#[test]
#[available_gas(l2_gas: 363925000)]
fn test_differential_wonder_ring() {
    let board = BoardTrait::new();
    board.build(Plan::WFFFFFFFR, Orientation::North, CENTER + 1, CENTER);
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
                    owner: 0,
                },
            );
        check::assert_tile_agrees(board.store, board.game_id, id);
        id += 1;
    }
    let score_before = board.store.game(board.game_id).score;
    board.build(Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 1);
    assert(board.store.game(board.game_id).score > score_before, 'Differential: wonder');
    // The wonder tile itself, now closed
    check::assert_tile_agrees(board.store, board.game_id, 2);
}
