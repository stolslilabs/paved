// The reward of a Challenge game, as the contracts pay it (#705): an integer mirror of `curve::vault_split`,
// `curve::guarded`, `curve::reference` and `curve::payout` (`contracts/src/economy/curve.cairo`, economy.md section 2),
// with the same rounding (bigint division rounds down, as Cairo's u256 does). The purchase page's estimate of what a score
// earns is built on it; the figures are estimates since `R` is fixed by the swap at purchase and the game is settled
// against its day's mean, not today's threshold.

/** 100 % in basis points (`curve::BPS`). */
export const REWARD_BPS = 10_000n;
/** The scale of the guard's swap rate, PAVED base units per USDC base unit (`curve::RATE_SCALE`). */
export const REWARD_RATE_SCALE = 10n ** 18n;
/** The price guard: a purchase's `R` counts at most 110 % of `quote x rate` (`curve::GUARD_BPS`). */
export const GUARD_BPS = 11_000n;

/**
 * The PAVED one swap of `quote + margin` bought, split by input (`curve::vault_split`): `[burn, vault]`, the margin's part
 * rounded down to the Vault, the rest burned. An empty input splits nothing.
 */
export function vaultSplit(bought: bigint, quote: bigint, margin: bigint): [burn: bigint, vault: bigint] {
  const total = quote + margin;
  if (total === 0n) return [bought, 0n];
  const vault = (bought * margin) / total;
  return [bought - vault, vault];
}

/** The PAVED a purchase counts for its reward: `bought`, at most 110 % of `quote x rate` (`curve::guarded`); a zero rate counts it all. */
export function guarded(bought: bigint, quote: bigint, rate: bigint): bigint {
  if (rate === 0n) return bought;
  const cap = (quote * rate * GUARD_BPS) / (REWARD_BPS * REWARD_RATE_SCALE);
  return bought < cap ? bought : cap;
}

/** The reference reward `R = counted x (10_000 + 100 k) / 10_000 x F / 10_000` (`curve::reference`), PAVED base units. */
export function referenceReward(counted: bigint, stake: number, factorBps: number): bigint {
  const boost = REWARD_BPS + 100n * BigInt(stake);
  return (((counted * boost) / REWARD_BPS) * BigInt(factorBps)) / REWARD_BPS;
}

/**
 * The reward of a score (`curve::payout`): 0 below `threshold` (points x 1,000), else `R x c x score / threshold`, capped
 * at `R x H`. `score` in whole points, `slopeBps` is `c`, `cap` is `H`.
 */
export function payout(reference: bigint, score: number, threshold: number, slopeBps: number, cap: number): bigint {
  const points = BigInt(score) * 1_000n;
  const cliff = BigInt(threshold);
  if (points < cliff) return 0n;
  const linear = (reference * BigInt(slopeBps) * points) / (cliff * REWARD_BPS);
  const ceiling = reference * BigInt(cap);
  return linear < ceiling ? linear : ceiling;
}

/** The least whole score at or above `threshold` (points x 1,000): the least a winning game must score. */
export function winningScore(threshold: number): number {
  return Math.ceil(threshold / 1_000);
}

/**
 * The least whole score whose `payout` is the cap `R x H`, for any `R > 0`: `floor(R c s 1000 / (T BPS)) >= R H` holds
 * exactly when `c s 1000 >= H T BPS`, so `s = ceil(H T BPS / (c 1000))`, never below the winning score.
 */
export function capScore(threshold: number, slopeBps: number, cap: number): number {
  const need = BigInt(cap) * BigInt(threshold) * REWARD_BPS;
  const step = BigInt(slopeBps) * 1_000n;
  const score = Number((need + step - 1n) / step);
  return Math.max(score, winningScore(threshold));
}

/** What a purchase's estimate is built on: `Economy.quote(stake)`'s terms, the pool's quote of the swap, and `Economy.rate()`. */
export interface RewardInputs {
  stake: number;
  /** Points x 1,000 (`Quote.threshold`). */
  threshold: number;
  /** `c`, bps (`Quote.slope`). */
  slopeBps: number;
  /** `H` (`Quote.cap`). */
  cap: number;
  /** `F`, bps (`Quote.factor`). */
  factorBps: number;
  /** USDC base units (`Quote.burnQuote`). */
  burnQuote: bigint;
  /** The USDC the purchase swaps: the price, less the referral when there is a referrer. */
  swapIn: bigint;
  /** The pool's `quote_swap(swapIn)`, PAVED base units. */
  poolOut: bigint;
  /** `Economy.rate()`, x `REWARD_RATE_SCALE`; 0 for no guard. */
  rate: bigint;
}

export interface RewardRow {
  /** Whole points. */
  score: number;
  /** PAVED base units. */
  reward: bigint;
}

export interface RewardEstimate {
  /** `R`, PAVED base units. */
  reference: bigint;
  /** The PAVED of the swap that the burn's part bought, before the guard. */
  bought: bigint;
  /** The guard counted less than the burn's part bought. */
  guardBinds: boolean;
  /** The winning score first, then the multiples of the threshold below the cap's score. */
  rows: RewardRow[];
  /** The least score that earns the cap. */
  capScore: number;
  /** `R x H`, PAVED base units. */
  capReward: bigint;
}

/** The multiples of the threshold an estimate shows above its winning score, in percent. */
export const REWARD_MULTIPLES = [125, 150, 200] as const;

/**
 * The reward by score of a purchase made now (`Economy.purchase`'s `R`, then `payout`): at the winning score, at each of
 * `multiples` (percent of the threshold, rounded up to a whole score) below the cap's score, and the cap.
 */
export function estimateReward(inputs: RewardInputs, multiples: readonly number[] = REWARD_MULTIPLES): RewardEstimate {
  const { threshold, slopeBps, cap } = inputs;
  const [bought] = vaultSplit(inputs.poolOut, inputs.burnQuote, inputs.swapIn - inputs.burnQuote);
  const counted = guarded(bought, inputs.burnQuote, inputs.rate);
  const reference = referenceReward(counted, inputs.stake, inputs.factorBps);
  const top = capScore(threshold, slopeBps, cap);
  const first = winningScore(threshold);
  const scores = [first, ...multiples.map((m) => Math.ceil((threshold * m) / 100_000))].filter((s, i, all) => s < top && all.indexOf(s) === i);
  return {
    reference,
    bought,
    guardBinds: counted < bought,
    rows: scores.map((score) => ({ score, reward: payout(reference, score, threshold, slopeBps, cap) })),
    capScore: top,
    capReward: reference * BigInt(cap),
  };
}
