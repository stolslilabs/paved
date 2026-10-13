//! Scoring of roads, cities and wonders from their roots (phase P5, PR P5-4; D-18): step 4 of the
//! update algorithm, the arms that `GenericCount` and `WonderCount` held.
//!
//! D-18: a structure scores once, on the move that closes it (`open == 0`), with no character. Its
//! points are the formula of one character of power 1 and weight 1 (P-45). `Game::assess` reads
//! the root, checks that it is closed and not yet scored by the move, and calls these arms; scoring
//! writes no record.

use paved::events::{Event, Scored};
use paved::helpers::multiplier::compute_multiplier;
use paved::models::game::{Game, GameImpl};
use paved::store::{Store, StoreImpl};
use paved::structure::record::size_of;
use paved::types::category::{Category, CategoryImpl};

/// Scores the closed road or city of root record `record`: points `size x base x bonus(size)`,
/// one `Scored`.
pub fn score_generic(ref game: Game, ref store: Store, record: u64, category: Category) {
    let size: u32 = size_of(record).into();
    let (num, den) = compute_multiplier(size);
    let points = size * category.base_points() * num / den;
    game.add_score(points);
    game.count_structure(size);

    // [Event] Structure scored
    store
        .emit(
            Event::Scored(
                Scored {
                    game_id: game.id,
                    player_id: game.player_id,
                    category: category.into(),
                    size,
                    points,
                },
            ),
        );
}

/// Scores a wonder whose 8 surrounding positions are taken: points `base`, `Scored` with size 0.
pub fn score_wonder(ref game: Game, ref store: Store) {
    let points = Category::Wonder.base_points();
    game.add_score(points);
    game.count_wonder();

    // [Event] Wonder scored (a wonder has no size)
    store
        .emit(
            Event::Scored(
                Scored {
                    game_id: game.id,
                    player_id: game.player_id,
                    category: Category::Wonder.into(),
                    size: 0,
                    points,
                },
            ),
        );
}
