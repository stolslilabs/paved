//! Full-deck golden game (phase P5, PR P5-6): a whole Daily deck, real draws, real placements.
//!
//! The 38 tiles of the Daily deck (the starter tile and the 37 that follow) are all drawn by the
//! seed of the day and all built: no plan is forced, the plan that the real deck draws is asserted
//! before each move. The moves were chosen by the greedy bot of `test_full_deck_generate` below
//! (the legal position and orientation with the most neighbours; a character on the first area of
//! the tile that takes a Woodsman, Pilgrim, Paladin or Adventurer, when the move accepts it), run
//! once on the commit of P5-6. The expected scores were recorded from that run; they are not
//! checked by hand (a game of this size cannot be), but by the differential replay
//! `..._structures_agree`, which compares the structure state with the walks of 2024
//! (`oracle.cairo`) after every build. After P5-6 the case is never edited: a later change of the
//! draw or of the rules shows up at the first move that diverges.
//!
//! The case did not exist before P5-6: a Daily build cost about 100M L2 gas at P0 (O-12), so the
//! whole deck did not fit a test. It fits since P5 (`docs/measures/golden-games.md`).

use core::dict::{Felt252Dict, Felt252DictTrait};
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::structure::{oriented, placement, tables};
use paved::systems::daily::{IDailySafeDispatcher, IDailySafeDispatcherTrait};
use paved::tests::golden::harness::{
    GoldenMove, GoldenOutcome, day, mv, play_daily, play_daily_checked_lite,
};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, PLAYER, TestStoreTrait};
use paved::types::category::Category;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;

/// The category of the middle spot of every edge of every placed plan, by (plan, orientation,
/// edge).
fn edge_table() -> Array<u8> {
    let mut table: Array<u8> = array![];
    let mut plan: u8 = 1;
    while plan <= tables::PLAN_COUNT {
        let mut orientation: u8 = 1;
        while orientation <= 4 {
            let mut direction: u8 = tables::NORTH;
            while direction <= tables::WEST {
                table.append(placement::edge_category(plan, orientation, direction));
                direction += 2;
            }
            orientation += 1;
        }
        plan += 1;
    }
    table
}

fn edge(table: @Array<u8>, plan: u8, orientation: u8, side: u8) -> u8 {
    let plan: u32 = plan.into();
    let orientation: u32 = orientation.into();
    let side: u32 = side.into();
    *table.at(((plan - 1) * 4 + (orientation - 1)) * 4 + side)
}

fn key(x: u32, y: u32) -> felt252 {
    x.into() * 0x100000000 + y.into()
}

/// Whether a tile fits the tiles around `(x, y)`, and how many there are.
fn fits(
    table: @Array<u8>, ref board: Felt252Dict<u8>, plan: u8, orientation: u8, x: u32, y: u32,
) -> (bool, u8) {
    let mut count: u8 = 0;
    let mut fit = true;
    let mut side: u8 = 0;
    while side < 4 {
        let (nx, ny) = if side == 0 {
            (x, y + 1)
        } else if side == 1 {
            (x + 1, y)
        } else if side == 2 {
            (x, y - 1)
        } else {
            (x - 1, y)
        };
        let code = board.get(key(nx, ny));
        if code != 0 {
            count += 1;
            if edge(
                table, plan, orientation, side,
            ) != edge(table, code / 8, code % 8, (side + 2) % 4) {
                fit = false;
            }
        }
        side += 1;
    }
    (fit, count)
}

fn full_deck_moves() -> Array<GoldenMove> {
    array![
        mv(Plan::WFFFFFFFF, Orientation::North, CENTER, CENTER - 1, Role::Pilgrim, Spot::Center, 0),
        mv(Plan::CCCCCFFFC, Orientation::East, CENTER, CENTER + 1, Role::Paladin, Spot::Center, 0),
        mv(
            Plan::RFRFRFCFF,
            Orientation::South,
            CENTER + 1,
            CENTER,
            Role::Adventurer,
            Spot::Center,
            0,
        ),
        mv(Plan::FFCFFFCFF, Orientation::East, CENTER, CENTER - 2, Role::Woodsman, Spot::Center, 0),
        mv(Plan::SFRFRFFFR, Orientation::East, CENTER + 1, CENTER - 1, Role::None, Spot::None, 0),
        mv(Plan::RFFFRFCFR, Orientation::East, CENTER + 1, CENTER - 2, Role::None, Spot::None, 0),
        mv(Plan::WFFFFFFFF, Orientation::North, CENTER - 1, CENTER - 1, Role::None, Spot::None, 0),
        mv(Plan::FFFFCCCFF, Orientation::East, CENTER + 1, CENTER + 1, Role::None, Spot::None, 0),
        mv(Plan::SFRFRFFFR, Orientation::North, CENTER - 1, CENTER, Role::None, Spot::None, 877),
        mv(
            Plan::RFRFFFFFR,
            Orientation::West,
            CENTER - 1,
            CENTER + 1,
            Role::Adventurer,
            Spot::Center,
            877,
        ),
        mv(Plan::RFRFFFFFR, Orientation::East, CENTER + 2, CENTER, Role::None, Spot::None, 877),
        mv(
            Plan::FFFFFFCFF,
            Orientation::West,
            CENTER - 1,
            CENTER - 2,
            Role::None,
            Spot::None,
            2677,
        ),
        mv(
            Plan::RFFFRFCFR,
            Orientation::North,
            CENTER + 2,
            CENTER - 1,
            Role::None,
            Spot::None,
            2677,
        ),
        mv(Plan::RFRFCCCFR, Orientation::North, CENTER, CENTER + 2, Role::None, Spot::None, 2677),
        mv(
            Plan::WFFFFFFFR,
            Orientation::West,
            CENTER + 2,
            CENTER + 1,
            Role::Pilgrim,
            Spot::Center,
            2677,
        ),
        mv(
            Plan::RFRFCCCFR,
            Orientation::North,
            CENTER + 1,
            CENTER - 3,
            Role::None,
            Spot::None,
            2677,
        ),
        mv(Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 3, Role::None, Spot::None, 2677),
        mv(
            Plan::FFFFCCCFF,
            Orientation::West,
            CENTER + 2,
            CENTER - 2,
            Role::None,
            Spot::None,
            2677,
        ),
        mv(Plan::SFRFRFCFR, Orientation::North, CENTER - 2, CENTER, Role::None, Spot::None, 2677),
        mv(
            Plan::RFFFRFFFR,
            Orientation::North,
            CENTER - 1,
            CENTER + 2,
            Role::None,
            Spot::None,
            2677,
        ),
        mv(
            Plan::RFRFRFCFF,
            Orientation::South,
            CENTER - 2,
            CENTER - 1,
            Role::None,
            Spot::None,
            2677,
        ),
        mv(
            Plan::RFFFRFFFR,
            Orientation::East,
            CENTER - 2,
            CENTER - 2,
            Role::None,
            Spot::None,
            2677,
        ),
        mv(
            Plan::RFRFCCCFR,
            Orientation::South,
            CENTER - 2,
            CENTER + 1,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(
            Plan::CCCCCFFFC,
            Orientation::North,
            CENTER + 1,
            CENTER + 2,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(
            Plan::FFFFCCCFF,
            Orientation::East,
            CENTER - 1,
            CENTER - 3,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(
            Plan::FFCFFFCFF,
            Orientation::East,
            CENTER + 2,
            CENTER + 2,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(
            Plan::CCCCCFFFC,
            Orientation::South,
            CENTER + 2,
            CENTER - 3,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(
            Plan::RFFFRFCFR,
            Orientation::North,
            CENTER - 2,
            CENTER + 2,
            Role::Adventurer,
            Spot::Center,
            3554,
        ),
        mv(Plan::RFFFRFFFR, Orientation::North, CENTER + 3, CENTER, Role::None, Spot::None, 3554),
        mv(
            Plan::FFFFCCCFF,
            Orientation::West,
            CENTER + 3,
            CENTER + 1,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(
            Plan::SFRFRFFFR,
            Orientation::South,
            CENTER + 3,
            CENTER - 1,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER + 1,
            CENTER - 4,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(Plan::RFFFRFFFR, Orientation::East, CENTER, CENTER - 4, Role::None, Spot::None, 3554),
        mv(
            Plan::RFRFCCCFR,
            Orientation::East,
            CENTER + 3,
            CENTER - 2,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(
            Plan::RFRFFFCFR,
            Orientation::South,
            CENTER + 2,
            CENTER - 4,
            Role::None,
            Spot::None,
            3554,
        ),
        mv(Plan::WFFFFFFFR, Orientation::West, CENTER, CENTER + 3, Role::None, Spot::None, 3554),
        mv(Plan::RFFFRFFFR, Orientation::North, CENTER - 3, CENTER, Role::None, Spot::None, 3554),
    ]
}

fn full_deck_outcome() -> GoldenOutcome {
    GoldenOutcome {
        score: 3554,
        built: 37,
        discarded: 0,
        tile_count: 38,
        over: true,
        characters: 120,
        top1_score: 3554,
    }
}

#[test]
#[available_gas(l2_gas: 618238296)]
fn test_golden_daily_full_deck() {
    let moves = full_deck_moves();
    play_daily('daily_full_deck', day(10), PLAYER(), false, 0, moves.span(), full_deck_outcome());
}

// Differential check of P5-4 (`oracle::check`): the same game, the structure state compared with
// the walks of 2024 after every build.
#[test]
#[available_gas(l2_gas: 1449558414)]
fn test_golden_daily_full_deck_structures_agree() {
    let moves = full_deck_moves();
    play_daily_checked_lite(
        'daily_full_deck', day(10), PLAYER(), false, 0, moves.span(), full_deck_outcome(),
    );
}

/// The bot that chose the moves above, printing them (`MOVE` lines) with the score after each. Run
/// by hand: `snforge test --ignored test_full_deck_generate` (4.4 GB peak, 1.27B L2 gas on the
/// commit of P5-6, so a test cap of about 1.3B is the limit). Not part of the suite.
#[test]
#[ignore]
#[feature("safe_dispatcher")]
#[available_gas(l2_gas: 12000000000)]
fn test_full_deck_generate() {
    snforge_std::start_cheat_block_timestamp_global(day(10));
    let (store, systems, _) = setup::spawn_game(Mode::None);
    snforge_std::start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    let game_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    let safe = IDailySafeDispatcher { contract_address: systems.daily.contract_address };
    let table = edge_table();
    let mut board: Felt252Dict<u8> = Default::default();
    let mut seen: Felt252Dict<bool> = Default::default();
    let mut frontier: Array<(u32, u32)> = array![];
    // The starter tile (`RFFFRFCFR`, 9) faces South (3)
    board.insert(key(CENTER, CENTER), 9 * 8 + 3);
    let starter = array![
        (CENTER, CENTER + 1), (CENTER + 1, CENTER), (CENTER, CENTER - 1), (CENTER - 1, CENTER),
    ];
    for position in starter.span() {
        let (x, y) = *position;
        seen.insert(key(x, y), true);
        frontier.append((x, y));
    }
    let mut step: u32 = 0;
    loop {
        let game = store.game(game_id);
        if game.is_over() {
            break;
        }
        let builder = store.builder(game, PLAYER().into());
        let tile = store.tile(game, builder.tile_id);
        let plan = tile.plan;
        // [Search] The position and orientation with the most neighbours that fit
        let mut best: u8 = 0;
        let mut best_x: u32 = 0;
        let mut best_y: u32 = 0;
        let mut best_o: u8 = 0;
        let mut index: u32 = 0;
        while index < frontier.len() {
            let (x, y) = *frontier.at(index);
            index += 1;
            if board.get(key(x, y)) != 0 {
                continue;
            }
            let mut orientation: u8 = 1;
            while orientation <= 4 {
                let (fit, count) = fits(@table, ref board, plan, orientation, x, y);
                if fit && count > best {
                    best = count;
                    best_x = x;
                    best_y = y;
                    best_o = orientation;
                }
                orientation += 1;
            }
        }
        if best == 0 {
            systems.daily.discard(game_id);
            let after = store.game(game_id);
            println!("MOVE {} discard {} score {}", step, plan, after.score);
            step += 1;
            continue;
        }
        // [Character] two attempts at most, on distinct areas
        let mut role = Role::None;
        let mut spot = Spot::None;
        let mut attempts: u8 = 0;
        let mut tried: u16 = 0;
        let row = oriented::plan_row(plan, best_o);
        let mut at: u8 = 1;
        while at <= 9 && role == Role::None && attempts < 2 {
            let area = oriented::area_of(row, at);
            if area != 0 && tried & placement::role_bit(area) == 0 {
                tried = tried | placement::role_bit(area);
                let category: Category = tables::row_category(
                    oriented::area_row(plan, best_o, area),
                )
                    .into();
                let candidate: Role = match category {
                    Category::Wonder => Role::Pilgrim,
                    Category::City => Role::Paladin,
                    Category::Road => Role::Adventurer,
                    Category::Forest => Role::Woodsman,
                    _ => Role::None,
                };
                let bit: u8 = candidate.into();
                let placed = builder.characters & placement::role_bit(bit);
                if candidate != Role::None && placed == 0 {
                    attempts += 1;
                    let o: Orientation = best_o.into();
                    let s: Spot = at.into();
                    if safe.build(game_id, o, best_x, best_y, candidate, s).is_ok() {
                        role = candidate;
                        spot = s;
                    }
                }
            }
            at += 1;
        }
        if role == Role::None {
            systems.daily.build(game_id, best_o.into(), best_x, best_y, Role::None, Spot::None);
        }
        let after = store.game(game_id);
        let r: u8 = role.into();
        let sp: u8 = spot.into();
        println!(
            "MOVE {} build {} o {} x {} y {} role {} spot {} score {}",
            step,
            plan,
            best_o,
            best_x,
            best_y,
            r,
            sp,
            after.score,
        );
        board.insert(key(best_x, best_y), plan * 8 + best_o);
        let around = array![
            (best_x, best_y + 1), (best_x + 1, best_y), (best_x, best_y - 1), (best_x - 1, best_y),
        ];
        for position in around.span() {
            let (x, y) = *position;
            if !seen.get(key(x, y)) {
                seen.insert(key(x, y), true);
                frontier.append((x, y));
            }
        }
        step += 1;
    }
    let game = store.game(game_id);
    println!(
        "END score {} built {} discarded {} tile_count {} over {}",
        game.score,
        game.built,
        game.discarded,
        game.tile_count,
        game.is_over(),
    );
}
