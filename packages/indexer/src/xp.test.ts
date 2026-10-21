// XP-LEVEL (#641, docs/architecture/xp-level.md): the XP credited by Setup, from the events to the API.
import { describe, expect, test } from "vitest";
import { DecodeError, LEVEL_STEP, MAX_XP, SELECTORS, decode, levelFloor, levelOf, padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const PA = padded(A);
const PB = padded(B);

async function open(build: (node: FakeNode) => void) {
  const node = new FakeNode();
  build(node);
  const indexer = indexerOf(node);
  await settle(indexer);
  return { node, indexer, queries: new Queries(indexer.store), head: node.tip };
}

/** A plays two Challenge games (20 each), wins two Story stars (20) and attacks (25): 85 XP. B plays one game. */
const scenario = (node: FakeNode) => {
  node.mine([ev.xpGained(A, 1, 20, 20, 1)]);
  node.mine([ev.xpGained(A, 1, 20, 40, 1), ev.xpGained(B, 1, 20, 20, 1)]);
  node.mine([ev.xpGained(A, 2, 20, 60, 1)]);
  node.mine([ev.xpGained(A, 3, 25, 85, 1)]);
  node.mine([ev.xpGained(A, 4, 100, 185, 2)]);
};

describe("the curve", () => {
  test("levelOf mirrors Setup's level_of: level L starts at 50 L (L - 1) XP", () => {
    expect(LEVEL_STEP).toBe(100);
    const table: [number, number][] = [[1, 0], [2, 100], [3, 300], [4, 600], [5, 1000], [10, 4500], [20, 19000], [30, 43500]];
    for (const [level, floor] of table) {
      expect(levelFloor(level)).toBe(floor);
      expect(levelOf(floor)).toBe(level);
      if (floor > 0) expect(levelOf(floor - 1)).toBe(level - 1);
    }
    expect(levelOf(MAX_XP)).toBe(1638);
    for (let level = 2; level <= 1638; level++) {
      expect(levelOf(levelFloor(level))).toBe(level);
      expect(levelOf(levelFloor(level) - 1)).toBe(level - 1);
    }
  });
});

describe("XpGained", () => {
  test("the last gain of a player is its XP and level, at any block", async () => {
    const { indexer, queries, head } = await open(scenario);
    expect(queries.playerCobbles(head, PA)).toMatchObject({ xp: 185, level: 2 });
    expect(queries.playerCobbles(head - 1, PA)).toMatchObject({ xp: 85, level: 1 });
    expect(queries.playerCobbles(head, PB)).toMatchObject({ xp: 20, level: 1 });
    expect(queries.playerCobbles(head, padded(0xc3n))).toMatchObject({ xp: 0, level: 1 });
    expect(indexer.store.dump().xp_gains.map((row) => [row.source, row.xp, row.total])).toEqual([
      [1, 20, 20],
      [1, 20, 40],
      [1, 20, 20],
      [2, 20, 60],
      [3, 25, 85],
      [4, 100, 185],
    ]);
  });

  test("the route serves them with the cobbles", async () => {
    const { indexer } = await open(scenario);
    expect(respond(indexer, "GET", `/v1/players/${PA}/cobbles`).body).toMatchObject({ xp: 185, level: 2 });
  });

  test("a gain at the ceiling adds 0 and keeps the total", async () => {
    const { indexer, queries, head } = await open((node) => {
      node.mine([ev.xpGained(A, 3, 100, 100, 2)]);
      node.mine([ev.xpGained(A, 1, 0, 100, 2)]);
    });
    expect(indexer.status).toBe("ok");
    expect(queries.playerCobbles(head, PA)).toMatchObject({ xp: 100, level: 2 });
  });

  test("a total that is not the last total plus the gain halts", async () => {
    const { indexer } = await open((node) => {
      node.mine([ev.xpGained(A, 1, 20, 20, 1)]);
      node.mine([ev.xpGained(A, 1, 20, 50, 1)]);
    });
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/XpGained of .* total 50, the gains before it give 40/);
  });

  test("the decoder refuses a source, a level or a total the contract never emits", () => {
    const xp = (data: number[]) =>
      decode("setup", [SELECTORS.XpGained, "0xa1"], data.map((value) => `0x${value.toString(16)}`));
    expect(xp([1, 20, 20, 1])).toMatchObject({ name: "XpGained", source: 1, xp: 20, total: 20, level: 1 });
    expect(() => xp([0, 20, 20, 1])).toThrow(DecodeError);
    expect(() => xp([5, 20, 20, 1])).toThrow(/source 5/);
    expect(() => xp([1, 20, 20, 2])).toThrow(/level 2, the curve gives 1/);
    expect(() => xp([1, 30, 20, 1])).toThrow(/above the ceiling or the total/);
    expect(() => xp([1, 0, MAX_XP + 1, 1638])).toThrow(/above the ceiling or the total/);
  });

  test("a reorg takes the replaced gains back", async () => {
    const { node, indexer } = await open(scenario);
    node.reorg(2, [[[ev.xpGained(A, 3, 10, 70, 1)]], [[ev.xpGained(A, 4, 5, 75, 1)]]]);
    await settle(indexer);
    const fresh = indexerOf(node);
    await settle(fresh);
    expect(indexer.status).toBe("ok");
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
    expect(new Queries(indexer.store).playerCobbles(node.tip, PA)).toMatchObject({ xp: 75, level: 1 });
  });
});
