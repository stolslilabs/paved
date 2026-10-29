// Cobbles v1 (docs/architecture/cobbles-v1.md): the ledger, the claims, the credits and the free games, from the events to the API.
import { describe, expect, test } from "vitest";
import { padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const C = 0xc3n;
const PA = padded(A);
const DAY = 100;

async function open(build: (node: FakeNode) => void) {
  const node = new FakeNode();
  build(node);
  const indexer = indexerOf(node);
  await settle(indexer);
  return { node, indexer, queries: new Queries(indexer.store), head: node.tip };
}

const halts = async (build: (node: FakeNode) => void, reason: RegExp) => {
  const { indexer } = await open(build);
  expect(indexer.status).toBe("halted");
  expect(indexer.reason).toMatch(reason);
};

describe("the cobble amounts", () => {
  test("the last set wins and a removal is 0; they ride on the definitions", async () => {
    const { queries, head } = await open((node) => {
      node.mine([ev.questDefined(1), ev.questDefined(2, { duration: 604800, interval: 604800 }), ev.achievementDefined(3)]);
      node.mine([ev.questCobblesSet(1, 5), ev.questCobblesSet(2, 15, 2), ev.achievementCobblesSet(3, 20)]);
      node.mine([ev.questCobblesSet(1, 10), ev.achievementCobblesSet(3, 0)]);
    });
    const { quests, achievements } = queries.definitions(head);
    expect(quests.map((q) => [q.quest_id, q.cobbles, q.cobbles_kind])).toEqual([[1, 10, "daily"], [2, 15, "weekly"]]);
    expect(achievements.map((a) => [a.achievement_id, a.cobbles])).toEqual([[3, 0]]);
    // read at the block before the last set: the earlier amounts
    const before = queries.definitions(head - 1);
    expect(before.quests.map((q) => q.cobbles)).toEqual([5, 15]);
    expect(before.achievements[0]!.cobbles).toBe(20);
  });

  test("cobbles set for a quest not defined (owner configuration) are kept and served once it is", async () => {
    const { queries, head } = await open((node) => {
      node.mine([ev.questCobblesSet(9, 5)]);
      node.mine([ev.questDefined(9)]);
    });
    expect(queries.definitions(head).quests[0]).toMatchObject({ quest_id: 9, cobbles: 5, cobbles_kind: "daily" });
  });
});

describe("cobbles, claims and credits", () => {
  const scenario = (node: FakeNode) => {
    node.mine([ev.questDefined(1), ev.questDefined(14, { duration: 604800, interval: 604800, start: 345600 })]);
    node.mine([ev.questCobblesSet(1, 5), ev.questCobblesSet(14, 15, 2), ev.achievementDefined(2), ev.achievementCobblesSet(2, 10)]);
    // Day 100 (a Saturday-ish number): daily quest 1, weekly quest 14 of week floor((100*86400-345600)/604800) = 13.
    node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 5, 5)]);
    node.mine([ev.cobblesClaimed(A, 1, 14, 13, 15, 20), ev.cobblesClaimed(A, 2, 2, 0, 10, 30)]);
    node.mine([ev.creditClaimed(A, 1, DAY, 1)], [ev.creditClaimed(A, 2, 13, 2)]);
    node.mine([ev.cobblesClaimed(B, 1, 1, DAY - 1, 5, 5)]);
  };

  test("the balance and the credits are the running values of the last events", async () => {
    const { queries, head, indexer } = await open(scenario);
    expect(indexer.status).toBe("ok");
    expect(queries.playerCobbles(head, PA)).toEqual({
      player_id: PA,
      cobbles: 30,
      credits: 2,
      credits_claimed: 2,
      credits_spent: 0,
      achievements_claimed: [2],
      skins_bought: 0,
      skins_spent: 0,
      xp: 0,
      level: 1,
    });
    expect(queries.playerCobbles(head, padded(B))).toMatchObject({ cobbles: 5, credits: 0, achievements_claimed: [] });
    // A player with no event: zeros, as the other player routes answer a known address
    expect(queries.playerCobbles(head, padded(C))).toMatchObject({ cobbles: 0, credits: 0, credits_claimed: 0 });
  });

  test("a claimant is a player from the claim", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.player(head, padded(B))).not.toBeNull();
  });

  test("claims per period: the quests and credits of the day and of its week, and every achievement", async () => {
    const { queries, head } = await open(scenario);
    const day = queries.playerClaims(head, PA, DAY);
    expect(day.week).toBe(13);
    expect(day.claims.map((c) => [c.kind, c.id, c.period, c.cobbles])).toEqual([
      ["quest", 1, DAY, 5],
      ["quest", 14, 13, 15],
      ["achievement", 2, 0, 10],
    ]);
    expect(day.credits.map((c) => [c.kind, c.period])).toEqual([["daily", DAY], ["weekly", 13]]);
    // the next day: the daily quest and credit are not claimed, the weekly ones (same week) and the achievement are
    const next = queries.playerClaims(head, PA, DAY + 1);
    expect(next.claims.map((c) => [c.kind, c.id])).toEqual([["quest", 14], ["achievement", 2]]);
    expect(next.credits.map((c) => c.kind)).toEqual(["weekly"]);
    // a day of the week before: the weekly claim is not there
    expect(queries.playerClaims(head, PA, DAY - 7).claims.map((c) => c.id)).toEqual([2]);
    // before the first week (1970-01-01 to 04): no week, no weekly claim
    expect(queries.playerClaims(head, PA, 2)).toMatchObject({ week: null, claims: [{ kind: "achievement" }], credits: [] });
  });

  test("everything is read as of the served block", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.playerCobbles(head - 3, PA)).toMatchObject({ cobbles: 5, credits: 0 });
    expect(queries.playerCobbles(head - 2, PA)).toMatchObject({ cobbles: 30, credits: 0 });
    expect(queries.playerClaims(head - 3, PA, DAY).claims).toHaveLength(1);
  });

  test("a credit spent on a free game takes one credit, and the ledger answers claimed less spent", async () => {
    const { queries, head } = await open((node) => {
      scenario(node);
      node.mine([ev.spawned("challenge", 1, A, { day: DAY, price: 0 }), ev.creditSpent(A, 1, 1)]);
    });
    expect(queries.playerCobbles(head, PA)).toMatchObject({ credits: 1, credits_claimed: 2, credits_spent: 1 });
    expect(queries.playerCobbles(head - 1, PA)).toMatchObject({ credits: 2, credits_spent: 0 });
  });

  test("the routes", async () => {
    const { indexer } = await open(scenario);
    const cobbles = respond(indexer, "GET", `/v1/players/${PA}/cobbles`);
    expect(cobbles.code).toBe(200);
    expect(cobbles.body).toMatchObject({ version: 1, status: "ok", player_id: PA, cobbles: 30, credits: 2 });
    const claims = respond(indexer, "GET", `/v1/players/${PA}/claims?day=${DAY}`);
    expect(claims.code).toBe(200);
    expect(claims.body).toMatchObject({ day: DAY, week: 13 });
    expect((claims.body.claims as unknown[]).length).toBe(3);
    // without a day: the UTC day of the served block (the fake chain's time is day 11)
    expect(respond(indexer, "GET", `/v1/players/${PA}/claims`).body.day).toBe(Math.floor(1_000_000 / 86400));
    expect(respond(indexer, "GET", `/v1/players/${PA}/claims?day=x`).code).toBe(400);
    expect(respond(indexer, "GET", `/v1/players/${PA}/claims?week=1`).code).toBe(400);
    expect(respond(indexer, "GET", `/v1/players/0x12/cobbles`).code).toBe(400);
    expect(respond(indexer, "GET", `/v1/players/${PA}/cobbles/more`).code).toBe(404);
    expect(respond(indexer, "GET", "/v1/definitions").body.quests).toMatchObject([{ cobbles: 5, cobbles_kind: "daily" }, { cobbles: 15, cobbles_kind: "weekly" }]);
  });

  test("a reorg takes back the claims, the credits and the amounts, as a fresh index of the new chain", async () => {
    const { node, indexer } = await open(scenario);
    expect(indexer.status).toBe("ok");
    node.reorg(2, [[[ev.cobblesClaimed(B, 1, 1, DAY, 5, 5)]], [[ev.questCobblesSet(1, 9)]]]);
    await settle(indexer);
    const fresh = indexerOf(node);
    await settle(fresh);
    expect(indexer.status).toBe("ok");
    expect(indexer.rewindCount).toBe(1);
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
    expect(new Queries(indexer.store).playerCobbles(node.tip, PA)).toMatchObject({ cobbles: 30, credits: 0 });
  });

  test("the schema keeps every cobbles table in the dump", async () => {
    const { indexer } = await open(scenario);
    const dump = indexer.store.dump();
    expect(dump.cobble_claims).toHaveLength(4);
    expect(dump.credit_claims).toHaveLength(2);
    expect(dump.cobble_amounts).toHaveLength(3);
    expect(dump.credit_spends).toEqual([]);
  });
});

describe("the stars of Story levels (kind 3, docs/architecture/story-mode.md)", () => {
  test("each star is a claim on the same running balance", async () => {
    const { queries, head, indexer } = await open((node) =>
      node.mine(
        [ev.cobblesClaimed(A, 1, 1, DAY, 5, 5)],
        [ev.cobblesClaimed(A, 3, 0x101, 1, 5, 10), ev.cobblesClaimed(A, 3, 0x101, 2, 10, 20)],
        [ev.cobblesClaimed(A, 3, 0x101, 3, 15, 35)],
      ),
    );
    expect(indexer.status).toBe("ok");
    expect(queries.playerCobbles(head, PA)).toMatchObject({ cobbles: 35 });
    // the claims of a day list the quests and achievements only
    expect(queries.playerClaims(head, PA, DAY).claims.map((c) => c.kind)).toEqual(["quest"]);
  });

  test("a star paid twice halts", async () => {
    await halts(
      (node) => node.mine([ev.cobblesClaimed(A, 3, 0x101, 1, 5, 5)], [ev.cobblesClaimed(A, 3, 0x101, 1, 5, 10)]),
      /story star 257, period 1.*already claimed/,
    );
  });
});

describe("the leagues' bonuses and season rewards (kinds 4 and 5, docs/architecture/leagues.md)", () => {
  test("each is a claim on the same running balance, once per league and season", async () => {
    const { queries, head, indexer } = await open((node) =>
      node.mine(
        [ev.cobblesClaimed(A, 4, 1, 1, 5, 5), ev.cobblesClaimed(A, 4, 2, 1, 5, 10)],
        // season 1 closed in Iron II, then Iron II reached again in season 2
        [ev.cobblesClaimed(A, 5, 2, 1, 10, 20), ev.cobblesClaimed(A, 4, 2, 2, 5, 25)],
      ),
    );
    expect(indexer.status).toBe("ok");
    expect(queries.playerCobbles(head, PA)).toMatchObject({ cobbles: 25 });
    expect(queries.playerClaims(head, PA, DAY).claims).toEqual([]);
  });

  test("a league's bonus paid twice in a season halts", async () => {
    await halts(
      (node) => node.mine([ev.cobblesClaimed(A, 4, 1, 1, 5, 5)], [ev.cobblesClaimed(A, 4, 1, 1, 5, 10)]),
      /league 1, period 1.*already claimed/,
    );
  });
});

describe("the village rewards taken as Cobbles (kind 6, docs/architecture/village-rewards.md)", () => {
  test("each is a claim on the same running balance, once per reward index", async () => {
    const { queries, head, indexer } = await open((node) =>
      node.mine([ev.cobblesClaimed(A, 6, 0, 0, 5, 5)], [ev.cobblesClaimed(A, 6, 0, 1, 5, 10)]),
    );
    expect(indexer.status).toBe("ok");
    expect(queries.playerCobbles(head, PA)).toMatchObject({ cobbles: 10 });
  });

  test("a reward paid twice halts", async () => {
    await halts(
      (node) => node.mine([ev.cobblesClaimed(A, 6, 0, 3, 5, 5)], [ev.cobblesClaimed(A, 6, 0, 3, 5, 10)]),
      /village reward 0, period 3.*already claimed/,
    );
  });
});

describe("the ledger halts on what the chain would not do", () => {
  test("a second claim of the same quest and period, or achievement", async () => {
    await halts((node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 5, 5)], [ev.cobblesClaimed(A, 1, 1, DAY, 5, 10)]), /already claimed/);
    await halts((node) => node.mine([ev.cobblesClaimed(A, 2, 2, 0, 10, 10)], [ev.cobblesClaimed(A, 2, 2, 0, 10, 20)]), /already claimed/);
  });

  test("a balance that is not the sum of the claims before it", async () => {
    await halts((node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 5, 7)]), /balance 7, the claims before it sum to 5/);
    await halts(
      (node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 5, 5)], [ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 5)]),
      /balance 5, the claims before it sum to 10/,
    );
  });

  test("a credit claimed twice for a period, or with credits that do not follow", async () => {
    await halts((node) => node.mine([ev.creditClaimed(A, 1, DAY, 1)], [ev.creditClaimed(A, 1, DAY, 2)]), /already claimed/);
    await halts((node) => node.mine([ev.creditClaimed(A, 1, DAY, 2)]), /credits 2, the ledger before it gives 1/);
  });

  test("a credit spent on a paid game, a game of another player, no game, twice, or beyond the credits", async () => {
    const claimed = [ev.creditClaimed(A, 1, DAY, 1)];
    await halts((node) => node.mine(claimed, [ev.spawned("challenge", 1, A, { price: 5 }), ev.creditSpent(A, 1, 0)]), /no free game/);
    await halts((node) => node.mine(claimed, [ev.spawned("challenge", 1, B, { price: 0 }), ev.creditSpent(A, 1, 0)]), /another player/);
    await halts((node) => node.mine(claimed, [ev.creditSpent(A, 9, 0)]), /no free game/);
    await halts(
      (node) =>
        node.mine(
          [ev.creditClaimed(A, 1, DAY, 1)],
          [ev.creditClaimed(A, 1, DAY + 1, 2)],
          [ev.spawned("challenge", 1, A, { price: 0 }), ev.creditSpent(A, 1, 1)],
          [ev.creditSpent(A, 1, 0)],
        ),
      /already has its credit spent/,
    );
    await halts((node) => node.mine([ev.spawned("challenge", 1, A, { price: 0 }), ev.creditSpent(A, 1, 0)]), /ledger before it gives -1/);
  });
});

describe("free games", () => {
  /** A bought game of A, a free game of B that beats it, and a free game of C that does not: both start and end in the day. */
  const scenario = (node: FakeNode) => {
    node.mine([ev.creditClaimed(B, 1, DAY, 1)], [ev.creditClaimed(C, 1, DAY, 1)]);
    node.mine(
      [ev.spawned("challenge", 1, A, { day: DAY, price: 2_000_000 }), ev.purchased(1, A, { day: DAY })],
      [ev.spawned("challenge", 2, B, { day: DAY, price: 0 }), ev.creditSpent(B, 2, 0)],
      [ev.spawned("challenge", 3, C, { day: DAY, price: 0 }), ev.creditSpent(C, 3, 0)],
    );
    // A free game has no Recorded and no Settled; it ends with GameOver alone.
    node.mine([ev.over("challenge", 1, A, 50, { day: DAY, end: 11 }), ev.recorded(1, 50)]);
    node.mine([ev.over("challenge", 2, B, 80, { day: DAY, end: 12 })]);
    node.mine([ev.over("challenge", 3, C, 30, { day: DAY, end: 13 })]);
  };

  test("a free game is ranked like any game, marked free on the leaderboard", async () => {
    const { queries, head, indexer } = await open(scenario);
    expect(indexer.status).toBe("ok");
    const { total, entries } = queries.leaderboard(head, DAY, 20, 0);
    expect(total).toBe(3);
    expect(entries.map((e) => [e.rank, e.player_id, e.best_score, e.best_game_id, e.free])).toEqual([
      [1, padded(B), 80, 2, true],
      [2, padded(A), 50, 1, false],
      [3, padded(C), 30, 3, true],
    ]);
    expect(queries.entry(head, DAY, padded(B))).toMatchObject({ rank: 1, free: true });
    expect(queries.entry(head, DAY, padded(A))).toMatchObject({ free: false });
  });

  test("the flag is the best game's: a player's free game that is not their best does not mark the row", async () => {
    const { queries, head } = await open((node) => {
      scenario(node);
      // B also plays a paid game that beats the free one
      node.mine([ev.spawned("challenge", 4, B, { day: DAY, price: 2_000_000 }), ev.purchased(4, B, { day: DAY })]);
      node.mine([ev.over("challenge", 4, B, 90, { day: DAY, end: 14 })]);
    });
    expect(queries.entry(head, DAY, padded(B))).toMatchObject({ best_game_id: 4, best_score: 90, free: false, games_played: 2, games_finished: 2 });
  });

  test("the player's games carry the flag, and a free game's economy is null, not dropped", async () => {
    const { queries, head } = await open(scenario);
    const free = queries.games(head, padded(B), undefined, 10, undefined).games;
    expect(free).toHaveLength(1);
    expect(free[0]).toMatchObject({ game_id: 2, free: true, economy: null, over: true, score: 80, token_id: null });
    const paid = queries.games(head, padded(A), undefined, 10, undefined).games;
    expect(paid[0]).toMatchObject({ game_id: 1, free: false });
    expect(paid[0]!.economy).not.toBeNull();
    expect(queries.game(head, "challenge", 3)).toMatchObject({ free: true, economy: null });
    // over the HTTP route as well
    const { indexer } = await open(scenario);
    expect(respond(indexer, "GET", `/v1/games/challenge/2`).body.game).toMatchObject({ free: true, economy: null });
    expect(respond(indexer, "GET", `/v1/players/${padded(B)}/games`).body.games).toMatchObject([{ game_id: 2, free: true }]);
  });

  test("a free game counts as a game played and finished, never as bought, recorded, unsettled or rewarded", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.tournament(head, DAY)).toMatchObject({ games_spawned: 3, games_finished: 3, players: 3, best_score: 80 });
    // Economy's day holds the one bought game only
    expect(queries.dayEconomy(head, DAY)).toMatchObject({
      games_purchased: 1,
      games_recorded: 1,
      games_settled: 0,
      unsettled: [1],
      unsettled_count: 1,
      rewards: "0",
    });
    const free = queries.player(head, padded(B))!;
    expect(free.stats).toMatchObject({ challenge_games: 1, challenge_finished: 1, best_score: 80, paid_games: 0, settled_games: 0, rewards: "0" });
    expect(free.unsettled).toEqual([]);
    expect(free.unsettled_count).toBe(0);
    expect(queries.player(head, PA)!.stats).toMatchObject({ challenge_games: 1, paid_games: 1 });
  });

  test("a free game that ends after its day, or never ends, behaves as any game (counted day 0, running)", async () => {
    const { queries, head } = await open((node) => {
      node.mine([ev.creditClaimed(B, 1, DAY, 1)]);
      node.mine([ev.spawned("challenge", 2, B, { day: DAY, price: 0 }), ev.creditSpent(B, 2, 0)]);
      node.mine([ev.over("challenge", 2, B, 10, { day: 0, end: 0 })]);
      node.mine([ev.spawned("challenge", 3, B, { day: DAY, price: 0 })]);
    });
    expect(queries.leaderboard(head, DAY, 20, 0).entries).toEqual([]);
    expect(queries.game(head, "challenge", 2)).toMatchObject({ free: true, over: true, counted_day_id: 0, end_time: 0 });
    expect(queries.game(head, "challenge", 3)).toMatchObject({ free: true, over: false, score: null });
  });

  test("a free game takes a podium place like any game", async () => {
    const { queries } = await open((node) => {
      scenario(node);
      // a block past the day's end closes it
      node.time = (DAY + 1) * 86400 + 5;
      node.mine([]);
    });
    const podium = queries.store.statement("SELECT rank, player_id FROM podium WHERE day_id = ? ORDER BY rank").all(DAY);
    expect(podium).toEqual([
      { rank: 1, player_id: padded(B) },
      { rank: 2, player_id: padded(A) },
      { rank: 3, player_id: padded(C) },
    ]);
  });
});
