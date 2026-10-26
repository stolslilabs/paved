import type { IndexedPlayer, PlayerStats } from "@paved/chain";
import type { PlayerProgress } from "../components/elements/xp-ring";
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

/** The XP ring's states (#625); the app shows `start` for everyone until the contracts define XP. */
export const PROGRESS = {
  start: { level: 1, xp: 0, xpForNext: 100 },
  partWay: { level: 3, xp: 120, xpForNext: 300 },
  nearlyFull: { level: 7, xp: 470, xpForNext: 500 },
  /** WRAP360: a level and a threshold in the thousands. */
  stress: { level: 1_234, xp: 98_765, xpForNext: 123_456 },
  /** The level cap (20, #734): the view's next level is its floor, nothing left to make (#787's "Max level"). */
  maxLevel: { level: 20, xp: 0, xpForNext: 0 },
} satisfies Record<string, PlayerProgress>;
