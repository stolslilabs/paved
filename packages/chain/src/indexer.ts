// Typed client of the indexer's read API v1 (docs/architecture/indexer.md, section "Read API").
// Display only: the indexer never supplies a prize amount or a claim, those come from the contract's
// `tournament` view.

/** The only API version this client reads. */
export const INDEXER_API_VERSION = 1;

/** Blocks of lag above which an answer is marked behind (the indexer doc's `maxLag`). */
export const DEFAULT_MAX_LAG = 5;

/** Largest page the API serves (`limit` is 1 to 100). */
export const MAX_INDEXER_PAGE = 100;

/** Largest tournament id the API serves: its end time stays a safe JSON integer (indexer doc, P-19). */
export const MAX_TOURNAMENT_ID = Math.floor(Number.MAX_SAFE_INTEGER / 86400) - 1; // 104249991373 (P-19)

/** `daily` or `tutorial`: the contract that emitted a game's events. */
export type IndexerContract = "daily" | "tutorial";

/** Non-ok statuses of the envelope: the indexer answers 503 with one of them. */
export type IndexerStatus = "loading" | "rewinding" | "halted";

export type IndexerErrorKind =
  /** No URL configured: nothing was asked. */
  | "not-configured"
  /** The request failed, timed out, or the gateway answered 5xx. */
  | "unreachable"
  /** The envelope's `version` is not 1. */
  | "wrong-version"
  /** 404: an unknown game or route. */
  | "not-found"
  /** 503 with `loading`, `rewinding` or `halted`: see `status`. */
  | "unavailable"
  /** 400, or any other refusal of a request. */
  | "rejected"
  /** The answer is not what the API's types say. */
  | "bad-response";

export class IndexerError extends Error {
  constructor(
    readonly kind: IndexerErrorKind,
    message: string,
    readonly detail: { status?: IndexerStatus; reason?: string; version?: unknown; httpStatus?: number } = {},
  ) {
    super(message);
    this.name = "IndexerError";
  }

  /** The indexer is up but not serving rows now: loading, rewinding or halted. */
  get status(): IndexerStatus | undefined {
    return this.detail.status;
  }
}

export interface IndexerHead {
  number: number;
  hash: string;
  timestamp: number;
}

/**
 * How current an answer is. `ok`: at most `maxLag` blocks behind. `behind`: more than that, the rows are
 * real but late and must be shown as such.
 */
export type Freshness = { kind: "ok" | "behind"; blocks: number };

/** Every successful answer: the rows (`data`) and the envelope read into typed states. */
export interface IndexerAnswer<T> {
  data: T;
  head: IndexerHead;
  /** Blocks between the indexer and the chain's head when it answered. */
  behind: number;
  freshness: Freshness;
}

export interface IndexerHeadInfo {
  state: string;
  chainId: string;
  fromBlock: number;
  contracts: Record<string, string>;
  /** The last closed day whose `prize_ranks` differed from the `tournament` view, or null. */
  lastMismatch: number | null;
  /** Closed days the indexer has compared with the `tournament` view since it started (`checks.tournaments_checked`); null when the answer has no such count. */
  tournamentsChecked: number | null;
}

export interface TournamentSummary {
  id: number;
  startTime: number;
  endTime: number;
  gamesSpawned: number;
  players: number;
  bestScore: number;
}

export interface TournamentDetail {
  id: number;
  startTime: number;
  endTime: number;
  gamesSpawned: number;
  gamesFinished: number;
  players: number;
  bestScore: number;
}

export interface TournamentList {
  tournaments: TournamentSummary[];
  /** Pass as `before` for the next page; null on the last. */
  next: number | null;
}

/** One row of a leaderboard: a player, with the prize slots (of the contract, games ranked) they hold. */
export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string | null;
  bestScore: number;
  bestGameId: number;
  gamesPlayed: number;
  gamesFinished: number;
  finishedAt: number;
  /** Slots 1 to 3 this player holds: one player may hold several, as the contract ranks games. */
  prizeRanks: number[];
}

export interface Leaderboard {
  tournamentId: number;
  startTime: number;
  endTime: number;
  /** Players ranked. */
  total: number;
  entries: LeaderboardEntry[];
  /** Pass as `offset` for the next page; null on the last. */
  nextOffset: number | null;
}

export interface IndexedPlayer {
  playerId: string;
  name: string | null;
  created: number | null;
}

export interface PlayerStats {
  dailyGames: number;
  dailyFinished: number;
  bestScore: number;
  tutorialGames: number;
}

/** `player` is null when the indexer has never seen this id. */
export interface PlayerProfile {
  player: IndexedPlayer | null;
  stats: PlayerStats | null;
}

export interface IndexedGame {
  contract: IndexerContract;
  gameId: number;
  mode: number;
  startTime: number;
  /** Tournament of the spawn. */
  tournamentId: number;
  over: boolean;
  /** 0 while the game runs: the indexer answers null then, and the screens show "In progress". */
  score: number;
  /** 0 when the game ranks in no tournament (Tutorial, or over after its day closed, or still running). */
  countedTournamentId: number;
  /** 0 while the game runs (`over` is false). */
  endTime: number;
}

export interface PlayerGames {
  games: IndexedGame[];
  /** Pass as `before` for the next page; null on the last. */
  next: string | null;
}

export interface IndexerOptions {
  /** Base URL of the API, without the `/v1`. */
  url: string;
  /** For tests and non-browser hosts; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  maxLag?: number;
  /** Time before a request counts as unreachable. */
  timeoutMs?: number;
}

type Obj = Record<string, unknown>;

function failedByStatus(httpStatus: number): IndexerError {
  if (httpStatus === 404) return new IndexerError("not-found", "Not found", { httpStatus });
  return new IndexerError(httpStatus >= 500 ? "unreachable" : "rejected", `Indexer answered ${httpStatus}`, { httpStatus });
}

const bad = (what: string): never => {
  throw new IndexerError("bad-response", `Indexer answer: ${what}`);
};

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown, what: string): Obj => (isObj(v) ? v : bad(`${what} is not an object`));
const num = (o: Obj, key: string, what: string): number => {
  const v = o[key];
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : bad(`${what}.${key} is not a count`);
};
const str = (o: Obj, key: string, what: string): string => {
  const v = o[key];
  return typeof v === "string" ? v : bad(`${what}.${key} is not a string`);
};
const bool = (o: Obj, key: string, what: string): boolean => {
  const v = o[key];
  return typeof v === "boolean" ? v : bad(`${what}.${key} is not a boolean`);
};
/** A key the doc lists as nullable: `null` is an answer, a missing key is not. */
const orNull = <T>(o: Obj, key: string, read: (o: Obj, key: string, what: string) => T, what: string): T | null =>
  o[key] === null ? null : key in o ? read(o, key, what) : bad(`${what}.${key} is missing`);
/** A count the indexer answers as null while a game runs ("As built"): read as 0, `over` tells which. */
const numOrZero = (o: Obj, key: string, what: string): number => (o[key] === null ? 0 : num(o, key, what));
const list = (o: Obj, key: string, what: string): unknown[] => {
  const v = o[key];
  return Array.isArray(v) ? v : bad(`${what}.${key} is not a list`);
};

function parseSummary(v: unknown, what: string): TournamentSummary {
  const o = obj(v, what);
  return {
    id: num(o, "id", what),
    startTime: num(o, "start_time", what),
    endTime: num(o, "end_time", what),
    gamesSpawned: num(o, "games_spawned", what),
    players: num(o, "players", what),
    bestScore: num(o, "best_score", what),
  };
}

/** One tournament: the list route's fields plus `games_finished`, which the list leaves out. */
function parseTournament(v: unknown, what: string): TournamentDetail {
  return { ...parseSummary(v, what), gamesFinished: num(obj(v, what), "games_finished", what) };
}

function parseEntry(v: unknown, what: string): LeaderboardEntry {
  const o = obj(v, what);
  const ranks = list(o, "prize_ranks", what);
  if (!ranks.every((r) => typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 3)) bad(`${what}.prize_ranks is not slots 1 to 3`);
  return {
    rank: num(o, "rank", what),
    playerId: str(o, "player_id", what),
    name: orNull(o, "name", str, what),
    bestScore: num(o, "best_score", what),
    bestGameId: num(o, "best_game_id", what),
    gamesPlayed: num(o, "games_played", what),
    gamesFinished: num(o, "games_finished", what),
    finishedAt: num(o, "finished_at", what),
    prizeRanks: ranks as number[],
  };
}

function parseGame(v: unknown, what: string): IndexedGame {
  const o = obj(v, what);
  const contract = str(o, "contract", what);
  if (contract !== "daily" && contract !== "tutorial") bad(`${what}.contract is ${contract}`);
  return {
    contract: contract as IndexerContract,
    gameId: num(o, "game_id", what),
    mode: num(o, "mode", what),
    startTime: num(o, "start_time", what),
    tournamentId: num(o, "tournament_id", what),
    over: bool(o, "over", what),
    score: numOrZero(o, "score", what),
    countedTournamentId: numOrZero(o, "counted_tournament_id", what),
    endTime: numOrZero(o, "end_time", what),
  };
}

/** A player id as the API writes it: `0x`, 64 lowercase hex digits. Throws on anything else. */
export function indexerPlayerId(id: string | bigint): string {
  let value: bigint;
  try {
    value = BigInt(id);
  } catch {
    throw new IndexerError("rejected", `Not a player id: ${String(id)}`);
  }
  if (value < 0n || value >= 1n << 252n) throw new IndexerError("rejected", `Not a player id: ${String(id)}`);
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function tournamentPath(id: number | bigint): string {
  const ok = typeof id === "number" ? Number.isSafeInteger(id) && id >= 0 && id <= MAX_TOURNAMENT_ID : id >= 0n && id <= BigInt(MAX_TOURNAMENT_ID);
  if (!ok) throw new IndexerError("rejected", `Not a tournament id: ${id}`);
  return String(id);
}

/** Reads the indexer's API v1. One instance per base URL; it holds no state. */
export class IndexerClient {
  readonly maxLag: number;
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: IndexerOptions) {
    this.base = options.url.replace(/\/+$/, "");
    this.doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.maxLag = options.maxLag ?? DEFAULT_MAX_LAG;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async head(): Promise<IndexerAnswer<IndexerHeadInfo>> {
    return this.get("/v1/head", {}, (b) => {
      // Keys the client does not read (as built: `checks.tournaments_checked` and later fields) are ignored; `checks` itself may be absent.
      const checks = b.checks === null || b.checks === undefined ? null : obj(b.checks, "checks");
      return {
        state: str(b, "state", "head"),
        chainId: str(b, "chain_id", "head"),
        fromBlock: num(b, "from_block", "head"),
        contracts: Object.fromEntries(Object.entries(obj(b.contracts, "contracts")).map(([k, v]) => [k, typeof v === "string" ? v : bad(`contracts.${k}`)])),
        lastMismatch: checks ? orNull(checks, "last_mismatch", num, "checks") : null,
        tournamentsChecked: checks && checks.tournaments_checked !== undefined ? num(checks, "tournaments_checked", "checks") : null,
      };
    });
  }

  /** Tournaments newest first; `before` is a previous page's `next`. */
  async tournaments(params: { limit?: number; before?: number } = {}): Promise<IndexerAnswer<TournamentList>> {
    if (params.before !== undefined) tournamentPath(params.before);
    return this.get("/v1/tournaments", params, (b) => ({
      tournaments: list(b, "tournaments", "tournaments").map((t, i) => parseSummary(t, `tournaments[${i}]`)),
      next: orNull(b, "next", num, "tournaments"),
    }));
  }

  /** A day with no game answers zeros, never not-found. */
  async tournament(id: number | bigint): Promise<IndexerAnswer<TournamentDetail>> {
    return this.get(`/v1/tournaments/${tournamentPath(id)}`, {}, (b) => parseTournament(b.tournament, "tournament"));
  }

  async leaderboard(id: number | bigint, params: { limit?: number; offset?: number } = {}): Promise<IndexerAnswer<Leaderboard>> {
    return this.get(`/v1/tournaments/${tournamentPath(id)}/leaderboard`, params, (b) => ({
      tournamentId: num(b, "tournament_id", "leaderboard"),
      startTime: num(b, "start_time", "leaderboard"),
      endTime: num(b, "end_time", "leaderboard"),
      total: num(b, "total", "leaderboard"),
      entries: list(b, "entries", "leaderboard").map((e, i) => parseEntry(e, `entries[${i}]`)),
      nextOffset: orNull(b, "next_offset", num, "leaderboard"),
    }));
  }

  /** An unknown player is `player: null`, not an error. */
  async player(playerId: string | bigint): Promise<IndexerAnswer<PlayerProfile>> {
    return this.get(`/v1/players/${indexerPlayerId(playerId)}`, {}, (b) => {
      const player = b.player === null ? null : obj(b.player, "player");
      // An unknown player has no stats; the route may leave the key out then, never for a known one.
      const stats = b.stats === null || (b.stats === undefined && player === null) ? null : obj(b.stats, "stats");
      return {
        player: player && { playerId: str(player, "player_id", "player"), name: orNull(player, "name", str, "player"), created: orNull(player, "created", num, "player") },
        stats: stats && {
          dailyGames: num(stats, "daily_games", "stats"),
          dailyFinished: num(stats, "daily_finished", "stats"),
          bestScore: num(stats, "best_score", "stats"),
          tutorialGames: num(stats, "tutorial_games", "stats"),
        },
      };
    });
  }

  /** Games newest first; `before` is a previous page's `next`. */
  async playerGames(playerId: string | bigint, params: { contract?: IndexerContract; limit?: number; before?: string } = {}): Promise<IndexerAnswer<PlayerGames>> {
    return this.get(`/v1/players/${indexerPlayerId(playerId)}/games`, params, (b) => ({
      games: list(b, "games", "games").map((g, i) => parseGame(g, `games[${i}]`)),
      next: orNull(b, "next", str, "games"),
    }));
  }

  /** The player's row of that day, or null: "your rank today" without paging the board. */
  async playerTournament(playerId: string | bigint, id: number | bigint): Promise<IndexerAnswer<LeaderboardEntry | null>> {
    return this.get(`/v1/players/${indexerPlayerId(playerId)}/tournaments/${tournamentPath(id)}`, {}, (b) =>
      b.entry === null ? null : parseEntry(b.entry, "entry"),
    );
  }

  /** One game; not-found when the indexer has no such game. */
  async game(contract: IndexerContract, gameId: number): Promise<IndexerAnswer<IndexedGame>> {
    if (!Number.isSafeInteger(gameId) || gameId < 0) throw new IndexerError("rejected", `Not a game id: ${gameId}`);
    return this.get(`/v1/games/${contract}/${gameId}`, {}, (b) => parseGame(b.game, "game"));
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined>, parse: (body: Obj) => T): Promise<IndexerAnswer<T>> {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const url = `${this.base}${path}${query ? `?${query}` : ""}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await this.doFetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
      text = await response.text();
    } catch (error) {
      throw new IndexerError("unreachable", `Indexer unreachable: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      // A gateway's HTML error page is the indexer being out of reach; an ok status with no JSON is a bad answer.
      if (response.ok) bad("not JSON");
      throw failedByStatus(response.status);
    }
    // A failure that is not an envelope (a gateway's JSON error) is judged by its HTTP status, not by a version it never had.
    if (!response.ok && !(isObj(body) && "version" in body)) throw failedByStatus(response.status);
    const envelope = obj(body, "envelope");
    if (envelope.version !== INDEXER_API_VERSION) {
      throw new IndexerError("wrong-version", `Indexer speaks API version ${String(envelope.version)}, this client reads ${INDEXER_API_VERSION}`, { version: envelope.version });
    }

    const status = envelope.status;
    const httpStatus = response.status;
    if (status === "loading" || status === "rewinding" || status === "halted") {
      const reason = typeof envelope.reason === "string" ? envelope.reason : undefined;
      throw new IndexerError("unavailable", `Indexer is ${status}${reason ? `: ${reason}` : ""}`, { status, reason, httpStatus });
    }
    if (status === "error" || !response.ok) {
      const what = typeof envelope.error === "string" ? envelope.error : `HTTP ${httpStatus}`;
      if (httpStatus === 404) throw new IndexerError("not-found", what, { httpStatus });
      throw new IndexerError(httpStatus >= 500 ? "unreachable" : "rejected", what, { httpStatus });
    }
    if (status !== "ok") bad(`unknown status ${String(status)}`);

    const headObj = obj(envelope.head, "head");
    const head: IndexerHead = { number: num(headObj, "number", "head"), hash: str(headObj, "hash", "head"), timestamp: num(headObj, "timestamp", "head") };
    const behind = num(envelope, "behind", "envelope");
    return { data: parse(envelope), head, behind, freshness: { kind: behind > this.maxLag ? "behind" : "ok", blocks: behind } };
  }
}

/** `VITE_INDEXER_URL` read into a client; null when it is unset or blank: the screens say "unavailable". */
export function createIndexerClient(url: string | undefined, options: Omit<IndexerOptions, "url"> = {}): IndexerClient | null {
  const trimmed = url?.trim();
  return trimmed ? new IndexerClient({ ...options, url: trimmed }) : null;
}
