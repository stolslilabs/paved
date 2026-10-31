export const FP_SCALE_DEFAULT = 1_000_000;

function toNumber(value: number | bigint | string): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(value);
}

export function fpToMultiplier(
  multiplierFp: number | bigint | string,
  fpScale = FP_SCALE_DEFAULT,
): number {
  if (fpScale <= 0) return 0;
  return toNumber(multiplierFp) / fpScale;
}

export function computeAdjustedReward(
  base: number | bigint | string,
  multiplierFp: number | bigint | string,
  fpScale = FP_SCALE_DEFAULT,
): number {
  if (fpScale <= 0) return 0;
  return (toNumber(base) * toNumber(multiplierFp)) / fpScale;
}

// The reward of a paid Challenge game (#705), as `contracts/src/economy/curve.cairo` computes it (economy.md section 2):
// the same integer arithmetic, rounded down at the same steps, so a screen shows what the chain would pay. Amounts are
// bigints in base units; scores are points, thresholds points x 1,000.

const BPS = 10_000n;
/** `curve::RATE_SCALE`: the guard's rate is PAVED base units per USDC base unit, x 1e18. */
const RATE_SCALE = 10n ** 18n;
/** `curve::GUARD_BPS`: a purchase's `R` counts at most 110 % of `burn_quote x rate`. */
const GUARD_BPS = 11_000n;

/**
 * `curve::vault_split`'s burn part: of the PAVED one swap of `swapIn` USDC bought (the burn quote and the margin, P-56),
 * the share of the burn quote, rounded up to the burn as the contract does (the Vault's part is rounded down).
 */
export function burnShare(bought: bigint, burnQuote: bigint, swapIn: bigint): bigint {
  if (swapIn === 0n) return bought;
  return bought - (bought * (swapIn - burnQuote)) / swapIn;
}

/** `curve::guarded`: the PAVED a purchase counts, at most 110 % of `burnQuote x rate`; a rate of 0 counts everything. */
export function guardedPaved(bought: bigint, burnQuote: bigint, rate: bigint): bigint {
  if (rate === 0n) return bought;
  const cap = (burnQuote * rate * GUARD_BPS) / (BPS * RATE_SCALE);
  return bought < cap ? bought : cap;
}

/** `curve::reference`: `R`, the counted PAVED times the stake boost `1 + k/100` times the supply factor `F` (bps). */
export function referenceReward(counted: bigint, stake: number, factorBps: number): bigint {
  const boost = BPS + 100n * BigInt(stake);
  return (((counted * boost) / BPS) * BigInt(factorBps)) / BPS;
}

/**
 * `R` as a purchase of `stake` would store it now: the burn's share of the pool's quote of the swap, guarded, boosted, times
 * `F`. An estimate: the swap returns at least the confirm's `min_out`, not the quote, and `F` is read after the burn on chain
 * (a little higher than the quote's).
 */
export function estimatedReference(input: { poolOut: bigint; swapIn: bigint; burnQuote: bigint; rate: bigint; stake: number; factorBps: number }): bigint {
  const bought = burnShare(input.poolOut, input.burnQuote, input.swapIn);
  return referenceReward(guardedPaved(bought, input.burnQuote, input.rate), input.stake, input.factorBps);
}

/** `curve::payout`: 0 below the threshold (the stake is lost), else `R x c x score / threshold`, capped at `R x H`. */
export function rewardOf(reference: bigint, score: number, threshold: number, slopeBps: number, cap: number): bigint {
  const points = BigInt(score) * 1_000n;
  if (points < BigInt(threshold)) return 0n;
  const linear = (reference * BigInt(slopeBps) * points) / (BigInt(threshold) * BPS);
  const ceiling = reference * BigInt(cap);
  return linear < ceiling ? linear : ceiling;
}

/** The least score that earns a reward: the threshold (points x 1,000), rounded up to a whole point. */
export function winningScore(threshold: number): number {
  return Math.ceil(threshold / 1_000);
}

/**
 * The least score whose reward is the cap `R x H`, whatever `R`: `score x 1,000 x c >= H x threshold x 10,000`. At least the
 * winning score (a slope of `H` or more pays the cap from the threshold).
 */
export function capScore(threshold: number, slopeBps: number, cap: number): number {
  const needed = BigInt(cap) * BigInt(threshold) * BPS;
  const step = BigInt(slopeBps) * 1_000n;
  const score = Number((needed + step - 1n) / step);
  return Math.max(score, winningScore(threshold));
}

// The mean a paid game is settled against (economy.md section 2, option B), as `contracts/src/economy/mean.cairo` computes it:
// the same integer steps, so the mock's settlement (#927) pays what the chain would. Means and scores are points x 1,000.

/** `mean::SCALE`: a mean is points x 1,000. */
export const MEAN_SCALE = 1_000;
/** `mean::MIN_SCORE`: a score under 100 points enters no mean. */
export const MEAN_MIN_SCORE = 100;
/** `mean::INITIAL_WEIGHT` and `mean::MAX_WEIGHT`: the EMA's start and the weight past which it steps. */
const INITIAL_WEIGHT = 100;
const MAX_WEIGHT = 1_000;
/** `mean::CLAMP`: a score enters at most as 4 x the mean. */
const CLAMP = 4n;
/** `mean::PRIOR_WEIGHT`: the weight of a day's prior in its mean. */
const PRIOR_WEIGHT = 100n;
/** The calibration mean set at deploy (`MEAN0`, economy.md section 3): 3,980 points. */
export const INITIAL_MEAN = 3_980_000;

/** `mean::Ema`: the weighted sum (points x 1,000 x weight) and the weight. */
export interface Ema {
  sum: bigint;
  weight: number;
}

/** `EmaTrait::new`: the EMA of a starting mean at the initial weight. */
export const newEma = (mean: number = INITIAL_MEAN): Ema => ({ sum: BigInt(mean) * BigInt(INITIAL_WEIGHT), weight: INITIAL_WEIGHT });

/** `EmaTrait::mean`, rounded down. */
export const emaMean = (ema: Ema): number => Number(ema.sum / BigInt(ema.weight));

/** `EmaTrait::push`: a score (points x 1,000) of `weight`, cumulative up to the max weight, then a step; a new EMA. */
export function emaPush(ema: Ema, score: number, weight: number): Ema {
  if (score < MEAN_MIN_SCORE * MEAN_SCALE || weight === 0) return ema;
  let left = Math.min(weight, MAX_WEIGHT);
  const s = BigInt(Math.min(score, Number(CLAMP * BigInt(emaMean(ema)))));
  let { sum, weight: total } = ema;
  if (total < MAX_WEIGHT) {
    const step = Math.min(left, MAX_WEIGHT - total);
    sum += s * BigInt(step);
    total += step;
    left -= step;
  }
  if (left > 0) {
    const average = sum / BigInt(total);
    sum = sum + s * BigInt(left) - average * BigInt(left);
  }
  return { sum, weight: total };
}

/** `mean::Day`: the EMA at the day's first purchase, and the stakes and scores of its games recorded in time. */
export interface MeanDay {
  prior: number;
  sum: bigint;
  weight: number;
}

/** `DayTrait::add`: a game's score (points) of stake `stake`, clamped at 4 x the prior; under 100 points it is left out. */
export function dayAdd(day: MeanDay, score: number, stake: number): MeanDay {
  if (score < MEAN_MIN_SCORE) return day;
  const s = BigInt(Math.min(score * MEAN_SCALE, Number(CLAMP * BigInt(day.prior))));
  return { prior: day.prior, sum: day.sum + BigInt(stake) * s, weight: day.weight + stake };
}

/** `DayTrait::mean`: the day's scores blended with its prior at weight 100. */
export const dayMean = (day: MeanDay): number => Number((PRIOR_WEIGHT * BigInt(day.prior) + day.sum) / (PRIOR_WEIGHT + BigInt(day.weight)));

/** `DayTrait::average`: the day's own mean, what the close pushes into the EMA; 0 for a day with no game in it. */
export const dayAverage = (day: MeanDay): number => (day.weight === 0 ? 0 : Number(day.sum / BigInt(day.weight)));

/** `curve::threshold`: the cliff of a mean shifted by `sigmaBps`, points x 1,000. */
export const thresholdOfMean = (mean: number, sigmaBps: number): number => Math.floor((mean * (10_000 + sigmaBps)) / 10_000);
