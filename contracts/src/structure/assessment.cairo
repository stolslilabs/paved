//! Assessment of roads, cities and wonders from their roots (phase P5, PR P5-4): step 4 of the
//! update algorithm, the arms that `GenericCount` and `WonderCount` held.
//!
//! A structure scores when it is closed (`open == 0`) and holds characters. Scoring recovers every
//! character of it, so a second start spot on the same structure finds nothing, as the walks did.
//! The game has one player, who always wins a structure that holds one of their characters: every
//! role allowed on a road or a city weighs at least 1 there, so `GenericCount::solve` always found
//! a winner.

use paved::events::{Event, Scored};
use paved::helpers::multiplier::compute_multiplier;
use paved::models::builder::BuilderImpl;
use paved::models::game::{Game, GameImpl};
use paved::store::{Store, StoreImpl};
use paved::structure::placement::role_bit;
use paved::structure::record::{chars_of, open_of, size_of, without_chars};
use paved::structure::state::{Structures, StructuresTrait};
use paved::types::category::{Category, CategoryImpl};

/// The roles a `chars` bitmap can hold today.
const MAX_ROLE: u8 = 7;

/// Scores the road or city of `sid` if it is closed and holds characters: points `size x base x
/// max power x bonus(size)`, one `Scored`, every character recovered. Returns whether it scored.
pub fn assess_generic(
    ref game: Game, ref structures: Structures, ref store: Store, sid: u32, category: Category,
) -> bool {
    let (root, record) = structures.find(sid);
    let chars = chars_of(record);
    if open_of(record) != 0 || chars == 0 {
        return false;
    }
    let power = recover_all(ref game, chars, ref store);
    let size: u32 = size_of(record).into();
    let (num, den) = compute_multiplier(size);
    let points = size * category.base_points() * power * num / den;
    game.add_score(points);

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

    structures.set(root, without_chars(record, chars));
    true
}

/// Scores the wonder of `sid` if the 8 positions around it are taken and a character stands on
/// it: points `base x power`, `Scored` with size 0, the character recovered. Returns whether it
/// scored.
pub fn assess_wonder(
    ref game: Game, ref structures: Structures, ref store: Store, sid: u32,
) -> bool {
    let (root, record) = structures.find(sid);
    let chars = chars_of(record);
    if open_of(record) != 0 || chars == 0 {
        return false;
    }
    // [Info] A wonder is one area of one tile: it holds one character at most
    let mut role: u8 = 1;
    while role <= MAX_ROLE {
        if chars & role_bit(role) != 0 {
            break;
        }
        role += 1;
    }
    let mut character = store.character(game, game.player_id, role.into());
    let power: u32 = character.power.into();
    let points = Category::Wonder.base_points() * power;
    game.add_score(points);

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

    // [Effect] Recover the character
    let (mut tile, refs) = StoreImpl::tile_with_refs(game.id, character.tile_id);
    let mut builder = store.builder(game, game.player_id);
    builder.recover(ref character, ref tile);
    store.set_character(character);
    StoreImpl::write_tile(tile, refs);
    store.set_builder(builder);

    structures.set(root, without_chars(record, chars));
    true
}

/// Recovers every character of a `chars` bitmap (tile spot cleared, role back to the builder, entry
/// of `Characters` cleared), in role order. Returns their highest power.
fn recover_all(ref game: Game, chars: u16, ref store: Store) -> u32 {
    let mut power: u32 = 0;
    let mut role: u8 = 1;
    while role <= MAX_ROLE {
        if chars & role_bit(role) != 0 {
            let mut character = store.character(game, game.player_id, role.into());
            let character_power: u32 = character.power.into();
            if character_power > power {
                power = character_power;
            }
            let (mut tile, refs) = StoreImpl::tile_with_refs(game.id, character.tile_id);
            let mut builder = store.builder(game, game.player_id);
            builder.recover(ref character, ref tile);
            store.set_character(character);
            StoreImpl::write_tile(tile, refs);
            store.set_builder(builder);
        }
        role += 1;
    }
    power
}
