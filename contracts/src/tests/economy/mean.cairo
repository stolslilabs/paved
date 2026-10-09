//! The mean (P8 E2, `paved::economy::mean`): Nums' weighted EMA with the min score, the 4x clamp
//! and the push weight capped at the max weight; the day accumulator and the day's mean (option B);
//! the packing of both. Expected values are exact integers; `sim.py`'s float `Ema` gives the same
//! mean to the milli-point on a long sequence.

use paved::economy::mean::{
    Day, DayStorePacking, DayTrait, Ema, EmaStorePacking, EmaTrait, MAX_WEIGHT,
};
use starknet::storage_access::StorePacking;

#[test]
fn test_new_ema_has_the_initial_weight() {
    let ema = EmaTrait::new(3_353_000);
    assert_eq!(ema, Ema { sum: 335_300_000, weight: 100 });
    assert_eq!(ema.mean(), 3_353_000);
}

#[test]
#[should_panic(expected: ('Mean: below the min score',))]
fn test_new_ema_below_the_min_score_is_refused() {
    EmaTrait::new(99_999);
}

#[test]
fn test_scores_below_100_and_zero_weights_are_left_out() {
    let mut ema = EmaTrait::new(1_000_000);
    ema.push(99_999, 10);
    ema.push(0, 10);
    ema.push(2_000_000, 0);
    assert_eq!(ema, EmaTrait::new(1_000_000));
    ema.push(100_000, 1);
    assert_eq!(ema, Ema { sum: 100_100_000, weight: 101 });
}

#[test]
fn test_cumulative_below_the_max_weight() {
    let mut ema = EmaTrait::new(1_000_000);
    ema.push(2_000_000, 10);
    assert_eq!(ema, Ema { sum: 120_000_000, weight: 110 });
    assert_eq!(ema.mean(), 1_090_909);
}

#[test]
fn test_a_score_enters_at_most_as_4x_the_mean() {
    let mut ema = EmaTrait::new(1_000_000);
    ema.push(10_000_000, 1);
    assert_eq!(ema, Ema { sum: 104_000_000, weight: 101 });
    assert_eq!(ema.mean(), 1_029_702);
}

#[test]
fn test_a_push_across_the_max_weight_is_cumulative_then_an_ema_step() {
    let mut ema = EmaTrait::new(1_000_000);
    ema.push(1_000_000, 895);
    assert_eq!(ema, Ema { sum: 995_000_000, weight: 995 });
    // 5 of the 10 fill the cumulative phase, the other 5 are an EMA step
    ema.push(3_000_000, 10);
    assert_eq!(ema, Ema { sum: 1_019_950_000, weight: 1_000 });
}

#[test]
fn test_ema_step_is_the_weight_over_the_max_weight() {
    let mut ema = EmaTrait::new(1_000_000);
    ema.push(1_000_000, 900);
    // mean + 10 / 1,000 x (2,000,000 - mean)
    ema.push(2_000_000, 10);
    assert_eq!(ema, Ema { sum: 1_010_000_000, weight: MAX_WEIGHT });
    assert_eq!(ema.mean(), 1_010_000);
}

#[test]
fn test_a_push_weighs_at_most_the_max_weight() {
    let mut capped = EmaTrait::new(1_000_000);
    capped.push(1_000_000, 900);
    let mut full = capped;
    capped.push(3_000_000, 5_000);
    full.push(3_000_000, MAX_WEIGHT);
    assert_eq!(capped, full);
    // A full-weight push replaces the mean, it never overshoots it
    assert_eq!(capped.mean(), 3_000_000);
}

#[test]
fn test_ema_matches_sim_over_a_long_sequence() {
    // The same sequence through `sim.py`'s `Ema(3353, 100, 1000, 100)` with clamp 4 ends at
    // 5,821,906.16 milli-points.
    let mut ema = EmaTrait::new(3_353_000);
    let sequence: Array<(u64, u32)> = array![
        (3_000, 3), (12_000, 10), (50, 5), (4_100, 10), (2_500, 7), (9_000, 1), (800, 2),
    ];
    for _ in 0..40_u32 {
        for (score, weight) in sequence.span() {
            ema.push(*score * 1_000, *weight);
        }
    }
    assert_eq!(ema, Ema { sum: 5_821_906_325, weight: MAX_WEIGHT });
    assert_eq!(ema.mean(), 5_821_906);
}

#[test]
fn test_day_accumulates_clamped_scores_of_at_least_100() {
    let mut day = DayTrait::new(3_353_000);
    day.add(5_000, 1);
    day.add(2_000, 3);
    day.add(15_000, 10); // enters as 4 x 3,353
    day.add(50, 5); // left out
    day.add(3_400, 2);
    assert_eq!(day, Day { prior: 3_353_000, sum: 151_920_000, weight: 16 });
    // (100 x prior + sum) / (100 + weight)
    assert_eq!(day.mean(), 4_200_172);
    assert_eq!(day.average(), 9_495_000);
}

#[test]
fn test_a_day_without_games_has_the_prior_as_its_mean() {
    let mut day = DayTrait::new(3_353_000);
    day.add(99, 10);
    assert_eq!(day.mean(), 3_353_000);
    assert_eq!(day.average(), 0);
}

#[test]
fn test_packing_round_trips() {
    let ema = Ema { sum: 0xffffffffffffffffffffffffffffffff, weight: 0xffffffff };
    assert_eq!(EmaStorePacking::unpack(EmaStorePacking::pack(ema)), ema);
    let ema = Ema { sum: 5_821_906_325, weight: 1_000 };
    assert_eq!(EmaStorePacking::unpack(EmaStorePacking::pack(ema)), ema);
    let day = Day {
        prior: 0xffffffffffffffff, sum: 0xffffffffffffffffffffffffffffffff, weight: 0xffffffff,
    };
    assert_eq!(DayStorePacking::unpack(DayStorePacking::pack(day)), day);
    let day = Day { prior: 3_353_000, sum: 151_920_000, weight: 16 };
    assert_eq!(DayStorePacking::unpack(DayStorePacking::pack(day)), day);
}
