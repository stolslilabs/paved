// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::store::{Store, StoreImpl};
use stolsli::helpers::road::RoadCount;
use stolsli::types::spot::{Spot, SpotImpl};
use stolsli::types::area::Area;
use stolsli::types::plan::Plan;
use stolsli::types::direction::Direction;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::game::Game;
use stolsli::models::game::{Character, CharacterPosition};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};

#[generate_trait]
impl ForestCount of ForestCountTrait {
    #[inline(always)]
    fn starter(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, Array<Character>) {
        // [Compute] Setup recursion
        let mut characters: Array<Character> = ArrayTrait::new();
        let mut visited: Felt252Dict<bool> = Default::default();
        // [Compute] Recursively count the points
        let mut score = 0;
        ForestCount::looper(game, tile, at, ref score, ref visited, ref characters, ref store);
        (score, characters)
    }

    fn looper(
        game: Game,
        tile: Tile,
        at: Spot,
        ref score: u32,
        ref visited: Felt252Dict<bool>,
        ref characters: Array<Character>,
        ref store: Store
    ) {
        // [Compute] Process adjacent categories
        let mut north_oriented_spots: Array<Spot> = tile.north_oriented_adjacent_roads(at);
        loop {
            match north_oriented_spots.pop_front() {
                Option::Some(north_oriented_spot) => {
                    let spot = north_oriented_spot.rotate(tile.orientation.into());
                    let area: Area = tile.area(spot);
                    let key = tile.get_key(area);

                    // [Check] If the area is not visited, then count it
                    if !visited.get(key) {
                        visited.insert(key, true);
                        let is_closed = RoadCount::starter(game, tile, spot, ref store) > 0;
                        if is_closed {
                            score += 1;
                        };
                    };
                },
                Option::None => { break; },
            };
        };

        let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
        loop {
            match north_oriented_moves.pop_front() {
                // [Compute] Process the current move
                Option::Some(north_oriented_move) => {
                    let mut move = north_oriented_move.rotate(tile.orientation.into());
                    ForestCount::iterer(
                        game, tile, move, ref score, ref visited, ref characters, ref store
                    );
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
        ref characters: Array<Character>,
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

        // [Check] The neighbor handles a character
        let spot: Spot = neighbor.occupied_spot.into();
        if 0 != spot.into() && neighbor.are_connected(move.spot, spot) {
            let character_position: CharacterPosition = store
                .character_position(game, neighbor, neighbor.occupied_spot.into());
            let character = store
                .character(game, character_position.builder_id, character_position.index.into());
            characters.append(character);
        };

        // [Check] Continue recursion on the neighbor with the next move
        ForestCount::looper(
            game, neighbor, move.spot, ref score, ref visited, ref characters, ref store
        )
    }
}
