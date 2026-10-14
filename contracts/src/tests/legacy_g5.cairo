//! The draw before G5 (main at deb2845b), frozen as the reference of `draw_mask.cairo`.
//!
//! G5 changed `slot_card` (`helpers/random_deck.cairo`), which computed the bit of each card it
//! stepped over with a 128-bit power, and `popcount`, which summed its byte counts with four shifts
//! and adds. Their bodies at deb2845b are kept here as `slot_card_before_g5` and
//! `popcount_before_g5`, and `draw_from_bitmap` as `draw_from_bitmap_before_g5`, so the new draw
//! is compared with the old one on any deck and any withdrawn set, and their costs side by side.

use core::hash::HashStateTrait;
use core::num::traits::Pow;
use core::poseidon::PoseidonTrait;
use paved::helpers::random_deck::errors;

const TWO_POW_64: u128 = 0x10000000000000000;
const M1: u128 = 0x55555555555555555555555555555555;
const M2: u128 = 0x33333333333333333333333333333333;
const M4: u128 = 0x0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f;

/// The number of bits set in `x`.
pub fn popcount_before_g5(x: u128) -> u32 {
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
fn slot_card_before_g5(bitmap: u128, number: u32, slot: u8, tau: u32) -> u8 {
    let mut card: u8 = slot;
    loop {
        // Card `c` is the bit `c - 1`; `bit - 1 + bit` is the mask of the bits up to it
        let bit: u128 = 2_u128.pow((card - 1).into());
        if bitmap & bit == 0 {
            break;
        }
        let rank = popcount_before_g5(bitmap & (bit - 1 + bit));
        if rank >= tau {
            break;
        }
        card = slot_card_before_g5(bitmap, number, (number - rank + 1).try_into().unwrap(), rank);
    }
    card
}

/// Returns the card, and the number of cards left once it is drawn, that
/// `DeckTrait::from_bitmap(seed, number, bitmap)` then `draw()` return.
pub fn draw_from_bitmap_before_g5(seed: felt252, number: u32, bitmap: u128) -> (u8, u32) {
    assert(number <= 128, errors::TOO_MANY_CARDS);
    // Only the cards of the deck are read, as `from_bitmap` does
    let bitmap = if number == 128 {
        bitmap
    } else {
        bitmap & (2_u128.pow(number) - 1)
    };
    let withdrawn = popcount_before_g5(bitmap);
    let remaining = number - withdrawn;
    assert(remaining > 0, errors::NO_CARDS_LEFT);
    let mut state = PoseidonTrait::new();
    state = state.update(seed);
    state = state.update(0);
    state = state.update(remaining.into());
    let random: u256 = state.finalize().into();
    let key: u8 = (random % remaining.into() + 1).try_into().unwrap();
    (slot_card_before_g5(bitmap, number, key, withdrawn + 1), remaining - 1)
}
