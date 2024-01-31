// Core imports

use debug::PrintTrait;
use dict::{Felt252Dict, Felt252DictTrait};

// External imports

use origami::random::deck::{Deck, DeckTrait};

// Internal imports

use stolsli::constants;
use stolsli::store::{Store, StoreImpl};
use stolsli::helpers::bitmap::Bitmap;
use stolsli::helpers::generic::GenericCount;
use stolsli::helpers::forest::ForestCount;
use stolsli::helpers::wonder::WonderCount;
use stolsli::helpers::conflict::Conflict;
use stolsli::types::plan::Plan;
use stolsli::types::spot::{Spot, SpotImpl};
use stolsli::types::area::Area;
use stolsli::types::role::Role;
use stolsli::types::category::{Category, CategoryImpl};
use stolsli::types::layout::{Layout, LayoutImpl};
use stolsli::types::direction::{Direction, DirectionImpl};
use stolsli::types::orientation::Orientation;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::builder::{Builder, BuilderImpl};
use stolsli::models::character::{
    Character, CharacterPosition, CharacterImpl, AssertImpl as CharacterAssertImpl
};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};

mod errors {
    const INVALID_INDEX: felt252 = 'Game: Invalid index';
    const INVALID_CHARACTER: felt252 = 'Game: Invalid character';
    const INVALID_STRUCTURE: felt252 = 'Game: Invalid structure';
    const INVALID_ENDTIME: felt252 = 'Game: Invalid endtime';
    const INVALID_POINTS_CAP: felt252 = 'Game: Invalid points cap';
    const INVALID_TILES_CAP: felt252 = 'Game: Invalid tiles cap';
    const INVALID_GAME: felt252 = 'Game: does not exist';
    const STRUCTURE_NOT_IDLE: felt252 = 'Game: Structure not idle';
    const GAME_IS_OVER: felt252 = 'Game: is over';
}

#[derive(Model, Copy, Drop, Serde)]
struct Game {
    #[key]
    id: u32,
    tiles: u128,
    tile_count: u32,
    endtime: u64,
    points_cap: u32,
    tiles_cap: u32,
    over: bool,
}

#[generate_trait]
impl GameImpl of GameTrait {
    #[inline(always)]
    fn new(id: u32, time: u64, endtime: u64, points_cap: u32, tiles_cap: u32) -> Game {
        // [Check] Validate parameters
        AssertImpl::assert_valid_endtime(time, endtime);
        Game { id, tiles: 0, tile_count: 0, endtime, points_cap, tiles_cap, over: false }
    }

    #[inline(always)]
    fn exists(self: Game) -> bool {
        0 != self.tile_count.into()
    }

    #[inline(always)]
    fn is_over(self: Game, time: u64) -> bool {
        let tile_condition = self.tiles_cap != 0 && self.tile_count >= self.tiles_cap.into();
        let time_condition = self.endtime != 0 && time >= self.endtime;
        self.over || tile_condition || time_condition
    }

    #[inline(always)]
    fn add_tile(ref self: Game) -> u32 {
        self.tile_count += 1;
        self.tile_count
    }

    #[inline(always)]
    fn add_score(ref self: Game, ref builder: Builder, score: u32) {
        builder.score += score;
        if self.points_cap != 0 && builder.score >= self.points_cap {
            self.over = true;
        }
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
                    Bitmap::set_bit_at(self.tiles, index.into(), true)
                };
        (self.tile_count, plan_id.into())
    }

    fn assess(ref self: Game, tile: Tile, ref store: Store) {
        // [Compute] Setup recursion
        let layout: Layout = tile.into();
        let mut north_oriented_starts = tile.north_oriented_starts();
        loop {
            match north_oriented_starts.pop_front() {
                // [Compute] Process the current spot
                Option::Some(north_oriented_start) => {
                    let start = north_oriented_start.rotate(tile.orientation.into());
                    let category: Category = layout.get_category(start);
                    self.assess_at(tile, start, category, ref store);
                },
                // [Check] Otherwise returns the characters
                Option::None => { break; },
            };
        };

        // [Compute] Assess wonders in the neighborhood
        let mut neighbors = store.neighborhood(self, tile.x, tile.y);
        loop {
            match neighbors.pop_front() {
                // [Compute] Process the current neighbor
                Option::Some(neighbor) => {
                    let start = neighbor.north_oriented_wonder();
                    // [Check] Skip if there is no wonder
                    if start != Spot::None {
                        self.assess_at(neighbor, start, Category::Wonder, ref store);
                    };
                },
                // [Check] Otherwise returns the characters
                Option::None => { break; },
            };
        }
    }

    #[inline(always)]
    fn assess_at(ref self: Game, tile: Tile, at: Spot, category: Category, ref store: Store) {
        // [Compute] Assess the spot
        let base = category.base_points();
        match category {
            Category::None => { return; },
            Category::Forest => {
                let (count, woodsman_score, herdsman_score, mut woodsmen, mut herdsmen) =
                    ForestCount::start(
                    self, tile, at, ref store
                );
                // [Effect] Solve and collect characters
                if 0 != count.into() && 0 != woodsmen.len().into() {
                    ForestCount::solve(ref self, woodsman_score, base, ref woodsmen, ref store);
                }
                if 0 != count.into() && 0 != herdsmen.len().into() {
                    ForestCount::solve(ref self, herdsman_score, base, ref herdsmen, ref store);
                }
            },
            Category::Road => {
                let (score, mut characters) = GenericCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect characters
                if 0 != score.into() && 0 != characters.len().into() {
                    GenericCount::solve(ref self, score, base, ref characters, ref store);
                }
            },
            Category::City => {
                let (score, mut characters) = GenericCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect characters
                if 0 != score.into() && 0 != characters.len().into() {
                    GenericCount::solve(ref self, score, base, ref characters, ref store);
                }
            },
            Category::Stop => { return; },
            Category::Wonder => {
                let (score, mut character) = WonderCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect the character
                if 0 != score.into() {
                    WonderCount::solve(ref self, base, ref character, ref store);
                }
            },
        };
    }
}

#[generate_trait]
impl AssertImpl of AssertTrait {
    #[inline(always)]
    fn assert_exists(self: Game) {
        assert(self.exists(), errors::INVALID_GAME);
    }

    #[inline(always)]
    fn assert_structure_idle(self: Game, tile: Tile, at: Spot, ref store: Store) {
        let status = Conflict::start(self, tile, at, ref store);
        assert(!status, errors::STRUCTURE_NOT_IDLE);
    }

    #[inline(always)]
    fn assert_not_over(self: Game, time: u64) {
        assert(!self.is_over(time), errors::GAME_IS_OVER);
    }

    #[inline(always)]
    fn assert_valid_endtime(time: u64, endtime: u64) {
        assert(endtime == 0 || endtime >= time, errors::INVALID_ENDTIME);
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
        let game = GameImpl::new(GAME_ID, 0, 0, 0, 0);
        assert(game.id == GAME_ID, 'Game: Invalid id');
        assert(game.tiles == 0, 'Game: Invalid tiles');
        assert(game.tile_count == 0, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_add_tile() {
        let mut game = GameImpl::new(GAME_ID, 0, 0, 0, 0);
        let tile_count = game.tile_count;
        let tile_id = game.add_tile();
        assert(tile_id == GAME_ID, 'Game: Invalid tile_id');
        assert(game.tile_count == tile_count + 1, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_draw_plan() {
        let mut game = GameImpl::new(GAME_ID, 0, 0, 0, 0);
        let (tile_count, plan_id) = game.draw_plan(SEED);
        assert(tile_count == 1, 'Game: Invalid tile_count');
        assert(plan_id.into() < constants::TOTAL_TILE_COUNT, 'Game: Invalid plan_id');
        assert(game.tile_count == 1, 'Game: Invalid tile_count');
        assert(game.tiles > 0, 'Game: Invalid tiles');
    }

    #[test]
    fn test_game_draw_planes() {
        let mut game = GameImpl::new(GAME_ID, 0, 0, 0, 0);
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
