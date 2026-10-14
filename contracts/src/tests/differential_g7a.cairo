//! G7a (P-59): the first gas cuts give the results of the code they replace, on many boards.
//!
//! - **C1**, the skipped assessment. Before every build of every board, in the contract's storage,
//!   the move is placed and assessed twice: as before G7a (`legacy_g7a::assess_before_g7a`, always
//!   run) and as now (`placement::place_move`, then `Game::assess_with` only when it says that the
//!   move closed a root). The two games must be equal, field by field, with the single-player skip
//!   on (the real path) and off (the majority walks). A move whose flag is false must leave the
//!   game as it was, and the flag must be exact: true exactly when a root the move reached (an
//!   area's final root or a wonder's around) has no open half-edge.
//! - **C2**, the starter tile from constants: `test_g7a_starter_constants_equal_place_alone`.
//! - **C3**, the seeded forest walk. Before every build, every forest the move closes is scanned
//!   as before G7a (`legacy_g7a::scan_before_g7a`, every tile read) and as now
//!   (`forest::scan_seeded`, the side tiles taken from the move's neighbourhood), without a tally
//!   and with one: the open road, the road and city counts and the tiles counted must be equal.
//!   Each scan is classed by how many side tiles of the move are nodes of the forest (0, 1, 2 or
//!   more) and whether a side tile holds no node of it. At the end of each board, every closed
//!   forest of the board is scanned both ways again, seeded with the neighbourhood of its own
//!   start tile: forests far from the last move, and forests that reach their start tile from
//!   several sides.
//! - **C5**, the fit check on edge words: `placement::tests::
//!   test_placement_edge_words_equal_the_edge_categories`.
//!
//! The boards: four games of the Daily deck played to their end by the greedy bot of
//! `golden/full_deck.cairo` (the legal placement with the most neighbours) on other days than the
//! golden's, two of them with the placement of the fewest neighbours instead (boards where more
//! moves close nothing), and the forced boards of the gas scenarios e and f.

use core::dict::{Felt252Dict, Felt252DictTrait};
use core::testing::get_available_gas;
use paved::constants::CENTER;
use paved::models::game::{GameImpl, GameTrait};
use paved::models::tile::{Tile, ZeroableTile};
use paved::store::{StoreImpl, StoreTrait};
use paved::structure::forest::scan_seeded;
use paved::structure::owners::{Tally, TallyTrait};
use paved::structure::placement::{self, Neighborhood, NeighborhoodTrait};
use paved::structure::record::{open_of, ref_of};
use paved::structure::state::{Structures, StructuresTrait};
use paved::structure::{oriented, tables};
use paved::tests::golden::harness::{day, spawn_on_the_day_seed};
use paved::tests::legacy_g7a::{assess_before_g7a, scan_before_g7a};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, PLAYER, TestStoreTrait};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::interact_with_state;

/// What the checks met, so that each test can assert that its boards reach every case.
#[derive(Copy, Drop, Default, Debug)]
struct Stats {
    /// Moves whose flag is false (no assessment), and true.
    open_moves: u32,
    closing_moves: u32,
    /// Forest scans compared, by the number of side tiles of their start tile that are nodes of
    /// the forest.
    sides_0: u32,
    sides_1: u32,
    sides_2: u32,
    sides_3: u32,
    /// Scans with a side tile that holds no node of the forest.
    apart: u32,
    /// Scans that found an open road (the forest does not score).
    open_road: u32,
}

fn add(a: Stats, b: Stats) -> Stats {
    Stats {
        open_moves: a.open_moves + b.open_moves,
        closing_moves: a.closing_moves + b.closing_moves,
        sides_0: a.sides_0 + b.sides_0,
        sides_1: a.sides_1 + b.sides_1,
        sides_2: a.sides_2 + b.sides_2,
        sides_3: a.sides_3 + b.sides_3,
        apart: a.apart + b.apart,
        open_road: a.open_road + b.open_road,
    }
}

const FOREST: u8 = 1;

/// The category of `area` of a placed tile.
fn category_of(tile: Tile, area: u8) -> u8 {
    tables::row_category(oriented::area_row(tile.plan, tile.orientation, area))
}

/// Whether a root the move reached is closed, found by `find` from each area of the tile and
/// each wonder around: what `place_move`'s flag must say.
fn closed_root(ref structures: Structures, tile: Tile, refs: u128, around: @Neighborhood) -> bool {
    let mut closed = false;
    let mut areas = oriented::record_areas(tile.plan);
    while areas != 0 {
        let area: u8 = (areas & 0xf).try_into().unwrap();
        areas = areas / 0x10;
        let (_, record) = structures.find(ref_of(refs, area));
        if open_of(record) == 0 {
            closed = true;
        }
    }
    let mut direction: u8 = 1;
    while direction <= 8 {
        if *around.wonders & placement::bit(direction) != 0 {
            let wonder = oriented::wonder_area(around.tile(direction).plan);
            let (_, record) = structures.find(around.reference(direction, wonder));
            if open_of(record) == 0 {
                closed = true;
            }
        }
        direction += 1;
    }
    closed
}

/// The scan of the forest of `area` of `tile`, as before G7a and seeded with `around` (the
/// neighbourhood of `tile`), without a tally and with one: the results must be equal. Classes the
/// scan in `stats`.
fn compare_scans(
    tile: Tile,
    refs: u128,
    area: u8,
    root: u32,
    around: @Neighborhood,
    ref structures: Structures,
    ref stats: Stats,
) {
    let mut none: Option<Tally> = Option::None;
    let before = scan_before_g7a(tile, refs, area, ref structures, ref none);
    let mut none: Option<Tally> = Option::None;
    let after = scan_seeded(tile, refs, area, around, ref structures, ref none);
    assert_eq!(after, before, "G7a C3: forest scan");
    let mut tally_before: Option<Tally> = Option::Some(TallyTrait::new());
    let with_before = scan_before_g7a(tile, refs, area, ref structures, ref tally_before);
    let mut tally_after: Option<Tally> = Option::Some(TallyTrait::new());
    let with_after = scan_seeded(tile, refs, area, around, ref structures, ref tally_after);
    assert_eq!(with_after, before, "G7a C3: forest scan with a tally");
    assert_eq!(with_before, before, "G7a C3: forest scan before G7a, with a tally");
    let mut tally_before = tally_before.unwrap();
    let mut tally_after = tally_after.unwrap();
    let mut seat: u8 = 0;
    while seat < 3 {
        assert_eq!(tally_after.count(seat), tally_before.count(seat), "G7a C3: forest tiles");
        seat += 1;
    }
    let (open_road, _, _) = before;
    if open_road {
        stats.open_road += 1;
    }

    // [Compute] The side tiles that are nodes of the forest, and those that are not
    let mut inside: u32 = 0;
    let mut direction: u8 = tables::NORTH;
    while direction <= tables::WEST {
        let side = around.tile(direction);
        if side.is_non_zero() {
            let side_refs = *(*around.refs).at(direction.into());
            let mut found = false;
            let mut areas = oriented::record_areas(side.plan);
            while areas != 0 {
                let side_area: u8 = (areas & 0xf).try_into().unwrap();
                areas = areas / 0x10;
                if category_of(side, side_area) == FOREST {
                    let (side_root, _) = structures.find(ref_of(side_refs, side_area));
                    if side_root == root {
                        found = true;
                    }
                }
            }
            if found {
                inside += 1;
            } else {
                stats.apart += 1;
            }
        }
        direction += 2;
    }
    if inside == 0 {
        stats.sides_0 += 1;
    } else if inside == 1 {
        stats.sides_1 += 1;
    } else if inside == 2 {
        stats.sides_2 += 1;
    } else {
        stats.sides_3 += 1;
    }
}

/// The checks of C1 and C3 on the move that would build the tile in hand of `game_id` with
/// `orientation` at `(x, y)`, run in the contract's storage before the move: nothing is written.
fn check_move(game_id: u32, orientation: u8, x: u32, y: u32) -> Stats {
    let mut stats: Stats = Default::default();
    let store = StoreImpl::new();
    let game = store.live_game(game_id);
    let (held, _) = StoreImpl::tile_with_refs(game_id, game.held_tile);
    let tile = Tile { orientation, x, y, ..held };
    let around = NeighborhoodTrait::read(game_id, x, y);

    // [Check] C1: the game after the move's assessment, as before G7a and as now
    let mut flags = array![true, false].span();
    while let Option::Some(solo) = flags.pop_front() {
        let mut before = StructuresTrait::new(game_id);
        let refs_before = placement::place(ref before, tile, @around);
        before.track(tile, refs_before);
        let mut game_before = game;
        let mut store_before = store;
        assess_before_g7a(
            ref game_before, *solo, tile, refs_before, @around, ref before, ref store_before,
        );

        let mut after = StructuresTrait::new(game_id);
        let (refs, closes) = placement::place_move(ref after, tile, @around);
        after.track(tile, refs);
        let mut game_after = game;
        let mut store_after = store;
        if closes {
            game_after.assess_with(*solo, tile, refs, @around, ref after, ref store_after);
        }
        assert_eq!(refs, refs_before, "G7a C1: refs");
        assert_eq!(game_after, game_before, "G7a C1: the game after the assessment");
        if !closes {
            assert_eq!(game_before, game, "G7a C1: a move that closes nothing scored");
        }
        assert_eq!(closes, closed_root(ref after, tile, refs, @around), "G7a C1: inexact flag");
        if *solo {
            if closes {
                stats.closing_moves += 1;
            } else {
                stats.open_moves += 1;
            }
        }
    }

    // [Check] C3: every forest the move closes, scanned both ways
    let mut structures = StructuresTrait::new(game_id);
    let (refs, _) = placement::place_move(ref structures, tile, @around);
    structures.track(tile, refs);
    let mut done: Array<u32> = array![];
    let mut areas = oriented::record_areas(tile.plan);
    while areas != 0 {
        let area: u8 = (areas & 0xf).try_into().unwrap();
        areas = areas / 0x10;
        if category_of(tile, area) != FOREST {
            continue;
        }
        let (root, record) = structures.find(ref_of(refs, area));
        if open_of(record) != 0 || placement::contains(done.span(), root) {
            continue;
        }
        done.append(root);
        compare_scans(tile, refs, area, root, @around, ref structures, ref stats);
    }
    stats
}

/// C3 on the whole board: every closed forest, from the first of its nodes in tile order, scanned
/// both ways, seeded with the neighbourhood of that tile.
fn check_board(game_id: u32) -> Stats {
    let mut stats: Stats = Default::default();
    let game = StoreImpl::new().live_game(game_id);
    let mut structures = StructuresTrait::new(game_id);
    let mut done: Array<u32> = array![];
    let mut tile_id: u32 = 1;
    while tile_id <= game.tile_count.into() {
        let (tile, refs) = StoreImpl::tile_with_refs(game_id, tile_id);
        tile_id += 1;
        if tile.orientation == 0 {
            continue;
        }
        let around = NeighborhoodTrait::read(game_id, tile.x, tile.y);
        let mut areas = oriented::record_areas(tile.plan);
        while areas != 0 {
            let area: u8 = (areas & 0xf).try_into().unwrap();
            areas = areas / 0x10;
            if category_of(tile, area) != FOREST {
                continue;
            }
            let (root, record) = structures.find(ref_of(refs, area));
            if open_of(record) != 0 || placement::contains(done.span(), root) {
                continue;
            }
            done.append(root);
            compare_scans(tile, refs, area, root, @around, ref structures, ref stats);
        }
    }
    stats
}

fn key(x: u32, y: u32) -> felt252 {
    x.into() * 0x100000000 + y.into()
}

/// Whether a tile of `plan` and `orientation` fits the tiles of `board` (their edge words, by
/// position) around `(x, y)`, and how many there are.
fn fits(ref board: Felt252Dict<u8>, plan: u8, orientation: u8, x: u32, y: u32) -> (bool, u8) {
    let edges = oriented::edges(plan, orientation);
    let mut count: u8 = 0;
    let mut fit = true;
    let mut side: u8 = 0;
    let mut unit: u8 = 1;
    while side < 4 {
        let (nx, ny) = paved::structure::walk::toward(x, y, 2 * side + 2);
        let neighbor = board.get(key(nx, ny));
        if neighbor != 0 {
            count += 1;
            // [Info] The opposite field of the neighbour: two sides further
            let opposite = if side < 2 {
                unit * 16
            } else {
                unit / 16
            };
            if (edges / unit) & 0x3 != (neighbor / opposite) & 0x3 {
                fit = false;
            }
        }
        side += 1;
        if side < 4 {
            unit *= 4;
        }
    }
    (fit, count)
}

/// The placement the bot plays with a tile of `plan`: the legal one with the most neighbours
/// (`dense`) or the fewest, the first found from a rotating start; `None` when there is none.
fn choose(
    ref board: Felt252Dict<u8>, frontier: Span<(u32, u32)>, plan: u8, dense: bool, step: u32,
) -> Option<(u8, u32, u32)> {
    let len = frontier.len();
    let mut best: Option<(u8, u32, u32)> = Option::None;
    let mut best_count: u8 = 0;
    let mut index: u32 = 0;
    while index < len {
        let (x, y) = *frontier.at((index + step * 7) % len);
        index += 1;
        if board.get(key(x, y)) != 0 {
            continue;
        }
        let mut orientation: u8 = 1;
        while orientation <= 4 {
            let (fit, count) = fits(ref board, plan, orientation, x, y);
            let better = match best {
                Option::None => true,
                Option::Some(_) => if dense {
                    count > best_count
                } else {
                    count < best_count
                },
            };
            if fit && better {
                best = Option::Some((orientation, x, y));
                best_count = count;
            }
            orientation += 1;
        }
    }
    best
}

/// A Daily game of the day `day_index` played by the bot for `moves` moves at most (or to its
/// end), every build checked, then the whole board.
fn bot_game(day_index: u64, dense: bool, moves: u32) -> Stats {
    snforge_std::start_cheat_block_timestamp_global(day(day_index));
    let (store, systems, context) = setup::spawn_game(Mode::None);
    snforge_std::start_cheat_caller_address(systems.challenge.contract_address, PLAYER());
    let game_id = spawn_on_the_day_seed(@systems, context.token.contract_address, PLAYER());
    // [Info] The board by position: the edge word of each tile (never 0)
    let mut board: Felt252Dict<u8> = Default::default();
    let mut frontier: Array<(u32, u32)> = array![];
    board.insert(key(CENTER, CENTER), oriented::edges(Plan::RFFFRFCFR.into(), 3));
    let mut direction: u8 = tables::NORTH;
    while direction <= tables::WEST {
        frontier.append(paved::structure::walk::toward(CENTER, CENTER, direction));
        direction += 2;
    }
    let mut stats: Stats = Default::default();
    let mut step: u32 = 0;
    while step < moves {
        let game = store.game(game_id);
        if game.is_over() {
            break;
        }
        let plan = store.tile(game, store.builder(game, PLAYER().into()).tile_id).plan;
        match choose(ref board, frontier.span(), plan, dense, step) {
            Option::Some((
                orientation, x, y,
            )) => {
                let moved = interact_with_state(
                    store.contract, || check_move(game_id, orientation, x, y),
                );
                stats = add(stats, moved);
                systems.challenge.build(game_id, orientation.into(), x, y);
                board.insert(key(x, y), oriented::edges(plan, orientation));
                let mut direction: u8 = tables::NORTH;
                while direction <= tables::WEST {
                    let (nx, ny) = paved::structure::walk::toward(x, y, direction);
                    if board.get(key(nx, ny)) == 0 {
                        frontier.append((nx, ny));
                    }
                    direction += 2;
                }
            },
            Option::None => systems.challenge.discard(game_id),
        }
        step += 1;
    }
    let board = interact_with_state(store.contract, || check_board(game_id));
    println!("G7a day {} dense {}: moves {:?}", day_index, dense, stats);
    println!("G7a day {} dense {}: board {:?}", day_index, dense, board);
    add(stats, board)
}

/// A board of forced plans (each written over the tile in hand), every build checked, and the
/// whole board after each.
fn forced_board(moves: Span<(Plan, Orientation, u32, u32)>) -> Stats {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let game_id = context.game_id;
    let mut stats: Stats = Default::default();
    for (plan, orientation, x, y) in moves {
        let game = store.game(game_id);
        let builder = store.builder(game, context.player_id);
        let mut tile = store.tile(game, builder.tile_id);
        tile.plan = (*plan).into();
        store.set_tile(tile);
        let orientation: u8 = (*orientation).into();
        let (x, y) = (*x, *y);
        let moved = interact_with_state(store.contract, || check_move(game_id, orientation, x, y));
        stats = add(stats, moved);
        systems.challenge.build(game_id, orientation.into(), x, y);
        stats = add(stats, interact_with_state(store.contract, || check_board(game_id)));
    }
    stats
}

/// Bot games, one per test (the VM's step limit), of `MOVES` moves at most.
const MOVES: u32 = 24;

#[test]
#[available_gas(l2_gas: 4000000000)]
fn test_g7a_bot_game_dense_day_11() {
    let stats = bot_game(11, true, MOVES);
    assert!(stats.open_moves > 0 && stats.closing_moves > 0);
}

#[test]
#[available_gas(l2_gas: 4000000000)]
fn test_g7a_bot_game_dense_day_12() {
    let stats = bot_game(12, true, MOVES);
    assert!(stats.open_moves > 0 && stats.closing_moves > 0);
}

#[test]
#[available_gas(l2_gas: 4000000000)]
fn test_g7a_bot_game_sparse_day_13() {
    let stats = bot_game(13, false, MOVES);
    assert!(stats.open_moves > 0 && stats.closing_moves > 0);
}

#[test]
#[available_gas(l2_gas: 4000000000)]
fn test_g7a_bot_game_sparse_day_14() {
    let stats = bot_game(14, false, MOVES);
    assert!(stats.open_moves > 0 && stats.closing_moves > 0);
}

/// The forced boards of the gas scenarios e (a forest of 4 inside a road loop, two side tiles of
/// the last move in it) and f (the forest of 16 nodes around four wonders).
#[test]
#[available_gas(l2_gas: 4000000000)]
fn test_g7a_gas_boards_e_and_f() {
    let curve = Plan::RFRFFFFFR;
    let straight = Plan::RFFFRFFFR;
    let e = array![
        (curve, Orientation::South, CENTER, CENTER - 1),
        (curve, Orientation::West, CENTER + 1, CENTER - 1),
        (curve, Orientation::North, CENTER + 1, CENTER - 2),
        (curve, Orientation::East, CENTER, CENTER - 2),
    ];
    let f = array![
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
        (curve, Orientation::South, CENTER - 1, CENTER),
    ];
    let stats = add(forced_board(e.span()), forced_board(f.span()));
    println!("G7a e and f: {:?}", stats);
    assert!(stats.sides_2 > 0);
}

/// The forest boards of the goldens (`golden/forest.cairo`: ring, caps, both, open city; their
/// plans and positions copied) and the crossings of `e2e/forest.cairo`: forests that close with one
/// side tile of the move in them (the corridors), two (the ring, the crossings), a city touched
/// twice, and an open city.
#[test]
#[available_gas(l2_gas: 4000000000)]
fn test_g7a_forest_boards() {
    let curve = Plan::RFRFFFFFR;
    let corridor = Plan::CFFFCFFFC;
    let cap = Plan::FFFFFFCFF;
    let corner = Plan::FFFFCCCFF;
    let ring = array![
        (curve, Orientation::South, CENTER, CENTER - 1),
        (curve, Orientation::West, CENTER + 1, CENTER - 1),
        (curve, Orientation::North, CENTER + 1, CENTER - 2),
        (curve, Orientation::East, CENTER, CENTER - 2),
    ];
    let caps = array![
        (corridor, Orientation::East, CENTER, CENTER + 1),
        (cap, Orientation::North, CENTER, CENTER + 2),
        (cap, Orientation::North, CENTER + 1, CENTER + 2),
        (Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER),
        (corridor, Orientation::East, CENTER + 1, CENTER + 1),
    ];
    let both = array![
        (curve, Orientation::South, CENTER, CENTER - 1),
        (curve, Orientation::West, CENTER + 1, CENTER - 1),
        (curve, Orientation::North, CENTER + 1, CENTER - 2),
        (corridor, Orientation::East, CENTER, CENTER + 1),
        (corner, Orientation::North, CENTER, CENTER + 2),
        (corner, Orientation::East, CENTER + 1, CENTER + 2),
        (Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER),
        (corridor, Orientation::East, CENTER + 1, CENTER + 1),
        (curve, Orientation::East, CENTER, CENTER - 2),
    ];
    let open_city = array![
        (Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER),
        (corridor, Orientation::East, CENTER + 1, CENTER + 1),
        (corner, Orientation::East, CENTER + 1, CENTER + 2),
        (Plan::CCCCCFFFC, Orientation::South, CENTER, CENTER + 2),
        (corridor, Orientation::East, CENTER, CENTER + 1),
    ];
    let crossings = array![
        (Plan::SFRFRFRFR, Orientation::North, CENTER + 1, CENTER),
        (Plan::SFRFRFRFR, Orientation::North, CENTER + 2, CENTER),
        (Plan::SFRFRFRFR, Orientation::North, CENTER + 1, CENTER - 1),
        (Plan::SFRFRFRFR, Orientation::North, CENTER + 2, CENTER - 1),
    ];
    let mut stats = forced_board(ring.span());
    stats = add(stats, forced_board(caps.span()));
    stats = add(stats, forced_board(both.span()));
    stats = add(stats, forced_board(open_city.span()));
    stats = add(stats, forced_board(crossings.span()));
    println!("G7a forest boards: {:?}", stats);
    assert!(stats.sides_1 > 0 && stats.sides_2 > 0 && stats.apart > 0);
}

/// C2: the starter tile written from constants holds, slot for slot, what `place_alone` writes for
/// it (its position, its slot with its refs, its page), on the tile `Game::start` gives.
#[test]
fn test_g7a_starter_constants_equal_place_alone() {
    let (store, _, _) = setup::spawn_game(Mode::None);
    interact_with_state(
        store.contract,
        || {
            let s = StoreImpl::new();
            // Two new games, ids no spawn gave on this contract
            let mut game = GameImpl::new(1000, 0, Mode::Challenge, 'PLAYER');
            let starter = game.start(0, 'SEED');
            assert_eq!(starter.id, 1);
            assert_eq!(starter.plan, Plan::RFFFRFCFR.into());
            assert_eq!(starter.orientation, Orientation::South.into());
            assert_eq!((starter.x, starter.y), (CENTER, CENTER));
            let alone = Tile { game_id: 1001, ..starter };
            // Before G7a: `set_tile` places it alone. Each write runs in a loop of one turn known
            // only at run time (`once`, the starter's id), less an empty turn: the method of
            // `docs/architecture/g7-gas-plan.md`, 1.3
            let once = starter.id;
            let start = get_available_gas();
            let mut turn: u32 = 0;
            while turn < once {
                turn += 1;
            }
            let empty = start - get_available_gas();
            let start = get_available_gas();
            let mut turn: u32 = 0;
            while turn < once {
                s.set_tile(alone);
                turn += 1;
            }
            let before = start - get_available_gas() - empty;
            let start = get_available_gas();
            let mut turn: u32 = 0;
            while turn < once {
                placement::place_starter(s, starter);
                turn += 1;
            }
            let after = start - get_available_gas() - empty;
            println!(
                "G7a C2: starter by set_tile {}, by place_starter {}, empty turn {}",
                before,
                after,
                empty,
            );
            let (kept, refs) = StoreImpl::tile_with_refs(1000, 1);
            let (kept_alone, refs_alone) = StoreImpl::tile_with_refs(1001, 1);
            assert_eq!(kept, starter);
            assert_eq!(kept_alone, alone);
            assert_eq!(refs, refs_alone);
            assert_eq!(refs, placement::STARTER_REFS);
            let mut slot: u8 = 0;
            while slot < 2 {
                assert_eq!(s.structure_slot(1000, 1, slot), s.structure_slot(1001, 1, slot));
                slot += 1;
            }
            assert_eq!(s.structure_slot(1000, 1, 0), placement::STARTER_PAGE);
            let position = s
                .tile_position(GameImpl::new(1000, 0, Mode::Challenge, 0), CENTER, CENTER);
            let position_alone = s
                .tile_position(GameImpl::new(1001, 0, Mode::Challenge, 0), CENTER, CENTER);
            assert_eq!(position.tile_id, 1);
            assert_eq!(position_alone.tile_id, 1);
            // Nothing else around: the 8 positions are empty in both games
            let mut direction: u8 = 1;
            while direction <= 8 {
                let (x, y) = paved::structure::walk::toward(CENTER, CENTER, direction);
                let (a, _) = StoreImpl::tile_at(1000, x, y);
                let (b, _) = StoreImpl::tile_at(1001, x, y);
                assert!(a.is_zero() && b.is_zero());
                direction += 1;
            }
        },
    );
}
