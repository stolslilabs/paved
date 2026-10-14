import type { QuoteView } from "@paved/chain";
import { THRESHOLD_MILLI } from "./games";

/** `Challenge.entry_price().amount`: 2 USDC per stake (`BASE_PRICE 2_000_000`, `economy.cairo:36`). */
export const ENTRY_PRICE = 2_000_000n;
export const MAX_STAKE = 10;

/**
 * How a purchase's price is split, basis points. The chain's `split_bps` view is to come: this mock
 * stands for its answer, from today's constants (`burn_bps 7_000`, `REFERRAL_BPS 500`), the vault taking the rest.
 */
export interface SplitBps {
  burn: number;
  vault: number;
  referral: number;
}

export const SPLIT_BPS: SplitBps = { burn: 7_000, vault: 2_500, referral: 500 };

/** The burn's boost at stake `k`, bps: `10_000 + 100 x k` (`economy/curve.cairo:89-95`). */
export const boostBps = (stake: number) => 10_000 + 100 * stake;

/** `Economy.quote(k)` as the mocks answer it: the price is `k x entry_price`, the threshold the same at every stake. */
export function quote(stake: number): QuoteView {
  const price = BigInt(stake) * ENTRY_PRICE;
  return {
    price,
    burnQuote: (price * BigInt(SPLIT_BPS.burn)) / 10_000n,
    referral: (price * BigInt(SPLIT_BPS.referral)) / 10_000n,
    margin: (price * BigInt(SPLIT_BPS.vault)) / 10_000n,
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
