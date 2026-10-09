import { PAVED_DECIMALS, PAVED_LABEL, USDC_DECIMALS, USDC_LABEL, dayOver, formatUnits } from "@paved/chain";
import type { TermsView } from "@paved/chain";

/** The cliff, said as it is (D-10, P-31). Shown at the purchase and after the day. */
export const CLIFF_TEXT = "Below the shifted mean the stake is lost.";

export const usdc = (amount: bigint) => `${formatUnits(amount, USDC_DECIMALS, 2)} ${USDC_LABEL}`;
export const paved = (amount: bigint) => `${formatUnits(amount, PAVED_DECIMALS, 4)} ${PAVED_LABEL}`;

/** The query key of a referral link: `/?ref=0x...`. */
export const REFERRAL_PARAM = "ref";

/** A referrer from a link's `ref`: a non-zero hex address, or null. It never carries a consent or an amount. */
export function referrerFromSearch(search: URLSearchParams): string | null {
  const value = search.get(REFERRAL_PARAM);
  if (!value || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) return null;
  return BigInt(value) === 0n ? null : `0x${BigInt(value).toString(16)}`;
}

/** The player's own referral link. */
export function referralLink(origin: string, address: string): string {
  return `${origin}/?${REFERRAL_PARAM}=0x${BigInt(address).toString(16)}`;
}

/** Where a bought game is after its day, from the chain's terms only. */
export type SettleState =
  | { kind: "running" }
  | { kind: "not-over" }
  | { kind: "settleable" }
  | { kind: "settled"; reward: bigint };

export function settleState(terms: TermsView, nowSeconds: number): SettleState {
  if (terms.settled) return { kind: "settled", reward: terms.reward };
  if (!dayOver(terms.day, nowSeconds)) return { kind: "running" };
  // `recorded`: the Economy has the game's final score (E2).
  if (!terms.recorded) return { kind: "not-over" };
  return { kind: "settleable" };
}
