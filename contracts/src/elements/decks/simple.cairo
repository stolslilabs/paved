//! Base game deck of the following pieces
// CCCCCCCCC: 0 pieces
// CCCCCFFFC: 6 pieces
// CCCCCFRFC: 6 pieces
// CFFFCFFFC: 6 pieces
// FFCFFFCFF: 6 pieces
// FFCFFFFFC: 6 pieces
// FFFFCCCFF: 6 pieces
// FFFFFFCFF: 6 pieces
// RFFFRFCFR: 6 pieces
// RFFFRFFFR: 6 pieces
// RFRFCCCFR: 6 pieces
// RFRFFFCFR: 6 pieces
// RFRFFFFFR: 6 pieces
// RFRFRFCFF: 6 pieces
// SFRFRFCFR: 6 pieces
// SFRFRFFFR: 6 pieces
// SFRFRFRFR: 0 pieces
// WFFFFFFFF: 6 pieces
// WFFFFFFFR: 6 pieces

// Internal imports

use paved::elements::decks::interface::{DeckTrait, Plan, Orientation, Role, Spot};
use paved::elements::decks::base::Base;

impl Simple of DeckTrait {
    #[inline]
    fn total_count() -> u8 {
        Base::total_count()
    }

    #[inline]
    fn count() -> u8 {
        38
    }

    #[inline]
    fn plan(index: u32) -> Plan {
        Base::plan(index)
    }

    #[inline]
    fn indexes(plan: Plan) -> Array<u8> {
        Base::indexes(plan)
    }

    #[inline]
    fn parameters(index: u32) -> (Orientation, u32, u32, Role, Spot) {
        Base::parameters(index)
    }
}


#[cfg(test)]
mod tests {
    // Local imports

    use super::{Simple, Plan};

    #[test]
    fn test_deck_simple() {
        let mut index: u32 = 0;
        let mut counts: Felt252Dict<u8> = core::Default::default();
        loop {
            if index == Simple::total_count().into() {
                break;
            }
            let key: felt252 = Simple::plan(index).into();
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

