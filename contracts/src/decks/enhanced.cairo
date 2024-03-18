//! Enhanced game deck of the following pieces
//! CCCCCCCCC: 1 pieces
//! CCCCCFFFC: 4 pieces
//! CCCCCFRFC: 3 pieces
//! CFCFCCCCC: 1 pieces
//! CFCFCFCFC: 1 pieces
//! CFCFCFFFC: 1 pieces
//! CFFCFCFFC: 1 pieces
//! CFFFCFFFC: 3 pieces
//! CFFFCFRFC: 3 pieces
//! FCCFCCCFC: 1 pieces
//! FCCFCFCFC: 1 pieces
//! FFCFCCCFF: 1 pieces
//! FFCFCFCFC: 1 pieces
//! FFCFFFCCC: 1 pieces
//! FFCFFFCFC: 1 pieces
//! FFCFFFCFF: 3 pieces
//! FFCFFFFFC: 2 pieces
//! FFFFCCCFF: 5 pieces
//! FFFFFFCFF: 5 pieces
//! RFFFFFCFR: 2 pieces
//! RFFFRFCFF: 2 pieces
//! RFFFRFCFR: 4 pieces
//! RFFFRFFFR: 9 pieces
//! RFRFCCCFF: 2 pieces
//! RFRFCCCFR: 5 pieces
//! RFRFFFCCC: 2 pieces
//! RFRFFFCFF: 2 pieces
//! RFRFFFCFR: 3 pieces
//! RFRFFFFFR: 10 pieces
//! RFRFRFCFF: 3 pieces
//! SFFFFFFFR: 2 pieces
//! SFRFRFCFR: 3 pieces
//! SFRFRFFFR: 5 pieces
//! SFRFRFRFR: 2 pieces
//! WCCCCCCCC: 1 pieces
//! WFFFFFFFF: 2 pieces
//! WFFFFFFFR: 1 pieces

// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::plan::Plan;

// Constants

const TOTAL_TILE_COUNT: u8 = 99;

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
        } else if id < 9 {
            Plan::CFCFCCCCC
        } else if id < 10 {
            Plan::CFCFCFCFC
        } else if id < 11 {
            Plan::CFCFCFFFC
        } else if id < 12 {
            Plan::CFFCFCFFC
        } else if id < 15 {
            Plan::CFFFCFFFC
        } else if id < 18 {
            Plan::CFFFCFRFC
        } else if id < 19 {
            Plan::FCCFCCCFC
        } else if id < 20 {
            Plan::FCCFCFCFC
        } else if id < 21 {
            Plan::FFCFCCCFF
        } else if id < 22 {
            Plan::FFCFCFCFC
        } else if id < 23 {
            Plan::FFCFFFCCC
        } else if id < 24 {
            Plan::FFCFFFCFC
        } else if id < 27 {
            Plan::FFCFFFCFF
        } else if id < 29 {
            Plan::FFCFFFFFC
        } else if id < 34 {
            Plan::FFFFCCCFF
        } else if id < 39 {
            Plan::FFFFFFCFF
        } else if id < 41 {
            Plan::RFFFFFCFR
        } else if id < 43 {
            Plan::RFFFRFCFF
        } else if id < 47 {
            Plan::RFFFRFCFR
        } else if id < 56 {
            Plan::RFFFRFFFR
        } else if id < 58 {
            Plan::RFRFCCCFF
        } else if id < 63 {
            Plan::RFRFCCCFR
        } else if id < 65 {
            Plan::RFRFFFCCC
        } else if id < 67 {
            Plan::RFRFFFCFF
        } else if id < 70 {
            Plan::RFRFFFCFR
        } else if id < 80 {
            Plan::RFRFFFFFR
        } else if id < 83 {
            Plan::RFRFRFCFF
        } else if id < 85 {
            Plan::SFFFFFFFR
        } else if id < 88 {
            Plan::SFRFRFCFR
        } else if id < 93 {
            Plan::SFRFRFFFR
        } else if id < 95 {
            Plan::SFRFRFRFR
        } else if id < 96 {
            Plan::WCCCCCCCC
        } else if id < 98 {
            Plan::WFFFFFFFF
        } else if id < 99 {
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
            Plan::CFCFCCCCC => array![8],
            Plan::CFCFCFCFC => array![9],
            Plan::CFCFCFFFC => array![10],
            Plan::CFFCFCFFC => array![11],
            Plan::CFFFCFFFC => array![12, 13, 14],
            Plan::CFFFCFRFC => array![15, 16, 17],
            Plan::FCCFCCCFC => array![18],
            Plan::FCCFCFCFC => array![19],
            Plan::FFCFCCCFF => array![20],
            Plan::FFCFCFCFC => array![21],
            Plan::FFCFFFCCC => array![22],
            Plan::FFCFFFCFC => array![23],
            Plan::FFCFFFCFF => array![24, 25, 26],
            Plan::FFCFFFFFC => array![27, 28],
            Plan::FFFFCCCFF => array![29, 30, 31, 32, 33],
            Plan::FFFFFFCFF => array![34, 35, 36, 37, 38],
            Plan::RFFFFFCFR => array![39, 40],
            Plan::RFFFRFCFF => array![41, 42],
            Plan::RFFFRFCFR => array![43, 44, 45, 46],
            Plan::RFFFRFFFR => array![47, 48, 49, 50, 51, 52, 53, 54, 55],
            Plan::RFRFCCCFF => array![56, 57],
            Plan::RFRFCCCFR => array![58, 59, 60, 61, 62],
            Plan::RFRFFFCCC => array![63, 64],
            Plan::RFRFFFCFF => array![65, 66],
            Plan::RFRFFFCFR => array![67, 68, 69],
            Plan::RFRFFFFFR => array![70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
            Plan::RFRFRFCFF => array![80, 81, 82],
            Plan::SFFFFFFFR => array![83, 84],
            Plan::SFRFRFCFR => array![85, 86, 87],
            Plan::SFRFRFFFR => array![88, 89, 90, 91, 92],
            Plan::SFRFRFRFR => array![93, 94],
            Plan::WCCCCCCCC => array![95],
            Plan::WFFFFFFFF => array![96, 97],
            Plan::WFFFFFFFR => array![98],
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
    fn test_deck_enhanced() {
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
        assert(counts.get(Plan::CFCFCCCCC.into()) == 1, 'Deck: CFCFCCCCC count');
        assert(counts.get(Plan::CFCFCFCFC.into()) == 1, 'Deck: CFCFCFCFC count');
        assert(counts.get(Plan::CFCFCFFFC.into()) == 1, 'Deck: CFCFCFFFC count');
        assert(counts.get(Plan::CFFCFCFFC.into()) == 1, 'Deck: CFFCFCFFC count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 3, 'Deck: CFFFCFFFC count');
        assert(counts.get(Plan::CFFFCFRFC.into()) == 3, 'Deck: CFFFCFRFC count');
        assert(counts.get(Plan::FCCFCCCFC.into()) == 1, 'Deck: FCCFCCCFC count');
        assert(counts.get(Plan::FCCFCFCFC.into()) == 1, 'Deck: FCCFCFCFC count');
        assert(counts.get(Plan::FFCFCCCFF.into()) == 1, 'Deck: FFCFCCCFF count');
        assert(counts.get(Plan::FFCFCFCFC.into()) == 1, 'Deck: FFCFCFCFC count');
        assert(counts.get(Plan::FFCFFFCCC.into()) == 1, 'Deck: FFCFFFCCC count');
        assert(counts.get(Plan::FFCFFFCFC.into()) == 1, 'Deck: FFCFFFCFC count');
        assert(counts.get(Plan::FFCFFFCFF.into()) == 3, 'Deck: FFCFFFCFF count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 2, 'Deck: FFCFFFFFC count');
        assert(counts.get(Plan::FFFFCCCFF.into()) == 5, 'Deck: FFFFCCCFF count');
        assert(counts.get(Plan::FFFFFFCFF.into()) == 5, 'Deck: FFFFFFCFF count');
        assert(counts.get(Plan::RFFFFFCFR.into()) == 2, 'Deck: RFFFFFCFR count');
        assert(counts.get(Plan::RFFFRFCFF.into()) == 2, 'Deck: RFFFRFCFF count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 4, 'Deck: RFFFRFCFR count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 9, 'Deck: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFCCCFF.into()) == 2, 'Deck: RFRFCCCFF count');
        assert(counts.get(Plan::RFRFCCCFR.into()) == 5, 'Deck: RFRFCCCFR count');
        assert(counts.get(Plan::RFRFFFCCC.into()) == 2, 'Deck: RFRFFFCCC count');
        assert(counts.get(Plan::RFRFFFCFF.into()) == 2, 'Deck: RFRFFFCFF count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 3, 'Deck: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 10, 'Deck: RFRFFFFFR count');
        assert(counts.get(Plan::RFRFRFCFF.into()) == 3, 'Deck: RFRFRFCFF count');
        assert(counts.get(Plan::SFFFFFFFR.into()) == 2, 'Deck: SFFFFFFFR count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 3, 'Deck: SFRFRFCFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 5, 'Deck: SFRFRFFFR count');
        assert(counts.get(Plan::SFRFRFRFR.into()) == 2, 'Deck: SFRFRFRFR count');
        assert(counts.get(Plan::WCCCCCCCC.into()) == 1, 'Deck: WCCCCCCCC count');
        assert(counts.get(Plan::WFFFFFFFF.into()) == 2, 'Deck: WFFFFFFFF count');
        assert(counts.get(Plan::WFFFFFFFR.into()) == 1, 'Deck: WFFFFFFFR count');
    }
}

