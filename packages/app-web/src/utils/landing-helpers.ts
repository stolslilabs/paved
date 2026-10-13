import type { PriceView, ReadState } from "@paved/chain";

/** The label of the token Daily charges: USDC since E3 (PAVED is the reward, shown by the economy screens). */
export const TOKEN_LABEL = "USDC";

export function formatTimeRemaining(endTimeUnix: number, nowUnix = Math.floor(Date.now() / 1000)): string {
  const remaining = endTimeUnix - nowUnix;
  if (remaining <= 0) return "Ended";

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** An amount of the token in its base unit, as a decimal string. */
export function formatTokenAmount(value: bigint | number | string, decimals = 18, precision = 4): string {
  const raw = BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  if (fraction === 0n) return whole.toString();
  const padded = fraction.toString().padStart(decimals, "0");
  return trimTrailingZeros(`${whole.toString()}.${padded.slice(0, precision)}`);
}

/** An amount with the token label, or "—" when the deployment does not say the token's decimals. */
export function tokenLabel(value: bigint, decimals: number | null): string {
  return decimals === null ? "—" : `${formatTokenAmount(value, decimals)} ${TOKEN_LABEL}`;
}

export function shortAddress(address: string): string {
  const hex = BigInt(address).toString(16);
  return hex.length <= 10 ? `0x${hex}` : `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

/** What the Daily entry card can say: one state, used for the fee shown and for the confirm. */
export type EntryFee =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unknown-token" }
  | { kind: "free" }
  | { kind: "amount"; amount: bigint };

/**
 * The Daily entry as the player may see it. The amount is formatted with the decimals of the
 * deployment's token only: another token (`price.token`) has unknown decimals, so no figure.
 */
export function entryFee(price: Pick<ReadState<PriceView>, "data" | "error">, deploymentToken: string, decimals: number | null): EntryFee {
  if (price.error) return { kind: "error", message: price.error };
  if (!price.data) return { kind: "loading" };
  if (!deploymentToken || BigInt(price.data.token) !== BigInt(deploymentToken)) return { kind: "unknown-token" };
  // Without the token's decimals no amount can be shown, so none can be confirmed: never a default.
  if (decimals === null && price.data.amount !== 0n) return { kind: "error", message: "token decimals missing from the deployment" };
  return price.data.amount === 0n ? { kind: "free" } : { kind: "amount", amount: price.data.amount };
}

/** The Daily confirm is allowed only when the fee is known; resuming a game costs nothing. */
export function canConfirmEntry(fee: EntryFee, resuming: boolean): boolean {
  return resuming || fee.kind === "free" || fee.kind === "amount";
}
