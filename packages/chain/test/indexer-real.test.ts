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
import { ACCOUNT, DAILY, FakeNode, TUTORIAL, ev } from "../../indexer/src/testing/fake-node.ts";
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
    expect(data.contracts).toEqual({ daily: "0x1111", tutorial: "0x2222", account: "0x3333" });
    expect(head.number).toBeGreaterThan(0);
    expect(behind).toBe(0);
    expect(freshness).toEqual({ kind: "ok", blocks: 0 });
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
    const checks = new CrossCheck(new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }), new Queries(indexer.store));
    await checks.run(indexer.served!);
    const server = serve(indexer, { info: { chainId: "0x1", fromBlock: 1, contracts: { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }, checks } });
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
    expect(known.data.stats).toEqual({ dailyGames: 2, dailyFinished: 1, bestScore: 50, tutorialGames: 1 });
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
