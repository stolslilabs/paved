//! The deck walk of the spawn (`DeckTrait::tiles`), G1: its uniformity and its cost, before and
//! after.
//!
//! - `test_deck_walk_subsets_uniform`: the sampling itself on a small case, every subset counted:
//!   2 of 5 free indexes, 10 subsets, over 2,000 seeds; Pearson's chi-square against the uniform
//!   law (9 degrees of freedom) stays under 27.88, its 0.1 % critical value.
//! - `test_deck_walk_marginals`: the Daily deck after the starter tile, over 200 seeds (4,000 in
//!   `test_deck_walk_marginals_many`, by hand): each run removes exactly 34 of the 71 free indexes
//!   and keeps the starter's bit, and the removal counts of the 71 indexes pass a chi-square test
//!   against `p = 34/71` at 0.1 %.
//! - `test_deck_walk_cost`: the L2 gas of the walk alone, before G1 (`legacy_g1::tiles_before_g1`)
//!   and after, on the three seeds of `docs/measures/baseline.md` ("After D-23"), then on 10 seeds
//!   (before) and 100 seeds (after).

use core::dict::{Felt252Dict, Felt252DictTrait};
use core::hash::HashStateTrait;
use core::poseidon::PoseidonTrait;
use core::testing::get_available_gas;
use paved::helpers::random_deck::popcount;
use paved::tests::legacy_g1::tiles_before_g1;
use paved::types::deck::{Deck, DeckImpl, sample};
use paved::types::plan::Plan;

const RUNS: u32 = 2000;

/// The Daily deck's bitmap after the starter tile, as `Game::start` sets it.
fn starter() -> u128 {
    let mut indexes = Deck::Simple.indexes(Plan::RFFFRFCFR);
    let index: u8 = indexes.pop_front().unwrap();
    core::num::traits::Pow::pow(2_u128, index.into())
}

#[test]
fn test_deck_walk_subsets_uniform() {
    // [Setup] 5 indexes, bits 0 to 4, all free; 2 to remove: the 10 subsets of 2
    let full: u128 = 0x1f;
    let mut counts: Felt252Dict<u32> = Default::default();
    let mut run: u32 = 0;
    while run < RUNS {
        let tiles = sample(0, full, 5, 2, run.into());
        assert_eq!(popcount(tiles), 2);
        counts.insert(tiles.into(), counts.get(tiles.into()) + 1);
        run += 1;
    }
    // [Check] Pearson's chi-square over the 10 subsets, times 1000
    let expected: u32 = RUNS / 10;
    let mut chi: u32 = 0;
    let mut cells: u32 = 0;
    let mut tiles: u128 = 0;
    while tiles <= full {
        if popcount(tiles) == 2 {
            let count = counts.get(tiles.into());
            let gap = if count > expected {
                count - expected
            } else {
                expected - count
            };
            println!("DECK subset {} drawn {}", tiles, count);
            chi += gap * gap * 1000 / expected;
            cells += 1;
        }
        tiles += 1;
    }
    println!("DECK subsets chi2 x1000 {}", chi);
    assert_eq!(cells, 10);
    assert(chi < 27880, 'Deck: subsets not uniform');
}

/// Walks the Daily deck on `runs` seeds (`Poseidon('G1 marginals', run)`, starter out) and
/// returns the chi-square of the removal counts of the 71 free indexes, times 1000.
fn marginals(runs: u32) -> u128 {
    let deck = Deck::Simple;
    let start = starter();
    let mut counts: Felt252Dict<u32> = Default::default();
    let mut run: u32 = 0;
    while run < runs {
        let seed = PoseidonTrait::new().update('G1 marginals').update(run.into()).finalize();
        let tiles = deck.tiles(start, seed);
        // [Check] The starter stays out, and exactly 34 more leave: 38 tiles stay
        assert_eq!(tiles & start, start);
        assert_eq!(popcount(tiles), 35);
        // [Effect] Count the removed indexes, lowest first
        let mut removed = tiles - start;
        while removed != 0 {
            let lowest = removed & (~removed + 1);
            counts.insert(lowest.into(), counts.get(lowest.into()) + 1);
            removed -= lowest;
        }
        run += 1;
    }
    // [Check] Each free index is removed with probability p = 34/71 per run, independently from
    // run to run, so its count has variance `runs x p x (1 - p)`; with the 70 free cells of a
    // fixed sum, S = sum((c - runs x p)^2) / (runs x p x (1 - p)) follows about 71/70 x chi2(70):
    // its mean is 71 and its 0.1 % critical value 113.9. In integers:
    // S = sum((71 c - 34 runs)^2) / (runs x 34 x 37)
    let mut sum: u128 = 0;
    let mut mask: u128 = 1;
    let mut index: u8 = 0;
    while index < 72 {
        if mask != start {
            let count: u128 = counts.get(mask.into()).into();
            let count_71 = count * 71;
            let expected_71: u128 = runs.into() * 34;
            let gap = if count_71 > expected_71 {
                count_71 - expected_71
            } else {
                expected_71 - count_71
            };
            println!("DECK index {} removed {}", index, count);
            sum += gap * gap;
        }
        index += 1;
        mask *= 2;
    }
    let chi = sum * 1000 / (runs.into() * 34 * 37);
    println!("DECK marginals runs {} chi2 x1000 {}", runs, chi);
    chi
}

#[test]
fn test_deck_walk_marginals() {
    assert(marginals(200) < 113900, 'Deck: indexes not uniform');
}

/// The same on 4,000 seeds: by hand, past the VM's default step limit,
/// `snforge test paved::tests::deck_walk::test_deck_walk_marginals_many --ignored --max-n-steps
/// 1000000000`.
#[test]
#[ignore]
fn test_deck_walk_marginals_many() {
    assert(marginals(4000) < 113900, 'Deck: indexes not uniform');
}

/// The L2 gas of `walk` on `seed`.
fn cost(before_g1: bool, seed: felt252) -> u128 {
    let start = starter();
    let before = get_available_gas();
    let tiles = if before_g1 {
        tiles_before_g1(Deck::Simple, start, seed)
    } else {
        Deck::Simple.tiles(start, seed)
    };
    let after = get_available_gas();
    assert_eq!(popcount(tiles), 35);
    before - after
}

#[test]
fn test_deck_walk_cost() {
    let seeds = array![
        ('day seed of game 2', PoseidonTrait::new().update(0).update(0).finalize()),
        ('token seed of game 2', PoseidonTrait::new().update(0).update(2).finalize()),
        ('token seed of game 1', PoseidonTrait::new().update(0).update(1).finalize()),
    ];
    for (name, seed) in seeds {
        println!("DECK cost {} before {} after {}", name, cost(true, seed), cost(false, seed));
    }
    // [Info] The walk before G1 costs about 35M a seed: 10 seeds of it, 100 of the new one
    let mut run: u32 = 0;
    let mut old: u128 = 0;
    let mut new: u128 = 0;
    let mut worst: u128 = 0;
    while run < 100 {
        let seed = PoseidonTrait::new().update('G1').update(run.into()).finalize();
        if run < 10 {
            old += cost(true, seed);
        }
        let walk = cost(false, seed);
        new += walk;
        if walk > worst {
            worst = walk;
        }
        run += 1;
    }
    println!("DECK cost mean before (10 seeds) {} after (100 seeds) {}", old / 10, new / 100);
    println!("DECK cost worst after (100 seeds) {}", worst);
}
