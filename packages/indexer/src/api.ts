// The v1 response types of the read API (docs/architecture/indexer.md, "Read API (v1)"), shared with the client: plain
// TypeScript, no import, so that a client may import this file as types only and the daemon's code never enters its
// bundle. A v1 field is never removed or retyped; fields may be appended.

export const API_VERSION = 1;

/** Seconds of a tournament (`DAILY_TOURNAMENT_DURATION` of the contracts). */
export const TOURNAMENT_DURATION = 86400;

/**
 * The largest tournament id the API accepts and returns (P-19): `floor((2^53 - 1) / 86400) - 1`, so that the end time
 * `(id + 1) * 86400` of the id, the largest number the API returns for it, is at most 2^53 - 1 (`Number.MAX_SAFE_INTEGER`).
 * The contract's `tournament` view accepts ids up to `2^64 / 86400`; above this bound the API answers 400.
 */
export const MAX_TOURNAMENT_ID = Math.floor(Number.MAX_SAFE_INTEGER / 86400) - 1; // 104249991373

/** The block every answer is read at: the highest block checked after it was applied. */
export interface ApiHead {
  number: number;
  hash: string;
  timestamp: number;
}

export type IndexerState = "loading" | "ok" | "rewinding" | "halted";

export type GameContract = "daily" | "tutorial";

/** Every 200 answer carries these, then the rows of its route. */
export interface Envelope {
  version: 1;
  status: "ok";
  head: ApiHead;
  /** Blocks between the served block and the node's tip. */
  behind: number;
}

/** A 4xx or 500 answer. `state` is the serving state of the indexer, `head` the served block (null when none). */
export interface ErrorAnswer {
  version: 1;
  status: "error";
  error: string;
  state: IndexerState;
  head: ApiHead | null;
}

/** A 503 answer: the indexer is not `ok`. `status` is its state. */
export interface UnavailableAnswer {
  version: 1;
  status: Exclude<IndexerState, "ok">;
  reason?: string;
  head: ApiHead | null;
}

export interface Mismatch {
  tournament_id: number;
  /** The block the view was read at. */
  head_number: number;
  /** The three slots of the `tournament` view, then of the replay of the events (player_id 0x0.. and score 0 when empty). */
  view: PrizeSlot[];
  indexed: PrizeSlot[];
}

export interface PrizeSlot {
  player_id: string;
  score: number;
}

export interface HeadAnswer extends Envelope {
  state: "ok";
  chain_id: string;
  from_block: number;
  contracts: { daily: string; tutorial: string; account: string };
  checks: {
    /** Closed days compared with the `tournament` view since the process started (or the last rewind). */
    tournaments_checked: number;
    last_mismatch: Mismatch | null;
    /** Quest and achievement definitions left out of every answer: a task total of 0 or a task id repeated (P-30). */
    definitions_excluded: number;
  };
}

export interface TournamentSummary {
  id: number;
  start_time: number;
  end_time: number;
  games_spawned: number;
  /** Players ranked: those with at least one finished game that counted. */
  players: number;
  /** Best score of the day, 0 when no game counted. */
  best_score: number;
}

export interface TournamentsAnswer extends Envelope {
  tournaments: TournamentSummary[];
  /** Pass as `before` for the next page; null on the last. */
  next: number | null;
}

export interface TournamentDetail extends TournamentSummary {
  games_finished: number;
}

export interface TournamentAnswer extends Envelope {
  tournament: TournamentDetail;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  name: string | null;
  best_score: number;
  best_game_id: number;
  /** Games of the player spawned in this tournament, finished or not: entries. */
  games_played: number;
  /** Games of the player that finished and counted for this tournament. */
  games_finished: number;
  /** `end_time` of the best game. */
  finished_at: number;
  /** The prize slots (1 to 3) the player holds on chain, replayed from the events. A player may hold several. */
  prize_ranks: number[];
}

export interface LeaderboardAnswer extends Envelope {
  tournament_id: number;
  start_time: number;
  end_time: number;
  /** Players ranked. */
  total: number;
  entries: LeaderboardEntry[];
  next_offset: number | null;
}

export interface PlayerInfo {
  player_id: string;
  name: string | null;
  /** Time of the block that created the player (seconds). */
  created: number;
}

export interface PlayerStats {
  daily_games: number;
  daily_finished: number;
  /** Best score of a finished Daily game, null when none finished. */
  best_score: number | null;
  tutorial_games: number;
}

export interface PlayerAnswer extends Envelope {
  /** null for a player the indexer does not know (200, not 404). */
  player: PlayerInfo | null;
  stats: PlayerStats | null;
}

export interface GameRow {
  contract: GameContract;
  game_id: number;
  player_id: string;
  mode: number;
  start_time: number;
  /** Tournament of the spawn (0 for Tutorial). */
  tournament_id: number;
  over: boolean;
  /** null while the game is running. */
  score: number | null;
  /** The tournament the game counted for (0 when it ended after its day, and for Tutorial); null while running. */
  counted_tournament_id: number | null;
  /** 0 when the game did not count; null while running. */
  end_time: number | null;
}

export interface PlayerGamesAnswer extends Envelope {
  games: GameRow[];
  /** Pass as `before` for the next page: `<start_time>:<contract>:<game_id>`; null on the last. */
  next: string | null;
}

export interface GameAnswer extends Envelope {
  game: GameRow;
}

export interface EntryAnswer extends Envelope {
  tournament_id: number;
  /** The player's leaderboard row of that day, null when the player has no finished game that counted. */
  entry: LeaderboardEntry | null;
}

/** A task of a definition: the id the game reports and the count that completes it. */
export interface TaskTarget {
  task_id: number;
  total: number;
}

export interface QuestDefinition {
  quest_id: number;
  /** The schedule of `QuestDefined`: `end` 0 never ends; `duration` and `interval` 0 for a one-off quest. */
  start_time: number;
  end_time: number;
  duration: number;
  interval: number;
  tasks: TaskTarget[];
  /** Prerequisites as defined; the indexer does not apply them (quests.md, "Indexer"). */
  conditions: number[];
  /** Time of the block that defined it. */
  defined_at: number;
  retired: boolean;
  /** Time of the block that retired it, null while it is live. */
  retired_at: number | null;
}

export interface AchievementDefinition {
  achievement_id: number;
  /** The window of `AchievementDefined`: 0 is open on that side. */
  start_time: number;
  end_time: number;
  tasks: TaskTarget[];
  /** Display only. */
  points: number;
  defined_at: number;
  retired: boolean;
  retired_at: number | null;
}

export interface DefinitionsAnswer extends Envelope {
  quests: QuestDefinition[];
  achievements: AchievementDefinition[];
}

export interface TaskProgress extends TaskTarget {
  /** The sum of the counts that counted, at most `total`. */
  count: number;
}

export interface PlayerQuest {
  quest_id: number;
  /** The interval of the schedule the day falls in (0 for a one-off quest). */
  interval_id: number;
  tasks: TaskProgress[];
  completed: boolean;
  /** Time of the block of the report that completed it; null while incomplete. */
  completed_at: number | null;
  /** Retired at the served block: what counted before stays, nothing counts after. */
  retired: boolean;
}

export interface PlayerQuestsAnswer extends Envelope {
  player_id: string;
  /** The UTC day (`timestamp / 86400`, the tournament id of the day). */
  day: number;
  start_time: number;
  end_time: number;
  /** The quests active at some time of that day, with the player's progress (zero for an unknown player). */
  quests: PlayerQuest[];
}

export interface PlayerAchievement {
  achievement_id: number;
  points: number;
  tasks: TaskProgress[];
  completed: boolean;
  completed_at: number | null;
  retired: boolean;
}

export interface PlayerAchievementsAnswer extends Envelope {
  player_id: string;
  /** The points of the completed achievements. */
  points: number;
  achievements: PlayerAchievement[];
}
