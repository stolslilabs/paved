//! The mean score the curve compares a game to (P8, `docs/architecture/economy.md`, section 2,
//! P-31): Nums' weighted EMA, and the day accumulator of option B.
//!
//! Units: a score is in points, a mean in points x 1,000 (`SCALE`), a weight is a stake (1 to 10).
//!
//! - `Ema`: cumulative while its weight is under `MAX_WEIGHT`, then an EMA of step `w /
//! MAX_WEIGHT`;
//!   a score under `MIN_SCORE` is left out, a score enters at most as `CLAMP x mean`, and a push
//!   weighs at most `MAX_WEIGHT` (a whole day can weigh more). No setter: only pushes move it.
//! - `Day`: the prior (the EMA at the day's first purchase), then `sum k x min(score, CLAMP x
//!   prior)` and `sum k` over the day's games recorded within the day with a score of at least
//!   `MIN_SCORE`. The day's mean blends them with the prior at weight `PRIOR_WEIGHT`.

// Constants

/// A mean is in points x 1,000.
pub const SCALE: u64 = 1_000;
/// Scores under 100 points never enter a mean.
pub const MIN_SCORE: u32 = 100;
/// The weight of the initial mean.
pub const INITIAL_WEIGHT: u32 = 100;
/// The weight at which the EMA stops being cumulative, and the most one push weighs.
pub const MAX_WEIGHT: u32 = 1_000;
/// A score enters a mean at most as 4 x that mean.
pub const CLAMP: u64 = 4;
/// The weight of the prior in a day's mean.
pub const PRIOR_WEIGHT: u32 = 100;

const TWO_POW_32: u256 = 0x100000000;
const TWO_POW_64: u256 = 0x10000000000000000;
const TWO_POW_128: u256 = 0x100000000000000000000000000000000;

pub mod errors {
    pub const MEAN_TOO_LOW: felt252 = 'Mean: below the min score';
}

/// Nums' weighted EMA: `sum` is the sum of `score x weight` (points x 1,000), `weight` its weight.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct Ema {
    pub sum: u128,
    pub weight: u32,
}

#[generate_trait]
pub impl EmaImpl of EmaTrait {
    /// An EMA at `mean` (points x 1,000) with the initial weight; `mean` is at least `MIN_SCORE`.
    fn new(mean: u64) -> Ema {
        assert(mean >= MIN_SCORE.into() * SCALE, errors::MEAN_TOO_LOW);
        Ema { sum: mean.into() * INITIAL_WEIGHT.into(), weight: INITIAL_WEIGHT }
    }

    /// The mean, points x 1,000, rounded down.
    fn mean(self: @Ema) -> u64 {
        (*self.sum / (*self.weight).into()).try_into().unwrap()
    }

    /// Pushes `score` (points x 1,000) with `weight`.
    fn push(ref self: Ema, score: u64, weight: u32) {
        // [Check] Scores under the minimum are left out
        if score < MIN_SCORE.into() * SCALE || weight == 0 {
            return;
        }
        // [Compute] A push weighs at most the max weight; a score at most 4x the mean
        let mut weight = core::cmp::min(weight, MAX_WEIGHT);
        let score: u128 = core::cmp::min(score, CLAMP * self.mean()).into();
        // [Effect] Cumulative up to the max weight
        if self.weight < MAX_WEIGHT {
            let step = core::cmp::min(weight, MAX_WEIGHT - self.weight);
            self.sum += score * step.into();
            self.weight += step;
            weight -= step;
        }
        // [Effect] Then an EMA of step weight / max weight
        if weight > 0 {
            let average = self.sum / self.weight.into();
            self.sum = self.sum + score * weight.into() - average * weight.into();
        }
    }
}

/// A day of option B: its prior (points x 1,000), and the sum and weight of its games.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct Day {
    pub prior: u64,
    pub sum: u128,
    pub weight: u32,
}

#[generate_trait]
pub impl DayImpl of DayTrait {
    fn new(prior: u64) -> Day {
        Day { prior, sum: 0, weight: 0 }
    }

    /// Adds a game recorded within its day: a score under the minimum is left out, a score above
    /// 4x the prior enters as 4x the prior.
    fn add(ref self: Day, score: u32, stake: u8) {
        if score < MIN_SCORE {
            return;
        }
        let score: u64 = core::cmp::min(score.into() * SCALE, CLAMP * self.prior);
        self.sum += stake.into() * score.into();
        self.weight += stake.into();
    }

    /// The day's mean: `(PRIOR_WEIGHT x prior + sum) / (PRIOR_WEIGHT + weight)`, points x 1,000.
    fn mean(self: @Day) -> u64 {
        let total = PRIOR_WEIGHT.into() * (*self.prior).into() + *self.sum;
        let weight: u128 = (PRIOR_WEIGHT + *self.weight).into();
        (total / weight).try_into().unwrap()
    }

    /// The day's own average, what it pushes into the EMA once (0 with no game).
    fn average(self: @Day) -> u64 {
        if *self.weight == 0 {
            return 0;
        }
        (*self.sum / (*self.weight).into()).try_into().unwrap()
    }
}

// Packing: one storage slot each

pub impl EmaStorePacking of starknet::storage_access::StorePacking<Ema, felt252> {
    fn pack(value: Ema) -> felt252 {
        let packed: u256 = value.sum.into() + value.weight.into() * TWO_POW_128;
        packed.try_into().unwrap()
    }

    fn unpack(value: felt252) -> Ema {
        let packed: u256 = value.into();
        Ema { sum: packed.low, weight: (packed / TWO_POW_128).try_into().unwrap() }
    }
}

pub impl DayStorePacking of starknet::storage_access::StorePacking<Day, felt252> {
    fn pack(value: Day) -> felt252 {
        let packed: u256 = value.sum.into()
            + value.weight.into() * TWO_POW_128
            + value.prior.into() * TWO_POW_128 * TWO_POW_32;
        packed.try_into().unwrap()
    }

    fn unpack(value: felt252) -> Day {
        let packed: u256 = value.into();
        let high = packed.high.into();
        Day {
            sum: packed.low,
            weight: (high % TWO_POW_32).try_into().unwrap(),
            prior: (high / TWO_POW_32 % TWO_POW_64).try_into().unwrap(),
        }
    }
}
