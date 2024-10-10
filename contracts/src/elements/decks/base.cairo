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

use paved::elements::decks::interface::{DeckTrait, Plan, Orientation, Role, Spot};

// Constants

impl Base of DeckTrait {
    #[inline]
    fn total_count() -> u8 {
        72
    }

    #[inline]
    fn count() -> u8 {
        72
    }

    #[inline]
    fn plan(index: u32) -> Plan {
        let id: felt252 = (index % Self::total_count().into()).into();
        match id {
            0 => Plan::CCCCCCCCC,
            1 => Plan::CCCCCFFFC,
            2 => Plan::CCCCCFFFC,
            3 => Plan::CCCCCFFFC,
            4 => Plan::CCCCCFFFC,
            5 => Plan::CCCCCFRFC,
            6 => Plan::CCCCCFRFC,
            7 => Plan::CCCCCFRFC,
            8 => Plan::CFFFCFFFC,
            9 => Plan::CFFFCFFFC,
            10 => Plan::CFFFCFFFC,
            11 => Plan::FFCFFFCFF,
            12 => Plan::FFCFFFCFF,
            13 => Plan::FFCFFFCFF,
            14 => Plan::FFCFFFFFC,
            15 => Plan::FFCFFFFFC,
            16 => Plan::FFFFCCCFF,
            17 => Plan::FFFFCCCFF,
            18 => Plan::FFFFCCCFF,
            19 => Plan::FFFFCCCFF,
            20 => Plan::FFFFCCCFF,
            21 => Plan::FFFFFFCFF,
            22 => Plan::FFFFFFCFF,
            23 => Plan::FFFFFFCFF,
            24 => Plan::FFFFFFCFF,
            25 => Plan::FFFFFFCFF,
            26 => Plan::RFFFRFCFR,
            27 => Plan::RFFFRFCFR,
            28 => Plan::RFFFRFCFR,
            29 => Plan::RFFFRFCFR,
            30 => Plan::RFFFRFFFR,
            31 => Plan::RFFFRFFFR,
            32 => Plan::RFFFRFFFR,
            33 => Plan::RFFFRFFFR,
            34 => Plan::RFFFRFFFR,
            35 => Plan::RFFFRFFFR,
            36 => Plan::RFFFRFFFR,
            37 => Plan::RFFFRFFFR,
            38 => Plan::RFRFCCCFR,
            39 => Plan::RFRFCCCFR,
            40 => Plan::RFRFCCCFR,
            41 => Plan::RFRFCCCFR,
            42 => Plan::RFRFCCCFR,
            43 => Plan::RFRFFFCFR,
            44 => Plan::RFRFFFCFR,
            45 => Plan::RFRFFFCFR,
            46 => Plan::RFRFFFFFR,
            47 => Plan::RFRFFFFFR,
            48 => Plan::RFRFFFFFR,
            49 => Plan::RFRFFFFFR,
            50 => Plan::RFRFFFFFR,
            51 => Plan::RFRFFFFFR,
            52 => Plan::RFRFFFFFR,
            53 => Plan::RFRFFFFFR,
            54 => Plan::RFRFFFFFR,
            55 => Plan::RFRFRFCFF,
            56 => Plan::RFRFRFCFF,
            57 => Plan::RFRFRFCFF,
            58 => Plan::SFRFRFCFR,
            59 => Plan::SFRFRFCFR,
            60 => Plan::SFRFRFCFR,
            61 => Plan::SFRFRFFFR,
            62 => Plan::SFRFRFFFR,
            63 => Plan::SFRFRFFFR,
            64 => Plan::SFRFRFFFR,
            65 => Plan::SFRFRFRFR,
            66 => Plan::WFFFFFFFF,
            67 => Plan::WFFFFFFFF,
            68 => Plan::WFFFFFFFF,
            69 => Plan::WFFFFFFFF,
            70 => Plan::WFFFFFFFR,
            71 => Plan::WFFFFFFFR,
            _ => Plan::None,
        }
    }

    #[inline]
    fn indexes(plan: Plan) -> Array<u8> {
        match plan {
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

    #[inline]
    fn parameters(index: u32) -> (Orientation, u32, u32, Role, Spot) {
        (Orientation::None, 0, 0, Role::None, Spot::None)
    }
}


#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Base, Plan};

    #[test]
    fn test_deck_base() {
        let mut index: u32 = 0;
        let mut counts: Felt252Dict<u8> = core::Default::default();
        loop {
            if index == Base::total_count().into() {
                break;
            }
            let key: felt252 = Base::plan(index).into();
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

