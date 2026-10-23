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
