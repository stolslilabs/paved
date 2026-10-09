//! The arithmetic of `Economy` (P8 E2, `paved::economy::curve`): the split, `F` (#181's table),
//! the price guard and its rate, `R`, the threshold and `h`, the bounds of `configure`.

use paved::economy::curve::{
    MAX_FACTOR_BPS, RATE_SCALE, guarded, next_rate, payout, reference, split, supply_factor,
    threshold,
};
use paved::economy::economy::{Config, PAVED, decided, validate};

const USDC: u256 = 1_000_000;

// Split

#[test]
fn test_split_adds_up_to_the_price() {
    let mut stake: u256 = 1;
    while stake <= 10 {
        let price = stake * 2 * USDC;
        let (referral, quote, margin) = split(price, 7_000, false);
        assert_eq!((referral, quote, margin), (0, price * 7 / 10, price * 3 / 10));
        let (referral, quote, margin) = split(price, 7_000, true);
        assert_eq!((referral, quote, margin), (price / 20, price * 7 / 10, price / 4));
        assert_eq!(referral + quote + margin, price);
        stake += 1;
    }
}

#[test]
fn test_split_rounds_into_the_margin() {
    // 7 base units: the burn and the referral round down, the margin takes the rest
    let (referral, quote, margin) = split(7, 7_000, true);
    assert_eq!((referral, quote, margin), (0, 4, 3));
    let (referral, quote, margin) = split(39, 5_001, true);
    assert_eq!((referral, quote, margin), (1, 19, 19));
}

// F: #181's `compute_multiplier_fp` table, in basis points

#[test]
fn test_factor_is_2x_at_a_zero_supply() {
    assert_eq!(supply_factor(0, 1_000), 20_000);
}

#[test]
fn test_factor_is_1x_at_the_target() {
    assert_eq!(supply_factor(1_000, 1_000), 10_000);
}

#[test]
fn test_factor_is_0_at_twice_the_target_and_above() {
    assert_eq!(supply_factor(2_000, 1_000), 0);
    assert_eq!(supply_factor(5_000, 1_000), 0);
}

#[test]
fn test_factor_decreases_between_the_target_and_twice_it() {
    let near_target = supply_factor(1_100, 1_000);
    let middle = supply_factor(1_500, 1_000);
    let near_double = supply_factor(1_900, 1_000);
    assert_eq!((near_target, middle, near_double), (9_000, 5_000, 1_000));
}

#[test]
fn test_factor_is_linear_below_the_target() {
    assert_eq!(supply_factor(500, 1_000), 15_000);
    assert_eq!(supply_factor(1, 3), 16_666);
    assert!(supply_factor(0, 1) <= MAX_FACTOR_BPS);
}

#[test]
fn test_factor_on_the_paved_supply() {
    let target: u256 = 1_000_000 * PAVED.into();
    assert_eq!(supply_factor(target - 1_234 * PAVED.into(), target), 10_012);
    assert_eq!(supply_factor(target + 1_234 * PAVED.into(), target), 9_987);
}

#[test]
#[should_panic(expected: ('Curve: target is zero',))]
fn test_factor_reverts_on_a_zero_target() {
    supply_factor(1, 0);
}

// The price guard

#[test]
fn test_guard_counts_at_most_110_percent_of_the_rate() {
    let rate = 80 * RATE_SCALE; // 80 PAVED base units per USDC base unit
    assert_eq!(guarded(800, 10, rate), 800);
    assert_eq!(guarded(880, 10, rate), 880);
    assert_eq!(guarded(881, 10, rate), 880);
    assert_eq!(guarded(2_000, 10, rate), 880);
}

#[test]
fn test_guard_without_a_rate_counts_everything() {
    assert_eq!(guarded(2_000, 10, 0), 2_000);
}

#[test]
fn test_rate_is_set_by_the_first_purchase_then_moves_by_a_32nd() {
    let first = next_rate(0, 800, 10);
    assert_eq!(first, 80 * RATE_SCALE);
    // A purchase at twice the rate moves it by 1/32 of the gap
    assert_eq!(next_rate(first, 1_600, 10), 80 * RATE_SCALE + 80 * RATE_SCALE / 32);
    assert_eq!(next_rate(first, 800, 10), first);
}

// R

#[test]
fn test_reference_is_the_bought_times_the_boost_times_the_factor() {
    let bought: u256 = 1_000 * PAVED.into();
    assert_eq!(reference(bought, 1, 10_000), 1_010 * PAVED);
    assert_eq!(reference(bought, 10, 10_000), 1_100 * PAVED);
    assert_eq!(reference(bought, 10, 20_000), 2_200 * PAVED);
    assert_eq!(reference(bought, 3, 9_000), 927 * PAVED);
    assert_eq!(reference(bought, 3, 0), 0);
}

// The threshold and h

#[test]
fn test_threshold_is_the_shifted_mean() {
    assert_eq!(threshold(3_353_000, 0), 3_353_000);
    assert_eq!(threshold(3_353_000, -3_000), 2_347_100);
    assert_eq!(threshold(3_353_000, 5_000), 5_029_500);
    assert_eq!(threshold(1_001, 1), 1_001);
}

#[test]
#[should_panic(expected: ('Curve: mean is zero',))]
fn test_threshold_reverts_on_a_zero_mean() {
    threshold(0, 0);
}

#[test]
fn test_payout_is_zero_below_the_threshold() {
    let r: u128 = 1_000 * PAVED;
    assert_eq!(payout(r, 0, 3_000_000, 18_130, 5), 0);
    assert_eq!(payout(r, 2_999, 3_000_000, 18_130, 5), 0);
}

#[test]
fn test_payout_is_c_times_r_at_the_threshold() {
    let r: u128 = 1_000 * PAVED;
    assert_eq!(payout(r, 3_000, 3_000_000, 18_130, 5), 1_813 * PAVED);
}

#[test]
fn test_payout_is_linear_above_the_threshold() {
    let r: u128 = 1_000 * PAVED;
    // h = c x score / threshold = 1.813 x 4,500 / 3,000
    assert_eq!(payout(r, 4_500, 3_000_000, 18_130, 5), 2_719_500_000_000_000_000_000);
    // A threshold that is not a whole number of points: 1.813 x 4,000 / 3,353.5
    assert_eq!(payout(r, 4_000, 3_353_500, 18_130, 5), 2_162_516_773_520_202_773_222);
}

#[test]
fn test_payout_is_capped_at_h_times_r() {
    let r: u128 = 1_000 * PAVED;
    assert_eq!(payout(r, 8_274, 3_000_000, 18_130, 5), 5_000 * PAVED);
    assert_eq!(payout(r, 100_000, 3_000_000, 18_130, 5), 5_000 * PAVED);
    assert_eq!(payout(r, 8_273, 3_000_000, 18_130, 5), 4_999_649_666_666_666_666_666);
}

#[test]
fn test_payout_of_a_huge_reference_does_not_overflow() {
    let r: u128 = 100_000_000 * PAVED;
    assert_eq!(payout(r, 4_000_000_000, 100_000, 50_000, 20), 2_000_000_000 * PAVED);
}

// The bounds of `configure`

fn with(burn_bps: u16, sigma_bps: i16, slope_bps: u32, cap: u8, target: u128) -> Config {
    Config { burn_bps, sigma_bps, slope_bps, cap, target }
}

#[test]
fn test_decided_config_and_both_ends_of_every_bound_are_valid() {
    validate(decided());
    validate(with(5_000, -3_000, 1_000, 1, 100_000 * PAVED));
    validate(with(9_000, 5_000, 50_000, 20, 10_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: burn out of bounds',))]
fn test_burn_below_its_bound_is_refused() {
    validate(with(4_999, 0, 18_130, 5, 1_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: burn out of bounds',))]
fn test_burn_above_its_bound_is_refused() {
    validate(with(9_001, 0, 18_130, 5, 1_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: sigma out of bounds',))]
fn test_sigma_below_its_bound_is_refused() {
    validate(with(7_000, -3_001, 18_130, 5, 1_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: sigma out of bounds',))]
fn test_sigma_above_its_bound_is_refused() {
    validate(with(7_000, 5_001, 18_130, 5, 1_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: slope out of bounds',))]
fn test_slope_below_its_bound_is_refused() {
    validate(with(7_000, 0, 999, 5, 1_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: slope out of bounds',))]
fn test_slope_above_its_bound_is_refused() {
    validate(with(7_000, 0, 50_001, 5, 1_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: cap out of bounds',))]
fn test_cap_of_zero_is_refused() {
    validate(with(7_000, 0, 18_130, 0, 1_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: cap out of bounds',))]
fn test_cap_above_its_bound_is_refused() {
    validate(with(7_000, 0, 18_130, 21, 1_000_000 * PAVED));
}

#[test]
#[should_panic(expected: ('Economy: target out of bounds',))]
fn test_target_below_its_bound_is_refused() {
    validate(with(7_000, 0, 18_130, 5, 100_000 * PAVED - 1));
}

#[test]
#[should_panic(expected: ('Economy: target out of bounds',))]
fn test_target_above_its_bound_is_refused() {
    validate(with(7_000, 0, 18_130, 5, 10_000_000 * PAVED + 1));
}
