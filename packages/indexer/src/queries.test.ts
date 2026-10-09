import { describe, expect, test } from "vitest";
import { padded } from "./events.ts";
import { Queries, replaySlots } from "./queries.ts";
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

const players = (node: FakeNode) =>
  node.mine([ev.created(A, 0x416461)], [ev.created(B, 0x426f)], [ev.created(C, 0xffff)], [ev.created(D, 0x44)]);

describe("the leaderboard", () => {
  const scenario = (node: FakeNode) => {
    players(node);
    node.mine(
      [ev.spawned("daily", 1, A, { tournament: DAY })],
      [ev.spawned("daily", 2, A, { tournament: DAY })],
      [ev.spawned("daily", 3, A, { tournament: DAY })],
      [ev.spawned("daily", 4, B, { tournament: DAY })],
      [ev.spawned("daily", 5, C, { tournament: DAY })],
      [ev.spawned("daily", 6, D, { tournament: DAY })],
    );
    node.mine([ev.over("daily", 1, A, 50, { tournament: DAY, end: 11 })]);
    node.mine([ev.over("daily", 4, B, 70, { tournament: DAY, end: 12 })]);
    node.mine([ev.over("daily", 5, C, 70, { tournament: DAY, end: 13 })]);
    // Two games of A in one block: the earlier transaction first.
    node.mine([ev.over("daily", 2, A, 70, { tournament: DAY, end: 14 })], [ev.over("daily", 3, A, 20, { tournament: DAY, end: 14 })]);
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
    expect(entries[2]).toMatchObject({ name: "Ada", games_played: 3, games_finished: 3, finished_at: 14 });
    expect(entries[1]!.name).toBeNull(); // 0xffff is not UTF-8
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
      node.mine([ev.spawned("daily", 1, A, { tournament: DAY })], [ev.spawned("daily", 2, A, { tournament: DAY })]);
      node.mine([ev.over("daily", 2, A, 40, { tournament: DAY })]);
      node.mine([ev.over("daily", 1, A, 40, { tournament: DAY })]);
    });
    expect(queries.leaderboard(head, DAY, 20, 0).entries[0]).toMatchObject({ best_game_id: 2, games_finished: 2 });
  });

  test("prize ranks are the contract's slots: a player may hold two, the leaderboard has one row", async () => {
    const { queries, head } = await open((node) => {
      players(node);
      node.mine(
        [ev.spawned("daily", 1, A, { tournament: DAY })],
        [ev.spawned("daily", 2, B, { tournament: DAY })],
        [ev.spawned("daily", 3, A, { tournament: DAY })],
      );
      node.mine([ev.over("daily", 1, A, 100, { tournament: DAY })]);
      node.mine([ev.over("daily", 2, B, 90, { tournament: DAY })]);
      node.mine([ev.over("daily", 3, A, 80, { tournament: DAY })]);
    });
    const { total, entries } = queries.leaderboard(head, DAY, 20, 0);
    expect(total).toBe(2);
    expect(entries.map((e) => [e.player_id, e.best_score, e.prize_ranks])).toEqual([
      [id(A), 100, [1, 3]],
      [id(B), 90, [2]],
    ]);
  });

  test("prize ranks of the scenario follow the slots, not the leaderboard", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.leaderboard(head, DAY, 20, 0).entries.map((e) => e.prize_ranks)).toEqual([[1], [2], [3]]);
  });

  test("a game that ended after its day ranks in no tournament, and shows in its player's list", async () => {
    const { queries, head } = await open((node) => {
      players(node);
      node.mine([ev.spawned("daily", 1, A, { tournament: DAY })]);
      node.mine([ev.over("daily", 1, A, 99, { tournament: 0, end: 0 })]);
    });
    expect(queries.leaderboard(head, DAY, 20, 0)).toEqual({ total: 0, entries: [] });
    expect(queries.tournament(head, DAY)).toMatchObject({ games_spawned: 1, games_finished: 0, players: 0, best_score: 0 });
    expect(queries.games(head, id(A), undefined, 20, undefined).games[0]).toMatchObject({
      over: true,
      score: 99,
      tournament_id: DAY,
      counted_tournament_id: 0,
      end_time: 0,
    });
    expect(queries.slots(head, DAY)).toEqual([null, null, null]);
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
    expect(queries.game(2, "daily", 1)).toMatchObject({ over: false, score: null, counted_tournament_id: null, end_time: null });
    expect(queries.game(3, "daily", 1)).toMatchObject({ over: true, score: 50 });
    expect(queries.game(1, "daily", 1)).toBeNull();
  });
});

describe("tournaments", () => {
  test("newest first, only days with a game, paged by `before`", async () => {
    const { queries, head } = await open((node) => {
      players(node);
      node.mine(
        [ev.spawned("daily", 1, A, { tournament: 98 })],
        [ev.spawned("daily", 2, B, { tournament: 99 })],
        [ev.spawned("daily", 3, A, { tournament: 100 })],
        [ev.spawned("daily", 4, B, { tournament: 100 })],
        [ev.spawned("tutorial", 1, A)],
      );
      node.mine([ev.over("daily", 3, A, 5, { tournament: 100 })]);
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
    expect(queries.closedTournaments(head, 100 * 86400 + 1)).toEqual([98, 99]);
    expect(queries.closedTournaments(head, 101 * 86400)).toEqual([98, 99, 100]);
  });
});

describe("players and games", () => {
  const build = (node: FakeNode) => {
    players(node);
    node.mine([ev.spawned("daily", 1, A, { start: 1000 })], [ev.spawned("tutorial", 1, A, { start: 1000 })], [ev.spawned("daily", 2, A, { start: 2000 })]);
    node.mine([ev.over("daily", 1, A, 30)]);
    node.mine([ev.spawned("tutorial", 2, A, { start: 3000 }), ev.spawned("daily", 3, B, { start: 3000 })]);
  };

  test("a player's stats, and null for a player the indexer does not know", async () => {
    const { queries, head } = await open(build);
    expect(queries.player(head, id(A))).toEqual({
      player: { player_id: id(A), name: "Ada", created: expect.any(Number) },
      stats: {
        daily_games: 2,
        daily_finished: 1,
        best_score: 30,
        tutorial_games: 2,
        paid_games: 0,
        settled_games: 0,
        rewards: "0",
      },
      unsettled: [],
    });
    expect(queries.player(head, id(B))!.stats).toEqual({
      daily_games: 1,
      daily_finished: 0,
      best_score: null,
      tutorial_games: 0,
      paid_games: 0,
      settled_games: 0,
      rewards: "0",
    });
    expect(queries.player(head, id(0xffffn))).toBeNull();
  });

  test("games list: newest first over both contracts, filtered by contract, paged by cursor", async () => {
    const { queries, head } = await open(build);
    const all = queries.games(head, id(A), undefined, 20, undefined);
    expect(all.games.map((g) => [g.contract, g.game_id])).toEqual([
      ["tutorial", 2],
      ["daily", 2],
      ["tutorial", 1],
      ["daily", 1],
    ]);
    expect(all.next).toBeNull();
    expect(all.games[3]).toMatchObject({ over: true, score: 30, counted_tournament_id: 100, mode: 1, player_id: id(A) });
    expect(all.games[1]).toMatchObject({ over: false, score: null, end_time: null });

    const first = queries.games(head, id(A), undefined, 3, undefined);
    expect(first.games.map((g) => g.game_id)).toEqual([2, 2, 1]);
    expect(first.next).toBe("1000:tutorial:1");
    const second = queries.games(head, id(A), undefined, 3, { startTime: 1000, contract: "tutorial", gameId: 1 });
    expect(second.games.map((g) => [g.contract, g.game_id])).toEqual([["daily", 1]]);
    expect(second.next).toBeNull();

    expect(queries.games(head, id(A), "daily", 20, undefined).games.map((g) => g.game_id)).toEqual([2, 1]);
    expect(queries.games(head, id(C), undefined, 20, undefined)).toEqual({ games: [], next: null });
  });

  test("a game by contract and id", async () => {
    const { queries, head } = await open(build);
    expect(queries.game(head, "tutorial", 2)).toMatchObject({ contract: "tutorial", game_id: 2, mode: 3, tournament_id: 0 });
    expect(queries.game(head, "daily", 99)).toBeNull();
  });
});

// The rule of `Tournament.score` (contracts/src/models/tournament.cairo): a game takes a slot only above the third slot's
// score (a tie never displaces an earlier game). It is the stable top 3 by score of the games with a score above 0.
const oracle = (games: { playerId: string; score: number; gameId: number }[]) =>
  [...games]
    .filter((g) => g.score > 0)
    .map((g, order) => ({ g, order }))
    .sort((x, y) => y.g.score - x.g.score || x.order - y.order)
    .slice(0, 3)
    .map(({ g }) => g);

const sequence = (scores: number[], players = ["p1", "p2", "p3", "p4"]) =>
  scores.map((score, index) => ({ playerId: players[index % players.length]!, score, gameId: index + 1 }));

describe("the prize slot replay", () => {
  // The table of the Cairo tests of `Tournament` (test_score, test_claim_*) and the cases of the design: ties, one player in
  // several slots, equal scores.
  const table: { scores: number[]; players?: string[]; expected: [string, number][] }[] = [
    { scores: [10, 20, 15, 5, 25], players: ["1", "2", "3", "4", "5"], expected: [["5", 25], ["2", 20], ["3", 15]] },
    { scores: [20, 15], players: ["2", "3"], expected: [["2", 20], ["3", 15]] },
    { scores: [20], players: ["2"], expected: [["2", 20]] },
    { scores: [], expected: [] },
    { scores: [0, 0], players: ["a", "b"], expected: [] },
    { scores: [7, 7, 7, 7], players: ["a", "b", "c", "d"], expected: [["a", 7], ["b", 7], ["c", 7]] },
    { scores: [5, 9, 9, 9], players: ["a", "b", "c", "d"], expected: [["b", 9], ["c", 9], ["d", 9]] },
    { scores: [100, 90, 80], players: ["a", "b", "a"], expected: [["a", 100], ["b", 90], ["a", 80]] },
    { scores: [50, 50, 60, 50], players: ["a", "b", "c", "d"], expected: [["c", 60], ["a", 50], ["b", 50]] },
    { scores: [3, 2, 1, 4, 4, 5, 5], players: ["a", "b", "c", "d", "e", "f", "g"], expected: [["f", 5], ["g", 5], ["d", 4]] },
  ];

  test.each(table.map((row) => [JSON.stringify(row.scores), row] as const))("the table row %s", (_name, row) => {
    const games = sequence(row.scores, row.players);
    const slots = replaySlots(games).filter((slot) => slot !== null);
    expect(slots.map((slot) => [slot!.playerId, slot!.score])).toEqual(row.expected);
    expect(slots).toEqual(oracle(games));
  });

  test("equals the stable top 3 on pseudo-random sequences, ties included", () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let round = 0; round < 500; round++) {
      const length = next() % 12;
      const games = sequence(Array.from({ length }, () => next() % 6)); // few values: many ties, and zeros
      expect(replaySlots(games).filter((slot) => slot !== null)).toEqual(oracle(games));
    }
  });
});

describe("Economy", () => {
  const BIG = 2n ** 100n; // above 2^53 and 2^63: only a decimal string holds it
  // Day 100: A buys games 1 (stake 1) and 2 (stake 3, referred by B), B buys game 3; game 1 is recorded and settled, game 2
  // recorded late (expired), game 3 never ends. Day 101: A buys game 4, recorded. A Tutorial game and a game not bought too.
  const build = (node: FakeNode) => {
    players(node);
    node.mine(
      [ev.spawned("daily", 1, A, { tournament: DAY }), ev.purchased(1, A, { day: DAY })],
      [ev.spawned("daily", 2, A, { tournament: DAY }), ev.purchased(2, A, { day: DAY, stake: 3, referrer: B, referral: 300_000n })],
      [ev.spawned("daily", 3, B, { tournament: DAY }), ev.purchased(3, B, { day: DAY, reference: BIG })],
      [ev.spawned("tutorial", 1, A)],
      [ev.spawned("daily", 5, A, { tournament: DAY })], // not bought
    );
    node.mine([ev.over("daily", 1, A, 5000, { tournament: DAY }), ev.recorded(1, 5000)]);
    node.mine([ev.over("daily", 2, A, 4000, { tournament: 0 }), ev.recorded(2, 4000, true)]);
    node.mine([ev.spawned("daily", 4, A, { tournament: DAY + 1 }), ev.purchased(4, A, { day: DAY + 1 })]);
    node.mine([ev.over("daily", 4, A, 100, { tournament: DAY + 1 }), ev.recorded(4, 100)]);
    node.mine([ev.dayClosed(DAY, { mean: 4_215_689, weight: 4, prior: 3_353_000, emaAfter: 3_400_000 }), ev.settled(1, A, { day: DAY, score: 5000, threshold: 4_215_689, reward: BIG })]);
  };

  test("a game's terms and settlement, null for a Tutorial game and a game not bought", async () => {
    const { queries, head } = await open(build);
    expect(queries.game(head, "daily", 1)!.economy).toEqual({
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
    expect(queries.game(head, "daily", 2)!.economy).toMatchObject({
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
    expect(queries.game(head, "daily", 3)!.economy).toMatchObject({ reference: String(BIG), recorded: false, expired: false, settled: false });
    expect(queries.game(head, "tutorial", 1)!.economy).toBeNull();
    expect(queries.game(head, "daily", 5)!.economy).toBeNull();
    const games = queries.games(head, id(A), "daily", 20, undefined).games;
    expect(games.map((g) => [g.game_id, g.economy?.stake ?? null])).toEqual([[5, null], [4, 1], [2, 3], [1, 1]]);
  });

  test("read at the served block: a settlement, a record or a purchase above it has not happened", async () => {
    const { queries, head } = await open(build);
    expect(queries.game(head - 1, "daily", 1)!.economy).toMatchObject({ settled: false, reward: null, recorded: true });
    expect(queries.game(head - 2, "daily", 4)!.economy).toMatchObject({ recorded: false });
    expect(queries.game(head - 3, "daily", 4)).toBeNull();
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
    const b = queries.player(head, id(B))!;
    expect(b.stats).toMatchObject({ paid_games: 1, settled_games: 0, rewards: "0" });
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
