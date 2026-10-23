import { describe, expect, it } from "vitest";
import { parseShard, shardOf } from "../scripts/wrap-sweep-shard.ts";

describe("wrap sweep shards", () => {
  it("reads <index>/<count>, and no value is the whole set", () => {
    expect(parseShard("2/4")).toEqual({ index: 2, count: 4 });
    expect(parseShard("1/1")).toEqual({ index: 1, count: 1 });
    expect(parseShard(undefined)).toEqual({ index: 1, count: 1 });
  });

  it("refuses an index outside 1 to count, and any other form", () => {
    for (const value of ["0/4", "5/4", "1/0", "2", "2/4/1", "a/4", " 2/4", "-1/4", ""]) {
      expect(() => parseShard(value), value).toThrow(/--shard/);
    }
  });

  it("puts every story in exactly one shard, the shards a story apart in size at most", () => {
    const queue = Array.from({ length: 1155 }, (_, i) => `story-${i}`);
    const shards = [1, 2, 3, 4].map((index) => shardOf(queue, { index, count: 4 }));
    expect(shards.flat().sort()).toEqual([...queue].sort());
    expect(new Set(shards.flat()).size).toBe(queue.length);
    expect(shards.map((s) => s.length)).toEqual([289, 289, 289, 288]);
  });

  it("keeps the queue's order inside a shard, and 1/1 is the whole queue", () => {
    const queue = ["a", "b", "c", "d", "e"];
    expect(shardOf(queue, { index: 2, count: 2 })).toEqual(["b", "d"]);
    expect(shardOf(queue, { index: 1, count: 1 })).toEqual(queue);
    expect(shardOf(queue, { index: 3, count: 8 })).toEqual(["c"]);
    expect(shardOf(queue, { index: 7, count: 8 })).toEqual([]);
  });
});
