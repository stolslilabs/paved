// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::constants;
use stolsli::store::{Store, StoreImpl};
use stolsli::events::Scored;
use stolsli::helpers::simple::SimpleCount;
use stolsli::types::spot::{Spot, SpotImpl};
use stolsli::types::area::Area;
use stolsli::types::plan::Plan;
use stolsli::types::role::Role;
use stolsli::types::direction::Direction;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::game::{Game, GameImpl};
use stolsli::models::builder::{Builder, BuilderImpl};
use stolsli::models::character::{Character, CharacterPosition};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};

#[generate_trait]
impl ForestCount of ForestCountTrait {
    #[inline(always)]
    fn start(
        game: Game, tile: Tile, at: Spot, ref store: Store
    ) -> (u32, u32, u32, Array<Character>, Array<Character>) {
        // [Compute] Setup recursion
        let mut woodsmen: Array<Character> = ArrayTrait::new();
        let mut herdsmen: Array<Character> = ArrayTrait::new();
        let mut visited: Felt252Dict<bool> = Default::default();
        // [Compute] Recursively count the points
        let mut count = 0;
        let mut woodsman_score = 1;
        let mut herdsman_score = 1;
        ForestCount::iter(
            game,
            tile,
            at,
            ref count,
            ref woodsman_score,
            ref herdsman_score,
            ref woodsmen,
            ref herdsmen,
            ref visited,
            ref store
        );
        if 0 != woodsman_score.into() {
            woodsman_score -= 1;
        };
        if 0 != herdsman_score.into() {
            herdsman_score -= 1;
        };
        (count, woodsman_score, herdsman_score, woodsmen, herdsmen)
    }

    fn iter(
        game: Game,
        tile: Tile,
        at: Spot,
        ref count: u32,
        ref woodsman_score: u32,
        ref herdsman_score: u32,
        ref woodsmen: Array<Character>,
        ref herdsmen: Array<Character>,
        ref visited: Felt252Dict<bool>,
        ref store: Store
    ) {
        // [Check] The tile area is already visited, then pass
        let area: Area = tile.area(at);
        let visited_key = tile.get_key(area);
        if visited.get(visited_key) {
            return;
        };
        count += 1;
        visited.insert(visited_key, true);

        // [Check] The tile handles a character
        let spot: Spot = tile.occupied_spot.into();
        if 0 != spot.into() && tile.are_connected(at, spot) {
            let character_position: CharacterPosition = store
                .character_position(game, tile, spot.into());
            let character = store
                .character(game, character_position.player_id, character_position.index.into());
            if character.index == Role::Woodsman.into() {
                woodsmen.append(character);
            } else if character.index == Role::Herdsman.into() {
                herdsmen.append(character);
            };
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
                            woodsman_score += 1;
                        };
                    };
                },
                Option::None => { break; },
            };
        };

        // [Compute] Process adjacent cities if not already visited
        let mut north_oriented_spots: Array<Spot> = tile.north_oriented_adjacent_cities(at);
        loop {
            match north_oriented_spots.pop_front() {
                Option::Some(north_oriented_spot) => {
                    let spot = north_oriented_spot.rotate(tile.orientation.into());
                    let area: Area = tile.area(spot);
                    let key = tile.get_key(area);

                    // [Check] If the area is not visited, then count it
                    if !visited.get(key) {
                        let mut city_score = 0;
                        SimpleCount::iter(game, tile, spot, ref city_score, ref visited, ref store);
                        if city_score > 0 {
                            herdsman_score += 1;
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
                        count = 0;
                        break;
                    }

                    // [Check] If the points are zero, the structure is not finished
                    let neighbor = store.tile(game, tile_position.tile_id);
                    ForestCount::iter(
                        game,
                        neighbor,
                        move.spot,
                        ref count,
                        ref woodsman_score,
                        ref herdsman_score,
                        ref woodsmen,
                        ref herdsmen,
                        ref visited,
                        ref store
                    );
                    if 0 == count.into() {
                        break;
                    };
                },
                // [Check] Otherwise returns the points
                Option::None => { break; },
            }
        }
    }

    fn solve(
        ref game: Game,
        score: u32,
        base_points: u32,
        ref characters: Array<Character>,
        ref events: Array<Scored>,
        ref store: Store
    ) {
        // [Compute] Find the winner
        let length = characters.len();
        loop {
            match characters.pop_front() {
                Option::Some(mut character) => {
                    // [Effect] Collect the character's builder
                    let mut tile = store.tile(game, character.tile_id);
                    let mut player = store.player(character.player_id);
                    let mut builder = store.builder(game, player.id);
                    let mut team = store.team(game, builder.order.into());
                    builder.recover(ref character, ref tile);
                    game
                        .add_score(
                            ref builder,
                            ref team,
                            ref player,
                            score * base_points / length,
                            ref events
                        );

                    // [Effect] Update the character
                    store.set_character(character);

                    // [Effect] Update the tile
                    store.set_tile(tile);

                    // [Effect] Update the builder
                    store.set_builder(builder);

                    // [Effect] Update the player
                    store.set_player(player);

                    // [Effect] Update the team
                    store.set_team(team);
                },
                Option::None => { break; },
            };
        };
    }
}
