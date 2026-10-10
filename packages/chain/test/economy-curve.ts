/**
 * The settlement's arithmetic, written out from `contracts/src/economy/mean.cairo` (`Day`) and
 * `contracts/src/economy/curve.cairo` (`threshold`, `payout`), for the end-to-end check to compare the chain's reward
 * with: integers only, rounded down where Cairo rounds down. Means and thresholds are in points x 1,000.
 */

/** `mean::MIN_SCORE`: a score under it enters no mean. */
export const MIN_SCORE = 100;
/** `mean::CLAMP`: a score enters a day at most as 4 x its prior. */
export const CLAMP = 4n;
/** `mean::PRIOR_WEIGHT`: the weight of the prior in a day's mean. */
export const PRIOR_WEIGHT = 100n;
const BPS = 10_000n;

/** A day's mean (`Day::mean`): its prior blended with its games, each `stake x min(score, 4 x prior)`. */
export function dayMean(prior: number, games: Array<{ score: number; stake: number }>): bigint {
  let sum = 0n;
  let weight = 0n;
  for (const g of games) {
    if (g.score < MIN_SCORE) continue;
    const score = BigInt(g.score) * 1_000n;
    const clamped = score < CLAMP * BigInt(prior) ? score : CLAMP * BigInt(prior);
    sum += BigInt(g.stake) * clamped;
    weight += BigInt(g.stake);
  }
  return (PRIOR_WEIGHT * BigInt(prior) + sum) / (PRIOR_WEIGHT + weight);
}

/** `curve::threshold`: the cliff, `mean x (10_000 + sigma) / 10_000`. */
export function threshold(mean: bigint, sigmaBps: number): bigint {
  return (mean * (BPS + BigInt(sigmaBps))) / BPS;
}

/** `curve::payout`: `R x c x score / threshold`, capped at `R x H`; 0 below the threshold. */
export function payout(reference: bigint, score: number, cliff: bigint, slopeBps: number, cap: number): bigint {
  const points = BigInt(score) * 1_000n;
  if (points < cliff) return 0n;
  const linear = (reference * BigInt(slopeBps) * points) / (cliff * BPS);
  const ceiling = reference * BigInt(cap);
  return linear < ceiling ? linear : ceiling;
}
