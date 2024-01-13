// Core imports

use debug::PrintTrait;

// External imports

use origami::random::deck::{Deck, DeckTrait};

// Internal imports

use stolsli::constants;
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
                    PrivateImpl::up_bit_at_index(self.tiles, index.into())
                };
        (self.tile_count, plan_id.into())
    }
}

#[generate_trait]
impl PrivateImpl of PrivateTrait {
    #[inline(always)]
    fn up_bit_at_index(bitmap: u128, index: u128) -> u128 {
        assert(index < constants::TOTAL_TILE_COUNT.into(), errors::INVALID_INDEX);
        let mask = if index == 0 {
            constants::TWO_POW_0
        } else if index == 1 {
            constants::TWO_POW_1
        } else if index == 2 {
            constants::TWO_POW_2
        } else if index == 3 {
            constants::TWO_POW_3
        } else if index == 4 {
            constants::TWO_POW_4
        } else if index == 5 {
            constants::TWO_POW_5
        } else if index == 6 {
            constants::TWO_POW_6
        } else if index == 7 {
            constants::TWO_POW_7
        } else if index == 8 {
            constants::TWO_POW_8
        } else if index == 9 {
            constants::TWO_POW_9
        } else if index == 10 {
            constants::TWO_POW_10
        } else if index == 11 {
            constants::TWO_POW_11
        } else if index == 12 {
            constants::TWO_POW_12
        } else if index == 13 {
            constants::TWO_POW_13
        } else if index == 14 {
            constants::TWO_POW_14
        } else if index == 15 {
            constants::TWO_POW_15
        } else if index == 16 {
            constants::TWO_POW_16
        } else if index == 17 {
            constants::TWO_POW_17
        } else if index == 18 {
            constants::TWO_POW_18
        } else if index == 19 {
            constants::TWO_POW_19
        } else if index == 20 {
            constants::TWO_POW_20
        } else if index == 21 {
            constants::TWO_POW_21
        } else if index == 22 {
            constants::TWO_POW_22
        } else if index == 23 {
            constants::TWO_POW_23
        } else if index == 24 {
            constants::TWO_POW_24
        } else if index == 25 {
            constants::TWO_POW_25
        } else if index == 26 {
            constants::TWO_POW_26
        } else if index == 27 {
            constants::TWO_POW_27
        } else if index == 28 {
            constants::TWO_POW_28
        } else if index == 29 {
            constants::TWO_POW_29
        } else if index == 30 {
            constants::TWO_POW_30
        } else if index == 31 {
            constants::TWO_POW_31
        } else if index == 32 {
            constants::TWO_POW_32
        } else if index == 33 {
            constants::TWO_POW_33
        } else if index == 34 {
            constants::TWO_POW_34
        } else if index == 35 {
            constants::TWO_POW_35
        } else if index == 36 {
            constants::TWO_POW_36
        } else if index == 37 {
            constants::TWO_POW_37
        } else if index == 38 {
            constants::TWO_POW_38
        } else if index == 39 {
            constants::TWO_POW_39
        } else if index == 40 {
            constants::TWO_POW_40
        } else if index == 41 {
            constants::TWO_POW_41
        } else if index == 42 {
            constants::TWO_POW_42
        } else if index == 43 {
            constants::TWO_POW_43
        } else if index == 44 {
            constants::TWO_POW_44
        } else if index == 45 {
            constants::TWO_POW_45
        } else if index == 46 {
            constants::TWO_POW_46
        } else if index == 47 {
            constants::TWO_POW_47
        } else if index == 48 {
            constants::TWO_POW_48
        } else if index == 49 {
            constants::TWO_POW_49
        } else if index == 50 {
            constants::TWO_POW_50
        } else if index == 51 {
            constants::TWO_POW_51
        } else if index == 52 {
            constants::TWO_POW_52
        } else if index == 53 {
            constants::TWO_POW_53
        } else if index == 54 {
            constants::TWO_POW_54
        } else if index == 55 {
            constants::TWO_POW_55
        } else if index == 56 {
            constants::TWO_POW_56
        } else if index == 57 {
            constants::TWO_POW_57
        } else if index == 58 {
            constants::TWO_POW_58
        } else if index == 59 {
            constants::TWO_POW_59
        } else if index == 60 {
            constants::TWO_POW_60
        } else if index == 61 {
            constants::TWO_POW_61
        } else if index == 62 {
            constants::TWO_POW_62
        } else if index == 63 {
            constants::TWO_POW_63
        } else if index == 64 {
            constants::TWO_POW_64
        } else if index == 65 {
            constants::TWO_POW_65
        } else if index == 66 {
            constants::TWO_POW_66
        } else if index == 67 {
            constants::TWO_POW_67
        } else if index == 68 {
            constants::TWO_POW_68
        } else if index == 69 {
            constants::TWO_POW_69
        } else if index == 70 {
            constants::TWO_POW_70
        } else {
            constants::TWO_POW_71
        };

        // Set the bit
        bitmap | mask
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;
    use dict::{Felt252Dict, Felt252DictTrait};

    // Local imports

    use super::{Game, GameTrait, GameImpl, PrivateImpl, constants, Plan};

    // Constants

    const GAME_ID: u32 = 1;
    const SEED: felt252 = 'SEED';

    #[test]
    fn test_game_up_bit_at_index_0() {
        let bitmap = 0;
        let result = PrivateImpl::up_bit_at_index(bitmap, 0);
        assert(result == 1, 'Game: Invalid bitmap');
    }

    #[test]
    fn test_game_up_bit_at_index_1() {
        let bitmap = 1;
        let result = PrivateImpl::up_bit_at_index(bitmap, 1);
        assert(result == 3, 'Game: Invalid bitmap');
    }

    #[test]
    fn test_game_up_bit_at_index_10() {
        let bitmap = 3;
        let result = PrivateImpl::up_bit_at_index(bitmap, 10);
        assert(result == 1027, 'Game: Invalid bitmap');
    }

    #[test]
    fn test_game_up_bit_at_index_0xb() {
        let bitmap = 0x93228000004c0028c8;
        let result = PrivateImpl::up_bit_at_index(bitmap, 0xb);
        assert(result == 0x93228000004c0028c8, 'Game: Invalid bitmap');
    }

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
