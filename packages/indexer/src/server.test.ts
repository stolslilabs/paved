import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { MAX_TOURNAMENT_ID } from "./api.ts";
import { padded } from "./events.ts";
import { cacheOf, respond, serve } from "./server.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const DAY = 100;
const PA = padded(A);

async function served() {
  const node = new FakeNode();
  node.mine([ev.created(A, 0x416461)], [ev.created(B, 0x426f)]);
  node.mine([ev.spawned("daily", 1, A, { tournament: DAY })], [ev.spawned("daily", 2, B, { tournament: DAY })], [ev.spawned("tutorial", 1, A)]);
  node.mine([ev.over("daily", 1, A, 50, { tournament: DAY, end: 77 })]);
  node.mine([ev.over("daily", 2, B, 40, { tournament: DAY, end: 78 })]);
  const indexer = indexerOf(node);
  await settle(indexer);
  return { node, indexer };
}

const get = (indexer: Awaited<ReturnType<typeof served>>["indexer"], target: string) => respond(indexer, "GET", target);

describe("routes", () => {
  test("the envelope: version, status, head and behind", async () => {
    const { indexer, node } = await served();
    const answer = get(indexer, "/v1/tournaments/100");
    expect(answer.code).toBe(200);
    expect(answer.body).toMatchObject({
      version: 1,
      status: "ok",
      head: { number: node.tip, hash: expect.stringMatching(/^0x/), timestamp: expect.any(Number) },
      behind: 0,
      tournament: { id: DAY, games_spawned: 2, games_finished: 2, players: 2, best_score: 50 },
    });
    expect(Object.keys(answer.body.head as object).sort()).toEqual(["hash", "number", "timestamp"]);
  });

  test("GET /v1/head", async () => {
    const { indexer } = await served();
    const answer = get(indexer, "/v1/head");
    expect(answer.code).toBe(200);
    expect(answer.body).toMatchObject({
      state: "ok",
      chain_id: "0x534e5f5345504f4c4941",
      from_block: 1,
      contracts: { daily: "0x1111", tutorial: "0x2222", account: "0x3333" },
      checks: { tournaments_checked: 0, last_mismatch: null },
    });
  });

  test("the leaderboard, with the example's fields and paging", async () => {
    const { indexer } = await served();
    const answer = get(indexer, "/v1/tournaments/100/leaderboard?limit=1");
    expect(answer.code).toBe(200);
    expect(answer.body).toMatchObject({
      tournament_id: DAY,
      start_time: DAY * 86400,
      end_time: (DAY + 1) * 86400,
      total: 2,
      next_offset: 1,
      entries: [
        {
          rank: 1,
          player_id: PA,
          name: "Ada",
          best_score: 50,
          best_game_id: 1,
          games_played: 1,
          games_finished: 1,
          finished_at: 77,
          prize_ranks: [1],
        },
      ],
    });
    const last = get(indexer, "/v1/tournaments/100/leaderboard?limit=1&offset=1");
    expect((last.body as { next_offset: number | null }).next_offset).toBeNull();
    expect((last.body.entries as { rank: number }[])[0]!.rank).toBe(2);
  });

  test("the tournaments list, the player, its games, its entry and one game", async () => {
    const { indexer } = await served();
    expect(get(indexer, "/v1/tournaments?limit=5").body).toMatchObject({ tournaments: [{ id: DAY }], next: null });
    expect(get(indexer, `/v1/players/${PA}`).body).toMatchObject({
      player: { player_id: PA, name: "Ada" },
      stats: { daily_games: 1, daily_finished: 1, best_score: 50, tutorial_games: 1 },
    });
    expect(get(indexer, `/v1/players/${padded(0xeeen)}`)).toMatchObject({ code: 200, body: { player: null, stats: null } });
    const games = get(indexer, `/v1/players/${PA}/games?contract=daily`).body.games as { game_id: number }[];
    expect(games.map((g) => g.game_id)).toEqual([1]);
    expect(get(indexer, `/v1/players/${PA}/tournaments/100`).body).toMatchObject({ entry: { rank: 1 } });
    expect(get(indexer, `/v1/players/${PA}/tournaments/99`).body).toMatchObject({ entry: null });
    expect(get(indexer, "/v1/games/tutorial/1").body).toMatchObject({ game: { contract: "tutorial", game_id: 1, over: false } });
    expect(get(indexer, "/v1/games/daily/99")).toMatchObject({ code: 404, body: { status: "error" } });
  });

  test("a day with no game answers zeros, and the id bound holds", async () => {
    const { indexer } = await served();
    expect(get(indexer, "/v1/tournaments/7").body).toMatchObject({ tournament: { games_spawned: 0, players: 0, best_score: 0 } });
    expect(get(indexer, `/v1/tournaments/${MAX_TOURNAMENT_ID}`).code).toBe(200);
    expect(get(indexer, `/v1/tournaments/${MAX_TOURNAMENT_ID + 1}`).code).toBe(400);
  });

  test("P-19: the bound is floor((2^53 - 1) / 86400) - 1, and its times are exact safe integers", async () => {
    const { indexer } = await served();
    expect(MAX_TOURNAMENT_ID).toBe(104249991373);
    const bound = get(indexer, "/v1/tournaments/104249991373");
    expect(bound.code).toBe(200);
    expect(bound.body).toMatchObject({
      tournament: { id: 104249991373, start_time: 9007199254627200, end_time: 9007199254713600 },
    });
    expect((bound.body.tournament as { end_time: number }).end_time).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    const leaderboard = get(indexer, "/v1/tournaments/104249991373/leaderboard");
    expect(leaderboard.body).toMatchObject({ start_time: 9007199254627200, end_time: 9007199254713600 });
    expect(get(indexer, "/v1/tournaments/104249991374")).toMatchObject({ code: 400, body: { status: "error" } });
    expect(get(indexer, "/v1/tournaments?before=104249991374").code).toBe(400);
    expect(get(indexer, "/v1/tournaments?before=104249991373").code).toBe(200);
  });
});

describe("strict parameters", () => {
  test.each([
    ["/v1/tournaments?limit=0"],
    ["/v1/tournaments?limit=101"],
    ["/v1/tournaments?limit=1&limit=2"],
    ["/v1/tournaments?limit=abc"],
    ["/v1/tournaments?limit=01"],
    ["/v1/tournaments?nope=1"],
    ["/v1/tournaments?before=x"],
    ["/v1/tournaments/abc"],
    ["/v1/tournaments/01"],
    ["/v1/tournaments/-1"],
    ["/v1/tournaments/100?limit=1"],
    ["/v1/tournaments/100/leaderboard?offset=-1"],
    ["/v1/tournaments/100/leaderboard?cursor=1"],
    ["/v1/players/0x12"],
    [`/v1/players/${PA.slice(0, -1)}g`],
    [`/v1/players/0x${"f".repeat(64)}`],
    [`/v1/players/${PA}/games?contract=weekly`],
    [`/v1/players/${PA}/games?before=1:daily`],
    [`/v1/players/${PA}/games?before=1:daily:0`],
    [`/v1/players/${PA}/games?contract=daily&contract=tutorial`],
    [`/v1/players/${PA}/tournaments/x`],
    ["/v1/games/weekly/1"],
    ["/v1/games/daily/0"],
    ["/v1/games/daily/4294967296"],
    ["/v1/head?x=1"],
  ])("%s is 400", async (target) => {
    const { indexer } = await served();
    const answer = get(indexer, target);
    expect(answer.code).toBe(400);
    expect(answer.body).toMatchObject({ version: 1, status: "error", state: "ok" });
  });

  test("an unknown route is 404, a method that is not GET 405, a target that is not a path 400", async () => {
    const { indexer } = await served();
    for (const target of ["/", "/head", "/v2/head", "/v1", "/v1/nope", "/v1/tournaments/", "/v1/tournaments/1/x", "/v1/head/x"]) {
      expect(get(indexer, target).code, target).toBe(404);
    }
    expect(respond(indexer, "POST", "/v1/head").code).toBe(405);
    expect(respond(indexer, "GET", "//x:y").code).toBe(400);
    expect(respond(indexer, "GET", "v1/head").code).toBe(400);
  });
});

describe("states", () => {
  test("loading: every route answers 503 with the state", async () => {
    const node = new FakeNode();
    const indexer = indexerOf(node);
    for (const target of ["/v1/head", "/v1/tournaments", "/v1/games/daily/1"]) {
      expect(get(indexer, target)).toMatchObject({ code: 503, body: { version: 1, status: "loading", head: null } });
    }
    expect(get(indexer, "/v1/nope").code).toBe(404);
    expect(get(indexer, "/v1/tournaments?limit=0").code).toBe(400);
  });

  test("halted: 503 with the reason", async () => {
    const node = new FakeNode();
    node.mine([ev.over("daily", 1, A, 5)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    const answer = get(indexer, "/v1/tournaments/1");
    expect(answer.code).toBe(503);
    expect(answer.body).toMatchObject({ status: "halted", reason: expect.stringMatching(/no GameSpawned/) });
  });

  test("a rewind empties the answer cache, and the next answer is read again", async () => {
    const { indexer, node } = await served();
    get(indexer, "/v1/tournaments/100");
    get(indexer, "/v1/tournaments/100");
    expect(cacheOf(indexer).hits).toBe(1);
    node.reorg(1, [[[ev.over("daily", 2, B, 99, { tournament: DAY })]]]);
    await settle(indexer);
    expect(get(indexer, "/v1/tournaments/100").body).toMatchObject({ tournament: { best_score: 99 } });
  });
});

describe("the HTTP server", () => {
  let server: ReturnType<typeof serve> | undefined;
  afterEach(() => void server?.close());

  async function request(origins: string[], origin?: string) {
    const { indexer } = await served();
    server = serve(indexer, { allowedOrigins: origins });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    return fetch(`http://127.0.0.1:${port}/v1/tournaments/100`, origin ? { headers: { origin } } : {});
  }

  test("CORS: only an allowed origin is echoed", async () => {
    const allowed = await request(["http://localhost:5173"], "http://localhost:5173");
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(allowed.headers.get("content-type")).toBe("application/json");
    server?.close();
    const other = await request(["http://localhost:5173"], "http://evil.example");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    server?.close();
    const none = await request([], "http://localhost:5173");
    expect(none.headers.get("access-control-allow-origin")).toBeNull();
  });
});
