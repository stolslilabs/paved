// Core imports

use debug::PrintTrait;

// External imports

use origami::random::deck::{Deck, DeckTrait};

// Internal imports

use stolsli::constants;
use stolsli::helpers::Helpers;
use stolsli::types::plan::Plan;

mod errors {
    const INVALID_INDEX: felt252 = 'Game: Invalid index';
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
        assert(counts.get(Plan::WFFFFFFFR.into()) == 2, 'Game: WFFFFFFFR count');
        assert(counts.get(Plan::WFFFFFFFF.into()) == 4, 'Game: WFFFFFFFF count');
        assert(counts.get(Plan::CCCCCCCCC.into()) == 1, 'Game: CCCCCCCCC count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 4, 'Game: RFFFRFCFR count');
        assert(counts.get(Plan::FFFFFFCFF.into()) == 5, 'Game: FFFFFFCFF count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 3, 'Game: CFFFCFFFC count');
        assert(counts.get(Plan::FFCFFFCFF.into()) == 3, 'Game: FFCFFFCFF count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 2, 'Game: FFCFFFFFC count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 3, 'Game: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFRFCFF.into()) == 3, 'Game: RFRFRFCFF count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 3, 'Game: SFRFRFCFR count');
        assert(counts.get(Plan::FFFFCCCFF.into()) == 5, 'Game: FFFFCCCFF count');
        assert(counts.get(Plan::RFRFCCCFR.into()) == 5, 'Game: RFRFCCCFR count');
        assert(counts.get(Plan::CCCCCFFFC.into()) == 4, 'Game: CCCCCFFFC count');
        assert(counts.get(Plan::CCCCCFRFC.into()) == 3, 'Game: CCCCCFRFC count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 8, 'Game: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 9, 'Game: RFRFFFFFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 4, 'Game: SFRFRFFFR count');
        assert(counts.get(Plan::SFRFRFRFR.into()) == 1, 'Game: SFRFRFRFR count');
        // [Assert] Bitmap is empty
        assert(game.tiles == 0, 'Game: Invalid tiles');
    }
}
