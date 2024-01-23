// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::store::{Store, StoreImpl};
use stolsli::helpers::generic::GenericCount;
use stolsli::types::spot::Spot;
use stolsli::types::area::Area;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::game::Game;
use stolsli::models::game::{Character, CharacterPosition};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};

#[generate_trait]
impl RoadCount of RoadCountTrait {
    #[inline(always)]
    fn starter(game: Game, tile: Tile, at: Spot, ref store: Store) -> u32 {
        // [Compute] Setup recursion
        let mut visited: Felt252Dict<bool> = Default::default();
        // [Compute] Recursively count the points
        let mut score = 0;
        RoadCount::looper(game, tile, at, ref score, ref visited, ref store);
        score
    }

    fn looper(
        game: Game,
        tile: Tile,
        at: Spot,
        ref score: u32,
        ref visited: Felt252Dict<bool>,
        ref store: Store
    ) {
        let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
        loop {
            match north_oriented_moves.pop_front() {
                // [Compute] Process the current move
                Option::Some(north_oriented_move) => {
                    let mut move = north_oriented_move.rotate(tile.orientation.into());
                    RoadCount::iterer(game, tile, move, ref score, ref visited, ref store);
                    // [Check] If the points are zero, the structure is not finished
                    if 0 == score.into() {
                        break;
                    };
                },
                // [Check] Otherwise returns the points
                Option::None => { break; },
            }
        }
    }

    fn iterer(
        game: Game,
        tile: Tile,
        move: Move,
        ref score: u32,
        ref visited: Felt252Dict<bool>,
        ref store: Store
    ) {
        // [Check] A tile exists at this position, otherwise the structure is not finished
        let (x, y) = tile.proxy_coordinates(move.direction);
        let tile_position: TilePosition = store.tile_position(game, x, y);
        if tile_position.is_zero() {
            score = 0;
            return;
        }

        // [Check] The neighbor area is already visited, then stop local recursion
        let neighbor = store.tile(game, tile_position.tile_id);
        let area: Area = neighbor.area(move.spot);
        let visited_key = neighbor.get_key(area);
        let is_visited: bool = visited.get(visited_key);
        if (is_visited) {
            return;
        };
        visited.insert(visited_key, true);

        // [Check] The neighbor is already visited, then do not count it
        let visited_key: felt252 = neighbor.id.into();
        if !visited.get(visited_key) {
            score += 1;
        };
        visited.insert(visited_key, true);
        RoadCount::looper(game, neighbor, move.spot, ref score, ref visited, ref store)
    }
}
