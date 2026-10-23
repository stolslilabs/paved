import type { QuoteView, SplitView } from "@paved/chain";
import { estimateReward, REWARD_RATE_SCALE, type RewardEstimate } from "@paved/game-core";
import { THRESHOLD_MILLI } from "./games";

/** `Challenge.entry_price().amount`: 2 USDC per stake (`BASE_PRICE 2_000_000`, `economy.cairo:36`). */
export const ENTRY_PRICE = 2_000_000n;
export const MAX_STAKE = 10;

/**
 * `Economy.split_bps()` (V1b, P-56) at the chain's defaults: burn and Vault add up to 10,000; a referrer is paid
 * `referral` of the price out of the Vault's part.
 */
export const SPLIT_BPS: SplitView = { burn: 7_368, vault: 2_632, referral: 500 };

/** The burn's boost at stake `k`, bps: `10_000 + 100 x k` (`economy/curve.cairo:89-95`). */
export const boostBps = (stake: number) => 10_000 + 100 * stake;

/** `Economy.quote(k)` as the mocks answer it: the price is `k x entry_price`, the threshold the same at every stake. */
export function quote(stake: number): QuoteView {
  const price = BigInt(stake) * ENTRY_PRICE;
  return {
    price,
    burnQuote: (price * BigInt(SPLIT_BPS.burn)) / 10_000n,
    referral: (price * BigInt(SPLIT_BPS.referral)) / 10_000n,
    // As `@paved/chain`'s fake economy: the Vault's part is the rest of the price.
    margin: price - (price * BigInt(SPLIT_BPS.burn)) / 10_000n,
    minOutHint: 0n,
    factor: 10_000,
    mean: 1_020_000,
    threshold: THRESHOLD_MILLI,
    slope: 12_220,
    cap: 5,
  };
}

/** The pool's quote, PAVED per USDC: 95 % of the guard's rate, as `@paved/chain`'s fake pool quotes it. */
export const POOL_PAVED_PER_USDC = 76n;
/** `Economy.rate()`: 80 PAVED per USDC, x `RATE_SCALE` (PAVED base units per USDC base unit). */
export const GUARD_RATE = (80n * 10n ** 18n * REWARD_RATE_SCALE) / 1_000_000n;

/**
 * The reward by score of a purchase of stake `k` (#705) on the mocks' quote, the pool paying `paved` PAVED per USDC (76 by
 * default) for the price less the referral when `referred`. `terms` changes the quote's terms (a lower cap, a factor).
 */
export function rewardAt(stake: number, { referred = false, paved = POOL_PAVED_PER_USDC, terms = {} }: { referred?: boolean; paved?: bigint; terms?: Partial<QuoteView> } = {}): RewardEstimate {
  const q = { ...quote(stake), ...terms };
  const swapIn = q.price - (referred ? q.referral : 0n);
  return estimateReward({
    stake,
    threshold: q.threshold,
    slopeBps: q.slope,
    cap: q.cap,
    factorBps: q.factor,
    burnQuote: q.burnQuote,
    swapIn,
    poolOut: (swapIn * paved * 10n ** 18n) / 1_000_000n,
    rate: GUARD_RATE,
  });
}

/** USDC balances, base units. */
export const BALANCE_RICH = 48_500_000n;
export const BALANCE_LOW = 3_000_000n;
export const PAVED_BALANCE = 142_350_000_000_000_000_000n;
