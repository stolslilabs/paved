// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::store::{Store, StoreImpl};
use paved::types::spot::Spot;
use paved::types::area::Area;
use paved::types::move::{Move, MoveImpl};
use paved::models::game::{Game, GameImpl};
use paved::models::builder::{Builder, BuilderImpl};
use paved::models::character::{Char, CharPosition, ZeroableChar};
use paved::models::tile::{Tile, TilePosition, ZeroableTilePosition, TileImpl};

#[generate_trait]
impl WonderCount of WonderCountTrait {
    #[inline]
    fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, Char) {
        // [Compute] Setup recursion
        let mut visited: Felt252Dict<bool> = core::Default::default();
        // [Check] Starting spot is occupied, otherwise no need to process further
        let spot: Spot = tile.occupied_spot.into();
        if spot != at {
            return (0, core::Zeroable::zero());
        };
        // [Compute] Extract the character
        let character_position: CharPosition = store.character_position(game, tile, spot.into());
        let character = store
            .character(game, character_position.player_id, character_position.index.into());
        // [Compute] Recursively count the points
        let mut count = 0;
        Self::iter(game, tile, at, ref count, ref visited, ref store);
        (count, character)
    }

    fn iter(
        game: Game,
        tile: Tile,
        at: Spot,
        ref count: u32,
        ref visited: Felt252Dict<bool>,
        ref store: Store
    ) {
        // [Check] The tile area is already visited, then pass
        let area: Area = tile.area(at);
        let visited_key = tile.get_key(area);
        if visited.get(visited_key) {
            return;
        };
        visited.insert(visited_key, true);
        count += 1;

        // [Compute] Process next tiles if exist
        let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
        loop {
            match north_oriented_moves.pop_front() {
                // [Compute] Process the current move
                Option::Some(north_oriented_move) => {
                    let mut move = north_oriented_move.rotate(tile.orientation.into());

                    // [Check] A tile exists at this position, otherwise the structure is not
                    // finished
                    let (x, y) = tile.proxy_coordinates(move.direction);
                    let tile_position: TilePosition = store.tile_position(game, x, y);
                    if tile_position.is_zero() {
                        count = 0;
                        break;
                    }

                    // [Check] If the points are zero, the structure is not finished
                    let neighbor = store.tile(game, tile_position.tile_id);
                    Self::iter(game, neighbor, move.spot, ref count, ref visited, ref store);
                    if 0 == count.into() {
                        break;
                    };
                },
                // [Check] Otherwise returns the points
                Option::None => { break; },
            }
        }
    }

    fn solve(ref game: Game, base_points: u32, ref character: Char, ref store: Store) {
        // [Effect] Collect the character's builder
        let mut tile = store.tile(game, character.tile_id);
        let player = store.player(character.player_id);
        let mut builder = store.builder(game, player.id);
        let power: u32 = character.power.into();
        let points = base_points * power;
        builder.score += points;
        builder.recover(ref character, ref tile);

        // [Effect] Update the character
        store.set_character(character);

        // [Effect] Update the tile
        store.set_tile(tile);

        // [Effect] Update the builder
        store.set_builder(builder);
    }
}
