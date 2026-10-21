//! Round trips of the packed storage (phase P2): every field at its maximum (the orientation
//! excepted), and keys put back.

use core::num::traits::Bounded;
use paved::constants;
use paved::models::builder::Builder;
use paved::models::game::{FREE_GAME, Game, GameImpl};
use paved::models::tile::{Tile, TilePosition};
use paved::store::{StoreImpl, StoreTrait};
use paved::tests::setup::setup;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use snforge_std::interact_with_state;

const MAX_U8: u32 = 255;
const BIG: felt252 = 0x800000000000011000000000000000000000000000000000000000000000000 - 1;

#[test]
#[available_gas(l2_gas: 67739240)]
fn test_store_round_trips_at_maximum_values() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    interact_with_state(
        systems.challenge.contract_address,
        || {
            let store = StoreImpl::new();
            let game = Game {
                id: Bounded::MAX,
                player_id: BIG,
                held_tile: MAX_U8,
                over: true,
                discarded: Bounded::MAX,
                built: Bounded::MAX,
                tiles: Bounded::MAX,
                tile_count: MAX_U8,
                start_time: Bounded::MAX,
                end_time: Bounded::MAX,
                score: Bounded::MAX,
                seed: BIG,
                mode: Bounded::MAX,
                day_id: Bounded::MAX,
                tile_limit: Bounded::MAX,
                counts: GameImpl::counts_of(
                    constants::MAX_STRUCTURES,
                    constants::MAX_FORESTS,
                    constants::MAX_WONDERS,
                    constants::MAX_BIG,
                )
                    + FREE_GAME,
                // #645: the queue's 11 bits, above the counters, all set
                queue: 0x7ff,
            };
            store.set_game(game);
            assert_eq!(store.game(game.id), game);

            // The builder is the tile in hand of the game's player
            let builder = Builder { game_id: game.id, player_id: BIG, tile_id: MAX_U8 };
            assert_eq!(store.builder(game, BIG), builder);
            let other = Builder { game_id: game.id, player_id: 'OTHER', tile_id: 0 };
            assert_eq!(store.builder(game, 'OTHER'), other);
            let moved = Builder { game_id: game.id, player_id: BIG, tile_id: 7 };
            store.set_builder(moved);
            assert_eq!(store.builder(game, BIG), moved);
            let after = store.live_game(game.id);
            assert_eq!(after.held_tile, 7);
            assert_eq!(after.counts, game.counts);
            assert_eq!(after.queue, game.queue);
            assert_eq!(after.tiles, game.tiles);
            assert_eq!(after.score, game.score);
            assert_eq!(after.seed, game.seed);

            let tile = Tile {
                game_id: game.id,
                id: MAX_U8,
                plan: Bounded::MAX,
                // A valid orientation: an unknown value reads as `None` (not placed).
                orientation: Orientation::West.into(),
                x: Bounded::MAX,
                y: Bounded::MAX,
                // D-19: the owner's seat, bits 96 to 104 of the slot
                owner: Bounded::MAX,
            };
            store.set_tile(tile);
            assert_eq!(store.tile(game, tile.id), tile);
            assert_eq!(
                store.tile_position(game, tile.x, tile.y),
                TilePosition { game_id: game.id, x: tile.x, y: tile.y, tile_id: tile.id },
            );
        },
    );
}

#[test]
#[available_gas(l2_gas: 62598501)]
fn test_store_missing_entries_read_as_zero_with_keys() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    interact_with_state(
        systems.challenge.contract_address,
        || {
            let store = StoreImpl::new();
            let game = store.game(42);
            assert_eq!(game.id, 42);
            assert_eq!(game.tile_count, 0);
            assert_eq!(game.player_id, 0);
            let builder = store.builder(game, 'NOBODY');
            assert_eq!(builder, Builder { game_id: 42, player_id: 'NOBODY', tile_id: 0 });
        },
    );
}
