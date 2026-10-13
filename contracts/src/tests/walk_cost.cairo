//! The cost of the majority count with the single-player skip forced off (D-19b), measured once
//! on the full-deck golden game (`golden/full_deck.cairo`, its 37 moves copied here so that the
//! golden file stays untouched). For the multiplayer mode: it changes no ceiling.
//!
//! Each move is built by `Daily` as in the golden game (the skip on: the cost of D-18), with its
//! L2 gas read around the call. Then, in the contract's storage, the count that the move would run
//! with the skip off is run and measured alone: `structure_tally` for each road or city it closes,
//! the forest scan with a tally less the same scan without one (`None`) for each forest, and
//! `wonder_tally` for each wonder. The two figures added are the move with the skip off (an
//! estimate: the count runs here outside the call, with the same reads). Run by hand:
//! `snforge test --ignored test_walk_cost_full_deck`.

use core::testing::get_available_gas;
use paved::models::tile::{CENTER, Tile};
use paved::store::StoreImpl;
use paved::structure::forest::scan;
use paved::structure::owners::{TallyTrait, structure_tally, wonder_tally};
use paved::structure::placement::{self, NeighborhoodTrait};
use paved::structure::record::{open_of, ref_of, size_of};
use paved::structure::state::StructuresTrait;
use paved::structure::{oriented, tables};
use paved::tests::golden::harness::day;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, PLAYER, TestStoreTrait};
use paved::types::category::Category;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::interact_with_state;

fn moves() -> Array<(Plan, Orientation, u32, u32)> {
    array![
        (Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 1),
        (Plan::CCCCCFFFC, Orientation::East, CENTER, CENTER + 1),
        (Plan::RFRFRFCFF, Orientation::South, CENTER + 1, CENTER),
        (Plan::FFCFFFCFF, Orientation::East, CENTER, CENTER - 2),
        (Plan::SFRFRFFFR, Orientation::East, CENTER + 1, CENTER - 1),
        (Plan::RFFFRFCFR, Orientation::East, CENTER + 1, CENTER - 2),
        (Plan::WFFFFFFFF, Orientation::North, CENTER - 1, CENTER - 1),
        (Plan::FFFFCCCFF, Orientation::East, CENTER + 1, CENTER + 1),
        (Plan::SFRFRFFFR, Orientation::North, CENTER - 1, CENTER),
        (Plan::RFRFFFFFR, Orientation::West, CENTER - 1, CENTER + 1),
        (Plan::RFRFFFFFR, Orientation::East, CENTER + 2, CENTER),
        (Plan::FFFFFFCFF, Orientation::West, CENTER - 1, CENTER - 2),
        (Plan::RFFFRFCFR, Orientation::North, CENTER + 2, CENTER - 1),
        (Plan::RFRFCCCFR, Orientation::North, CENTER, CENTER + 2),
        (Plan::WFFFFFFFR, Orientation::West, CENTER + 2, CENTER + 1),
        (Plan::RFRFCCCFR, Orientation::North, CENTER + 1, CENTER - 3),
        (Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 3),
        (Plan::FFFFCCCFF, Orientation::West, CENTER + 2, CENTER - 2),
        (Plan::SFRFRFCFR, Orientation::North, CENTER - 2, CENTER),
        (Plan::RFFFRFFFR, Orientation::North, CENTER - 1, CENTER + 2),
        (Plan::RFRFRFCFF, Orientation::South, CENTER - 2, CENTER - 1),
        (Plan::RFFFRFFFR, Orientation::East, CENTER - 2, CENTER - 2),
        (Plan::RFRFCCCFR, Orientation::South, CENTER - 2, CENTER + 1),
        (Plan::CCCCCFFFC, Orientation::North, CENTER + 1, CENTER + 2),
        (Plan::FFFFCCCFF, Orientation::East, CENTER - 1, CENTER - 3),
        (Plan::FFCFFFCFF, Orientation::East, CENTER + 2, CENTER + 2),
        (Plan::CCCCCFFFC, Orientation::South, CENTER + 2, CENTER - 3),
        (Plan::RFFFRFCFR, Orientation::North, CENTER - 2, CENTER + 2),
        (Plan::RFFFRFFFR, Orientation::North, CENTER + 3, CENTER),
        (Plan::FFFFCCCFF, Orientation::West, CENTER + 3, CENTER + 1),
        (Plan::SFRFRFFFR, Orientation::South, CENTER + 3, CENTER - 1),
        (Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER - 4),
        (Plan::RFFFRFFFR, Orientation::East, CENTER, CENTER - 4),
        (Plan::RFRFCCCFR, Orientation::East, CENTER + 3, CENTER - 2),
        (Plan::RFRFFFCFR, Orientation::South, CENTER + 2, CENTER - 4),
        (Plan::WFFFFFFFR, Orientation::West, CENTER, CENTER + 3),
        (Plan::RFFFRFFFR, Orientation::North, CENTER - 3, CENTER),
    ]
}

/// The wonders around `(x, y)` whose root is closed, by direction bit.
fn closed_wonders(game_id: u32, x: u32, y: u32) -> u16 {
    let around = NeighborhoodTrait::read(game_id, x, y);
    let mut structures = StructuresTrait::new(game_id);
    let mut closed: u16 = 0;
    let mut direction: u8 = 1;
    while direction <= 8 {
        if around.wonders & placement::bit(direction) != 0 {
            let wonder = oriented::wonder_area(around.tile(direction).plan);
            let (_, record) = structures.find(around.reference(direction, wonder));
            if open_of(record) == 0 {
                closed = closed | placement::bit(direction);
            }
        }
        direction += 1;
    }
    closed
}

fn tally_road_or_city(tile: Tile, refs: u128, area: u8) -> Option<u8> {
    let mut structures = StructuresTrait::new(tile.game_id);
    let mut tally = structure_tally(tile, refs, area, ref structures);
    tally.winner()
}

fn tally_wonder(wonder: Tile) -> Option<u8> {
    let mut structures = StructuresTrait::new(wonder.game_id);
    let mut tally = wonder_tally(wonder, ref structures);
    tally.winner()
}

fn scan_forest(tile: Tile, refs: u128, area: u8, on: bool) -> Option<u8> {
    let mut structures = StructuresTrait::new(tile.game_id);
    let mut tally = if on {
        Option::Some(TallyTrait::new())
    } else {
        Option::None
    };
    scan(tile, refs, area, ref structures, ref tally);
    match tally {
        Option::Some(mut counted) => counted.winner(),
        Option::None => Option::None,
    }
}

/// The L2 gas of the count the move that built `tile_id` would run with the skip off, the
/// closures it measured printed. `before`: the wonders around that were closed before the move.
fn walk_cost(game_id: u32, tile_id: u32, before: u16, step: u32) -> u128 {
    let (tile, refs) = StoreImpl::tile_with_refs(game_id, tile_id);
    let mut structures = StructuresTrait::new(game_id);
    let mut done: Array<u32> = array![];
    let mut cost: u128 = 0;
    let row = oriented::plan_row(tile.plan, tile.orientation);
    let mut count = oriented::start_count(row);
    let mut starts = oriented::starts(row);
    while count > 0 {
        let (_, area, rest) = oriented::next_start(starts);
        starts = rest;
        count -= 1;
        let category: Category = tables::row_category(
            oriented::area_row(tile.plan, tile.orientation, area),
        )
            .into();
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
        let (spent, label) = match category {
            Category::Wonder => {
                let start = get_available_gas();
                let _ = tally_wonder(tile);
                (start - get_available_gas(), "wonder")
            },
            Category::Forest => {
                let start = get_available_gas();
                let _ = scan_forest(tile, refs, area, false);
                let off = start - get_available_gas();
                let start = get_available_gas();
                let _ = scan_forest(tile, refs, area, true);
                let on = start - get_available_gas();
                (on - off, "forest")
            },
            _ => {
                let start = get_available_gas();
                let _ = tally_road_or_city(tile, refs, area);
                let label: ByteArray = if category == Category::Road {
                    "road"
                } else {
                    "city"
                };
                (start - get_available_gas(), label)
            },
        };
        println!("WALK step={} {} nodes={} gas={}", step, label, size_of(record), spent);
        cost += spent;
    }
    let after = closed_wonders(game_id, tile.x, tile.y);
    let around = NeighborhoodTrait::read(game_id, tile.x, tile.y);
    let mut direction: u8 = 1;
    while direction <= 8 {
        let bit = placement::bit(direction);
        if after & bit != 0 && before & bit == 0 {
            let start = get_available_gas();
            let _ = tally_wonder(around.tile(direction));
            let spent = start - get_available_gas();
            println!("WALK step={} wonder nodes=9 gas={}", step, spent);
            cost += spent;
        }
        direction += 1;
    }
    cost
}

#[test]
#[ignore]
#[available_gas(l2_gas: 2000000000)]
fn test_walk_cost_full_deck() {
    snforge_std::start_cheat_block_timestamp_global(day(10));
    let (store, systems, _) = setup::spawn_game(Mode::None);
    snforge_std::start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    let game_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    let mut step: u32 = 0;
    for (_, orientation, x, y) in moves() {
        let game = store.game(game_id);
        let tile_id = store.builder(game, PLAYER().into()).tile_id;
        let before = interact_with_state(store.contract, || closed_wonders(game_id, x, y));
        let start = get_available_gas();
        systems.daily.build(game_id, orientation, x, y);
        let build = start - get_available_gas();
        let at = step;
        let walk = interact_with_state(store.contract, || walk_cost(game_id, tile_id, before, at));
        println!("MOVE step={} build={} walk={} skip_off={}", step, build, walk, build + walk);
        step += 1;
    }
    assert_eq!(store.game(game_id).score, 5121);
}
