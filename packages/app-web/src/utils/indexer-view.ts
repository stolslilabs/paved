import { IndexerError } from "@paved/chain";
import type { Freshness } from "@paved/chain";

/** Rows per page of a leaderboard (the API serves 1 to 100). */
export const BOARD_PAGE = 20;

/** Games per page of a player's list. */
export const GAMES_PAGE = 10;

/** Past tournaments the player screen looks up one by one (one request each). */
export const PLAYER_TOURNAMENTS_SHOWN = 8;

/** Days offered in the leaderboard's day picker. */
export const DAYS_LISTED = 30;

const ORDINAL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

/** The contract's prize slots a player holds, from `prize_ranks`: "1st and 3rd". Empty list: null. */
export function slotsLabel(ranks: number[]): string | null {
  const names = ranks.map((r) => ORDINAL[r] ?? String(r));
  if (names.length === 0) return null;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What the indexer's lag means to the reader; null when there is nothing to say. */
export function lagLabel(behind: number): string {
  return behind === 0 ? "Up to date" : `Updated ${behind} ${behind === 1 ? "block" : "blocks"} behind`;
}

export function isLate(freshness: Freshness): boolean {
  return freshness.kind === "behind";
}

/** One line for an indexer failure, by kind. */
export function describeIndexerError(error: unknown): string {
  if (!(error instanceof IndexerError)) return "Leaderboard unavailable";
  switch (error.kind) {
    case "not-configured":
      return "Leaderboard unavailable";
    case "unreachable":
      return "Leaderboard unavailable: the indexer cannot be reached";
    case "wrong-version":
      return "Leaderboard unavailable: the indexer speaks another API version";
    case "unavailable":
      return error.status === "halted"
        ? "Leaderboard unavailable: the indexer is halted"
        : error.status === "rewinding"
          ? "Leaderboard unavailable: the indexer is catching up after a chain reorganisation"
          : "Leaderboard unavailable: the indexer is starting";
    case "not-found":
      return "Not found";
    default:
      return "Leaderboard unavailable: the indexer gave an unexpected answer";
  }
}

/** A player without a name: the start and end of the id. */
export function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function playerLabel(name: string | null, id: string): string {
  return name && name.length > 0 ? name : shortId(id);
}

/** A tournament is one UTC day: "2026-10-07". */
export function dayLabel(startTime: number): string {
  return new Date(startTime * 1000).toISOString().slice(0, 10);
}
