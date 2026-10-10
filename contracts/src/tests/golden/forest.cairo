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
use paved::tests::golden::harness::{
    GoldenMove, GoldenOutcome, day, forced, play_daily, play_daily_checked,
};
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

/// Herdsman, rule correction P-15: two vertical city corridors `CFFFCFFFC` side by side, east of
/// the starter (first the cap `RFFFRFCFR` that closes the east corridor to the south), with a
/// forest of 2 tiles between them. A corner `FFFFCCCFF` and a T-junction `CCCCCFFFC` over their
/// north ends join the two corridors into one city of 6 tiles, which stays **open**: the east edge
/// of the T-junction looks at an empty position. The forest touches that city at two places, one
/// corridor each. The Herdsman stands on the east corridor and waits; the west corridor, built
/// last, closes the forest.
///
/// 2024 figure (recorded on the commit before the fix, `dc804707`, by running this case): **314**.
/// The walk stopped at the open edge of the city when it started from the west corridor, left the
/// east corridor unvisited, and found the rest of the city closed from the second contact: it
/// counted the open city once, 1 x 300 x bonus(2) = 300 x 10475 / 10000 = 314.
///
/// P5 figure (P-15, an open city never counts): **0**. By hand: the city is open, so no city
/// counts:
/// 0 x 300 x bonus(2) = 0. The forest is closed all the same, so the Herdsman comes back (builder
/// characters 0) with a `Scored` of 0 points.
fn herdsman_open_city_moves() -> Array<GoldenMove> {
    array![
        forced(
            Plan::FFFFFFCFF,
            Plan::RFFFRFCFR,
            Orientation::South,
            CENTER + 1,
            CENTER,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFRFRFCFF,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER + 1,
            CENTER + 1,
            Role::Herdsman,
            Spot::West,
            0,
        ),
        forced(
            Plan::RFRFRFCFF,
            Plan::FFFFCCCFF,
            Orientation::East,
            CENTER + 1,
            CENTER + 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFRFFFFFR,
            Plan::CCCCCFFFC,
            Orientation::South,
            CENTER,
            CENTER + 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFFFRFFFR,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER,
            CENTER + 1,
            Role::None,
            Spot::None,
            0,
        ),
    ]
}

#[test]
#[available_gas(l2_gas: 168719000)]
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
#[available_gas(l2_gas: 180142000)]
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
#[available_gas(l2_gas: 230833193)]
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

/// The new case of P5-5: the rule correction P-15, see `herdsman_open_city_moves`. Not a rule of
/// 2024: its 2024 figure was 314.
#[test]
#[available_gas(l2_gas: 180011000)]
fn test_golden_daily_forest_herdsman_open_city() {
    let moves = herdsman_open_city_moves();
    play_daily(
        'forest_open',
        day(7),
        PLAYER(),
        true,
        0,
        moves.span(),
        GoldenOutcome {
            score: 0,
            built: 5,
            discarded: 0,
            tile_count: 7,
            over: false,
            characters: 0,
            top1_score: 0,
        },
    );
}

// Differential check of P5-4 (`oracle::check`): the same games, the structure state compared with
// the walks after every build. Separate runs, so that the cases above measure the games alone.

#[test]
#[available_gas(l2_gas: 275968300)]
fn test_golden_daily_forest_woodsman_ring_structures_agree() {
    play_daily_checked(
        'forest_ring',
        day(4),
        PLAYER(),
        true,
        0,
        woodsman_ring_moves().span(),
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
#[available_gas(l2_gas: 268207440)]
fn test_golden_daily_forest_herdsman_caps_structures_agree() {
    play_daily_checked(
        'forest_caps',
        day(5),
        ANYONE(),
        true,
        0,
        herdsman_caps_moves().span(),
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
#[available_gas(l2_gas: 431364636)]
fn test_golden_daily_forest_both_roles_structures_agree() {
    play_daily_checked(
        'forest_both',
        day(6),
        SOMEONE(),
        true,
        0,
        both_roles_moves().span(),
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

#[test]
#[available_gas(l2_gas: 272179717)]
fn test_golden_daily_forest_herdsman_open_city_structures_agree() {
    play_daily_checked(
        'forest_open',
        day(7),
        PLAYER(),
        true,
        0,
        herdsman_open_city_moves().span(),
        GoldenOutcome {
            score: 0,
            built: 5,
            discarded: 0,
            tile_count: 7,
            over: false,
            characters: 0,
            top1_score: 0,
        },
    );
}

/// Checked board A (P5-5 audit): the ring of `woodsman_ring_moves` with a Lord on the road of the
/// fourth curve (spot `Center`). The fourth curve closes the loop of road and the forest at once.
/// By hand: the road is the loop of 4 curves, 4 nodes, power 1: 4 x 100 x 1 x bonus(4) =
/// 400 x 10972 / 10000 = 438 (438.88 rounded down); then the Woodsman scores its forest as in the
/// ring: 1 x 300 x 10972 / 10000 = 329. 438 + 329 = 767.
fn lord_and_woodsman_ring_moves() -> Array<GoldenMove> {
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
            Role::Lord,
            Spot::Center,
            767,
        ),
    ]
}

#[test]
#[available_gas(l2_gas: 277660734)]
fn test_golden_daily_forest_lord_and_woodsman_ring_structures_agree() {
    play_daily_checked(
        'forest_lord',
        day(4),
        PLAYER(),
        true,
        0,
        lord_and_woodsman_ring_moves().span(),
        GoldenOutcome {
            score: 767,
            built: 4,
            discarded: 0,
            tile_count: 6,
            over: false,
            characters: 0,
            top1_score: 0,
        },
    );
}

/// Checked board C (P5-5 audit): the ring of `woodsman_ring_moves` with a tile limit of 5, so that
/// the fourth curve is the last tile. It closes the loop and the forest: the Woodsman scores 329
/// (1 x 300 x 10972 / 10000), comes back, and the game is over (`tile_count 5 >= tile_limit 5`);
/// the score is the top score of the tournament.
#[test]
#[available_gas(l2_gas: 281232535)]
fn test_golden_daily_forest_woodsman_ring_last_tile_structures_agree() {
    play_daily_checked(
        'forest_last',
        day(4),
        PLAYER(),
        true,
        5,
        woodsman_ring_moves().span(),
        GoldenOutcome {
            score: 329,
            built: 4,
            discarded: 0,
            tile_count: 5,
            over: true,
            characters: 0,
            top1_score: 329,
        },
    );
}
