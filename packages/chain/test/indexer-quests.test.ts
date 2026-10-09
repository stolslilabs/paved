// The three P7 routes of the indexer client against the fixture server (the examples of docs/architecture/indexer.md).
import { beforeEach, describe, expect, test } from "vitest";
import { FIXTURE_ADA, FIXTURE_BO, FIXTURE_HEAD, FIXTURE_TOURNAMENT, FixtureIndexer } from "../src/testing";
import { IndexerClient, IndexerError, MAX_TOURNAMENT_ID } from "../src/indexer";

let fixture: FixtureIndexer;
let client: IndexerClient;
beforeEach(() => {
  fixture = new FixtureIndexer();
  client = new IndexerClient({ url: "http://indexer.test/", fetch: fixture.fetch as typeof fetch });
});

const kindOf = async (p: Promise<unknown>) => p.then(() => "none", (e: IndexerError) => e.kind);
const ok = { version: 1, status: "ok", head: FIXTURE_HEAD, behind: 0 };
const raw = (body: object, httpStatus = 200) => {
  fixture.state.rawBody = { text: JSON.stringify({ ...ok, ...body }), httpStatus };
};
const quest = (over: object = {}) => ({ quest_id: 4, interval_id: 20733, completed: false, completed_at: null, retired: false, tasks: [{ task_id: 3, total: 3000, count: 2700 }], ...over });
const achievement = (over: object = {}) => ({ achievement_id: 3, points: 20, completed: false, completed_at: null, retired: false, tasks: [{ task_id: 1, total: 10, count: 1 }], ...over });

describe("/v1/definitions", () => {
  test("the accepted list: four quests and nine achievements, task by task", async () => {
    const { data } = await client.definitions();
    expect(fixture.requests).toEqual(["/v1/definitions"]);
    expect(data.quests.map((q) => q.questId)).toEqual([1, 2, 3, 4]);
    expect(data.quests[3]).toEqual({
      questId: 4, startTime: 0, endTime: 0, duration: 86400, interval: 86400, tasks: [{ taskId: 3, total: 3000 }], conditions: [], definedAt: 1791000000, retired: false, retiredAt: null,
    });
    expect(data.achievements.map((a) => a.achievementId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(data.achievements[8]).toEqual({ achievementId: 9, startTime: 0, endTime: 0, tasks: [{ taskId: 8, total: 1 }], points: 50, definedAt: 1791000000, retired: false, retiredAt: null });
  });

  test("a retired definition carries its time; retired without a time (or a time without retired) is refused", async () => {
    fixture.quests = [{ ...fixture.quests[0], retired: true, retired_at: 1791800000, conditions: [2, 3] }];
    const { data } = await client.definitions();
    expect(data.quests[0]).toMatchObject({ retired: true, retiredAt: 1791800000, conditions: [2, 3] });
    fixture.quests = [{ ...fixture.quests[0], retired: true, retired_at: null }];
    expect(await kindOf(client.definitions())).toBe("bad-response");
    fixture.quests = [{ ...fixture.quests[0], retired: false, retired_at: 5 }];
    expect(await kindOf(client.definitions())).toBe("bad-response");
    fixture.quests = [];
    fixture.achievements = [{ ...fixture.achievements[0], retired: true, retired_at: null }];
    expect(await kindOf(client.definitions())).toBe("bad-response");
  });

  test("no definition yet is an answer, a missing list is not", async () => {
    fixture.quests = [];
    fixture.achievements = [];
    expect((await client.definitions()).data).toEqual({ quests: [], achievements: [] });
    raw({ quests: [] });
    expect(await kindOf(client.definitions())).toBe("bad-response");
    raw({ achievements: [] });
    expect(await kindOf(client.definitions())).toBe("bad-response");
  });

  test("malformed rows are bad-response, nothing is guessed", async () => {
    const def = { ...fixture.quests[0] };
    const withOut = (key: string) => Object.fromEntries(Object.entries(def).filter(([k]) => k !== key));
    for (const key of Object.keys(def)) {
      raw({ quests: [withOut(key)], achievements: [] });
      expect(await kindOf(client.definitions()), `quest.${key} missing`).toBe("bad-response");
    }
    for (const bad of [{ quest_id: "1" }, { quest_id: -1 }, { duration: 1.5 }, { tasks: [] }, { tasks: [{ task_id: 1 }] }, { tasks: "x" }, { conditions: ["1"] }, { conditions: null }, { end_time: 2 ** 53 }]) {
      raw({ quests: [{ ...def, ...bad }], achievements: [] });
      expect(await kindOf(client.definitions()), JSON.stringify(bad)).toBe("bad-response");
    }
    const ach = { ...fixture.achievements[0] };
    for (const bad of [{ points: -1 }, { points: null }, { tasks: [{ task_id: 1, total: -1 }] }]) {
      raw({ quests: [], achievements: [{ ...ach, ...bad }] });
      expect(await kindOf(client.definitions()), JSON.stringify(bad)).toBe("bad-response");
    }
  });
});

describe("/v1/players/{id}/quests", () => {
  test("the doc's example: a completed quest and one at 2,700 of 3,000", async () => {
    const { data, head, behind } = await client.playerQuests(FIXTURE_ADA, { day: FIXTURE_TOURNAMENT });
    expect(fixture.requests).toEqual([`/v1/players/${FIXTURE_ADA}/quests?day=${FIXTURE_TOURNAMENT}`]);
    expect(head).toEqual(FIXTURE_HEAD);
    expect(behind).toBe(0);
    expect(data).toMatchObject({ playerId: FIXTURE_ADA, day: FIXTURE_TOURNAMENT, startTime: FIXTURE_TOURNAMENT * 86400, endTime: (FIXTURE_TOURNAMENT + 1) * 86400 });
    expect(data.quests).toHaveLength(4);
    expect(data.quests[0]).toEqual({ questId: 1, intervalId: FIXTURE_TOURNAMENT, tasks: [{ taskId: 1, total: 1, count: 1 }], completed: true, completedAt: 1791871203, retired: false });
    expect(data.quests[3]).toEqual({ questId: 4, intervalId: FIXTURE_TOURNAMENT, tasks: [{ taskId: 3, total: 3000, count: 2700 }], completed: false, completedAt: null, retired: false });
  });

  test("a player with no progress has zero counts; an unknown player is the same, not an error", async () => {
    const { data } = await client.playerQuests(FIXTURE_BO, { day: FIXTURE_TOURNAMENT });
    expect(data.quests.map((q) => [q.questId, q.completed, q.tasks[0].count])).toEqual([[1, false, 0], [2, false, 0], [3, false, 0], [4, false, 0]]);
    expect((await client.playerQuests(1n, { day: FIXTURE_TOURNAMENT })).data.quests.every((q) => !q.completed)).toBe(true);
  });

  test("a day with no quest is an empty list", async () => {
    const { data } = await client.playerQuests(FIXTURE_ADA, { day: FIXTURE_TOURNAMENT - 100 });
    expect(data).toMatchObject({ day: FIXTURE_TOURNAMENT - 100, quests: [] });
  });

  test("no day asks none: the indexer answers the day of its served block", async () => {
    const { data } = await client.playerQuests(FIXTURE_ADA);
    expect(fixture.requests).toEqual([`/v1/players/${FIXTURE_ADA}/quests`]);
    expect(data.day).toBe(Math.floor(FIXTURE_HEAD.timestamp / 86400));
  });

  test("ids and days are checked before anything is sent", async () => {
    expect(await kindOf(client.playerQuests("nope"))).toBe("rejected");
    expect(await kindOf(client.playerQuests(FIXTURE_ADA, { day: -1 }))).toBe("rejected");
    expect(await kindOf(client.playerQuests(FIXTURE_ADA, { day: 1.5 }))).toBe("rejected");
    expect(await kindOf(client.playerQuests(FIXTURE_ADA, { day: MAX_TOURNAMENT_ID + 1 }))).toBe("rejected");
    expect(fixture.requests).toEqual([]);
    expect((await client.playerQuests(FIXTURE_ADA, { day: MAX_TOURNAMENT_ID })).data.day).toBe(MAX_TOURNAMENT_ID);
  });

  test("a completed quest needs its time and its targets reached, an incomplete one neither", async () => {
    const done = { tasks: [{ task_id: 3, total: 3000, count: 3000 }] };
    raw({ player_id: FIXTURE_ADA, day: 20733, start_time: 0, end_time: 0, quests: [quest({ ...done, completed: true, completed_at: 5 })] });
    expect((await client.playerQuests(FIXTURE_ADA, { day: 20733 })).data.quests[0]).toMatchObject({ completed: true, completedAt: 5 });
    for (const bad of [
      quest({ ...done, completed: true, completed_at: null }), // complete with no time
      quest({ completed: false, completed_at: 5 }), // time on an incomplete one
      quest({ completed: true, completed_at: 5 }), // complete, targets not reached
      quest({ ...done, completed: false, completed_at: null }), // targets reached, not complete
      quest({ tasks: [{ task_id: 3, total: 3000, count: 3001 }] }), // above the target
      quest({ tasks: [{ task_id: 3, total: 3000 }] }), // count missing
      quest({ tasks: [] }),
      quest({ interval_id: "x" }),
      quest({ retired: null }),
    ]) {
      raw({ player_id: FIXTURE_ADA, day: 20733, start_time: 0, end_time: 0, quests: [bad] });
      expect(await kindOf(client.playerQuests(FIXTURE_ADA, { day: 20733 })), JSON.stringify(bad)).toBe("bad-response");
    }
  });

  test("an answer about another player or another day is refused, not shown as the one asked", async () => {
    raw({ player_id: FIXTURE_BO, day: 20733, start_time: 0, end_time: 0, quests: [] });
    expect(await kindOf(client.playerQuests(FIXTURE_ADA, { day: 20733 }))).toBe("bad-response");
    raw({ player_id: FIXTURE_ADA, day: 20734, start_time: 0, end_time: 0, quests: [] });
    expect(await kindOf(client.playerQuests(FIXTURE_ADA, { day: 20733 }))).toBe("bad-response");
  });

  test("a missing key is bad-response", async () => {
    for (const body of [
      { day: 1, start_time: 0, end_time: 0, quests: [] },
      { player_id: FIXTURE_ADA, start_time: 0, end_time: 0, quests: [] },
      { player_id: FIXTURE_ADA, day: 1, end_time: 0, quests: [] },
      { player_id: FIXTURE_ADA, day: 1, start_time: 0, quests: [] },
      { player_id: FIXTURE_ADA, day: 1, start_time: 0, end_time: 0 },
    ]) {
      raw(body);
      expect(await kindOf(client.playerQuests(FIXTURE_ADA)), JSON.stringify(body)).toBe("bad-response");
    }
    raw({ player_id: FIXTURE_ADA, day: 1, start_time: 0, end_time: 0, quests: [{ ...quest(), completed_at: undefined }] });
    expect(await kindOf(client.playerQuests(FIXTURE_ADA))).toBe("bad-response");
  });
});

describe("/v1/players/{id}/achievements", () => {
  test("the doc's example: points of the completed ones and every defined achievement", async () => {
    const { data } = await client.playerAchievements(FIXTURE_ADA);
    expect(fixture.requests).toEqual([`/v1/players/${FIXTURE_ADA}/achievements`]);
    expect(data.playerId).toBe(FIXTURE_ADA);
    expect(data.points).toBe(10);
    expect(data.achievements).toHaveLength(9);
    expect(data.achievements[1]).toEqual({ achievementId: 2, points: 10, tasks: [{ taskId: 1, total: 1, count: 1 }], completed: true, completedAt: 1791871203, retired: false });
    expect(data.achievements[2]).toMatchObject({ achievementId: 3, points: 20, completed: false, completedAt: null, tasks: [{ taskId: 1, total: 10, count: 1 }] });
    expect(data.achievements[8]).toMatchObject({ achievementId: 9, tasks: [{ taskId: 8, total: 1, count: 0 }] });
  });

  test("a player with none, and an unknown player: zero points, nothing completed", async () => {
    for (const id of [FIXTURE_BO, 1n]) {
      const { data } = await client.playerAchievements(id);
      expect(data.points).toBe(0);
      expect(data.achievements.every((a) => !a.completed && a.tasks.every((t) => t.count === 0))).toBe(true);
    }
  });

  test("no achievement defined is an empty list", async () => {
    fixture.achievements = [];
    expect((await client.playerAchievements(FIXTURE_ADA)).data).toEqual({ playerId: FIXTURE_ADA, points: 0, achievements: [] });
  });

  test("malformed rows are bad-response", async () => {
    for (const bad of [
      achievement({ points: undefined }),
      achievement({ points: -5 }),
      achievement({ completed: true, completed_at: null }),
      achievement({ completed: true, completed_at: 9 }), // targets not reached
      achievement({ tasks: [{ task_id: 1, total: 10, count: 11 }] }),
      achievement({ tasks: [] }),
      achievement({ retired: "no" }),
      "x",
    ]) {
      raw({ player_id: FIXTURE_ADA, points: 0, achievements: [bad] });
      expect(await kindOf(client.playerAchievements(FIXTURE_ADA)), JSON.stringify(bad)).toBe("bad-response");
    }
    raw({ player_id: FIXTURE_ADA, achievements: [] });
    expect(await kindOf(client.playerAchievements(FIXTURE_ADA))).toBe("bad-response"); // points missing
    raw({ player_id: FIXTURE_BO, points: 0, achievements: [] });
    expect(await kindOf(client.playerAchievements(FIXTURE_ADA))).toBe("bad-response"); // another player
    expect(await kindOf(client.playerAchievements("nope"))).toBe("rejected");
  });
});

describe("envelope on the new routes", () => {
  const calls = {
    definitions: () => client.definitions(),
    quests: () => client.playerQuests(FIXTURE_ADA, { day: FIXTURE_TOURNAMENT }),
    achievements: () => client.playerAchievements(FIXTURE_ADA),
  };

  test("behind maps into freshness, as for the other routes", async () => {
    fixture.state.behind = 9;
    for (const call of Object.values(calls)) expect((await call()).freshness).toEqual({ kind: "behind", blocks: 9 });
  });

  test("503 states, a wrong version, an unreachable indexer and a refused request", async () => {
    for (const status of ["loading", "rewinding", "halted"] as const) {
      fixture.state.status = status;
      for (const call of Object.values(calls)) {
        const error = (await call().catch((e) => e)) as IndexerError;
        expect(error).toMatchObject({ kind: "unavailable", status });
      }
    }
    fixture.state.status = "ok";
    fixture.state.version = 2;
    for (const call of Object.values(calls)) expect(await kindOf(call())).toBe("wrong-version");
    fixture.state.version = 1;
    fixture.state.down = true;
    for (const call of Object.values(calls)) expect(await kindOf(call())).toBe("unreachable");
    fixture.state.down = false;
    for (const call of Object.values(calls)) {
      raw({ error: "no" }, 400);
      fixture.state.rawBody!.text = JSON.stringify({ version: 1, status: "error", error: "malformed day", state: "ok" });
      fixture.state.rawBody!.httpStatus = 400;
      expect(await kindOf(call())).toBe("rejected");
    }
  });

  test("the fixture refuses what the real indexer refuses: an unknown or repeated parameter, a malformed day", async () => {
    const get = async (path: string) => (await fixture.fetch(`http://indexer.test${path}`)).status;
    expect(await get(`/v1/players/${FIXTURE_ADA}/quests?x=1`)).toBe(400);
    expect(await get(`/v1/players/${FIXTURE_ADA}/quests?day=1&day=2`)).toBe(400);
    expect(await get(`/v1/players/${FIXTURE_ADA}/quests?day=abc`)).toBe(400);
    expect(await get(`/v1/players/${FIXTURE_ADA}/quests?day=${MAX_TOURNAMENT_ID + 1}`)).toBe(400);
    expect(await get(`/v1/players/${FIXTURE_ADA}/achievements?day=1`)).toBe(400);
    expect(await get(`/v1/definitions?x=1`)).toBe(400);
    expect(await get(`/v1/players/0xabc/quests`)).toBe(400);
  });
});
