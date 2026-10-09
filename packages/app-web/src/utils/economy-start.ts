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
  };
}

export function purchaseIntent(stake: number, confirmedPrice: bigint, referrer: string | null): PurchaseIntent {
  return { start: true, purchase: { stake, confirmedPrice: confirmedPrice.toString(), referrer } };
}

export interface ReadPurchase {
  stake: number;
  confirmedPrice: bigint;
  referrer: string | null;
}

/** The purchase in a location's state, or null: anything malformed buys nothing. */
export function readPurchaseIntent(state: unknown): ReadPurchase | null {
  if (typeof state !== "object" || state === null || (state as { start?: unknown }).start !== true) return null;
  const p = (state as { purchase?: unknown }).purchase;
  if (typeof p !== "object" || p === null) return null;
  const { stake, confirmedPrice, referrer } = p as Record<string, unknown>;
  if (!isStake(stake)) return null;
  if (typeof confirmedPrice !== "string" || !/^[1-9][0-9]{0,77}$/.test(confirmedPrice)) return null;
  if (referrer !== null && (typeof referrer !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(referrer))) return null;
  return { stake, confirmedPrice: BigInt(confirmedPrice), referrer };
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
  return economyWriter.purchase({ stake: purchase.stake, confirmedPrice: purchase.confirmedPrice, referrer: purchase.referrer });
}
