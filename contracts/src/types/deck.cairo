// Core imports

use core::debug::PrintTrait;
use core::poseidon::{PoseidonTrait, HashState};
use core::hash::HashStateTrait;

// External imports

use alexandria_math::bitmap::Bitmap;

// Internal imports

use paved::types::plan::Plan;
use paved::elements::decks::base::{DeckImpl as Base};
use paved::elements::decks::simple::{DeckImpl as Simple};

// Constants

const NONE: felt252 = 0;
const MULTIPLIER: u128 = 10_000;

#[derive(Copy, Drop, Serde, Introspect)]
enum Deck {
    None,
    Base,
    Simple,
}

impl IntoDeckFelt252 of core::Into<Deck, felt252> {
    #[inline(always)]
    fn into(self: Deck) -> felt252 {
        match self {
            Deck::None => NONE,
            Deck::Base => 'BASE',
            Deck::Simple => 'SIMPLE',
        }
    }
}

impl IntoDeckU8 of core::Into<Deck, u8> {
    #[inline(always)]
    fn into(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Base => 1,
            Deck::Simple => 2,
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
            2 => Deck::Simple,
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
    fn total_count(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Base => Base::total_count(),
            Deck::Simple => Simple::total_count(),
        }
    }

    #[inline(always)]
    fn count(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Base => Base::count(),
            Deck::Simple => Simple::count(),
        }
    }

    #[inline(always)]
    fn plan(self: Deck, index: u32) -> Plan {
        match self {
            Deck::None => Plan::None,
            Deck::Base => Base::plan(index),
            Deck::Simple => Simple::plan(index),
        }
    }

    #[inline(always)]
    fn indexes(self: Deck, plan: Plan) -> Array<u8> {
        match self {
            Deck::None => array![],
            Deck::Base => Base::indexes(plan),
            Deck::Simple => Simple::indexes(plan),
        }
    }

    fn tiles(self: Deck, mut tiles: u128, seed: felt252) -> u128 {
        match self {
            Deck::None => 0,
            Deck::Base => 0,
            Deck::Simple => {
                let total_count: u128 = self.total_count().into();
                let mut to_removes = total_count - self.count().into();
                let mut index: u8 = 0;
                loop {
                    if to_removes == 0 {
                        break tiles;
                    }
                    let state: HashState = PoseidonTrait::new();
                    let state = state.update(seed);
                    let state = state.update(index.into());
                    let random_u256: u256 = state.finalize().into();
                    let random: u128 = random_u256.low % MULTIPLIER;
                    let probability: u128 = to_removes.into()
                        * MULTIPLIER
                        / (total_count - index.into()).into();
                    if random <= probability {
                        to_removes -= 1;
                        tiles = Bitmap::set_bit_at(tiles, index, true);
                    };
                    index += 1;
                }
            },
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

