//! Walk oracle (phase P5, PR P5-1).
//!
//! The recursive walks of `helpers/{generic,conflict,wonder,forest,simple}.cairo`, copied unchanged
//! into a test-only module: they define the scores the structure state of P5-4 must reproduce. When
//! the runtime stops using them, the originals leave `helpers/` and this copy stays, so that a
//! differential check can compare the stored structures with a walk after every move of the
//! goldens, the gas scenarios and the e2e boards.
//!
//! The copies differ from the originals in two import paths only: `forest` and `simple` reach
//! `simple` and `generic` of this module instead of `paved::helpers`, so that the oracle does not
//! depend on the runtime walks it will outlive. The code is the same, `scarb fmt` aside (order of the
//! `use` lines, trailing commas).

pub mod generic {
    // Core imports

    // Internal imports

    use paved::constants;
    use paved::events::{Event, Scored};
    use paved::helpers::multiplier::compute_multiplier;
    use paved::models::builder::{Builder, BuilderImpl};
    use paved::models::character::{Char, CharPosition};
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::{Tile, TileImpl, TilePosition, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::category::Category;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::spot::Spot;

    #[generate_trait]
    pub impl GenericCount of GenericCountTrait {
        #[inline]
        fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, Array<Char>) {
            // [Compute] Setup recursion
            let mut characters: Array<Char> = ArrayTrait::new();
            let mut visited: Felt252Dict<bool> = Default::default();
            // [Compute] Recursively count the points
            let mut count = 0;
            Self::iter(game, tile, at, ref count, ref visited, ref characters, ref store);
            (count, characters)
        }

        fn iter(
            game: Game,
            tile: Tile,
            at: Spot,
            ref count: u32,
            ref visited: Felt252Dict<bool>,
            ref characters: Array<Char>,
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
                let character_position: CharPosition = store
                    .character_position(game, tile, spot.into());
                let character = store
                    .character(game, character_position.player_id, character_position.index.into());
                characters.append(character);
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
                            ref visited,
                            ref characters,
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
            category: Category,
            count: u32,
            base_points: u32,
            ref characters: Array<Char>,
            ref store: Store,
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
                        let builder_weight = counter.get(character.player_id) + weight;
                        counter.insert(character.player_id, builder_weight);

                        // [Compute] Update builder power
                        let power: u32 = character.power.into();
                        let builder_power = powers.get(character.player_id);
                        if power > builder_power {
                            powers.insert(character.player_id, power);
                        }

                        // [Effect] Collect the character's builder
                        let mut tile = store.tile(game, character.tile_id);
                        let mut builder = store.builder(game, character.player_id);
                        builder.recover(ref character, ref tile);

                        // [Effect] Update the character
                        store.set_character(character);

                        // [Effect] Update the tile
                        store.set_tile(tile);

                        // [Effect] Update the builder
                        store.set_builder(builder);

                        // [Compute] Update winner if needed
                        if builder_weight > winner_weight {
                            winner = builder.player_id;
                            winner_weight = builder_weight;
                            solved = true;
                        } else if builder_weight == winner_weight {
                            solved = false;
                        };
                    },
                    Option::None => { break; },
                };
            }

            if solved {
                // [Compute] Update the scores if a winner is determined
                // [Info] The winner is a builder of the game, so no player read is needed.
                let mut builder = store.builder(game, winner);
                let power = powers.get(winner);
                let (num, den) = compute_multiplier(count);
                let points = count * base_points * power * num / den;

                game.add_score(points);

                // [Event] Structure scored
                store
                    .emit(
                        Event::Scored(
                            Scored {
                                game_id: game.id,
                                player_id: winner,
                                category: category.into(),
                                size: count,
                                points,
                            },
                        ),
                    );

                // [Effect] Update the builder
                store.set_builder(builder);
            };
        }
    }
}

pub mod conflict {
    // Core imports

    // Internal imports

    use paved::models::game::Game;
    use paved::models::tile::{Tile, TilePosition, TileTrait, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::plan::Plan;
    use paved::types::spot::Spot;

    #[generate_trait]
    pub impl Conflict of ConflictTrait {
        #[inline]
        fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> bool {
            // [Compute] Setup recursion
            let mut visited: Felt252Dict<bool> = Default::default();
            // [Compute] Recursively check characters
            let mut status = false;
            Self::iter(game, tile, at, ref status, ref visited, ref store);
            status
        }

        fn iter(
            game: Game,
            tile: Tile,
            at: Spot,
            ref status: bool,
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

            // [Check] The tile handles a character
            let spot: Spot = tile.occupied_spot.into();
            if 0_u8 != spot.into() && tile.are_connected(at, spot) {
                status = true;
                return;
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
                            continue;
                        }

                        // [Check] If a character has been met, then stop the recursion
                        let neighbor = store.tile(game, tile_position.tile_id);
                        Self::iter(game, neighbor, move.spot, ref status, ref visited, ref store);
                        if status {
                            break;
                        };
                    },
                    // [Check] Otherwise returns the points
                    Option::None => { break; },
                }
            }
        }
    }
}

pub mod wonder {
    // Core imports

    // Internal imports

    use paved::events::{Event, Scored};
    use paved::models::builder::{Builder, BuilderImpl};
    use paved::models::character::{Char, CharPosition, ZeroableChar};
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::{Tile, TileImpl, TilePosition, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::category::Category;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::spot::Spot;

    #[generate_trait]
    pub impl WonderCount of WonderCountTrait {
        #[inline]
        fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, Char) {
            // [Compute] Setup recursion
            let mut visited: Felt252Dict<bool> = Default::default();
            // [Check] Starting spot is occupied, otherwise no need to process further
            let spot: Spot = tile.occupied_spot.into();
            if spot != at {
                return (0, ZeroableChar::zero());
            }
            // [Compute] Extract the character
            let character_position: CharPosition = store
                .character_position(game, tile, spot.into());
            let character = store
                .character(game, character_position.player_id, character_position.index.into());
            // [Compute] Recursively count the points
            let mut count = 0;
            Self::iter(game, tile, at, ref count, ref visited, ref store);
            (count, character)
        }

        fn iter(
            game: Game,
            tile: Tile,
            at: Spot,
            ref count: u32,
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
                        Self::iter(game, neighbor, move.spot, ref count, ref visited, ref store);
                        if 0 == count.into() {
                            break;
                        };
                    },
                    // [Check] Otherwise returns the points
                    Option::None => { break; },
                }
            }
        }

        fn solve(ref game: Game, base_points: u32, ref character: Char, ref store: Store) {
            // [Effect] Collect the character's builder
            let mut tile = store.tile(game, character.tile_id);
            let mut builder = store.builder(game, character.player_id);
            let power: u32 = character.power.into();
            let points = base_points * power;
            game.add_score(points);

            // [Event] Wonder scored (a wonder has no size)
            store
                .emit(
                    Event::Scored(
                        Scored {
                            game_id: game.id,
                            player_id: character.player_id,
                            category: Category::Wonder.into(),
                            size: 0,
                            points,
                        },
                    ),
                );
            builder.recover(ref character, ref tile);

            // [Effect] Update the character
            store.set_character(character);

            // [Effect] Update the tile
            store.set_tile(tile);

            // [Effect] Update the builder
            store.set_builder(builder);
        }
    }
}

pub mod simple {
    // Core imports

    // Internal imports

    use paved::models::game::Game;
    use paved::models::tile::{Tile, TileImpl, TilePosition, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::spot::Spot;
    use super::generic::GenericCount;

    #[generate_trait]
    pub impl SimpleCount of SimpleCountTrait {
        #[inline]
        fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> u32 {
            // [Compute] Setup recursion
            let mut visited: Felt252Dict<bool> = Default::default();
            // [Compute] Recursively count the points
            let mut count = 0;
            Self::iter(game, tile, at, ref count, ref visited, ref store);
            count
        }

        fn iter(
            game: Game,
            tile: Tile,
            at: Spot,
            ref count: u32,
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
                        Self::iter(game, neighbor, move.spot, ref count, ref visited, ref store);
                        if 0 == count.into() {
                            break;
                        };
                    },
                    // [Check] Otherwise returns the points
                    Option::None => { break; },
                }
            }
        }
    }
}

pub mod forest {
    // Core imports

    // Internal imports

    use paved::events::{Event, Scored};
    use paved::helpers::multiplier::compute_multiplier;
    use paved::models::builder::BuilderImpl;
    use paved::models::character::{Char, CharPosition};
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::{Tile, TileImpl, TilePosition, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::category::Category;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::role::Role;
    use paved::types::spot::{Spot, SpotImpl};
    use super::simple::SimpleCount;

    /// Forest scoring (2024 rules, restored from `b0f837e^`).
    ///
    /// A forest is scored when it is closed, and it is closed when
    /// - every tile around it exists (as for any structure), and
    /// - every road adjacent to it is closed (an open adjacent road keeps the forest open).
    ///
    /// The Woodsman scores the number of distinct closed roads adjacent to the forest, the Herdsman
    /// the number of distinct closed cities adjacent to it; an open adjacent city is not counted
    /// and does not keep the forest open. The size of the forest only enters the points through the
    /// bonus curve.
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
                let character_position: CharPosition = store
                    .character_position(game, tile, spot.into());
                let character = store
                    .character(game, character_position.player_id, character_position.index.into());
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
                            SimpleCount::iter(
                                game, tile, spot, ref road_score, ref visited, ref store,
                            );
                            // [Check] If an adjacent road is not closed, the forest cannot be
                            // closed
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
                            SimpleCount::iter(
                                game, tile, spot, ref city_score, ref visited, ref store,
                            );
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
}

#[cfg(test)]
pub mod tests {
    // Local imports

    use paved::helpers::conflict::Conflict as RuntimeConflict;
    use paved::helpers::forest::ForestCount as RuntimeForestCount;
    use paved::helpers::generic::GenericCount as RuntimeGenericCount;
    use paved::helpers::simple::SimpleCount as RuntimeSimpleCount;
    use paved::models::index::{Char, Tile};
    use paved::models::tile::CENTER;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::tests::setup::setup;
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use snforge_std::interact_with_state;
    use super::conflict::Conflict as OracleConflict;
    use super::forest::ForestCount as OracleForestCount;
    use super::generic::GenericCount as OracleGenericCount;
    use super::simple::SimpleCount as OracleSimpleCount;

    /// Two road crossings `SFRFRFRFR` side by side, a Lord on the east road of the first one: the
    /// east road of the first tile and the west road of the second one are one closed road of two
    /// nodes. Each oracle walk answers as the walk of `helpers` does, on a closed structure and on
    /// open ones.
    #[test]
    fn test_oracle_walks_equal_the_runtime_walks() {
        let (store, _, context) = setup::spawn_game(Mode::Daily);
        let game_id = context.game_id;
        let player_id = context.player_id;
        interact_with_state(
            store.contract,
            || {
                let mut s = StoreImpl::new();
                let game = s.game(game_id);
                let first = Tile {
                    game_id,
                    id: 90,
                    player_id,
                    plan: Plan::SFRFRFRFR.into(),
                    orientation: Orientation::North.into(),
                    x: CENTER + 10,
                    y: CENTER + 10,
                    occupied_spot: Spot::East.into(),
                };
                let second = Tile {
                    game_id,
                    id: 91,
                    player_id,
                    plan: Plan::SFRFRFRFR.into(),
                    orientation: Orientation::North.into(),
                    x: CENTER + 11,
                    y: CENTER + 10,
                    occupied_spot: Spot::None.into(),
                };
                s.set_tile(first);
                s.set_tile(second);
                s
                    .set_character(
                        Char {
                            game_id,
                            player_id,
                            index: Role::Lord.into(),
                            tile_id: first.id,
                            spot: Spot::East.into(),
                            weight: 1,
                            power: 1,
                        },
                    );

                // The closed road: 2 nodes, one character, the character is met.
                let (count, characters) = RuntimeGenericCount::start(
                    game, first, Spot::East, ref s,
                );
                let (oracle_count, oracle_characters) = OracleGenericCount::start(
                    game, first, Spot::East, ref s,
                );
                assert_eq!(count, 2);
                assert_eq!(oracle_count, count);
                assert_eq!(characters.len(), 1);
                assert_eq!(oracle_characters.len(), characters.len());
                assert_eq!(
                    RuntimeSimpleCount::start(game, second, Spot::West, ref s),
                    OracleSimpleCount::start(game, second, Spot::West, ref s),
                );
                assert!(RuntimeConflict::start(game, second, Spot::West, ref s));
                assert!(OracleConflict::start(game, second, Spot::West, ref s));

                // An open road (its north end looks at an empty position): not finished.
                let (count, _) = RuntimeGenericCount::start(game, first, Spot::North, ref s);
                let (oracle_count, _) = OracleGenericCount::start(game, first, Spot::North, ref s);
                assert_eq!(count, 0);
                assert_eq!(oracle_count, count);
                assert!(!RuntimeConflict::start(game, second, Spot::North, ref s));
                assert!(!OracleConflict::start(game, second, Spot::North, ref s));

                // The forest in the north-west corner is bounded by open roads: not finished.
                let (count, woodsman, herdsman, woodsmen, herdsmen) = RuntimeForestCount::start(
                    game, first, Spot::NorthWest, ref s,
                );
                let (o_count, o_woodsman, o_herdsman, o_woodsmen, o_herdsmen) =
                    OracleForestCount::start(
                    game, first, Spot::NorthWest, ref s,
                );
                assert_eq!(count, 0);
                assert_eq!(o_count, count);
                assert_eq!(o_woodsman, woodsman);
                assert_eq!(o_herdsman, herdsman);
                assert_eq!(o_woodsmen.len(), woodsmen.len());
                assert_eq!(o_herdsmen.len(), herdsmen.len());
            },
        );
    }
}
