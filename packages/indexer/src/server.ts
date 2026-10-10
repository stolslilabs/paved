// Copied from Grim World, indexer/src/server.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: strict parameter checking, the envelope with `status` and `head`, the state-aware 503,
// the CORS allow-list and the answer cache by served block are kept; the routes are replaced by the v1 routes of
// docs/architecture/indexer.md, the envelope gains `version`, and the subscription (SSE) routes are removed. This copy is
// maintained by the Paved repository.
//
// Serving: `GET /v1/...` (the routes are in `route`). R1: in the states `loading`, `rewinding` and `halted` every route
// answers 503 with the state (and the reason), never rows. R2: every answer, errors included, carries `head {number,
// hash, timestamp}`, the served block it is read at (null while none is served). R6: rows are read as of the served
// block, and an answer is kept for that block only (by hash and commitments): the cache empties when another block is
// served and at every rewind. Every parameter is checked before anything is read: an unknown route is 404, a missing,
// unknown, repeated or malformed parameter 400, each with the head. Nothing a client sends stops the process: a target
// that is not a path is 400, an exception while answering is 500. Only a 200 holds rows: every other answer's `status`
// is `error` (4xx, 500; the serving state is in `state`) or the state that is not `ok` (503), never `ok`.
// CORS: a request whose `Origin` is one of `allowedOrigins` (none by default: the same origin only) is answered with
// `access-control-allow-origin` set to it.
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  API_VERSION,
  MAX_TOURNAMENT_ID,
  TOURNAMENT_DURATION,
  type ApiHead,
  type GameContract,
} from "./api.ts";
import { sameBlock, type Header } from "./chain.ts";
import type { CrossCheck } from "./crosscheck.ts";
import { canonical, felt, padded } from "./events.ts";
import type { Indexer } from "./indexer.ts";
import { Queries } from "./queries.ts";
import { clientAddress, limiterOf, type RateLimitOptions } from "./ratelimit.ts";

export type Answer = { code: number; body: Record<string, unknown> };

/** Page sizes: the default, and the cap. */
export const LIMIT = { default: 20, max: 100 };

/** The port the API listens on when `--port` is not given (P-20); `--port 0` picks a free one. */
export const DEFAULT_PORT = 8787;

class BadRequest extends Error {}

/** The served block as the API names it. */
export const apiHead = (header: Header | null | undefined): ApiHead | null =>
  header
    ? { number: header.number, hash: header.hash, timestamp: header.timestamp }
    : null;

/** An error answer: `status: "error"`, the error, the serving state and the served head. */
function refusal(indexer: Indexer, code: number, error: string): Answer {
  return {
    code,
    body: {
      version: API_VERSION,
      status: "error",
      error,
      state: indexer.status,
      head: apiHead(indexer.served),
    },
  };
}

// --- parameters ----------------------------------------------------------------------------------

type Parameters = Record<string, string | undefined>;

/** The parameters of `url`: only the allowed names, each at most once, the required ones present. */
function parameters(
  url: URL,
  required: readonly string[],
  optional: readonly string[] = [],
): Parameters {
  const allowed = new Set([...required, ...optional]);
  const result: Parameters = {};
  for (const [name, value] of url.searchParams) {
    if (!allowed.has(name)) throw new BadRequest(`unknown parameter ${name}`);
    if (result[name] !== undefined)
      throw new BadRequest(`parameter ${name} given twice`);
    result[name] = value;
  }
  for (const name of required) {
    if (result[name] === undefined)
      throw new BadRequest(`parameter ${name} is required`);
  }
  return result;
}

/** A whole number in `[min, max]`, decimal, without sign or leading zeros. */
function integer(
  value: string | undefined,
  name: string,
  min: number,
  max: number,
): number {
  if (value === undefined || !/^(0|[1-9]\d{0,15})$/.test(value))
    throw new BadRequest(`${name} must be a whole number`);
  const number = Number(value);
  if (number < min || number > max)
    throw new BadRequest(`${name} must be from ${min} to ${max}`);
  return number;
}

const U32_MAX = 2 ** 32 - 1;

const limitOf = (value: string | undefined) =>
  value === undefined ? LIMIT.default : integer(value, "limit", 1, LIMIT.max);

/** A tournament id of a path or a parameter: a decimal string, at most MAX_TOURNAMENT_ID. */
const tournamentId = (value: string | undefined, name = "id") =>
  integer(value, name, 0, MAX_TOURNAMENT_ID);

/** A player id: `0x` and 64 hex digits (66 characters, zero-padded), a felt. Returned lowercase. */
function playerId(value: string, name = "player_id"): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value))
    throw new BadRequest(`${name} must be 0x and 64 hex digits`);
  try {
    felt(value);
  } catch {
    throw new BadRequest(`${name} is not a felt`);
  }
  return padded(canonical(value));
}

function contractOf(value: string | undefined, name = "contract"): GameContract {
  if (value !== "daily" && value !== "tutorial")
    throw new BadRequest(`${name} must be daily or tutorial`);
  return value;
}

/** The cursor of the games list: `<start_time>:<contract>:<game_id>`. */
function gamesCursor(value: string | undefined) {
  if (value === undefined) return undefined;
  const match = /^(0|[1-9]\d{0,15}):(daily|tutorial):([1-9]\d{0,9})$/.exec(value);
  if (!match || Number(match[3]) > U32_MAX)
    throw new BadRequest("before must be <start_time>:<contract>:<game_id>");
  return {
    startTime: Number(match[1]),
    contract: match[2] as GameContract,
    gameId: Number(match[3]),
  };
}

// --- routes --------------------------------------------------------------------------------------

export type Read = (queries: Queries, served: Header) => Record<string, unknown>;

/** The route of a query: its parameters checked, and the read to make as of the served block; null if there is none. */
function route(url: URL): Read | null {
  const parts = url.pathname.split("/");
  // "", "v1", ...
  if (parts[0] !== "" || parts[1] !== "v1") return null;
  const [, , area, a, b, c, d] = parts;
  switch (area) {
    case "tournaments": {
      if (a === "") return null;
      if (parts.length === 3) {
        const p = parameters(url, [], ["limit", "before"]);
        const limit = limitOf(p.limit);
        const before =
          p.before === undefined ? undefined : tournamentId(p.before, "before");
        return (queries, served) =>
          queries.tournaments(served.number, limit, before);
      }
      if (parts.length === 4) {
        const id = tournamentId(a);
        parameters(url, []);
        return (queries, served) => ({
          tournament: queries.tournament(served.number, id),
          economy: queries.dayEconomy(served.number, id),
        });
      }
      if (b === "leaderboard" && parts.length === 5) {
        const id = tournamentId(a);
        const p = parameters(url, [], ["limit", "offset"]);
        const limit = limitOf(p.limit);
        const offset =
          p.offset === undefined ? 0 : integer(p.offset, "offset", 0, 2 ** 31);
        return (queries, served) => {
          const { total, entries } = queries.leaderboard(
            served.number,
            id,
            limit,
            offset,
          );
          const next = offset + entries.length;
          return {
            tournament_id: id,
            start_time: id * TOURNAMENT_DURATION,
            end_time: (id + 1) * TOURNAMENT_DURATION,
            total,
            entries,
            next_offset: entries.length === limit && next < total ? next : null,
          };
        };
      }
      return null;
    }
    case "sponsors": {
      // A sponsor is an account address, written as a player id is (66 characters, a felt).
      if (b !== "days" || parts.length !== 5 || a === undefined || a === "") return null;
      const sponsor = playerId(a, "sponsor_id");
      const p = parameters(url, [], ["limit", "before"]);
      const limit = limitOf(p.limit);
      const before = p.before === undefined ? undefined : tournamentId(p.before, "before");
      return (queries, served) => ({
        sponsor_id: sponsor,
        ...queries.sponsorDays(served.number, sponsor, limit, before),
      });
    }
    case "definitions": {
      if (parts.length !== 3) return null;
      parameters(url, []);
      return (queries, served) => queries.definitions(served.number);
    }
    case "players": {
      if (a === undefined || a === "") return null;
      if (parts.length === 4) {
        const player = playerId(a);
        parameters(url, []);
        return (queries, served) => {
          const found = queries.player(served.number, player);
          return {
            player: found?.player ?? null,
            stats: found?.stats ?? null,
            unsettled: found?.unsettled ?? null,
            unsettled_count: found?.unsettled_count ?? null,
          };
        };
      }
      if (b === "quests" && parts.length === 5) {
        const player = playerId(a);
        const p = parameters(url, [], ["day"]);
        const day = p.day === undefined ? undefined : integer(p.day, "day", 0, MAX_TOURNAMENT_ID);
        return (queries, served) => {
          // Without `day`: the UTC day of the served block
          const of = day ?? Math.floor(served.timestamp / TOURNAMENT_DURATION);
          return {
            player_id: player,
            day: of,
            start_time: of * TOURNAMENT_DURATION,
            end_time: (of + 1) * TOURNAMENT_DURATION,
            quests: queries.playerQuests(served.number, player, of),
          };
        };
      }
      if (b === "achievements" && parts.length === 5) {
        const player = playerId(a);
        parameters(url, []);
        return (queries, served) => ({
          player_id: player,
          ...queries.playerAchievements(served.number, player),
        });
      }
      if (b === "games" && parts.length === 5) {
        const player = playerId(a);
        const p = parameters(url, [], ["contract", "limit", "before"]);
        const contract =
          p.contract === undefined ? undefined : contractOf(p.contract);
        const limit = limitOf(p.limit);
        const before = gamesCursor(p.before);
        return (queries, served) =>
          queries.games(served.number, player, contract, limit, before);
      }
      if (b === "tournaments" && c !== undefined && parts.length === 6 && d === undefined) {
        const player = playerId(a);
        const id = tournamentId(c);
        parameters(url, []);
        return (queries, served) => ({
          tournament_id: id,
          entry: queries.entry(served.number, id, player),
        });
      }
      return null;
    }
    case "games": {
      if (a === undefined || b === undefined || parts.length !== 5) return null;
      const contract = contractOf(a);
      const id = integer(b, "game_id", 1, U32_MAX);
      parameters(url, []);
      return (queries, served) => {
        const game = queries.game(served.number, contract, id);
        if (!game) throw new NotFound("game not found");
        return { game };
      };
    }
    default:
      return null;
  }
}

class NotFound extends Error {}

// --- R6: answers kept for the served block ---------------------------------------------------------

/**
 * The rows of the answers read at one served block, by target; emptied at every rewind. Bounded in bytes (the JSON of the
 * rows): MAX_BYTES in all, the oldest forgotten first; an answer larger than MAX_ENTRY is not kept.
 */
export class AnswerCache {
  static readonly MAX_BYTES = 32 * 2 ** 20;
  static readonly MAX_ENTRY = 2 ** 20;
  private readonly maxBytes: number;
  private readonly maxEntry: number;
  private block: Header | null = null;
  private readonly answers = new Map<
    string,
    { rows: Record<string, unknown>; bytes: number }
  >();
  bytes = 0;
  readonly queries: Queries;
  hits = 0;
  misses = 0;

  constructor(
    indexer: Indexer,
    maxBytes = AnswerCache.MAX_BYTES,
    maxEntry = AnswerCache.MAX_ENTRY,
  ) {
    this.maxBytes = maxBytes;
    this.maxEntry = maxEntry;
    this.queries = new Queries(indexer.store);
    indexer.listen({ rewound: () => this.clear() });
  }

  clear() {
    this.block = null;
    this.answers.clear();
    this.bytes = 0;
  }

  /** The rows of `target` at `served`: kept ones, or read by `read` (and kept if they fit). */
  read(served: Header, target: string, read: Read): Record<string, unknown> {
    if (!this.block || !sameBlock(this.block, served)) {
      this.clear();
      this.block = served;
    }
    const kept = this.answers.get(target);
    if (kept) {
      this.hits++;
      return kept.rows;
    }
    this.misses++;
    const rows = read(this.queries, served);
    const bytes = JSON.stringify(rows).length;
    if (bytes > this.maxEntry) return rows;
    for (const [oldest, entry] of this.answers) {
      if (this.bytes + bytes <= this.maxBytes) break;
      this.answers.delete(oldest);
      this.bytes -= entry.bytes;
    }
    this.answers.set(target, { rows, bytes });
    this.bytes += bytes;
    return rows;
  }
}

const caches = new WeakMap<Indexer, AnswerCache>();
export function cacheOf(indexer: Indexer): AnswerCache {
  let cache = caches.get(indexer);
  if (!cache) {
    cache = new AnswerCache(indexer);
    caches.set(indexer, cache);
  }
  return cache;
}

// --- answers -------------------------------------------------------------------------------------

/** What `GET /v1/head` reports beyond the indexer's own state. */
export type HeadInfo = {
  chainId: string;
  fromBlock: number;
  contracts: {
    daily: string;
    tutorial: string;
    account: string;
    economy: string;
    collection: string | null;
  };
  checks?: CrossCheck;
};

const unavailable = (indexer: Indexer): Answer => ({
  code: 503,
  body: {
    version: API_VERSION,
    status: indexer.status,
    reason: indexer.reason || undefined,
    head: apiHead(indexer.served),
  },
});

/** The answer to a GET of `target`, a path and its query (the HTTP server's, without the socket). */
export function answer(indexer: Indexer, target: string, info?: HeadInfo): Answer {
  const url = new URL(target, "http://indexer");
  const path = url.pathname;
  const isHead = path === "/v1/head";
  let read: Read | null = null;
  try {
    if (isHead) parameters(url, []);
    else read = route(url);
  } catch (error) {
    if (error instanceof BadRequest) return refusal(indexer, 400, error.message);
    throw error;
  }
  if (!isHead && !read) return refusal(indexer, 404, "not found");
  const served = indexer.served;
  if (indexer.status !== "ok" || !served) return unavailable(indexer);
  const envelope = {
    version: API_VERSION,
    status: "ok",
    head: apiHead(served),
    behind: Math.max(0, indexer.chainTip - served.number),
  };
  if (isHead) {
    const stored = indexer.store.contracts();
    return {
      code: 200,
      body: {
        ...envelope,
        state: indexer.status,
        chain_id: info?.chainId ?? indexer.store.meta("chain_id"),
        from_block: info?.fromBlock ?? Number(indexer.store.meta("from_block")),
        contracts: info?.contracts ?? stored,
        checks: {
          tournaments_checked: info?.checks?.checked.size ?? 0,
          last_mismatch: info?.checks?.lastMismatch ?? null,
          definitions_excluded: cacheOf(indexer).queries.excludedDefinitions(served.number),
        },
      },
    };
  }
  try {
    const rows = cacheOf(indexer).read(served, `${path}${url.search}`, read!);
    return { code: 200, body: { ...envelope, ...rows } };
  } catch (error) {
    if (error instanceof NotFound) return refusal(indexer, 404, error.message);
    throw error;
  }
}

/** Whether `target` is a path this server can parse (else 400). */
function parsable(target: string | undefined): target is string {
  return (
    target !== undefined &&
    target.startsWith("/") &&
    URL.canParse(target, "http://indexer")
  );
}

/** The answer to a request: 405 unless GET, 400 for a target that is not a path, 500 on a throw. */
export function respond(
  indexer: Indexer,
  method: string | undefined,
  target: string | undefined,
  info?: HeadInfo,
): Answer {
  try {
    if (method !== "GET") return refusal(indexer, 405, "GET only");
    const raw = target ?? "/";
    if (!parsable(raw)) return refusal(indexer, 400, "bad request");
    return answer(indexer, raw, info);
  } catch {
    return refusal(indexer, 500, "internal error");
  }
}

type Headers = Record<string, string>;

function send(response: ServerResponse, result: Answer, headers: Headers) {
  response.writeHead(result.code, {
    ...headers,
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(result.body));
}

/** The CORS headers of an answer to `request`: its origin only if allowed. */
function corsOf(
  request: IncomingMessage,
  allowed: ReadonlySet<string>,
): Headers {
  const origin = request.headers.origin;
  return origin !== undefined && allowed.has(origin)
    ? { "access-control-allow-origin": origin, vary: "Origin" }
    : { vary: "Origin" };
}

export type ServeOptions = {
  /** Origins answered with `access-control-allow-origin` (default none: the same origin only). */
  allowedOrigins?: readonly string[];
  info?: HeadInfo;
  /** Per-address rate limit (P-43); none, or `rate` 0, means no limit. */
  rateLimit?: RateLimitOptions;
};

/** The HTTP server. */
export function serve(indexer: Indexer, options: ServeOptions = {}): Server {
  const allowed = new Set(options.allowedOrigins ?? []);
  const limiter = limiterOf(options.rateLimit);
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const headers = corsOf(request, allowed);
    // First, before any work, whatever the method: an OPTIONS preflight takes a token like a GET.
    const verdict = limiter?.take(
      clientAddress(request.socket.remoteAddress, request.headers["x-forwarded-for"]),
    );
    if (verdict && !verdict.allowed) {
      send(response, refusal(indexer, 429, "too many requests"), {
        ...headers,
        "retry-after": String(verdict.retryAfter),
        // Without this a browser's script cannot read Retry-After from a cross-origin answer.
        "access-control-expose-headers": "Retry-After",
      });
      return;
    }
    let result: Answer;
    try {
      result = respond(indexer, request.method, request.url, options.info);
    } catch {
      result = {
        code: 500,
        body: {
          version: API_VERSION,
          status: "error",
          error: "internal error",
          state: indexer.status,
          head: null,
        },
      };
    }
    send(response, result, headers);
  });
}
