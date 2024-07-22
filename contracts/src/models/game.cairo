// Core imports

use core::debug::PrintTrait;
use core::dict::{Felt252Dict, Felt252DictTrait};
use core::poseidon::{PoseidonTrait, HashState};
use core::hash::HashStateTrait;

// External imports

use origami::random::deck::{Deck as OrigamiDeck, DeckTrait};

// Internal imports

use paved::constants;
use paved::store::{Store, StoreImpl};
use paved::helpers::bitmap::Bitmap;
use paved::helpers::generic::GenericCount;
use paved::helpers::wonder::WonderCount;
use paved::helpers::conflict::Conflict;
use paved::types::plan::Plan;
use paved::types::deck::{Deck, DeckImpl};
use paved::types::spot::{Spot, SpotImpl};
use paved::types::area::Area;
use paved::types::role::Role;
use paved::types::mode::{Mode, ModeTrait};
use paved::types::category::{Category, CategoryImpl};
use paved::types::layout::{Layout, LayoutImpl};
use paved::types::direction::{Direction, DirectionImpl};
use paved::types::orientation::{Orientation, IntoOrientationU8, IntoU8Orientation};
use paved::types::move::{Move, MoveImpl};
use paved::models::player::{Player, PlayerTrait};
use paved::models::builder::{Builder, BuilderTrait};
use paved::models::character::{Character, CharacterPosition, CharacterTrait, CharacterAssert};
use paved::models::tile::{Tile, TileTrait, TileIntoLayout};
use paved::models::index::Game;

mod errors {
    const INVALID_NAME: felt252 = 'Game: invalid name';
    const INVALID_HOST: felt252 = 'Game: invalid host';
    const INVALID_MODE: felt252 = 'Game: invalid mode';
    const INVALID_PRIZE: felt252 = 'Game: invalid prize';
    const INVALID_PLAYER_COUNT: felt252 = 'Game: invalid player count';
    const TRANSFER_SAME_HOST: felt252 = 'Game: transfer to same host';
    const GAME_NOT_EXISTS: felt252 = 'Game: does not exist';
    const GAME_ALREADY_STARTED: felt252 = 'Game: already started';
    const GAME_NOT_STARTED: felt252 = 'Game: not yet started';
    const STRUCTURE_NOT_IDLE: felt252 = 'Game: structure not idle';
    const GAME_IS_OVER: felt252 = 'Game: is over';
    const GAME_NOT_OVER: felt252 = 'Game: not over';
    const BUILDERS_NOT_READY: felt252 = 'Game: builders not ready';
}

#[generate_trait]
impl GameImpl of GameTrait {
    #[inline(always)]
    fn new(id: u32, time: u64, mode: Mode) -> Game {
        // [Check] Validate parameters
        let mode: Mode = mode.into();
        assert(Mode::None != mode, errors::INVALID_MODE);
        // [Effect] Create the game
        Game {
            id,
            over: false,
            discarded: 0,
            built: 0,
            tiles: 0,
            tile_count: 0,
            start_time: 0,
            end_time: 0,
            score: 0,
            seed: 0,
            mode: mode.into(),
            tournament_id: 0,
        }
    }

    #[inline(always)]
    fn price(self: Game) -> felt252 {
        let mode: Mode = self.mode.into();
        mode.price()
    }

    #[inline(always)]
    fn duration(self: Game) -> u64 {
        let mode: Mode = self.mode.into();
        mode.duration()
    }

    #[inline(always)]
    fn deck(self: Game) -> Deck {
        let mode: Mode = self.mode.into();
        mode.deck()
    }

    #[inline(always)]
    fn is_payable(self: Game) -> bool {
        true
    }

    #[inline(always)]
    fn nullify(ref self: Game) {
        // [Effect] Nullify the game
        self.over = false;
        self.tiles = 0;
        self.tile_count = 0;
        self.start_time = 0;
        self.score = 0;
        self.seed = 0;
    }

    #[inline(always)]
    fn start(ref self: Game, time: u64) -> Tile {
        // [Effect] Create the starter tile
        let tile_id = self.add_tile();
        let mut tile = TileTrait::new(self.id, tile_id, 0, Plan::RFFFRFCFR);
        tile.orientation = Orientation::South.into();

        // [Effect] Remove the starter tile from the deck
        let plan: Plan = tile.plan.into();
        let deck: Deck = self.deck();
        let mut indexes = deck.indexes(plan);
        let index = indexes.pop_front().unwrap();
        self.tiles = Bitmap::set_bit_at(self.tiles, index.into(), true);

        // [Effect] Update game start time and seed
        let mode: Mode = self.mode.into();
        self.seed = mode.seed(time, self.id, self.seed);
        self.tiles = deck.tiles(self.tiles, self.seed);
        self.start_time = time;

        tile
    }

    #[inline(always)]
    fn is_over(self: Game) -> bool {
        self.over
    }

    #[inline(always)]
    fn reseed(ref self: Game, tile: Tile) {
        let state: HashState = PoseidonTrait::new();
        let state = state.update(self.seed);
        let state = state.update(tile.x.into());
        let state = state.update(tile.y.into());
        self.seed = state.finalize();
    }

    #[inline(always)]
    fn assess_over(ref self: Game) {
        let deck: Deck = self.deck();
        self.over = self.tile_count >= deck.count().into();
    }

    #[inline(always)]
    fn surrender(ref self: Game) {
        // [Comment] Only available for solo mode
        self.over = true;
    }

    #[inline(always)]
    fn add_tile(ref self: Game) -> u32 {
        self.tile_count += 1;
        self.tile_count
    }

    #[inline(always)]
    fn add_score(ref self: Game, score: u32,) {
        self.score += score;
    }

    #[inline(always)]
    fn sub_score(ref self: Game, ref score: u32,) {
        // [Check] Update score
        if self.score < score {
            score = self.score;
        };
        self.score -= score;
    }

    #[inline(always)]
    fn draw_plan(ref self: Game) -> (u32, Plan) {
        let mode: Mode = self.mode.into();
        let (plan, tiles) = mode.draw(self.seed, self.tiles);
        self.tiles = tiles;
        self.tile_count += 1;
        // Update the seed after draw
        let state = PoseidonTrait::new();
        let state = state.update(self.seed);
        let state = state.update(self.tile_count.into());
        self.seed = state.finalize();
        (self.tile_count, plan)
    }

    fn assess(ref self: Game, tile: Tile, ref store: Store) {
        // [Compute] Setup recursion
        let layout: Layout = tile.into();
        let mut north_oriented_starts = tile.north_oriented_starts();
        loop {
            match north_oriented_starts.pop_front() {
                // [Compute] Process the current spot
                Option::Some(north_oriented_start) => {
                    // Update the tile according to previous assessments to avoid characters to be
                    // counted twice
                    let tile = store.tile(self, tile.id);
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
        };
    }

    #[inline(always)]
    fn assess_at(ref self: Game, tile: Tile, at: Spot, category: Category, ref store: Store) {
        // [Compute] Assess the spot
        let base = category.base_points();
        match category {
            Category::None => { return; },
            Category::Forest => { return; },
            Category::Road => {
                let (count, mut characters) = GenericCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect characters
                if 0 != count.into() && 0 != characters.len().into() {
                    GenericCount::solve(
                        ref self, Category::Road, count, base, ref characters, ref store
                    );
                }
            },
            Category::City => {
                let (count, mut characters) = GenericCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect characters
                if 0 != count.into() && 0 != characters.len().into() {
                    GenericCount::solve(
                        ref self, Category::City, count, base, ref characters, ref store
                    );
                }
            },
            Category::Wonder => {
                let (count, mut character) = WonderCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect the character
                if 0 != count.into() {
                    WonderCount::solve(ref self, base, ref character, ref store);
                }
            },
            _ => { return; },
        };
    }
}

impl ZeroableGame of core::Zeroable<Game> {
    #[inline(always)]
    fn zero() -> Game {
        Game {
            id: 0,
            over: false,
            discarded: 0,
            built: 0,
            tiles: 0,
            tile_count: 0,
            start_time: 0,
            end_time: 0,
            score: 0,
            seed: 0,
            mode: 0,
            tournament_id: 0
        }
    }

    #[inline(always)]
    fn is_zero(self: Game) -> bool {
        0 == self.tile_count.into()
    }

    #[inline(always)]
    fn is_non_zero(self: Game) -> bool {
        !self.is_zero()
    }
}

#[generate_trait]
impl GameAssert of AssertTrait {
    #[inline(always)]
    fn assert_exists(self: Game) {
        assert(self.is_non_zero(), errors::GAME_NOT_EXISTS);
    }

    #[inline(always)]
    fn assert_not_started(self: Game) {
        assert(0 == self.tile_count.into(), errors::GAME_ALREADY_STARTED);
    }

    #[inline(always)]
    fn assert_started(self: Game) {
        assert(0 != self.tile_count.into(), errors::GAME_NOT_STARTED);
    }

    #[inline(always)]
    fn assert_structure_idle(self: Game, tile: Tile, at: Spot, ref store: Store) {
        let status = Conflict::start(self, tile, at, ref store);
        assert(!status, errors::STRUCTURE_NOT_IDLE);
    }

    #[inline(always)]
    fn assert_not_over(self: Game) {
        assert(!self.is_over(), errors::GAME_IS_OVER);
    }

    #[inline(always)]
    fn assert_is_over(self: Game) {
        assert(self.is_over(), errors::GAME_NOT_OVER);
    }
}


#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;
    use core::dict::{Felt252Dict, Felt252DictTrait};

    // Local imports

    use super::{Game, GameTrait, GameImpl, constants, Plan, Deck, DeckImpl, Mode};

    // Constants

    const GAME_ID: u32 = 1;
    const NAME: felt252 = 'NAME';
    const MODE: Mode = Mode::Weekly;

    #[test]
    fn test_game_new() {
        let game = GameImpl::new(GAME_ID, 0, MODE);
        assert(game.id == GAME_ID, 'Game: Invalid id');
        assert(game.tiles == 0, 'Game: Invalid tiles');
        assert(game.tile_count == 0, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_add_tile() {
        let mut game = GameImpl::new(GAME_ID, 0, MODE);
        let tile_count = game.tile_count;
        let tile_id = game.add_tile();
        assert(tile_id == GAME_ID, 'Game: Invalid tile_id');
        assert(game.tile_count == tile_count + 1, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_draw_plan() {
        let mut game = GameImpl::new(GAME_ID, 0, MODE);
        let (tile_count, plan_id) = game.draw_plan();
        let deck: Deck = game.deck();
        assert(tile_count == 1, 'Game: Invalid tile_count');
        assert(plan_id.into() < deck.total_count(), 'Game: Invalid plan_id');
        assert(game.tile_count == 1, 'Game: Invalid tile_count');
        assert(game.tiles > 0, 'Game: Invalid tiles');
    }

    #[test]
    fn test_game_draw_planes() {
        let mut game = GameImpl::new(GAME_ID, 0, MODE);
        let mut counts: Felt252Dict<u8> = core::Default::default();
        let deck: Deck = game.deck();
        loop {
            if game.tile_count == deck.total_count().into() {
                break;
            }
            let (_, plan) = game.draw_plan();
            let key: felt252 = plan.into();
            counts.insert(key, counts.get(key) + 1)
        };
        // [Assert] Each plan has been drawn the right amount of time
        assert(counts.get(Plan::None.into()) == 0, 'Game: None count');
        assert(counts.get(Plan::CCCCCCCCC.into()) == 1, 'Game: CCCCCCCCC count');
        assert(counts.get(Plan::CCCCCFFFC.into()) == 4, 'Game: CCCCCFFFC count');
        assert(counts.get(Plan::CCCCCFRFC.into()) == 3, 'Game: CCCCCFRFC count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 3, 'Game: CFFFCFFFC count');
        assert(counts.get(Plan::FFCFFFCFF.into()) == 3, 'Game: FFCFFFCFF count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 2, 'Game: FFCFFFFFC count');
        assert(counts.get(Plan::FFFFCCCFF.into()) == 5, 'Game: FFFFCCCFF count');
        assert(counts.get(Plan::FFFFFFCFF.into()) == 5, 'Game: FFFFFFCFF count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 4, 'Game: RFFFRFCFR count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 8, 'Game: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFCCCFR.into()) == 5, 'Game: RFRFCCCFR count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 3, 'Game: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 9, 'Game: RFRFFFFFR count');
        assert(counts.get(Plan::RFRFRFCFF.into()) == 3, 'Game: RFRFRFCFF count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 3, 'Game: SFRFRFCFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 4, 'Game: SFRFRFFFR count');
        assert(counts.get(Plan::SFRFRFRFR.into()) == 1, 'Game: SFRFRFRFR count');
        assert(counts.get(Plan::WFFFFFFFF.into()) == 4, 'Game: WFFFFFFFF count');
        assert(counts.get(Plan::WFFFFFFFR.into()) == 2, 'Game: WFFFFFFFR count');

        // [Assert] Bitmap is empty
        assert(game.tiles == 0, 'Game: Invalid tiles');
    }
}
