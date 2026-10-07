import { hash } from "starknet";
import { describe, expect, test } from "vitest";
import { MAX_TOURNAMENT_ID } from "./api.ts";
import { CrossCheck } from "./crosscheck.ts";
import { Chain } from "./chain.ts";
import { canonical, padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { PODIUM_TASK, firstActive, intervalId, intervalSpan, replay, type Schedule } from "./quests.ts";
import { respond } from "./server.ts";
import { ACCOUNT, DAILY, FakeNode, TUTORIAL, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const C = 0xc3n;
const DAY = 100;
const T0 = DAY * 86400; // 00:00 UTC of day 100
const END = T0 + 86400;
// The accepted list (quests.md): tasks 1 GAME_FINISHED, 3 POINTS, ...
const DAILY_RUN = 1;
const POINT_CHASER = 4;

const daily: Schedule = { start: 0, end: 0, duration: 86400, period: 86400 };

describe("the schedule rules of quiver_quest", () => {
  test("interval_id: None outside the window or the active part, Some(0) for a one-off, (t - start) / interval", () => {
    expect(intervalId(daily, 0)).toBe(0);
    expect(intervalId(daily, 86399)).toBe(0);
    expect(intervalId(daily, 86400)).toBe(1);
    expect(intervalId(daily, T0 + 5)).toBe(DAY);
    const window = { start: 1000, end: 2000, duration: 0, period: 0 };
    expect(intervalId(window, 999)).toBeNull();
    expect(intervalId(window, 1000)).toBe(0);
    expect(intervalId(window, 1999)).toBe(0);
    expect(intervalId(window, 2000)).toBeNull(); // end is the first second after
    const sparse = { start: 100, end: 0, duration: 10, period: 60 };
    expect(intervalId(sparse, 109)).toBe(0);
    expect(intervalId(sparse, 110)).toBeNull();
    expect(intervalId(sparse, 160)).toBe(1);
  });

  test("firstActive finds the first active second of a range", () => {
    expect(firstActive(daily, T0, END)).toBe(T0);
    expect(firstActive({ ...daily, start: T0 + 100 }, T0, END)).toBe(T0 + 100);
    expect(firstActive({ ...daily, start: END }, T0, END)).toBeNull(); // starts after
    expect(firstActive({ ...daily, end: T0 }, T0, END)).toBeNull(); // ended
    const sparse = { start: 100, end: 0, duration: 10, period: 60 };
    expect(firstActive(sparse, 110, 150)).toBeNull();
    expect(firstActive(sparse, 110, 161)).toBe(160);
    expect(intervalSpan(daily, DAY)).toEqual({ from: T0, to: END });
    expect(intervalSpan({ start: 5, end: 9, duration: 0, period: 0 }, 0)).toEqual({ from: 5, to: 9 });
  });

  test("replay saturates each task at its total and completes when all are", () => {
    const tasks = [
      { taskId: 1, total: 2 },
      { taskId: 3, total: 100 },
    ];
    const rows = [
      { taskId: 1, count: 1, time: 10 },
      { taskId: 3, count: 80, time: 11 },
      { taskId: 1, count: 5, time: 12 }, // saturates at 2
      { taskId: 9, count: 1, time: 13 }, // not a task of the definition
      { taskId: 3, count: 30, time: 14 }, // completes it, saturated at 100
      { taskId: 3, count: 30, time: 15 },
    ];
    expect(replay(tasks, rows)).toEqual({
      tasks: [
        { task_id: 1, total: 2, count: 2 },
        { task_id: 3, total: 100, count: 100 },
      ],
      completed: true,
      completedAt: 14,
    });
    expect(replay(tasks, rows.slice(0, 3))).toMatchObject({ completed: false, completedAt: null });
  });
});

async function open(build: (node: FakeNode) => void) {
  const node = new FakeNode();
  node.time = T0 + 100;
  build(node);
  const indexer = indexerOf(node);
  await settle(indexer);
  expect(indexer.status, indexer.reason).toBe("ok");
  return { node, indexer, queries: new Queries(indexer.store), head: node.tip };
}

const defineList = (node: FakeNode) =>
  node.mine(
    [ev.questDefined(1, { tasks: [[DAILY_RUN, 1]] })],
    [ev.questDefined(4, { tasks: [[3, 3000]] })],
    [ev.achievementDefined(2, { tasks: [[1, 1]], points: 10 })],
    [ev.achievementDefined(3, { tasks: [[1, 10]], points: 20 })],
    [ev.achievementDefined(9, { tasks: [[PODIUM_TASK, 1]], points: 50 })],
  );

/** A finished Daily game of `player` reported as the contract does: GAME_FINISHED 1, POINTS score; achievements 1 too. */
const finished = (player: bigint, score: number) => [
  ev.questProgressed(player, 1, 1),
  ev.questProgressed(player, 3, score),
  ev.achievementProgressed("daily", player, 1, 1),
];

describe("quests", () => {
  test("Point Chaser is the SUM of the day's finished scores, not a single game", async () => {
    const { queries, head } = await open((node) => {
      defineList(node);
      node.mine(finished(A, 1200));
      node.mine(finished(A, 1500));
      node.mine(finished(B, 2999));
    });
    const [dailyRun, chaser] = queries.playerQuests(head, padded(A), DAY);
    expect(dailyRun).toMatchObject({ quest_id: 1, interval_id: DAY, completed: true });
    expect(chaser).toMatchObject({
      quest_id: 4,
      completed: false,
      tasks: [{ task_id: 3, total: 3000, count: 2700 }],
    });
    const more = await open((node) => {
      defineList(node);
      node.mine(finished(A, 1200));
      node.mine(finished(A, 1500));
      node.mine(finished(A, 400)); // 3100: saturated at 3000, completed by this report
    });
    const done = more.queries.playerQuests(more.head, padded(A), DAY)[1]!;
    expect(done).toMatchObject({ completed: true, tasks: [{ count: 3000 }] });
    expect(done.completed_at).toBe(more.indexer.store.block(more.head)!.timestamp);
    // B finished one game of 2999: one short
    expect(queries.playerQuests(head, padded(B), DAY)[1]).toMatchObject({ completed: false, tasks: [{ count: 2999 }] });
  });

  test("a day is its own interval: the sum restarts at 00:00 UTC", async () => {
    const { queries, head, node } = await open((node) => {
      defineList(node);
      node.mine(finished(A, 2000));
      node.time = END + 5; // the next day
      node.mine(finished(A, 2000));
    });
    expect(queries.playerQuests(head, padded(A), DAY)[1]).toMatchObject({ interval_id: DAY, tasks: [{ count: 2000 }] });
    expect(queries.playerQuests(head, padded(A), DAY + 1)[1]).toMatchObject({ interval_id: DAY + 1, tasks: [{ count: 2000 }] });
    // a game over after midnight counts for the day it ends in: the report's block, not the game's start
    expect(node.blocks.at(-1)!.timestamp).toBeGreaterThanOrEqual(END);
  });

  test("the last second of a day is that day's, the first of the next is not", async () => {
    const { queries, head } = await open((node) => {
      defineList(node);
      node.time = END - 1;
      node.mine(finished(A, 100));
      node.mine(finished(A, 100)); // END
    });
    expect(queries.playerQuests(head, padded(A), DAY)[1]).toMatchObject({ tasks: [{ count: 100 }] });
    expect(queries.playerQuests(head, padded(A), DAY + 1)[1]).toMatchObject({ tasks: [{ count: 100 }] });
  });

  test("a quest not started or ended is not on the board, and a one-off counts over its whole window", async () => {
    const { queries, head } = await open((node) => {
      node.mine(
        [ev.questDefined(1, { start: END, end: 0 })], // from the next day
        [ev.questDefined(2, { start: 0, end: T0 })], // ended before the day
        [ev.questDefined(3, { start: T0 - 86400, end: END + 86400, duration: 0, interval: 0, tasks: [[7, 5]] })],
      );
      node.mine([ev.questProgressed(A, 7, 3)]);
      node.time = END + 10;
      node.mine([ev.questProgressed(A, 7, 3)]);
    });
    expect(queries.playerQuests(head, padded(A), DAY).map((q) => q.quest_id)).toEqual([3]);
    expect(queries.playerQuests(head, padded(A), DAY + 1).map((q) => q.quest_id)).toEqual([1, 3]);
    // the one-off sums over both days (6 saturated at 5), with interval 0
    expect(queries.playerQuests(head, padded(A), DAY + 1)[1]).toMatchObject({
      interval_id: 0,
      completed: true,
      tasks: [{ task_id: 7, total: 5, count: 5 }],
    });
  });

  test("a retired quest keeps what counted before the retirement, in chain order, and leaves the next days' board", async () => {
    const { queries, head } = await open((node) => {
      defineList(node);
      node.mine(finished(A, 1000));
      // one transaction: a report, the retirement, then a report that must not count
      node.mine([ev.questProgressed(A, 3, 500), ev.questRetired(4), ev.questProgressed(A, 3, 700)]);
      node.time = END + 5;
      node.mine([ev.questProgressed(A, 3, 100)]);
    });
    const chaser = queries.playerQuests(head, padded(A), DAY).find((q) => q.quest_id === 4)!;
    expect(chaser).toMatchObject({ retired: true, tasks: [{ count: 1500 }] });
    // retired during day 100: not on day 101's board
    expect(queries.playerQuests(head, padded(A), DAY + 1).map((q) => q.quest_id)).toEqual([1]);
    expect(queries.definitions(head).quests.find((q) => q.quest_id === 4)).toMatchObject({
      retired: true,
      retired_at: expect.any(Number),
    });
  });

  test("Tutorial reports no quest progress: its achievement task counts for achievements only", async () => {
    const { queries, head } = await open((node) => {
      node.mine([ev.achievementDefined(1, { tasks: [[10, 1]], points: 10 })]);
      node.mine([ev.achievementProgressed("tutorial", A, 10, 1)]);
    });
    expect(queries.playerAchievements(head, padded(A))).toMatchObject({
      points: 10,
      achievements: [{ achievement_id: 1, completed: true }],
    });
  });

  test("an unknown player has zero progress (200, not 404), and the head limits what is read", async () => {
    const { queries, head } = await open((node) => {
      defineList(node);
      node.mine(finished(A, 800));
      node.mine(finished(A, 800));
    });
    expect(queries.playerQuests(head, padded(C), DAY)[1]).toMatchObject({ completed: false, tasks: [{ count: 0 }] });
    // read at the block before the last report
    expect(queries.playerQuests(head - 1, padded(A), DAY)[1]).toMatchObject({ tasks: [{ count: 800 }] });
    expect(queries.playerQuests(head - 1000, padded(A), DAY)).toEqual([]);
  });
});

describe("achievements", () => {
  test("tiers on one task are separate achievements; counts are increments; a reached tier is kept", async () => {
    const { queries, head } = await open((node) => {
      defineList(node);
      for (let i = 0; i < 9; i++) node.mine(finished(A, 10));
    });
    let { points, achievements } = queries.playerAchievements(head, padded(A));
    expect(achievements.map((a) => [a.achievement_id, a.completed, a.tasks[0]!.count])).toEqual([
      [2, true, 1], // Settler I, saturated at 1
      [3, false, 9], // Settler II, one game short
      [9, false, 0],
    ]);
    expect(points).toBe(10);
    const tenth = await open((node) => {
      defineList(node);
      for (let i = 0; i < 10; i++) node.mine(finished(A, 10));
    });
    ({ points, achievements } = tenth.queries.playerAchievements(tenth.head, padded(A)));
    expect(achievements.find((a) => a.achievement_id === 3)).toMatchObject({ completed: true, tasks: [{ count: 10 }] });
    expect(points).toBe(30);
  });

  test("the window bounds what counts (end exclusive), and a retirement stops the count", async () => {
    const { queries, head } = await open((node) => {
      node.mine(
        [ev.achievementDefined(1, { start: T0 + 200, end: T0 + 300, tasks: [[5, 4]] })],
        [ev.achievementDefined(2, { tasks: [[5, 4]] })],
      );
      node.time = T0 + 150;
      node.mine([ev.achievementProgressed("daily", A, 5, 1)]); // before the window of 1
      node.time = T0 + 250;
      node.mine([ev.achievementProgressed("daily", A, 5, 1)]); // in the window
      // one transaction: a report, the retirement of 2, then a report
      node.mine([ev.achievementProgressed("daily", A, 5, 1), ev.achievementRetired(2), ev.achievementProgressed("daily", A, 5, 1)]);
      node.time = T0 + 300;
      node.mine([ev.achievementProgressed("daily", A, 5, 1)]); // end is exclusive
    });
    const [windowed, retired] = queries.playerAchievements(head, padded(A)).achievements;
    // 1: the reports at 250 (1) and 251 (2); not 150, not 300
    expect(windowed).toMatchObject({ achievement_id: 1, completed: false, retired: false, tasks: [{ count: 3 }] });
    // 2: 150, 250 and the first of 251 (3); the report after the retirement and the one at 300 would have completed it
    expect(retired).toMatchObject({ achievement_id: 2, retired: true, completed: false, tasks: [{ count: 3 }] });
  });

  test("a retirement keeps what was reached and ignores what comes after", async () => {
    const { queries, head } = await open((node) => {
      node.mine([ev.achievementDefined(1, { tasks: [[5, 10]] })]);
      node.mine([ev.achievementProgressed("daily", A, 5, 4), ev.achievementRetired(1), ev.achievementProgressed("daily", A, 5, 4)]);
    });
    expect(queries.playerAchievements(head, padded(A)).achievements[0]).toMatchObject({
      retired: true,
      completed: false,
      tasks: [{ count: 4 }],
    });
  });
});

describe("the definitions", () => {
  test("served as defined, with the times of their blocks", async () => {
    const { queries, head, indexer } = await open((node) => {
      node.mine([ev.questDefined(7, { start: 86400, tasks: [[2, 6], [4, 1]], conditions: [1, 2] })]);
      node.mine([ev.achievementDefined(5, { tasks: [[6, 1]], points: 20 })]);
    });
    const { quests, achievements } = queries.definitions(head);
    expect(quests).toEqual([
      {
        quest_id: 7,
        start_time: 86400,
        end_time: 0,
        duration: 86400,
        interval: 86400,
        tasks: [
          { task_id: 2, total: 6 },
          { task_id: 4, total: 1 },
        ],
        conditions: [1, 2],
        defined_at: indexer.store.block(head - 1)!.timestamp,
        retired: false,
        retired_at: null,
      },
    ]);
    expect(achievements[0]).toMatchObject({ achievement_id: 5, points: 20, start_time: 0, end_time: 0, retired: false });
    // read before the definition: nothing
    expect(queries.definitions(head - 2)).toEqual({ quests: [], achievements: [] });
  });

  test("a definition twice, or a retirement of nothing, halts the indexer", async () => {
    for (const events of [
      [ev.questDefined(1), ev.questDefined(1)],
      [ev.achievementDefined(1), ev.achievementDefined(1)],
      [ev.questRetired(9)],
      [ev.achievementRetired(9)],
      [ev.questDefined(1), ev.questRetired(1), ev.questRetired(1)],
    ]) {
      const node = new FakeNode();
      node.mine(events);
      const indexer = indexerOf(node);
      await settle(indexer);
      expect(indexer.status).toBe("halted");
    }
  });
});

const SELECTOR = canonical(hash.getSelectorFromName("tournament"));
const view = (slots: [bigint, number][]) => {
  const top = [0, 1, 2].flatMap((rank) => {
    const [player, score] = slots[rank] ?? [0n, 0];
    return [`0x${player.toString(16)}`, `0x${score.toString(16)}`, "0x0"];
  });
  return ["0x64", "0x0", "0x0", "0x1", "0x0", "0x0", ...top];
};

describe("On the Podium", () => {
  async function podiumDay(slots: [bigint, number][]) {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine([ev.achievementDefined(9, { tasks: [[PODIUM_TASK, 1]], points: 50 })]);
    node.mine([ev.created(A, 0x41)], [ev.created(B, 0x42)], [ev.created(C, 0x43)]);
    node.mine([ev.spawned("daily", 1, A, { tournament: DAY })], [ev.spawned("daily", 2, B, { tournament: DAY })], [ev.spawned("daily", 3, C, { tournament: DAY })]);
    node.mine([ev.over("daily", 1, A, 50, { tournament: DAY })]);
    node.mine([ev.over("daily", 2, B, 40, { tournament: DAY })]);
    node.mine([ev.over("daily", 3, C, 30, { tournament: DAY })]);
    const calls: string[] = [];
    node.views = (address, selector, calldata, blockHash) => {
      expect(selector).toBe(SELECTOR);
      calls.push(blockHash);
      return view(slots);
    };
    const indexer = indexerOf(node);
    await settle(indexer);
    const chain = new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT });
    const check = new CrossCheck(chain, indexer.store);
    const queries = new Queries(indexer.store);
    return { node, indexer, check, queries, calls };
  }

  const credited = (queries: Queries, head: number, player: bigint) =>
    queries.playerAchievements(head, padded(player)).achievements.find((a) => a.achievement_id === 9)!;

  test("nothing is credited while the day is open, whatever the ranking", async () => {
    const { indexer, check, queries, calls } = await podiumDay([[A, 50], [B, 40], [C, 30]]);
    expect(indexer.served!.timestamp).toBeLessThan(END);
    await check.run(indexer.served!);
    expect(calls).toHaveLength(0); // the view is not even read
    expect(indexer.store.dump().podium).toEqual([]);
    expect(credited(queries, indexer.served!.number, A)).toMatchObject({ completed: false, tasks: [{ count: 0 }] });
  });

  test("after the day closes, each player of the view's top 3 is credited, from the view and at the served head", async () => {
    const { node, indexer, check, queries, calls } = await podiumDay([[A, 50], [B, 40], [C, 30]]);
    node.time = END + 5;
    node.mine();
    await settle(indexer);
    const served = indexer.served!;
    await check.run(served);
    expect(calls).toEqual([served.hash]);
    for (const player of [A, B, C]) {
      expect(credited(queries, served.number, player)).toMatchObject({
        completed: true,
        completed_at: END,
        tasks: [{ task_id: PODIUM_TASK, count: 1 }],
      });
    }
    expect(queries.playerAchievements(served.number, padded(A)).points).toBe(50);
    expect(indexer.store.dump().podium).toEqual([
      { tournament_id: DAY, player_id: padded(A), ranks: "[1]", day_end: END, read_block: served.number },
      { tournament_id: DAY, player_id: padded(B), ranks: "[2]", day_end: END, read_block: served.number },
      { tournament_id: DAY, player_id: padded(C), ranks: "[3]", day_end: END, read_block: served.number },
    ]);
    // read at a block before the credit was recorded: not there
    expect(credited(queries, served.number - 1, A)).toMatchObject({ completed: false });
    // credited once, checked again: unchanged
    check.checked.clear();
    await check.run(served);
    expect(indexer.store.dump().podium).toHaveLength(3);
  });

  test("the contract's view decides, not the events; an empty slot and a player in two slots credit once", async () => {
    // The events rank A, B, C; the view says B holds slots 1 and 2 and slot 3 is empty
    const { node, indexer, check, queries } = await podiumDay([[B, 60], [B, 55]]);
    node.time = END + 5;
    node.mine();
    await settle(indexer);
    await check.run(indexer.served!);
    expect(check.lastMismatch).not.toBeNull(); // reported as ever
    expect(credited(queries, indexer.served!.number, B)).toMatchObject({ completed: true, tasks: [{ count: 1 }] });
    expect(credited(queries, indexer.served!.number, A)).toMatchObject({ completed: false });
    expect(indexer.store.dump().podium).toEqual([
      expect.objectContaining({ player_id: padded(B), ranks: "[1,2]" }),
    ]);
  });

  test("the store refuses a podium read before the day ends", async () => {
    const { indexer } = await podiumDay([[A, 1]]);
    expect(() => indexer.store.recordPodium(DAY, END, [{ playerId: padded(A), rank: 1 }], indexer.served!)).toThrow(/before the day ends/);
  });

  test("a rewind below the read forgets the credit; the next read credits again", async () => {
    const { node, indexer, check, queries } = await podiumDay([[A, 50], [B, 40], [C, 30]]);
    node.time = END + 5;
    node.mine();
    await settle(indexer);
    const read = indexer.served!.number;
    await check.run(indexer.served!);
    expect(indexer.store.dump().podium).toHaveLength(3);
    // the closing block is replaced by one still inside the day: the day is open again
    node.reorg(1, [[]]);
    node.time = T0 + 20;
    node.blocks[node.blocks.length - 1]!.timestamp = T0 + 20;
    indexer.listen({ rewound: () => check.reset() });
    await settle(indexer);
    expect(indexer.store.tip()!.number).toBe(read);
    expect(indexer.store.dump().podium).toEqual([]);
    expect(credited(queries, indexer.served!.number, A)).toMatchObject({ completed: false });
  });
});

describe("rewinding the new tables", () => {
  test("a reorg undoes definitions, retirements and progress, and equals a fresh build", async () => {
    const base = (node: FakeNode) => {
      node.time = T0 + 10;
      node.mine([ev.questDefined(1), ev.achievementDefined(1)]);
      node.mine(finished(A, 100));
    };
    const node = new FakeNode();
    base(node);
    node.mine([ev.questDefined(2), ev.achievementDefined(2)], [ev.questRetired(1), ev.achievementRetired(1)]);
    node.mine(finished(A, 100), [ev.questProgressed(B, 1, 1)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.store.dump().quests).toHaveLength(2);
    node.reorg(2, [[[ev.questProgressed(C, 1, 1)]], []]);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    const fresh = indexerOf(node);
    await settle(fresh);
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
    const dump = indexer.store.dump();
    expect(dump.quests.map((q) => q.quest_id)).toEqual([1]); // 2 was defined in a replaced block, 1 is no longer retired
    expect(dump.quests.every((q) => q.retired_block === null)).toBe(true);
    expect(dump.progress.map((p) => p.player_id)).toContain(padded(C));
    expect(dump.progress.map((p) => p.player_id)).not.toContain(padded(B));
  });

  test("a reorg of the block that closed the day takes the podium with it", async () => {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine([ev.achievementDefined(9, { tasks: [[PODIUM_TASK, 1]] })]);
    node.mine([ev.created(A, 0x41)]);
    node.mine([ev.spawned("daily", 1, A, { tournament: DAY })]);
    node.mine([ev.over("daily", 1, A, 50, { tournament: DAY })]);
    node.views = () => view([[A, 50]]);
    node.time = END + 1;
    node.mine();
    const indexer = indexerOf(node);
    await settle(indexer);
    const check = new CrossCheck(new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }), indexer.store);
    await check.run(indexer.served!);
    expect(indexer.store.dump().podium).toHaveLength(1);
    node.reorg(1, [[]]);
    node.blocks[node.blocks.length - 1]!.timestamp = T0 + 50;
    await settle(indexer);
    expect(indexer.store.dump().podium).toEqual([]);
  });
});

describe("the routes", () => {
  async function served() {
    const { indexer, node } = await open((node) => {
      defineList(node);
      node.mine(finished(A, 1200));
    });
    return { indexer, node };
  }
  const get = (indexer: Awaited<ReturnType<typeof served>>["indexer"], target: string) => respond(indexer, "GET", target);

  test("definitions", async () => {
    const { indexer, node } = await served();
    const answer = get(indexer, "/v1/definitions");
    expect(answer.code).toBe(200);
    expect(answer.body).toMatchObject({
      version: 1,
      status: "ok",
      head: { number: node.tip },
      quests: [{ quest_id: 1 }, { quest_id: 4, tasks: [{ task_id: 3, total: 3000 }] }],
      achievements: [{ achievement_id: 2 }, { achievement_id: 3 }, { achievement_id: 9, points: 50 }],
    });
    expect(get(indexer, "/v1/definitions?x=1").code).toBe(400);
    expect(get(indexer, "/v1/definitions/1").code).toBe(404);
  });

  test("a player's quests of a day, by default the day of the served block", async () => {
    const { indexer } = await served();
    const explicit = get(indexer, `/v1/players/${padded(A)}/quests?day=${DAY}`);
    expect(explicit.code).toBe(200);
    expect(explicit.body).toMatchObject({
      player_id: padded(A),
      day: DAY,
      start_time: T0,
      end_time: END,
      quests: [
        { quest_id: 1, interval_id: DAY, completed: true, retired: false },
        { quest_id: 4, completed: false, tasks: [{ task_id: 3, total: 3000, count: 1200 }] },
      ],
    });
    expect(get(indexer, `/v1/players/${padded(A)}/quests`).body).toMatchObject({ day: DAY });
    expect(get(indexer, `/v1/players/${padded(A)}/quests?day=${DAY + 1}`).body).toMatchObject({
      day: DAY + 1,
      quests: [{ quest_id: 1, interval_id: DAY + 1, completed: false }, { quest_id: 4 }],
    });
  });

  test("a player's achievements", async () => {
    const { indexer } = await served();
    expect(get(indexer, `/v1/players/${padded(A)}/achievements`).body).toMatchObject({
      player_id: padded(A),
      points: 10,
      achievements: [
        { achievement_id: 2, points: 10, completed: true, completed_at: expect.any(Number) },
        { achievement_id: 3, completed: false, completed_at: null, tasks: [{ task_id: 1, total: 10, count: 1 }] },
        { achievement_id: 9, completed: false },
      ],
    });
  });

  test("parameters are checked, numbers are safe integers (P-19)", async () => {
    const { indexer } = await served();
    const p = padded(A);
    expect(get(indexer, `/v1/players/${p}/quests?day=${MAX_TOURNAMENT_ID}`).code).toBe(200);
    for (const bad of ["day=-1", "day=abc", "day=01", `day=${MAX_TOURNAMENT_ID + 1}`, "day=1&day=2", "other=1"]) {
      expect(get(indexer, `/v1/players/${p}/quests?${bad}`).code, bad).toBe(400);
    }
    expect(get(indexer, `/v1/players/0x1/quests`).code).toBe(400);
    expect(get(indexer, `/v1/players/${p}/achievements?day=1`).code).toBe(400);
    const top = get(indexer, `/v1/players/${p}/quests?day=${MAX_TOURNAMENT_ID}`).body as { end_time: number };
    expect(Number.isSafeInteger(top.end_time)).toBe(true);
  });

  test("while the indexer is not ok the new routes answer 503, like the others", async () => {
    const node = new FakeNode();
    const indexer = indexerOf(node);
    expect(get503(indexer, "/v1/definitions")).toBe(503);
    expect(get503(indexer, `/v1/players/${padded(A)}/achievements`)).toBe(503);
  });
});

const get503 = (indexer: ReturnType<typeof indexerOf>, target: string) => respond(indexer, "GET", target).code;
