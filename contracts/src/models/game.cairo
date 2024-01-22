// Core imports

use debug::PrintTrait;
use dict::{Felt252Dict, Felt252DictTrait};

// External imports

use origami::random::deck::{Deck, DeckTrait};

// Internal imports

use stolsli::constants;
use stolsli::store::{Store, StoreImpl};
use stolsli::helpers::Helpers;
use stolsli::types::plan::Plan;
use stolsli::types::spot::Spot;
use stolsli::types::area::Area;
use stolsli::types::category::Category;
use stolsli::types::layout::{Layout, LayoutImpl};
use stolsli::types::direction::{Direction, DirectionImpl};
use stolsli::types::orientation::Orientation;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::character::{Character, CharacterImpl, AssertImpl as CharacterAssertImpl};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};

mod errors {
    const INVALID_INDEX: felt252 = 'Game: Invalid index';
    const INVALID_CHARACTER: felt252 = 'Game: Invalid character';
    const INVALID_STRUCTURE: felt252 = 'Game: Invalid structure';
}

#[derive(Model, Copy, Drop, Serde)]
struct Game {
    #[key]
    id: u32,
    tiles: u128,
    tile_count: u32,
}

#[generate_trait]
impl GameImpl of GameTrait {
    #[inline(always)]
    fn new(id: u32) -> Game {
        Game { id, tiles: 0, tile_count: 0, }
    }

    #[inline(always)]
    fn exists(self: Game) -> bool {
        0 != self.tile_count.into()
    }

    #[inline(always)]
    fn add_tile(ref self: Game) -> u32 {
        self.tile_count += 1;
        self.tile_count
    }

    #[inline(always)]
    fn draw_plan(ref self: Game, seed: felt252) -> (u32, Plan) {
        let number: u32 = constants::TOTAL_TILE_COUNT.into();
        let mut deck: Deck = DeckTrait::from_bitmap(seed, number, self.tiles);
        let plan_id: u32 = deck.draw().into();
        self.tile_count += 1;
        // Update bitmap if deck is not empty, otherwise reset
        self
            .tiles =
                if deck.remaining == 0 {
                    0
                } else {
                    let index = plan_id - 1;
                    Helpers::set_bit_at(self.tiles, index.into(), true)
                };
        (self.tile_count, plan_id.into())
    }

    #[inline(always)]
    fn count(self: Game, tile: Tile, character: Character, ref store: Store) -> u32 {
        // [Check] The character is placed on the tile
        character.assert_placed();
        assert(tile.id == character.tile_id, errors::INVALID_CHARACTER);
        // [Compute] Setup recursion
        let mut visited_tiles: Felt252Dict<bool> = Default::default();
        visited_tiles.insert(tile.id.into(), true);
        let mut visited_areas: Felt252Dict<bool> = Default::default();
        let at: Spot = character.spot.into();
        let area: Area = tile.area(at);
        let area_key = tile.get_key(area);
        visited_areas.insert(area_key, true);
        let mut north_oriented_moves: Array<Move> = tile.north_oriented_moves(at);
        // [Compute] Recursively count the points
        let score = self
            .count_loop(
                tile, 1, ref north_oriented_moves, ref visited_tiles, ref visited_areas, ref store
            );
        // [Check] The structure is finished
        assert(score > 0, errors::INVALID_STRUCTURE);
        score
    }
}

#[generate_trait]
impl InternalImpl of InternalTrait {
    fn count_loop(
        self: Game,
        tile: Tile,
        mut points: u32,
        ref north_oriented_moves: Array<Move>,
        ref visited_tiles: Felt252Dict<bool>,
        ref visited_areas: Felt252Dict<bool>,
        ref store: Store
    ) -> u32 {
        loop {
            match north_oriented_moves.pop_front() {
                // [Compute] Process the current move
                Option::Some(north_oriented_move) => {
                    let move = north_oriented_move.rotate(tile.orientation.into());
                    points = self
                        .count_iter(
                            tile, move, points, ref visited_tiles, ref visited_areas, ref store
                        );
                    // [Check] If the points are zero, the structure is not finished
                    if 0 == points.into() {
                        break 0;
                    };
                },
                // [Check] Otherwise returns the points
                Option::None => { break points; },
            }
        }
    }

    fn count_iter(
        self: Game,
        tile: Tile,
        move: Move,
        points: u32,
        ref visited_tiles: Felt252Dict<bool>,
        ref visited_areas: Felt252Dict<bool>,
        ref store: Store
    ) -> u32 {
        // [Check] A tile exists at this position, otherwise the structure is not finished
        let (x, y) = tile.proxy_coordinates(move.direction);
        let tile_position: TilePosition = store.tile_position(self, x, y);
        if tile_position.is_zero() {
            return 0;
        }
        let neighbor = store.tile(self, tile_position.tile_id);

        // [Check] The neighbor area is already visited, then stop local recursion
        let area: Area = neighbor.area(move.spot);
        let visited_key = neighbor.get_key(area);
        let is_visited: bool = visited_areas.get(visited_key);
        if (is_visited) {
            return points;
        };
        // Otherwise add it as visited and process it
        visited_areas.insert(visited_key, true);

        // [Check] The neighbor tile is already visited, then do not count it
        let visited_key: felt252 = neighbor.id.into();
        let add = if visited_tiles.get(visited_key) {
            0
        } else {
            1
        };
        visited_tiles.insert(visited_key, true);
        let mut north_oriented_moves: Array<Move> = neighbor.north_oriented_moves(move.spot);
        self
            .count_loop(
                neighbor,
                points + add,
                ref north_oriented_moves,
                ref visited_tiles,
                ref visited_areas,
                ref store
            )
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;
    use dict::{Felt252Dict, Felt252DictTrait};

    // Local imports

    use super::{Game, GameTrait, GameImpl, constants, Plan};

    // Constants

    const GAME_ID: u32 = 1;
    const SEED: felt252 = 'SEED';

    #[test]
    fn test_game_new() {
        let game = GameImpl::new(GAME_ID);
        assert(game.id == GAME_ID, 'Game: Invalid id');
        assert(game.tiles == 0, 'Game: Invalid tiles');
        assert(game.tile_count == 0, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_add_tile() {
        let mut game = GameImpl::new(GAME_ID);
        let tile_count = game.tile_count;
        let tile_id = game.add_tile();
        assert(tile_id == GAME_ID, 'Game: Invalid tile_id');
        assert(game.tile_count == tile_count + 1, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_draw_plan() {
        let mut game = GameImpl::new(GAME_ID);
        let (tile_count, plan_id) = game.draw_plan(SEED);
        assert(tile_count == 1, 'Game: Invalid tile_count');
        assert(plan_id.into() < constants::TOTAL_TILE_COUNT, 'Game: Invalid plan_id');
        assert(game.tile_count == 1, 'Game: Invalid tile_count');
        assert(game.tiles > 0, 'Game: Invalid tiles');
    }

    #[test]
    fn test_game_draw_planes() {
        let mut game = GameImpl::new(GAME_ID);
        let mut counts: Felt252Dict<u8> = Default::default();
        loop {
            if game.tile_count == constants::TOTAL_TILE_COUNT.into() {
                break;
            }
            let (_, plan) = game.draw_plan(SEED);
            let key: felt252 = plan.into();
            counts.insert(key, counts.get(key) + 1)
        };
        // [Assert] Each plan has been drawn the right amount of time
        assert(counts.get(Plan::None.into()) == 0, 'Game: None count');
        assert(counts.get(Plan::CCCCCCCCC.into()) == 0, 'Game: CCCCCCCCC count');
        assert(counts.get(Plan::CCCCCFFFC.into()) == 4, 'Game: CCCCCFFFC count');
        assert(counts.get(Plan::CCCCCFRFC.into()) == 3, 'Game: CCCCCFRFC count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 3, 'Game: CFFFCFFFC count');
        assert(counts.get(Plan::CFFFCFRFC.into()) == 0, 'Game: CFFFCFRFC count');
        assert(counts.get(Plan::FFCFFFCFC.into()) == 0, 'Game: FFCFFFCFC count');
        assert(counts.get(Plan::FFCFFFCFF.into()) == 3, 'Game: FFCFFFCFF count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 2, 'Game: FFCFFFFFC count');
        assert(counts.get(Plan::FFFFCCCFF.into()) == 5, 'Game: FFFFCCCFF count');
        assert(counts.get(Plan::FFFFFFCFF.into()) == 5, 'Game: FFFFFFCFF count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 4, 'Game: RFFFRFCFR count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 8, 'Game: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFCCCFR.into()) == 5, 'Game: RFRFCCCFR count');
        assert(counts.get(Plan::RFRFFFCFF.into()) == 0, 'Game: RFRFFFCFF count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 3, 'Game: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 9, 'Game: RFRFFFFFR count');
        assert(counts.get(Plan::RFRFRFCFF.into()) == 3, 'Game: RFRFRFCFF count');
        assert(counts.get(Plan::SFFFFFFFR.into()) == 0, 'Game: SFFFFFFFR count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 3, 'Game: SFRFRFCFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 4, 'Game: SFRFRFFFR count');
        assert(counts.get(Plan::SFRFRFRFR.into()) == 1, 'Game: SFRFRFRFR count');
        assert(counts.get(Plan::WCCCCCCCC.into()) == 1, 'Game: WCCCCCCCC count');
        assert(counts.get(Plan::WFFFFFFFF.into()) == 4, 'Game: WFFFFFFFF count');
        assert(counts.get(Plan::WFFFFFFFR.into()) == 2, 'Game: WFFFFFFFR count');
        // [Assert] Bitmap is empty
        assert(game.tiles == 0, 'Game: Invalid tiles');
    }
}
