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
