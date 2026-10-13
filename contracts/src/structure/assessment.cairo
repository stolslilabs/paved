//! Scoring of roads, cities and wonders from their roots (phase P5, PR P5-4; D-18): step 4 of the
//! update algorithm, the arms that `GenericCount` and `WonderCount` held.
//!
//! D-18: a structure scores once, on the move that closes it (`open == 0`), with no character. Its
//! points are the formula of one character of power 1 and weight 1 (P-45). `Game::assess` reads
//! the root, checks that it is closed and not yet scored by the move, and calls these arms; scoring
//! writes no record.
//!
//! D-19: a structure's points go to its winner, the owner of the most of its tiles
//! (`owners.cairo`), the game's player in a game with one player. On a tie the winner is 0: no
//! points are added, `Scored` is emitted with player 0 and points 0, and the closure counters still
//! count the structure.

use paved::events::{Event, Scored};
use paved::helpers::multiplier::compute_multiplier;
use paved::models::game::{Game, GameImpl};
use paved::store::{Store, StoreImpl};
use paved::structure::record::size_of;
use paved::types::category::{Category, CategoryImpl};

/// Scores the closed road or city of root record `record` for `winner` (0 on a tie): points
/// `size x base x bonus(size)`, one `Scored`.
pub fn score_generic(
    ref game: Game, ref store: Store, record: u64, category: Category, winner: felt252,
) {
    let size: u32 = size_of(record).into();
    let points = if winner == 0 {
        0
    } else {
        let (num, den) = compute_multiplier(size);
        let points = size * category.base_points() * num / den;
        game.add_score(points);
        points
    };
    game.count_structure(size);

    // [Event] Structure scored
    store
        .emit(
            Event::Scored(
                Scored {
                    game_id: game.id, player_id: winner, category: category.into(), size, points,
                },
            ),
        );
}

/// Scores a wonder whose 8 surrounding positions are taken for `winner` (0 on a tie): points
/// `base`, `Scored` with size 0.
pub fn score_wonder(ref game: Game, ref store: Store, winner: felt252) {
    let points = if winner == 0 {
        0
    } else {
        let points = Category::Wonder.base_points();
        game.add_score(points);
        points
    };
    game.count_wonder();

    // [Event] Wonder scored (a wonder has no size)
    store
        .emit(
            Event::Scored(
                Scored {
                    game_id: game.id,
                    player_id: winner,
                    category: Category::Wonder.into(),
                    size: 0,
                    points,
                },
            ),
        );
}
