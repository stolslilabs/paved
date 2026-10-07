// A fixture server for the indexer API v1: an in-process `fetch` built from the examples of
// docs/architecture/indexer.md. For tests only; no real indexer exists yet. It checks parameters the
// way the doc says the API does (a missing, unknown, repeated or malformed one is 400, an unknown
// route 404), so a client bug shows here.

/** Ada holds slots 1 and 3, as in the doc's leaderboard example. */
export const FIXTURE_ADA = "0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef";
export const FIXTURE_NAMELESS = "0x00000000000000000000000000000000000000000000000000000000000722ac";
export const FIXTURE_BO = "0x0000000000000000000000000000000000000000000000000000000000035810";
export const FIXTURE_TOURNAMENT = 20733;
export const FIXTURE_HEAD = { number: 9120, hash: "0x01b4e2", timestamp: 1791878004 };

import { MAX_TOURNAMENT_ID } from "./indexer";

type Row = Record<string, unknown>;

export interface FixtureState {
  /** Blocks the indexer says it is behind the chain. */
  behind: number;
  /** `ok`, or a 503 status. */
  status: "ok" | "loading" | "rewinding" | "halted";
  /** A thrown fetch, as for an indexer that is down. */
  down: boolean;
  /** The envelope's version. */
  version: number;
  /** Replaces the body of the next answer (and only that one) with this text, served with `httpStatus`. */
  rawBody?: { text: string; httpStatus: number };
}

const tournament = (id: number, over: Partial<Row> = {}): Row => ({
  id,
  start_time: 1791849600 + (id - FIXTURE_TOURNAMENT) * 86400,
  end_time: 1791936000 + (id - FIXTURE_TOURNAMENT) * 86400,
  games_spawned: 52,
  games_finished: 47,
  players: 41,
  best_score: 187,
  ...over,
});

const ENTRIES: Row[] = [
  { rank: 1, player_id: FIXTURE_ADA, name: "Ada", best_score: 187, best_game_id: 912, games_played: 3, games_finished: 2, finished_at: 1791871203, prize_ranks: [1, 3] },
  { rank: 2, player_id: FIXTURE_NAMELESS, name: null, best_score: 181, best_game_id: 877, games_played: 1, games_finished: 1, finished_at: 1791866650, prize_ranks: [2] },
  { rank: 3, player_id: FIXTURE_BO, name: "Bo", best_score: 176, best_game_id: 903, games_played: 2, games_finished: 2, finished_at: 1791870011, prize_ranks: [] },
  // The rest of the 41 players of the example's `total`.
  ...Array.from({ length: 38 }, (_, i): Row => ({
    rank: i + 4,
    player_id: `0x${(0x1000 + i).toString(16).padStart(64, "0")}`,
    name: `Player ${i + 4}`,
    best_score: 170 - i,
    best_game_id: 800 - i,
    games_played: 1,
    games_finished: 1,
    finished_at: 1791860000 + i,
    prize_ranks: [],
  })),
];

const GAMES: Row[] = [
  { contract: "daily", game_id: 912, mode: 1, start_time: 1791869000, tournament_id: 20733, over: true, score: 187, counted_tournament_id: 20733, end_time: 1791871203 },
  { contract: "tutorial", game_id: 55, mode: 3, start_time: 1791860000, tournament_id: 0, over: true, score: 64, counted_tournament_id: 0, end_time: 0 },
];

/** A fixture indexer: set `state` to put it in a degraded condition, then pass `fetch` to an `IndexerClient`. */
export class FixtureIndexer {
  readonly state: FixtureState = { behind: 0, status: "ok", down: false, version: 1, rawBody: undefined };
  /** Every URL asked, in order. */
  readonly requests: string[] = [];
  /** Rows by tournament id; a tournament not listed answers zeros and an empty board. */
  entries = new Map<number, Row[]>([[FIXTURE_TOURNAMENT, ENTRIES]]);
  tournaments: Row[] = [
    tournament(FIXTURE_TOURNAMENT),
    tournament(FIXTURE_TOURNAMENT - 1, { players: 12, best_score: 150 }),
    tournament(FIXTURE_TOURNAMENT - 2, { players: 7, best_score: 143 }),
  ];
  games: Row[] = GAMES;

  /** A `fetch` for `new IndexerClient({ url, fetch })`. */
  readonly fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    this.requests.push(`${url.pathname}${url.search}`);
    if (this.state.down) throw new TypeError("fetch failed");
    const raw = this.state.rawBody;
    if (raw) {
      this.state.rawBody = undefined;
      return new Response(raw.text, { status: raw.httpStatus });
    }
    const { version, status } = this.state;
    if (status !== "ok") return json(503, { version, status, reason: status === "halted" ? "a contract changed" : "starting" });
    const result = this.route(url);
    if (result.error) return json(result.code, { version, status: "error", error: result.error, state: "ok" });
    return json(200, { version, status: "ok", head: FIXTURE_HEAD, behind: this.state.behind, ...result.body });
  };

  private route(url: URL): { code: number; error: string; body?: undefined } | { code: 200; error?: undefined; body: Row } {
    const fail = (code: number, error: string) => ({ code, error });
    const ok = (body: Row) => ({ code: 200 as const, body });
    const path = url.pathname.split("/").filter(Boolean);
    if (path[0] !== "v1") return fail(404, "unknown route");

    const allowed = (...names: string[]) => {
      const seen = new Set<string>();
      for (const key of url.searchParams.keys()) {
        if (!names.includes(key) || seen.has(key)) return `unknown or repeated parameter ${key}`;
        seen.add(key);
      }
      return null;
    };
    const int = (key: string, min: number, max: number, fallback: number): number | string => {
      const text = url.searchParams.get(key);
      if (text === null) return fallback;
      return /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max ? Number(text) : `malformed ${key}`;
    };
    const decimalId = (text: string) => (/^\d+$/.test(text) && Number(text) <= MAX_TOURNAMENT_ID ? Number(text) : null);
    const playerOk = (id: string) => /^0x[0-9a-f]{64}$/.test(id);

    const [, a, b, c, d] = path;
    if (a === "head" && !b) {
      const e = allowed();
      if (e) return fail(400, e);
      return ok({ state: "ok", chain_id: "0x534e5f5345504f4c4941", from_block: 12, contracts: { account: "0x1", daily: "0x2", tutorial: "0x3" }, checks: { last_mismatch: null } });
    }
    if (a === "tournaments" && !b) {
      const e = allowed("limit", "before");
      if (e) return fail(400, e);
      const limit = int("limit", 1, 100, 20);
      const before = int("before", 0, Number.MAX_SAFE_INTEGER, Infinity);
      if (typeof limit === "string") return fail(400, limit);
      if (typeof before === "string") return fail(400, before);
      const rows = this.tournaments.filter((t) => (t.id as number) < before);
      const page = rows.slice(0, limit);
      return ok({ tournaments: page.map(({ games_finished: _f, ...t }) => t), next: rows.length > limit ? page[page.length - 1].id : null });
    }
    if (a === "tournaments" && b && !c) {
      const e = allowed();
      const id = decimalId(b);
      if (e || id === null) return fail(400, e ?? "malformed tournament id");
      return ok({ tournament: this.tournaments.find((t) => t.id === id) ?? tournament(id, { games_spawned: 0, games_finished: 0, players: 0, best_score: 0 }) });
    }
    if (a === "tournaments" && b && c === "leaderboard" && !d) {
      const e = allowed("limit", "offset");
      const id = decimalId(b);
      if (e || id === null) return fail(400, e ?? "malformed tournament id");
      const limit = int("limit", 1, 100, 20);
      const offset = int("offset", 0, Number.MAX_SAFE_INTEGER, 0);
      if (typeof limit === "string") return fail(400, limit);
      if (typeof offset === "string") return fail(400, offset);
      const rows = this.entries.get(id) ?? [];
      const page = rows.slice(offset, offset + limit);
      const t = this.tournaments.find((x) => x.id === id) ?? tournament(id);
      return ok({ tournament_id: id, start_time: t.start_time, end_time: t.end_time, total: rows.length, entries: page, next_offset: offset + limit < rows.length ? offset + limit : null });
    }
    if (a === "players" && b) {
      if (!playerOk(b)) return fail(400, "malformed player id");
      if (!c) {
        const e = allowed();
        if (e) return fail(400, e);
        const known = ENTRIES.find((r) => r.player_id === b);
        if (!known) return ok({ player: null, stats: null });
        const mine = this.games.filter((g) => g.contract === "daily");
        return ok({
          player: { player_id: b, name: known.name, created: 1791000000 },
          stats: { daily_games: mine.length || (known.games_played as number), daily_finished: known.games_finished, best_score: known.best_score, tutorial_games: this.games.filter((g) => g.contract === "tutorial").length },
        });
      }
      if (c === "games" && !d) {
        const e = allowed("contract", "limit", "before");
        if (e) return fail(400, e);
        const contract = url.searchParams.get("contract");
        if (contract !== null && contract !== "daily" && contract !== "tutorial") return fail(400, "malformed contract");
        const limit = int("limit", 1, 100, 20);
        if (typeof limit === "string") return fail(400, limit);
        if (b !== FIXTURE_ADA) return ok({ games: [], next: null });
        const before = url.searchParams.get("before");
        const key = (g: Row) => `${g.start_time}:${g.contract}:${g.game_id}`;
        const rows = this.games.filter((g) => (!contract || g.contract === contract) && (before === null || key(g) < before));
        const page = rows.slice(0, limit);
        return ok({ games: page, next: rows.length > limit ? key(page[page.length - 1]) : null });
      }
      if (c === "tournaments" && d) {
        const e = allowed();
        const id = decimalId(d);
        if (e || id === null) return fail(400, e ?? "malformed tournament id");
        return ok({ entry: (this.entries.get(id) ?? []).find((r) => r.player_id === b) ?? null });
      }
    }
    if (a === "games" && b && c && !d) {
      const e = allowed();
      if (e || (b !== "daily" && b !== "tutorial") || !/^\d+$/.test(c)) return fail(400, e ?? "malformed game");
      const game = this.games.find((g) => g.contract === b && g.game_id === Number(c));
      return game ? ok({ game }) : fail(404, "no such game");
    }
    return fail(404, "unknown route");
  }
}

function json(code: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
}
