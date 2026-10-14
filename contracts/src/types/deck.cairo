// Core imports

use core::hash::HashStateTrait;
use core::num::traits::Pow;
use core::poseidon::{HashState, PoseidonTrait};
use paved::elements::decks::simple::DeckImpl as Simple;
use paved::helpers::random_deck::popcount;
use paved::types::orientation::Orientation;

// Internal imports

use paved::types::plan::Plan;

// Constants

pub const NONE: felt252 = 0;
/// The domain of the deck's hashes (G1).
pub const DECK_DOMAIN: felt252 = 'DECK';
/// The draws one lane gives: 10 draws on at most 72 values use under 2^62 of a lane of 2^123 or
/// more, so the draws are uniform up to a statistical distance below 2^-61 per lane (G1).
pub const LANE_DRAWS: u8 = 10;

pub mod errors {
    pub const DECK_TOO_SMALL: felt252 = 'Deck: too small';
}

// The u8 code of Simple stays 2 (1 was Base, used by Weekly; 3 was Tutorial, gone with D-21), so
// the codes do not shift. 1 and 3 stay reserved, never given to another deck (P-42): they read as
// `None`.

#[derive(Copy, Drop, Serde)]
pub enum Deck {
    None,
    Simple,
}

pub impl IntoDeckFelt252 of Into<Deck, felt252> {
    #[inline]
    fn into(self: Deck) -> felt252 {
        match self {
            Deck::None => NONE,
            Deck::Simple => 'SIMPLE',
        }
    }
}

pub impl IntoDeckU8 of Into<Deck, u8> {
    #[inline]
    fn into(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Simple => 2,
        }
    }
}

pub impl IntoDeck of Into<u8, Deck> {
    #[inline]
    fn into(self: u8) -> Deck {
        let deck: felt252 = self.into();
        match deck {
            0 => Deck::None,
            2 => Deck::Simple,
            _ => Deck::None,
        }
    }
}

#[generate_trait]
pub impl DeckImpl of DeckTrait {
    #[inline]
    fn total_count(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Simple => Simple::total_count(),
        }
    }

    #[inline]
    fn count(self: Deck) -> u8 {
        match self {
            Deck::None => 0,
            Deck::Simple => Simple::count(),
        }
    }

    #[inline]
    fn plan(self: Deck, index: u32) -> Plan {
        match self {
            Deck::None => Plan::None,
            Deck::Simple => Simple::plan(index),
        }
    }

    #[inline]
    fn indexes(self: Deck, plan: Plan) -> Array<u8> {
        match self {
            Deck::None => array![],
            Deck::Simple => Simple::indexes(plan),
        }
    }

    #[inline]
    fn parameters(self: Deck, index: u32) -> (Orientation, u32, u32) {
        match self {
            Deck::None => (Orientation::None, 0, 0),
            Deck::Simple => Simple::parameters(index),
        }
    }

    /// Removes `total_count() - count()` free tiles from `tiles` (set bits are out of the deck),
    /// so that the deck keeps `count()` tiles; returns the bitmap, which the draws then read.
    ///
    /// G1: selection sampling (Knuth, TAOCP 2, 3.4.2, algorithm S) over the free indexes, in
    /// order: a free index is removed when a draw uniform on `[0, free)` falls below `need`, where
    /// `free` counts the free indexes from this one on and `need` the tiles still to remove. Every
    /// subset of `need` free indexes is then equally likely. The draws are the digits of `lane` in
    /// the mixed radix of the successive `free`: a lane is one half of a Poseidon hash of the seed
    /// (`low`, then `high`), and gives `LANE_DRAWS` draws, so one hash serves `2 * LANE_DRAWS`
    /// free indexes instead of one. Once `need == free` every free index left goes, with no draw.
    fn tiles(self: Deck, tiles: u128, seed: felt252) -> u128 {
        match self {
            Deck::Simple => {
                let total_count = self.total_count();
                let full: u128 = Pow::pow(2_u128, total_count.into()) - 1;
                let free: u128 = total_count.into() - popcount(tiles & full).into();
                let need: u128 = (total_count - self.count()).into();
                sample(tiles, full, free, need, seed)
            },
            _ => tiles,
        }
    }
}

/// The selection sampling of `DeckTrait::tiles`: removes `need` of the `free` free indexes of
/// `tiles` (the clear bits under `full`).
/// Panics with `'Deck: too small'` when `need > free`, which cannot happen from the spawn (free 71,
/// need 34).
pub fn sample(mut tiles: u128, full: u128, mut free: u128, mut need: u128, seed: felt252) -> u128 {
    assert(need <= free, errors::DECK_TOO_SMALL);
    let mut mask: u128 = 1;
    let mut batch: felt252 = 0;
    let (mut lane, mut spare) = lanes(seed, batch);
    let mut spared = true;
    let mut left = LANE_DRAWS;
    loop {
        // [Check] Stop when nothing else is to be removed
        if need == 0 {
            break tiles;
        }
        // [Effect] Every free index left goes: the indexes from `mask` on
        if need == free {
            break tiles | (full - (mask - 1));
        }
        // [Check] A free index: draw on `[0, free)`
        if tiles & mask == 0 {
            if left == 0 {
                if spared {
                    lane = spare;
                    spared = false;
                } else {
                    batch += 1;
                    let (low, high) = lanes(seed, batch);
                    lane = low;
                    spare = high;
                    spared = true;
                }
                left = LANE_DRAWS;
            }
            let (quotient, draw) = DivRem::div_rem(lane, free.try_into().unwrap());
            lane = quotient;
            left -= 1;
            if draw < need {
                tiles = tiles | mask;
                need -= 1;
            }
            free -= 1;
        }
        mask *= 2;
    }
}

/// The two halves of the hash of batch `batch`: `Poseidon(seed, DECK_DOMAIN + batch)`. The domain
/// keeps these hashes apart from the reseeds of the draws (`Poseidon(seed, tile_count)`).
#[inline]
fn lanes(seed: felt252, batch: felt252) -> (u128, u128) {
    let state: HashState = PoseidonTrait::new();
    let state = state.update(seed);
    let state = state.update(DECK_DOMAIN + batch);
    let random: u256 = state.finalize().into();
    (random.low, random.high)
}

pub impl DeckPartialEq of PartialEq<Deck> {
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
pub mod tests {
    // Core imports

    // Local imports

    use super::{Deck, DeckImpl, NONE};

    // Constants

    pub const UNKNOWN_U8: u8 = 255;

    #[test]
    fn test_deck_into_felt() {
        assert('SIMPLE' == Deck::Simple.into(), 'Deck: into felt SIMPLE');
    }

    #[test]
    fn test_deck_into_u8() {
        assert(2_u8 == Deck::Simple.into(), 'Deck: into u8 SIMPLE');
    }

    #[test]
    fn test_u8_into_deck() {
        assert(Deck::Simple == 2_u8.into(), 'Deck: into deck SIMPLE');
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
        // [Info] G1: also given by an independent JavaScript implementation of the walk
        assert(tiles == 0xc88526b74cd8588fe4, 'Deck: tiles');
    }
}
