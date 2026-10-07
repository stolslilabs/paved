// Core imports

// Internal imports

use paved::events::{Event, Scored};
use paved::helpers::multiplier::compute_multiplier;
use paved::helpers::simple::SimpleCount;
use paved::models::builder::BuilderImpl;
use paved::models::character::Char;
use paved::models::game::{Game, GameImpl};
use paved::models::tile::{Tile, TileImpl, TilePosition, ZeroableTilePosition};
use paved::store::{Store, StoreImpl};
use paved::types::area::Area;
use paved::types::category::Category;
use paved::types::move::{Move, MoveImpl};
use paved::types::role::Role;
use paved::types::spot::{Spot, SpotImpl};

/// Forest scoring (2024 rules, restored from `b0f837e^`).
///
/// A forest is scored when it is closed, and it is closed when
/// - every tile around it exists (as for any structure), and
/// - every road adjacent to it is closed (an open adjacent road keeps the forest open).
///
/// The Woodsman scores the number of distinct closed roads adjacent to the forest, the Herdsman the
/// number of distinct closed cities adjacent to it; an open adjacent city is not counted and does
/// not keep the forest open. The size of the forest only enters the points through the bonus curve.
#[generate_trait]
pub impl ForestCount of ForestCountTrait {
    #[inline]
    fn start(
        game: Game, tile: Tile, at: Spot, ref store: Store,
    ) -> (u32, u32, u32, Array<Char>, Array<Char>) {
        // [Compute] Setup recursion
        let mut woodsmen: Array<Char> = ArrayTrait::new();
        let mut herdsmen: Array<Char> = ArrayTrait::new();
        let mut visited: Felt252Dict<bool> = Default::default();
        // [Compute] Recursively count the points
        // [Info] Scores start at 1 so that a stop on an open road does not read as a zero score
        let mut count = 0;
        let mut woodsman_score = 1;
        let mut herdsman_score = 1;
        Self::iter(
            game,
            tile,
            at,
            ref count,
            ref woodsman_score,
            ref herdsman_score,
            ref woodsmen,
            ref herdsmen,
            ref visited,
            ref store,
        );
        woodsman_score -= 1;
        herdsman_score -= 1;
        (count, woodsman_score, herdsman_score, woodsmen, herdsmen)
    }

    fn iter(
        game: Game,
        tile: Tile,
        at: Spot,
        ref count: u32,
        ref woodsman_score: u32,
        ref herdsman_score: u32,
        ref woodsmen: Array<Char>,
        ref herdsmen: Array<Char>,
        ref visited: Felt252Dict<bool>,
        ref store: Store,
    ) {
        // [Check] The tile area is already visited, then pass
        let area: Area = tile.area(at);
        let visited_key = tile.get_key(area);
        if visited.get(visited_key) {
            return;
        }
        visited.insert(visited_key, true);
        count += 1;

        // [Check] The tile handles a character
        let spot: Spot = tile.occupied_spot.into();
        if 0_u8 != spot.into() && tile.are_connected(at, spot) {
            let character = store.character_at(game, tile, spot.into());
            let woodsman: u8 = Role::Woodsman.into();
            let herdsman: u8 = Role::Herdsman.into();
            if character.index == woodsman {
                woodsmen.append(character);
            } else if character.index == herdsman {
                herdsmen.append(character);
            }
        }

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
                        }
                        woodsman_score += 1;
                    }
                },
                Option::None => { break false; },
            };
        };
        // [Check] If stop criteria is met, then stop the recursion
        if stop {
            return;
        }

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
                        // [Check] Only a closed city is counted
                        if city_score > 0 {
                            herdsman_score += 1;
                        }
                    }
                },
                Option::None => { break; },
            };
        }

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
                    Self::iter(
                        game,
                        neighbor,
                        move.spot,
                        ref count,
                        ref woodsman_score,
                        ref herdsman_score,
                        ref woodsmen,
                        ref herdsmen,
                        ref visited,
                        ref store,
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
        count: u32,
        score: u32,
        base_points: u32,
        ref characters: Array<Char>,
        ref store: Store,
    ) {
        // [Compute] The points of the forest are shared between its characters of the role
        let (num, den) = compute_multiplier(count);
        let length = characters.len();
        loop {
            match characters.pop_front() {
                Option::Some(mut character) => {
                    // [Effect] Collect the character's builder
                    let mut tile = store.tile(game, character.tile_id);
                    let mut builder = store.builder(game, character.player_id);
                    let points = score * base_points * num / den / length;
                    builder.recover(ref character, ref tile);
                    game.add_score(points);

                    // [Event] Forest scored
                    store
                        .emit(
                            Event::Scored(
                                Scored {
                                    game_id: game.id,
                                    player_id: character.player_id,
                                    category: Category::Forest.into(),
                                    size: count,
                                    points,
                                },
                            ),
                        );

                    // [Effect] Update the character
                    store.set_character(character);

                    // [Effect] Update the tile
                    store.set_tile(tile);

                    // [Effect] Update the builder
                    store.set_builder(builder);
                },
                Option::None => { break; },
            };
        }
    }
}
