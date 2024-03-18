//! Base game deck of the following pieces
// CCCCCCCCC: 1 pieces
// CCCCCFFFC: 4 pieces
// CCCCCFRFC: 3 pieces
// CFFFCFFFC: 3 pieces
// FFCFFFCFF: 3 pieces
// FFCFFFFFC: 2 pieces
// FFFFCCCFF: 5 pieces
// FFFFFFCFF: 5 pieces
// RFFFRFCFR: 4 pieces
// RFFFRFFFR: 8 pieces
// RFRFCCCFR: 5 pieces
// RFRFFFCFR: 3 pieces
// RFRFFFFFR: 9 pieces
// RFRFRFCFF: 3 pieces
// SFRFRFCFR: 3 pieces
// SFRFRFFFR: 4 pieces
// SFRFRFRFR: 1 pieces
// WFFFFFFFF: 4 pieces
// WFFFFFFFR: 2 pieces

// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::plan::Plan;

// Constants

const TOTAL_TILE_COUNT: u8 = 72;

#[generate_trait]
impl DeckImpl of DeckTrait {
    #[inline(always)]
    fn count() -> u8 {
        TOTAL_TILE_COUNT
    }

    #[inline(always)]
    fn plan(index: u32) -> Plan {
        let id = index % TOTAL_TILE_COUNT.into();
        if id < 1 {
            Plan::CCCCCCCCC
        } else if id < 5 {
            Plan::CCCCCFFFC
        } else if id < 8 {
            Plan::CCCCCFRFC
        } else if id < 11 {
            Plan::CFFFCFFFC
        } else if id < 14 {
            Plan::FFCFFFCFF
        } else if id < 16 {
            Plan::FFCFFFFFC
        } else if id < 21 {
            Plan::FFFFCCCFF
        } else if id < 26 {
            Plan::FFFFFFCFF
        } else if id < 30 {
            Plan::RFFFRFCFR
        } else if id < 38 {
            Plan::RFFFRFFFR
        } else if id < 43 {
            Plan::RFRFCCCFR
        } else if id < 46 {
            Plan::RFRFFFCFR
        } else if id < 55 {
            Plan::RFRFFFFFR
        } else if id < 58 {
            Plan::RFRFRFCFF
        } else if id < 61 {
            Plan::SFRFRFCFR
        } else if id < 65 {
            Plan::SFRFRFFFR
        } else if id < 66 {
            Plan::SFRFRFRFR
        } else if id < 70 {
            Plan::WFFFFFFFF
        } else if id < 72 {
            Plan::WFFFFFFFR
        } else {
            Plan::None
        }
    }

    #[inline(always)]
    fn indexes(self: Plan) -> Array<u8> {
        match self {
            Plan::CCCCCCCCC => array![0],
            Plan::CCCCCFFFC => array![1, 2, 3, 4],
            Plan::CCCCCFRFC => array![5, 6, 7],
            Plan::CFFFCFFFC => array![8, 9, 10],
            Plan::FFCFFFCFF => array![11, 12, 13],
            Plan::FFCFFFFFC => array![14, 15],
            Plan::FFFFCCCFF => array![16, 17, 18, 19, 20],
            Plan::FFFFFFCFF => array![21, 22, 23, 24, 25],
            Plan::RFFFRFCFR => array![26, 27, 28, 29],
            Plan::RFFFRFFFR => array![30, 31, 32, 33, 34, 35, 36, 37],
            Plan::RFRFCCCFR => array![38, 39, 40, 41, 42],
            Plan::RFRFFFCFR => array![43, 44, 45],
            Plan::RFRFFFFFR => array![46, 47, 48, 49, 50, 51, 52, 53, 54],
            Plan::RFRFRFCFF => array![55, 56, 57],
            Plan::SFRFRFCFR => array![58, 59, 60],
            Plan::SFRFRFFFR => array![61, 62, 63, 64],
            Plan::SFRFRFRFR => array![65],
            Plan::WFFFFFFFF => array![66, 67, 68, 69],
            Plan::WFFFFFFFR => array![70, 71],
            _ => array![],
        }
    }
}


#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{DeckImpl, Plan, TOTAL_TILE_COUNT};

    #[test]
    fn test_deck_base() {
        let mut index: u32 = 0;
        let mut counts: Felt252Dict<u8> = core::Default::default();
        loop {
            if index == TOTAL_TILE_COUNT.into() {
                break;
            }
            let key: felt252 = DeckImpl::plan(index).into();
            counts.insert(key, counts.get(key) + 1);
            index += 1;
        };
        // [Assert] Each plan has been drawn the right amount of time
        assert(counts.get(Plan::None.into()) == 0, 'Deck: None count');
        assert(counts.get(Plan::CCCCCCCCC.into()) == 1, 'Deck: CCCCCCCCC count');
        assert(counts.get(Plan::CCCCCFFFC.into()) == 4, 'Deck: CCCCCFFFC count');
        assert(counts.get(Plan::CCCCCFRFC.into()) == 3, 'Deck: CCCCCFRFC count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 3, 'Deck: CFFFCFFFC count');
        assert(counts.get(Plan::FFCFFFCFF.into()) == 3, 'Deck: FFCFFFCFF count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 2, 'Deck: FFCFFFFFC count');
        assert(counts.get(Plan::FFFFCCCFF.into()) == 5, 'Deck: FFFFCCCFF count');
        assert(counts.get(Plan::FFFFFFCFF.into()) == 5, 'Deck: FFFFFFCFF count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 4, 'Deck: RFFFRFCFR count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 8, 'Deck: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFCCCFR.into()) == 5, 'Deck: RFRFCCCFR count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 3, 'Deck: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 9, 'Deck: RFRFFFFFR count');
        assert(counts.get(Plan::RFRFRFCFF.into()) == 3, 'Deck: RFRFRFCFF count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 3, 'Deck: SFRFRFCFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 4, 'Deck: SFRFRFFFR count');
        assert(counts.get(Plan::SFRFRFRFR.into()) == 1, 'Deck: SFRFRFRFR count');
        assert(counts.get(Plan::WFFFFFFFF.into()) == 4, 'Deck: WFFFFFFFF count');
        assert(counts.get(Plan::WFFFFFFFR.into()) == 2, 'Deck: WFFFFFFFR count');
    }
}

