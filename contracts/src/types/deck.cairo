// Core imports

use core::debug::PrintTrait;

// Internal imports

use paved::types::plan::Plan;
use paved::decks::base::{DeckImpl as Base, TOTAL_TILE_COUNT as BASE_TILE_COUNT};

// Constants

const NONE: felt252 = 0;

#[derive(Copy, Drop, Serde, Introspect)]
enum Deck {
    None,
    Base,
}

impl IntoDeckFelt252 of core::Into<Deck, felt252> {
    #[inline(always)]
    fn into(self: Deck) -> felt252 {
        match self {
            Deck::None => NONE,
            Deck::Base => 'BASE',
        }
    }
}

impl IntoDeckU8 of core::Into<Deck, u8> {
    #[inline(always)]
    fn into(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Base => 1,
        }
    }
}

impl IntoDeck of core::Into<u8, Deck> {
    #[inline(always)]
    fn into(self: u8) -> Deck {
        let deck: felt252 = self.into();
        match deck {
            0 => Deck::None,
            1 => Deck::Base,
            _ => Deck::None,
        }
    }
}

impl DeckPrint of PrintTrait<Deck> {
    #[inline(always)]
    fn print(self: Deck) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[generate_trait]
impl DeckImpl of DeckTrait {
    #[inline(always)]
    fn count(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Base => Base::count(),
        }
    }

    fn plan(self: Deck, index: u32) -> Plan {
        match self {
            Deck::None => Plan::None,
            Deck::Base => Base::plan(index),
        }
    }

    fn indexes(self: Deck, plan: Plan) -> Array<u8> {
        match self {
            Deck::None => array![],
            Deck::Base => Base::indexes(plan),
        }
    }
}

impl DeckPartialEq of PartialEq<Deck> {
    #[inline(always)]
    fn eq(lhs: @Deck, rhs: @Deck) -> bool {
        let felt: felt252 = (*lhs).into();
        felt == (*rhs).into()
    }

    #[inline(always)]
    fn ne(lhs: @Deck, rhs: @Deck) -> bool {
        let felt: felt252 = (*lhs).into();
        felt != (*rhs).into()
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Deck, DeckImpl, NONE};

    // Constants

    const UNKNOWN_U8: u8 = 255;

    #[test]
    fn test_deck_into_felt() {
        assert('BASE' == Deck::Base.into(), 'Deck: into felt BASE');
    }

    #[test]
    fn test_deck_into_u8() {
        assert(1_u8 == Deck::Base.into(), 'Deck: into u8 BASE');
    }

    #[test]
    fn test_u8_into_deck() {
        assert(Deck::Base == 1_u8.into(), 'Deck: into deck BASE');
    }

    #[test]
    fn test_unknown_u8_into_deck() {
        assert(Deck::None == UNKNOWN_U8.into(), 'Deck: into deck None');
    }
}

