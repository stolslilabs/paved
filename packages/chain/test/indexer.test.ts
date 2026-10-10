import { beforeEach, describe, expect, test } from "vitest";
import { FIXTURE_ADA, FIXTURE_BO, FIXTURE_HEAD, FIXTURE_NAMELESS, FIXTURE_TOURNAMENT, FixtureIndexer, RUNNING_GAME } from "../src/testing";
import { IndexerClient, IndexerError, MAX_TOURNAMENT_ID, createIndexerClient, indexerPlayerId } from "../src/indexer";

let fixture: FixtureIndexer;
let client: IndexerClient;
beforeEach(() => {
  fixture = new FixtureIndexer();
  client = new IndexerClient({ url: "http://indexer.test/", fetch: fixture.fetch as typeof fetch });
});

const kindOf = async (p: Promise<unknown>) => p.then(() => "none", (e: IndexerError) => e.kind);

describe("endpoints", () => {
  test("/v1/head", async () => {
    const { data, head } = await client.head();
    expect(head).toEqual(FIXTURE_HEAD);
    expect(data).toMatchObject({ state: "ok", fromBlock: 12, lastMismatch: null, tournamentsChecked: 2 });
    expect(data.contracts.daily).toBe("0x2");
    expect(fixture.requests).toEqual(["/v1/head"]);
  });

  test("/v1/head accepts the as-built extra fields and any unknown key, and a missing checks", async () => {
    const ok = { version: 1, status: "ok", head: FIXTURE_HEAD, behind: 0, state: "ok", chain_id: "0x1", from_block: 3, contracts: { daily: "0x2" } };
    const raw = (extra: object) => {
      fixture.state.rawBody = { text: JSON.stringify({ ...ok, ...extra }), httpStatus: 200 };
      return client.head();
    };
    expect((await raw({ checks: { tournaments_checked: 4, last_mismatch: null, later_field: [1] }, later: "x" })).data).toMatchObject({ lastMismatch: null, tournamentsChecked: 4 });
    expect((await raw({ checks: { last_mismatch: null } })).data).toMatchObject({ lastMismatch: null, tournamentsChecked: null });
    expect((await raw({})).data).toMatchObject({ lastMismatch: null, tournamentsChecked: null });
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, checks: { tournaments_checked: -1, last_mismatch: null } }), httpStatus: 200 };
    expect(await kindOf(client.head())).toBe("bad-response");
  });

  test("a games row and a head with appended fields (token_id, contracts.collection, unknown keys) still parse", async () => {
    fixture.games = fixture.games.map((g, i) => ({ ...g, token_id: i === 0 ? 7 : null, later_field: { x: 1 } }));
    const { data } = await client.playerGames(FIXTURE_ADA);
    expect(data.games.length).toBeGreaterThan(0);
    expect(data.games[0]).toMatchObject({ gameId: fixture.games[0].game_id });
    expect(data.games[0]).not.toHaveProperty("token_id");
    fixture.state.rawBody = {
      text: JSON.stringify({ version: 1, status: "ok", head: FIXTURE_HEAD, behind: 0, state: "ok", chain_id: "0x1", from_block: 3, contracts: { daily: "0x2", collection: "0x5" } }),
      httpStatus: 200,
    };
    expect((await client.head()).data.contracts).toMatchObject({ daily: "0x2", collection: "0x5" });
  });

  test("/v1/head reads last_mismatch as a typed object, and refuses any other shape", async () => {
    const slot = (player: string, score: number) => ({ player_id: player, score });
    fixture.state.lastMismatch = {
      tournament_id: 20730,
      head_number: 41,
      view: [slot(FIXTURE_BO, 40), slot(FIXTURE_ADA, 50), slot("0x0", 0)],
      indexed: [slot(FIXTURE_ADA, 50), slot(FIXTURE_BO, 40), slot("0x0", 0)],
    };
    expect((await client.head()).data.lastMismatch).toEqual({
      tournamentId: 20730,
      headNumber: 41,
      view: [{ playerId: FIXTURE_BO, score: 40 }, { playerId: FIXTURE_ADA, score: 50 }, { playerId: "0x0", score: 0 }],
      indexed: [{ playerId: FIXTURE_ADA, score: 50 }, { playerId: FIXTURE_BO, score: 40 }, { playerId: "0x0", score: 0 }],
    });
    for (const wrong of [20730, "20730", [], { tournament_id: 20730 }, { tournament_id: 1, head_number: 2, view: [{ player_id: "0x1" }], indexed: [] }, { tournament_id: 1, head_number: 2, view: [], indexed: {} }]) {
      fixture.state.lastMismatch = wrong as never;
      expect(await kindOf(client.head())).toBe("bad-response");
    }
  });

  test("null score, end time or counted tournament is accepted only on a running game", async () => {
    const finished = fixture.games[0];
    for (const key of ["score", "end_time", "counted_tournament_id"]) {
      fixture.games = [{ ...RUNNING_GAME }, { ...finished }];
      expect((await client.playerGames(FIXTURE_ADA)).data.games[0].over).toBe(false);
      fixture.games = [{ ...finished, [key]: null }];
      expect(await kindOf(client.playerGames(FIXTURE_ADA))).toBe("bad-response");
      expect(await kindOf(client.game("daily", finished.game_id as number))).toBe("bad-response");
      fixture.games = [{ ...RUNNING_GAME, [key]: 5 }];
      expect((await client.game("daily", 913)).data).toMatchObject({ over: false });
    }
  });

  test("a running game: the null score, tournament and end time read as 0, not as a bad answer", async () => {
    fixture.games = [RUNNING_GAME, ...fixture.games];
    const { data } = await client.playerGames(FIXTURE_ADA);
    expect(data.games[0]).toEqual({ contract: "daily", gameId: 913, mode: 1, startTime: 1791875000, tournamentId: 20733, over: false, score: 0, countedTournamentId: 0, endTime: 0 });
    expect((await client.game("daily", 913)).data.over).toBe(false);
  });

  test("/v1/tournaments pages newest first with before and next", async () => {
    const first = await client.tournaments({ limit: 2 });
    expect(first.data.tournaments.map((t) => t.id)).toEqual([FIXTURE_TOURNAMENT, FIXTURE_TOURNAMENT - 1]);
    expect(first.data.next).toBe(FIXTURE_TOURNAMENT - 1);
    expect(first.data.tournaments[0]).toMatchObject({ players: 41, bestScore: 187, gamesSpawned: 52 });
    const second = await client.tournaments({ limit: 2, before: first.data.next! });
    expect(second.data.tournaments.map((t) => t.id)).toEqual([FIXTURE_TOURNAMENT - 2]);
    expect(second.data.next).toBeNull();
  });

  test("/v1/tournaments/{id}: one day, zeros for a day with no game", async () => {
    const day = await client.tournament(FIXTURE_TOURNAMENT);
    expect(day.data).toMatchObject({ id: FIXTURE_TOURNAMENT, gamesFinished: 47, players: 41 });
    const empty = await client.tournament(5n);
    expect(empty.data).toMatchObject({ id: 5, gamesSpawned: 0, players: 0, bestScore: 0 });
    expect(fixture.requests[1]).toBe("/v1/tournaments/5");
  });

  test("/v1/tournaments/{id}/leaderboard: the doc's example, with several prize slots for one player", async () => {
    const board = await client.leaderboard(FIXTURE_TOURNAMENT, { limit: 3 });
    expect(fixture.requests[0]).toBe(`/v1/tournaments/${FIXTURE_TOURNAMENT}/leaderboard?limit=3`);
    expect(board.data).toMatchObject({ tournamentId: FIXTURE_TOURNAMENT, total: 41, nextOffset: 3 });
    expect(board.data.entries[0]).toEqual({
      rank: 1, playerId: FIXTURE_ADA, name: "Ada", bestScore: 187, bestGameId: 912, gamesPlayed: 3, gamesFinished: 2, finishedAt: 1791871203, prizeRanks: [1, 3],
    });
    expect(board.data.entries[1]).toMatchObject({ name: null, prizeRanks: [2] });
    expect(board.data.entries[2]).toMatchObject({ playerId: FIXTURE_BO, prizeRanks: [] });
  });

  test("leaderboard: offset pages to the end", async () => {
    const last = await client.leaderboard(FIXTURE_TOURNAMENT, { limit: 20, offset: 40 });
    expect(last.data.entries).toHaveLength(1);
    expect(last.data.nextOffset).toBeNull();
    const none = await client.leaderboard(99);
    expect(none.data).toMatchObject({ total: 0, entries: [], nextOffset: null });
  });

  test("/v1/players/{id}: a known player, and an unknown one as null", async () => {
    const ada = await client.player(FIXTURE_ADA);
    expect(ada.data.player).toEqual({ playerId: FIXTURE_ADA, name: "Ada", created: 1791000000 });
    expect(ada.data.stats).toMatchObject({ bestScore: 187, tutorialGames: 1 });
    const nobody = await client.player(0x123n);
    expect(nobody.data).toEqual({ player: null, stats: null });
    expect(fixture.requests[1]).toBe(`/v1/players/0x${"123".padStart(64, "0")}`);
  });

  test("/v1/players/{id}/games: the doc's example, filtered and paged", async () => {
    const all = await client.playerGames(FIXTURE_ADA, { limit: 1 });
    expect(all.data.games).toHaveLength(1);
    expect(all.data.games[0]).toEqual({
      contract: "daily", gameId: 912, mode: 1, startTime: 1791869000, tournamentId: 20733, over: true, score: 187, countedTournamentId: 20733, endTime: 1791871203,
    });
    expect(all.data.next).toBe("1791869000:daily:912");
    const rest = await client.playerGames(FIXTURE_ADA, { limit: 1, before: all.data.next! });
    expect(rest.data.games.map((g) => g.contract)).toEqual(["tutorial"]);
    expect(rest.data.next).toBeNull();
    const tutorial = await client.playerGames(FIXTURE_ADA, { contract: "tutorial" });
    expect(tutorial.data.games).toHaveLength(1);
    expect((await client.playerGames(FIXTURE_BO)).data.games).toEqual([]);
  });

  test("/v1/players/{id}/tournaments/{id}: the player's row, or null", async () => {
    const row = await client.playerTournament(FIXTURE_ADA, FIXTURE_TOURNAMENT);
    expect(row.data).toMatchObject({ rank: 1, prizeRanks: [1, 3] });
    expect((await client.playerTournament(FIXTURE_ADA, 7)).data).toBeNull();
    expect((await client.playerTournament(FIXTURE_NAMELESS, FIXTURE_TOURNAMENT)).data?.name).toBeNull();
  });

  test("/v1/games/{contract}/{id}: one game, or not-found", async () => {
    expect((await client.game("tutorial", 55)).data).toMatchObject({ contract: "tutorial", gameId: 55, score: 64, countedTournamentId: 0 });
    expect(await kindOf(client.game("daily", 31337))).toBe("not-found");
  });
});

describe("envelope", () => {
  test("status ok and behind map into a freshness state", async () => {
    expect((await client.head()).freshness).toEqual({ kind: "ok", blocks: 0 });
    fixture.state.behind = 5;
    expect((await client.head()).freshness).toEqual({ kind: "ok", blocks: 5 });
    fixture.state.behind = 6;
    const late = await client.head();
    expect(late.behind).toBe(6);
    expect(late.freshness).toEqual({ kind: "behind", blocks: 6 });
    const strict = new IndexerClient({ url: "http://x", fetch: fixture.fetch as typeof fetch, maxLag: 10 });
    expect((await strict.head()).freshness.kind).toBe("ok");
  });

  test.each(["loading", "rewinding", "halted"] as const)("a 503 %s is unavailable with its status", async (status) => {
    fixture.state.status = status;
    const error = await client.head().catch((e) => e);
    expect(error).toBeInstanceOf(IndexerError);
    expect(error).toMatchObject({ kind: "unavailable", status });
    expect(error.detail.reason).toBeTruthy();
    expect(error.detail.httpStatus).toBe(503);
  });

  test("as built, /v1/head answers 503 when the state is not ok: unavailable with its status, the head in the body unread", async () => {
    const body = { version: 1, status: "rewinding", reason: "reorg", head: FIXTURE_HEAD };
    fixture.state.rawBody = { text: JSON.stringify(body), httpStatus: 503 };
    expect(await client.head().catch((e) => e)).toMatchObject({ kind: "unavailable", status: "rewinding", detail: { reason: "reorg", httpStatus: 503 } });
    fixture.state.rawBody = { text: JSON.stringify({ ...body, status: "loading", head: null }), httpStatus: 503 };
    expect(await client.head().catch((e) => e)).toMatchObject({ kind: "unavailable", status: "loading" });
  });

  test("a wrong version is its own error, whatever the status", async () => {
    fixture.state.version = 2;
    const error = await client.leaderboard(FIXTURE_TOURNAMENT).catch((e) => e);
    expect(error).toMatchObject({ kind: "wrong-version", detail: { version: 2 } });
    fixture.state.version = 2;
    fixture.state.status = "halted";
    expect(await kindOf(client.head())).toBe("wrong-version");
  });

  test("a failure that is not an envelope is judged by its HTTP status, not as a wrong version", async () => {
    const raw = (text: string, httpStatus: number) => (fixture.state.rawBody = { text, httpStatus });
    raw('{"message":"Bad Gateway"}', 502);
    expect(await kindOf(client.head())).toBe("unreachable");
    raw('{"error":"no such path"}', 404);
    expect(await kindOf(client.head())).toBe("not-found");
    raw('{"error":"forbidden"}', 403);
    expect(await kindOf(client.head())).toBe("rejected");
    raw('{"message":"Service Unavailable"}', 503);
    expect(await kindOf(client.head())).toBe("unreachable");
    raw('{"version":2,"status":"error","error":"x"}', 404);
    expect(await kindOf(client.head())).toBe("wrong-version");
  });

  test("a missing key is refused, null is an answer", async () => {
    const ok = { version: 1, status: "ok", head: FIXTURE_HEAD, behind: 0 };
    const board = { tournament_id: 1, start_time: 0, end_time: 0, total: 0, entries: [] };
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, ...board }), httpStatus: 200 };
    expect(await kindOf(client.leaderboard(1))).toBe("bad-response"); // next_offset missing: paging must not just stop
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, ...board, next_offset: null }), httpStatus: 200 };
    expect(await kindOf(client.leaderboard(1))).toBe("none");
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, games: [] }), httpStatus: 200 };
    expect(await kindOf(client.playerGames(FIXTURE_ADA))).toBe("bad-response"); // next missing
    fixture.state.rawBody = { text: JSON.stringify(ok), httpStatus: 200 };
    expect(await kindOf(client.playerTournament(FIXTURE_ADA, 1))).toBe("bad-response"); // entry missing
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, player: { player_id: FIXTURE_ADA, name: "A" }, stats: null }), httpStatus: 200 };
    expect(await kindOf(client.player(FIXTURE_ADA))).toBe("bad-response"); // created missing
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, player: null }), httpStatus: 200 };
    expect((await client.player(FIXTURE_ADA)).data).toEqual({ player: null, stats: null });
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, tournaments: [] }), httpStatus: 200 };
    expect(await kindOf(client.tournaments())).toBe("bad-response"); // next missing
  });

  test("a missing version is a wrong version", async () => {
    fixture.state.rawBody = { text: JSON.stringify({ status: "ok", head: FIXTURE_HEAD, behind: 0 }), httpStatus: 200 };
    expect(await kindOf(client.head())).toBe("wrong-version");
  });

  test("malformed answers are bad-response", async () => {
    const body = (b: object, httpStatus = 200) => (fixture.state.rawBody = { text: JSON.stringify(b), httpStatus });
    body({ version: 1, status: "ok", behind: 0 });
    expect(await kindOf(client.head())).toBe("bad-response");
    body({ version: 1, status: "ok", head: FIXTURE_HEAD, behind: -1 });
    expect(await kindOf(client.head())).toBe("bad-response");
    body({ version: 1, status: "ok", head: FIXTURE_HEAD, behind: "0" });
    expect(await kindOf(client.head())).toBe("bad-response");
    body({ version: 1, status: "weird", head: FIXTURE_HEAD, behind: 0 });
    expect(await kindOf(client.head())).toBe("bad-response");
    body({ version: 1, status: "ok", head: FIXTURE_HEAD, behind: 0, tournament_id: 1, start_time: 0, end_time: 0, total: 0, entries: [{ rank: 1 }], next_offset: null });
    expect(await kindOf(client.leaderboard(1))).toBe("bad-response");
    body({ version: 1, status: "ok", head: FIXTURE_HEAD, behind: 0, tournament_id: 1, start_time: 0, end_time: 0, total: 0, entries: [], next_offset: null });
    expect((await client.leaderboard(1)).data.entries).toEqual([]);
    fixture.state.rawBody = { text: "<html>ok</html>", httpStatus: 200 };
    expect(await kindOf(client.head())).toBe("bad-response");
    fixture.state.rawBody = { text: "[]", httpStatus: 200 };
    expect(await kindOf(client.head())).toBe("bad-response");
  });

  test("games_finished is required for one tournament and absent from the list", async () => {
    const ok = { version: 1, status: "ok", head: FIXTURE_HEAD, behind: 0 };
    const row = { id: 1, start_time: 1, end_time: 2, games_spawned: 3, players: 2, best_score: 9 };
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, tournament: row }), httpStatus: 200 };
    expect(await kindOf(client.tournament(1))).toBe("bad-response");
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, tournament: { ...row, games_finished: 2 } }), httpStatus: 200 };
    expect((await client.tournament(1)).data.gamesFinished).toBe(2);
    fixture.state.rawBody = { text: JSON.stringify({ ...ok, tournaments: [row], next: null }), httpStatus: 200 };
    const list = (await client.tournaments()).data.tournaments[0];
    expect(list).toEqual({ id: 1, startTime: 1, endTime: 2, gamesSpawned: 3, players: 2, bestScore: 9 });
    expect("gamesFinished" in list).toBe(false);
  });

  test("a prize slot outside 1 to 3 is bad-response", async () => {
    fixture.entries.set(1, [{ ...fixture.entries.get(FIXTURE_TOURNAMENT)![0], prize_ranks: [4] }]);
    expect(await kindOf(client.leaderboard(1))).toBe("bad-response");
  });
});

describe("errors", () => {
  test("a down indexer is unreachable", async () => {
    fixture.state.down = true;
    const error = await client.head().catch((e) => e);
    expect(error).toMatchObject({ kind: "unreachable" });
    expect(error.message).toContain("fetch failed");
  });

  test("a gateway error page is unreachable, a 5xx envelope too", async () => {
    fixture.state.rawBody = { text: "<html>Bad gateway</html>", httpStatus: 502 };
    expect(await kindOf(client.head())).toBe("unreachable");
    fixture.state.rawBody = { text: JSON.stringify({ version: 1, status: "error", error: "boom" }), httpStatus: 500 };
    expect(await kindOf(client.head())).toBe("unreachable");
  });

  test("a hung request times out as unreachable", async () => {
    const hung = (async (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    const slow = new IndexerClient({ url: "http://x", fetch: hung, timeoutMs: 10 });
    expect(await kindOf(slow.head())).toBe("unreachable");
  });

  test("an unknown route is not-found, a refused parameter is rejected", async () => {
    const raw = client;
    expect(await kindOf(raw.tournaments({ limit: 0 }))).toBe("rejected");
    expect(await kindOf(raw.tournaments({ limit: 101 }))).toBe("rejected");
    expect(await kindOf(raw.leaderboard(1, { offset: -1 }))).toBe("rejected");
    fixture.state.rawBody = { text: JSON.stringify({ version: 1, status: "error", error: "unknown route", state: "ok" }), httpStatus: 404 };
    expect(await kindOf(raw.head())).toBe("not-found");
    expect(fixture.requests[0]).toBe("/v1/tournaments?limit=0");
  });

  test("ids are checked before anything is sent", async () => {
    expect(await kindOf(client.player("nope"))).toBe("rejected");
    expect(await kindOf(client.tournament(-1))).toBe("rejected");
    expect(await kindOf(client.tournament(2 ** 53))).toBe("rejected");
    expect(await kindOf(client.tournament(MAX_TOURNAMENT_ID + 1))).toBe("rejected");
    expect(await kindOf(client.leaderboard(BigInt(MAX_TOURNAMENT_ID) + 1n))).toBe("rejected");
    expect(await kindOf(client.tournaments({ before: MAX_TOURNAMENT_ID + 1 }))).toBe("rejected");
    expect(await kindOf(client.game("daily", -2))).toBe("rejected");
    expect(fixture.requests).toEqual([]);
  });
});

describe("construction", () => {
  test("no URL, no client", () => {
    expect(createIndexerClient(undefined)).toBeNull();
    expect(createIndexerClient("  ")).toBeNull();
    expect(createIndexerClient(" http://i.test/ ", { fetch: fixture.fetch as typeof fetch })).toBeInstanceOf(IndexerClient);
  });

  test("the largest tournament id is sent", async () => {
    fixture.state.rawBody = { text: JSON.stringify({ version: 1, status: "ok", head: FIXTURE_HEAD, behind: 0, tournament: { id: MAX_TOURNAMENT_ID, start_time: 1, end_time: 2, games_spawned: 0, games_finished: 0, players: 0, best_score: 0 } }), httpStatus: 200 };
    expect((await client.tournament(BigInt(MAX_TOURNAMENT_ID))).data.id).toBe(MAX_TOURNAMENT_ID);
    expect(fixture.requests[0]).toBe(`/v1/tournaments/${MAX_TOURNAMENT_ID}`);
  });

  test("player ids are zero-padded lowercase", () => {
    expect(indexerPlayerId("0xABC")).toBe(`0x${"abc".padStart(64, "0")}`);
    expect(indexerPlayerId(FIXTURE_ADA)).toBe(FIXTURE_ADA);
    expect(() => indexerPlayerId(`0x${"f".repeat(64)}`)).toThrow(IndexerError);
  });
});
