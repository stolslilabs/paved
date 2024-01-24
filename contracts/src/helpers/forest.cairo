// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::store::{Store, StoreImpl};
use stolsli::helpers::simple::SimpleCount;
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
    fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, Array<Character>) {
        // [Compute] Setup recursion
        let mut characters: Array<Character> = ArrayTrait::new();
        let mut visited: Felt252Dict<bool> = Default::default();
        // [Compute] Recursively count the points
        let mut score = 1;
        ForestCount::iter(game, tile, at, ref score, ref visited, ref characters, ref store);
        score = if 0 == score.into() {
            0
        } else {
            score - 1
        };
        (score, characters)
    }

    fn iter(
        game: Game,
        tile: Tile,
        at: Spot,
        ref score: u32,
        ref visited: Felt252Dict<bool>,
        ref characters: Array<Character>,
        ref store: Store
    ) {
        // [Check] The tile area is already visited, then pass
        let area: Area = tile.area(at);
        let visited_key = tile.get_key(area);
        if visited.get(visited_key) {
            return;
        };
        visited.insert(visited_key, true);

        // [Check] The tile handles a character
        let spot: Spot = tile.occupied_spot.into();
        if 0 != spot.into() && tile.are_connected(at, spot) {
            let character_position: CharacterPosition = store
                .character_position(game, tile, spot.into());
            let character = store
                .character(game, character_position.builder_id, character_position.index.into());
            characters.append(character);
        };

        // [Compute] Process adjacent roads if not already visited
        let mut north_oriented_spots: Array<Spot> = tile.north_oriented_adjacent_roads(at);
        loop {
            match north_oriented_spots.pop_front() {
                Option::Some(north_oriented_spot) => {
                    let spot = north_oriented_spot.rotate(tile.orientation.into());
                    let area: Area = tile.area(spot);
                    let key = tile.get_key(area);

                    // [Check] If the area is not visited, then count it
                    if !visited.get(key) {
                        let mut road_score = 0;
                        SimpleCount::iter(game, tile, spot, ref road_score, ref visited, ref store);
                        if road_score > 0 {
                            score += 1;
                        };
                    };
                },
                Option::None => { break; },
            };
        };

        // [Compute] Process next tiles if exist
        let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
        loop {
            match north_oriented_moves.pop_front() {
                // [Compute] Process the current move
                Option::Some(north_oriented_move) => {
                    let mut move = north_oriented_move.rotate(tile.orientation.into());

                    // [Check] A tile exists at this position, otherwise the structure is not finished
                    let (x, y) = tile.proxy_coordinates(move.direction);
                    let tile_position: TilePosition = store.tile_position(game, x, y);
                    if tile_position.is_zero() {
                        score = 0;
                        break;
                    }

                    // [Check] If the points are zero, the structure is not finished
                    let neighbor = store.tile(game, tile_position.tile_id);
                    ForestCount::iter(
                        game, neighbor, move.spot, ref score, ref visited, ref characters, ref store
                    );
                    if 0 == score.into() {
                        break;
                    };
                },
                // [Check] Otherwise returns the points
                Option::None => { break; },
            }
        }
    }
}
