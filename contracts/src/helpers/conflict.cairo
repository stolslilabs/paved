// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::store::{Store, StoreImpl};
use stolsli::types::spot::Spot;
use stolsli::types::area::Area;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::game::Game;
use stolsli::models::tile::{Tile, TilePosition, TileImpl};

#[generate_trait]
impl Conflict of ConflictTrait {
    #[inline(always)]
    fn starter(game: Game, tile: Tile, at: Spot, ref store: Store) -> bool {
        // [Compute] Setup recursion
        let mut visited: Felt252Dict<bool> = Default::default();
        let area: Area = tile.area(at);
        let visited_key = tile.get_key(area);
        visited.insert(visited_key, true);
        // [Compute] Recursively check characters
        Conflict::looper(game, tile, at, ref visited, ref store)
    }

    fn looper(
        game: Game, tile: Tile, at: Spot, ref visited: Felt252Dict<bool>, ref store: Store
    ) -> bool {
        let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
        loop {
            match north_oriented_moves.pop_front() {
                // [Compute] Process the current move
                Option::Some(north_oriented_move) => {
                    let mut move = north_oriented_move.rotate(tile.orientation.into());
                    let status = Conflict::iterer(game, tile, move, ref visited, ref store);
                    // [Check] If a character has been met, then stop the recursion
                    if status {
                        break status;
                    };
                },
                // [Check] Otherwise returns the points
                Option::None => { break false; },
            }
        }
    }

    fn iterer(
        game: Game, tile: Tile, move: Move, ref visited: Felt252Dict<bool>, ref store: Store
    ) -> bool {
        // [Check] A tile exists at this position, otherwise the structure is not finished
        let (x, y) = tile.proxy_coordinates(move.direction);
        let tile_position: TilePosition = store.tile_position(game, x, y);
        if tile_position.is_zero() {
            return false;
        }
        let neighbor = store.tile(game, tile_position.tile_id);

        // [Check] The neighbor area is already visited, then stop local recursion
        let area: Area = neighbor.area(move.spot);
        let visited_key = neighbor.get_key(area);
        let is_visited: bool = visited.get(visited_key);
        if (is_visited) {
            return false;
        };
        visited.insert(visited_key, true);

        // [Check] The neighbor handles a character
        let spot: Spot = neighbor.occupied_spot.into();
        if 0 != spot.into() && neighbor.are_connected(move.spot, spot) {
            return true;
        }

        // [Check] The neighbor is already visited, then do not count it
        Conflict::looper(game, neighbor, move.spot, ref visited, ref store)
    }
}
