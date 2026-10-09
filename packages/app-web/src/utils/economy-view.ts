import { ADDRESS_BOUND, PAVED_DECIMALS, PAVED_LABEL, USDC_DECIMALS, USDC_LABEL, expiresAt, formatUnits, settlesAfter } from "@paved/chain";
import type { TermsView } from "@paved/chain";

/** The cliff, said as it is (D-10, P-31). Shown at the purchase and after the day. */
export const CLIFF_TEXT = "Below the shifted mean the stake is lost.";

export const usdc = (amount: bigint) => `${formatUnits(amount, USDC_DECIMALS, 2)} ${USDC_LABEL}`;
export const paved = (amount: bigint) => `${formatUnits(amount, PAVED_DECIMALS, 4)} ${PAVED_LABEL}`;

/** The query key of a referral link: `/?ref=0x...`. */
export const REFERRAL_PARAM = "ref";

/**
 * A referrer from a link's `ref`: a non-zero hex address below the address bound (`2^251 - 256`, itself below the
 * felt prime), or null. A value out of range counts as no referrer: it is never shown nor sent. It never carries a
 * consent or an amount.
 */
export function referrerFromSearch(search: URLSearchParams): string | null {
  const value = search.get(REFERRAL_PARAM);
  if (!value || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) return null;
  const referrer = BigInt(value);
  return referrer === 0n || referrer >= ADDRESS_BOUND ? null : `0x${referrer.toString(16)}`;
}

/** The player's own referral link. */
export function referralLink(origin: string, address: string): string {
  return `${origin}/?${REFERRAL_PARAM}=0x${BigInt(address).toString(16)}`;
}

/** A chain time (Unix seconds) as a date the player reads, in UTC. */
export function utcDate(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Points x 1,000 (the economy's mean and threshold) as points. */
export function points(milli: number): string {
  return (milli / 1000).toFixed(0);
}

/**
 * Where a bought game is, from the chain's terms and its purchase time (its spawn's `start_time`): playing until it
 * expires 24 h later (P-34), expired with no reward, waiting for its day to settle after the next day ends, to settle,
 * or settled with the chain's reward. `now` only chooses which of these to show; the writer checks the latest block.
 */
export type SettleState =
  | { kind: "playing"; expiresAt: number }
  | { kind: "expired" }
  | { kind: "waiting"; settlesAfter: number }
  | { kind: "settleable" }
  | { kind: "settled"; reward: bigint };

export function settleState(terms: TermsView, purchasedAt: number, nowSeconds: number): SettleState {
  if (terms.settled) return { kind: "settled", reward: terms.reward };
  // `expired`: recorded 24 h or more after the purchase (P-34): no reward. A game still unrecorded past that time is
  // expired too, whenever it is recorded. `recorded` alone: the Economy has the game's final score (E2).
  if (terms.expired) return { kind: "expired" };
  if (!terms.recorded) {
    const expiry = expiresAt(terms.time > 0 ? terms.time : purchasedAt);
    return nowSeconds < expiry ? { kind: "playing", expiresAt: expiry } : { kind: "expired" };
  }
  const after = settlesAfter(terms.day);
  return nowSeconds < after ? { kind: "waiting", settlesAfter: after } : { kind: "settleable" };
}
