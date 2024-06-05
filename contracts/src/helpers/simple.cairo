// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::store::{Store, StoreImpl};
use paved::helpers::generic::GenericCount;
use paved::types::spot::Spot;
use paved::types::area::Area;
use paved::types::move::{Move, MoveImpl};
use paved::models::game::Game;
use paved::models::tile::{Tile, TilePosition, ZeroableTilePosition, TileImpl};

#[generate_trait]
impl SimpleCount of SimpleCountTrait {
    #[inline(always)]
    fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> u32 {
        // [Compute] Setup recursion
        let mut visited: Felt252Dict<bool> = core::Default::default();
        // [Compute] Recursively count the points
        let mut count = 0;
        Self::iter(game, tile, at, ref count, ref visited, ref store);
        count
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
}
