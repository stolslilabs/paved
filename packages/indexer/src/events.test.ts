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
} from "./events.ts";
import { MAX_TOURNAMENT_ID } from "./api.ts";
import { ev } from "./testing/fake-node.ts";

type AbiItem = {
  type: string;
  kind?: string;
  name: string;
  members?: { name: string; type: string; kind: string }[];
};

// TEMP until CORE pushes Challenge.json: the ABI of Challenge is still committed as Daily.json.
const abiPath = (name: string) => resolve(import.meta.dirname, `../../../contracts/abis/${name === "Challenge" ? "Daily" : name}.json`);
const abi = (name: string): AbiItem[] => JSON.parse(readFileSync(abiPath(name), "utf8"));

/** The contract whose ABI declares the quest and achievement events: `Setup` since CORE's step D (D-24). */
const QUESTS = "Setup";
/**
 * The contracts whose ABIs are committed: every event of each is known. The past ones (Tutorial and Lobby with D-21 and
 * D-24, Account with D-25 (E)) have no ABI in the tree any more; their events stay known by name.
 */
const CONTRACTS = ["Challenge", "Setup", "Economy", "Collection"];

/** The event structs of a contract's ABI that `paved::events` declares (the ones the indexer may meet). */
const pavedEvents = (name: string) =>
  abi(name).filter(
    (item) => item.type === "event" && item.kind === "struct" && item.name.startsWith("paved::events::"),
  );

const shortOf = (item: AbiItem) => item.name.split("::").at(-1)!;

describe("the ABIs", () => {
  test("every event of every contract is indexed or ignored, with the selector of its name", () => {
    // Lobby ran inside Challenge and Tutorial by library call: its events came from their addresses. A past contract's events
    // stay known, so that a replay of an old history never halts.
    for (const contract of CONTRACTS) {
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

  test("the keys and data of the game events are the ABI's, in order", () => {
    const shapes = {
      GameSpawned: { keys: ["game_id", "player_id"], data: ["mode", "day_id", "start_time", "price"] },
      GameOver: { keys: ["game_id", "player_id", "day_id"], data: ["mode", "score", "start_time", "end_time"] },
    };
    for (const contract of ["Challenge"]) {
      for (const item of pavedEvents(contract)) {
        const shape = shapes[shortOf(item) as keyof typeof shapes];
        if (!shape) continue;
        expect(item.members!.filter((m) => m.kind === "key").map((m) => m.name)).toEqual(shape.keys);
        expect(item.members!.filter((m) => m.kind === "data").map((m) => m.name)).toEqual(shape.data);
      }
    }
  });

  test("Challenge declares the game events; PlayerCreated is a past event, known by name and skipped (D-25 (E))", () => {
    const names = (contract: string) => pavedEvents(contract).map(shortOf);
    expect(names("Challenge")).toEqual(expect.arrayContaining(["GameSpawned", "GameOver"]));
    expect(EMITTERS.GameSpawned).toEqual(["challenge"]);
    expect(EMITTERS.GameOver).toEqual(["challenge"]);
    expect("PlayerCreated" in EMITTERS).toBe(false);
    expect((IGNORED as readonly string[]).includes("PlayerCreated")).toBe(true);
    expect(SELECTORS.PlayerCreated).toBe(canonical(hash.getSelectorFromName("PlayerCreated")));
    // From any source still read (the game contract's ABI declared it until D-23b), whatever its shape: skipped, never a halt.
    for (const source of ["challenge", "setup", "economy", "collection"] as const) {
      const e = ev.pastCreated(source, 0x1234, 0x416461);
      expect(decode(source, e.keys, e.data), source).toBeNull();
      expect(decode(source, [SELECTORS.PlayerCreated], []), source).toBeNull();
    }
  });

  test("Setup emits the wiring, EconomySet and CollectionSet, with the address in the data (D-25 (E))", () => {
    expect(EMITTERS.EconomySet).toEqual(["setup"]);
    expect(EMITTERS.CollectionSet).toEqual(["setup"]);
    // Setup is the only contract that declares them (Account's ABI left with D-25 (E)).
    const wiring = (contract: string) =>
      abi(contract).filter(
        (item) => item.type === "event" && item.kind === "struct" && ["EconomySet", "CollectionSet"].includes(shortOf(item)),
      );
    expect(CONTRACTS.filter((contract) => wiring(contract).length > 0)).toEqual(["Setup"]);
    for (const contract of ["Setup"]) {
      expect(
        wiring(contract)
          .map((item) => [shortOf(item), item.members!.map((m) => [m.name, m.kind, m.type.split("::").at(-1)])])
          .sort(),
        contract,
      ).toEqual([
        ["CollectionSet", [["collection", "data", "ContractAddress"]]],
        ["EconomySet", [["economy", "data", "ContractAddress"]]],
      ]);
    }
  });
});

describe("the quest and achievement events (quiver 0.2.0)", () => {
  const quiver = (contract: string, name: string) =>
    abi(contract).find((item) => item.type === "event" && item.kind === "struct" && shortOf(item) === name)!;
  const members = (contract: string, name: string, kind: string) =>
    quiver(contract, name).members!.filter((m) => m.kind === kind).map((m) => `${m.name}: ${m.type.split("::").at(-1)}`);

  test("their keys and data are the ABI's, in the order the decoder reads them", () => {
    expect(members(QUESTS, "QuestDefined", "key")).toEqual(["quest_id: u32"]);
    // schedule (start, end, duration, interval), then the tasks span, then the conditions span
    expect(members(QUESTS, "QuestDefined", "data")).toEqual([
      "schedule: QuestSchedule",
      "tasks: QuestTask>",
      "conditions: u32>",
    ]);
    expect(members(QUESTS, "QuestProgressed", "key")).toEqual(["player_id: felt252", "task_id: u32"]);
    expect(members(QUESTS, "QuestProgressed", "data")).toEqual(["count: u32"]);
    expect(members(QUESTS, "QuestRetired", "key")).toEqual(["quest_id: u32"]);
    expect(members(QUESTS, "AchievementDefined", "key")).toEqual(["achievement_id: u32"]);
    expect(members(QUESTS, "AchievementDefined", "data").map((m) => m.split(":")[0])).toEqual(["window", "tasks", "points"]);
    expect(members(QUESTS, "AchievementDefined", "data").at(-1)).toBe("points: u16");
    expect(members(QUESTS, "AchievementProgressed", "key")).toEqual(["player_id: felt252", "task_id: u32"]);
    expect(members(QUESTS, "AchievementProgressed", "data")).toEqual(["count: u32"]);
    expect(members(QUESTS, "AchievementRetired", "key")).toEqual(["achievement_id: u32"]);
    // the structs the decoder flattens: schedule, window, task
    const structs = Object.fromEntries(
      abi(QUESTS)
        .filter((item) => item.type === "struct")
        .map((item) => [item.name.split("::").at(-1), item.members!.map((m) => `${m.name}: ${m.type.split("::").at(-1)}`)]),
    );
    expect(structs.QuestSchedule).toEqual(["start: u64", "end: u64", "duration: u32", "interval: u32"]);
    expect(structs.AchievementWindow).toEqual(["start: u64", "end: u64"]);
    expect(structs.QuestTask).toEqual(["task_id: u32", "total: u32"]);
    expect(structs.AchievementTask).toEqual(["task_id: u32", "total: u32"]);
  });

  test("Setup declares all six and is their only emitter (D-24)", () => {
    for (const name of ["QuestDefined", "QuestProgressed", "QuestRetired", "AchievementDefined", "AchievementProgressed", "AchievementRetired"] as const) {
      expect(quiver(QUESTS, name), name).toBeDefined();
      expect(EMITTERS[name], name).toEqual(["setup"]);
      expect((IGNORED as readonly string[]).includes(name), name).toBe(false);
    }
    // set_reporter emits both reporter events: known, not indexed.
    for (const name of ["QuestReporterSet", "AchievementReporterSet"]) {
      expect((IGNORED as readonly string[]).includes(name), name).toBe(true);
    }
  });

  test("QuestDefined", () => {
    const e = ev.questDefined(4, { start: 172800, end: 0, duration: 86400, interval: 86400, tasks: [[3, 3000]], conditions: [1, 2] });
    expect(decode("setup", e.keys, e.data)).toEqual({
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
    expect(decode("setup", three.keys, three.data)).toMatchObject({ tasks: [{ taskId: 1 }, { taskId: 2 }, { taskId: 3 }] });
  });

  test("progress events", () => {
    const quest = ev.questProgressed(0x1234, 3, 1450);
    expect(decode("setup", quest.keys, quest.data)).toEqual({ name: "QuestProgressed", playerId: 0x1234n, taskId: 3, count: 1450 });
    const e = ev.achievementProgressed(0x1234, 5, 2);
    expect(decode("setup", e.keys, e.data)).toEqual({ name: "AchievementProgressed", playerId: 0x1234n, taskId: 5, count: 2 });
  });

  test("the tutorial claim is Setup's AchievementProgressed of task 10, count 1 (D-21)", () => {
    const claim = ev.tutorialClaimed(0x1234);
    expect(decode("setup", claim.keys, claim.data)).toEqual({ name: "AchievementProgressed", playerId: 0x1234n, taskId: 10, count: 1 });
  });

  test("from Challenge's address the six are past events: skipped, never a halt (P-51 ruling 5)", () => {
    for (const e of [
      ev.questDefined(1, { source: "challenge" }),
      ev.questProgressed(0x1234, 3, 1, "challenge"),
      ev.questRetired(1, "challenge"),
      ev.achievementDefined(1, { source: "challenge" }),
      ev.achievementProgressed(0x1234, 10, 1, "challenge"),
      ev.achievementRetired(1, "challenge"),
    ]) {
      expect(decode("challenge", e.keys, e.data)).toBeNull();
    }
  });

  test("AchievementDefined and the retirements", () => {
    const e = ev.achievementDefined(9, { start: 0, end: 0, tasks: [[8, 1]], points: 50 });
    expect(decode("setup", e.keys, e.data)).toEqual({
      name: "AchievementDefined",
      achievementId: 9,
      start: 0n,
      end: 0n,
      tasks: [{ taskId: 8, total: 1 }],
      points: 50,
    });
    const quest = ev.questRetired(2);
    expect(decode("setup", quest.keys, quest.data)).toEqual({ name: "QuestRetired", questId: 2 });
    const achievement = ev.achievementRetired(3);
    expect(decode("setup", achievement.keys, achievement.data)).toEqual({ name: "AchievementRetired", achievementId: 3 });
  });

  test("a wrong emitter, shape, span length or width is a DecodeError", () => {
    const defined = ev.questDefined(1);
    expect(() => decode("economy", defined.keys, defined.data)).toThrow(DecodeError); // Economy defines nothing
    const quest = ev.questProgressed(1, 1, 1);
    expect(() => decode("economy", quest.keys, quest.data)).toThrow(DecodeError);
    expect(() => decode("collection", quest.keys, quest.data)).toThrow(DecodeError);
    expect(() => decode("setup", quest.keys, [...quest.data, "0x1"])).toThrow(DecodeError);
    expect(() => decode("setup", quest.keys.slice(0, 2), quest.data)).toThrow(DecodeError);
    expect(() => decode("setup", [quest.keys[0]!, quest.keys[1]!, "0x0"], quest.data)).toThrow(DecodeError); // task id 0
    const wide = ev.questProgressed(1, 1, 2 ** 32);
    expect(() => decode("setup", wide.keys, wide.data)).toThrow(DecodeError);
    // spans: a length that does not match the data, no task, too many tasks or conditions
    expect(() => decode("setup", defined.keys, [...defined.data, "0x1"])).toThrow(DecodeError);
    expect(() => decode("setup", defined.keys, defined.data.slice(0, -1))).toThrow(DecodeError);
    const none = ev.questDefined(1, { tasks: [] });
    expect(() => decode("setup", none.keys, none.data)).toThrow(DecodeError);
    const four = ev.questDefined(1, { tasks: [[1, 1], [2, 1], [3, 1], [4, 1]] });
    expect(() => decode("setup", four.keys, four.data)).toThrow(DecodeError);
    const eight = ev.questDefined(1, { conditions: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(() => decode("setup", eight.keys, eight.data)).toThrow(DecodeError);
    const zero = ev.questDefined(1, { tasks: [[0, 1]] });
    expect(() => decode("setup", zero.keys, zero.data)).toThrow(DecodeError);
    const points = ev.achievementDefined(1, { points: 65536 });
    expect(() => decode("setup", points.keys, points.data)).toThrow(DecodeError); // u16
    const above = ev.questDefined(1, { start: 2 ** 60 });
    expect(() => decode("setup", above.keys, above.data)).toThrow(DecodeError); // above 2^53
    const retired = ev.questRetired(1);
    expect(() => decode("setup", retired.keys, ["0x1"])).toThrow(DecodeError);
  });
});

describe("decode", () => {
  test("GameSpawned", () => {
    const e = ev.spawned("challenge", 7, 0x1234, { day: 20733, start: 1791869000, price: 9 });
    expect(decode("challenge", e.keys, e.data)).toEqual({
      name: "GameSpawned",
      gameId: 7,
      playerId: 0x1234n,
      mode: 1,
      dayId: 20733n,
      startTime: 1791869000n,
      price: 9n,
    });
  });

  test("GameOver", () => {
    const e = ev.over("challenge", 55, 0x1234, 64);
    expect(decode("challenge", e.keys, e.data)).toEqual({
      name: "GameOver",
      gameId: 55,
      playerId: 0x1234n,
      dayId: 100n,
      mode: 1,
      score: 64,
      startTime: 1000000n,
      endTime: 1000500n,
    });
    // Only Challenge plays: a game event from Setup is a contract change the indexer was not told about.
    expect(() => decode("setup", e.keys, e.data)).toThrow(DecodeError);
  });

  test("an event that is known and not indexed is skipped", () => {
    const e = ev.built("challenge", 1);
    expect(decode("challenge", e.keys, e.data)).toBeNull();
  });

  test("an unknown selector, a missing key, a wrong count, a wide value, or the wrong contract is a DecodeError", () => {
    expect(() => decode("challenge", ["0x1234"], [])).toThrow(DecodeError);
    expect(() => decode("challenge", [], [])).toThrow(DecodeError);
    const e = ev.spawned("challenge", 7, 1);
    expect(() => decode("challenge", e.keys.slice(0, 2), e.data)).toThrow(DecodeError);
    expect(() => decode("challenge", e.keys, e.data.slice(1))).toThrow(DecodeError);
    expect(() => decode("economy", e.keys, e.data)).toThrow(DecodeError); // Economy does not emit GameSpawned
    const wide = ev.spawned("challenge", 2 ** 32, 1);
    expect(() => decode("challenge", wide.keys, wide.data)).toThrow(DecodeError);
    const widerMode = ev.spawned("challenge", 1, 1, { mode: 256 });
    expect(() => decode("challenge", widerMode.keys, widerMode.data)).toThrow(DecodeError);
    const nofelt = { keys: [e.keys[0]!, "nope", e.keys[2]!], data: e.data };
    expect(() => decode("challenge", nofelt.keys, nofelt.data)).toThrow(DecodeError);
    const tooBig = ev.spawned("challenge", 1, 1, { start: 2 ** 60 });
    expect(() => decode("challenge", tooBig.keys, tooBig.data)).toThrow(DecodeError); // above 2^53
  });
});

describe("the day id bound", () => {
  test("a day id above MAX_TOURNAMENT_ID (the API's bound) is a DecodeError, the bound itself decodes", () => {
    const id = BigInt(MAX_TOURNAMENT_ID);
    const spawned = ev.spawned("challenge", 1, 1, { day: id });
    expect(decode("challenge", spawned.keys, spawned.data)).toMatchObject({ dayId: id });
    const over = ev.over("challenge", 1, 1, 10, { day: id });
    expect(decode("challenge", over.keys, over.data)).toMatchObject({ dayId: id });
    // Below 2^53, so the old check let these through
    const spawnedAbove = ev.spawned("challenge", 1, 1, { day: id + 1n });
    expect(() => decode("challenge", spawnedAbove.keys, spawnedAbove.data)).toThrow(DecodeError);
    const overAbove = ev.over("challenge", 1, 1, 10, { day: id + 1n });
    expect(() => decode("challenge", overAbove.keys, overAbove.data)).toThrow(DecodeError);
  });
});

describe("Economy's events", () => {
  const members = (name: string, kind: string) =>
    abi("Economy")
      .find((item) => item.type === "event" && item.kind === "struct" && shortOf(item) === name)!
      .members!.filter((m) => m.kind === kind)
      .map((m) => `${m.name}: ${m.type.split("::").at(-1)}`);

  test("their keys and data are the ABI's, in the order the decoder reads them", () => {
    expect(members("Purchased", "key")).toEqual(["game_id: u32", "player_id: felt252"]);
    expect(members("Purchased", "data")).toEqual([
      "day: u64",
      "stake: u8",
      "price: u256",
      "referrer: ContractAddress",
      "referral: u256",
      "burned_quote: u256",
      "burned: u256",
      "margin: u256",
      "supply: u256",
      "factor: u32",
      "reference: u128",
    ]);
    expect(members("Recorded", "key")).toEqual(["game_id: u32"]);
    expect(members("Recorded", "data")).toEqual(["score: u32", "expired: bool"]);
    expect(members("DayClosed", "key")).toEqual(["day: u64"]);
    expect(members("DayClosed", "data")).toEqual(["mean: u64", "weight: u32", "prior: u64", "ema_after: u64"]);
    expect(members("Settled", "key")).toEqual(["game_id: u32", "player_id: felt252"]);
    expect(members("Settled", "data")).toEqual(["day: u64", "score: u32", "threshold: u64", "reward: u128"]);
  });

  test("Economy's own variants are not flat: each is named as its struct, whose name is the selector", () => {
    type Enum = AbiItem & { variants: { name: string; type: string; kind: string }[] };
    const enums = abi("Economy").filter((item) => item.type === "event" && item.kind === "enum") as Enum[];
    const event = enums.find((item) => item.name === "paved::systems::economy::Economy::Event")!;
    const own = event.variants.filter((variant) => variant.kind !== "flat");
    for (const variant of own) {
      expect(variant.kind, variant.name).toBe("nested");
      expect(variant.type.split("::").at(-1)).toBe(variant.name);
    }
    expect(own.map((v) => v.name).sort()).toEqual(
      ["DayClosed", "EconomyConfigured", "GameSet", "PoolSet", "Purchased", "Recorded", "RouterSet", "Settled"],
    );
    for (const name of ["Purchased", "Recorded", "DayClosed", "Settled"] as const) expect(EMITTERS[name]).toEqual(["economy"]);
    // The components (P-42): flat, so their events keep their own names as selectors, and every one is ignored.
    const flat = event.variants.filter((variant) => variant.kind === "flat");
    expect(flat.map((v) => v.name).sort()).toEqual(["OwnableEvent", "UpgradeableEvent"]);
    for (const variant of flat) {
      const component = enums.find((item) => item.name === variant.type)!;
      for (const inner of component.variants) {
        expect(inner.kind, inner.name).toBe("nested");
        expect(inner.type.split("::").at(-1)).toBe(inner.name);
        expect((IGNORED as readonly string[]).includes(inner.name), inner.name).toBe(true);
      }
    }
  });

  test("Purchased: u256 amounts from their low and high felts", () => {
    const big = 2n ** 128n + 5n; // a high half of 1
    const e = ev.purchased(7, 0x1234, {
      day: 20733,
      stake: 3,
      referrer: 0xbeef,
      referral: 300_000n,
      burned: big,
      supply: 2n ** 200n,
      factor: 9_876,
      reference: 2n ** 128n - 1n,
    });
    expect(decode("economy", e.keys, e.data)).toEqual({
      name: "Purchased",
      gameId: 7,
      playerId: 0x1234n,
      day: 20733n,
      stake: 3,
      price: 6_000_000n,
      referrer: 0xbeefn,
      referral: 300_000n,
      burnedQuote: 4_200_000n,
      burned: big,
      margin: 1_800_000n,
      supply: 2n ** 200n,
      factor: 9_876,
      reference: 2n ** 128n - 1n,
    });
  });

  test("Recorded, DayClosed and Settled", () => {
    const recorded = ev.recorded(7, 5000, true);
    expect(decode("economy", recorded.keys, recorded.data)).toEqual({ name: "Recorded", gameId: 7, score: 5000, expired: true });
    const live = ev.recorded(8, 0);
    expect(decode("economy", live.keys, live.data)).toMatchObject({ expired: false, score: 0 });
    const closed = ev.dayClosed(20733, { mean: 4_215_689, weight: 21, prior: 3_353_000, emaAfter: 3_500_000 });
    expect(decode("economy", closed.keys, closed.data)).toEqual({
      name: "DayClosed",
      day: 20733n,
      mean: 4_215_689n,
      weight: 21,
      prior: 3_353_000n,
      emaAfter: 3_500_000n,
    });
    const settled = ev.settled(7, 0x1234, { day: 20733, score: 5000, threshold: 4_215_689, reward: 2n ** 100n });
    expect(decode("economy", settled.keys, settled.data)).toEqual({
      name: "Settled",
      gameId: 7,
      playerId: 0x1234n,
      day: 20733n,
      score: 5000,
      threshold: 4_215_689n,
      reward: 2n ** 100n,
    });
  });

  test("the past prize events (D-20) are known by name and skipped, and no ABI declares them any more", () => {
    for (const name of ["Sponsored", "Claimed", "Reclaimed"] as const) {
      expect(name in EMITTERS, name).toBe(false);
      expect((IGNORED as readonly string[]).includes(name), name).toBe(true);
      for (const contract of CONTRACTS) {
        const declared = abi(contract).filter((item) => item.type === "event" && item.kind === "struct").map(shortOf);
        expect(declared, `${contract}.${name}`).not.toContain(name);
      }
    }
    // Their layouts before D-20 (public-interface.md, "Past events"), each from Challenge's address.
    for (const event of [ev.sponsored(20733, 0xabc), ev.claimed(20733, 0x1234, 1), ev.reclaimed(20733, 0xabc)]) {
      expect(decode("challenge", event.keys, event.data)).toBeNull();
    }
  });

  test("the owner events of Economy are known and skipped", () => {
    for (const name of ["EconomyConfigured", "PoolSet", "GameSet", "RouterSet"] as const) {
      expect(decode("economy", [SELECTORS[name]], ["0x1", "0x2"]), name).toBeNull();
    }
  });

  test("Setup's EconomySet carries the address in its data", () => {
    expect(SELECTORS.EconomySet).toBe(canonical(hash.getSelectorFromName("EconomySet")));
    expect(decode("setup", [SELECTORS.EconomySet], ["0x4444"])).toEqual({ name: "EconomySet", economy: 0x4444n });
    expect(() => decode("setup", [SELECTORS.EconomySet], [])).toThrow(DecodeError);
    expect(() => decode("setup", [SELECTORS.EconomySet, "0x1"], ["0x4444"])).toThrow(DecodeError);
    expect(() => decode("economy", [SELECTORS.EconomySet], ["0x4444"])).toThrow(DecodeError);
    expect(() => decode("challenge", [SELECTORS.EconomySet], ["0x4444"])).toThrow(DecodeError);
  });

  test("a wrong emitter, shape, half, bool or day is a DecodeError", () => {
    const e = ev.purchased(1, 1);
    expect(() => decode("challenge", e.keys, e.data)).toThrow(DecodeError); // Challenge does not emit Purchased
    expect(() => decode("economy", e.keys, e.data.slice(1))).toThrow(DecodeError);
    expect(() => decode("economy", e.keys.slice(0, 2), e.data)).toThrow(DecodeError);
    const half = [...e.data];
    half[3] = `0x${(2n ** 128n).toString(16)}`; // price.high wider than u128
    expect(() => decode("economy", e.keys, half)).toThrow(/price.high/);
    const reference = ev.purchased(1, 1, { reference: 2n ** 128n });
    expect(() => decode("economy", reference.keys, reference.data)).toThrow(/reference/);
    const day = ev.purchased(1, 1, { day: MAX_TOURNAMENT_ID + 1 });
    expect(() => decode("economy", day.keys, day.data)).toThrow(/day/);
    const recorded = ev.recorded(1, 1);
    expect(() => decode("economy", recorded.keys, [recorded.data[0]!, "0x2"])).toThrow(/bool/);
    const closed = ev.dayClosed(1, { mean: 2 ** 60 });
    expect(() => decode("economy", closed.keys, closed.data)).toThrow(/above 2\^53/);
    const settled = ev.settled(1, 1);
    expect(() => decode("setup", settled.keys, settled.data)).toThrow(DecodeError);
    expect(() => decode("economy", settled.keys, [...settled.data, "0x0"])).toThrow(DecodeError);
  });
});

describe("Collection's mint", () => {
  test("its Transfer keys are the ABI's: from, to and the token id are all keys, and there is no data", () => {
    const transfer = abi("Collection").find((item) => item.type === "event" && item.kind === "struct" && shortOf(item) === "Transfer")!;
    expect(transfer.members!.map((m) => [m.name, m.kind])).toEqual([
      ["from", "key"],
      ["to", "key"],
      ["token_id", "key"],
    ]);
  });

  test("a Challenge token is the game id; a past Tutorial token (2^32 + the game id) is skipped (D-21)", () => {
    const challenge = ev.minted(0x41, 7);
    expect(decode("collection", challenge.keys, challenge.data)).toEqual({
      name: "Transfer",
      to: 0x41n,
      tokenId: 7,
      contract: "challenge",
      gameId: 7,
    });
    const tutorial = ev.minted(0x41, 2 ** 32 + 7);
    expect(decode("collection", tutorial.keys, tutorial.data)).toBeNull();
    const last = ev.minted(0x41, 2 ** 33 - 1);
    expect(decode("collection", last.keys, last.data)).toBeNull();
    // The largest Challenge id stays a safe integer.
    const top = ev.minted(0x41, 2 ** 32 - 1);
    expect(decode("collection", top.keys, top.data)).toMatchObject({ contract: "challenge", gameId: 2 ** 32 - 1 });
  });

  test("Setup's CollectionSet carries the address in its data", () => {
    expect(decode("setup", [SELECTORS.CollectionSet], ["0x5555"])).toEqual({ name: "CollectionSet", collection: 0x5555n });
    expect(() => decode("setup", [SELECTORS.CollectionSet, "0x7"], [])).toThrow(DecodeError);
    expect(() => decode("collection", [SELECTORS.CollectionSet], ["0x5555"])).toThrow(DecodeError);
  });

  test("a wrong emitter, a transfer that is not a mint, a token of no game, a wide id or a shape is a DecodeError", () => {
    const good = ev.minted(0x41, 7);
    expect(() => decode("challenge", good.keys, good.data)).toThrow(DecodeError);
    const keys = (...rest: string[]) => [SELECTORS.Transfer, ...rest];
    expect(() => decode("collection", keys("0x9", "0x41", "0x7", "0x0"), [])).toThrow(/only mints/);
    expect(() => decode("collection", keys("0x0", "0x41", "0x0", "0x0"), [])).toThrow(/game id 0/);
    expect(() => decode("collection", keys("0x0", "0x41", `0x${(2n ** 33n).toString(16)}`, "0x0"), [])).toThrow(/no game contract/);
    expect(() => decode("collection", keys("0x0", "0x41", "0x7", "0x1"), [])).toThrow(DecodeError);
    expect(() => decode("collection", keys("0x0", "0x41", "0x7"), [])).toThrow(DecodeError);
    expect(() => decode("collection", good.keys, ["0x1"])).toThrow(DecodeError);
  });
});

describe("felts", () => {
  test("canonical and padded", () => {
    expect(canonical("0x00ABc")).toBe("0xabc");
    expect(padded(0xabcn)).toBe(`0x${"0".repeat(61)}abc`);
    expect(padded(0n)).toHaveLength(66);
  });
});
