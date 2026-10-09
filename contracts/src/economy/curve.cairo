//! The pure arithmetic of a purchase and of a reward (P8, `docs/architecture/economy.md`,
//! sections 1 and 2, P-31): the split of the price, the supply factor `F`, the reference reward
//! `R` with its price guard, and the curve `h` with its cliff. No storage, no call: every function
//! is unit tested against the formulas of the design.

// Constants

/// 100 % in basis points.
pub const BPS: u32 = 10_000;
/// The referrer's share of the price, out of the margin (D-10, P-31).
pub const REFERRAL_BPS: u32 = 500;
/// `F` is clamped to [0, 2x], in basis points.
pub const MAX_FACTOR_BPS: u32 = 20_000;
/// Scale of the swap rate (PAVED base units per USDC base unit).
pub const RATE_SCALE: u256 = 1_000_000_000_000_000_000;
/// The price guard: a purchase's `R` counts at most 110 % of `q x rate`.
pub const GUARD_BPS: u32 = 11_000;
/// The swap rate's EMA moves by 1/32 of the gap per purchase.
pub const RATE_STEP: u256 = 32;

pub mod errors {
    pub const TARGET_ZERO: felt252 = 'Curve: target is zero';
    pub const MEAN_ZERO: felt252 = 'Curve: mean is zero';
    pub const OVERFLOW: felt252 = 'Curve: overflow';
}

/// Where a price goes: `(referral, burn_quote, margin)`, adding up to `price` exactly. The referral
/// is 5 % when the purchase has a referrer, the burn quote `burn_bps` of the price, and the margin
/// the rest.
pub fn split(price: u256, burn_bps: u16, referred: bool) -> (u256, u256, u256) {
    let referral = if referred {
        price * REFERRAL_BPS.into() / BPS.into()
    } else {
        0
    };
    let quote = price * burn_bps.into() / BPS.into();
    (referral, quote, price - quote - referral)
}

/// Nums' supply factor (#181's `compute_multiplier_fp`, in basis points): 2x at a supply of 0, 1x
/// at the target, 0 at twice the target and above, linear in between. Reverts on a target of 0.
pub fn supply_factor(supply: u256, target: u256) -> u32 {
    assert(target != 0, errors::TARGET_ZERO);
    let double = target * 2;
    if supply >= double {
        return 0;
    }
    let factor = (double - supply) * BPS.into() / target;
    if factor > MAX_FACTOR_BPS.into() {
        return MAX_FACTOR_BPS;
    }
    factor.try_into().unwrap()
}

/// The PAVED a purchase counts for its reward: what it bought, at most 110 % of `quote x rate`
/// (the price guard, section 5). A zero rate (no guard) counts the whole purchase.
pub fn guarded(bought: u256, quote: u256, rate: u256) -> u256 {
    if rate == 0 {
        return bought;
    }
    let cap = quote * rate * GUARD_BPS.into() / (BPS.into() * RATE_SCALE);
    if bought < cap {
        bought
    } else {
        cap
    }
}

/// The swap rate's EMA after one purchase that bought `bought` PAVED for `quote` USDC. The
/// observation is clamped to [rate x 10/11, rate x 11/10], so one purchase moves the rate by at
/// most 1/32 of 10 %, in either direction. A zero rate is set by the observation.
pub fn next_rate(rate: u256, bought: u256, quote: u256) -> u256 {
    let observed = bought * RATE_SCALE / quote;
    if rate == 0 {
        return observed;
    }
    let low = rate * BPS.into() / GUARD_BPS.into();
    let high = rate * GUARD_BPS.into() / BPS.into();
    let observed = if observed < low {
        low
    } else if observed > high {
        high
    } else {
        observed
    };
    (rate * (RATE_STEP - 1) + observed) / RATE_STEP
}

/// The reference reward `R = b' x (10_000 + 100 k) / 10_000 x F / 10_000`: the guarded PAVED
/// bought, times Glitchbomb's stake boost `1 + k / 100`, times the supply factor.
pub fn reference(counted: u256, stake: u8, factor_bps: u32) -> u128 {
    let boost: u256 = BPS.into() + 100 * stake.into();
    let value = counted * boost / BPS.into() * factor_bps.into() / BPS.into();
    value.try_into().expect(errors::OVERFLOW)
}

/// The cliff, in points x 1,000: `mean x (10_000 + sigma) / 10_000`.
pub fn threshold(mean: u64, sigma_bps: i16) -> u64 {
    assert(mean != 0, errors::MEAN_ZERO);
    let shift: i32 = BPS.try_into().unwrap() + sigma_bps.into();
    let shift: u128 = shift.try_into().unwrap();
    let value = mean.into() * shift / BPS.into();
    value.try_into().unwrap()
}

/// The reward of a game, `R x h(score / mean)`: 0 below the threshold (the whole stake is lost),
/// else `R x c x score / threshold`, capped at `R x H`. `threshold` in points x 1,000, `slope_bps`
/// is `c` in basis points, `cap` is `H`.
pub fn payout(reference: u128, score: u32, threshold: u64, slope_bps: u32, cap: u8) -> u128 {
    let score: u256 = score.into() * 1_000;
    if score < threshold.into() {
        return 0;
    }
    let reference: u256 = reference.into();
    let linear = reference * slope_bps.into() * score / (threshold.into() * BPS.into());
    let ceiling = reference * cap.into();
    let value = if linear < ceiling {
        linear
    } else {
        ceiling
    };
    value.try_into().expect(errors::OVERFLOW)
}
