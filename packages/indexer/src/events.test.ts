import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "starknet";
import { describe, expect, test } from "vitest";
import {
  DecodeError,
  EMITTERS,
  IGNORED,
  SELECTORS,
  canonical,
  decode,
  padded,
  shortString,
} from "./events.ts";
import { MAX_TOURNAMENT_ID } from "./api.ts";
import { ev } from "./testing/fake-node.ts";

type AbiItem = {
  type: string;
  kind?: string;
  name: string;
  members?: { name: string; type: string; kind: string }[];
};

const abi = (name: string): AbiItem[] =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, `../../../contracts/abis/${name}.json`), "utf8"),
  );

/** The event structs of a contract's ABI that `paved::events` declares (the ones the indexer may meet). */
const pavedEvents = (name: string) =>
  abi(name).filter(
    (item) => item.type === "event" && item.kind === "struct" && item.name.startsWith("paved::events::"),
  );

const shortOf = (item: AbiItem) => item.name.split("::").at(-1)!;

describe("the ABIs", () => {
  test("every event of every contract is indexed or ignored, with the selector of its name", () => {
    for (const contract of ["Daily", "Tutorial", "Account"]) {
      const items = abi(contract).filter((item) => item.type === "event" && item.kind === "struct");
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const name = shortOf(item);
        const known = name in EMITTERS || (IGNORED as readonly string[]).includes(name);
        expect(known, `${contract}.${name}`).toBe(true);
        expect(SELECTORS[name as keyof typeof SELECTORS]).toBe(canonical(hash.getSelectorFromName(name)));
      }
    }
  });

  test("the keys and data of the three events are the ABI's, in order", () => {
    const shapes = {
      GameSpawned: { keys: ["game_id", "player_id"], data: ["mode", "tournament_id", "start_time", "price"] },
      GameOver: { keys: ["game_id", "player_id", "tournament_id"], data: ["mode", "score", "start_time", "end_time"] },
      PlayerCreated: { keys: ["player_id"], data: ["name", "master"] },
    };
    for (const contract of ["Daily", "Tutorial", "Account"]) {
      for (const item of pavedEvents(contract)) {
        const shape = shapes[shortOf(item) as keyof typeof shapes];
        if (!shape) continue;
        expect(item.members!.filter((m) => m.kind === "key").map((m) => m.name)).toEqual(shape.keys);
        expect(item.members!.filter((m) => m.kind === "data").map((m) => m.name)).toEqual(shape.data);
      }
    }
  });

  test("Daily and Tutorial declare the game events, Account the player event", () => {
    const names = (contract: string) => pavedEvents(contract).map(shortOf);
    for (const contract of ["Daily", "Tutorial", "Account"]) {
      expect(names(contract)).toEqual(expect.arrayContaining(["GameSpawned", "GameOver", "PlayerCreated"]));
    }
    expect(EMITTERS.PlayerCreated).toEqual(["account"]);
  });
});

describe("the quest and achievement events (quiver 0.2.0)", () => {
  const quiver = (contract: string, name: string) =>
    abi(contract).find((item) => item.type === "event" && item.kind === "struct" && shortOf(item) === name)!;
  const members = (contract: string, name: string, kind: string) =>
    quiver(contract, name).members!.filter((m) => m.kind === kind).map((m) => `${m.name}: ${m.type.split("::").at(-1)}`);

  test("their keys and data are the ABI's, in the order the decoder reads them", () => {
    expect(members("Daily", "QuestDefined", "key")).toEqual(["quest_id: u32"]);
    // schedule (start, end, duration, interval), then the tasks span, then the conditions span
    expect(members("Daily", "QuestDefined", "data")).toEqual([
      "schedule: QuestSchedule",
      "tasks: QuestTask>",
      "conditions: u32>",
    ]);
    expect(members("Daily", "QuestProgressed", "key")).toEqual(["player_id: felt252", "task_id: u32"]);
    expect(members("Daily", "QuestProgressed", "data")).toEqual(["count: u32"]);
    expect(members("Daily", "QuestRetired", "key")).toEqual(["quest_id: u32"]);
    expect(members("Daily", "AchievementDefined", "key")).toEqual(["achievement_id: u32"]);
    expect(members("Daily", "AchievementDefined", "data").map((m) => m.split(":")[0])).toEqual(["window", "tasks", "points"]);
    expect(members("Daily", "AchievementDefined", "data").at(-1)).toBe("points: u16");
    expect(members("Daily", "AchievementProgressed", "key")).toEqual(["player_id: felt252", "task_id: u32"]);
    expect(members("Daily", "AchievementProgressed", "data")).toEqual(["count: u32"]);
    expect(members("Daily", "AchievementRetired", "key")).toEqual(["achievement_id: u32"]);
    // the structs the decoder flattens: schedule, window, task
    const structs = Object.fromEntries(
      abi("Daily")
        .filter((item) => item.type === "struct")
        .map((item) => [item.name.split("::").at(-1), item.members!.map((m) => `${m.name}: ${m.type.split("::").at(-1)}`)]),
    );
    expect(structs.QuestSchedule).toEqual(["start: u64", "end: u64", "duration: u32", "interval: u32"]);
    expect(structs.AchievementWindow).toEqual(["start: u64", "end: u64"]);
    expect(structs.QuestTask).toEqual(["task_id: u32", "total: u32"]);
    expect(structs.AchievementTask).toEqual(["task_id: u32", "total: u32"]);
  });

  test("Daily declares all six, Tutorial the achievement ones it can emit", () => {
    for (const name of ["QuestDefined", "QuestProgressed", "QuestRetired", "AchievementDefined", "AchievementProgressed", "AchievementRetired"]) {
      expect(quiver("Daily", name), name).toBeDefined();
      expect(name in EMITTERS, name).toBe(true);
      expect((IGNORED as readonly string[]).includes(name), name).toBe(false);
    }
    expect(EMITTERS.AchievementProgressed).toEqual(["daily", "tutorial"]);
    expect(EMITTERS.QuestProgressed).toEqual(["daily"]);
    expect(abi("Tutorial").some((item) => item.type === "event" && shortOf(item) === "AchievementProgressed")).toBe(true);
  });

  test("QuestDefined", () => {
    const e = ev.questDefined(4, { start: 172800, end: 0, duration: 86400, interval: 86400, tasks: [[3, 3000]], conditions: [1, 2] });
    expect(decode("daily", e.keys, e.data)).toEqual({
      name: "QuestDefined",
      questId: 4,
      start: 172800n,
      end: 0n,
      duration: 86400,
      interval: 86400,
      tasks: [{ taskId: 3, total: 3000 }],
      conditions: [1, 2],
    });
    const three = ev.questDefined(1, { tasks: [[1, 1], [2, 2], [3, 3]] });
    expect(decode("daily", three.keys, three.data)).toMatchObject({ tasks: [{ taskId: 1 }, { taskId: 2 }, { taskId: 3 }] });
  });

  test("progress events", () => {
    const quest = ev.questProgressed(0x1234, 3, 1450);
    expect(decode("daily", quest.keys, quest.data)).toEqual({ name: "QuestProgressed", playerId: 0x1234n, taskId: 3, count: 1450 });
    for (const source of ["daily", "tutorial"] as const) {
      const e = ev.achievementProgressed(source, 0x1234, 10, 1);
      expect(decode(source, e.keys, e.data)).toEqual({ name: "AchievementProgressed", playerId: 0x1234n, taskId: 10, count: 1 });
    }
  });

  test("AchievementDefined and the retirements", () => {
    const e = ev.achievementDefined(9, { start: 0, end: 0, tasks: [[8, 1]], points: 50 });
    expect(decode("daily", e.keys, e.data)).toEqual({
      name: "AchievementDefined",
      achievementId: 9,
      start: 0n,
      end: 0n,
      tasks: [{ taskId: 8, total: 1 }],
      points: 50,
    });
    const quest = ev.questRetired(2);
    expect(decode("daily", quest.keys, quest.data)).toEqual({ name: "QuestRetired", questId: 2 });
    const achievement = ev.achievementRetired(3);
    expect(decode("daily", achievement.keys, achievement.data)).toEqual({ name: "AchievementRetired", achievementId: 3 });
  });

  test("a wrong emitter, shape, span length or width is a DecodeError", () => {
    const defined = ev.questDefined(1);
    expect(() => decode("tutorial", defined.keys, defined.data)).toThrow(DecodeError); // Tutorial defines nothing
    const quest = ev.questProgressed(1, 1, 1);
    expect(() => decode("tutorial", quest.keys, quest.data)).toThrow(DecodeError); // no quest component in Tutorial
    expect(() => decode("account", quest.keys, quest.data)).toThrow(DecodeError);
    expect(() => decode("daily", quest.keys, [...quest.data, "0x1"])).toThrow(DecodeError);
    expect(() => decode("daily", quest.keys.slice(0, 2), quest.data)).toThrow(DecodeError);
    expect(() => decode("daily", [quest.keys[0]!, quest.keys[1]!, "0x0"], quest.data)).toThrow(DecodeError); // task id 0
    const wide = ev.questProgressed(1, 1, 2 ** 32);
    expect(() => decode("daily", wide.keys, wide.data)).toThrow(DecodeError);
    // spans: a length that does not match the data, no task, too many tasks or conditions
    expect(() => decode("daily", defined.keys, [...defined.data, "0x1"])).toThrow(DecodeError);
    expect(() => decode("daily", defined.keys, defined.data.slice(0, -1))).toThrow(DecodeError);
    const none = ev.questDefined(1, { tasks: [] });
    expect(() => decode("daily", none.keys, none.data)).toThrow(DecodeError);
    const four = ev.questDefined(1, { tasks: [[1, 1], [2, 1], [3, 1], [4, 1]] });
    expect(() => decode("daily", four.keys, four.data)).toThrow(DecodeError);
    const eight = ev.questDefined(1, { conditions: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(() => decode("daily", eight.keys, eight.data)).toThrow(DecodeError);
    const zero = ev.questDefined(1, { tasks: [[0, 1]] });
    expect(() => decode("daily", zero.keys, zero.data)).toThrow(DecodeError);
    const points = ev.achievementDefined(1, { points: 65536 });
    expect(() => decode("daily", points.keys, points.data)).toThrow(DecodeError); // u16
    const above = ev.questDefined(1, { start: 2 ** 60 });
    expect(() => decode("daily", above.keys, above.data)).toThrow(DecodeError); // above 2^53
    const retired = ev.questRetired(1);
    expect(() => decode("daily", retired.keys, ["0x1"])).toThrow(DecodeError);
  });
});

describe("decode", () => {
  test("GameSpawned", () => {
    const e = ev.spawned("daily", 7, 0x1234, { tournament: 20733, start: 1791869000, price: 9 });
    expect(decode("daily", e.keys, e.data)).toEqual({
      name: "GameSpawned",
      gameId: 7,
      playerId: 0x1234n,
      mode: 1,
      tournamentId: 20733n,
      startTime: 1791869000n,
      price: 9n,
    });
  });

  test("GameOver, a Tutorial one with tournament 0", () => {
    const e = ev.over("tutorial", 55, 0x1234, 64);
    expect(decode("tutorial", e.keys, e.data)).toEqual({
      name: "GameOver",
      gameId: 55,
      playerId: 0x1234n,
      tournamentId: 0n,
      mode: 3,
      score: 64,
      startTime: 1000000n,
      endTime: 0n,
    });
  });

  test("PlayerCreated", () => {
    const e = ev.created(0x1234, 0x416461, 0xdead);
    expect(decode("account", e.keys, e.data)).toEqual({
      name: "PlayerCreated",
      playerId: 0x1234n,
      displayName: 0x416461n,
      master: 0xdeadn,
    });
  });

  test("an event that is known and not indexed is skipped", () => {
    const e = ev.built("daily", 1);
    expect(decode("daily", e.keys, e.data)).toBeNull();
  });

  test("an unknown selector, a missing key, a wrong count, a wide value, or the wrong contract is a DecodeError", () => {
    expect(() => decode("daily", ["0x1234"], [])).toThrow(DecodeError);
    expect(() => decode("daily", [], [])).toThrow(DecodeError);
    const e = ev.spawned("daily", 7, 1);
    expect(() => decode("daily", e.keys.slice(0, 2), e.data)).toThrow(DecodeError);
    expect(() => decode("daily", e.keys, e.data.slice(1))).toThrow(DecodeError);
    expect(() => decode("account", e.keys, e.data)).toThrow(DecodeError); // Account does not emit GameSpawned
    const wide = ev.spawned("daily", 2 ** 32, 1);
    expect(() => decode("daily", wide.keys, wide.data)).toThrow(DecodeError);
    const widerMode = ev.spawned("daily", 1, 1, { mode: 256 });
    expect(() => decode("daily", widerMode.keys, widerMode.data)).toThrow(DecodeError);
    const nofelt = { keys: [e.keys[0]!, "nope", e.keys[2]!], data: e.data };
    expect(() => decode("daily", nofelt.keys, nofelt.data)).toThrow(DecodeError);
    const tooBig = ev.spawned("daily", 1, 1, { start: 2 ** 60 });
    expect(() => decode("daily", tooBig.keys, tooBig.data)).toThrow(DecodeError); // above 2^53
  });
});

describe("the tournament id bound", () => {
  test("a tournament id above MAX_TOURNAMENT_ID (the API's bound) is a DecodeError, the bound itself decodes", () => {
    const id = BigInt(MAX_TOURNAMENT_ID);
    const spawned = ev.spawned("daily", 1, 1, { tournament: id });
    expect(decode("daily", spawned.keys, spawned.data)).toMatchObject({ tournamentId: id });
    const over = ev.over("daily", 1, 1, 10, { tournament: id });
    expect(decode("daily", over.keys, over.data)).toMatchObject({ tournamentId: id });
    // Below 2^53, so the old check let these through
    const spawnedAbove = ev.spawned("daily", 1, 1, { tournament: id + 1n });
    expect(() => decode("daily", spawnedAbove.keys, spawnedAbove.data)).toThrow(DecodeError);
    const overAbove = ev.over("daily", 1, 1, 10, { tournament: id + 1n });
    expect(() => decode("daily", overAbove.keys, overAbove.data)).toThrow(DecodeError);
  });
});

describe("felts and names", () => {
  test("canonical and padded", () => {
    expect(canonical("0x00ABc")).toBe("0xabc");
    expect(padded(0xabcn)).toBe(`0x${"0".repeat(61)}abc`);
    expect(padded(0n)).toHaveLength(66);
  });

  test("a short string decodes, or is null", () => {
    expect(shortString(0x416461n)).toBe("Ada");
    expect(shortString(0n)).toBeNull();
    expect(shortString(0xffn)).toBeNull(); // not UTF-8
    expect(shortString(0x0141n)).toBeNull(); // a control character
    expect(shortString(BigInt(`0x${Buffer.from("héllo", "utf8").toString("hex")}`))).toBe("héllo");
  });
});
