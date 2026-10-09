import type { ConnectionStatus, PlayerRecord, PriceView, ReadState } from "@paved/chain";
import type { TournamentView } from "@paved/chain";

/**
 * "Create Account" is offered only once a read has answered that the address has no player: with
 * the read in flight or failed (RPC down), a registered player would be offered a create that reverts.
 */
export function canOfferCreate(status: ConnectionStatus, player: Pick<ReadState<PlayerRecord | null>, "data" | "error" | "loading" | "loaded">): boolean {
  return status === "ready" && player.loaded && !player.loading && !player.error && player.data === null;
}

/** The label of the token Daily charges and its prize is paid in: USDC since E3 (PAVED is the reward, shown by the economy screens). */
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

/**
 * A decimal amount typed by the player as the token's base unit, or null when it is not a positive
 * amount with at most `decimals` fraction digits (or the decimals are unknown).
 */
export function parseTokenAmount(text: string, decimals: number | null): bigint | null {
  if (decimals === null) return null;
  const m = /^(\d{1,40})(?:\.(\d{1,40}))?$/.exec(text.trim());
  if (!m) return null;
  const fraction = m[2] ?? "";
  if (fraction.length > decimals) return null;
  const amount = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  return amount > 0n ? amount : null;
}

/** A player name is 1 to 31 printable ASCII characters (a Cairo short string), not only spaces. */
export function playerNameError(name: string): string | null {
  if (!/^[\x20-\x7e]{1,31}$/.test(name) || name.trim() === "") return "A name is 1 to 31 ASCII characters";
  return null;
}

export function shortAddress(address: string): string {
  const hex = BigInt(address).toString(16);
  return hex.length <= 10 ? `0x${hex}` : `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

/** The top three of a tournament, empty places left out. Names wait for the indexer: the address stands in. */
export function podium(t: TournamentView): { name: string; score: number }[] {
  return [
    [t.top1PlayerId, t.top1Score],
    [t.top2PlayerId, t.top2Score],
    [t.top3PlayerId, t.top3Score],
  ]
    .filter(([id]) => BigInt(id as string) !== 0n)
    .map(([id, score]) => ({ name: shortAddress(id as string), score: score as number }));
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
