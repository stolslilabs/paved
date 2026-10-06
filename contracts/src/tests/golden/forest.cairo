//! Golden games of the Woodsman and the Herdsman (phase P4).
//!
//! Same rules as `daily.cairo`: forced plans, the plan that the real deck draws is asserted before
//! each move, the expected values were recorded by running the code of the commit that introduced
//! this file, and checked by hand against the rule of 2024 (see below and
//! `docs/measures/golden-games.md`). Coordinates are relative to `CENTER`, where the starter tile
//! `RFFFRFCFR` (facing South: city to the north, road west to east, forest to the south) lies.
//!
//! The rule: a forest is scored when it is closed (every tile around it exists and every road
//! adjacent to it is closed). Woodsman: `closed roads x 300 x bonus(size)`, Herdsman: `closed
//! cities x 300 x bonus(size)`, with `bonus(n) = 1.0235^n` computed in integers over 10000:
//! bonus(2) = 10475, bonus(4) = 10972.

use paved::models::tile::CENTER;
use paved::tests::golden::harness::{GoldenMove, GoldenOutcome, day, forced, play_daily};
use paved::tests::setup::setup::{ANYONE, PLAYER, SOMEONE};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;

/// Woodsman: four road curves `RFRFFFFFR` under the starter close a loop of road around one
/// corner, and their four inner corners make a forest of 4 tiles. The Woodsman stands on the first
/// curve and waits; the fourth curve closes the loop and the forest.
/// By hand: 1 closed road (the loop, touched four times, counted once) x 300 x bonus(4) =
/// 300 x 10972 / 10000 = 329.
fn woodsman_ring_moves() -> Array<GoldenMove> {
    array![
        forced(
            Plan::FFCFFFCFF,
            Plan::RFRFFFFFR,
            Orientation::South,
            CENTER,
            CENTER - 1,
            Role::Woodsman,
            Spot::SouthEast,
            0,
        ),
        forced(
            Plan::SFRFRFFFR,
            Plan::RFRFFFFFR,
            Orientation::West,
            CENTER + 1,
            CENTER - 1,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::CFFFCFFFC,
            Plan::RFRFFFFFR,
            Orientation::North,
            CENTER + 1,
            CENTER - 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::SFRFRFRFR,
            Plan::RFRFFFFFR,
            Orientation::East,
            CENTER,
            CENTER - 2,
            Role::None,
            Spot::None,
            329,
        ),
    ]
}

/// Herdsman: two vertical city corridors `CFFFCFFFC` side by side north of the starter and east of
/// it, each closed by a cap (the starter's cap and a copy of the starter, then two `FFFFFFCFF`
/// caps), with a forest of 2 tiles between them. The Herdsman stands on the first corridor; the
/// second corridor, built last, closes the forest.
/// By hand: 2 closed cities (two caps closed each of them, two distinct cities) x 300 x
/// bonus(2) = 2 x 300 x 10475 / 10000 = 628 (628.5 rounded down).
fn herdsman_caps_moves() -> Array<GoldenMove> {
    array![
        forced(
            Plan::RFFFRFFFR,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER,
            CENTER + 1,
            Role::Herdsman,
            Spot::East,
            0,
        ),
        forced(
            Plan::FFCFFFCFF,
            Plan::FFFFFFCFF,
            Orientation::North,
            CENTER,
            CENTER + 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::FFFFFFCFF,
            Plan::FFFFFFCFF,
            Orientation::North,
            CENTER + 1,
            CENTER + 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFRFFFFFR,
            Plan::RFFFRFCFR,
            Orientation::South,
            CENTER + 1,
            CENTER,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFRFCCCFR,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER + 1,
            CENTER + 1,
            Role::None,
            Spot::None,
            628,
        ),
    ]
}

/// Both roles in one game: the ring of the Woodsman (south of the starter) is left one tile short
/// while the Herdsman board (north and east) is built. The Herdsman scores first (a city arch
/// closes both corridors into one city that the forest touches twice, counted once): 1 x 300 x
/// bonus(2) = 300 x 10475 / 10000 = 314. Then the last curve scores the Woodsman: 329. 643 in all.
fn both_roles_moves() -> Array<GoldenMove> {
    array![
        forced(
            Plan::SFRFRFCFR,
            Plan::RFRFFFFFR,
            Orientation::South,
            CENTER,
            CENTER - 1,
            Role::Woodsman,
            Spot::SouthEast,
            0,
        ),
        forced(
            Plan::FFFFCCCFF,
            Plan::RFRFFFFFR,
            Orientation::West,
            CENTER + 1,
            CENTER - 1,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFRFRFCFF,
            Plan::RFRFFFFFR,
            Orientation::North,
            CENTER + 1,
            CENTER - 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFRFCCCFR,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER,
            CENTER + 1,
            Role::Herdsman,
            Spot::East,
            0,
        ),
        forced(
            Plan::RFRFFFFFR,
            Plan::FFFFCCCFF,
            Orientation::North,
            CENTER,
            CENTER + 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::CCCCCFFFC,
            Plan::FFFFCCCFF,
            Orientation::East,
            CENTER + 1,
            CENTER + 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFFFRFFFR,
            Plan::RFFFRFCFR,
            Orientation::South,
            CENTER + 1,
            CENTER,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::WFFFFFFFF,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER + 1,
            CENTER + 1,
            Role::None,
            Spot::None,
            314,
        ),
        forced(
            Plan::RFFFRFFFR,
            Plan::RFRFFFFFR,
            Orientation::East,
            CENTER,
            CENTER - 2,
            Role::None,
            Spot::None,
            643,
        ),
    ]
}

#[test]
#[available_gas(l2_gas: 157299331)]
fn test_golden_daily_forest_woodsman_ring() {
    let moves = woodsman_ring_moves();
    play_daily(
        'forest_ring',
        day(4),
        PLAYER(),
        true,
        0,
        moves.span(),
        GoldenOutcome {
            score: 329,
            built: 4,
            discarded: 0,
            tile_count: 6,
            over: false,
            characters: 0,
            top1_score: 0,
        },
    );
}

#[test]
#[available_gas(l2_gas: 169823868)]
fn test_golden_daily_forest_herdsman_caps() {
    let moves = herdsman_caps_moves();
    play_daily(
        'forest_caps',
        day(5),
        ANYONE(),
        true,
        0,
        moves.span(),
        GoldenOutcome {
            score: 628,
            built: 5,
            discarded: 0,
            tile_count: 7,
            over: false,
            characters: 0,
            top1_score: 0,
        },
    );
}

#[test]
#[available_gas(l2_gas: 254488989)]
fn test_golden_daily_forest_both_roles() {
    let moves = both_roles_moves();
    play_daily(
        'forest_both',
        day(6),
        SOMEONE(),
        true,
        0,
        moves.span(),
        GoldenOutcome {
            score: 643,
            built: 9,
            discarded: 0,
            tile_count: 11,
            over: false,
            characters: 0,
            top1_score: 0,
        },
    );
}
