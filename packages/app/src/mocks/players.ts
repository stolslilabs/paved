import type { IndexedPlayer, PlayerStats } from "@paved/chain";
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
