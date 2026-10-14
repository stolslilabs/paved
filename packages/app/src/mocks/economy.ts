import type { QuoteView, SplitView } from "@paved/chain";
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
    slope: 4_000,
    cap: 5,
  };
}

/** USDC balances, base units. */
export const BALANCE_RICH = 48_500_000n;
export const BALANCE_LOW = 3_000_000n;
export const PAVED_BALANCE = 142_350_000_000_000_000_000n;
