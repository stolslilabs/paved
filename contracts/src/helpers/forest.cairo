// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::constants;
use paved::store::{Store, StoreImpl};
use paved::events::ScoredForest;
use paved::helpers::simple::SimpleCount;
use paved::types::spot::{Spot, SpotImpl};
use paved::types::area::Area;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::direction::Direction;
use paved::types::move::{Move, MoveImpl};
use paved::types::category::Category;
use paved::models::game::{Game, GameImpl};
use paved::models::builder::{Builder, BuilderImpl};
use paved::models::character::{Character, CharacterPosition};
use paved::models::tile::{Tile, TilePosition, ZeroableTilePosition, TileImpl};
use paved::helpers::multiplier::compute_multiplier;

#[generate_trait]
impl ForestCount of ForestCountTrait {
    #[inline(always)]
    fn start(
        game: Game, tile: Tile, at: Spot, ref store: Store
    ) -> (u32, u32, u32, Array<Character>, Array<Character>) {
        // [Compute] Setup recursion
        let mut woodsmen: Array<Character> = ArrayTrait::new();
        let mut herdsmen: Array<Character> = ArrayTrait::new();
        let mut visited: Felt252Dict<bool> = core::Default::default();
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
        visited.insert(visited_key, true);
        count += 1;

        // [Check] The tile handles a character
        let spot: Spot = tile.occupied_spot.into();
        if 0_u8 != spot.into() && tile.are_connected(at, spot) {
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
        let stop = loop {
            match north_oriented_spots.pop_front() {
                Option::Some(north_oriented_spot) => {
                    let spot = north_oriented_spot.rotate(tile.orientation.into());
                    let area: Area = tile.area(spot);
                    let key = tile.get_key(area);

                    // [Check] If the area is not visited, then count it
                    if !visited.get(key) {
                        let mut road_score = 0;
                        SimpleCount::iter(game, tile, spot, ref road_score, ref visited, ref store);
                        // [Check] If an adjacent road is not closed, the forest cannot be closed
                        if road_score == 0 {
                            count = 0;
                            break true;
                        };
                        woodsman_score += 1;
                    };
                },
                Option::None => { break false; },
            };
        };
        // [Check] If stop criteria is met, then stop the recursion
        if stop {
            return;
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
        category: Category,
        count: u32,
        score: u32,
        base_points: u32,
        ref characters: Array<Character>,
        ref events: Array<ScoredForest>,
        ref store: Store
    ) {
        // [Compute] Find the winner
        let (num, den) = compute_multiplier(count);
        let length = characters.len();
        loop {
            match characters.pop_front() {
                Option::Some(mut character) => {
                    // [Effect] Collect the character's builder
                    let mut tile = store.tile(game, character.tile_id);
                    let mut player = store.player(character.player_id);
                    let mut builder = store.builder(game, player.id);
                    let points = score * base_points * num / den / length;
                    builder.recover(ref character, ref tile);
                    game.add_score(points);

                    // [Build] Events
                    let mut event = ScoredForest {
                        game_id: game.id,
                        points: points,
                        size: count,
                        cities: 0,
                        roads: 0,
                        player_id: player.id,
                        player_name: player.name,
                        player_master: player.master,
                    };
                    if category == Category::City {
                        event.cities = score;
                    };
                    if category == Category::Road {
                        event.roads = score;
                    };
                    events.append(event);

                    // [Effect] Update the character
                    store.set_character(character);

                    // [Effect] Update the tile
                    store.set_tile(tile);

                    // [Effect] Update the builder
                    store.set_builder(builder);

                    // [Effect] Update the player
                    store.set_player(player);
                },
                Option::None => { break; },
            };
        };
    }
}
