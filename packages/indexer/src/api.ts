// The v1 response types of the read API (docs/architecture/indexer.md, "Read API (v1)"), shared with the client: plain
// TypeScript, no import, so that a client may import this file as types only and the daemon's code never enters its
// bundle. A v1 field is never removed or retyped; fields may be appended.
//
// Amounts (Economy's u256 and u128: USDC and PAVED base units) can exceed 2^53, so they are decimal strings, never JSON
// numbers (P-19); every other number is a safe integer.

export const API_VERSION = 1;

/** Seconds of a tournament (`DAILY_TOURNAMENT_DURATION` of the contracts). */
export const TOURNAMENT_DURATION = 86400;

/** The most unsettled games an answer lists (`unsettled`); the whole count is `unsettled_count`. API v1 has no cursor for them. */
export const UNSETTLED_PAGE = 100;

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
  contracts: {
    daily: string;
    tutorial: string;
    account: string;
    economy: string;
    /** null for a deployment without a Collection (before E5b). Appended in E5b. */
    collection: string | null;
  };
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

/** A day of Economy (the tournament id is the UTC day): its paid games and, once its first settlement closed it, its mean. */
export interface DayEconomy {
  /** Daily games bought this day (`Purchased`). */
  games_purchased: number;
  /** Of them, the games whose score Economy has (`Recorded`), settled or not. */
  games_recorded: number;
  games_settled: number;
  /** The recorded games of the day not settled yet, by id: what `Economy.settle` takes from `(id + 2) x 86400`. The first `UNSETTLED_PAGE` only: `unsettled_count` is the whole count. */
  unsettled: number[];
  /** How many recorded games of the day are not settled yet (appended; `unsettled` holds at most `UNSETTLED_PAGE` of them). */
  unsettled_count: number;
  /** PAVED base units minted to the day's settled games, a decimal string. */
  rewards: string;
  /** `DayClosed` seen: the day's mean is fixed. */
  closed: boolean;
  /** Of `DayClosed`, points x 1,000; null until the day closes. */
  mean: number | null;
  weight: number | null;
  prior: number | null;
  ema_after: number | null;
  /** Time of the block that closed the day; null until then. */
  closed_at: number | null;
}

export interface TournamentAnswer extends Envelope {
  tournament: TournamentDetail;
  /** Appended in E3. */
  economy: DayEconomy;
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
  /** Daily games the player bought (`Purchased`). Appended in E3. */
  paid_games: number;
  /** Of them, the games settled. */
  settled_games: number;
  /** PAVED base units minted to the player's settled games, a decimal string. */
  rewards: string;
}

/** A paid game whose score Economy has and that is not settled yet: what a client or a keeper settles. */
export interface UnsettledGame {
  game_id: number;
  /** The purchase day: the game can be settled from `(day + 2) x 86400`. */
  day: number;
  /** Recorded 24 h or more after its purchase: it settles for 0. */
  expired: boolean;
}

export interface PlayerAnswer extends Envelope {
  /** null for a player the indexer does not know (200, not 404). */
  player: PlayerInfo | null;
  stats: PlayerStats | null;
  /** The player's unsettled games, oldest first, the first `UNSETTLED_PAGE` only; null for a player the indexer does not know. Appended in E3. */
  unsettled: UnsettledGame[] | null;
  /** How many games of the player are not settled yet (appended; `unsettled` holds at most `UNSETTLED_PAGE` of them); null for a player the indexer does not know. */
  unsettled_count: number | null;
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
  /** The terms and the settlement of a Daily game bought through Economy; null for a Tutorial game and a game not bought. Appended in E3. */
  economy: GameEconomy | null;
  /**
   * The id of the game's token in `Collection` (the game id for Daily, 2^32 + the game id for Tutorial), from its mint, a
   * safe integer; null for a game spawned before the collection existed. Appended in E5b.
   */
  token_id: number | null;
}

export interface GameEconomy {
  /** The purchase's UTC day. */
  day: number;
  stake: number;
  /** USDC base units, a decimal string. */
  price: string;
  /** The referrer paid, `0x` and 64 hex digits; null when the purchase had no referral. */
  referrer: string | null;
  /** USDC base units paid to the referrer, a decimal string ("0" without one). */
  referral: string;
  /** PAVED base units burned by the purchase, a decimal string. */
  burned: string;
  /** The supply factor at the purchase, bps. */
  factor: number;
  /** `R`, the reference reward, PAVED base units, a decimal string. */
  reference: string;
  /** Time of the block of the purchase. */
  purchased_at: number;
  /** Economy has the game's score (`Recorded`). */
  recorded: boolean;
  /** Recorded 24 h or more after its purchase: no reward, no mean. False until recorded. */
  expired: boolean;
  settled: boolean;
  /** The cliff the score was paid against, points x 1,000; null until settled. */
  threshold: number | null;
  /** PAVED base units minted at the settlement, a decimal string; null until settled. */
  reward: string | null;
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
