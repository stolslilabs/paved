//! Turotial game deck of the following pieces
// CCCCCCCCC: 1 pieces
// CCCCCFFFC: 0 pieces
// CCCCCFRFC: 0 pieces
// CFFFCFFFC: 1 pieces
// FFCFFFCFF: 0 pieces
// FFCFFFFFC: 1 pieces
// FFFFCCCFF: 0 pieces
// FFFFFFCFF: 0 pieces
// RFFFRFCFR: 1 pieces
// RFFFRFFFR: 1 pieces
// RFRFCCCFR: 0 pieces
// RFRFFFCFR: 1 pieces
// RFRFFFFFR: 1 pieces
// RFRFRFCFF: 0 pieces
// SFRFRFCFR: 1 pieces
// SFRFRFFFR: 1 pieces
// SFRFRFRFR: 0 pieces
// WFFFFFFFF: 0 pieces
// WFFFFFFFR: 1 pieces

// Internal imports

use paved::constants::CENTER;
use paved::elements::decks::interface::{DeckTrait, Plan, Orientation, Role, Spot};

// Constants

impl Tutorial of DeckTrait {
    #[inline]
    fn total_count() -> u8 {
        10
    }

    #[inline]
    fn count() -> u8 {
        10
    }

    #[inline]
    fn plan(index: u32) -> Plan {
        let id: felt252 = (index % Self::total_count().into()).into();
        match id {
            0 => Plan::RFFFRFCFR,
            1 => Plan::SFRFRFCFR,
            2 => Plan::CFFFCFFFC,
            3 => Plan::FFCFFFFFC,
            4 => Plan::WFFFFFFFR,
            5 => Plan::RFRFFFCFR,
            6 => Plan::RFRFFFFFR,
            7 => Plan::RFFFRFFFR,
            8 => Plan::CCCCCCCCC,
            9 => Plan::SFRFRFFFR,
            _ => Plan::None,
        }
    }

    #[inline]
    fn indexes(plan: Plan) -> Array<u8> {
        match plan {
            Plan::RFFFRFCFR => array![0],
            Plan::SFRFRFCFR => array![1],
            Plan::CFFFCFFFC => array![2],
            Plan::FFCFFFFFC => array![3],
            Plan::WFFFFFFFR => array![4],
            Plan::RFRFFFCFR => array![5],
            Plan::RFRFFFFFR => array![6],
            Plan::RFFFRFFFR => array![7],
            Plan::CCCCCCCCC => array![8],
            Plan::SFRFRFFFR => array![9],
            _ => array![],
        }
    }

    #[inline]
    fn parameters(index: u32) -> (Orientation, u32, u32, Role, Spot) {
        match index {
            0 => (Orientation::None, 0, 0, Role::None, Spot::None),
            1 => (Orientation::North, CENTER - 1, CENTER, Role::Adventurer, Spot::East),
            2 => (Orientation::East, CENTER - 1, CENTER - 1, Role::Paladin, Spot::Center),
            3 => (Orientation::East, CENTER - 1, CENTER - 2, Role::None, Spot::None),
            4 => (Orientation::West, CENTER, CENTER - 1, Role::Pilgrim, Spot::Center),
            5 => (Orientation::East, CENTER, CENTER - 2, Role::Paladin, Spot::West),
            6 => (Orientation::North, CENTER + 1, CENTER - 2, Role::Lady, Spot::Center),
            7 => (Orientation::East, CENTER + 1, CENTER - 1, Role::None, Spot::None),
            8 => (Orientation::None, 0, 0, Role::None, Spot::None), // Must be burned
            9 => (Orientation::West, CENTER + 1, CENTER, Role::None, Spot::None),
            _ => (Orientation::None, 0, 0, Role::None, Spot::None),
        }
    }
}


#[cfg(test)]
mod tests {
    // Local imports

    use super::{Tutorial, Plan};

    #[test]
    fn test_deck_tutorial() {
        let mut index: u32 = 0;
        let mut counts: Felt252Dict<u8> = core::Default::default();
        loop {
            if index == Tutorial::total_count().into() {
                break;
            }
            let key: felt252 = Tutorial::plan(index).into();
            counts.insert(key, counts.get(key) + 1);
            index += 1;
        };
        // [Assert] Each plan has been drawn the right amount of time
        assert(counts.get(Plan::None.into()) == 0, 'Deck: None count');
        assert(counts.get(Plan::CCCCCCCCC.into()) == 1, 'Deck: CCCCCCCCC count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 1, 'Deck: CFFFCFFFC count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 1, 'Deck: FFCFFFFFC count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 1, 'Deck: RFFFRFCFR count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 1, 'Deck: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 1, 'Deck: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 1, 'Deck: RFRFFFFFR count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 1, 'Deck: SFRFRFCFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 1, 'Deck: SFRFRFFFR count');
        assert(counts.get(Plan::WFFFFFFFR.into()) == 1, 'Deck: WFFFFFFFR count');
    }
}

