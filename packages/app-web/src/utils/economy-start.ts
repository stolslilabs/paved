import { isStake } from "@paved/chain";
import type { EconomyWriter } from "@paved/chain";

/**
 * The player's consent to buy a Daily game, carried in the router's history state like `StartIntent`: a link cannot
 * set it. Only the purchase confirm builds one. The referrer rides with it, as shown at the confirm.
 */
export interface PurchaseIntent {
  start: true;
  purchase: {
    stake: number;
    /** The price the player saw and confirmed, USDC base units, decimal string. */
    confirmedPrice: string;
    /** The referrer shown at the confirm, or null. */
    referrer: string | null;
    /** The least PAVED bought the player saw and confirmed (`min_out`), base units, decimal string: a floor at send. */
    confirmedMinOut: string;
    /** The player saw the sanity warning (a pool quote below 90 % of the guard-rate value, E-9b) and confirmed anyway. */
    acceptedLowQuote: boolean;
  };
}

export function purchaseIntent(stake: number, confirmedPrice: bigint, referrer: string | null, confirmedMinOut: bigint, acceptedLowQuote = false): PurchaseIntent {
  return { start: true, purchase: { stake, confirmedPrice: confirmedPrice.toString(), referrer, confirmedMinOut: confirmedMinOut.toString(), acceptedLowQuote } };
}

export interface ReadPurchase {
  stake: number;
  confirmedPrice: bigint;
  referrer: string | null;
  confirmedMinOut: bigint;
  acceptedLowQuote: boolean;
}

/** The purchase in a location's state, or null: anything malformed buys nothing. */
export function readPurchaseIntent(state: unknown): ReadPurchase | null {
  if (typeof state !== "object" || state === null || (state as { start?: unknown }).start !== true) return null;
  const p = (state as { purchase?: unknown }).purchase;
  if (typeof p !== "object" || p === null) return null;
  const { stake, confirmedPrice, referrer, confirmedMinOut, acceptedLowQuote } = p as Record<string, unknown>;
  if (!isStake(stake)) return null;
  if (typeof confirmedPrice !== "string" || !/^[1-9][0-9]{0,77}$/.test(confirmedPrice)) return null;
  // The confirmed floor, as strict as the price: no floor, or a malformed one, buys nothing.
  if (typeof confirmedMinOut !== "string" || !/^[1-9][0-9]{0,77}$/.test(confirmedMinOut)) return null;
  if (referrer !== null && (typeof referrer !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(referrer))) return null;
  // Only `true` accepts a low quote; anything else (absent, malformed) does not, so the send warns again if it must.
  return { stake, confirmedPrice: BigInt(confirmedPrice), referrer, confirmedMinOut: BigInt(confirmedMinOut), acceptedLowQuote: acceptedLowQuote === true };
}

/**
 * The start of a consent: the purchase when the intent carries one, else the plain spawn. A purchase never falls back to
 * the plain spawn (which pays another price, or none): without the economy's writer it throws and sends nothing.
 */
export async function spawnForIntent(
  purchase: ReadPurchase | undefined,
  economyWriter: Pick<EconomyWriter, "purchase"> | null,
  plainSpawn: () => Promise<{ gameId: number }>,
): Promise<{ gameId: number }> {
  if (!purchase) return plainSpawn();
  if (!economyWriter) throw new Error("The economy is not available: nothing was sent");
  return economyWriter.purchase({
    stake: purchase.stake,
    confirmedPrice: purchase.confirmedPrice,
    confirmedMinOut: purchase.confirmedMinOut,
    referrer: purchase.referrer,
    acceptedLowQuote: purchase.acceptedLowQuote,
  });
}
