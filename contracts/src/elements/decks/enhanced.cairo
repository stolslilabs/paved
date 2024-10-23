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

use paved::elements::decks::interface::{DeckTrait, Plan, Orientation, Role, Spot};

// Constants

impl Enhanced of DeckTrait {
    #[inline]
    fn total_count() -> u8 {
        99
    }

    #[inline]
    fn count() -> u8 {
        99
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
            8 => Plan::CFCFCCCCC,
            9 => Plan::CFCFCFCFC,
            10 => Plan::CFCFCFFFC,
            11 => Plan::CFFCFCFFC,
            12 => Plan::CFFFCFFFC,
            13 => Plan::CFFFCFFFC,
            14 => Plan::CFFFCFFFC,
            15 => Plan::CFFFCFRFC,
            16 => Plan::CFFFCFRFC,
            17 => Plan::CFFFCFRFC,
            18 => Plan::FCCFCCCFC,
            19 => Plan::FCCFCFCFC,
            20 => Plan::FFCFCCCFF,
            21 => Plan::FFCFCFCFC,
            22 => Plan::FFCFFFCCC,
            23 => Plan::FFCFFFCFC,
            24 => Plan::FFCFFFCFF,
            25 => Plan::FFCFFFCFF,
            26 => Plan::FFCFFFCFF,
            27 => Plan::FFCFFFFFC,
            28 => Plan::FFCFFFFFC,
            29 => Plan::FFFFCCCFF,
            30 => Plan::FFFFCCCFF,
            31 => Plan::FFFFCCCFF,
            32 => Plan::FFFFCCCFF,
            33 => Plan::FFFFCCCFF,
            34 => Plan::FFFFFFCFF,
            35 => Plan::FFFFFFCFF,
            36 => Plan::FFFFFFCFF,
            37 => Plan::FFFFFFCFF,
            38 => Plan::FFFFFFCFF,
            39 => Plan::RFFFFFCFR,
            40 => Plan::RFFFFFCFR,
            41 => Plan::RFFFRFCFF,
            42 => Plan::RFFFRFCFF,
            43 => Plan::RFFFRFCFR,
            44 => Plan::RFFFRFCFR,
            45 => Plan::RFFFRFCFR,
            46 => Plan::RFFFRFCFR,
            47 => Plan::RFFFRFFFR,
            48 => Plan::RFFFRFFFR,
            49 => Plan::RFFFRFFFR,
            50 => Plan::RFFFRFFFR,
            51 => Plan::RFFFRFFFR,
            52 => Plan::RFFFRFFFR,
            53 => Plan::RFFFRFFFR,
            54 => Plan::RFFFRFFFR,
            55 => Plan::RFFFRFFFR,
            56 => Plan::RFRFCCCFF,
            57 => Plan::RFRFCCCFF,
            58 => Plan::RFRFCCCFR,
            59 => Plan::RFRFCCCFR,
            60 => Plan::RFRFCCCFR,
            61 => Plan::RFRFCCCFR,
            62 => Plan::RFRFCCCFR,
            63 => Plan::RFRFFFCCC,
            64 => Plan::RFRFFFCCC,
            65 => Plan::RFRFFFCFF,
            66 => Plan::RFRFFFCFF,
            67 => Plan::RFRFFFCFR,
            68 => Plan::RFRFFFCFR,
            69 => Plan::RFRFFFCFR,
            70 => Plan::RFRFFFFFR,
            71 => Plan::RFRFFFFFR,
            72 => Plan::RFRFFFFFR,
            73 => Plan::RFRFFFFFR,
            74 => Plan::RFRFFFFFR,
            75 => Plan::RFRFFFFFR,
            76 => Plan::RFRFFFFFR,
            77 => Plan::RFRFFFFFR,
            78 => Plan::RFRFFFFFR,
            79 => Plan::RFRFFFFFR,
            80 => Plan::RFRFRFCFF,
            81 => Plan::RFRFRFCFF,
            82 => Plan::RFRFRFCFF,
            83 => Plan::SFFFFFFFR,
            84 => Plan::SFFFFFFFR,
            85 => Plan::SFRFRFCFR,
            86 => Plan::SFRFRFCFR,
            87 => Plan::SFRFRFCFR,
            88 => Plan::SFRFRFFFR,
            89 => Plan::SFRFRFFFR,
            90 => Plan::SFRFRFFFR,
            91 => Plan::SFRFRFFFR,
            92 => Plan::SFRFRFFFR,
            93 => Plan::SFRFRFRFR,
            94 => Plan::SFRFRFRFR,
            95 => Plan::WCCCCCCCC,
            96 => Plan::WFFFFFFFF,
            97 => Plan::WFFFFFFFF,
            98 => Plan::WFFFFFFFR,
            _ => Plan::None,
        }
    }

    #[inline]
    fn indexes(plan: Plan) -> Array<u8> {
        match plan {
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

    use super::{Enhanced, Plan};

    #[test]
    fn test_deck_base() {
        let mut index: u32 = 0;
        let mut counts: Felt252Dict<u8> = core::Default::default();
        loop {
            if index == Enhanced::total_count().into() {
                break;
            }
            let key: felt252 = Enhanced::plan(index).into();
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

