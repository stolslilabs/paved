// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::store::{Store, StoreImpl};
use stolsli::types::spot::Spot;
use stolsli::types::area::Area;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::game::Game;
use stolsli::models::builder::{Builder, BuilderImpl};
use stolsli::models::character::{Character, CharacterPosition};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};

#[generate_trait]
impl GenericCount of GenericCountTrait {
    #[inline(always)]
    fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, Array<Character>) {
        // [Compute] Setup recursion
        let mut characters: Array<Character> = ArrayTrait::new();
        let mut visited: Felt252Dict<bool> = Default::default();
        // [Compute] Recursively count the points
        let mut score = 0;
        GenericCount::over(game, tile, at, ref score, ref visited, ref characters, ref store);
        (score, characters)
    }

    fn over(
        game: Game,
        tile: Tile,
        at: Spot,
        ref score: u32,
        ref visited: Felt252Dict<bool>,
        ref characters: Array<Character>,
        ref store: Store
    ) {
        let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
        loop {
            match north_oriented_moves.pop_front() {
                // [Compute] Process the current move
                Option::Some(north_oriented_move) => {
                    let mut move = north_oriented_move.rotate(tile.orientation.into());
                    GenericCount::iter(
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

    fn iter(
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

        // [Check] The neighbor is already visited, then do not count it
        let visited_key: felt252 = neighbor.id.into();
        if !visited.get(visited_key) {
            score += 1;
        };
        visited.insert(visited_key, true);
        GenericCount::over(
            game, neighbor, move.spot, ref score, ref visited, ref characters, ref store
        )
    }

    fn solve(self: Game, score: u32, ref characters: Array<Character>, ref store: Store) {
        // [Compute] Find the winner
        let mut winner_count: u32 = 0;
        let mut winner: felt252 = 0;
        let mut solved: bool = false;
        let mut counter: Felt252Dict<u32> = Default::default();
        loop {
            match characters.pop_front() {
                Option::Some(mut character) => {
                    // [Compute] Update builder counter
                    let builder_count = counter.get(character.builder_id) + 1;
                    counter.insert(character.builder_id, builder_count);

                    // [Effect] Collect the character's builder
                    let mut tile = store.tile(self, character.tile_id);
                    let mut builder = store.builder(self, character.builder_id);
                    builder.recover(ref character, ref tile);

                    // [Effect] Update the character
                    store.set_character(character);

                    // [Effect] Update the tile
                    store.set_tile(tile);

                    // [Effect] Update the builder
                    store.set_builder(builder);

                    // [Compute] Update winner if needed
                    if builder.id != winner {
                        if builder_count > winner_count {
                            winner = builder.id;
                            winner_count = builder_count;
                            solved = true;
                        } else if builder_count == winner_count {
                            solved = false;
                        };
                    };
                },
                Option::None => { break; },
            };
        };

        // [Effect] Update the builder
        if solved {
            let mut builder = store.builder(self, winner);
            builder.score += score;
            store.set_builder(builder);
        };
    }
}
