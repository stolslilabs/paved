// Core imports

use core::debug::PrintTrait;
use core::poseidon::{PoseidonTrait, HashState};
use core::hash::HashStateTrait;

// Internal imports

use paved::types::plan::Plan;
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::elements::decks::base::Base;
use paved::elements::decks::simple::Simple;
use paved::elements::decks::tutorial::Tutorial;
// use paved::elements::decks::enhanced::Enhanced;
use paved::helpers::bitmap::Bitmap;

// Constants

const NONE: felt252 = 0;
const MULTIPLIER: u128 = 10_000;

#[derive(Copy, Drop, Serde)]
enum Deck {
    None,
    Base,
    Simple,
    Tutorial,
    // Enhanced,
}

impl IntoDeckFelt252 of core::Into<Deck, felt252> {
    #[inline]
    fn into(self: Deck) -> felt252 {
        match self {
            Deck::None => NONE,
            Deck::Base => 'BASE',
            Deck::Simple => 'SIMPLE',
            Deck::Tutorial => 'TUTORIAL',
            // Deck::Enhanced => 'ENHANCED',
        }
    }
}

impl IntoDeckU8 of core::Into<Deck, u8> {
    #[inline]
    fn into(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Base => 1,
            Deck::Simple => 2,
            Deck::Tutorial => 3,
            // Deck::Enhanced => 4,
        }
    }
}

impl IntoDeck of core::Into<u8, Deck> {
    #[inline]
    fn into(self: u8) -> Deck {
        let deck: felt252 = self.into();
        match deck {
            0 => Deck::None,
            1 => Deck::Base,
            2 => Deck::Simple,
            3 => Deck::Tutorial,
            // 4 => Deck::Enhanced,
            _ => Deck::None,
        }
    }
}

impl DeckPrint of PrintTrait<Deck> {
    #[inline]
    fn print(self: Deck) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[generate_trait]
impl DeckImpl of DeckTrait {
    #[inline]
    fn total_count(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Base => Base::total_count(),
            Deck::Simple => Simple::total_count(),
            Deck::Tutorial => Tutorial::total_count(),
            // Deck::Enhanced => Enhanced::total_count(),
        }
    }

    #[inline]
    fn count(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Base => Base::count(),
            Deck::Simple => Simple::count(),
            Deck::Tutorial => Tutorial::count(),
            // Deck::Enhanced => Enhanced::count(),
        }
    }

    #[inline]
    fn plan(self: Deck, index: u32) -> Plan {
        match self {
            Deck::None => Plan::None,
            Deck::Base => Base::plan(index),
            Deck::Simple => Simple::plan(index),
            Deck::Tutorial => Tutorial::plan(index),
            // Deck::Enhanced => Enhanced::plan(index),
        }
    }

    #[inline]
    fn indexes(self: Deck, plan: Plan) -> Array<u8> {
        match self {
            Deck::None => array![],
            Deck::Base => Base::indexes(plan),
            Deck::Simple => Simple::indexes(plan),
            Deck::Tutorial => Tutorial::indexes(plan),
            // Deck::Enhanced => Enhanced::indexes(plan),
        }
    }

    #[inline]
    fn parameters(self: Deck, index: u32) -> (Orientation, u32, u32, Role, Spot) {
        match self {
            Deck::None => (Orientation::None, 0, 0, Role::None, Spot::None),
            Deck::Base => Base::parameters(index),
            Deck::Simple => Simple::parameters(index),
            Deck::Tutorial => Tutorial::parameters(index),
            // Deck::Enhanced => Enhanced::parameters(index),
        }
    }

    #[inline]
    fn tiles(self: Deck, mut tiles: u128, seed: felt252) -> u128 {
        match self {
            Deck::Simple => {
                let total_count: u128 = self.total_count().into();
                let mut to_removes = total_count - self.count().into();
                let mut index: u8 = 0;
                loop {
                    // [Check] Stop if nothing else to remove
                    if to_removes == 0 {
                        break tiles;
                    }
                    // [Check] Check if the tile is free, otherwise skip
                    let value = Bitmap::get_bit_at(tiles, index);
                    if value {
                        index += 1;
                        continue;
                    }
                    // [Check] Remove the tile from the deck with a dynamic probability
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
            _ => tiles,
        }
    }
}

impl DeckPartialEq of PartialEq<Deck> {
    #[inline]
    fn eq(lhs: @Deck, rhs: @Deck) -> bool {
        let felt: felt252 = (*lhs).into();
        felt == (*rhs).into()
    }

    #[inline]
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

    #[test]
    fn test_tiles() {
        let deck: Deck = Deck::Simple;
        let seed: felt252 = 0;
        let tiles: u128 = deck.tiles(0, seed);
        assert(tiles == 0x51cc75898dfe86a218, 'Deck: tiles');
    }
}

