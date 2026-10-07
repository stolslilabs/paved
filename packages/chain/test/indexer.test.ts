import { beforeEach, describe, expect, test } from "vitest";
import { FIXTURE_ADA, FIXTURE_BO, FIXTURE_HEAD, FIXTURE_NAMELESS, FIXTURE_TOURNAMENT, FixtureIndexer } from "../src/indexer-fixture";
import { IndexerClient, IndexerError, createIndexerClient, indexerPlayerId } from "../src/indexer";

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
    expect(data).toMatchObject({ state: "ok", fromBlock: 12, lastMismatch: null });
    expect(data.contracts.daily).toBe("0x2");
    expect(fixture.requests).toEqual(["/v1/head"]);
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
  });

  test("a wrong version is its own error, whatever the status", async () => {
    fixture.state.version = 2;
    const error = await client.leaderboard(FIXTURE_TOURNAMENT).catch((e) => e);
    expect(error).toMatchObject({ kind: "wrong-version", detail: { version: 2 } });
    fixture.state.version = 2;
    fixture.state.status = "halted";
    expect(await kindOf(client.head())).toBe("wrong-version");
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

  test("player ids are zero-padded lowercase", () => {
    expect(indexerPlayerId("0xABC")).toBe(`0x${"abc".padStart(64, "0")}`);
    expect(indexerPlayerId(FIXTURE_ADA)).toBe(FIXTURE_ADA);
    expect(() => indexerPlayerId(`0x${"f".repeat(64)}`)).toThrow(IndexerError);
  });
});
