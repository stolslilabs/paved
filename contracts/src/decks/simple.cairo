//! Base game deck of the following pieces
// CCCCCCCCC: 0 pieces
// CCCCCFFFC: 2 pieces
// CCCCCFRFC: 2 pieces
// CFFFCFFFC: 1 pieces
// FFCFFFCFF: 1 pieces
// FFCFFFFFC: 1 pieces
// FFFFCCCFF: 2 pieces
// FFFFFFCFF: 2 pieces
// RFFFRFCFR: 2 pieces
// RFFFRFFFR: 5 pieces
// RFRFCCCFR: 3 pieces
// RFRFFFCFR: 2 pieces
// RFRFFFFFR: 6 pieces
// RFRFRFCFF: 2 pieces
// SFRFRFCFR: 2 pieces
// SFRFRFFFR: 2 pieces
// SFRFRFRFR: 0 pieces
// WFFFFFFFF: 2 pieces
// WFFFFFFFR: 1 pieces

// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::plan::Plan;

// Constants

const TOTAL_TILE_COUNT: u8 = 38;

#[generate_trait]
impl DeckImpl of DeckTrait {
    #[inline(always)]
    fn count() -> u8 {
        TOTAL_TILE_COUNT
    }

    #[inline(always)]
    fn plan(index: u32) -> Plan {
        let id = index % TOTAL_TILE_COUNT.into();
        if id < 2 {
            Plan::CCCCCFFFC
        } else if id < 4 {
            Plan::CCCCCFRFC
        } else if id < 5 {
            Plan::CFFFCFFFC
        } else if id < 6 {
            Plan::FFCFFFCFF
        } else if id < 7 {
            Plan::FFCFFFFFC
        } else if id < 9 {
            Plan::FFFFCCCFF
        } else if id < 11 {
            Plan::FFFFFFCFF
        } else if id < 13 {
            Plan::RFFFRFCFR
        } else if id < 18 {
            Plan::RFFFRFFFR
        } else if id < 21 {
            Plan::RFRFCCCFR
        } else if id < 23 {
            Plan::RFRFFFCFR
        } else if id < 29 {
            Plan::RFRFFFFFR
        } else if id < 31 {
            Plan::RFRFRFCFF
        } else if id < 33 {
            Plan::SFRFRFCFR
        } else if id < 35 {
            Plan::SFRFRFFFR
        } else if id < 37 {
            Plan::WFFFFFFFF
        } else if id < 38 {
            Plan::WFFFFFFFR
        } else {
            Plan::None
        }
    }

    #[inline(always)]
    fn indexes(self: Plan) -> Array<u8> {
        match self {
            Plan::CCCCCFFFC => array![0, 1],
            Plan::CCCCCFRFC => array![2, 3],
            Plan::CFFFCFFFC => array![4],
            Plan::FFCFFFCFF => array![5],
            Plan::FFCFFFFFC => array![6],
            Plan::FFFFCCCFF => array![7, 8],
            Plan::FFFFFFCFF => array![9, 10],
            Plan::RFFFRFCFR => array![11, 12],
            Plan::RFFFRFFFR => array![13, 14, 15, 16, 17],
            Plan::RFRFCCCFR => array![18, 19, 20],
            Plan::RFRFFFCFR => array![21, 22],
            Plan::RFRFFFFFR => array![23, 24, 25, 26, 27, 28],
            Plan::RFRFRFCFF => array![29, 30],
            Plan::SFRFRFCFR => array![31, 32],
            Plan::SFRFRFFFR => array![33, 34],
            Plan::WFFFFFFFF => array![35, 36],
            Plan::WFFFFFFFR => array![37],
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
    fn test_deck_simple() {
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
        assert(counts.get(Plan::CCCCCFFFC.into()) == 2, 'Deck: CCCCCFFFC count');
        assert(counts.get(Plan::CCCCCFRFC.into()) == 2, 'Deck: CCCCCFRFC count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 1, 'Deck: CFFFCFFFC count');
        assert(counts.get(Plan::FFCFFFCFF.into()) == 1, 'Deck: FFCFFFCFF count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 1, 'Deck: FFCFFFFFC count');
        assert(counts.get(Plan::FFFFCCCFF.into()) == 2, 'Deck: FFFFCCCFF count');
        assert(counts.get(Plan::FFFFFFCFF.into()) == 2, 'Deck: FFFFFFCFF count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 2, 'Deck: RFFFRFCFR count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 5, 'Deck: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFCCCFR.into()) == 3, 'Deck: RFRFCCCFR count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 2, 'Deck: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 6, 'Deck: RFRFFFFFR count');
        assert(counts.get(Plan::RFRFRFCFF.into()) == 2, 'Deck: RFRFRFCFF count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 2, 'Deck: SFRFRFCFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 2, 'Deck: SFRFRFFFR count');
        assert(counts.get(Plan::WFFFFFFFF.into()) == 2, 'Deck: WFFFFFFFF count');
        assert(counts.get(Plan::WFFFFFFFR.into()) == 1, 'Deck: WFFFFFFFR count');
    }
}

