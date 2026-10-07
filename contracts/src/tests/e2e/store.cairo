//! Round trips of the packed storage (phase P2): every field at its maximum (the orientation
//! excepted), and keys put back.

use core::num::traits::Bounded;
use paved::models::builder::Builder;
use paved::models::character::Char;
use paved::models::game::Game;
use paved::models::player::Player;
use paved::models::tile::{Tile, TilePosition};
use paved::models::tournament::Tournament;
use paved::store::{StoreImpl, StoreTrait};
use paved::tests::setup::setup;
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use snforge_std::interact_with_state;

const MAX_U8: u32 = 255;
const BIG: felt252 = 0x800000000000011000000000000000000000000000000000000000000000000 - 1;

#[test]
fn test_store_round_trips_at_maximum_values() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    interact_with_state(
        systems.daily.contract_address,
        || {
            let store = StoreImpl::new();
            let game = Game {
                id: Bounded::MAX,
                player_id: BIG,
                held_tile: MAX_U8,
                characters: Bounded::MAX,
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
                tournament_id: Bounded::MAX,
                tile_limit: Bounded::MAX,
            };
            store.set_game(game);
            assert_eq!(store.game(game.id), game);

            // The builder is the tile in hand and the roles placed of the game's player
            let builder = Builder {
                game_id: game.id, player_id: BIG, tile_id: MAX_U8, characters: Bounded::MAX,
            };
            assert_eq!(store.builder(game, BIG), builder);
            let other = Builder { game_id: game.id, player_id: 'OTHER', tile_id: 0, characters: 0 };
            assert_eq!(store.builder(game, 'OTHER'), other);
            let moved = Builder {
                game_id: game.id, player_id: BIG, tile_id: 7, characters: 0x1234,
            };
            store.set_builder(moved);
            assert_eq!(store.builder(game, BIG), moved);
            let after = store.live_game(game.id);
            assert_eq!(after.held_tile, 7);
            assert_eq!(after.characters, 0x1234);
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
                occupied_spot: Bounded::MAX,
            };
            store.set_tile(tile);
            assert_eq!(store.tile(game, tile.id), tile);
            assert_eq!(
                store.tile_position(game, tile.x, tile.y),
                TilePosition { game_id: game.id, x: tile.x, y: tile.y, tile_id: tile.id },
            );

            let role = Role::Pilgrim;
            let character = Char {
                game_id: game.id,
                player_id: BIG,
                index: role.into(),
                tile_id: tile.id,
                spot: Spot::NorthWest.into(),
                weight: 3,
                power: 3,
            };
            store.set_character(character);
            assert_eq!(store.character(game, BIG, role), character);
            assert_eq!(store.character_at(game, tile, Spot::NorthWest), character);
            // Another role in the same slot leaves the first one untouched.
            let other = Char {
                index: Role::Herdsman.into(), spot: Spot::South.into(), ..character,
            };
            store.set_character(other);
            assert_eq!(store.character(game, BIG, role), character);
            assert_eq!(store.character(game, BIG, Role::Herdsman), other);
            assert_eq!(store.character_at(game, tile, Spot::South), other);

            let tournament = Tournament {
                id: Bounded::MAX,
                prize: BIG,
                top1_player_id: BIG,
                top2_player_id: BIG - 1,
                top3_player_id: BIG - 2,
                top1_score: Bounded::MAX,
                top2_score: Bounded::MAX - 1,
                top3_score: Bounded::MAX - 2,
                top1_claimed: true,
                top2_claimed: false,
                top3_claimed: true,
            };
            store.set_tournament(tournament);
            assert_eq!(store.tournament(tournament.id), tournament);
        },
    );
}

#[test]
fn test_store_missing_entries_read_as_zero_with_keys() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    interact_with_state(
        systems.account.contract_address,
        || {
            let store = StoreImpl::new();
            let player = store.player('NOBODY');
            assert_eq!(player, Player { id: 'NOBODY', name: 0, master: 0 });
            let game = store.game(42);
            assert_eq!(game.id, 42);
            assert_eq!(game.tile_count, 0);
            assert_eq!(game.player_id, 0);
            let builder = store.builder(game, 'NOBODY');
            assert_eq!(
                builder, Builder { game_id: 42, player_id: 'NOBODY', tile_id: 0, characters: 0 },
            );
        },
    );
}
