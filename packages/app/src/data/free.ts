/**
 * The "Free" mark's source (cobbles v1, P-61): the indexer's `free` on a leaderboard row (`LeaderboardEntry.free`: the
 * day's best game was bought with a credit) and on a game row (`IndexedGame.free`: `GameSpawned.price` 0).
 */
export const isFree = (row: { free?: boolean } | null | undefined): boolean => row?.free === true;

/** The players of `entries` whose best game of the day was free. */
export const freePlayers = (entries: readonly { playerId: string; free?: boolean }[]): string[] => entries.filter(isFree).map((e) => e.playerId);
