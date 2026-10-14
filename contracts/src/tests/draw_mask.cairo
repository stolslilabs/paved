//! G5: the draw (`draw_from_bitmap`) against its frozen form before G5
//! (`legacy_g5::draw_from_bitmap_before_g5`): the same card and the same count left on every deck
//! and withdrawn set tried, and the cost of each.
//!
//! - `test_bit_at_is_the_power` and `test_popcount_is_the_old_one`: the two pieces G5 changed
//!   (the table of bits, the popcount summed by one product), against the power and the old
//!   popcount.
//! - `test_draw_same_small_decks_exhaustive`: every withdrawn set of the decks of 1 to 8 cards
//!   (all but the full one), two seeds each, and every set of the 10-card deck.
//! - `test_draw_same_simple_deck_counts_*`: the Simple deck (72 cards), every count of withdrawn
//!   cards from 0 to 71, pseudo-random sets, several seeds per count.
//! - `test_draw_same_simple_deck_last_card_*`: the 72-card deck with every card but one withdrawn,
//!   for each of the 72 cards left (the deck's last draw).
//! - `test_draw_same_whole_games`: whole decks drawn as `Game::draw_plan` draws them (the first
//!   draw on an empty bitmap, the last on a deck of one card), on 10 to 128 cards.
//! - `test_draw_same_big_deck`: 128 cards, the top bit and the whole width of the bitmap.
//! - `test_draw_cost`: the L2 gas of one draw before and after, on the Simple deck, by count of
//!   withdrawn cards (printed; `docs/measures/baseline.md`, "After G5").

use core::hash::HashStateTrait;
use core::num::traits::Pow;
use core::poseidon::PoseidonTrait;
use core::testing::get_available_gas;
use paved::helpers::random_deck::{bit_at, draw_from_bitmap, popcount};
use paved::tests::legacy_g5::{draw_from_bitmap_before_g5, popcount_before_g5};

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

fn assert_same(seed: felt252, number: u32, bitmap: u128) {
    let (card, remaining) = draw_from_bitmap_before_g5(seed, number, bitmap);
    let (got_card, got_remaining) = draw_from_bitmap(seed, number, bitmap);
    assert_eq!(got_card, card);
    assert_eq!(got_remaining, remaining);
}

/// Every count of withdrawn cards in `[from, to)` on the Simple deck, `seeds` sets each.
fn simple_deck_counts(from: u32, to: u32, seeds: u32) {
    let mut count = from;
    while count < to {
        let mut run: u32 = 0;
        while run < seeds {
            let seed = PoseidonTrait::new()
                .update('G5')
                .update(count.into())
                .update(run.into())
                .finalize();
            let bitmap = bitmap_of(seed, 72, count);
            assert_eq!(popcount(bitmap), count);
            assert_same(seed, 72, bitmap);
            run += 1;
        }
        count += 1;
    };
}

/// The 72-card deck with every card but `card` withdrawn, for each card in `[from, to]`.
fn simple_deck_last_card(from: u8, to: u8) {
    let full: u128 = 2_u128.pow(72) - 1;
    let mut card = from;
    while card <= to {
        let bitmap = full - 2_u128.pow((card - 1).into());
        let (got_card, got_remaining) = draw_from_bitmap(card.into(), 72, bitmap);
        assert_eq!(got_card, card);
        assert_eq!(got_remaining, 0);
        assert_same(card.into(), 72, bitmap);
        card += 1;
    };
}

/// Plays a whole deck as `Game::draw_plan` does (the bitmap grows with the drawn card, the seed is
/// re-hashed after each draw, the last draw empties the deck) and compares every draw.
fn play(seed: felt252, number: u32) {
    let mut seed = seed;
    let mut bitmap: u128 = 0;
    let mut count: felt252 = 0;
    loop {
        let (card, remaining) = draw_from_bitmap_before_g5(seed, number, bitmap);
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
fn test_bit_at_is_the_power() {
    let mut index: u8 = 0;
    while index < 128 {
        assert_eq!(bit_at(index), 2_u128.pow(index.into()));
        index += 1;
    };
}

#[test]
fn test_popcount_is_the_old_one() {
    let edges: Array<u128> = array![
        0, 1, 0xff, 0x80000000000000000000000000000000, 0xffffffffffffffffffffffffffffffff,
        0xfffffffffffffffffffffffffffffffe, 0x7fffffffffffffffffffffffffffffff,
        0xffffffffffffffffff, 0x51cc75898dfe86a218,
    ];
    for x in edges {
        assert_eq!(popcount(x), popcount_before_g5(x));
    }
    let mut run: felt252 = 0;
    while run != 500 {
        let random: u256 = PoseidonTrait::new().update('POPCOUNT').update(run).finalize().into();
        assert_eq!(popcount(random.low), popcount_before_g5(random.low));
        assert_eq!(popcount(random.high), popcount_before_g5(random.high));
        run += 1;
    };
}

#[test]
fn test_draw_same_small_decks_exhaustive() {
    let mut number: u32 = 1;
    while number <= 8 {
        let full: u128 = 2_u128.pow(number) - 1;
        let mut bitmap: u128 = 0;
        while bitmap < full {
            assert_same('SEED', number, bitmap);
            assert_same(bitmap.into(), number, bitmap);
            bitmap += 1;
        }
        number += 1;
    };
}

#[test]
fn test_draw_same_deck_of_10_exhaustive() {
    let mut bitmap: u128 = 0;
    while bitmap < 0x3ff {
        assert_same(bitmap.into(), 10, bitmap);
        bitmap += 1;
    };
}

#[test]
fn test_draw_same_simple_deck_counts_low() {
    // The first draw of a game sees 35 withdrawn (the starter and the 34 the spawn removes)
    simple_deck_counts(0, 36, 8);
}

#[test]
fn test_draw_same_simple_deck_counts_mid() {
    simple_deck_counts(36, 48, 6);
}

#[test]
fn test_draw_same_simple_deck_counts_late() {
    simple_deck_counts(48, 60, 4);
}

#[test]
fn test_draw_same_simple_deck_counts_high() {
    simple_deck_counts(60, 72, 3);
}

#[test]
fn test_draw_same_simple_deck_last_card_low() {
    simple_deck_last_card(1, 24);
}

#[test]
fn test_draw_same_simple_deck_last_card_mid() {
    simple_deck_last_card(25, 48);
}

#[test]
fn test_draw_same_simple_deck_last_card_high() {
    simple_deck_last_card(49, 72);
}

#[test]
fn test_draw_same_whole_games() {
    play('SEED', 10);
    play(0, 10);
    play(0xdeadbeef, 16);
    play('PAVED', 33);
    play('DAILY', 72);
    play(0xc0ffee, 72);
    play('G5', 72);
}

#[test]
fn test_draw_same_big_deck() {
    assert_same('A', 128, 0);
    assert_same('B', 128, bitmap_of('B', 128, 64));
    assert_same('C', 128, bitmap_of('C', 128, 100));
    assert_same('D', 128, bitmap_of('D', 128, 127));
    assert_same('E', 128, 0x7fffffffffffffffffffffffffffffff);
    assert_same('F', 128, 0xfffffffffffffffffffffffffffffffe);
    assert_same('G', 127, 0x80000000000000000000000000000000);
    // Bits above the deck are ignored by both
    assert_same('H', 10, 0xfffffc05);
    assert_same('I', 72, 0xffffffffff0000000000000000 | 0x1234);
}

/// The L2 gas of one draw, before G5 or now.
fn cost(before_g5: bool, seed: felt252, number: u32, bitmap: u128) -> u128 {
    let before = get_available_gas();
    if before_g5 {
        draw_from_bitmap_before_g5(seed, number, bitmap);
    } else {
        draw_from_bitmap(seed, number, bitmap);
    }
    let after = get_available_gas();
    before - after
}

#[test]
fn test_draw_cost() {
    // [Info] The Simple deck, 10 seeds per count of withdrawn cards
    draw_cost(array![0, 7, 14, 21, 28, 35, 41, 47, 53]);
}

#[test]
fn test_draw_cost_late() {
    draw_cost(array![59, 65]);
}

#[test]
fn test_draw_cost_last() {
    draw_cost(array![71]);
}

fn draw_cost(counts: Array<u32>) {
    for count in counts {
        let mut old: u128 = 0;
        let mut new: u128 = 0;
        let mut worst_old: u128 = 0;
        let mut worst_new: u128 = 0;
        let mut run: u32 = 0;
        while run < 10 {
            let seed = PoseidonTrait::new()
                .update('G5 cost')
                .update(count.into())
                .update(run.into())
                .finalize();
            let bitmap = bitmap_of(seed, 72, count);
            let o = cost(true, seed, 72, bitmap);
            let n = cost(false, seed, 72, bitmap);
            old += o;
            new += n;
            if o > worst_old {
                worst_old = o;
            }
            if n > worst_new {
                worst_new = n;
            }
            run += 1;
        }
        println!(
            "DRAW cost withdrawn {} mean before {} after {} worst before {} after {}",
            count,
            old / 10,
            new / 10,
            worst_old,
            worst_new,
        );
    };
}
