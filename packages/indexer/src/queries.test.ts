import { describe, expect, test } from "vitest";
import { padded } from "./events.ts";
import { UNSETTLED_PAGE } from "./api.ts";
import { Queries } from "./queries.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const C = 0xc3n;
const D = 0xd4n;
const id = (player: bigint) => padded(player);
const DAY = 100;

async function open(build: (node: FakeNode) => void) {
  const node = new FakeNode();
  build(node);
  const indexer = indexerOf(node);
  await settle(indexer);
  expect(indexer.status).toBe("ok");
  return { node, queries: new Queries(indexer.store), head: node.tip, indexer };
}

/**
 * The block that registered the four players before D-25 (E), kept empty so that the blocks of the scenarios keep their
 * numbers: a player is now the address, from its first event.
 */
const players = (node: FakeNode) =>
  node.mine([], [], [], []);

describe("the leaderboard", () => {
  const scenario = (node: FakeNode) => {
    players(node);
    node.mine(
      [ev.spawned("challenge", 1, A, { day: DAY })],
      [ev.spawned("challenge", 2, A, { day: DAY })],
      [ev.spawned("challenge", 3, A, { day: DAY })],
      [ev.spawned("challenge", 4, B, { day: DAY })],
      [ev.spawned("challenge", 5, C, { day: DAY })],
      [ev.spawned("challenge", 6, D, { day: DAY })],
    );
    node.mine([ev.over("challenge", 1, A, 50, { day: DAY, end: 11 })]);
    node.mine([ev.over("challenge", 4, B, 70, { day: DAY, end: 12 })]);
    node.mine([ev.over("challenge", 5, C, 70, { day: DAY, end: 13 })]);
    // Two games of A in one block: the earlier transaction first.
    node.mine([ev.over("challenge", 2, A, 70, { day: DAY, end: 14 })], [ev.over("challenge", 3, A, 20, { day: DAY, end: 14 })]);
  };

  test("one row per player, best game, ties by the chain order of the GameOver", async () => {
    const { queries, head } = await open(scenario);
    const { total, entries } = queries.leaderboard(head, DAY, 20, 0);
    expect(total).toBe(3);
    expect(entries.map((e) => [e.rank, e.player_id, e.best_score, e.best_game_id])).toEqual([
      [1, id(B), 70, 4],
      [2, id(C), 70, 5],
      [3, id(A), 70, 2],
    ]);
    expect(entries[2]).toMatchObject({ games_played: 3, games_finished: 3, finished_at: 14 });
    // No name since D-25 (E): the client resolves the address off-chain.
    for (const entry of entries) expect(entry).not.toHaveProperty("name");
  });

  test("games_played counts entries (a running game too), games_finished the ones that counted", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.tournament(head, DAY)).toMatchObject({
      id: DAY,
      start_time: DAY * 86400,
      end_time: (DAY + 1) * 86400,
      games_spawned: 6,
      games_finished: 5,
      players: 3,
      best_score: 70,
    });
    // D spawned and never finished: no row, but the entry shows in games_spawned.
    expect(queries.entry(head, DAY, id(D))).toBeNull();
  });

  test("the best game of equal scores is the earliest by chain order, not the lowest id", async () => {
    const { queries, head } = await open((node) => {
      players(node);
      node.mine([ev.spawned("challenge", 1, A, { day: DAY })], [ev.spawned("challenge", 2, A, { day: DAY })]);
      node.mine([ev.over("challenge", 2, A, 40, { day: DAY })]);
      node.mine([ev.over("challenge", 1, A, 40, { day: DAY })]);
    });
    expect(queries.leaderboard(head, DAY, 20, 0).entries[0]).toMatchObject({ best_game_id: 2, games_finished: 2 });
  });

  test("a game that ended after its day ranks in no tournament, and shows in its player's list", async () => {
    const { queries, head } = await open((node) => {
      players(node);
      node.mine([ev.spawned("challenge", 1, A, { day: DAY })]);
      node.mine([ev.over("challenge", 1, A, 99, { day: 0, end: 0 })]);
    });
    expect(queries.leaderboard(head, DAY, 20, 0)).toEqual({ total: 0, entries: [] });
    expect(queries.tournament(head, DAY)).toMatchObject({ games_spawned: 1, games_finished: 0, players: 0, best_score: 0 });
    expect(queries.games(head, id(A), undefined, 20, undefined).games[0]).toMatchObject({
      over: true,
      score: 99,
      day_id: DAY,
      counted_day_id: 0,
      end_time: 0,
    });
  });

  test("pagination bounds: offset, limit, an empty day, tournament 0", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.leaderboard(head, DAY, 2, 0).entries.map((e) => e.rank)).toEqual([1, 2]);
    expect(queries.leaderboard(head, DAY, 2, 2).entries.map((e) => e.rank)).toEqual([3]);
    expect(queries.leaderboard(head, DAY, 2, 3).entries).toEqual([]);
    expect(queries.leaderboard(head, DAY + 1, 2, 0)).toEqual({ total: 0, entries: [] });
    expect(queries.tournament(head, DAY + 1)).toMatchObject({ games_spawned: 0, players: 0, best_score: 0 });
    expect(queries.leaderboard(head, 0, 2, 0)).toEqual({ total: 0, entries: [] });
    expect(queries.tournament(head, 0)).toMatchObject({ games_spawned: 0 });
    expect(queries.entry(head, DAY, id(A))).toMatchObject({ rank: 3 });
  });

  test("rows are read at the served block: a later spawn or game over is not seen", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.leaderboard(head, DAY, 20, 0).total).toBe(3);
    // Block numbers: 0 empty, 1 players, 2 spawns, 3 A's first over, 4 B's, 5 C's, 6 the last two.
    expect(queries.leaderboard(3, DAY, 20, 0).entries.map((e) => [e.player_id, e.best_score])).toEqual([[id(A), 50]]);
    expect(queries.leaderboard(5, DAY, 20, 0).entries.map((e) => [e.player_id, e.best_score])).toEqual([
      [id(B), 70],
      [id(C), 70],
      [id(A), 50],
    ]);
    expect(queries.tournament(1, DAY)).toMatchObject({ games_spawned: 0 });
    expect(queries.game(2, "challenge", 1)).toMatchObject({ over: false, score: null, counted_day_id: null, end_time: null });
    expect(queries.game(3, "challenge", 1)).toMatchObject({ over: true, score: 50 });
    expect(queries.game(1, "challenge", 1)).toBeNull();
  });
});

describe("tournaments", () => {
  test("newest first, only days with a game, paged by `before`", async () => {
    const { queries, head } = await open((node) => {
      players(node);
      node.mine(
        [ev.spawned("challenge", 1, A, { day: 98 })],
        [ev.spawned("challenge", 2, B, { day: 99 })],
        [ev.spawned("challenge", 3, A, { day: 100 })],
        [ev.spawned("challenge", 4, B, { day: 100 })],
      );
      node.mine([ev.over("challenge", 3, A, 5, { day: 100 })]);
    });
    const page = queries.tournaments(head, 2, undefined);
    expect(page.tournaments.map((t) => [t.id, t.games_spawned, t.players, t.best_score])).toEqual([
      [100, 2, 1, 5],
      [99, 1, 0, 0],
    ]);
    expect(page.next).toBe(99);
    const rest = queries.tournaments(head, 2, 99);
    expect(rest.tournaments.map((t) => t.id)).toEqual([98]);
    expect(rest.next).toBeNull();
    expect(Object.keys(page.tournaments[0]!).sort()).toEqual(
      ["best_score", "end_time", "games_spawned", "id", "players", "start_time"],
    );
  });
});

describe("players and games", () => {
  const build = (node: FakeNode) => {
    players(node);
    node.mine([ev.spawned("challenge", 1, A, { start: 1000 })], [ev.spawned("challenge", 6, A, { start: 1000 })], [ev.spawned("challenge", 2, A, { start: 2000 })]);
    node.mine([ev.over("challenge", 1, A, 30)]);
    node.mine([ev.spawned("challenge", 7, A, { start: 3000 }), ev.spawned("challenge", 3, B, { start: 3000 })]);
  };

  test("a player's stats, and null for a player the indexer does not know", async () => {
    const { queries, head } = await open(build);
    expect(queries.player(head, id(A))).toEqual({
      player: { player_id: id(A), created: expect.any(Number) },
      stats: {
        challenge_games: 4,
        challenge_finished: 1,
        best_score: 30,
        paid_games: 0,
        settled_games: 0,
        rewards: "0",
      },
      unsettled: [],
      unsettled_count: 0,
    });
    expect(queries.player(head, id(B))!.stats).toEqual({
      challenge_games: 1,
      challenge_finished: 0,
      // No finished game is 0 (the client reads a count): a player known from a spawn that still runs.
      best_score: 0,
      paid_games: 0,
      settled_games: 0,
      rewards: "0",
    });
    expect(queries.player(head, id(0xffffn))).toBeNull();
  });

  test("games list: newest first, then the highest id, filtered by contract, paged by cursor", async () => {
    const { queries, head } = await open(build);
    const all = queries.games(head, id(A), undefined, 20, undefined);
    expect(all.games.map((g) => [g.contract, g.game_id])).toEqual([
      ["challenge", 7],
      ["challenge", 2],
      ["challenge", 6],
      ["challenge", 1],
    ]);
    expect(all.next).toBeNull();
    expect(all.games[3]).toMatchObject({ over: true, score: 30, counted_day_id: 100, mode: 1, player_id: id(A) });
    expect(all.games[1]).toMatchObject({ over: false, score: null, end_time: null });

    const first = queries.games(head, id(A), undefined, 3, undefined);
    expect(first.games.map((g) => g.game_id)).toEqual([7, 2, 6]);
    expect(first.next).toBe("1000:challenge:6");
    const second = queries.games(head, id(A), undefined, 3, { startTime: 1000, contract: "challenge", gameId: 6 });
    expect(second.games.map((g) => [g.contract, g.game_id])).toEqual([["challenge", 1]]);
    expect(second.next).toBeNull();

    expect(queries.games(head, id(A), "challenge", 20, undefined).games.map((g) => g.game_id)).toEqual([7, 2, 6, 1]);
    expect(queries.games(head, id(C), undefined, 20, undefined)).toEqual({ games: [], next: null });
  });

  test("a game by contract and id", async () => {
    const { queries, head } = await open(build);
    expect(queries.game(head, "challenge", 7)).toMatchObject({ contract: "challenge", game_id: 7, mode: 1, day_id: 100 });
    expect(queries.game(head, "challenge", 99)).toBeNull();
  });
});

describe("Economy", () => {
  const BIG = 2n ** 100n; // above 2^53 and 2^63: only a decimal string holds it
  // Day 100: A buys games 1 (stake 1) and 2 (stake 3, referred by B), B buys game 3; game 1 is recorded and settled, game 2
  // recorded late (expired), game 3 never ends. Day 101: A buys game 4, recorded. A game not bought too.
  const build = (node: FakeNode) => {
    players(node);
    node.mine(
      [ev.spawned("challenge", 1, A, { day: DAY }), ev.purchased(1, A, { day: DAY })],
      [ev.spawned("challenge", 2, A, { day: DAY }), ev.purchased(2, A, { day: DAY, stake: 3, referrer: B, referral: 300_000n })],
      [ev.spawned("challenge", 3, B, { day: DAY }), ev.purchased(3, B, { day: DAY, reference: BIG })],
      [ev.spawned("challenge", 5, A, { day: DAY })], // not bought
    );
    node.mine([ev.over("challenge", 1, A, 5000, { day: DAY }), ev.recorded(1, 5000)]);
    node.mine([ev.over("challenge", 2, A, 4000, { day: 0 }), ev.recorded(2, 4000, true)]);
    node.mine([ev.spawned("challenge", 4, A, { day: DAY + 1 }), ev.purchased(4, A, { day: DAY + 1 })]);
    node.mine([ev.over("challenge", 4, A, 100, { day: DAY + 1 }), ev.recorded(4, 100)]);
    node.mine([ev.dayClosed(DAY, { mean: 4_215_689, weight: 4, prior: 3_353_000, emaAfter: 3_400_000 }), ev.settled(1, A, { day: DAY, score: 5000, threshold: 4_215_689, reward: BIG })]);
  };

  test("a game's terms and settlement, null for a game not bought", async () => {
    const { queries, head } = await open(build);
    expect(queries.game(head, "challenge", 1)!.economy).toEqual({
      day: DAY,
      stake: 1,
      price: "2000000",
      referrer: null,
      referral: "0",
      burned: String(107n * 10n ** 18n),
      factor: 10_000,
      reference: String(107n * 10n ** 18n),
      purchased_at: expect.any(Number),
      recorded: true,
      expired: false,
      settled: true,
      threshold: 4_215_689,
      reward: String(BIG),
    });
    expect(queries.game(head, "challenge", 2)!.economy).toMatchObject({
      stake: 3,
      price: "6000000",
      referrer: id(B),
      referral: "300000",
      recorded: true,
      expired: true,
      settled: false,
      threshold: null,
      reward: null,
    });
    expect(queries.game(head, "challenge", 3)!.economy).toMatchObject({ reference: String(BIG), recorded: false, expired: false, settled: false });
    expect(queries.game(head, "challenge", 5)!.economy).toBeNull();
    const games = queries.games(head, id(A), "challenge", 20, undefined).games;
    expect(games.map((g) => [g.game_id, g.economy?.stake ?? null])).toEqual([[5, null], [4, 1], [2, 3], [1, 1]]);
  });

  test("read at the served block: a settlement, a record or a purchase above it has not happened", async () => {
    const { queries, head } = await open(build);
    expect(queries.game(head - 1, "challenge", 1)!.economy).toMatchObject({ settled: false, reward: null, recorded: true });
    expect(queries.game(head - 2, "challenge", 4)!.economy).toMatchObject({ recorded: false });
    expect(queries.game(head - 3, "challenge", 4)).toBeNull();
    expect(queries.dayEconomy(head - 1, DAY)).toMatchObject({ closed: false, mean: null, games_settled: 0, unsettled: [1, 2] });
  });

  test("a player's paid games, rewards and unsettled games", async () => {
    const { queries, head } = await open(build);
    const a = queries.player(head, id(A))!;
    expect(a.stats).toMatchObject({ paid_games: 3, settled_games: 1, rewards: String(BIG) });
    expect(a.unsettled).toEqual([
      { game_id: 2, day: DAY, expired: true },
      { game_id: 4, day: DAY + 1, expired: false },
    ]);
    expect(a.unsettled_count).toBe(2);
    const b = queries.player(head, id(B))!;
    expect(b.stats).toMatchObject({ paid_games: 1, settled_games: 0, rewards: "0" });
    expect(b.unsettled_count).toBe(0);
    expect(b.unsettled).toEqual([]); // game 3 is not recorded: nothing to settle
    expect(queries.player(head - 1, id(A))!.stats).toMatchObject({ settled_games: 0, rewards: "0" });
  });

  test("a day: its paid games, the unsettled ones, its rewards and its close", async () => {
    const { queries, head } = await open(build);
    expect(queries.dayEconomy(head, DAY)).toEqual({
      games_purchased: 3,
      games_recorded: 2,
      games_settled: 1,
      unsettled: [2],
      unsettled_count: 1,
      rewards: String(BIG),
      closed: true,
      mean: 4_215_689,
      weight: 4,
      prior: 3_353_000,
      ema_after: 3_400_000,
      closed_at: expect.any(Number),
    });
    expect(queries.dayEconomy(head, DAY + 1)).toMatchObject({ games_purchased: 1, unsettled: [4], closed: false, ema_after: null, closed_at: null });
    expect(queries.dayEconomy(head, 7)).toEqual({
      games_purchased: 0,
      games_recorded: 0,
      games_settled: 0,
      unsettled: [],
      unsettled_count: 0,
      rewards: "0",
      closed: false,
      mean: null,
      weight: null,
      prior: null,
      ema_after: null,
      closed_at: null,
    });
  });
});

describe("the unsettled list is bounded (UNSETTLED_PAGE)", () => {
  // One player buys `count` games on one day and every one is recorded, none settled.
  const unsettledGames = (count: number) => (node: FakeNode) => {
    players(node);
    for (let first = 1; first <= count; first += 50) {
      const ids = Array.from({ length: Math.min(50, count - first + 1) }, (_, i) => first + i);
      node.mine(
        ...ids.map((game) => [ev.spawned("challenge", game, A, { day: DAY }), ev.purchased(game, A, { day: DAY })]),
      );
      node.mine(...ids.map((game) => [ev.recorded(game, 100)]));
    }
  };

  test.each([
    [0, 0],
    [1, 1],
    [UNSETTLED_PAGE - 1, UNSETTLED_PAGE - 1],
    [UNSETTLED_PAGE, UNSETTLED_PAGE],
    [UNSETTLED_PAGE + 1, UNSETTLED_PAGE],
    [UNSETTLED_PAGE + 30, UNSETTLED_PAGE],
  ])("%i unsettled games: a player and a day list %i, the count is the whole", async (count, listed) => {
    const { queries, head } = await open(unsettledGames(count));
    // With no game, A has no event: not a player (D-25 (E)), and the day lists nothing.
    const player = queries.player(head, id(A)) ?? { unsettled: [], unsettled_count: 0 };
    if (count === 0) expect(queries.player(head, id(A))).toBeNull();
    const oldest = Array.from({ length: listed }, (_, i) => i + 1);
    expect(player.unsettled.map((game) => game.game_id)).toEqual(oldest);
    expect(player.unsettled_count).toBe(count);
    const day = queries.dayEconomy(head, DAY);
    expect(day.unsettled).toEqual(oldest);
    expect(day.unsettled_count).toBe(count);
    expect(day.games_recorded).toBe(count);
  });
});
