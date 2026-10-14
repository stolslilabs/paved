//! Golden games of the Daily mode.
//!
//! The moves are data, replayed unchanged since P0; D-18b took their characters out (D-18). The
//! expected scores after each move were derived from the oracle's walks under the rules without
//! characters (`oracle::score`, record runs of the `*_structures_agree` tests), not from the
//! structure state; the other final counters do not depend on scoring
//! (`docs/measures/golden-games.md`). `mixed_roles` keeps its name of P0, when it placed several
//! roles.
//! Coordinates are relative to `CENTER`, where the starter tile `RFFFRFCFR` (oriented South: city
//! to the north, road from west to east) lies.

use paved::models::tile::CENTER;
use paved::tests::golden::harness::{
    GoldenMove, GoldenOutcome, day, discard, forced, play_daily, play_daily_checked,
};
use paved::tests::setup::setup::{ANYONE, PLAYER, SOMEONE};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;

/// City of 5 tiles closed on the last move, deck cut at 5 tiles so that the game is over.
/// Starter (city cap) + three vertical city corridors + a city cap.
fn city5_moves() -> Array<GoldenMove> {
    array![
        forced(Plan::WFFFFFFFF, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, 0),
        forced(Plan::FFFFCCCFF, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 2, 0),
        forced(Plan::FFCFFFFFC, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 3, 0),
        forced(Plan::FFCFFFCFF, Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 4, 1122),
    ]
}

/// Road of 6 tiles closed on the last move: stop, starter, 3 straights, stop.
fn road6_moves() -> Array<GoldenMove> {
    array![
        forced(Plan::RFRFFFFFR, Plan::RFFFRFFFR, Orientation::North, CENTER + 1, CENTER, 0),
        forced(Plan::WFFFFFFFF, Plan::RFFFRFFFR, Orientation::North, CENTER + 2, CENTER, 0),
        forced(Plan::RFFFRFFFR, Plan::RFFFRFFFR, Orientation::North, CENTER + 3, CENTER, 0),
        forced(Plan::WFFFFFFFF, Plan::SFRFRFFFR, Orientation::North, CENTER + 4, CENTER, 0),
        forced(Plan::CCCCCFRFC, Plan::SFRFRFFFR, Orientation::North, CENTER - 1, CENTER, 689),
    ]
}

/// Three roles on three spot types: a pilgrim on a wonder (left open), a paladin on a city closed
/// right away, an adventurer on a road closed by the last move. None of these roles is allowed on a
/// forest (the Woodsman and the Herdsman, of P4, are: see `forest.cairo`).
fn mixed_moves() -> Array<GoldenMove> {
    array![
        forced(Plan::RFFFRFFFR, Plan::WFFFFFFFR, Orientation::North, CENTER + 1, CENTER, 0),
        forced(Plan::RFRFCCCFR, Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 1, 419),
        forced(Plan::WFFFFFFFR, Plan::RFFFRFFFR, Orientation::North, CENTER - 1, CENTER, 419),
        forced(Plan::FFCFFFCFF, Plan::SFRFRFFFR, Orientation::North, CENTER - 2, CENTER, 857),
    ]
}

#[test]
#[available_gas(l2_gas: 136321278)]
fn test_golden_daily_city5_game_over() {
    let moves = city5_moves();
    play_daily(
        'daily_city5',
        day(0),
        PLAYER(),
        true,
        5,
        moves.span(),
        GoldenOutcome { score: 1122, built: 4, discarded: 0, tile_count: 5, over: true },
    );
}

#[test]
#[available_gas(l2_gas: 139938339)]
fn test_golden_daily_road6() {
    let moves = road6_moves();
    play_daily(
        'daily_road6',
        day(1),
        ANYONE(),
        true,
        0,
        moves.span(),
        GoldenOutcome { score: 689, built: 5, discarded: 0, tile_count: 7, over: false },
    );
}

#[test]
#[available_gas(l2_gas: 129818455)]
fn test_golden_daily_mixed_roles() {
    let moves = mixed_moves();
    play_daily(
        'daily_mixed',
        day(2),
        SOMEONE(),
        true,
        0,
        moves.span(),
        GoldenOutcome { score: 857, built: 4, discarded: 0, tile_count: 6, over: false },
    );
}

/// Real deck, no forced plan: pins the draw order of the seed (day 3) through discards.
#[test]
#[available_gas(l2_gas: 136212421)]
fn test_golden_daily_real_deck_discards_to_game_over() {
    let moves = array![
        discard(Plan::CCCCCCCCC, 0), discard(Plan::FFFFFFCFF, 0), discard(Plan::RFRFFFFFR, 0),
        discard(Plan::RFRFFFFFR, 0), discard(Plan::RFRFRFCFF, 0), discard(Plan::RFRFRFCFF, 0),
        discard(Plan::SFRFRFFFR, 0),
    ];
    play_daily(
        'daily_deck',
        day(3),
        PLAYER(),
        false,
        8,
        moves.span(),
        GoldenOutcome { score: 0, built: 0, discarded: 7, tile_count: 8, over: true },
    );
}

// Differential check of P5-4 (`oracle::check`): the same games, the structure state compared with
// the walks after every build. Separate runs, so that the cases above measure the games alone.

#[test]
#[available_gas(l2_gas: 351757147)]
fn test_golden_daily_city5_structures_agree() {
    play_daily_checked(
        'daily_city5',
        day(0),
        PLAYER(),
        true,
        5,
        city5_moves().span(),
        GoldenOutcome { score: 1122, built: 4, discarded: 0, tile_count: 5, over: true },
    );
}

#[test]
#[available_gas(l2_gas: 484183072)]
fn test_golden_daily_road6_structures_agree() {
    play_daily_checked(
        'daily_road6',
        day(1),
        ANYONE(),
        true,
        0,
        road6_moves().span(),
        GoldenOutcome { score: 689, built: 5, discarded: 0, tile_count: 7, over: false },
    );
}

#[test]
#[available_gas(l2_gas: 368198204)]
fn test_golden_daily_mixed_roles_structures_agree() {
    play_daily_checked(
        'daily_mixed',
        day(2),
        SOMEONE(),
        true,
        0,
        mixed_moves().span(),
        GoldenOutcome { score: 857, built: 4, discarded: 0, tile_count: 6, over: false },
    );
}

#[test]
#[available_gas(l2_gas: 159003657)]
fn test_golden_daily_real_deck_discards_to_game_over_structures_agree() {
    let moves = array![
        discard(Plan::CCCCCCCCC, 0), discard(Plan::FFFFFFCFF, 0), discard(Plan::RFRFFFFFR, 0),
        discard(Plan::RFRFFFFFR, 0), discard(Plan::RFRFRFCFF, 0), discard(Plan::RFRFRFCFF, 0),
        discard(Plan::SFRFRFFFR, 0),
    ];
    play_daily_checked(
        'daily_deck',
        day(3),
        PLAYER(),
        false,
        8,
        moves.span(),
        GoldenOutcome { score: 0, built: 0, discarded: 7, tile_count: 8, over: true },
    );
}
