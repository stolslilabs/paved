// The queries of the read API (docs/architecture/indexer.md). Derived data are queries, not tables: the leaderboard is a
// window function over `games`, and the prize slots replay a tournament's counting games in chain order.
//
// Every query is read as of a served block `head` (a number): a game spawned after it is not there, a game finished after
// it is still running. The tables hold the state at the stored tip, which may be above the served block while a batch is
// being checked, so the block columns are compared with `head` here, never assumed.
import type { SQLInputValue } from "node:sqlite";
import {
  TOURNAMENT_DURATION,
  type GameContract,
  type GameRow,
  type LeaderboardEntry,
  type PlayerInfo,
  type PlayerStats,
  type PrizeSlot,
  type TournamentDetail,
  type TournamentSummary,
} from "./api.ts";
import { padded, shortString } from "./events.ts";
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
  private readonly store: Store;

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
}
