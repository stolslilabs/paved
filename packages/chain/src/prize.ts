import type { PlayerGame } from "./events";
import type { TournamentView } from "./views";

export type Rank = 1 | 2 | 3;

const RANKS: Rank[] = [1, 2, 3];

const holder = (t: TournamentView, rank: Rank): string => [t.top1PlayerId, t.top2PlayerId, t.top3PlayerId][rank - 1];
const claimed = (t: TournamentView, rank: Rank): boolean => [t.top1Claimed, t.top2Claimed, t.top3Claimed][rank - 1];

/**
 * What `Daily.claim` pays for a rank: the contract's `Tournament::reward`, from the view. Third is
 * a sixth of the prize, second a third of the rest, first the remainder; an empty place pays 0.
 */
export function rewardOf(t: TournamentView, rank: Rank): bigint {
  const third = BigInt(t.top3PlayerId) === 0n ? 0n : t.prize / 6n;
  const second = BigInt(t.top2PlayerId) === 0n ? 0n : (t.prize - third) / 3n;
  if (rank === 3) return third;
  if (rank === 2) return second;
  return t.prize - second - third;
}

/** What a player may claim in a tournament that is over: each rank they hold, unclaimed, with a reward. */
export function claimableRanks(t: TournamentView, playerId: string): Array<{ rank: Rank; reward: bigint }> {
  if (!t.over || BigInt(playerId) === 0n) return [];
  return RANKS.filter((rank) => BigInt(holder(t, rank)) === BigInt(playerId) && !claimed(t, rank))
    .map((rank) => ({ rank, reward: rewardOf(t, rank) }))
    .filter((c) => c.reward > 0n);
}

/**
 * The tournaments that may hold a prize for the player: those their finished Daily games counted
 * for (the `tournament_id` of `GameOver`; 0 when the game did not count). Found from events, one
 * `tournament` view each decides.
 */
export function countedTournamentIds(games: PlayerGame[]): number[] {
  const ids = new Set<number>();
  for (const g of games) {
    if (g.mode === "daily" && g.over && g.countedTournamentId) ids.add(g.countedTournamentId);
  }
  return [...ids].sort((a, b) => b - a);
}
