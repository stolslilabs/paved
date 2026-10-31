import {
  IndexerError,
  MAX_INDEXER_PAGE,
  type Definitions,
  type IndexedGame,
  type IndexerAnswer,
  type IndexerClient,
  type IndexerContract,
  type Leaderboard,
  type LeaderboardEntry,
  type PlayerAchievements,
  type PlayerGames,
  type PlayerProfile,
  type PlayerQuest,
  type PlayerQuests,
  type PlayerStats,
  type TaskTarget,
  type TournamentDetail,
  type TournamentList,
  type TournamentSummary,
} from "@paved/chain";
import { thresholdOfMean } from "@paved/game-core";
import { isLiveOnDay, questWindow } from "../../lib/quest-window";
import { addressKey } from "../keys";
import { MOCK_FACTOR_BPS, dayOfTime, replayOf, tallyOf, type StoredGame } from "./challenge";
import { dailiesDone, withMockDailies } from "./dailies";
import { FRESH_DEFINITIONS, TASK, achievementCounts, questCounts } from "./definitions";
import type { MockLedger } from "./ledger";
import { SEEDED_FROM_DAY, SEEDED_PLAYERS, seededDay, seededGame, seededPlayer, type SeededGame, type SeededPlayer } from "./players";

// The mock's indexer (#927, PR 5 of 6): every route of `IndexerClient` answered from the device's ledger, no indexer asked.
// The rows are the ledger's games (`challenge.ts`), of every account of the device, and the seeded players' days
// (`players.ts`), so the leaderboard, the player pages and the game-over pages have rivals; the quests and achievements are the
// fresh deployment's (`definitions.ts`), their progress counted from each game over's report as the Challenge reports it
// (`quests.cairo`: a game's tasks counted on the time it ended, a free game reporting no quest progress); the podium is the
// mock's own leaderboard's, as the indexer credits it. The head is the ledger's clock.

const DAY_S = 86_400;
const CHALLENGE_MODE = 1;
/** A page when the caller names none (the indexer's default). */
const DEFAULT_PAGE = 50;

/** A player's id as the indexer writes it: 64 hex digits. */
const indexerId = (playerId: string | bigint) => `0x${BigInt(playerId).toString(16).padStart(64, "0")}`;

const pageOf = (limit: number | undefined, fallback = DEFAULT_PAGE) => Math.max(1, Math.min(MAX_INDEXER_PAGE, Math.floor(limit ?? fallback)));

const notFound = (what: string) => new IndexerError("not-found", `${what} not found`, { httpStatus: 404 });

/** A finished game of any player, as the leaderboard and the reports read it. */
interface Played {
  player: string;
  gameId: number;
  startTime: number;
  /** When it ended; it counts for the day it ended on. */
  endTime: number;
  score: number;
  free: boolean;
}

/** The row of a player in a day: its best game, by score then the earliest end. */
interface DayRow {
  playerId: string;
  best: Played;
  gamesPlayed: number;
  gamesFinished: number;
}

const ranked = (a: Played, b: Played) => b.score - a.score || a.endTime - b.endTime;

/** A seeded game as a finished game of its player. */
const seededPlayed = (player: SeededPlayer, g: SeededGame): Played => ({ player: addressKey(player.address), gameId: g.gameId, startTime: g.startTime, endTime: g.endTime, score: g.score, free: false });

/** A seeded game as the indexer's row. */
function seededIndexed(g: SeededGame): IndexedGame {
  const day = dayOfTime(g.startTime);
  return { contract: "challenge", gameId: g.gameId, mode: CHALLENGE_MODE, startTime: g.startTime, dayId: day, over: true, score: g.score, countedDayId: day, endTime: g.endTime, free: false, tokenId: null, economy: null };
}

/**
 * The mock's indexer on `ledger`. Each answer's head is the ledger's clock, never behind. The ledger counts a day's dailies
 * done through it for the milestones' claims (`countDailiesWith`).
 */
export function mockIndexer(ledger: MockLedger): IndexerClient {
  const now = () => ledger.seconds();
  const answer = <T>(data: T): IndexerAnswer<T> => {
    const timestamp = now();
    return { data, head: { number: timestamp, hash: `0x${timestamp.toString(16)}`, timestamp }, behind: 0, freshness: { kind: "ok", blocks: 0 } };
  };

  const gamesOf = (playerId: string | bigint): StoredGame[] => {
    const key = addressKey(String(playerId));
    return ledger
      .challengeGames()
      .filter((g) => g.player === key)
      .sort((a, b) => b.start - a.start || b.id - a.id);
  };

  /** A stored game as the indexer's row: `GameOver.end_time` and its day only for a game over on the day it started (`end_in_day`). */
  const indexed = async (g: StoredGame): Promise<IndexedGame> => {
    const over = g.end !== 0;
    const day = dayOfTime(g.start);
    const counted = over && dayOfTime(g.end) === day;
    const base = { contract: "challenge" as const, gameId: g.id, mode: CHALLENGE_MODE, startTime: g.start, dayId: day, over, score: over ? replayOf(g).score : 0, countedDayId: counted ? day : 0, endTime: counted ? g.end : 0, free: g.stake === 0, tokenId: null };
    if (g.stake === 0) return { ...base, economy: null };
    // The contract's threshold once settled: the closed day's mean, shifted by the game's sigma.
    const threshold = g.settled ? thresholdOfMean((await ledger.day(day)).mean, g.sigmaBps) : null;
    return {
      ...base,
      economy: {
        day,
        stake: g.stake,
        price: g.price,
        referrer: null,
        referral: "0",
        burned: "0",
        factor: MOCK_FACTOR_BPS,
        reference: g.reference,
        purchasedAt: g.start,
        recorded: g.recorded,
        expired: g.expired,
        settled: g.settled,
        threshold,
        reward: g.settled ? g.reward : null,
      },
    };
  };

  /** The device's finished games, of every account: what the reports and the leaderboard count. */
  const finished = (): (Played & { stored: StoredGame })[] =>
    ledger
      .challengeGames()
      .filter((g) => g.end !== 0)
      .map((g) => ({ player: g.player, gameId: g.id, startTime: g.start, endTime: g.end, score: replayOf(g).score, free: g.stake === 0, stored: g }));

  // --- The leaderboard ------------------------------------------------------------------------------------------------

  /** The players of `day`, ranked: the games over on the day they started (`GameOver.day_id`), the device's and the seeded players'. */
  const rowsOf = (day: number): DayRow[] => {
    const rows = new Map<string, DayRow>();
    const add = (playerId: string, spawned: number, games: Played[]) => {
      const best = [...games].sort(ranked)[0];
      if (!best) return;
      rows.set(playerId, { playerId, best, gamesPlayed: spawned, gamesFinished: games.length });
    };
    const device = new Map<string, { spawned: number; games: Played[] }>();
    for (const g of ledger.challengeGames()) {
      if (dayOfTime(g.start) !== day) continue;
      const row = device.get(g.player) ?? { spawned: 0, games: [] };
      row.spawned += 1;
      if (g.end !== 0 && dayOfTime(g.end) === day) row.games.push({ player: g.player, gameId: g.id, startTime: g.start, endTime: g.end, score: replayOf(g).score, free: g.stake === 0 });
      device.set(g.player, row);
    }
    for (const [player, row] of device) add(player, row.spawned, row.games);
    for (const p of SEEDED_PLAYERS) {
      const games = seededDay(p, day, now()).map((g) => seededPlayed(p, g));
      add(addressKey(p.address), games.length, games);
    }
    return [...rows.values()].sort((a, b) => ranked(a.best, b.best));
  };

  const entryOf = async (row: DayRow, rank: number): Promise<LeaderboardEntry> => ({
    rank,
    playerId: indexerId(row.playerId),
    bestScore: row.best.score,
    bestGameId: row.best.gameId,
    gamesPlayed: row.gamesPlayed,
    gamesFinished: row.gamesFinished,
    finishedAt: row.best.endTime,
    free: row.best.free,
    name: await ledger.name(row.playerId),
  });

  /** The days with a leaderboard: from the seeded players' first (or the device's first game, if earlier) to today. */
  const firstDay = () => Math.min(SEEDED_FROM_DAY, ...ledger.challengeGames().map((g) => dayOfTime(g.start)));

  const summaryOf = (day: number): Omit<TournamentDetail, "economy"> => {
    const rows = rowsOf(day);
    return {
      id: day,
      startTime: day * DAY_S,
      endTime: (day + 1) * DAY_S,
      // Every game spawned that day, a player's who finished none included.
      gamesSpawned: ledger.challengeGames().filter((g) => dayOfTime(g.start) === day).length + SEEDED_PLAYERS.reduce((n, p) => n + seededDay(p, day, now()).length, 0),
      gamesFinished: rows.reduce((n, r) => n + r.gamesFinished, 0),
      players: rows.length,
      bestScore: rows[0]?.best.score ?? 0,
    };
  };

  /** The days a player took a place in the top 3 of, closed (before today): the podium the indexer credits (task 8). */
  const podiums = (playerId: string): number[] => {
    const key = addressKey(String(playerId));
    const today = dayOfTime(now());
    const days = new Set(finished().filter((g) => g.player === key && dayOfTime(g.startTime) === dayOfTime(g.endTime)).map((g) => dayOfTime(g.endTime)));
    return [...days].filter((d) => d < today && rowsOf(d).slice(0, 3).some((r) => r.playerId === key)).sort((a, b) => a - b);
  };

  // --- The quests and achievements ------------------------------------------------------------------------------------

  const definitions = (): Definitions => ledger.definitions(withMockDailies(FRESH_DEFINITIONS));

  /** A task's count and when it reached its total, over `reports` (end time, counts by task), oldest first. */
  const progressOf = (task: TaskTarget, reports: readonly { time: number; counts: Partial<Record<number, number>> }[]) => {
    let count = 0;
    let completedAt: number | null = null;
    for (const r of reports) {
      count += r.counts[task.taskId] ?? 0;
      if (completedAt === null && count >= task.total) completedAt = r.time;
    }
    return { count: Math.min(count, task.total), completedAt };
  };

  const questsOf = (playerId: string | bigint, day: number): PlayerQuests => {
    const key = addressKey(String(playerId));
    // A free game reports no quest progress (`Challenge.finish`, cobbles v1 4.2).
    const games = finished()
      .filter((g) => g.player === key && !g.free)
      .sort((a, b) => a.endTime - b.endTime);
    const quests = definitions()
      .quests.filter((q) => !q.retired)
      .map((d) => ({ d, schedule: { start: d.startTime, interval: d.interval, duration: d.duration } }))
      .filter(({ schedule }) => isLiveOnDay(schedule, day))
      .map(({ d, schedule }): PlayerQuest => {
        // The window live on that day: the one open at its start, or the one that opens during it.
        const w = questWindow(schedule, day * DAY_S);
        const intervalId = w.active ? w.intervalId : w.intervalId + 1;
        const opens = d.interval > 0 ? d.startTime + intervalId * d.interval : d.startTime;
        const reports = games.filter((g) => g.endTime >= opens && g.endTime < opens + d.duration).map((g) => ({ time: g.endTime, counts: questCounts(tallyOf(g.stored)) }));
        const tasks = d.tasks.map((t) => ({ taskId: t.taskId, total: t.total, ...progressOf(t, reports) }));
        const completed = tasks.every((t) => t.count >= t.total);
        return { questId: d.questId, intervalId, tasks: tasks.map(({ taskId, total, count }) => ({ taskId, total, count })), completed, completedAt: completed ? Math.max(...tasks.map((t) => t.completedAt ?? 0)) : null, retired: false };
      });
    return { playerId: indexerId(playerId), day, startTime: day * DAY_S, endTime: (day + 1) * DAY_S, quests };
  };

  const achievementsOf = (playerId: string | bigint): PlayerAchievements => {
    const key = addressKey(String(playerId));
    const reports = [
      ...finished()
        .filter((g) => g.player === key)
        .map((g) => ({ time: g.endTime, counts: achievementCounts(tallyOf(g.stored)) })),
      // A podium is credited once its day closed.
      ...podiums(key).map((d) => ({ time: (d + 1) * DAY_S, counts: { [TASK.podium]: 1 } })),
    ].sort((a, b) => a.time - b.time);
    const achievements = definitions().achievements.map((d) => {
      const tasks = d.tasks.map((t) => ({ taskId: t.taskId, total: t.total, ...progressOf(t, reports) }));
      const completed = tasks.every((t) => t.count >= t.total);
      return {
        achievementId: d.achievementId,
        points: d.points,
        tasks: tasks.map(({ taskId, total, count }) => ({ taskId, total, count })),
        completed,
        completedAt: completed ? Math.max(...tasks.map((t) => t.completedAt ?? 0)) : null,
        retired: d.retired,
      };
    });
    return { playerId: indexerId(playerId), points: achievements.filter((a) => a.completed).reduce((sum, a) => sum + a.points, 0), achievements };
  };

  ledger.countDailiesWith(async (playerId, day) => dailiesDone(definitions(), questsOf(playerId, day)));

  // --- The players ----------------------------------------------------------------------------------------------------

  const seededGames = (p: SeededPlayer): SeededGame[] => {
    const games: SeededGame[] = [];
    for (let day = dayOfTime(now()); day >= SEEDED_FROM_DAY; day--) games.push(...seededDay(p, day, now()).reverse());
    return games;
  };

  const profileOf = async (playerId: string | bigint): Promise<PlayerProfile> => {
    const seeded = seededPlayer(playerId);
    if (seeded) {
      const games = seededGames(seeded);
      const stats: PlayerStats = { challengeGames: games.length, challengeFinished: games.length, bestScore: Math.max(0, ...games.map((g) => g.score)), paidGames: games.length, settledGames: 0, rewards: "0" };
      return { player: { playerId: indexerId(playerId), name: seeded.name, created: SEEDED_FROM_DAY * DAY_S }, stats };
    }
    // A rival village of the mock (`mock/pvp.ts`, `v2.ts`) plays no Challenge: its name alone.
    const rival = ledger.rivalName(String(playerId));
    if (rival !== null) return { player: { playerId: indexerId(playerId), name: rival, created: null }, stats: null };
    const games = gamesOf(playerId);
    if (games.length === 0 && !ledger.knows(String(playerId))) return { player: null, stats: null };
    const over = games.filter((g) => g.end !== 0);
    const bought = games.filter((g) => g.stake > 0);
    const settled = bought.filter((g) => g.settled);
    const stats: PlayerStats = {
      challengeGames: games.length,
      challengeFinished: over.length,
      bestScore: Math.max(0, ...over.map((g) => replayOf(g).score)),
      paidGames: bought.length,
      settledGames: settled.length,
      rewards: settled.reduce((sum, g) => sum + BigInt(g.reward), 0n).toString(),
    };
    const created = games.length ? Math.min(...games.map((g) => g.start)) : null;
    return { player: { playerId: indexerId(playerId), name: await ledger.name(String(playerId)), created }, stats };
  };

  const playerGames = async (playerId: string | bigint, params: { contract?: IndexerContract; limit?: number; before?: string } = {}): Promise<PlayerGames> => {
    const seeded = seededPlayer(playerId);
    const all: { gameId: number; row: () => Promise<IndexedGame> }[] = seeded
      ? seededGames(seeded).map((g) => ({ gameId: g.gameId, row: async () => seededIndexed(g) }))
      : gamesOf(playerId).map((g) => ({ gameId: g.id, row: () => indexed(g) }));
    const from = params.before === undefined ? 0 : all.findIndex((g) => String(g.gameId) === params.before) + 1;
    const limit = pageOf(params.limit, 20);
    const page = from > 0 || params.before === undefined ? all.slice(from, from + limit) : [];
    const more = from + limit < all.length && page.length === limit;
    return { games: await Promise.all(page.map((g) => g.row())), next: more ? String(page.at(-1)!.gameId) : null };
  };

  const client = {
    maxLag: 5,
    head: async () => answer({ state: "ok", chainId: "mock", fromBlock: 0, contracts: {} }),
    tournaments: async (params: { limit?: number; before?: number } = {}) => {
      const limit = pageOf(params.limit, 20);
      const top = params.before === undefined ? dayOfTime(now()) : params.before - 1;
      const first = firstDay();
      const tournaments: TournamentSummary[] = [];
      for (let day = top; day >= first && tournaments.length < limit; day--) {
        const { id, startTime, endTime, gamesSpawned, players, bestScore } = summaryOf(day);
        tournaments.push({ id, startTime, endTime, gamesSpawned, players, bestScore });
      }
      const last = tournaments.at(-1);
      return answer<TournamentList>({ tournaments, next: last && last.id > first ? last.id : null });
    },
    tournament: async (id: number | bigint) => {
      const day = Number(id);
      const summary = summaryOf(day);
      const bought = ledger.challengeGames().filter((g) => g.stake > 0 && dayOfTime(g.start) === day);
      const view = await ledger.day(day);
      const detail: TournamentDetail = {
        ...summary,
        economy: {
          gamesPurchased: bought.length,
          gamesRecorded: bought.filter((g) => g.recorded).length,
          gamesSettled: bought.filter((g) => g.settled).length,
          unsettled: bought.filter((g) => g.recorded && !g.settled).map((g) => g.id),
          rewards: bought.reduce((sum, g) => sum + BigInt(g.reward), 0n).toString(),
          closed: view.closed,
          mean: view.closed ? view.mean : null,
          weight: view.closed ? view.weight : null,
          prior: view.prior || null,
          emaAfter: null,
          closedAt: null,
        },
      };
      return answer(detail);
    },
    leaderboard: async (id: number | bigint, params: { limit?: number; offset?: number } = {}) => {
      const day = Number(id);
      const rows = rowsOf(day);
      const offset = Math.max(0, Math.floor(params.offset ?? 0));
      const limit = pageOf(params.limit);
      const entries = await Promise.all(rows.slice(offset, offset + limit).map((r, i) => entryOf(r, offset + i + 1)));
      const board: Leaderboard = { tournamentId: day, startTime: day * DAY_S, endTime: (day + 1) * DAY_S, total: rows.length, entries, nextOffset: offset + limit < rows.length ? offset + limit : null };
      return answer(board);
    },
    player: async (playerId: string | bigint) => answer(await profileOf(playerId)),
    playerGames: async (playerId: string | bigint, params: { contract?: IndexerContract; limit?: number; before?: string } = {}) => answer(await playerGames(playerId, params)),
    playerTournament: async (playerId: string | bigint, id: number | bigint) => {
      const key = addressKey(String(playerId));
      const rows = rowsOf(Number(id));
      const at = rows.findIndex((r) => r.playerId === key);
      return answer(at < 0 ? null : await entryOf(rows[at]!, at + 1));
    },
    game: async (_contract: IndexerContract, gameId: number) => {
      const stored = ledger.challengeGames().find((g) => g.id === gameId);
      if (stored) return answer(await indexed(stored));
      const seeded = seededGame(gameId, now());
      if (seeded) return answer(seededIndexed(seeded.game));
      throw notFound("game");
    },
    definitions: async () => answer(definitions()),
    playerQuests: async (playerId: string | bigint, params: { day?: number } = {}) => answer(questsOf(playerId, params.day ?? dayOfTime(now()))),
    playerAchievements: async (playerId: string | bigint) => answer(achievementsOf(playerId)),
    playerReferrals: async (playerId: string | bigint) => answer(ledger.referrals(String(playerId))),
    playerAttacks: async (playerId: string | bigint, side: "attacker" | "defender", params: { limit?: number } = {}) => answer(ledger.attacksOf(String(playerId), side).slice(0, params.limit ?? 50)),
    playerAttack: async (attacker: string | bigint, id: number) => {
      const row = ledger.attacksOf(String(attacker), "attacker").find((a) => a.id === id);
      if (!row) throw notFound("attack");
      return answer(row);
    },
  } satisfies { [K in keyof IndexerClient]: IndexerClient[K] };
  // `IndexerClient` is a class with private fields: the mock has its public reads only, which is all a caller can reach.
  return client as unknown as IndexerClient;
}
