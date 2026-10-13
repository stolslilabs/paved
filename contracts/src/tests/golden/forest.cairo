//! Golden games of the forests (phase P4; rules of D-18 since D-18b).
//!
//! Same rules as `daily.cairo`: forced plans, the plan that the real deck draws is asserted before
//! each move. Coordinates are relative to `CENTER`, where the starter tile `RFFFRFCFR` (facing
//! South: city to the north, road west to east, forest to the south) lies.
//!
//! The cases keep the names of P4, when a Woodsman or a Herdsman stood on the forest. D-18 took
//! the characters out (D-18b): the moves keep their tiles and positions, and every structure
//! scores on the move that closes it. A forest is closed when every tile around it exists and every
//! road adjacent to it is closed; it scores `(closed roads + closed cities) x 300 x bonus(size)`,
//! with `bonus(n) = 1.0235^n` computed in integers over 10000: bonus(2) = 10475, bonus(4) = 10972.
//! The expected scores were derived from the oracle's walks (`oracle::score`, record runs of the
//! `*_structures_agree` tests), not from the structure state, and the forest figures checked by
//! hand below (`docs/measures/golden-games.md`).

use paved::models::tile::CENTER;
use paved::tests::golden::harness::{
    GoldenMove, GoldenOutcome, day, forced, play_daily, play_daily_checked,
};
use paved::tests::setup::setup::{ANYONE, PLAYER, SOMEONE};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;

/// Ring: four road curves `RFRFFFFFR` under the starter close a loop of road around one corner,
/// and their four inner corners make a forest of 4 tiles; the fourth curve closes the loop and the
/// forest. By hand (the fourth move): the road is the loop, 4 nodes, 4 x 100 x 10972 / 10000 = 438
/// (438.88 rounded down); the forest touches 1 closed road (the loop, touched four times, counted
/// once), 1 x 300 x 10972 / 10000 = 329. 438 + 329 = 767. (P4: the Woodsman alone, 329.)
fn woodsman_ring_moves() -> Array<GoldenMove> {
    array![
        forced(Plan::FFCFFFCFF, Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 1, 0),
        forced(Plan::SFRFRFFFR, Plan::RFRFFFFFR, Orientation::West, CENTER + 1, CENTER - 1, 0),
        forced(Plan::CFFFCFFFC, Plan::RFRFFFFFR, Orientation::North, CENTER + 1, CENTER - 2, 0),
        forced(Plan::SFRFRFRFR, Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2, 767),
    ]
}

/// Caps: two vertical city corridors `CFFFCFFFC` side by side north of the starter and east of it,
/// each closed by a cap (the starter's cap and a copy of the starter, then two `FFFFFFCFF` caps),
/// with a forest of 2 tiles between them; the second corridor, built last, closes the forest and
/// its own city. By hand, the forest: 2 closed cities (two distinct cities) x 300 x bonus(2) =
/// 2 x 300 x 10475 / 10000 = 628 (628.5 rounded down). (P4: the Herdsman alone, 628.)
fn herdsman_caps_moves() -> Array<GoldenMove> {
    array![
        forced(Plan::RFFFRFFFR, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, 0),
        forced(Plan::FFCFFFCFF, Plan::FFFFFFCFF, Orientation::North, CENTER, CENTER + 2, 643),
        forced(Plan::FFFFFFCFF, Plan::FFFFFFCFF, Orientation::North, CENTER + 1, CENTER + 2, 643),
        forced(Plan::RFRFFFFFR, Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER, 643),
        forced(Plan::RFRFCCCFR, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1, 1914),
    ]
}

/// Both boards in one game: the ring (south of the starter) is left one tile short while the arch
/// board (north and east) is built. The arch's forest scores first (a city arch closes both
/// corridors into one city that the forest touches twice, counted once): 1 x 300 x bonus(2) =
/// 300 x 10475 / 10000 = 314. Then the last curve closes the ring: road 438, forest 329. (P4: the
/// Herdsman and the Woodsman alone, 643.)
fn both_roles_moves() -> Array<GoldenMove> {
    array![
        forced(Plan::SFRFRFCFR, Plan::RFRFFFFFR, Orientation::South, CENTER, CENTER - 1, 0),
        forced(Plan::FFFFCCCFF, Plan::RFRFFFFFR, Orientation::West, CENTER + 1, CENTER - 1, 0),
        forced(Plan::RFRFRFCFF, Plan::RFRFFFFFR, Orientation::North, CENTER + 1, CENTER - 2, 0),
        forced(Plan::RFRFCCCFR, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, 0),
        forced(Plan::RFRFFFFFR, Plan::FFFFCCCFF, Orientation::North, CENTER, CENTER + 2, 0),
        forced(Plan::CCCCCFFFC, Plan::FFFFCCCFF, Orientation::East, CENTER + 1, CENTER + 2, 0),
        forced(Plan::RFFFRFFFR, Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER, 0),
        forced(Plan::WFFFFFFFF, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1, 1693),
        forced(Plan::RFFFRFFFR, Plan::RFRFFFFFR, Orientation::East, CENTER, CENTER - 2, 2460),
    ]
}

/// Open city, rule correction P-15: two vertical city corridors `CFFFCFFFC` side by side, east of
/// the starter (first the cap `RFFFRFCFR` that closes the east corridor to the south), with a
/// forest of 2 tiles between them. A corner `FFFFCCCFF` and a T-junction `CCCCCFFFC` over their
/// north ends join the two corridors into one city of 6 tiles, which stays **open**: the east edge
/// of the T-junction looks at an empty position. The forest touches that city at two places, one
/// corridor each. The west corridor, built last, closes the forest.
///
/// 2024 figure (recorded on the commit before the fix, `dc804707`, by running this case): **314**.
/// The walk stopped at the open edge of the city when it started from the west corridor, left the
/// east corridor unvisited, and found the rest of the city closed from the second contact: it
/// counted the open city once, 1 x 300 x bonus(2) = 300 x 10475 / 10000 = 314.
///
/// P5 figure (P-15, an open city never counts): **0** for the forest. By hand: the city is open,
/// so no city counts: 0 x 300 x bonus(2) = 0. The forest is closed all the same: it emits a
/// `Scored` of 0 points (D-18b, ruling 3).
fn herdsman_open_city_moves() -> Array<GoldenMove> {
    array![
        forced(Plan::FFFFFFCFF, Plan::RFFFRFCFR, Orientation::South, CENTER + 1, CENTER, 0),
        forced(Plan::RFRFRFCFF, Plan::CFFFCFFFC, Orientation::East, CENTER + 1, CENTER + 1, 0),
        forced(Plan::RFRFRFCFF, Plan::FFFFCCCFF, Orientation::East, CENTER + 1, CENTER + 2, 0),
        forced(Plan::RFRFFFFFR, Plan::CCCCCFFFC, Orientation::South, CENTER, CENTER + 2, 0),
        forced(Plan::RFFFRFFFR, Plan::CFFFCFFFC, Orientation::East, CENTER, CENTER + 1, 0),
    ]
}

#[test]
#[available_gas(l2_gas: 181814000)]
fn test_golden_daily_forest_woodsman_ring() {
    let moves = woodsman_ring_moves();
    play_daily(
        'forest_ring',
        day(4),
        PLAYER(),
        true,
        0,
        moves.span(),
        GoldenOutcome { score: 767, built: 4, discarded: 0, tile_count: 6, over: false },
    );
}

#[test]
#[available_gas(l2_gas: 194393000)]
fn test_golden_daily_forest_herdsman_caps() {
    let moves = herdsman_caps_moves();
    play_daily(
        'forest_caps',
        day(5),
        ANYONE(),
        true,
        0,
        moves.span(),
        GoldenOutcome { score: 1914, built: 5, discarded: 0, tile_count: 7, over: false },
    );
}

#[test]
#[available_gas(l2_gas: 244454000)]
fn test_golden_daily_forest_both_roles() {
    let moves = both_roles_moves();
    play_daily(
        'forest_both',
        day(6),
        SOMEONE(),
        true,
        0,
        moves.span(),
        GoldenOutcome { score: 2460, built: 9, discarded: 0, tile_count: 11, over: false },
    );
}

/// The new case of P5-5: the rule correction P-15, see `herdsman_open_city_moves`. Not a rule of
/// 2024: its 2024 figure was 314.
#[test]
#[available_gas(l2_gas: 193853000)]
fn test_golden_daily_forest_herdsman_open_city() {
    let moves = herdsman_open_city_moves();
    play_daily(
        'forest_open',
        day(7),
        PLAYER(),
        true,
        0,
        moves.span(),
        GoldenOutcome { score: 0, built: 5, discarded: 0, tile_count: 7, over: false },
    );
}

// Differential check of P5-4 (`oracle::check`): the same games, the structure state compared with
// the walks after every build. Separate runs, so that the cases above measure the games alone.

#[test]
#[available_gas(l2_gas: 440028000)]
fn test_golden_daily_forest_woodsman_ring_structures_agree() {
    play_daily_checked(
        'forest_ring',
        day(4),
        PLAYER(),
        true,
        0,
        woodsman_ring_moves().span(),
        GoldenOutcome { score: 767, built: 4, discarded: 0, tile_count: 6, over: false },
    );
}

#[test]
#[available_gas(l2_gas: 433100000)]
fn test_golden_daily_forest_herdsman_caps_structures_agree() {
    play_daily_checked(
        'forest_caps',
        day(5),
        ANYONE(),
        true,
        0,
        herdsman_caps_moves().span(),
        GoldenOutcome { score: 1914, built: 5, discarded: 0, tile_count: 7, over: false },
    );
}

#[test]
#[available_gas(l2_gas: 758797000)]
fn test_golden_daily_forest_both_roles_structures_agree() {
    play_daily_checked(
        'forest_both',
        day(6),
        SOMEONE(),
        true,
        0,
        both_roles_moves().span(),
        GoldenOutcome { score: 2460, built: 9, discarded: 0, tile_count: 11, over: false },
    );
}

#[test]
#[available_gas(l2_gas: 458009000)]
fn test_golden_daily_forest_herdsman_open_city_structures_agree() {
    play_daily_checked(
        'forest_open',
        day(7),
        PLAYER(),
        true,
        0,
        herdsman_open_city_moves().span(),
        GoldenOutcome { score: 0, built: 5, discarded: 0, tile_count: 7, over: false },
    );
}

/// Checked board C (P5-5 audit): the ring of `woodsman_ring_moves` with a tile limit of 5, so that
/// the fourth curve is the last tile. It closes the loop and the forest (767, as in the ring), and
/// the game is over (`tile_count 5 >= tile_limit 5`); the score is the final score of the
/// game. (Board A of the audit, the ring with a Lord on the road, is the ring itself since
/// D-18: it left with its Lord.)
#[test]
#[available_gas(l2_gas: 445519000)]
fn test_golden_daily_forest_woodsman_ring_last_tile_structures_agree() {
    play_daily_checked(
        'forest_last',
        day(4),
        PLAYER(),
        true,
        5,
        woodsman_ring_moves().span(),
        GoldenOutcome { score: 767, built: 4, discarded: 0, tile_count: 5, over: true },
    );
}
