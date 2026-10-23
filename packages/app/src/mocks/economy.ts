import type { QuoteView, SplitView } from "@paved/chain";
import { estimatedReference } from "@paved/game-core";
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
    // The chain's defaults (`economy.cairo`, `DEFAULT_CONFIG`): `c` 1.222, `H` 5.
    slope: 12_220,
    cap: 5,
  };
}

/** `Economy.rate()` as the mocks answer it: 80 PAVED per USDC, as `@paved/chain`'s fake economy. */
export const GUARD_RATE = (80n * 10n ** 18n * 10n ** 18n) / 1_000_000n;

/** The pool's `quote_swap(usdcIn)` in the mocks: 76 PAVED per USDC, the guard's rate less the pool's 5 % fee. */
export const poolQuote = (usdcIn: bigint): bigint => (usdcIn * 76n * 10n ** 18n) / 1_000_000n;

/** `R` at stake `k` as the purchase page estimates it (#705): the burn's share of the pool's quote, boosted, times `F`. */
export function referenceAt(stake: number): bigint {
  const q = quote(stake);
  return estimatedReference({ poolOut: poolQuote(q.price), swapIn: q.price, burnQuote: q.burnQuote, rate: GUARD_RATE, stake, factorBps: q.factor });
}

/** USDC balances, base units. */
export const BALANCE_RICH = 48_500_000n;
export const BALANCE_LOW = 3_000_000n;
export const PAVED_BALANCE = 142_350_000_000_000_000_000n;
