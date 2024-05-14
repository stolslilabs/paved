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
        let id: felt252 = (index % TOTAL_TILE_COUNT.into()).into();
        match id {
            0 => Plan::CCCCCFFFC,
            1 => Plan::CCCCCFFFC,
            2 => Plan::CCCCCFRFC,
            3 => Plan::CCCCCFRFC,
            4 => Plan::CFFFCFFFC,
            5 => Plan::FFCFFFCFF,
            6 => Plan::FFCFFFFFC,
            7 => Plan::FFFFCCCFF,
            8 => Plan::FFFFCCCFF,
            9 => Plan::FFFFFFCFF,
            10 => Plan::FFFFFFCFF,
            11 => Plan::RFFFRFCFR,
            12 => Plan::RFFFRFCFR,
            13 => Plan::RFFFRFFFR,
            14 => Plan::RFFFRFFFR,
            15 => Plan::RFFFRFFFR,
            16 => Plan::RFFFRFFFR,
            17 => Plan::RFFFRFFFR,
            18 => Plan::RFRFCCCFR,
            19 => Plan::RFRFCCCFR,
            20 => Plan::RFRFCCCFR,
            21 => Plan::RFRFFFCFR,
            22 => Plan::RFRFFFCFR,
            23 => Plan::RFRFFFFFR,
            24 => Plan::RFRFFFFFR,
            25 => Plan::RFRFFFFFR,
            26 => Plan::RFRFFFFFR,
            27 => Plan::RFRFFFFFR,
            28 => Plan::RFRFFFFFR,
            29 => Plan::RFRFRFCFF,
            30 => Plan::RFRFRFCFF,
            31 => Plan::SFRFRFCFR,
            32 => Plan::SFRFRFCFR,
            33 => Plan::SFRFRFFFR,
            34 => Plan::SFRFRFFFR,
            35 => Plan::WFFFFFFFF,
            36 => Plan::WFFFFFFFF,
            37 => Plan::WFFFFFFFR,
            _ => Plan::None,
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

