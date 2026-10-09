// Copied from Grim World, indexer/src/store.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: the skeleton (meta table, schema-version refusal, `blocks`, raw `events`, WAL, rewind and
// prune) is kept; the market tables are replaced by `players` and `games`, and the block-versioned rows (`_from`/`_to`)
// by block columns (docs/architecture/indexer.md, Storage: a game row changes at most twice, spawn then over, and never
// back). This copy is maintained by the Paved repository.
//
// The indexer's tables, in SQLite (node:sqlite). Bounded integers (game id, score, mode, tournament id, every time: all
// below 2^53) are INTEGER; only felts (player id, price, name, master) are fixed-width lowercase hex text, 66 characters.
//
// Rewinding to a block F is one transaction: the rows created after F are deleted, and the games finished after F go back
// to unfinished. Pruning forgets the headers below the kept history; the rows stay (they are the state, not a history).
//
// Idempotence: an event whose (block, tx, idx) is already in `events` is skipped, so applying one block twice changes
// nothing. A duplicate game is never merged: a GameOver for a game with no GameSpawned, a second GameOver for one game, a
// GameSpawned for an existing id, a second PlayerCreated, a mode that does not match its contract, or an event of a
// contract that does not emit it, halts the indexer (what it holds is not the chain's).
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from "node:sqlite";
import type { Header, RawEvent } from "./chain.ts";
import { canonical, MODE, padded, type Decoded, type Source } from "./events.ts";
import { TUTORIAL_TASK } from "./quests.ts";

/** An invariant failed: the indexer stops following and answers `halted`, with this reason. */
export class Halt extends Error {}

/** A database of another schema version: `rebuild` it. */
export class SchemaMismatch extends Error {}

/** What a database was built for; a database is never reused for another configuration. */
export type Config = {
  daily: string;
  tutorial: string;
  account: string;
  /** The first block indexed (the contracts' deployment block). */
  from: number;
  /** The chain id of the deployment file, as a canonical felt. */
  chainId: string;
};

export type Applied = { raw: RawEvent; event: Decoded };

/** The layout of the tables. A database of another version is refused when it is opened: the indexer is rebuilt from the chain, never migrated. */
export const SCHEMA_VERSION = "3";

/** The sha256 of the three addresses (canonical, in a fixed order): the identity of a deployment. */
export function deploymentHash(
  config: Pick<Config, "daily" | "tutorial" | "account">,
): string {
  return createHash("sha256")
    .update(
      [config.daily, config.tutorial, config.account]
        .map((address) => canonical(address))
        .join(","),
    )
    .digest("hex");
}

const DAY_SECONDS = 86400;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS blocks (
    number INTEGER PRIMARY KEY, hash TEXT NOT NULL, parent TEXT NOT NULL, commitments TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  -- The raw log of the indexed events, in block order, for audit and for a rebuild by SQL.
  CREATE TABLE IF NOT EXISTS events (
    block INTEGER NOT NULL, tx INTEGER NOT NULL, idx INTEGER NOT NULL,
    source TEXT NOT NULL, name TEXT NOT NULL, keys TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (block, tx, idx)
  );
  CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY, name TEXT NOT NULL, master TEXT NOT NULL,
    created_block INTEGER NOT NULL, created_time INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS players_created ON players (created_block);
  CREATE TABLE IF NOT EXISTS games (
    contract TEXT NOT NULL,
    game_id INTEGER NOT NULL, player_id TEXT NOT NULL, mode INTEGER NOT NULL,
    spawn_tournament INTEGER NOT NULL,
    start_time INTEGER NOT NULL, price TEXT NOT NULL, spawned_block INTEGER NOT NULL,
    over INTEGER NOT NULL DEFAULT 0,
    score INTEGER, tournament_id INTEGER,
    end_time INTEGER, over_block INTEGER, over_tx INTEGER, over_idx INTEGER,
    PRIMARY KEY (contract, game_id)
  );
  CREATE INDEX IF NOT EXISTS games_player ON games (player_id, start_time DESC, contract DESC, game_id DESC);
  CREATE INDEX IF NOT EXISTS games_board ON games (tournament_id, score DESC, over_block, over_tx, over_idx)
    WHERE over = 1 AND tournament_id > 0;
  CREATE INDEX IF NOT EXISTS games_spawn ON games (spawn_tournament, player_id) WHERE contract = 'daily';
  CREATE INDEX IF NOT EXISTS games_spawned ON games (spawned_block);
  CREATE INDEX IF NOT EXISTS games_over ON games (over_block) WHERE over = 1;
  -- Definitions (QuestDefined, AchievementDefined) and their retirement (a position in chain order: block, tx, idx).
  CREATE TABLE IF NOT EXISTS quests (
    quest_id INTEGER PRIMARY KEY, start_time INTEGER NOT NULL, end_time INTEGER NOT NULL,
    duration INTEGER NOT NULL, period INTEGER NOT NULL, tasks TEXT NOT NULL, conditions TEXT NOT NULL,
    def_block INTEGER NOT NULL, def_tx INTEGER NOT NULL, def_idx INTEGER NOT NULL, def_time INTEGER NOT NULL,
    retired_block INTEGER, retired_tx INTEGER, retired_idx INTEGER, retired_time INTEGER
  );
  CREATE TABLE IF NOT EXISTS achievements (
    achievement_id INTEGER PRIMARY KEY, start_time INTEGER NOT NULL, end_time INTEGER NOT NULL,
    tasks TEXT NOT NULL, points INTEGER NOT NULL,
    def_block INTEGER NOT NULL, def_tx INTEGER NOT NULL, def_idx INTEGER NOT NULL, def_time INTEGER NOT NULL,
    retired_block INTEGER, retired_tx INTEGER, retired_idx INTEGER, retired_time INTEGER
  );
  -- QuestProgressed and AchievementProgressed as the chain emitted them: the increments, with the time of their block.
  CREATE TABLE IF NOT EXISTS progress (
    block INTEGER NOT NULL, tx INTEGER NOT NULL, idx INTEGER NOT NULL,
    kind TEXT NOT NULL, source TEXT NOT NULL, player_id TEXT NOT NULL, task_id INTEGER NOT NULL, count INTEGER NOT NULL,
    time INTEGER NOT NULL,
    PRIMARY KEY (block, tx, idx)
  );
  CREATE INDEX IF NOT EXISTS progress_player ON progress (kind, player_id, task_id, block, tx, idx);
  CREATE INDEX IF NOT EXISTS progress_time ON progress (kind, time);
  -- The top 3 of a closed day, read from the contract's tournament view at the served block (not from events).
  CREATE TABLE IF NOT EXISTS podium (
    tournament_id INTEGER NOT NULL, player_id TEXT NOT NULL, ranks TEXT NOT NULL,
    day_end INTEGER NOT NULL, close_block INTEGER NOT NULL,
    PRIMARY KEY (tournament_id, player_id)
  );
  CREATE INDEX IF NOT EXISTS podium_close ON podium (close_block);
  -- The block that closed each UTC day, recorded when it is applied: the first block whose time is at or past the day's end,
  -- after a block (prev_time) before it. Rewound by block number, never pruned, so the podium credit does not depend on
  -- which headers are still kept.
  CREATE TABLE IF NOT EXISTS day_closes (
    block INTEGER PRIMARY KEY, prev_time INTEGER NOT NULL, time INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS day_closes_time ON day_closes (prev_time, time);
  CREATE INDEX IF NOT EXISTS podium_player ON podium (player_id);
`;

type Row = Record<string, SQLInputValue>;

/** The schema version a database holds; undefined for a database without one (new). */
function schemaOf(db: DatabaseSync): string | undefined {
  const table = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
    )
    .get();
  if (!table) return undefined;
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'schema'")
    .get() as { value: string } | undefined;
  return row?.value;
}

function normalize(config: Config): Config {
  return {
    daily: canonical(config.daily),
    tutorial: canonical(config.tutorial),
    account: canonical(config.account),
    from: config.from,
    chainId: canonical(config.chainId),
  };
}

/** The meta rows of a configuration (the three addresses are kept as their hash, and as text for the API). */
function metaOf(config: Config): Record<string, string> {
  return {
    chain_id: config.chainId,
    deployment: deploymentHash(config),
    from_block: String(config.from),
    addresses: JSON.stringify({
      daily: config.daily,
      tutorial: config.tutorial,
      account: config.account,
    }),
  };
}

export class Store {
  private readonly db: DatabaseSync;
  private readonly sql: ReturnType<typeof statements>;
  private readonly prepared = new Map<string, StatementSync>();

  /**
   * `readOnly`: another process's database, read beside it. `rebuild`: every table is dropped first, whatever its
   * schema (the `rebuild` command). Otherwise a database of another schema version is refused (SchemaMismatch), before
   * anything is created or prepared.
   */
  constructor(
    path: string,
    options: { readOnly?: boolean; rebuild?: boolean } = {},
  ) {
    this.db = new DatabaseSync(path, { readOnly: options.readOnly ?? false });
    const found = schemaOf(this.db);
    if (options.rebuild && !options.readOnly) {
      const tables = this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all() as { name: string }[];
      this.db.exec("BEGIN");
      for (const { name } of tables) this.db.exec(`DROP TABLE "${name}"`);
      this.db.exec("COMMIT");
    } else if (found !== undefined && found !== SCHEMA_VERSION) {
      this.db.close();
      throw new SchemaMismatch(
        `the database has schema ${found}, this indexer ${SCHEMA_VERSION}: rebuild it from the chain (indexer rebuild --deployment <file> ...)`,
      );
    }
    if (options.readOnly) {
      this.sql = statements(this.db);
      return;
    }
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.db.exec(SCHEMA);
    this.sql = statements(this.db);
  }

  close() {
    this.db.close();
  }

  /**
   * What a database file holds, read without changing it: its schema version, the deployment hash and the start block it
   * was built for (`rebuild` checks them before dropping anything). Empty for a file that does not exist or holds no
   * schema.
   */
  static peek(path: string): {
    schema?: string;
    deployment?: string;
    from?: number;
  } {
    if (!existsSync(path)) return {};
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const schema = schemaOf(db);
      if (schema === undefined) return {};
      const read = (key: string) =>
        (
          db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
            | { value: string }
            | undefined
        )?.value;
      const from = read("from_block");
      return {
        schema,
        ...(read("deployment") ? { deployment: read("deployment")! } : {}),
        ...(from === undefined ? {} : { from: Number(from) }),
      };
    } finally {
      db.close();
    }
  }

  /** A read statement of the queries (queries.ts), prepared once. */
  statement(sql: string): StatementSync {
    let statement = this.prepared.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.prepared.set(sql, statement);
    }
    return statement;
  }

  /** Runs `work` in one transaction: all of it, or nothing. */
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // --- configuration -------------------------------------------------------------------------------

  /** A meta value. */
  meta(key: string): string | undefined {
    return (this.sql.meta.get(key) as { value: string } | undefined)?.value;
  }

  /**
   * Opens the database for `config`: a new database takes it; a database built for another deployment or another start
   * is refused (an Error: `rebuild` starts it again).
   */
  open(config: Config) {
    const normal = normalize(config);
    const expected = metaOf(normal);
    const stored = this.meta("deployment");
    if (stored === undefined) {
      if (this.tip())
        throw new Error("the database holds blocks but no configuration");
      this.transaction(() => {
        this.sql.setMeta.run("schema", SCHEMA_VERSION);
        for (const [key, value] of Object.entries(expected))
          this.sql.setMeta.run(key, value);
        this.sql.setMeta.run("started_at", new Date().toISOString());
      });
      return;
    }
    if (this.meta("schema") !== SCHEMA_VERSION) {
      throw new Error(
        `the database has schema ${this.meta("schema")}, this indexer ${SCHEMA_VERSION}: rebuild it`,
      );
    }
    if (stored !== expected.deployment!) {
      throw new Error(
        "the database was built for another deployment (the addresses of the deployment file differ): rebuild it",
      );
    }
    if (this.meta("from_block") !== expected.from_block) {
      throw new Error(
        `the database was built from block ${this.meta("from_block")}, not ${expected.from_block}: rebuild it`,
      );
    }
    if (this.meta("chain_id") !== expected.chain_id) {
      throw new Error(
        `the database was built for chain ${this.meta("chain_id")}, not ${expected.chain_id}: rebuild it`,
      );
    }
  }

  /** The configuration the database was opened with (the addresses as stored). */
  contracts(): { daily: string; tutorial: string; account: string } | undefined {
    const text = this.meta("addresses");
    return text === undefined ? undefined : JSON.parse(text);
  }

  // --- blocks --------------------------------------------------------------------------------------

  tip(): Header | undefined {
    return this.sql.tip.get() as Header | undefined;
  }

  /** The lowest block of the kept history. */
  lowest(): Header | undefined {
    return this.sql.lowest.get() as Header | undefined;
  }

  block(number: number): Header | undefined {
    return this.sql.block.get(number) as Header | undefined;
  }

  /**
   * The highest block checked against the node after it was applied (indexer.ts): the blocks above it are checked before
   * any of them is served. -1 when none is.
   */
  checked(): number {
    return Number(this.meta("checked") ?? -1);
  }

  setChecked(number: number) {
    this.sql.setMeta.run("checked", String(number));
  }

  /**
   * Applies a block and its events, in block order, in one transaction. A Halt leaves the tables as they were.
   */
  apply(block: Header, events: readonly Applied[]) {
    this.transaction(() => {
      const at = block.number;
      for (const { raw, event } of events) {
        if (this.sql.hasEvent.get(at, raw.transactionIndex, raw.eventIndex)) {
          continue; // idempotence: this event is already in
        }
        this.sql.insertEvent.run(
          at,
          raw.transactionIndex,
          raw.eventIndex,
          raw.source,
          event.name,
          JSON.stringify(raw.keys.map((key) => canonical(key))),
          JSON.stringify(raw.data.map((datum) => canonical(datum))),
        );
        const where = `in block ${at} (transaction ${raw.transactionIndex}, event ${raw.eventIndex})`;
        switch (event.name) {
          case "GameSpawned": {
            const contract = gameContract(raw.source, event.name, where);
            if (event.mode !== MODE[contract]) {
              throw new Halt(
                `GameSpawned of mode ${event.mode} from ${contract} ${where}: expected mode ${MODE[contract]}`,
              );
            }
            if (this.sql.game.get(contract, event.gameId)) {
              throw new Halt(
                `GameSpawned of ${contract} game ${event.gameId} ${where}: the game already exists`,
              );
            }
            this.sql.insertGame.run({
              contract,
              game_id: event.gameId,
              player_id: padded(event.playerId),
              mode: event.mode,
              spawn_tournament: Number(event.tournamentId),
              start_time: Number(event.startTime),
              price: padded(event.price),
              spawned_block: at,
            });
            break;
          }
          case "GameOver": {
            const contract = gameContract(raw.source, event.name, where);
            if (event.mode !== MODE[contract]) {
              throw new Halt(
                `GameOver of mode ${event.mode} from ${contract} ${where}: expected mode ${MODE[contract]}`,
              );
            }
            const game = this.sql.game.get(contract, event.gameId) as
              | Row
              | undefined;
            if (!game) {
              throw new Halt(
                `GameOver of ${contract} game ${event.gameId} ${where}: no GameSpawned for it`,
              );
            }
            if (game.over === 1) {
              throw new Halt(
                `GameOver of ${contract} game ${event.gameId} ${where}: the game is already over`,
              );
            }
            if (game.player_id !== padded(event.playerId)) {
              throw new Halt(
                `GameOver of ${contract} game ${event.gameId} ${where}: another player than the one that spawned it`,
              );
            }
            this.sql.finishGame.run({
              contract,
              game_id: event.gameId,
              score: event.score,
              tournament_id: Number(event.tournamentId),
              end_time: Number(event.endTime),
              over_block: at,
              over_tx: raw.transactionIndex,
              over_idx: raw.eventIndex,
            });
            break;
          }
          case "QuestDefined": {
            if (this.sql.quest.get(event.questId)) {
              throw new Halt(`QuestDefined of quest ${event.questId} ${where}: the quest is already defined`);
            }
            this.sql.insertQuest.run({
              quest_id: event.questId,
              start_time: Number(event.start),
              end_time: Number(event.end),
              duration: event.duration,
              period: event.interval,
              tasks: JSON.stringify(event.tasks),
              conditions: JSON.stringify(event.conditions),
              def_block: at,
              def_tx: raw.transactionIndex,
              def_idx: raw.eventIndex,
              def_time: block.timestamp,
            });
            break;
          }
          case "AchievementDefined": {
            if (this.sql.achievement.get(event.achievementId)) {
              throw new Halt(
                `AchievementDefined of achievement ${event.achievementId} ${where}: the achievement is already defined`,
              );
            }
            this.sql.insertAchievement.run({
              achievement_id: event.achievementId,
              start_time: Number(event.start),
              end_time: Number(event.end),
              tasks: JSON.stringify(event.tasks),
              points: event.points,
              def_block: at,
              def_tx: raw.transactionIndex,
              def_idx: raw.eventIndex,
              def_time: block.timestamp,
            });
            break;
          }
          case "QuestRetired":
          case "AchievementRetired": {
            const quest = event.name === "QuestRetired";
            const id = event.name === "QuestRetired" ? event.questId : event.achievementId;
            const found = (quest ? this.sql.quest : this.sql.achievement).get(id) as Row | undefined;
            if (!found) {
              throw new Halt(`${event.name} of ${id} ${where}: it was never defined`);
            }
            if (found.retired_block !== null) {
              throw new Halt(`${event.name} of ${id} ${where}: it is already retired`);
            }
            (quest ? this.sql.retireQuest : this.sql.retireAchievement).run({
              id,
              block: at,
              tx: raw.transactionIndex,
              idx: raw.eventIndex,
              time: block.timestamp,
            });
            break;
          }
          case "QuestProgressed":
          case "AchievementProgressed": {
            if (event.name === "AchievementProgressed" && raw.source === "tutorial" && event.taskId !== TUTORIAL_TASK) {
              throw new Halt(
                `AchievementProgressed of task ${event.taskId} from tutorial ${where}: Tutorial reports task ${TUTORIAL_TASK} only`,
              );
            }
            this.sql.insertProgress.run({
              block: at,
              tx: raw.transactionIndex,
              idx: raw.eventIndex,
              kind: event.name === "QuestProgressed" ? "quest" : "achievement",
              source: raw.source,
              player_id: padded(event.playerId),
              task_id: event.taskId,
              count: event.count,
              time: block.timestamp,
            });
            break;
          }
          case "PlayerCreated": {
            if (raw.source !== "account") {
              throw new Halt(`PlayerCreated from ${raw.source} ${where}`);
            }
            const playerId = padded(event.playerId);
            if (this.sql.player.get(playerId)) {
              throw new Halt(
                `PlayerCreated of ${playerId} ${where}: the player already exists`,
              );
            }
            this.sql.insertPlayer.run(
              playerId,
              padded(event.displayName),
              padded(event.master),
              at,
              block.timestamp,
            );
            break;
          }
        }
      }
      const stored = this.block(block.number);
      if (stored) {
        // Applied before: the same block again changes nothing; another block at that height is not the chain's.
        if (stored.hash !== block.hash || stored.commitments !== block.commitments) {
          throw new Halt(`block ${block.number} is already stored with another hash`);
        }
        return;
      }
      const previous = this.tip();
      if (
        previous &&
        previous.number < at &&
        Math.floor(previous.timestamp / DAY_SECONDS) < Math.floor(block.timestamp / DAY_SECONDS)
      ) {
        this.sql.insertClose.run(at, previous.timestamp, block.timestamp);
      }
      this.sql.insertBlock.run(
        block.number,
        block.hash,
        block.parent,
        block.commitments,
        block.timestamp,
      );
    });
  }

  /**
   * The top 3 of a closed day, as the `tournament` view gave it at the served block `served`: each player holding a slot
   * is credited once for the day (the slots they hold are kept in `ranks`), at the block that closed the day (`close_block`:
   * the credit comes after the events of the blocks before it and before those of that block, so a retirement in the closing
   * block or after it comes after the credit). Never early: a `served` block whose time is
   * before the end of the day is refused. A day already recorded is left as it is (the slots of a closed day cannot move;
   * a rewind below `served` forgets them).
   */
  recordPodium(
    tournamentId: number,
    dayEnd: number,
    slots: readonly { playerId: string; rank: number }[],
    served: Header,
  ) {
    if (served.timestamp < dayEnd) {
      throw new Error(
        `podium of tournament ${tournamentId} recorded at block ${served.number} (time ${served.timestamp}) before the day ends (${dayEnd})`,
      );
    }
    // The credit is ordered at the block that closed the day (the first block whose time is at or past the end, recorded by
    // `apply` and never pruned), not at the block the view was read at: a live run, a rebuild in batches and a retried call
    // then hold the same rows. `served` itself when no block closed the day in this database (the day ended before the
    // first block indexed).
    const closed = (this.sql.closeBlock.get(dayEnd, served.number) as { n: number } | undefined)?.n ?? served.number;
    this.transaction(() => {
      const players = new Map<string, number[]>();
      for (const { playerId, rank } of slots) {
        players.set(playerId, [...(players.get(playerId) ?? []), rank]);
      }
      for (const [playerId, ranks] of players) {
        this.sql.insertPodium.run({
          t: tournamentId,
          p: playerId,
          ranks: JSON.stringify(ranks.sort()),
          end: dayEnd,
          block: closed,
        });
      }
    });
  }

  /** Every table back to block `to` (its state after `to`), in one transaction. */
  rewind(to: number) {
    this.transaction(() => {
      this.sql.rewindGames.run(to);
      this.sql.unfinishGames.run(to);
      this.sql.rewindPlayers.run(to);
      this.sql.rewindQuests.run(to);
      this.sql.rewindAchievements.run(to);
      this.sql.unretireQuests.run(to);
      this.sql.unretireAchievements.run(to);
      this.sql.rewindProgress.run(to);
      this.sql.rewindPodium.run(to);
      this.sql.rewindCloses.run(to);
      this.sql.rewindEvents.run(to);
      this.sql.rewindBlocks.run(to);
      if (this.checked() > to) this.setChecked(to);
    });
  }

  /** Forgets the block headers below `floor`: the rows are the state and stay. */
  prune(floor: number) {
    this.transaction(() => {
      this.sql.pruneBlocks.run(floor);
    });
  }

  // --- reading -------------------------------------------------------------------------------------

  /**
   * Every row of every table in a fixed order: two databases hold the same tables when their dumps are equal (a rewound
   * one and a rebuilt one).
   */
  dump(): Record<
    "players" | "games" | "quests" | "achievements" | "progress" | "podium" | "day_closes" | "events" | "blocks",
    Row[]
  > {
    const all = (sql: string) => this.db.prepare(sql).all() as Row[];
    return {
      players: all("SELECT * FROM players ORDER BY player_id"),
      games: all("SELECT * FROM games ORDER BY contract, game_id"),
      quests: all("SELECT * FROM quests ORDER BY quest_id"),
      achievements: all("SELECT * FROM achievements ORDER BY achievement_id"),
      progress: all("SELECT * FROM progress ORDER BY block, tx, idx"),
      podium: all("SELECT * FROM podium ORDER BY tournament_id, player_id"),
      day_closes: all("SELECT * FROM day_closes ORDER BY block"),
      events: all("SELECT * FROM events ORDER BY block, tx, idx"),
      blocks: all("SELECT * FROM blocks ORDER BY number"),
    };
  }
}

/** The game contract an event of a game came from; a Halt for any other source. */
function gameContract(
  source: Source,
  name: string,
  where: string,
): "daily" | "tutorial" {
  if (source !== "daily" && source !== "tutorial") {
    throw new Halt(`${name} from ${source} ${where}`);
  }
  return source;
}

function statements(db: DatabaseSync) {
  return {
    meta: db.prepare("SELECT value FROM meta WHERE key = ?"),
    setMeta: db.prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    ),
    tip: db.prepare(
      "SELECT number, hash, parent, commitments, timestamp FROM blocks ORDER BY number DESC LIMIT 1",
    ),
    lowest: db.prepare(
      "SELECT number, hash, parent, commitments, timestamp FROM blocks ORDER BY number LIMIT 1",
    ),
    block: db.prepare(
      "SELECT number, hash, parent, commitments, timestamp FROM blocks WHERE number = ?",
    ),
    insertBlock: db.prepare(
      "INSERT INTO blocks (number, hash, parent, commitments, timestamp) VALUES (?, ?, ?, ?, ?)",
    ),
    hasEvent: db.prepare(
      "SELECT 1 FROM events WHERE block = ? AND tx = ? AND idx = ?",
    ),
    insertEvent: db.prepare(
      "INSERT INTO events (block, tx, idx, source, name, keys, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ),
    game: db.prepare(
      "SELECT player_id, over FROM games WHERE contract = ? AND game_id = ?",
    ),
    insertGame: db.prepare(
      `INSERT INTO games (contract, game_id, player_id, mode, spawn_tournament, start_time, price, spawned_block)
       VALUES (:contract, :game_id, :player_id, :mode, :spawn_tournament, :start_time, :price, :spawned_block)`,
    ),
    finishGame: db.prepare(
      `UPDATE games SET over = 1, score = :score, tournament_id = :tournament_id, end_time = :end_time,
         over_block = :over_block, over_tx = :over_tx, over_idx = :over_idx
       WHERE contract = :contract AND game_id = :game_id`,
    ),
    player: db.prepare("SELECT 1 FROM players WHERE player_id = ?"),
    insertPlayer: db.prepare(
      "INSERT INTO players (player_id, name, master, created_block, created_time) VALUES (?, ?, ?, ?, ?)",
    ),
    rewindGames: db.prepare("DELETE FROM games WHERE spawned_block > ?"),
    unfinishGames: db.prepare(
      `UPDATE games SET over = 0, score = NULL, tournament_id = NULL, end_time = NULL,
         over_block = NULL, over_tx = NULL, over_idx = NULL
       WHERE over_block > ?`,
    ),
    rewindPlayers: db.prepare("DELETE FROM players WHERE created_block > ?"),
    quest: db.prepare("SELECT retired_block FROM quests WHERE quest_id = ?"),
    achievement: db.prepare("SELECT retired_block FROM achievements WHERE achievement_id = ?"),
    insertQuest: db.prepare(
      `INSERT INTO quests (quest_id, start_time, end_time, duration, period, tasks, conditions,
         def_block, def_tx, def_idx, def_time)
       VALUES (:quest_id, :start_time, :end_time, :duration, :period, :tasks, :conditions,
         :def_block, :def_tx, :def_idx, :def_time)`,
    ),
    insertAchievement: db.prepare(
      `INSERT INTO achievements (achievement_id, start_time, end_time, tasks, points,
         def_block, def_tx, def_idx, def_time)
       VALUES (:achievement_id, :start_time, :end_time, :tasks, :points,
         :def_block, :def_tx, :def_idx, :def_time)`,
    ),
    retireQuest: db.prepare(
      `UPDATE quests SET retired_block = :block, retired_tx = :tx, retired_idx = :idx, retired_time = :time
       WHERE quest_id = :id`,
    ),
    retireAchievement: db.prepare(
      `UPDATE achievements SET retired_block = :block, retired_tx = :tx, retired_idx = :idx, retired_time = :time
       WHERE achievement_id = :id`,
    ),
    insertProgress: db.prepare(
      `INSERT INTO progress (block, tx, idx, kind, source, player_id, task_id, count, time)
       VALUES (:block, :tx, :idx, :kind, :source, :player_id, :task_id, :count, :time)`,
    ),
    insertPodium: db.prepare(
      `INSERT OR IGNORE INTO podium (tournament_id, player_id, ranks, day_end, close_block)
       VALUES (:t, :p, :ranks, :end, :block)`,
    ),
    closeBlock: db.prepare(
      "SELECT block AS n FROM day_closes WHERE prev_time < ?1 AND time >= ?1 AND block <= ?2",
    ),
    insertClose: db.prepare("INSERT OR IGNORE INTO day_closes (block, prev_time, time) VALUES (?, ?, ?)"),
    rewindCloses: db.prepare("DELETE FROM day_closes WHERE block > ?"),
    rewindQuests: db.prepare("DELETE FROM quests WHERE def_block > ?"),
    rewindAchievements: db.prepare("DELETE FROM achievements WHERE def_block > ?"),
    unretireQuests: db.prepare(
      `UPDATE quests SET retired_block = NULL, retired_tx = NULL, retired_idx = NULL, retired_time = NULL
       WHERE retired_block > ?`,
    ),
    unretireAchievements: db.prepare(
      `UPDATE achievements SET retired_block = NULL, retired_tx = NULL, retired_idx = NULL, retired_time = NULL
       WHERE retired_block > ?`,
    ),
    rewindProgress: db.prepare("DELETE FROM progress WHERE block > ?"),
    rewindPodium: db.prepare("DELETE FROM podium WHERE close_block > ?"),
    rewindEvents: db.prepare("DELETE FROM events WHERE block > ?"),
    rewindBlocks: db.prepare("DELETE FROM blocks WHERE number > ?"),
    pruneBlocks: db.prepare("DELETE FROM blocks WHERE number < ?"),
  };
}
