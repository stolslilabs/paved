// The client against the real indexer (packages/indexer) started in this process: its own fake node feeds an
// in-memory store, its own HTTP server answers on a free local port, and `IndexerClient` reads every route over
// real HTTP. No chain, no browser. Needs Node 24 (the indexer runs on `node:sqlite`).
import type { AddressInfo } from "node:net";
import { hash } from "starknet";
import { afterEach, describe, expect, test } from "vitest";
import { IndexerClient, MAX_TOURNAMENT_ID, indexerPlayerId } from "../src/indexer";
import type { IndexerError } from "../src/indexer";
import { Chain } from "../../indexer/src/chain.ts";
import { CrossCheck } from "../../indexer/src/crosscheck.ts";
import { canonical, padded } from "../../indexer/src/events.ts";
import { Queries } from "../../indexer/src/queries.ts";
import { serve } from "../../indexer/src/server.ts";
import { ACCOUNT, DAILY, ECONOMY, FakeNode, TUTORIAL, ev } from "../../indexer/src/testing/fake-node.ts";
import { indexerOf, settle } from "../../indexer/src/testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const DAY = 100;
const ORIGIN = "http://localhost:5173";

type Indexer = ReturnType<typeof indexerOf>;
let servers: ReturnType<typeof serve>[] = [];
afterEach(() => {
  for (const s of servers) {
    s.close();
    s.closeAllConnections();
  }
  servers = [];
});

async function start(): Promise<{ client: IndexerClient; indexer: Indexer; url: string }> {
  const node = new FakeNode();
  node.mine([ev.created(A, 0x416461)], [ev.created(B, 0x426f)]); // "Ada", "Bo"
  node.mine([ev.spawned("daily", 1, A, { tournament: DAY })], [ev.spawned("daily", 2, B, { tournament: DAY })], [ev.spawned("tutorial", 1, A)]);
  node.mine([ev.over("daily", 1, A, 50, { tournament: DAY, end: 77 })]);
  node.mine([ev.over("daily", 2, B, 40, { tournament: DAY, end: 78 })]);
  node.mine([ev.spawned("daily", 3, A, { tournament: DAY })]); // still running: null score, day and end time
  return serveNode(node);
}

const T0 = DAY * 86400;

/**
 * A node with the accepted P7 definitions (some of them: quests 1, 2 and 4, achievements 2, 3 and 9) from the day `DAY` on, and
 * three Daily games of Ada's that day (1,200 and 1,500 points, then one that runs). Bo is known and has no progress.
 */
async function startQuests() {
  const node = new FakeNode();
  node.time = T0 + 100;
  node.mine([ev.created(A, 0x416461)], [ev.created(B, 0x426f)]); // "Ada", "Bo"
  node.mine(
    [ev.questDefined(1, { start: T0, tasks: [[1, 1]] })],
    [ev.questDefined(2, { start: T0, tasks: [[2, 6]] })],
    [ev.questDefined(4, { start: T0, tasks: [[3, 3000]] })],
    [ev.achievementDefined(2, { tasks: [[1, 1]], points: 10 })],
    [ev.achievementDefined(3, { tasks: [[1, 10]], points: 20 })],
    [ev.achievementDefined(9, { tasks: [[8, 1]], points: 50 })],
  );
  node.mine([ev.spawned("daily", 1, A, { tournament: DAY })], [ev.spawned("daily", 2, A, { tournament: DAY })], [ev.spawned("daily", 3, A, { tournament: DAY })]);
  node.mine([ev.over("daily", 1, A, 1200, { tournament: DAY, end: T0 + 200 }), ev.questProgressed(A, 1, 1), ev.questProgressed(A, 3, 1200), ev.achievementProgressed("daily", A, 1, 1)]);
  node.mine([ev.over("daily", 2, A, 1500, { tournament: DAY, end: T0 + 300 }), ev.questProgressed(A, 1, 1), ev.questProgressed(A, 3, 1500), ev.achievementProgressed("daily", A, 1, 1)]);
  node.mine([ev.questRetired(2)]);
  return { node, ...(await serveNode(node)) };
}

async function serveNode(node: FakeNode): Promise<{ client: IndexerClient; indexer: Indexer; url: string }> {
  const indexer = indexerOf(node);
  await settle(indexer);
  const server = serve(indexer, { allowedOrigins: [ORIGIN] });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { client: new IndexerClient({ url }), indexer, url };
}

const ADA = indexerPlayerId(A);
const BO = indexerPlayerId(B);
const kindOf = (p: Promise<unknown>) => p.then(() => "none", (e: IndexerError) => e.kind);

describe("IndexerClient against the real indexer", () => {
  test("/v1/head: the as-built fields are read, the rest ignored", async () => {
    const { client } = await start();
    const { data, head, behind, freshness } = await client.head();
    expect(data).toMatchObject({ state: "ok", chainId: "0x534e5f5345504f4c4941", fromBlock: 1, lastMismatch: null, tournamentsChecked: 0 });
    expect(data.contracts).toMatchObject({ daily: "0x1111", tutorial: "0x2222", account: "0x3333", economy: "0x4444" });
    expect(head.number).toBeGreaterThan(0);
    expect(behind).toBe(0);
    expect(freshness).toEqual({ kind: "ok", blocks: 0 });
  });

  test("E3's appended economy fields are read: game, player stats and the day's economy", async () => {
    const node = new FakeNode();
    node.mine([ev.created(A, 0x41)]);
    node.mine([ev.spawned("daily", 1, A, { tournament: DAY }), ev.purchased(1, A, { day: DAY })]);
    node.mine([ev.over("daily", 1, A, 1200, { tournament: DAY, end: T0 + 200 }), ev.recorded(1, 1200)]);
    const { client } = await serveNode(node);

    const { data: games } = await client.playerGames(ADA);
    expect(games.games[0].economy).toEqual({
      day: DAY,
      stake: 1,
      price: "2000000",
      referrer: null,
      referral: "0",
      burned: (107n * 10n ** 18n).toString(),
      factor: 10_000,
      reference: (107n * 10n ** 18n).toString(),
      purchasedAt: expect.any(Number),
      recorded: true,
      expired: false,
      settled: false,
      threshold: null,
      reward: null,
    });
    const { data: profile } = await client.player(ADA);
    expect(profile.stats).toMatchObject({ paidGames: 1, settledGames: 0, rewards: "0" });
    const { data: day } = await client.tournament(DAY);
    expect(day.economy).toMatchObject({ gamesPurchased: 1, gamesRecorded: 1, gamesSettled: 0, unsettled: [1], rewards: "0", closed: false, mean: null });
  });

  test("an indexer without the E3 fields is still read; a malformed economy is a bad response", async () => {
    const answer = (body: unknown) => new IndexerClient({ url: "http://x", fetch: (async () => Response.json(body)) as unknown as typeof fetch });
    const envelope = { version: 1, status: "ok", behind: 0, head: { number: 1, hash: "0x1", timestamp: 1 } };
    const row = { contract: "daily", game_id: 1, mode: 1, start_time: 1, tournament_id: 1, over: false, score: null, counted_tournament_id: null, end_time: null };
    const old = await kindOf(answer({ ...envelope, games: [row], next: null }).playerGames(ADA));
    expect(old).not.toBe("bad-response");
    expect(await kindOf(answer({ ...envelope, games: [{ ...row, economy: { day: 1 } }], next: null }).playerGames(ADA))).toBe("bad-response");
  });

  test("/v1/head: a real cross-check mismatch is read as a typed object", async () => {
    // Day 100 closes; the `tournament` view ranks B above A, the events say the opposite.
    const node = new FakeNode();
    node.mine([ev.created(A, 0x41)], [ev.created(B, 0x42)]);
    node.mine([ev.spawned("daily", 1, A, { tournament: DAY })], [ev.spawned("daily", 2, B, { tournament: DAY })]);
    node.mine([ev.over("daily", 1, A, 50, { tournament: DAY })]);
    node.mine([ev.over("daily", 2, B, 40, { tournament: DAY })]);
    const slots = [[B, 40], [A, 50], [0n, 0]] as const;
    node.views = (_address, selector) => {
      expect(selector).toBe(canonical(hash.getSelectorFromName("tournament")));
      return ["0x64", "0x0", "0x0", "0x1", "0x0", "0x0", ...slots.flatMap(([p, score]) => [`0x${p.toString(16)}`, `0x${score.toString(16)}`, "0x0"])];
    };
    node.time = (DAY + 1) * 86400 + 5;
    node.mine();
    const indexer = indexerOf(node);
    await settle(indexer);
    const checks = new CrossCheck(new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT, economy: ECONOMY }), new Queries(indexer.store));
    await checks.run(indexer.served!);
    const server = serve(indexer, { info: { chainId: "0x1", fromBlock: 1, contracts: { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT, economy: ECONOMY }, checks } });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = new IndexerClient({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    const { data } = await client.head();
    expect(data.tournamentsChecked).toBe(1);
    expect(data.lastMismatch).toEqual({
      tournamentId: DAY,
      headNumber: indexer.served!.number,
      view: [{ playerId: padded(B), score: 40 }, { playerId: padded(A), score: 50 }, { playerId: padded(0n), score: 0 }],
      indexed: [{ playerId: padded(A), score: 50 }, { playerId: padded(B), score: 40 }, { playerId: padded(0n), score: 0 }],
    });
  });

  test("/v1/tournaments, /v1/tournaments/{id}: the day, and zeros for a day with no game", async () => {
    const { client } = await start();
    const list = await client.tournaments({ limit: 5 });
    expect(list.data.tournaments).toEqual([{ id: DAY, startTime: DAY * 86400, endTime: (DAY + 1) * 86400, gamesSpawned: 3, players: 2, bestScore: 50 }]);
    expect(list.data.next).toBeNull();
    expect((await client.tournament(DAY)).data).toMatchObject({ id: DAY, gamesSpawned: 3, gamesFinished: 2, players: 2, bestScore: 50 });
    expect((await client.tournament(7n)).data).toMatchObject({ gamesSpawned: 0, players: 0, bestScore: 0 });
    expect((await client.tournament(10_000_000_000)).data).toMatchObject({ id: 10_000_000_000, startTime: 10_000_000_000 * 86400, players: 0 });
    // The bound reads with exact times; one above it is refused before any request (P-19).
    expect((await client.tournament(MAX_TOURNAMENT_ID)).data).toMatchObject({ id: MAX_TOURNAMENT_ID, startTime: MAX_TOURNAMENT_ID * 86400, players: 0 });
    expect(await kindOf(client.tournament(MAX_TOURNAMENT_ID + 1))).toBe("rejected");
  });

  test("/v1/tournaments/{id}/leaderboard: rows, prize slots and paging", async () => {
    const { client } = await start();
    const first = await client.leaderboard(DAY, { limit: 1 });
    expect(first.data).toMatchObject({ tournamentId: DAY, total: 2, nextOffset: 1 });
    expect(first.data.entries[0]).toEqual({ rank: 1, playerId: ADA, name: "Ada", bestScore: 50, bestGameId: 1, gamesPlayed: 2, gamesFinished: 1, finishedAt: 77, prizeRanks: [1] });
    const second = await client.leaderboard(DAY, { limit: 1, offset: first.data.nextOffset! });
    expect(second.data.entries[0]).toMatchObject({ rank: 2, playerId: BO, name: "Bo", bestScore: 40 });
    expect(second.data.nextOffset).toBeNull();
    expect((await client.leaderboard(7)).data).toMatchObject({ total: 0, entries: [], nextOffset: null });
  });

  test("/v1/players/{id}: a known player, an unknown one", async () => {
    const { client } = await start();
    const known = await client.player(ADA);
    expect(known.data.player).toMatchObject({ playerId: ADA, name: "Ada" });
    expect(known.data.stats).toEqual({ dailyGames: 2, dailyFinished: 1, bestScore: 50, tutorialGames: 1, paidGames: 0, settledGames: 0, rewards: "0" });
    expect(await client.player(0xeen)).toMatchObject({ data: { player: null, stats: null } });
  });

  test("/v1/players/{id}/games: a running game reads as in progress, paging and the contract filter", async () => {
    const { client } = await start();
    const all = await client.playerGames(ADA);
    expect(all.data.games.map((g) => `${g.contract}:${g.gameId}`).sort()).toEqual(["daily:1", "daily:3", "tutorial:1"]);
    const running = all.data.games.find((g) => g.contract === "daily" && g.gameId === 3)!;
    expect(running).toMatchObject({ over: false, score: 0, countedTournamentId: 0, endTime: 0, tournamentId: DAY });
    expect(all.data.games.find((g) => g.gameId === 1 && g.contract === "daily")).toMatchObject({ over: true, score: 50, countedTournamentId: DAY, endTime: 77 });
    const page = await client.playerGames(ADA, { limit: 1 });
    expect(page.data.games).toHaveLength(1);
    expect(page.data.next).toMatch(/^\d+:(daily|tutorial):\d+$/);
    const rest = await client.playerGames(ADA, { before: page.data.next! });
    expect(rest.data.games).toHaveLength(2);
    expect((await client.playerGames(ADA, { contract: "tutorial" })).data.games).toHaveLength(1);
    expect((await client.playerGames(BO)).data.games.map((g) => g.gameId)).toEqual([2]);
  });

  test("/v1/players/{id}/tournaments/{id}: the row of that day, or null", async () => {
    const { client } = await start();
    expect((await client.playerTournament(ADA, DAY)).data).toMatchObject({ rank: 1, playerId: ADA, prizeRanks: [1] });
    expect((await client.playerTournament(ADA, 99)).data).toBeNull();
  });

  test("/v1/games/{contract}/{id}: one game, not-found for another", async () => {
    const { client } = await start();
    expect((await client.game("tutorial", 1)).data).toMatchObject({ contract: "tutorial", gameId: 1, over: false });
    expect((await client.game("daily", 2)).data).toMatchObject({ over: true, score: 40 });
    expect(await kindOf(client.game("daily", 99))).toBe("not-found");
  });

  test("a request the indexer refuses is rejected, a wrong route is not-found", async () => {
    const { client, url } = await start();
    expect(await kindOf(client.tournaments({ limit: 101 }))).toBe("rejected");
    const raw = new IndexerClient({ url });
    expect(await kindOf(raw.leaderboard(DAY, { offset: -1 }))).toBe("rejected");
    expect(await kindOf(new IndexerClient({ url: `${url}/nope` }).head())).toBe("not-found");
  });

  test("a halted indexer: every route is unavailable with its status, /v1/head too", async () => {
    const { client, indexer } = await start();
    indexer.halt("an unknown event");
    const error = (await client.head().catch((e) => e)) as IndexerError;
    expect(error).toMatchObject({ kind: "unavailable", status: "halted" });
    expect(error.detail).toMatchObject({ reason: "an unknown event", httpStatus: 503 });
    expect(await kindOf(client.leaderboard(DAY))).toBe("unavailable");
    expect(await kindOf(client.player(ADA))).toBe("unavailable");
  });

  test("/v1/definitions: the defined quests and achievements, a retired quest flagged with its time", async () => {
    const { client } = await startQuests();
    const { data } = await client.definitions();
    expect(data.quests.map((q) => [q.questId, q.retired])).toEqual([[1, false], [2, true], [4, false]]);
    expect(data.quests[2]).toMatchObject({ questId: 4, startTime: T0, endTime: 0, duration: 86400, interval: 86400, tasks: [{ taskId: 3, total: 3000 }], conditions: [], retiredAt: null });
    expect(data.quests[1].retiredAt).toBeGreaterThan(T0);
    expect(data.achievements.map((a) => [a.achievementId, a.points, a.tasks])).toEqual([
      [2, 10, [{ taskId: 1, total: 1 }]],
      [3, 20, [{ taskId: 1, total: 10 }]],
      [9, 50, [{ taskId: 8, total: 1 }]],
    ]);
  });

  test("/v1/definitions: nothing defined yet is two empty lists", async () => {
    const { client } = await start();
    expect((await client.definitions()).data).toEqual({ quests: [], achievements: [] });
  });

  test("/v1/players/{id}/quests: a player with progress (1,200 + 1,500 of 3,000 points, one game finished twice)", async () => {
    const { client } = await startQuests();
    const { data } = await client.playerQuests(ADA, { day: DAY });
    expect(data).toMatchObject({ playerId: ADA, day: DAY, startTime: T0, endTime: T0 + 86400 });
    const byId = new Map(data.quests.map((q) => [q.questId, q]));
    expect(byId.get(1)).toMatchObject({ intervalId: 0, completed: true, retired: false, tasks: [{ taskId: 1, total: 1, count: 1 }] }); // saturated at the target; the interval counts from the quest's own start, so day 100 is its interval 0
    expect(byId.get(1)!.completedAt).toBeGreaterThan(T0);
    expect(byId.get(4)).toMatchObject({ completed: false, completedAt: null, tasks: [{ taskId: 3, total: 3000, count: 2700 }] });
    // Retired after the reports: what counted stays, it is listed for the day it was live, and flagged.
    expect(byId.get(2)).toMatchObject({ retired: true, completed: false, tasks: [{ taskId: 2, total: 6, count: 0 }] });
  });

  test("/v1/players/{id}/quests: a known player with none, and an unknown player, have zero counts", async () => {
    const { client } = await startQuests();
    for (const id of [BO, indexerPlayerId(0xdeadn)]) {
      const { data } = await client.playerQuests(id, { day: DAY });
      expect(data.quests.map((q) => q.questId)).toEqual([1, 2, 4]);
      expect(data.quests.every((q) => !q.completed && q.completedAt === null && q.tasks.every((t) => t.count === 0))).toBe(true);
    }
  });

  test("/v1/players/{id}/quests: a day with no quest is an empty list, another day has no progress, no day is the served block's", async () => {
    const { client } = await startQuests();
    expect((await client.playerQuests(ADA, { day: DAY - 1 })).data).toMatchObject({ day: DAY - 1, quests: [] });
    const next = (await client.playerQuests(ADA, { day: DAY + 1 })).data;
    expect(next.quests.map((q) => [q.questId, q.intervalId, q.completed])).toEqual([[1, 1, false], [4, 1, false]]); // quest 2 retired before the day began
    expect((await client.playerQuests(ADA)).data.day).toBe(DAY); // the served block is on day 100
    expect(await kindOf(client.playerQuests(ADA, { day: MAX_TOURNAMENT_ID + 1 }))).toBe("rejected");
    expect((await client.playerQuests(ADA, { day: MAX_TOURNAMENT_ID })).data.quests).toHaveLength(2);
  });

  test("/v1/players/{id}/achievements: points of the completed ones, progress on the others", async () => {
    const { client } = await startQuests();
    const { data } = await client.playerAchievements(ADA);
    expect(data.playerId).toBe(ADA);
    expect(data.points).toBe(10);
    expect(data.achievements.map((a) => [a.achievementId, a.completed, a.tasks[0].count, a.points])).toEqual([[2, true, 1, 10], [3, false, 2, 20], [9, false, 0, 50]]);
    expect(data.achievements[0].completedAt).toBeGreaterThan(T0);
    expect(data.achievements[1]).toMatchObject({ completedAt: null, retired: false });
  });

  test("/v1/players/{id}/achievements: no progress is zero points, and so is an unknown player", async () => {
    const { client } = await startQuests();
    for (const id of [BO, indexerPlayerId(0xdeadn)]) {
      const { data } = await client.playerAchievements(id);
      expect(data.points).toBe(0);
      expect(data.achievements.map((a) => a.achievementId)).toEqual([2, 3, 9]);
      expect(data.achievements.every((a) => !a.completed && a.tasks[0].count === 0)).toBe(true);
    }
  });

  test("the new routes under a halted indexer, and a refused day, are typed", async () => {
    const { client, indexer, url } = await startQuests();
    expect(await kindOf(new IndexerClient({ url }).playerQuests(ADA, { day: -1 }))).toBe("rejected");
    indexer.halt("an unknown event");
    expect(await kindOf(client.definitions())).toBe("unavailable");
    expect(await kindOf(client.playerQuests(ADA, { day: DAY }))).toBe("unavailable");
    expect(await kindOf(client.playerAchievements(ADA))).toBe("unavailable");
  });

  test("CORS: the allowed origin is echoed, another is not", async () => {
    const { url } = await start();
    const allowed = await fetch(`${url}/v1/head`, { headers: { origin: ORIGIN } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const other = await fetch(`${url}/v1/head`, { headers: { origin: "http://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("the padded id the client writes is the one the indexer serves", () => {
    expect(ADA).toBe(padded(A));
  });
});
