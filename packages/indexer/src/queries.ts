// The queries of the read API (docs/architecture/indexer.md). Derived data are queries, not tables: the leaderboard is a
// window function over `games`, and the prize slots replay a tournament's counting games in chain order.
//
// Every query is read as of a served block `head` (a number): a game spawned after it is not there, a game finished after
// it is still running. The tables hold the state at the stored tip, which may be above the served block while a batch is
// being checked, so the block columns are compared with `head` here, never assumed.
import type { SQLInputValue } from "node:sqlite";
import {
  TOURNAMENT_DURATION,
  type AchievementDefinition,
  type GameContract,
  type GameRow,
  type LeaderboardEntry,
  type PlayerAchievement,
  type PlayerInfo,
  type PlayerQuest,
  type PlayerStats,
  type QuestDefinition,
  type PrizeSlot,
  type TournamentDetail,
  type TournamentSummary,
} from "./api.ts";
import { padded, shortString, type TaskTarget } from "./events.ts";
import {
  PODIUM_TASK,
  consistent,
  firstActive,
  inWindow,
  intervalId,
  intervalSpan,
  replay,
  type ProgressRow,
  type Schedule,
} from "./quests.ts";
import type { Store } from "./store.ts";

type Row = Record<string, SQLInputValue>;

/** One slot of the contract's top 3, and the game that holds it. */
export type Slot = { playerId: string; score: number; gameId: number } | null;

/**
 * The three prize slots of `Tournament`, replayed with the exact rule of `Tournament.score`
 * (contracts/src/models/tournament.cairo) over the counting games in chain order. A score that is not above the third
 * slot's (0 when empty) is dropped; an equal score never displaces an earlier one.
 */
export function replaySlots(
  games: readonly { playerId: string; score: number; gameId: number }[],
): [Slot, Slot, Slot] {
  const slots: [Slot, Slot, Slot] = [null, null, null];
  const top = (slot: Slot) => slot?.score ?? 0;
  for (const game of games) {
    if (game.score <= top(slots[2])) continue;
    const entry = { ...game };
    if (game.score <= top(slots[1])) {
      slots[2] = entry;
    } else if (game.score <= top(slots[0])) {
      slots[2] = slots[1];
      slots[1] = entry;
    } else {
      slots[2] = slots[1];
      slots[1] = slots[0];
      slots[0] = entry;
    }
  }
  return slots;
}

export const slotView = (slot: Slot): PrizeSlot => ({
  player_id: slot ? slot.playerId : padded(0n),
  score: slot ? slot.score : 0,
});

const nameOf = (value: SQLInputValue | undefined): string | null =>
  typeof value === "string" ? shortString(BigInt(value)) : null;

/** A game row as the API serves it, read at `head`: a finish above `head` has not happened yet. */
function gameRow(row: Row, head: number): GameRow {
  const over = row.over === 1 && Number(row.over_block) <= head;
  return {
    contract: row.contract as GameContract,
    game_id: Number(row.game_id),
    player_id: String(row.player_id),
    mode: Number(row.mode),
    start_time: Number(row.start_time),
    tournament_id: Number(row.spawn_tournament),
    over,
    score: over ? Number(row.score) : null,
    counted_tournament_id: over ? Number(row.tournament_id) : null,
    end_time: over ? Number(row.end_time) : null,
  };
}

const GAME_COLUMNS = `contract, game_id, player_id, mode, spawn_tournament, start_time, over, score, tournament_id,
  end_time, over_block`;

/** The leaderboard of a tournament: one row per player, the best game, ranked (see the file header of the design). */
const BOARD = `
  WITH counted AS (
    SELECT player_id, game_id, score, end_time, over_block, over_tx, over_idx,
      ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY score DESC, over_block, over_tx, over_idx) AS pr
    FROM games
    WHERE over = 1 AND tournament_id = :t AND over_block <= :h
  ),
  best AS (SELECT * FROM counted WHERE pr = 1),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, over_block, over_tx, over_idx) AS rank FROM best
  )
  SELECT ranked.rank AS rank, ranked.player_id AS player_id, players.name AS name,
    ranked.score AS best_score, ranked.game_id AS best_game_id, ranked.end_time AS finished_at,
    (SELECT count(*) FROM counted c WHERE c.player_id = ranked.player_id) AS games_finished,
    (SELECT count(*) FROM games g WHERE g.contract = 'daily' AND g.spawn_tournament = :t
       AND g.player_id = ranked.player_id AND g.spawned_block <= :h) AS games_played
  FROM ranked LEFT JOIN players ON players.player_id = ranked.player_id
  WHERE (:p IS NULL OR ranked.player_id = :p)
  ORDER BY ranked.rank
  LIMIT :limit OFFSET :offset`;

export class Queries {
  readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  // --- tournaments ---------------------------------------------------------------------------------

  /** The summary of a tournament; zeros for a day with no game. Id 0 is no tournament (a game that did not count). */
  tournament(head: number, id: number): TournamentDetail {
    const none = id === 0;
    const spawned = none
      ? 0
      : Number(
          (
            this.store
              .statement(
                "SELECT count(*) AS n FROM games WHERE contract = 'daily' AND spawn_tournament = ? AND spawned_block <= ?",
              )
              .get(id, head) as Row
          ).n,
        );
    const counted = none
      ? { finished: 0, players: 0, best: 0 }
      : (this.store
          .statement(
            `SELECT count(*) AS finished, count(DISTINCT player_id) AS players, coalesce(max(score), 0) AS best
             FROM games WHERE over = 1 AND tournament_id = ? AND over_block <= ?`,
          )
          .get(id, head) as { finished: number; players: number; best: number });
    return {
      id,
      start_time: id * TOURNAMENT_DURATION,
      end_time: (id + 1) * TOURNAMENT_DURATION,
      games_spawned: spawned,
      games_finished: Number(counted.finished),
      players: Number(counted.players),
      best_score: Number(counted.best),
    };
  }

  /** Tournaments with at least one game spawned, newest first, strictly below `before`; `next` when more remain. */
  tournaments(
    head: number,
    limit: number,
    before: number | undefined,
  ): { tournaments: TournamentSummary[]; next: number | null } {
    const ids = (
      this.store
        .statement(
          `SELECT spawn_tournament AS id FROM games
           WHERE contract = 'daily' AND spawn_tournament > 0 AND spawned_block <= :h
             AND (:before IS NULL OR spawn_tournament < :before)
           GROUP BY spawn_tournament ORDER BY spawn_tournament DESC LIMIT :n`,
        )
        .all({ h: head, before: before ?? null, n: limit + 1 }) as Row[]
    ).map((row) => Number(row.id));
    const page = ids.slice(0, limit);
    return {
      tournaments: page.map((id) => {
        const { games_finished: _finished, ...summary } = this.tournament(head, id);
        return summary;
      }),
      next: ids.length > limit ? page[page.length - 1]! : null,
    };
  }

  /** The prize slots of a tournament, replayed from its counting games in chain order. */
  slots(head: number, id: number): [Slot, Slot, Slot] {
    if (id === 0) return [null, null, null];
    const games = (
      this.store
        .statement(
          `SELECT player_id, game_id, score FROM games
           WHERE over = 1 AND tournament_id = ? AND over_block <= ?
           ORDER BY over_block, over_tx, over_idx`,
        )
        .all(id, head) as Row[]
    ).map((row) => ({
      playerId: String(row.player_id),
      gameId: Number(row.game_id),
      score: Number(row.score),
    }));
    return replaySlots(games);
  }

  private entries(
    head: number,
    id: number,
    player: string | null,
    limit: number,
    offset: number,
  ): LeaderboardEntry[] {
    if (id === 0) return [];
    const slots = this.slots(head, id);
    return (
      this.store
        .statement(BOARD)
        .all({ t: id, h: head, p: player, limit, offset }) as Row[]
    ).map((row) => ({
      rank: Number(row.rank),
      player_id: String(row.player_id),
      name: nameOf(row.name),
      best_score: Number(row.best_score),
      best_game_id: Number(row.best_game_id),
      games_played: Number(row.games_played),
      games_finished: Number(row.games_finished),
      finished_at: Number(row.finished_at),
      prize_ranks: slots.flatMap((slot, index) =>
        slot?.playerId === row.player_id ? [index + 1] : [],
      ),
    }));
  }

  /** A page of the leaderboard, and the number of players ranked. */
  leaderboard(
    head: number,
    id: number,
    limit: number,
    offset: number,
  ): { total: number; entries: LeaderboardEntry[] } {
    return {
      total: this.tournament(head, id).players,
      entries: this.entries(head, id, null, limit, offset),
    };
  }

  /** One player's row of a tournament's leaderboard, or null. */
  entry(head: number, id: number, player: string): LeaderboardEntry | null {
    return this.entries(head, id, player, 1, 0)[0] ?? null;
  }

  /** The ids of the tournaments with games, over at `timestamp`: the days whose slots cannot move any more. */
  closedTournaments(head: number, timestamp: number): number[] {
    return (
      this.store
        .statement(
          `SELECT DISTINCT spawn_tournament AS id FROM games
           WHERE contract = 'daily' AND spawn_tournament > 0 AND spawned_block <= :h
             AND (spawn_tournament + 1) * :duration <= :now
           ORDER BY id`,
        )
        .all({ h: head, duration: TOURNAMENT_DURATION, now: timestamp }) as Row[]
    ).map((row) => Number(row.id));
  }

  // --- players and games ---------------------------------------------------------------------------

  player(
    head: number,
    playerId: string,
  ): { player: PlayerInfo; stats: PlayerStats } | null {
    const row = this.store
      .statement(
        "SELECT player_id, name, created_time FROM players WHERE player_id = ? AND created_block <= ?",
      )
      .get(playerId, head) as Row | undefined;
    if (!row) return null;
    const count = (sql: string) =>
      Number(
        (this.store.statement(sql).get(playerId, head) as Row).n,
      );
    const best = (
      this.store
        .statement(
          `SELECT max(score) AS best FROM games
           WHERE player_id = ? AND contract = 'daily' AND over = 1 AND over_block <= ?`,
        )
        .get(playerId, head) as Row
    ).best;
    return {
      player: {
        player_id: String(row.player_id),
        name: nameOf(row.name),
        created: Number(row.created_time),
      },
      stats: {
        daily_games: count(
          "SELECT count(*) AS n FROM games WHERE player_id = ? AND contract = 'daily' AND spawned_block <= ?",
        ),
        daily_finished: count(
          "SELECT count(*) AS n FROM games WHERE player_id = ? AND contract = 'daily' AND over = 1 AND over_block <= ?",
        ),
        best_score: best === null || best === undefined ? null : Number(best),
        tutorial_games: count(
          "SELECT count(*) AS n FROM games WHERE player_id = ? AND contract = 'tutorial' AND spawned_block <= ?",
        ),
      },
    };
  }

  /** A player's games, newest first (start time, then contract, then id, all descending), strictly after `before`. */
  games(
    head: number,
    playerId: string,
    contract: GameContract | undefined,
    limit: number,
    before: { startTime: number; contract: GameContract; gameId: number } | undefined,
  ): { games: GameRow[]; next: string | null } {
    const rows = this.store
      .statement(
        `SELECT ${GAME_COLUMNS} FROM games
         WHERE player_id = :p AND spawned_block <= :h
           AND (:contract IS NULL OR contract = :contract)
           AND (:cursor = 0 OR (start_time, contract, game_id) < (:cs, :cc, :cg))
         ORDER BY start_time DESC, contract DESC, game_id DESC LIMIT :n`,
      )
      .all({
        p: playerId,
        h: head,
        contract: contract ?? null,
        cursor: before ? 1 : 0,
        cs: before?.startTime ?? 0,
        cc: before?.contract ?? "",
        cg: before?.gameId ?? 0,
        n: limit + 1,
      }) as Row[];
    const page = rows.slice(0, limit).map((row) => gameRow(row, head));
    const last = page[page.length - 1];
    return {
      games: page,
      next:
        rows.length > limit && last
          ? `${last.start_time}:${last.contract}:${last.game_id}`
          : null,
    };
  }

  game(head: number, contract: GameContract, gameId: number): GameRow | null {
    const row = this.store
      .statement(
        `SELECT ${GAME_COLUMNS} FROM games WHERE contract = ? AND game_id = ? AND spawned_block <= ?`,
      )
      .get(contract, gameId, head) as Row | undefined;
    return row ? gameRow(row, head) : null;
  }

  // --- quests and achievements ---------------------------------------------------------------------

  /** The definitions defined at `head`, by id; a retirement above `head` has not happened yet. */
  definitions(head: number): { quests: QuestDefinition[]; achievements: AchievementDefinition[] } {
    return {
      quests: this.questRows(head).map((row) => questDefinition(row, head)),
      achievements: this.achievementRows(head).map((row) => achievementDefinition(row, head)),
    };
  }

  /** The consistent quest definitions at `head` (see `consistent`); the others are served nowhere. */
  private questRows(head: number): Row[] {
    return this.allQuestRows(head).filter(hasConsistentTasks);
  }

  private achievementRows(head: number): Row[] {
    return this.allAchievementRows(head).filter(hasConsistentTasks);
  }

  private allQuestRows(head: number): Row[] {
    return this.store
      .statement("SELECT * FROM quests WHERE def_block <= ? ORDER BY quest_id")
      .all(head) as Row[];
  }

  private allAchievementRows(head: number): Row[] {
    return this.store
      .statement("SELECT * FROM achievements WHERE def_block <= ? ORDER BY achievement_id")
      .all(head) as Row[];
  }

  /** How many quest and achievement definitions at `head` are excluded as inconsistent (`checks.definitions_excluded`). */
  excludedDefinitions(head: number): number {
    const all = this.allQuestRows(head).length + this.allAchievementRows(head).length;
    return all - this.questRows(head).length - this.achievementRows(head).length;
  }

  /**
   * A player's quests of a UTC day: every quest whose schedule is active at some second of the day (a quest retired
   * before the day began is not on its board), with the progress of the interval that second falls in. The reports of that
   * interval count in chain order up to the quest's retirement, per task saturated at its total.
   */
  playerQuests(head: number, playerId: string, day: number): PlayerQuest[] {
    const dayStart = day * TOURNAMENT_DURATION;
    const quests: PlayerQuest[] = [];
    for (const row of this.questRows(head)) {
      const retired = retiredAt(row, head);
      if (retired !== null && retired <= dayStart) continue;
      const schedule = scheduleOf(row);
      const reference = firstActive(schedule, dayStart, dayStart + TOURNAMENT_DURATION);
      if (reference === null) continue;
      const interval = intervalId(schedule, reference)!;
      const span = intervalSpan(schedule, interval);
      const tasks = JSON.parse(String(row.tasks)) as TaskTarget[];
      const rows = (
        this.store
          .statement(
            `SELECT task_id, count, time FROM progress
             WHERE kind = 'quest' AND player_id = :p AND block <= :h AND time >= :from AND time < :to
               AND (:rb IS NULL OR (block, tx, idx) < (:rb, :rt, :ri))
             ORDER BY block, tx, idx`,
          )
          .all({
            p: playerId,
            h: head,
            from: span.from,
            to: span.to,
            rb: retired === null ? null : Number(row.retired_block),
            rt: retired === null ? null : Number(row.retired_tx),
            ri: retired === null ? null : Number(row.retired_idx),
          }) as Row[]
      ).map(progressRow);
      const progress = replay(tasks, rows);
      quests.push({
        quest_id: Number(row.quest_id),
        interval_id: interval,
        tasks: progress.tasks,
        completed: progress.completed,
        completed_at: progress.completedAt,
        retired: retired !== null,
      });
    }
    return quests;
  }

  /**
   * A player's achievements: for each, the reports in its window and before its retirement (the chain's, and the podium
   * credits of the days closed at `head`), per task saturated at its total. A completed achievement is kept.
   */
  playerAchievements(head: number, playerId: string): { points: number; achievements: PlayerAchievement[] } {
    const rows = (
      this.store
        .statement(
          `SELECT block, tx, idx, task_id, count, time FROM (
             SELECT block, tx, idx, task_id, count, time FROM progress
             WHERE kind = 'achievement' AND player_id = :p AND block <= :h AND task_id <> ${PODIUM_TASK}
             UNION ALL
             SELECT close_block AS block, -1 AS tx, tournament_id AS idx, ${PODIUM_TASK} AS task_id, 1 AS count,
               day_end AS time
             FROM podium WHERE player_id = :p AND close_block <= :h
           ) ORDER BY block, tx, idx`,
        )
        .all({ p: playerId, h: head }) as Row[]
    ).map((row) => ({ ...progressRow(row), position: [Number(row.block), Number(row.tx), Number(row.idx)] }));
    let points = 0;
    const achievements = this.achievementRows(head).map((row): PlayerAchievement => {
      const retired =
        row.retired_block !== null && Number(row.retired_block) <= head
          ? [Number(row.retired_block), Number(row.retired_tx), Number(row.retired_idx)]
          : null;
      const start = Number(row.start_time);
      const end = Number(row.end_time);
      const counted = rows.filter(
        (found) => inWindow(start, end, found.time) && (retired === null || before(found.position, retired)),
      );
      const progress = replay(JSON.parse(String(row.tasks)) as TaskTarget[], counted);
      if (progress.completed) points += Number(row.points);
      return {
        achievement_id: Number(row.achievement_id),
        points: Number(row.points),
        tasks: progress.tasks,
        completed: progress.completed,
        completed_at: progress.completedAt,
        retired: retired !== null,
      };
    });
    return { points, achievements };
  }
}

const hasConsistentTasks = (row: Row): boolean => consistent(JSON.parse(String(row.tasks)) as TaskTarget[]);

const progressRow = (row: Row): ProgressRow => ({
  taskId: Number(row.task_id),
  count: Number(row.count),
  time: Number(row.time),
});

/** Whether chain position `a` (block, transaction, event) comes before `b`. */
function before(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  return false;
}

/** The time of a retirement at or below `head`, else null. */
const retiredAt = (row: Row, head: number): number | null =>
  row.retired_block !== null && Number(row.retired_block) <= head ? Number(row.retired_time) : null;

const scheduleOf = (row: Row): Schedule => ({
  start: Number(row.start_time),
  end: Number(row.end_time),
  duration: Number(row.duration),
  period: Number(row.period),
});

const taskTargets = (row: Row) =>
  (JSON.parse(String(row.tasks)) as TaskTarget[]).map((task) => ({ task_id: task.taskId, total: task.total }));

function questDefinition(row: Row, head: number): QuestDefinition {
  const retired = retiredAt(row, head);
  return {
    quest_id: Number(row.quest_id),
    start_time: Number(row.start_time),
    end_time: Number(row.end_time),
    duration: Number(row.duration),
    interval: Number(row.period),
    tasks: taskTargets(row),
    conditions: JSON.parse(String(row.conditions)) as number[],
    defined_at: Number(row.def_time),
    retired: retired !== null,
    retired_at: retired,
  };
}

function achievementDefinition(row: Row, head: number): AchievementDefinition {
  const retired = retiredAt(row, head);
  return {
    achievement_id: Number(row.achievement_id),
    start_time: Number(row.start_time),
    end_time: Number(row.end_time),
    tasks: taskTargets(row),
    points: Number(row.points),
    defined_at: Number(row.def_time),
    retired: retired !== null,
    retired_at: retired,
  };
}
