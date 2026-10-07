// Copied from origami_random (crate `random`, file `src/deck.cairo`), git tag v1.7.0, commit
// 1ddafcb8c33fe9697c4a44e0557967026d4eeba8 of https://github.com/dojoengine/origami, to drop the
// git dependency (phase P2). The code is unchanged, so the draws and the golden games are too.
// Licence of the source, reproduced as it requires:
//
// MIT License
//
// Copyright (c) 2023 Dojo
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

//! Deck struct and random card drawing methods.

// Core imports

use core::dict::{Felt252Dict, Felt252DictTrait};
use core::hash::HashStateTrait;
use core::num::traits::Pow;
use core::poseidon::PoseidonTrait;

// Constants

const TWO_POW_1: u128 = 0x2;
const MASK_1: u128 = 0x1;


/// Deck struct.
#[derive(Destruct)]
pub struct Deck {
    pub seed: felt252,
    pub keys: Felt252Dict<felt252>,
    pub cards: Felt252Dict<u8>,
    pub remaining: u32,
    pub nonce: u8,
}

/// Errors module.
pub mod errors {
    pub const NO_CARDS_LEFT: felt252 = 'Deck: no cards left';
    pub const TOO_MANY_CARDS: felt252 = 'Deck: too many cards';
}

/// Trait to initialize, draw and discard a card from the Deck.
pub trait DeckTrait {
    /// Returns a new `Deck` struct.
    /// # Arguments
    /// * `seed` - A seed to initialize the deck.
    /// * `number` - The initial number of cards.
    /// # Returns
    /// * The initialized `Deck`.
    fn new(seed: felt252, number: u32) -> Deck;
    /// Returns a new `Deck` struct setup with a bitmap.
    /// # Arguments
    /// * `seed` - A seed to initialize the deck.
    /// * `number` - The initial number of cards (must be below u128).
    /// * `bitmap` - The bitmap, each bit is a card with: 0/1 is in/out (so a null bitmap will
    /// create a `new` deck).
    /// # Returns
    /// * The initialized `Deck`.
    fn from_bitmap(seed: felt252, number: u32, bitmap: u128) -> Deck;
    /// Returns a card type after a draw.
    /// # Arguments
    /// * `self` - The Deck.
    /// # Returns
    /// * The card type.
    fn draw(ref self: Deck) -> u8;
    /// Returns a card into the deck, the card becomes drawable.
    /// # Arguments
    /// * `self` - The Deck.
    /// * `card` - The card to discard.
    fn discard(ref self: Deck, card: u8);
    /// Withdraw a card from the deck, the card is not drawable anymore.
    /// # Arguments
    /// * `self` - The Deck.
    /// * `card` - The card to withdraw.
    fn withdraw(ref self: Deck, card: u8);
    /// Remove the cards from the deck, they are not drawable anymore.
    /// # Arguments
    /// * `self` - The Deck.
    /// * `cards` - The card to set.
    fn remove(ref self: Deck, cards: Span<u8>);
}

/// Implementation of the `DeckTrait` trait for the `Deck` struct.
pub impl DeckImpl of DeckTrait {
    #[inline(always)]
    fn new(seed: felt252, number: u32) -> Deck {
        Deck {
            seed, cards: Default::default(), keys: Default::default(), remaining: number, nonce: 0,
        }
    }

    fn from_bitmap(seed: felt252, number: u32, mut bitmap: u128) -> Deck {
        assert(number <= 128, errors::TOO_MANY_CARDS);
        let mut deck = Self::new(seed, number);
        let mut card: u8 = 1;
        loop {
            if bitmap == 0 || card.into() > number {
                break;
            }
            if bitmap & MASK_1 == 1 {
                deck.withdraw(card);
            }
            bitmap /= TWO_POW_1;
            card += 1;
        }
        deck
    }

    #[inline(always)]
    fn draw(ref self: Deck) -> u8 {
        // [Check] Enough cards left.
        assert(self.remaining > 0, errors::NO_CARDS_LEFT);
        // [Compute] Draw a random card from remainingcs cards.
        let mut state = PoseidonTrait::new();
        state = state.update(self.seed);
        state = state.update(self.nonce.into());
        state = state.update(self.remaining.into());
        let random: u256 = state.finalize().into();

        let key: felt252 = (random % self.remaining.into() + 1).try_into().unwrap();
        let mut card: u8 = self.cards.get(key);
        if 0 == card.into() {
            card = key.try_into().unwrap();
        }

        // [Compute] Remove card from the deck.
        self.withdraw(card);
        self.nonce += 1;
        card
    }

    #[inline(always)]
    fn discard(ref self: Deck, card: u8) {
        self.remaining += 1;
        self.cards.insert(self.remaining.into(), card);
    }

    #[inline(always)]
    fn withdraw(ref self: Deck, card: u8) {
        let mut key = self.keys.get(card.into());
        if key == 0 {
            key = card.into();
        }
        let latest_key: felt252 = self.remaining.into();
        if latest_key != key {
            let mut latest_card: u8 = self.cards.get(latest_key);
            if latest_card == 0 {
                latest_card = latest_key.try_into().unwrap();
            }
            self.cards.insert(key, latest_card);
            self.keys.insert(latest_card.into(), key);
        }
        self.remaining -= 1;
    }

    fn remove(ref self: Deck, mut cards: Span<u8>) {
        loop {
            match cards.pop_front() {
                Option::Some(card) => { self.withdraw(*card); },
                Option::None => { break; },
            };
        };
    }
}

// Same-draw shortcut (P-17).
//
// `Deck::from_bitmap(seed, number, bitmap)` followed by `draw()` rebuilds the whole deck with
// one `withdraw` (several dictionary reads and writes) per withdrawn card, to read one slot. The
// functions below compute that slot straight from the bitmap and return the same card.
//
// The deck is an array of slots 1..=number, slot `k` holding card `k`. Withdrawing the cards in
// ascending order, each withdrawal moves the card of the last slot into the slot of the
// withdrawn card, then drops the last slot. So, with `t` the 1-based rank of a withdrawal
// (the count of withdrawn cards up to and including it), the last slot before it is
// `number - t + 1`, and the slot `q` after the withdrawals of rank below `tau` holds: `q` if
// card `q` is not withdrawn at a rank below `tau`; otherwise what the last slot held just before
// that withdrawal (which may be withdrawn later, then the same rule applies again).

const TWO_POW_64: u128 = 0x10000000000000000;
const M1: u128 = 0x55555555555555555555555555555555;
const M2: u128 = 0x33333333333333333333333333333333;
const M4: u128 = 0x0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f;

/// The number of bits set in `x`.
#[inline]
fn popcount(x: u128) -> u32 {
    let x = x - ((x / 2) & M1);
    let x = (x & M2) + ((x / 4) & M2);
    let x = (x + x / 16) & M4;
    let x = x + x / 256;
    let x = x + x / 65536;
    let x = x + x / 4294967296;
    let x = x + x / TWO_POW_64;
    (x & 0xff).try_into().unwrap()
}

/// The card in slot `slot` once the withdrawals of rank below `tau` are done.
fn slot_card(bitmap: u128, number: u32, slot: u8, tau: u32) -> u8 {
    let mut card: u8 = slot;
    loop {
        // Card `c` is the bit `c - 1`; `bit - 1 + bit` is the mask of the bits up to it
        let bit: u128 = 2_u128.pow((card - 1).into());
        if bitmap & bit == 0 {
            break;
        }
        let rank = popcount(bitmap & (bit - 1 + bit));
        if rank >= tau {
            break;
        }
        card = slot_card(bitmap, number, (number - rank + 1).try_into().unwrap(), rank);
    }
    card
}

/// Returns the card, and the number of cards left once it is drawn, that
/// `DeckTrait::from_bitmap(seed, number, bitmap)` then `draw()` return.
pub fn draw_from_bitmap(seed: felt252, number: u32, bitmap: u128) -> (u8, u32) {
    assert(number <= 128, errors::TOO_MANY_CARDS);
    // Only the cards of the deck are read, as `from_bitmap` does
    let bitmap = if number == 128 {
        bitmap
    } else {
        bitmap & (2_u128.pow(number) - 1)
    };
    let withdrawn = popcount(bitmap);
    let remaining = number - withdrawn;
    assert(remaining > 0, errors::NO_CARDS_LEFT);
    let mut state = PoseidonTrait::new();
    state = state.update(seed);
    state = state.update(0);
    state = state.update(remaining.into());
    let random: u256 = state.finalize().into();
    let key: u8 = (random % remaining.into() + 1).try_into().unwrap();
    (slot_card(bitmap, number, key, withdrawn + 1), remaining - 1)
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::hash::HashStateTrait;

    // Local imports

    use core::num::traits::Pow;
    use core::poseidon::PoseidonTrait;
    use super::{DeckTrait, draw_from_bitmap, popcount};

    // Constants

    const DECK_CARDS_NUMBER: u32 = 5;
    const DECK_SEED: felt252 = 'SEED';

    #[test]
    fn test_deck_new_draw() {
        let mut deck = DeckTrait::new(DECK_SEED, DECK_CARDS_NUMBER);
        assert(deck.remaining == DECK_CARDS_NUMBER, 'Wrong remaining');
        assert(deck.draw() == 0x2, 'Wrong card 01');
        assert(deck.draw() == 0x4, 'Wrong card 02');
        assert(deck.draw() == 0x1, 'Wrong card 03');
        assert(deck.draw() == 0x5, 'Wrong card 04');
        assert(deck.draw() == 0x3, 'Wrong card 05');
        assert(deck.remaining == 0, 'Wrong remaining');
    }

    #[test]
    fn test_deck_from_bitmap() {
        let bitmap: u128 = 0 * 0x10 + 0 * 0x8 + 1 * 0x4 + 0 * 0x2 + 0 * 0x1;
        let mut deck = DeckTrait::from_bitmap(DECK_SEED, DECK_CARDS_NUMBER, bitmap);
        assert(deck.remaining == DECK_CARDS_NUMBER - 1, 'Wrong remaining');
        assert(deck.draw() == 0x5, 'Wrong card 01');
        assert(deck.draw() == 0x1, 'Wrong card 02');
        assert(deck.draw() == 0x2, 'Wrong card 03');
        assert(deck.draw() == 0x4, 'Wrong card 04');
        assert(deck.remaining == 0, 'Wrong remaining');
    }

    #[test]
    fn test_deck_new_withdraw() {
        let mut deck = DeckTrait::new(DECK_SEED, DECK_CARDS_NUMBER);
        deck.withdraw(0x2);
        assert(deck.draw() == 0x3, 'Wrong card 01');
        assert(deck.draw() == 0x1, 'Wrong card 02');
        assert(deck.draw() == 0x5, 'Wrong card 03');
        assert(deck.draw() == 0x4, 'Wrong card 04');
        assert(deck.remaining == 0, 'Wrong remaining');
    }

    #[test]
    #[should_panic(expected: ('Deck: no cards left',))]
    fn test_deck_new_draw_revert_no_card_left() {
        let mut deck = DeckTrait::new(DECK_SEED, DECK_CARDS_NUMBER);
        deck.remaining = 0;
        deck.draw();
    }

    #[test]
    fn test_deck_new_discard() {
        let mut deck = DeckTrait::new(DECK_SEED, DECK_CARDS_NUMBER);
        loop {
            if deck.remaining == 0 {
                break;
            }
            deck.draw();
        }
        let card: u8 = 0x11;
        deck.discard(card);
        assert(deck.draw() == card, 'Wrong card');
    }

    #[test]
    fn test_deck_new_remove() {
        let mut deck = DeckTrait::new(DECK_SEED, DECK_CARDS_NUMBER);
        let mut cards: Array<u8> = array![];
        let mut card: u8 = 1;
        loop {
            if card.into() > DECK_CARDS_NUMBER {
                break;
            }
            cards.append(card);
            card += 1;
        }
        deck.remove(cards.span());
        let card: u8 = 0x11;
        deck.discard(card);
        assert(deck.draw() == card, 'Wrong card');
    }
    // Same-draw shortcut (P-17): `draw_from_bitmap` against the reference, `from_bitmap` then
    // `draw`.

    fn reference(seed: felt252, number: u32, bitmap: u128) -> (u8, u32) {
        let mut deck = DeckTrait::from_bitmap(seed, number, bitmap);
        let card = deck.draw();
        (card, deck.remaining)
    }

    fn assert_same(seed: felt252, number: u32, bitmap: u128) {
        let (card, remaining) = reference(seed, number, bitmap);
        let (got_card, got_remaining) = draw_from_bitmap(seed, number, bitmap);
        assert_eq!(got_card, card);
        assert_eq!(got_remaining, remaining);
    }

    /// A pseudo-random bitmap of `number` bits with `count` bits set.
    fn bitmap_of(seed: felt252, number: u32, count: u32) -> u128 {
        let mut bitmap: u128 = 0;
        let mut set: u32 = 0;
        let mut round: felt252 = 0;
        while set < count {
            let state = PoseidonTrait::new().update(seed).update(round);
            let random: u256 = state.finalize().into();
            let index: u32 = (random % number.into()).try_into().unwrap();
            let bit: u128 = 2_u128.pow(index.into());
            if bitmap & bit == 0 {
                bitmap = bitmap | bit;
                set += 1;
            }
            round += 1;
        }
        bitmap
    }

    /// Plays a whole deck as `Game::draw_plan` does (the bitmap grows with the drawn card, the
    /// seed is re-hashed after each draw, the last draw empties the deck) and compares every draw.
    fn play(seed: felt252, number: u32) {
        let mut seed = seed;
        let mut bitmap: u128 = 0;
        let mut count: felt252 = 0;
        loop {
            let (card, remaining) = reference(seed, number, bitmap);
            let (got_card, got_remaining) = draw_from_bitmap(seed, number, bitmap);
            assert_eq!(got_card, card);
            assert_eq!(got_remaining, remaining);
            count += 1;
            if remaining == 0 {
                break;
            }
            bitmap = bitmap | 2_u128.pow((card - 1).into());
            seed = PoseidonTrait::new().update(seed).update(count).finalize();
        };
    }

    #[test]
    fn test_popcount() {
        assert_eq!(popcount(0), 0);
        assert_eq!(popcount(1), 1);
        assert_eq!(popcount(0xff), 8);
        assert_eq!(popcount(0x80000000000000000000000000000001), 2);
        assert_eq!(popcount(0xffffffffffffffffffffffffffffffff), 128);
        assert_eq!(popcount(0x51cc75898dfe86a218), 34);
    }

    #[test]
    fn test_draw_from_bitmap_exhaustive_small() {
        // Every bitmap but the full one, decks of 1 to 8 cards, two seeds
        let mut number: u32 = 1;
        while number <= 8 {
            let full: u128 = 2_u128.pow(number) - 1;
            let mut bitmap: u128 = 0;
            while bitmap < full {
                assert_same('SEED', number, bitmap);
                assert_same(0x1234567, number, bitmap);
                bitmap += 1;
            }
            number += 1;
        };
    }

    #[test]
    fn test_draw_from_bitmap_exhaustive_tutorial_size() {
        // The Tutorial deck has 10 cards: every bitmap but the full one
        let mut bitmap: u128 = 0;
        while bitmap < 0x3ff {
            assert_same(bitmap.into(), 10, bitmap);
            bitmap += 1;
        };
    }

    #[test]
    fn test_draw_from_bitmap_sequences() {
        // Whole games, the last tiles of the deck included
        play('SEED', 10);
        play(0, 10);
        play(0xdeadbeef, 16);
        play('PAVED', 33);
    }

    #[test]
    fn test_draw_from_bitmap_simple_deck_games() {
        // Whole games on the Simple deck size (72), two seeds per test run
        play('DAILY', 72);
        play(0xc0ffee, 72);
    }

    #[test]
    fn test_draw_from_bitmap_simple_deck_states() {
        // Pseudo-random states of the 72-card deck, from 0 to 71 cards withdrawn, the last one
        // and the first few included
        let mut count: u32 = 0;
        while count < 72 {
            let seed: felt252 = (1000 + count).into();
            assert_same(seed, 72, bitmap_of(seed, 72, count));
            count += 3;
        }
        assert_same('LAST', 72, bitmap_of('LAST', 72, 71));
        assert_same('FIRST', 72, 0);
    }

    #[test]
    fn test_draw_from_bitmap_big_deck_states() {
        // 128 cards: the top bit and the whole width of the bitmap
        assert_same('A', 128, 0);
        assert_same('B', 128, bitmap_of('B', 128, 64));
        assert_same('C', 128, bitmap_of('C', 128, 100));
        assert_same('D', 128, bitmap_of('D', 128, 127));
        assert_same('E', 128, 0x7fffffffffffffffffffffffffffffff);
        assert_same('F', 128, 0xfffffffffffffffffffffffffffffffe);
        assert_same('G', 127, 0x80000000000000000000000000000000);
    }

    #[test]
    fn test_draw_from_bitmap_ignores_bits_over_the_deck() {
        assert_same('H', 10, 0xfffffc05);
        assert_same('I', 72, 0xffffffffff0000000000000000 | 0x1234);
    }

    #[test]
    #[should_panic(expected: ('Deck: no cards left',))]
    fn test_draw_from_bitmap_revert_no_card_left() {
        draw_from_bitmap('SEED', 10, 0x3ff);
    }

    #[test]
    #[should_panic(expected: ('Deck: too many cards',))]
    fn test_draw_from_bitmap_revert_too_many_cards() {
        draw_from_bitmap('SEED', 129, 0);
    }
}
