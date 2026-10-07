//! Walk oracle (phase P5, PR P5-1).
//!
//! The recursive walks of `helpers/{generic,conflict,wonder,forest,simple}.cairo`, copied unchanged
//! into a test-only module: they define the scores the structure state of P5-4 must reproduce. The
//! runtime no longer uses `generic`, `conflict` and `wonder` (P5-4 removed them from `helpers/`);
//! this copy stays, and `check` compares the stored structures with the walks after every move of
//! the goldens, the gas scenarios and the e2e boards.
//!
//! The copies differ from the originals in two import paths only: `forest` and `simple` reach
//! `simple` and `generic` of this module instead of `paved::helpers`, so that the oracle does not
//! depend on the runtime walks it will outlive. The code is the same, `scarb fmt` aside (order of
//! the `use` lines, trailing commas).

pub mod generic {
    // Core imports

    // Internal imports

    use paved::constants;
    use paved::events::{Event, Scored};
    use paved::helpers::multiplier::compute_multiplier;
    use paved::models::builder::{Builder, BuilderImpl};
    use paved::models::character::Char;
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
                let character = store.character_at(game, tile, spot.into());
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
    use paved::models::character::{Char, ZeroableChar};
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
            let character = store.character_at(game, tile, spot.into());
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

        /// Walks the whole structure from `at` without stopping at an empty position: `count`
        /// nodes, `closed` false when any of them has a move towards an empty position. The forest
        /// walk of P5-5 (P-15) counts a city with it, so that a city that is open is all marked
        /// seen, not a part of it.
        fn explore(
            game: Game,
            tile: Tile,
            at: Spot,
            ref count: u32,
            ref closed: bool,
            ref visited: Felt252Dict<bool>,
            ref store: Store,
        ) {
            let area: Area = tile.area(at);
            let visited_key = tile.get_key(area);
            if visited.get(visited_key) {
                return;
            }
            visited.insert(visited_key, true);
            count += 1;
            let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
            loop {
                match north_oriented_moves.pop_front() {
                    Option::Some(north_oriented_move) => {
                        let mut move = north_oriented_move.rotate(tile.orientation.into());
                        let (x, y) = tile.proxy_coordinates(move.direction);
                        let tile_position: TilePosition = store.tile_position(game, x, y);
                        if tile_position.is_zero() {
                            closed = false;
                            continue;
                        }
                        let neighbor = store.tile(game, tile_position.tile_id);
                        Self::explore(
                            game,
                            neighbor,
                            move.spot,
                            ref count,
                            ref closed,
                            ref visited,
                            ref store,
                        );
                    },
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
    use paved::models::character::Char;
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
    ///
    /// P-15 (P5-5): the Herdsman counts a city only when it is closed as a whole, each city once.
    /// The 2024 walk could count an open city that the forest touched at two places; this oracle
    /// follows the corrected rule, as the structure state does.
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
                            // [Info] P-15: the whole city is walked, so that an open city is
                            // never counted, and none is counted twice (the 2024 walk stopped at
                            // the open edge and could find the rest of the city closed from
                            // another contact)
                            let mut nodes = 0;
                            let mut closed = true;
                            SimpleCount::explore(
                                game, tile, spot, ref nodes, ref closed, ref visited, ref store,
                            );
                            // [Check] Only a closed city is counted
                            if closed {
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

/// The differential check of P5-4: after a move, the structure state of a tile agrees with the
/// walks of this oracle on the board as it is.
///
/// For every node of the tile (every area with moves) and for the wonder of every neighbour:
/// - closed: the root has no open half-edge (`open == 0`) iff `GenericCount` finds the structure
///   finished (a count that is not 0);
/// - size: when closed, the root's `size` is the walk's count (a wonder is not compared: its walk
///   counts the 8 tiles around it, the record counts its one node);
/// - characters: the root's `chars` is not 0 iff `Conflict` meets a character on the structure, and
///   when closed it is exactly the roles that `GenericCount` collects.
pub mod check {
    use paved::models::game::Game;
    use paved::models::tile::{Tile, ZeroableTile};
    use paved::store::{Store, StoreImpl, StoreTrait};
    use paved::structure::forest::scan;
    use paved::structure::placement::{NeighborhoodTrait, role_bit};
    use paved::structure::record::{RecordTrait, ref_of};
    use paved::structure::state::{Structures, StructuresTrait};
    use paved::structure::tables;
    use paved::tests::setup::setup::TestStore;
    use paved::types::category::Category;
    use paved::types::spot::Spot;
    use snforge_std::interact_with_state;
    use super::conflict::Conflict;
    use super::forest::ForestCount;
    use super::generic::GenericCount;

    /// Runs the check on the tile `tile_id` of the game, in the contract of `store`.
    pub fn assert_tile_agrees(store: TestStore, game_id: u32, tile_id: u32) {
        interact_with_state(store.contract, || check_tile(game_id, tile_id));
    }

    /// Runs the check on every placed tile of the game (tile ids 1 to `tile_count`).
    pub fn assert_board_agrees(store: TestStore, game_id: u32) {
        interact_with_state(
            store.contract,
            || {
                let game = StoreImpl::new().game(game_id);
                let mut tile_id: u32 = 1;
                while tile_id <= game.tile_count {
                    check_tile(game_id, tile_id);
                    tile_id += 1;
                }
            },
        );
    }

    /// The check of one tile, from inside the contract: nothing for a tile that is not placed.
    pub fn check_tile(game_id: u32, tile_id: u32) {
        let (tile, refs) = StoreImpl::tile_with_refs(game_id, tile_id);
        if tile.orientation == 0 {
            return;
        }
        let mut structures = StructuresTrait::new(game_id);
        let mut area: u8 = 1;
        while area <= tables::AREA_COUNT {
            if tables::record_index(tile.plan, area) != tables::NO_RECORD {
                let sid = ref_of(refs, area);
                assert(sid != 0, 'Check: node without structure');
                check_node(ref structures, tile, area, sid);
            }
            area += 1;
        }
        // The wonders around the tile: a move closes their half-edges, never joins them
        let around = NeighborhoodTrait::read(game_id, tile.x, tile.y);
        let mut direction: u8 = 1;
        while direction <= 8 {
            let neighbor = around.tile(direction);
            let wonder = tables::wonder(neighbor.plan);
            if neighbor.is_non_zero() && wonder != 0 {
                let area = tables::area_at(neighbor.plan, wonder, neighbor.orientation);
                check_node(ref structures, neighbor, area, around.reference(direction, area));
            }
            direction += 1;
        }
    }

    fn check_node(ref structures: Structures, tile: Tile, area: u8, sid: u32) {
        let mut s = StoreImpl::new();
        let game = s.game(tile.game_id);
        let at: Spot = spot_of(tile, area).into();
        let (root, _) = structures.find(sid);
        let record = structures.unpacked(root);
        let category = tables::category(tile.plan, area);
        let is_wonder = category == Category::Wonder.into();

        let (count, characters) = GenericCount::start(game, tile, at, ref s);
        let closed = count != 0;
        if closed != record.is_closed() {
            println!(
                "Check: tile {} area {}: walk closed {}, open {}",
                tile.id,
                area,
                closed,
                record.open,
            );
        }
        assert(closed == record.is_closed(), 'Check: closed differs');
        if closed && !is_wonder {
            if count != record.size.into() {
                println!(
                    "Check: tile {} area {}: walk {}, size {}", tile.id, area, count, record.size,
                );
            }
            assert(count == record.size.into(), 'Check: size differs');
        }
        let met = Conflict::start(game, tile, at, ref s);
        if met != (record.chars != 0) {
            println!(
                "Check: tile {} area {}: walk met {}, chars {}", tile.id, area, met, record.chars,
            );
        }
        assert(met == (record.chars != 0), 'Check: characters differ');
        if closed && !is_wonder {
            let mut chars: u16 = 0;
            for character in characters {
                chars = chars | role_bit(character.index);
            }
            assert(chars == record.chars, 'Check: roles differ');
        }
        if closed && category == Category::Forest.into() {
            check_forest(ref structures, ref s, game, tile, area, at, record.size.into());
        }
    }

    /// A closed forest (no half-edge of its own towards an empty position): the scan of the
    /// structure state agrees with the walk, which also looks at the roads around it. The walk
    /// finds the forest finished (a count that is not 0) iff no adjacent road is open; then its
    /// size is the root's, its Woodsman score is the distinct closed roads and its Herdsman score
    /// the distinct closed cities (P-15: the walk of this oracle counts a city only when it is
    /// closed as a whole).
    fn check_forest(
        ref structures: Structures,
        ref s: Store,
        game: Game,
        tile: Tile,
        area: u8,
        at: Spot,
        size: u32,
    ) {
        let (_, refs) = StoreImpl::tile_with_refs(tile.game_id, tile.id);
        let (open_road, roads, cities) = scan(tile.game_id, tile, refs, area, ref structures);
        let (count, woodsman, herdsman, _, _) = ForestCount::start(game, tile, at, ref s);
        if (count != 0) == open_road {
            println!(
                "Check: tile {} forest {}: walk count {}, scan open road {}",
                tile.id,
                area,
                count,
                open_road,
            );
        }
        assert((count != 0) != open_road, 'Check: forest closed differs');
        if !open_road {
            assert(count == size, 'Check: forest size differs');
            if woodsman != roads || herdsman != cities {
                println!(
                    "Check: tile {} forest {}: walk {} roads {} cities, scan {} roads {} cities",
                    tile.id,
                    area,
                    woodsman,
                    herdsman,
                    roads,
                    cities,
                );
            }
            assert(woodsman == roads, 'Check: forest roads differ');
            assert(herdsman == cities, 'Check: forest cities differ');
        }
    }

    /// A spot of `area` of the placed tile (its own frame).
    fn spot_of(tile: Tile, area: u8) -> u8 {
        let mut spot: u8 = 1;
        while tables::area_at(tile.plan, spot, tile.orientation) != area {
            spot += 1;
        }
        spot
    }
}

#[cfg(test)]
pub mod tests {
    // Local imports

    use paved::models::index::{Char, Tile};
    use paved::models::tile::CENTER;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::structure::record::ref_of;
    use paved::structure::state::StructuresTrait;
    use paved::structure::{placement, tables};
    use paved::tests::setup::setup;
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use snforge_std::interact_with_state;
    use super::check;
    use super::conflict::Conflict as OracleConflict;
    use super::forest::ForestCount as OracleForestCount;
    use super::generic::GenericCount as OracleGenericCount;
    use super::simple::SimpleCount as OracleSimpleCount;

    /// Two road crossings `SFRFRFRFR` side by side, a Lord on the east road of the first one: the
    /// east road of the first tile and the west road of the second one are one closed road of two
    /// nodes. The walks answer on a closed structure and on open ones, and the structure state
    /// written for the two tiles agrees with them (`check`).
    #[test]
    fn test_oracle_walks_agree_with_the_structure_state() {
        let (store, _, context) = setup::spawn_game(Mode::Daily);
        let game_id = context.game_id;
        let player_id = context.player_id;
        interact_with_state(
            store.contract,
            || {
                let mut s = StoreImpl::new();
                let game = s.game(game_id);
                let mut first = Tile {
                    game_id,
                    id: 90,
                    plan: Plan::SFRFRFRFR.into(),
                    orientation: Orientation::North.into(),
                    x: CENTER + 10,
                    y: CENTER + 10,
                    occupied_spot: Spot::None.into(),
                };
                let second = Tile {
                    game_id,
                    id: 91,
                    plan: Plan::SFRFRFRFR.into(),
                    orientation: Orientation::North.into(),
                    x: CENTER + 11,
                    y: CENTER + 10,
                    occupied_spot: Spot::None.into(),
                };
                // Written without a build: `set_tile` places them on the structure state
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
                // The Lord joins its road through `occupy`, then stands on the tile (a tile written
                // alone holds no character)
                let (_, refs) = StoreImpl::tile_with_refs(game_id, first.id);
                let mut structures = StructuresTrait::new(game_id);
                placement::occupy(
                    ref structures, first, refs, Spot::East.into(), Role::Lord.into(),
                );
                structures.flush(s);
                first.occupied_spot = Spot::East.into();
                StoreImpl::write_tile(first, refs);

                // The closed road: 2 nodes, one character, the character is met.
                let (count, characters) = OracleGenericCount::start(game, first, Spot::East, ref s);
                assert_eq!(count, 2);
                assert_eq!(characters.len(), 1);
                assert_eq!(OracleSimpleCount::start(game, second, Spot::West, ref s), 2);
                assert!(OracleConflict::start(game, second, Spot::West, ref s));
                let road = tables::area_at(first.plan, Spot::East.into(), first.orientation);
                let mut structures = StructuresTrait::new(game_id);
                let (root, _) = structures.find(ref_of(refs, road));
                let record = structures.unpacked(root);
                assert_eq!(record.size, 2);
                assert_eq!(record.open, 0);
                assert_eq!(record.chars, placement::role_bit(Role::Lord.into()));

                // An open road (its north end looks at an empty position): not finished.
                let (count, _) = OracleGenericCount::start(game, first, Spot::North, ref s);
                assert_eq!(count, 0);
                assert!(!OracleConflict::start(game, second, Spot::North, ref s));

                // The forest in the north-west corner is bounded by open roads: not finished.
                let (count, woodsman, herdsman, woodsmen, herdsmen) = OracleForestCount::start(
                    game, first, Spot::NorthWest, ref s,
                );
                assert_eq!(count, 0);
                assert_eq!(woodsman, 0);
                assert_eq!(herdsman, 0);
                assert_eq!(woodsmen.len(), 0);
                assert_eq!(herdsmen.len(), 0);

                check::check_tile(game_id, first.id);
                check::check_tile(game_id, second.id);
            },
        );
    }
}
