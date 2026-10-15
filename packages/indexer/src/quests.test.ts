import { describe, expect, test } from "vitest";
import { MAX_TOURNAMENT_ID } from "./api.ts";
import { padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { PODIUM_TASK, TUTORIAL_TASK, consistent, firstActive, intervalId, intervalSpan, replay, type Schedule } from "./quests.ts";
import { respond } from "./server.ts";
import { FakeNode, ev, raw } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const C = 0xc3n;
const D = 0xd4n;
const DAY = 100;
const T0 = DAY * 86400; // 00:00 UTC of day 100
const END = T0 + 86400;
// The accepted list (quests.md): tasks 1 GAME_FINISHED, 3 POINTS, ...
const DAILY_RUN = 1;
const POINT_CHASER = 4;

const challenge: Schedule = { start: 0, end: 0, duration: 86400, period: 86400 };

describe("the schedule rules of quiver_quest", () => {
  test("interval_id: None outside the window or the active part, Some(0) for a one-off, (t - start) / interval", () => {
    expect(intervalId(challenge, 0)).toBe(0);
    expect(intervalId(challenge, 86399)).toBe(0);
    expect(intervalId(challenge, 86400)).toBe(1);
    expect(intervalId(challenge, T0 + 5)).toBe(DAY);
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
    expect(firstActive(challenge, T0, END)).toBe(T0);
    expect(firstActive({ ...challenge, start: T0 + 100 }, T0, END)).toBe(T0 + 100);
    expect(firstActive({ ...challenge, start: END }, T0, END)).toBeNull(); // starts after
    expect(firstActive({ ...challenge, end: T0 }, T0, END)).toBeNull(); // ended
    const sparse = { start: 100, end: 0, duration: 10, period: 60 };
    expect(firstActive(sparse, 110, 150)).toBeNull();
    expect(firstActive(sparse, 110, 161)).toBe(160);
    expect(intervalSpan(challenge, DAY)).toEqual({ from: T0, to: END });
    expect(intervalSpan({ start: 5, end: 9, duration: 0, period: 0 }, 0)).toEqual({ from: 5, to: 9 });
  });

  // v2a (quests.md, "As built: v2a"): a rotating daily lasts 1 day in a 3-day interval, `start` offset by 0, 1 or 2 days.
  test("a 3-day interval with a start offset: intervalId and firstActive (v2a rotating dailies)", () => {
    const rotating = (offsetDays: number): Schedule => ({ start: offsetDays * 86400, end: 0, duration: 86400, period: 259200 });
    const [first, second, third] = [rotating(0), rotating(1), rotating(2)];
    // Day number mod 3 picks the live one (2026-10-14 is day 20,740, offset 1).
    for (const [day, live] of [[3, first], [4, second], [5, third], [100, second], [20_740, second]] as const) {
      const live3 = [first, second, third].map((s) => intervalId(s, day * 86400 + 5));
      expect(live3.filter((id) => id !== null)).toHaveLength(1);
      expect(intervalId(live, day * 86400 + 5)).not.toBeNull();
    }
    // The second one (offset 1 day): not live before its start, live on days 1, 4, 7, ...
    expect(intervalId(second, 0)).toBeNull();
    expect(intervalId(second, 86400)).toBe(0);
    expect(intervalId(second, 172799)).toBe(0);
    expect(intervalId(second, 172800)).toBeNull(); // the first second after its day
    expect(intervalId(second, 345599)).toBeNull();
    expect(intervalId(second, 345600)).toBe(1); // day 4
    expect(intervalId(second, 100 * 86400)).toBe(33); // (100 - 1) / 3
    expect(intervalId(third, 172800)).toBe(0);
    expect(intervalId(third, 100 * 86400)).toBeNull();
    expect(intervalSpan(second, 33)).toEqual({ from: 100 * 86400, to: 101 * 86400 });
    // firstActive skips to the next live day, inside the range only.
    expect(firstActive(second, 0, 10 * 86400)).toBe(86400);
    expect(firstActive(second, 172800, 10 * 86400)).toBe(345600);
    expect(firstActive(second, 172800, 345600)).toBeNull(); // the next live second is the range's end
    expect(firstActive(second, 172800, 345601)).toBe(345600);
    expect(firstActive(second, 100 * 86400 + 7, 102 * 86400)).toBe(100 * 86400 + 7); // already live
    expect(firstActive(first, 100 * 86400 + 7, 103 * 86400)).toBe(102 * 86400); // day 100 mod 3 is 1: next at day 102
    expect(firstActive(third, 100 * 86400 + 7, 102 * 86400)).toBe(101 * 86400); // day 101 mod 3 is 2: its day
  });

  // v2a weekly quests: `duration = interval = 604,800`, `start = 345,600` (Monday 1970-01-05 00:00 UTC).
  test("a weekly schedule starting on a Monday (v2a weeklies)", () => {
    const weekly: Schedule = { start: 345600, end: 0, duration: 604800, period: 604800 };
    expect(intervalId(weekly, 0)).toBeNull(); // the epoch is a Thursday: before the first Monday
    expect(intervalId(weekly, 345599)).toBeNull();
    expect(intervalId(weekly, 345600)).toBe(0);
    expect(intervalId(weekly, 345600 + 604799)).toBe(0); // Sunday 23:59:59
    expect(intervalId(weekly, 345600 + 604800)).toBe(1); // the next Monday
    // Day 102 is a Monday (102 mod 7 = 4), day 101 the Sunday before.
    expect(intervalId(weekly, 101 * 86400 + 5)).toBe(13);
    expect(intervalId(weekly, 102 * 86400 + 5)).toBe(14);
    expect(intervalId(weekly, 108 * 86400 + 5)).toBe(14);
    expect(intervalId(weekly, 109 * 86400)).toBe(15);
    expect(intervalSpan(weekly, 14)).toEqual({ from: 102 * 86400, to: 109 * 86400 });
    expect(firstActive(weekly, 0, 10 * 86400)).toBe(345600);
    expect(firstActive(weekly, 0, 345600)).toBeNull();
    expect(firstActive(weekly, 345600 + 3 * 86400, 20 * 86400)).toBe(345600 + 3 * 86400); // mid-week: live
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

/** A finished Challenge game of `player` reported as the contract does: GAME_FINISHED 1, POINTS score; achievements 1 too. */
const finished = (player: bigint, score: number) => [
  ev.questProgressed(player, 1, 1),
  ev.questProgressed(player, 3, score),
  ev.achievementProgressed(player, 1, 1),
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

  test("the tutorial claim credits First Stone: Setup's task 10, an achievement only, never a quest (D-21)", async () => {
    const { queries, head } = await open((node) => {
      defineList(node);
      node.mine([ev.achievementDefined(1, { tasks: [[TUTORIAL_TASK, 1]], points: 10 })]);
      node.mine([ev.tutorialClaimed(A)]);
    });
    expect(queries.playerAchievements(head, padded(A)).achievements.find((a) => a.achievement_id === 1)).toMatchObject({
      completed: true,
      tasks: [{ task_id: TUTORIAL_TASK, count: 1 }],
    });
    expect(queries.playerAchievements(head, padded(A)).points).toBe(10);
    expect(queries.playerQuests(head, padded(A), DAY).every((q) => q.tasks.every((t) => t.count === 0))).toBe(true);
    // Another player who never claimed has not got it.
    expect(queries.playerAchievements(head, padded(B)).achievements.find((a) => a.achievement_id === 1)).toMatchObject({ completed: false });
  });

  // The fresh deployment's schedule (FRESH_QUESTS of scripts/deploy.sh, quests.md "Four dailies a day"): Daily Run (1) is live
  // every day; quests 5 to 13 rotate in three families (structures 2, forests 4, points 3), each lasting one day in a 3-day
  // interval from an offset of 0, 1 or 2 days, so the day number mod 3 picks one per family; the weeklies 14 to 16 start on a
  // Monday (345,600) and last a week. Quests 2 to 4 are not defined. Day 100 is a Saturday (mod 3 = 1), day 102 the Monday after.
  test("playerQuests lists Daily Run and one quest of each family a day, and a weekly on all 7 days of its week (final schedule)", async () => {
    const STRUCTURE = 2;
    const POINTS = 3;
    const FOREST = 4;
    const rotating = (id: number, offsetDays: number, task: number, total: number) =>
      ev.questDefined(id, { start: offsetDays * 86400, duration: 86400, interval: 259200, tasks: [[task, total]] });
    const WEEK = 604800;
    const weekly = (id: number, task: number, total: number) => ev.questDefined(id, { start: 345600, duration: WEEK, interval: WEEK, tasks: [[task, total]] });
    const { queries, head } = await open((node) => {
      node.mine(
        [ev.questDefined(1, { tasks: [[DAILY_RUN, 1]] })],
        [rotating(5, 0, STRUCTURE, 4), rotating(6, 1, STRUCTURE, 8), rotating(7, 2, STRUCTURE, 12)],
        [rotating(8, 0, FOREST, 2), rotating(9, 1, FOREST, 3), rotating(10, 2, FOREST, 4)],
        [rotating(11, 0, POINTS, 2000), rotating(12, 1, POINTS, 5000), rotating(13, 2, POINTS, 8000)],
        [weekly(14, FOREST, 5), weekly(15, STRUCTURE, 30), weekly(16, POINTS, 20000)],
      );
      // Saturday, day 100: quests 6, 9 and 12, and the weeklies' interval 13
      node.mine([ev.questProgressed(A, STRUCTURE, 3), ev.questProgressed(A, FOREST, 1), ev.questProgressed(A, POINTS, 1000)]);
      node.time = (DAY + 2) * 86400 + 10; // Monday, day 102: quests 5, 8 and 11, and the weeklies' interval 14
      node.mine([ev.questProgressed(A, STRUCTURE, 5), ev.questProgressed(A, FOREST, 2), ev.questProgressed(A, POINTS, 2500)]);
      node.time = (DAY + 4) * 86400 + 10; // Wednesday, day 104: quests 7, 10 and 13
      node.mine([ev.questProgressed(A, STRUCTURE, 7)]);
    });
    const ids = (day: number) => queries.playerQuests(head, padded(A), day).map((q) => q.quest_id);
    // four dailies a day, the day number mod 3 picking one per family, then the three weeklies; 2 to 4 are never listed
    expect(ids(DAY)).toEqual([1, 6, 9, 12, 14, 15, 16]); // 100 mod 3 = 1
    expect(ids(DAY + 1)).toEqual([1, 7, 10, 13, 14, 15, 16]); // 2
    expect(ids(DAY + 2)).toEqual([1, 5, 8, 11, 14, 15, 16]); // 0
    expect(ids(DAY + 3)).toEqual([1, 6, 9, 12, 14, 15, 16]);
    for (let day = DAY; day < DAY + 12; day++) {
      const dailies = ids(day).filter((id) => id < 14);
      expect(dailies, `day ${day}`).toHaveLength(4);
      expect(dailies.slice(1).map((id) => (id - 5) % 3), `day ${day}`).toEqual([day % 3, day % 3, day % 3]);
    }
    const quest = (day: number, id: number) => queries.playerQuests(head, padded(A), day).find((q) => q.quest_id === id)!;
    expect(quest(DAY, 6)).toMatchObject({ interval_id: 33, completed: false, tasks: [{ total: 8, count: 3 }] });
    expect(quest(DAY, 9)).toMatchObject({ tasks: [{ task_id: FOREST, total: 3, count: 1 }] });
    expect(quest(DAY, 12)).toMatchObject({ tasks: [{ task_id: POINTS, total: 5000, count: 1000 }] });
    expect(quest(DAY + 1, 7)).toMatchObject({ tasks: [{ total: 12, count: 0 }] }); // nothing reported that day
    expect(quest(DAY + 2, 5)).toMatchObject({ completed: true, tasks: [{ total: 4, count: 4 }] }); // 5 saturates at 4
    expect(quest(DAY + 2, 8)).toMatchObject({ completed: true, tasks: [{ total: 2, count: 2 }] });
    expect(quest(DAY + 2, 11)).toMatchObject({ completed: true, tasks: [{ total: 2000, count: 2000 }] });
    expect(quest(DAY + 4, 7)).toMatchObject({ interval_id: 34, tasks: [{ total: 12, count: 7 }] });
    // the weeklies: interval 13 ends on Sunday, day 101; interval 14 is days 102 to 108 (Monday to Sunday)
    expect(quest(DAY, 15)).toMatchObject({ interval_id: 13, tasks: [{ total: 30, count: 3 }] });
    expect(quest(DAY + 1, 15)).toMatchObject({ interval_id: 13, tasks: [{ count: 3 }] });
    for (let day = DAY + 2; day <= DAY + 8; day++) {
      expect(quest(day, 14), `day ${day}`).toMatchObject({ interval_id: 14, completed: false, tasks: [{ total: 5, count: 2 }] });
      expect(quest(day, 15), `day ${day}`).toMatchObject({ interval_id: 14, completed: false, tasks: [{ total: 30, count: 12 }] });
      expect(quest(day, 16), `day ${day}`).toMatchObject({ interval_id: 14, completed: false, tasks: [{ total: 20000, count: 2500 }] });
    }
    // the next Monday opens interval 15 with nothing counted
    for (const id of [14, 15, 16]) expect(quest(DAY + 9, id)).toMatchObject({ interval_id: 15, tasks: [{ count: 0 }] });
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
      node.mine([ev.achievementProgressed(A, 5, 1)]); // before the window of 1
      node.time = T0 + 250;
      node.mine([ev.achievementProgressed(A, 5, 1)]); // in the window
      // one transaction: a report, the retirement of 2, then a report
      node.mine([ev.achievementProgressed(A, 5, 1), ev.achievementRetired(2), ev.achievementProgressed(A, 5, 1)]);
      node.time = T0 + 300;
      node.mine([ev.achievementProgressed(A, 5, 1)]); // end is exclusive
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
      node.mine([ev.achievementProgressed(A, 5, 4), ev.achievementRetired(1), ev.achievementProgressed(A, 5, 4)]);
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

describe("On the Podium (D-20: from the indexer's own daily leaderboard)", () => {
  /** A day of three players' games, then (with `close`) a block past its end. */
  async function podiumDay(games: [bigint, number][], close = true) {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine([ev.achievementDefined(9, { tasks: [[PODIUM_TASK, 1]], points: 50 })]);
    node.mine([], [], [], []);
    node.mine(...games.map(([player], index) => [ev.spawned("challenge", index + 1, player, { day: DAY })]));
    for (const [index, [player, score]] of games.entries()) node.mine([ev.over("challenge", index + 1, player, score, { day: DAY })]);
    if (close) {
      node.time = END + 5;
      node.mine();
    }
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    return { node, indexer, queries: new Queries(indexer.store), closing: node.tip };
  }

  const credited = (queries: Queries, head: number, player: bigint) =>
    queries.playerAchievements(head, padded(player)).achievements.find((a) => a.achievement_id === 9)!;
  const podium = (indexer: Awaited<ReturnType<typeof podiumDay>>["indexer"]) =>
    indexer.store
      .dump()
      .podium.map((row) => [row.player_id, row.rank])
      .sort((x, y) => Number(x[1]) - Number(y[1]));

  test("the day not yet closed: nothing is credited, whatever the ranking", async () => {
    const { indexer, queries } = await podiumDay([[A, 50], [B, 40], [C, 30]], false);
    expect(indexer.served!.timestamp).toBeLessThan(END);
    expect(indexer.store.dump().podium).toEqual([]);
    expect(credited(queries, indexer.served!.number, A)).toMatchObject({ completed: false, tasks: [{ count: 0 }] });
  });

  test("after the day closes, ranks 1 to 3 of the leaderboard are credited, at the closing block", async () => {
    const { indexer, queries, closing } = await podiumDay([[A, 50], [B, 40], [C, 30], [D, 20]]);
    expect(indexer.store.dump().podium).toEqual([
      { day_id: DAY, player_id: padded(A), rank: 1, day_end: END, close_block: closing },
      { day_id: DAY, player_id: padded(B), rank: 2, day_end: END, close_block: closing },
      { day_id: DAY, player_id: padded(C), rank: 3, day_end: END, close_block: closing },
    ]);
    for (const player of [A, B, C]) {
      expect(credited(queries, closing, player)).toMatchObject({
        completed: true,
        completed_at: END,
        tasks: [{ task_id: PODIUM_TASK, count: 1 }],
      });
    }
    expect(credited(queries, closing, D)).toMatchObject({ completed: false });
    expect(queries.playerAchievements(closing, padded(A)).points).toBe(50);
    // read at a block before the close: not there
    expect(credited(queries, closing - 1, A)).toMatchObject({ completed: false });
    // the podium is the leaderboard's top 3
    expect(queries.leaderboard(closing, DAY, 3, 0).entries.map((e) => [e.player_id, e.rank])).toEqual(podium(indexer));
  });

  test("ties are broken by the chain order of the GameOver, earliest first", async () => {
    // D finishes first with 40, then C, B and A tie with 40 later: D, C, B take the places, A does not.
    const { indexer } = await podiumDay([[D, 40], [C, 40], [B, 40], [A, 40]]);
    expect(podium(indexer)).toEqual([[padded(D), 1], [padded(C), 2], [padded(B), 3]]);
  });

  test("a player with two top games takes one place: three different players", async () => {
    const { indexer } = await podiumDay([[A, 90], [A, 80], [B, 70], [A, 60], [C, 50], [D, 40]]);
    expect(podium(indexer)).toEqual([[padded(A), 1], [padded(B), 2], [padded(C), 3]]);
  });

  test("fewer than three players: only they are credited", async () => {
    const { indexer, queries, closing } = await podiumDay([[B, 60], [B, 55], [A, 10]]);
    expect(podium(indexer)).toEqual([[padded(B), 1], [padded(A), 2]]);
    expect(credited(queries, closing, C)).toMatchObject({ completed: false });
    const empty = await podiumDay([]);
    expect(empty.indexer.store.dump().podium).toEqual([]);
  });

  test("a game that ended after its day counts for no day, and no podium", async () => {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine([]);
    node.mine([ev.spawned("challenge", 1, A, { day: DAY })]);
    node.time = END + 5;
    node.mine([ev.over("challenge", 1, A, 99, { day: 0, end: 0 })]);
    node.mine();
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.store.dump().podium).toEqual([]);
  });

  test("a GameOver in the closing block is not credited: only games over before it count", async () => {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine([], []);
    node.mine([ev.spawned("challenge", 1, A, { day: DAY })], [ev.spawned("challenge", 2, B, { day: DAY })]);
    node.mine([ev.over("challenge", 1, A, 50, { day: DAY })]); // before the close: credited
    node.time = END + 5;
    node.mine([ev.over("challenge", 2, B, 90, { day: DAY })]); // in the closing block: not credited
    node.mine();
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(podium(indexer)).toEqual([[padded(A), 1]]);
  });

  test("a rewind across the day's close forgets the credit; a new closing block credits again", async () => {
    const { node, indexer, queries, closing } = await podiumDay([[A, 50], [B, 40], [C, 30]]);
    expect(indexer.store.dump().podium).toHaveLength(3);
    // the closing block is replaced by one still inside the day: the day is open again
    node.reorg(1, [[]]);
    node.blocks[node.blocks.length - 1]!.timestamp = T0 + 20;
    node.time = T0 + 30;
    await settle(indexer);
    expect(indexer.store.tip()!.number).toBe(closing);
    expect(indexer.store.dump().podium).toEqual([]);
    expect(indexer.store.dump().day_closes).toEqual([]);
    expect(credited(queries, indexer.served!.number, A)).toMatchObject({ completed: false });
    // a game of D ends in the reopened day and takes a place; then the day closes again
    node.mine([ev.spawned("challenge", 9, D, { day: DAY })]);
    node.mine([ev.over("challenge", 9, D, 45, { day: DAY })]);
    node.time = END + 9;
    node.mine();
    await settle(indexer);
    expect(podium(indexer)).toEqual([[padded(A), 1], [padded(D), 2], [padded(B), 3]]);
    const fresh = indexerOf(node);
    await settle(fresh);
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
  });
});

describe("the podium credit is ordered at the day's close", () => {
  test("a live run, step by step, and a rebuild in one batch hold the same rows, with a retirement in the closing block", async () => {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine([ev.achievementDefined(9, { tasks: [[PODIUM_TASK, 1]], points: 50 })]);
    node.mine([]);
    node.mine([ev.spawned("challenge", 1, A, { day: DAY })]);
    node.mine([ev.over("challenge", 1, A, 50, { day: DAY })]);

    const live = indexerOf(node);
    await settle(live);
    node.time = END + 1;
    node.mine([ev.achievementRetired(9)]); // the closing block retires the achievement
    await settle(live);
    node.mine(); // later blocks
    node.mine();
    await settle(live);

    const rebuilt = indexerOf(node);
    await settle(rebuilt);

    expect(rebuilt.store.dump()).toEqual(live.store.dump());
    const closing = node.blocks.findIndex((b) => b.timestamp >= END);
    expect(live.store.dump().podium).toEqual([
      { day_id: DAY, player_id: padded(A), rank: 1, day_end: END, close_block: closing },
    ]);
    // the credit precedes the retirement of the closing block, in both
    for (const subject of [live, rebuilt]) {
      expect(new Queries(subject.store).playerAchievements(subject.served!.number, padded(A)).achievements[0]).toMatchObject({
        retired: true,
        completed: true,
      });
    }
  });

  test("a retirement before the closing block comes before the credit", async () => {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine([ev.achievementDefined(9, { tasks: [[PODIUM_TASK, 1]] })]);
    node.mine([]);
    node.mine([ev.spawned("challenge", 1, A, { day: DAY })]);
    node.mine([ev.over("challenge", 1, A, 50, { day: DAY })]);
    node.mine([ev.achievementRetired(9)]); // still inside the day
    node.time = END + 1;
    node.mine();
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(new Queries(indexer.store).playerAchievements(indexer.served!.number, padded(A)).achievements[0]).toMatchObject({
      retired: true,
      completed: false,
      tasks: [{ count: 0 }],
    });
  });

  test("a reported task 8 is not a podium: only the indexer's leaderboard credits On the Podium", async () => {
    const { queries, head } = await open((node) => {
      node.mine([ev.achievementDefined(9, { tasks: [[PODIUM_TASK, 1]] })]);
      node.mine([ev.achievementProgressed(A, PODIUM_TASK, 1)]);
    });
    expect(queries.playerAchievements(head, padded(A)).achievements[0]).toMatchObject({ completed: false, tasks: [{ count: 0 }] });
  });

  test("the definitions and the progress come from Setup's address (D-24)", async () => {
    const { indexer, queries, head } = await open((node) => {
      defineList(node);
      node.mine(finished(A, 1200));
    });
    const sources = indexer.store.dump().events.map((e) => [String(e.name), String(e.source)]);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter(([name]) => /^(Quest|Achievement)/.test(name!)).every(([, source]) => source === "setup")).toBe(true);
    expect(queries.definitions(head).quests.map((q) => q.quest_id)).toEqual([1, 4]);
    expect(queries.playerQuests(head, padded(A), DAY).find((q) => q.quest_id === 4)).toMatchObject({ tasks: [{ count: 1200 }] });
    expect(queries.playerAchievements(head, padded(A)).achievements.find((a) => a.achievement_id === 2)).toMatchObject({ completed: true });
  });

  test("the same events from Challenge's address are not indexed: skipped, no halt (P-51 ruling 5)", async () => {
    const { indexer, queries, head } = await open((node) => {
      node.mine([ev.questDefined(1, { tasks: [[DAILY_RUN, 1]], source: "challenge" })]);
      node.mine([ev.achievementDefined(2, { tasks: [[1, 1]], points: 10, source: "challenge" })]);
      node.mine([ev.questProgressed(A, 1, 1, "challenge"), ev.achievementProgressed(A, 1, 1, "challenge")]);
      node.mine([ev.questRetired(1, "challenge"), ev.achievementRetired(2, "challenge")]);
    });
    expect(queries.definitions(head)).toEqual({ quests: [], achievements: [] });
    expect(queries.playerAchievements(head, padded(A))).toEqual({ points: 0, achievements: [] });
    expect(indexer.store.dump().events).toEqual([]);
  });

  test("a replay of a history from before D-21, D-24 and D-25 (E) never halts, and keeps only what Setup says", async () => {
    const { indexer, queries, head } = await open((node) => {
      // A past PlayerCreated from a source still read (the game contract's ABI declared it until D-23b): known by name and skipped.
      node.mine([ev.pastCreated("challenge", A, 0x41)]);
      // Challenge's own quests and a Tutorial-era claim credited by Challenge, the owner's Lobby class, a past prize, the mint of a
      // Tutorial game's token: all past, all skipped.
      node.mine([ev.questDefined(7, { source: "challenge" }), ev.achievementDefined(1, { tasks: [[TUTORIAL_TASK, 1]], source: "challenge" })]);
      node.mine([raw("challenge", "LobbyClassSet", [], [0x1234]), ev.sponsored(DAY, 0xabc)]);
      node.mine([ev.achievementProgressed(A, TUTORIAL_TASK, 1, "challenge"), ev.minted(A, 2 ** 32 + 1)]);
      // A Challenge game goes on as before.
      node.mine([ev.spawned("challenge", 1, A, { day: DAY }), ev.minted(A, 1)]);
      // Then Setup: First Stone defined, and A claims.
      node.mine([ev.achievementDefined(1, { tasks: [[TUTORIAL_TASK, 1]], points: 10 })]);
      node.mine([ev.tutorialClaimed(A)]);
    });
    expect(indexer.status).toBe("ok");
    const dump = indexer.store.dump();
    expect(dump.games.map((g) => [g.contract, g.game_id, g.token_id])).toEqual([["challenge", 1, 1]]);
    expect(dump.events.map((e) => e.name)).not.toContain("PlayerCreated");
    // A is a player from its first event read: the spawn (block 5), not the skipped ones before it.
    expect(dump.players.map((p) => [p.player_id, p.created_block])).toEqual([[padded(A), 5]]);
    expect(queries.definitions(head).quests).toEqual([]);
    expect(queries.playerAchievements(head, padded(A))).toMatchObject({ points: 10, achievements: [{ achievement_id: 1, completed: true }] });
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
});

describe("the day's closing block survives the pruning of its header", () => {
  // Blocks 1-4 inside the day, 5 closes it, 6 retires the achievement, 7-9 are empty; with a depth of 2 the first step
  // (one batch) applies all of them, and the floor is then block 7: the closing block is forgotten.
  const CLOSE = 5;
  function chainRun() {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine([ev.achievementDefined(9, { tasks: [[PODIUM_TASK, 1]], points: 50 })]);
    node.mine([]);
    node.mine([ev.spawned("challenge", 1, A, { day: DAY })]);
    node.mine([ev.over("challenge", 1, A, 50, { day: DAY })]);
    node.time = END + 1;
    node.mine();
    node.mine([ev.achievementRetired(9)]);
    for (let i = 0; i < 3; i++) node.mine();
    return { node, indexer: indexerOf(node, 2) };
  }

  test("the credit stays at the closing block once its header is pruned", async () => {
    const { indexer } = chainRun();
    await settle(indexer);
    await settle(indexer);
    expect(indexer.store.lowest()!.number).toBeGreaterThan(CLOSE + 1);
    expect(indexer.store.block(CLOSE)).toBeUndefined();
    expect(indexer.store.dump().podium).toEqual([
      { day_id: DAY, player_id: padded(A), rank: 1, day_end: END, close_block: CLOSE },
    ]);
    // the retirement of block 6 comes after the credit at block 5
    expect(new Queries(indexer.store).playerAchievements(indexer.served!.number, padded(A)).achievements[0]).toMatchObject({
      retired: true,
      completed: true,
    });
  });

  test("a rewind to a fork after the close keeps the credit", async () => {
    const { node, indexer } = chainRun();
    await settle(indexer);
    await settle(indexer);
    const fork = node.tip - 2;
    node.reorg(2, [[], []]);
    await settle(indexer);
    expect(indexer.store.tip()!.number).toBe(node.tip);
    expect(indexer.store.dump().podium).toHaveLength(1); // the close (block 5) is below the fork
    expect(indexer.store.block(fork)).toBeDefined();
  });

  test("the closing block is not recorded twice for a gap of several days, and none before the first block indexed", async () => {
    const node = new FakeNode();
    node.time = T0 + 10;
    node.mine();
    node.time = END + 3 * 86400;
    node.mine();
    node.mine();
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.store.dump().day_closes).toEqual([{ block: 2, prev_time: T0 + 10, time: END + 3 * 86400 }]);
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

describe("inconsistent definitions (P-30)", () => {
  // Made before the contract refused them, or through quiver directly: the indexer must not halt on them.
  const inconsistent = (node: FakeNode) =>
    node.mine(
      [ev.questDefined(1, { tasks: [[DAILY_RUN, 1]] })],
      [ev.questDefined(2, { tasks: [[DAILY_RUN, 0]] })], // a total of 0
      [ev.questDefined(3, { tasks: [[3, 10], [3, 20]] })], // a task id repeated
      [ev.achievementDefined(1, { tasks: [[1, 1]], points: 10 })],
      [ev.achievementDefined(2, { tasks: [[1, 0], [10, 1]], points: 20 })], // a total of 0
      [ev.achievementDefined(3, { tasks: [[1, 1], [1, 1]], points: 30 })], // a task id repeated
    );

  test("are served nowhere, and never as completed without a completion time", async () => {
    const { queries, head } = await open((node) => {
      inconsistent(node);
      node.mine(finished(A, 100));
    });
    const definitions = queries.definitions(head);
    expect(definitions.quests.map((q) => q.quest_id)).toEqual([1]);
    expect(definitions.achievements.map((a) => a.achievement_id)).toEqual([1]);
    expect(queries.playerQuests(head, padded(A), DAY).map((q) => q.quest_id)).toEqual([1]);
    const { achievements, points } = queries.playerAchievements(head, padded(A));
    expect(achievements.map((a) => a.achievement_id)).toEqual([1]);
    expect(points).toBe(10);
    for (const entry of [...queries.playerQuests(head, padded(A), DAY), ...achievements]) {
      expect(entry.completed && entry.completed_at === null).toBe(false);
    }
    expect(queries.excludedDefinitions(head)).toBe(4);
  });

  test("are counted in checks.definitions_excluded of /v1/head, and do not stop the indexer", async () => {
    const { indexer, head } = await open(inconsistent);
    expect(respond(indexer, "GET", "/v1/head").body).toMatchObject({ checks: { definitions_excluded: 4 } });
    // the exclusion is as of the head asked for: nothing defined yet at block 0
    expect(new Queries(indexer.store).excludedDefinitions(head - 1)).toBe(0);
    expect(consistent([{ taskId: 1, total: 1 }])).toBe(true);
  });

  test("a definition with no task is not consistent (it would be complete before any report)", () => {
    expect(consistent([])).toBe(false);
    expect(consistent([{ taskId: 1, total: 1 }, { taskId: 2, total: 3 }])).toBe(true);
  });
});
