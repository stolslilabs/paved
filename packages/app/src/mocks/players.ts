import type { IndexedPlayer, Leaderboard, LeaderboardEntry, PlayerStats } from "@paved/chain";
import { DAY, HOUR, MOCK_NOW } from "./clock";

/** The viewer of every mock: a controller account. */
export const PLAYER_ID = "0x05f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f";

export const PLAYER: IndexedPlayer = { playerId: PLAYER_ID, name: "bal7hazar", created: MOCK_NOW - 30 * 24 * HOUR };

export const PLAYER_STATS: PlayerStats = {
  challengeGames: 23,
  challengeFinished: 21,
  bestScore: 1_840,
  paidGames: 18,
  settledGames: 16,
  rewards: "142350000000000000000",
};

/** Today's tournament: the UTC day of the mocks' clock (`timestamp / 86400`, the day id the contracts count from). */
export const TODAY = Math.floor(MOCK_NOW / DAY);

const entry = (rank: number, playerId: string, name: string | null, bestScore: number, gamesPlayed: number): LeaderboardEntry => ({
  rank,
  playerId,
  bestScore,
  bestGameId: 1_000 + rank,
  gamesPlayed,
  gamesFinished: gamesPlayed,
  finishedAt: MOCK_NOW - rank * HOUR,
  name,
});

/** Today's leaderboard as `/v1/tournaments/:day/leaderboard` answers it: its top 3 and the viewer at rank 7. */
export const LEADERBOARD_TODAY: Leaderboard = {
  tournamentId: TODAY,
  startTime: MOCK_NOW - 15 * HOUR,
  endTime: MOCK_NOW + 9 * HOUR,
  total: 41,
  entries: [
    entry(1, "0x0123aa", "stonemaster", 1_840, 6),
    entry(2, "0x0456bb", "vetking", 1_622, 4),
    entry(3, "0x0789cc", null, 1_495, 9),
  ],
  nextOffset: 3,
};

export const VIEWER_TODAY: LeaderboardEntry = entry(7, PLAYER_ID, "bal7hazar", 1_270, 3);

/** A day nobody has finished a game yet. */
export const LEADERBOARD_EMPTY: Leaderboard = { ...LEADERBOARD_TODAY, total: 0, entries: [], nextOffset: null };
