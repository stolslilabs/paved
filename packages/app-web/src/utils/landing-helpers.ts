import type { ConnectionStatus, PlayerRecord, ReadState } from "@paved/chain";
import type { TournamentView } from "@paved/chain";

/**
 * "Create Account" is offered only once a read has answered that the address has no player: with
 * the read in flight or failed (RPC down), a registered player would be offered a create that reverts.
 */
export function canOfferCreate(status: ConnectionStatus, player: Pick<ReadState<PlayerRecord | null>, "data" | "error" | "loading" | "loaded">): boolean {
  return status === "ready" && player.loaded && !player.loading && !player.error && player.data === null;
}

/** The entry token's label, whatever its on-chain symbol (D-2). */
export const TOKEN_LABEL = "$TILE";

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
