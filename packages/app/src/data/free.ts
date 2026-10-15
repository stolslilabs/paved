/**
 * The "Free" mark's source (cobbles v1, P-61): the indexer's `free` on a leaderboard row (`LeaderboardEntry.free`: the
 * day's best game was bought with a credit) and on a game row (`GameRow.free`: `GameSpawned.price` 0). The field is
 * optional here: an indexer that predates it, or a client that does not carry it, marks nothing.
 */
export const isFree = (row: object | null | undefined): boolean => (row as { free?: unknown } | null | undefined)?.free === true;

/** The players of `entries` whose best game of the day was free. */
export const freePlayers = (entries: readonly { playerId: string }[]): string[] => entries.filter(isFree).map((e) => e.playerId);
