import type { IndexedGame, Leaderboard, LeaderboardEntry, PlayerProfile } from "@paved/chain";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { LEADERBOARD_TODAY, PLAYER, PLAYER_STATS, TODAY, VIEWER_TODAY } from "./players";

/** The leaderboard's page: the rows one read asks for (`/v1/tournaments/:day/leaderboard?limit=`). */
export const PAGE = 20;

/** The first tournament the indexer has: the day picker goes no earlier. */
export const FIRST_DAY = TODAY - 30;

const NAMES = [
  "stonemaster", "vetking", null, "meadowlark", "roadwright", "cartographer", null, "elmsworth", "towerkeep", "quarrygirl",
  "lanternjack", null, "pathfinder", "mossback", "fieldmouse", "keystone", null, "wayfarer", "cobblestone", "thornfield",
  "highgate", "brookside", null, "oakhollow", "millrace",
] as const;

/** A short hex id per rank, as the stories' other players (`0x0123aa`, ...); the viewer's id is the mocks' `PLAYER_ID`. */
const idOf = (rank: number) => `0x0${(0x1000 + rank * 0x1f3).toString(16)}${["aa", "bb", "cc", "dd"][rank % 4]}`;

/**
 * `count` rows from the top of a day ending at `end`, each score 4.5 % under the one above from `top` (rank 1); the
 * viewer at their rank with their score, which fits between their neighbours. With `podium`, the first rows are those.
 */
function rows(count: number, end: number, top: number, options: { viewer?: LeaderboardEntry; podium?: LeaderboardEntry[] } = {}): LeaderboardEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const rank = i + 1;
    if (options.viewer && rank === options.viewer.rank) return options.viewer;
    const podium = options.podium?.[i];
    if (podium) return podium;
    return {
      rank,
      playerId: idOf(rank),
      bestScore: Math.round(top * 0.955 ** i),
      bestGameId: 900 + rank * 7,
      gamesPlayed: 1 + ((rank * 5) % 7),
      gamesFinished: 1 + ((rank * 5) % 7),
      finishedAt: end - DAY + ((rank * 37) % 23) * HOUR,
      name: NAMES[i % NAMES.length],
    };
  });
}

const todayEnd = LEADERBOARD_TODAY.endTime;

/** Today, open: the first page of 20, the viewer 7th (SC1's `VIEWER_TODAY`), 41 ranked. */
export const BOARD_TODAY: Leaderboard = {
  ...LEADERBOARD_TODAY,
  // From rank 4 the scores fall from the podium's third (1,495): 1,428, 1,363, 1,302, then the viewer's 1,270 at 7.
  entries: rows(PAGE, todayEnd, 1_495 / 0.955 ** 2, { viewer: VIEWER_TODAY, podium: LEADERBOARD_TODAY.entries }),
  nextOffset: PAGE,
};

/** Yesterday, closed: its ranking is final; the viewer finished 4th. */
export const VIEWER_YESTERDAY: LeaderboardEntry = { ...VIEWER_TODAY, rank: 4, bestScore: 1_840, bestGameId: 1_031, gamesPlayed: 5, gamesFinished: 5, finishedAt: MOCK_NOW - DAY - 2 * HOUR };

export const BOARD_CLOSED: Leaderboard = {
  tournamentId: TODAY - 1,
  startTime: (TODAY - 1) * DAY,
  endTime: TODAY * DAY,
  total: 57,
  // 2,105, 2,010, 1,920, the viewer's 1,840, then 1,751.
  entries: rows(PAGE, TODAY * DAY, 2_105, { viewer: VIEWER_YESTERDAY }),
  nextOffset: PAGE,
};

/** A day nobody finished a game: an empty page. */
export const BOARD_EMPTY: Leaderboard = { tournamentId: TODAY - 12, startTime: (TODAY - 12) * DAY, endTime: (TODAY - 11) * DAY, total: 0, entries: [], nextOffset: null };

/** Today again, the viewer 34th: off the first page, their row read apart (`/v1/tournaments/:day/entry/:player`). */
export const VIEWER_OFF_TOP: LeaderboardEntry = { ...VIEWER_TODAY, rank: 34, bestScore: 360 };

/** The same page with another player 7th: the viewer's row is not on it. */
export const BOARD_OFF_TOP: Leaderboard = { ...BOARD_TODAY, entries: rows(PAGE, todayEnd, 1_495 / 0.955 ** 2, { podium: LEADERBOARD_TODAY.entries }) };

// The player's page (`/player/:id`)

/** Another player, opened from a row: SC1's leader. */
export const OTHER_PROFILE: PlayerProfile = {
  player: { playerId: LEADERBOARD_TODAY.entries[0].playerId, name: "stonemaster", created: MOCK_NOW - 64 * DAY },
  stats: { challengeGames: 88, challengeFinished: 85, bestScore: 2_310, paidGames: 80, settledGames: 78, rewards: "1204500000000000000000" },
};

export const SELF_PROFILE: PlayerProfile = { player: PLAYER, stats: PLAYER_STATS };

/** An id the indexer has never seen: `player` and `stats` null (200, not 404). */
export const UNKNOWN_PROFILE: PlayerProfile = { player: null, stats: null };

const game = (gameId: number, daysAgo: number, score: number, over = true): IndexedGame => {
  const startTime = MOCK_NOW - daysAgo * DAY - 3 * HOUR;
  const day = Math.floor(startTime / DAY);
  return {
    contract: "challenge",
    gameId,
    mode: 1,
    startTime,
    dayId: day,
    over,
    score: over ? score : 0,
    countedDayId: over ? day : 0,
    endTime: over ? startTime + 40 * 60 : 0,
    tokenId: gameId,
    economy: {
      day,
      stake: 1 + (gameId % 5),
      price: String(2_000_000 * (1 + (gameId % 5))),
      referrer: null,
      referral: "0",
      burned: "3120000000000000000",
      factor: 10_000,
      reference: "4200000000000000000",
      purchasedAt: startTime,
      recorded: over,
      expired: false,
      settled: over && daysAgo >= 2,
      threshold: over && daysAgo >= 2 ? 1_150_000 : null,
      reward: over && daysAgo >= 2 ? (score >= 1_150 ? "8420000000000000000" : "0") : null,
    },
  };
};

/** The player's last games, newest first (`/v1/players/:id/games`): one running, the others over. */
export const PLAYER_GAMES: IndexedGame[] = [
  game(1_042, 0, 0, false),
  game(1_038, 1, 1_610),
  game(1_017, 2, 1_270),
  game(1_003, 3, 940),
  game(987, 5, 1_840),
];

