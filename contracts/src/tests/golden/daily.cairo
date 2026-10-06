//! Golden games of the Daily mode.
//!
//! Every expected value was recorded by running the code of the commit that introduced this file
//! (characterisation test, see `docs/measures/golden-games.md`): the score after each move, and the
//! final counters. Moves are data, so that later phases replay them unchanged.
//! Coordinates are relative to `CENTER`, where the starter tile `RFFFRFCFR` (oriented South: city
//! to the north, road from west to east) lies.

use paved::models::tile::CENTER;
use paved::tests::golden::harness::{GoldenMove, GoldenOutcome, day, discard, forced, play_daily};
use paved::tests::setup::setup::{ANYONE, PLAYER, SOMEONE};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;

/// City of 5 tiles closed on the last move, deck cut at 5 tiles so that the game is over.
/// Starter (city cap) + three vertical city corridors + a city cap.
fn city5_moves() -> Array<GoldenMove> {
    array![
        forced(
            Plan::SFRFRFFFR,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER,
            CENTER + 1,
            Role::Paladin,
            Spot::Center,
            0,
        ),
        forced(
            Plan::FFFFCCCFF,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER,
            CENTER + 2,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::FFCFFFFFC,
            Plan::CFFFCFFFC,
            Orientation::East,
            CENTER,
            CENTER + 3,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFRFFFFFR,
            Plan::FFFFFFCFF,
            Orientation::North,
            CENTER,
            CENTER + 4,
            Role::None,
            Spot::None,
            2245,
        ),
    ]
}

/// Road of 6 tiles closed on the last move: stop, starter, 3 straights, stop.
fn road6_moves() -> Array<GoldenMove> {
    array![
        forced(
            Plan::FFFFFFCFF,
            Plan::RFFFRFFFR,
            Orientation::North,
            CENTER + 1,
            CENTER,
            Role::Adventurer,
            Spot::East,
            0,
        ),
        forced(
            Plan::CCCCCFRFC,
            Plan::RFFFRFFFR,
            Orientation::North,
            CENTER + 2,
            CENTER,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::RFFFRFFFR,
            Plan::RFFFRFFFR,
            Orientation::North,
            CENTER + 3,
            CENTER,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::FFCFFFCFF,
            Plan::SFRFRFFFR,
            Orientation::North,
            CENTER + 4,
            CENTER,
            Role::None,
            Spot::None,
            0,
        ),
        forced(
            Plan::CCCCCFRFC,
            Plan::SFRFRFFFR,
            Orientation::North,
            CENTER - 1,
            CENTER,
            Role::None,
            Spot::None,
            1379,
        ),
    ]
}

/// Three roles on three spot types: a pilgrim on a wonder (left open), a paladin on a city closed
/// right away, an adventurer on a road closed by the last move. No role is allowed on a forest.
fn mixed_moves() -> Array<GoldenMove> {
    array![
        forced(
            Plan::SFRFRFCFR,
            Plan::WFFFFFFFR,
            Orientation::North,
            CENTER + 1,
            CENTER,
            Role::Pilgrim,
            Spot::Center,
            0,
        ),
        forced(
            Plan::RFRFCCCFR,
            Plan::FFFFFFCFF,
            Orientation::North,
            CENTER,
            CENTER + 1,
            Role::Paladin,
            Spot::South,
            838,
        ),
        forced(
            Plan::CCCCCFFFC,
            Plan::RFFFRFFFR,
            Orientation::North,
            CENTER - 1,
            CENTER,
            Role::Adventurer,
            Spot::East,
            838,
        ),
        forced(
            Plan::WFFFFFFFF,
            Plan::SFRFRFFFR,
            Orientation::North,
            CENTER - 2,
            CENTER,
            Role::None,
            Spot::None,
            1715,
        ),
    ]
}

#[test]
#[available_gas(l2_gas: 710810288)]
fn test_golden_daily_city5_game_over() {
    let moves = city5_moves();
    play_daily(
        'daily_city5',
        day(0),
        PLAYER(),
        true,
        5,
        moves.span(),
        GoldenOutcome {
            score: 2245,
            built: 4,
            discarded: 0,
            tile_count: 5,
            over: true,
            characters: 0,
            top1_score: 2245,
        },
    );
}

#[test]
#[available_gas(l2_gas: 770365032)]
fn test_golden_daily_road6() {
    let moves = road6_moves();
    play_daily(
        'daily_road6',
        day(1),
        ANYONE(),
        true,
        0,
        moves.span(),
        GoldenOutcome {
            score: 1379,
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
#[available_gas(l2_gas: 734284283)]
fn test_golden_daily_mixed_roles() {
    let moves = mixed_moves();
    play_daily(
        'daily_mixed',
        day(2),
        SOMEONE(),
        true,
        0,
        moves.span(),
        GoldenOutcome {
            score: 1715,
            built: 4,
            discarded: 0,
            tile_count: 6,
            over: false,
            characters: 32,
            top1_score: 0,
        },
    );
}

/// Real deck, no forced plan: pins the draw order of the seed (tournament day 3) through discards.
#[test]
#[available_gas(l2_gas: 639735276)]
fn test_golden_daily_real_deck_discards_to_game_over() {
    let moves = array![
        discard(Plan::CCCCCFFFC, 0), discard(Plan::SFRFRFRFR, 0), discard(Plan::RFRFFFFFR, 0),
        discard(Plan::SFRFRFFFR, 0), discard(Plan::RFFFRFFFR, 0), discard(Plan::RFFFRFFFR, 0),
        discard(Plan::FFFFCCCFF, 0),
    ];
    play_daily(
        'daily_deck',
        day(3),
        PLAYER(),
        false,
        8,
        moves.span(),
        GoldenOutcome {
            score: 0,
            built: 0,
            discarded: 7,
            tile_count: 8,
            over: true,
            characters: 0,
            top1_score: 0,
        },
    );
}
