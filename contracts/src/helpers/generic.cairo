// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::constants;
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
        GenericCount::iter(game, tile, at, ref score, ref visited, ref characters, ref store);
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

        // [Check] The tile is already visited, then do not count it
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
                    GenericCount::iter(
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

    fn solve(
        self: Game, score: u32, base_points: u32, ref characters: Array<Character>, ref store: Store
    ) {
        // [Compute] Find the winner
        let mut winner_weight: u32 = 0;
        let mut winner: felt252 = 0;
        let mut solved: bool = false;
        let mut counter: Felt252Dict<u32> = Default::default();
        let mut powers: Felt252Dict<u32> = Default::default();
        loop {
            match characters.pop_front() {
                Option::Some(mut character) => {
                    // [Compute] Update builder counter
                    let weight: u32 = character.weight.into();
                    let builder_weight = counter.get(character.builder_id) + weight;
                    counter.insert(character.builder_id, builder_weight);

                    // [Compute] Update builder power
                    let power: u32 = character.power.into();
                    let builder_power = powers.get(character.builder_id);
                    if power > builder_power {
                        powers.insert(character.builder_id, power);
                    };

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
                        if builder_weight > winner_weight {
                            winner = builder.id;
                            winner_weight = builder_weight;
                            solved = true;
                        } else if builder_weight == winner_weight {
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
            let power = powers.get(winner);
            builder.score += score * base_points * power;
            store.set_builder(builder);
        };
    }
}
