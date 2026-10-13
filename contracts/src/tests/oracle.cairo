//! Walk oracle (phase P5, PR P5-1; D-18b).
//!
//! The recursive walks of `helpers/{generic,wonder,forest,simple}.cairo`, kept in a test-only
//! module: they define the scores the structure state of P5-4 must reproduce. The runtime no longer
//! uses them; `check` compares the stored structures with the walks after every move of the
//! goldens, the gas scenarios and the e2e boards.
//!
//! D-18b rewrote them to the rules without characters (D-18, P-45): the walks no longer collect
//! characters (and `Conflict`, which only looked for one, is gone), and `score` gives the points of
//! a closed structure from the walks alone: a road or city `count x base x bonus(count)`, a wonder
//! `base`, a forest `(distinct closed roads + distinct closed cities) x base x bonus(count)`. The
//! expected scores of the goldens are derived from `score`, never from the structure state.
//!
//! The walks themselves are those of 2024: the same moves, the same short-circuit at an empty
//! position, P-15 for the cities around a forest.

pub mod generic {
    use paved::models::game::Game;
    use paved::models::tile::{Tile, TileImpl, TilePosition, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::spot::Spot;

    #[generate_trait]
    pub impl GenericCount of GenericCountTrait {
        /// The nodes of the road or city of `tile` at `at`: 0 when it is not finished (a node has
        /// a move towards an empty position).
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

pub mod wonder {
    use paved::models::game::Game;
    use paved::models::tile::{Tile, TileImpl, TilePosition, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::spot::Spot;

    #[generate_trait]
    pub impl WonderCount of WonderCountTrait {
        /// Not 0 when the 8 positions around the wonder of `tile` at `at` are taken.
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

    use paved::models::game::Game;
    use paved::models::tile::{Tile, TileImpl, TilePosition, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::spot::{Spot, SpotImpl};
    use super::simple::SimpleCount;

    /// Forest scoring (2024 rules, restored from `b0f837e^`).
    ///
    /// A forest is scored when it is closed, and it is closed when
    /// - every tile around it exists (as for any structure), and
    /// - every road adjacent to it is closed (an open adjacent road keeps the forest open).
    ///
    /// The walk counts the distinct closed roads adjacent to the forest (what the Woodsman scored)
    /// and the distinct closed cities adjacent to it (what the Herdsman scored); an open adjacent
    /// city is not counted and does not keep the forest open. D-18 (P-45): the forest scores both,
    /// with no character (`score::points_at`). The size of the forest only enters the points
    /// through the bonus curve.
    ///
    /// P-15 (P5-5): a city counts only when it is closed as a whole, each city once.
    /// The 2024 walk could count an open city that the forest touched at two places; this oracle
    /// follows the corrected rule, as the structure state does.
    #[generate_trait]
    pub impl ForestCount of ForestCountTrait {
        #[inline]
        /// `(count, roads, cities)`: `count` 0 when the forest is not finished.
        fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, u32, u32) {
            // [Compute] Setup recursion
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
                ref visited,
                ref store,
            );
            woodsman_score -= 1;
            herdsman_score -= 1;
            (count, woodsman_score, herdsman_score)
        }

        fn iter(
            game: Game,
            tile: Tile,
            at: Spot,
            ref count: u32,
            ref woodsman_score: u32,
            ref herdsman_score: u32,
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
    }
}


/// The walk that counts the half-edges of a structure that look at an empty position, and its
/// nodes (P5-7). Added to the oracle, not copied from `helpers/`: the walks above stop at the
/// first empty position, so none of them says how many are open. It follows the same moves as
/// `GenericCount`, without the short-circuit.
pub mod open_count {
    use paved::models::game::Game;
    use paved::models::tile::{Tile, TilePosition, TileTrait, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl};
    use paved::types::area::Area;
    use paved::types::move::{Move, MoveImpl};
    use paved::types::spot::Spot;

    #[generate_trait]
    pub impl OpenCount of OpenCountTrait {
        /// `(nodes, open)` of the structure of the area of `tile` at `at`.
        fn start(game: Game, tile: Tile, at: Spot, ref store: Store) -> (u32, u32) {
            let mut visited: Felt252Dict<bool> = Default::default();
            let mut nodes: u32 = 0;
            let mut open: u32 = 0;
            Self::iter(game, tile, at, ref nodes, ref open, ref visited, ref store);
            (nodes, open)
        }

        fn iter(
            game: Game,
            tile: Tile,
            at: Spot,
            ref nodes: u32,
            ref open: u32,
            ref visited: Felt252Dict<bool>,
            ref store: Store,
        ) {
            let area: Area = tile.area(at);
            let visited_key = tile.get_key(area);
            if visited.get(visited_key) {
                return;
            }
            visited.insert(visited_key, true);
            nodes += 1;

            let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
            while let Option::Some(north_oriented_move) = north_oriented_moves.pop_front() {
                let move = north_oriented_move.rotate(tile.orientation.into());
                let (x, y) = tile.proxy_coordinates(move.direction);
                let tile_position: TilePosition = store.tile_position(game, x, y);
                if tile_position.is_zero() {
                    open += 1;
                    continue;
                }
                let neighbor = store.tile(game, tile_position.tile_id);
                Self::iter(game, neighbor, move.spot, ref nodes, ref open, ref visited, ref store);
            }
        }
    }
}

/// The points of the rules of D-18 (P-45), from the walks alone: what the structure state must
/// score. A structure scores once, when it is finished: a road or a city `count x base x
/// bonus(count)`, a wonder `base` when its 8 neighbours are placed, a forest `(distinct closed
/// roads + distinct closed cities) x base x bonus(count)` once its edges and its roads are closed.
pub mod score {
    use core::dict::{Felt252Dict, Felt252DictTrait};
    use paved::helpers::multiplier::compute_multiplier;
    use paved::models::game::Game;
    use paved::models::tile::{Tile, TileImpl, TileIntoLayout, TilePosition, ZeroableTilePosition};
    use paved::store::{Store, StoreImpl, StoreTrait};
    use paved::types::category::{Category, CategoryImpl};
    use paved::types::layout::{Layout, LayoutImpl};
    use paved::types::spot::{Spot, SpotImpl};
    use super::forest::ForestCount;
    use super::generic::GenericCount;
    use super::simple::SimpleCount;
    use super::wonder::WonderCount;

    /// The category of the area of the placed `tile` at `at` (board frame), from its layout.
    pub fn category_at(tile: Tile, at: Spot) -> Category {
        let layout: Layout = tile.into();
        layout.get_category(at)
    }

    /// Whether the structure of `tile` at `at` is finished, and the points it is worth then (0
    /// otherwise).
    pub fn points_at(game: Game, tile: Tile, at: Spot, ref store: Store) -> (bool, u32) {
        let category = category_at(tile, at);
        match category {
            Category::Road |
            Category::City => {
                let count = GenericCount::start(game, tile, at, ref store);
                if count == 0 {
                    return (false, 0);
                }
                let (num, den) = compute_multiplier(count);
                (true, count * category.base_points() * num / den)
            },
            Category::Wonder => {
                let count = WonderCount::start(game, tile, at, ref store);
                if count == 0 {
                    return (false, 0);
                }
                (true, Category::Wonder.base_points())
            },
            Category::Forest => {
                let (count, roads, cities) = ForestCount::start(game, tile, at, ref store);
                if count == 0 {
                    return (false, 0);
                }
                let (num, den) = compute_multiplier(count);
                (true, (roads + cities) * Category::Forest.base_points() * num / den)
            },
            _ => (false, 0),
        }
    }

    /// Marks the nodes of the structure of `tile` at `at` in `seen` (a road, a city or a forest:
    /// its moves stay in its category). Returns false when its node was there already: the
    /// structure was met from another spot.
    fn first_visit(
        game: Game, tile: Tile, at: Spot, ref seen: Felt252Dict<bool>, ref store: Store,
    ) -> bool {
        if seen.get(tile.get_key(tile.area(at))) {
            return false;
        }
        let mut count = 0;
        let mut closed = true;
        SimpleCount::explore(game, tile, at, ref count, ref closed, ref seen, ref store);
        true
    }

    /// The points that the build of `tile_id` scores: the finished structures of its start
    /// spots, each once, then the finished wonders around it. A structure finished by a move
    /// holds the built tile (a structure that was finished before has no half-edge towards the
    /// position, so the tile does not join it) or is a wonder next to it; one that is not
    /// finished scores nothing. Returns the points and the number of structures that score.
    pub fn move_points(game_id: u32, tile_id: u32) -> (u32, u32) {
        let mut store = StoreImpl::new();
        let game = store.game(game_id);
        let tile = store.tile(game, tile_id);
        let mut seen: Felt252Dict<bool> = Default::default();
        let mut points: u32 = 0;
        let mut scored: u32 = 0;
        let mut starts = tile.north_oriented_starts();
        while let Option::Some(start) = starts.pop_front() {
            let at = start.rotate(tile.orientation.into());
            let category = category_at(tile, at);
            if category == Category::Wonder { // [Info] One wonder per tile: nothing to share with another spot
            } else if !first_visit(game, tile, at, ref seen, ref store) {
                continue;
            }
            let (closed, value) = points_at(game, tile, at, ref store);
            if closed {
                points += value;
                scored += 1;
            }
        }
        let mut dx: u32 = 0;
        while dx < 3 {
            let mut dy: u32 = 0;
            while dy < 3 {
                if dx != 1 || dy != 1 {
                    let (finished, value) = wonder_at(
                        game, tile.x + dx - 1, tile.y + dy - 1, ref store,
                    );
                    if finished {
                        points += value;
                        scored += 1;
                    }
                }
                dy += 1;
            }
            dx += 1;
        }
        (points, scored)
    }

    /// Whether the tile at `(x, y)` holds a finished wonder, and its points.
    fn wonder_at(game: Game, x: u32, y: u32, ref store: Store) -> (bool, u32) {
        let position: TilePosition = store.tile_position(game, x, y);
        if position.is_zero() {
            return (false, 0);
        }
        let neighbor = store.tile(game, position.tile_id);
        let wonder = neighbor.north_oriented_wonder();
        if wonder == Spot::None {
            return (false, 0);
        }
        points_at(game, neighbor, wonder.rotate(neighbor.orientation.into()), ref store)
    }

    /// The points of every finished structure of the board, each once: what a game has scored
    /// once every closed structure scored once (discards aside).
    pub fn board_points(game_id: u32) -> u32 {
        let mut store = StoreImpl::new();
        let game = store.game(game_id);
        let mut seen: Felt252Dict<bool> = Default::default();
        let mut points: u32 = 0;
        let mut tile_id: u32 = 1;
        while tile_id <= game.tile_count {
            let tile = store.tile(game, tile_id);
            tile_id += 1;
            if tile.orientation == 0 {
                continue;
            }
            let mut code: u8 = 1;
            while code <= 9 {
                let at: Spot = code.into();
                code += 1;
                let category = category_at(tile, at);
                let first = match category {
                    Category::Road | Category::City |
                    Category::Forest => first_visit(game, tile, at, ref seen, ref store),
                    Category::Wonder => {
                        let key = tile.get_key(tile.area(at));
                        let first = !seen.get(key);
                        seen.insert(key, true);
                        first
                    },
                    _ => false,
                };
                if first {
                    let (closed, value) = points_at(game, tile, at, ref store);
                    if closed {
                        points += value;
                    }
                }
            }
        }
        points
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
/// - a closed forest: the scan of the structure state finds the roads and cities the walk finds.
///
/// D-18b: and the move scored what `score` gives (`assert_move_scored`, "closed structure left
/// unscored", every category), and a finished game scored every finished structure of its board
/// (`assert_board_scored`).
pub mod check {
    use paved::models::game::Game;
    use paved::models::tile::{Tile, ZeroableTile};
    use paved::store::{Store, StoreImpl, StoreTrait};
    use paved::structure::forest::scan;
    use paved::structure::placement::NeighborhoodTrait;
    use paved::structure::record::{RecordTrait, ref_of};
    use paved::structure::state::{Structures, StructuresTrait};
    use paved::structure::tables;
    use paved::tests::setup::setup::{TestStore, TestStoreTrait};
    use paved::types::category::Category;
    use paved::types::spot::Spot;
    use snforge_std::interact_with_state;
    use super::forest::ForestCount;
    use super::generic::GenericCount;
    use super::open_count::OpenCount;
    use super::score;

    /// Runs the check on the tile `tile_id` of the game, in the contract of `store`.
    pub fn assert_tile_agrees(store: TestStore, game_id: u32, tile_id: u32) {
        interact_with_state(store.contract, || check_tile(game_id, tile_id));
    }

    /// `assert_tile_agrees` without the exact count of open half-edges (zero or not only): for the
    /// one board whose test has no gas left for the extra walk.
    pub fn assert_tile_agrees_lite(store: TestStore, game_id: u32, tile_id: u32) {
        interact_with_state(store.contract, || check_tile_with(game_id, tile_id, false));
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

    /// The points the oracle gives the build of `tile_id` (`score::move_points`) and the number of
    /// structures that score with it.
    pub fn move_points(store: TestStore, game_id: u32, tile_id: u32) -> (u32, u32) {
        interact_with_state(store.contract, || score::move_points(game_id, tile_id))
    }

    /// The points of every finished structure of the board (`score::board_points`).
    pub fn board_points(store: TestStore, game_id: u32) -> u32 {
        interact_with_state(store.contract, || score::board_points(game_id))
    }

    /// "Closed structure left unscored" (every category): the build of `tile_id` raised the score
    /// from `before` by exactly the points of the structures it finished, as the walks give them.
    /// Less: a closed structure was left unscored; more: one scored twice, or an open one scored.
    pub fn assert_move_scored(store: TestStore, game_id: u32, tile_id: u32, before: u32) {
        let (expected, _) = move_points(store, game_id, tile_id);
        let game = store.game(game_id);
        let gained = game.score - before;
        if gained != expected {
            println!("Check: tile {}: scored {}, the walks give {}", tile_id, gained, expected);
        }
        assert(gained >= expected, 'Check: closed left unscored');
        assert(gained <= expected, 'Check: scored beyond the walks');
    }

    /// Every finished structure of the board scored once: the walks' points of the whole board
    /// are the score plus what the discards took from it (`penalties`).
    pub fn assert_board_scored(store: TestStore, game_id: u32, penalties: u32) {
        let expected = board_points(store, game_id);
        let game = store.game(game_id);
        if game.score + penalties != expected {
            println!(
                "Check: board: score {} + penalties {}, the walks give {}",
                game.score,
                penalties,
                expected,
            );
        }
        assert(game.score + penalties == expected, 'Check: board points differ');
    }

    /// The check of one tile, from inside the contract: nothing for a tile that is not placed.
    pub fn check_tile(game_id: u32, tile_id: u32) {
        check_tile_with(game_id, tile_id, true);
    }

    fn check_tile_with(game_id: u32, tile_id: u32, exact: bool) {
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
                check_node(ref structures, tile, area, sid, exact);
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
                check_node(
                    ref structures, neighbor, area, around.reference(direction, area), exact,
                );
            }
            direction += 1;
        }
    }

    fn check_node(ref structures: Structures, tile: Tile, area: u8, sid: u32, exact: bool) {
        let mut s = StoreImpl::new();
        let game = s.game(tile.game_id);
        let at: Spot = spot_of(tile, area).into();
        let (root, _) = structures.find(sid);
        let record = structures.unpacked(root);
        let category = tables::category(tile.plan, area);
        let is_wonder = category == Category::Wonder.into();

        let count = GenericCount::start(game, tile, at, ref s);
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
        // The open half-edges, as an exact count (not only zero or not). The walk costs the size of
        // the structure on every node checked: the full-deck game, whose gas is at the cap of a
        // test already, runs the `lite` check and keeps the zero or not comparison above.
        if exact {
            let (nodes, open) = OpenCount::start(game, tile, at, ref s);
            if open != record.open.into() {
                println!(
                    "Check: tile {} area {}: walk open {}, record open {}",
                    tile.id,
                    area,
                    open,
                    record.open,
                );
            }
            assert(open == record.open.into(), 'Check: open differs');
            if !is_wonder {
                assert(nodes == record.size.into(), 'Check: nodes differ');
            }
        }
        if closed && !is_wonder {
            if count != record.size.into() {
                println!(
                    "Check: tile {} area {}: walk {}, size {}", tile.id, area, count, record.size,
                );
            }
            assert(count == record.size.into(), 'Check: size differs');
        }
        if closed && category == Category::Forest.into() {
            check_forest(ref structures, ref s, game, tile, area, at, record.size.into());
        }
    }

    /// A closed forest (no half-edge of its own towards an empty position): the scan of the
    /// structure state agrees with the walk, which also looks at the roads around it. The walk
    /// finds the forest finished (a count that is not 0) iff no adjacent road is open; then its
    /// size is the root's, and its distinct closed roads and cities are the scan's (P-15: the walk
    /// of this oracle counts a city only when it is closed as a whole).
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
        let (count, walk_roads, walk_cities) = ForestCount::start(game, tile, at, ref s);
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
            if walk_roads != roads || walk_cities != cities {
                println!(
                    "Check: tile {} forest {}: walk {} roads {} cities, scan {} roads {} cities",
                    tile.id,
                    area,
                    walk_roads,
                    walk_cities,
                    roads,
                    cities,
                );
            }
            assert(walk_roads == roads, 'Check: forest roads differ');
            assert(walk_cities == cities, 'Check: forest cities differ');
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

    use paved::models::index::Tile;
    use paved::models::tile::CENTER;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::structure::record::ref_of;
    use paved::structure::state::StructuresTrait;
    use paved::structure::tables;
    use paved::tests::setup::setup;
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use paved::types::spot::Spot;
    use snforge_std::interact_with_state;
    use super::forest::ForestCount as OracleForestCount;
    use super::generic::GenericCount as OracleGenericCount;
    use super::simple::SimpleCount as OracleSimpleCount;
    use super::{check, score};

    /// Two road crossings `SFRFRFRFR` side by side: the east road of the first tile and the west
    /// road of the second one are one closed road of two nodes. The walks answer on a closed
    /// structure and on open ones, `score` gives the closed road its points (2 x 100 x bonus(2) =
    /// 2 x 100 x 10475 / 10000 = 209), and the structure state written for the two tiles agrees
    /// with them (`check`).
    #[test]
    fn test_oracle_walks_agree_with_the_structure_state() {
        let (store, _, context) = setup::spawn_game(Mode::Daily);
        let game_id = context.game_id;
        interact_with_state(
            store.contract,
            || {
                let mut s = StoreImpl::new();
                let game = s.game(game_id);
                let first = Tile {
                    game_id,
                    id: 90,
                    plan: Plan::SFRFRFRFR.into(),
                    orientation: Orientation::North.into(),
                    x: CENTER + 10,
                    y: CENTER + 10,
                };
                let second = Tile {
                    game_id,
                    id: 91,
                    plan: Plan::SFRFRFRFR.into(),
                    orientation: Orientation::North.into(),
                    x: CENTER + 11,
                    y: CENTER + 10,
                };
                // Written without a build: `set_tile` places them on the structure state
                s.set_tile(first);
                s.set_tile(second);
                let (_, refs) = StoreImpl::tile_with_refs(game_id, first.id);

                // The closed road: 2 nodes, worth 209 points
                assert_eq!(OracleGenericCount::start(game, first, Spot::East, ref s), 2);
                assert_eq!(OracleSimpleCount::start(game, second, Spot::West, ref s), 2);
                assert_eq!(score::points_at(game, first, Spot::East, ref s), (true, 209));
                let road = tables::area_at(first.plan, Spot::East.into(), first.orientation);
                let mut structures = StructuresTrait::new(game_id);
                let (root, _) = structures.find(ref_of(refs, road));
                let record = structures.unpacked(root);
                assert_eq!(record.size, 2);
                assert_eq!(record.open, 0);

                // An open road (its north end looks at an empty position): not finished.
                assert_eq!(OracleGenericCount::start(game, first, Spot::North, ref s), 0);
                assert_eq!(score::points_at(game, first, Spot::North, ref s), (false, 0));

                // The forest in the north-west corner is bounded by open roads: not finished.
                let (count, roads, cities) = OracleForestCount::start(
                    game, first, Spot::NorthWest, ref s,
                );
                assert_eq!(count, 0);
                assert_eq!(roads, 0);
                assert_eq!(cities, 0);

                check::check_tile(game_id, first.id);
                check::check_tile(game_id, second.id);
            },
        );
    }
}
