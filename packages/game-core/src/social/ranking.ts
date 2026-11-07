import { playerKey } from "./follow";

// The players' ranking (LEADERBOARD-PAGE, the dock's Ranking): the players by their crowns, the points the HUD's League control, a
// guild's members and a profile show; a guild's score is the sum of its members' crowns (`guildScore`, guild.ts), so both rankings
// count the same points.

/** A player as the ranking reads them: their ID, their crowns and their level. */
export interface RankedPlayer {
  address: string;
  crowns: number;
  level: number;
}

/** The most players the ranking lists. */
export const PLAYER_RANKING_LIMIT = 100;

/** Two IDs in one order whatever their form (`0x05f1` and `0x5f1` alike): by value, the lowest first. */
function compareIds(a: string, b: string): number {
  const x = playerKey(a);
  const y = playerKey(b);
  try {
    const d = BigInt(x) - BigInt(y);
    return d < 0n ? -1 : d > 0n ? 1 : 0;
  } catch {
    return x < y ? -1 : x > y ? 1 : 0;
  }
}

/** The ranking's order: the most crowns first, then the highest level, then the lowest ID. */
export const comparePlayers = (a: RankedPlayer, b: RankedPlayer): number => b.crowns - a.crowns || b.level - a.level || compareIds(a.address, b.address);

/** The players' ranking: by crowns, then by level, then by ID; the first `limit`. */
export const rankPlayers = <T extends RankedPlayer>(players: readonly T[], limit = PLAYER_RANKING_LIMIT): T[] =>
  [...players].sort(comparePlayers).slice(0, Math.max(0, limit));

/** A player's place in the ranking of `players` (1 first, past the limit too), or null when they are not among them. */
export function playerPlace(players: readonly RankedPlayer[], address: string): number | null {
  const key = playerKey(address);
  const index = rankPlayers(players, players.length).findIndex((p) => playerKey(p.address) === key);
  return index < 0 ? null : index + 1;
}

/**
 * A player among their friends (the Leaderboard's Friends tab): each friend and the player, by crowns as `rankPlayers` orders them
 * (all of them, the list is the player's own), and the player's place among them. No friend, an empty ranking: the player alone ranks
 * against no one. Without the player (`me` null), the friends alone.
 */
export function rankAmongFriends<T extends RankedPlayer>(friends: readonly T[], me: T | null): { players: T[]; me: { place: number; profile: T } | null } {
  if (friends.length === 0) return { players: [], me: null };
  const own = me === null ? null : playerKey(me.address);
  const all = me === null ? [...friends] : [me, ...friends.filter((f) => playerKey(f.address) !== own)];
  const players = rankPlayers(all, all.length);
  const index = own === null ? -1 : players.findIndex((p) => playerKey(p.address) === own);
  return { players, me: index < 0 ? null : { place: index + 1, profile: players[index]! } };
}
