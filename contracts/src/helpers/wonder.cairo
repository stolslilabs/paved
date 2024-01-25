// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::store::{Store, StoreImpl};
use stolsli::types::spot::Spot;
use stolsli::types::area::Area;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::game::Game;
use stolsli::models::character::{Character, CharacterPosition};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};

#[generate_trait]
impl WonderCount of WonderCountTrait {
    #[inline(always)]
    fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, Character) {
        // [Compute] Setup recursion
        let mut visited: Felt252Dict<bool> = Default::default();
        // [Check] Starting spot is occupied, otherwise no need to process further
        let spot: Spot = tile.occupied_spot.into();
        if spot != at {
            return (0, Zeroable::zero());
        };
        // [Compute] Extract the character
        let character_position: CharacterPosition = store
            .character_position(game, tile, spot.into());
        let character = store
            .character(game, character_position.builder_id, character_position.index.into());
        // [Compute] Recursively count the points
        let mut score = 0;
        WonderCount::iter(game, tile, at, ref score, ref visited, ref store);
        (score, character)
    }

    fn iter(
        game: Game,
        tile: Tile,
        at: Spot,
        ref score: u32,
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

        // [Check] The neighbor is already visited, then do not count it
        let visited_key: felt252 = tile.id.into();
        if !visited.get(visited_key) {
            score += 1;
        };
        visited.insert(visited_key, true);

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
                    WonderCount::iter(game, neighbor, move.spot, ref score, ref visited, ref store);
                    if 0 == score.into() {
                        break;
                    };
                },
                // [Check] Otherwise returns the points
                Option::None => { break; },
            }
        }
    }

    fn solve(self: Game, base_points: u32, ref character: Character, ref store: Store) {
        // [Effect] Update the builder
        let mut builder = store.builder(self, character.builder_id);
        let power: u32 = character.power.into();
        builder.score += base_points * power;
        store.set_builder(builder);
    }
}
