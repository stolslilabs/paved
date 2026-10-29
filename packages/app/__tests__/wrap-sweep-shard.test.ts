import { describe, expect, it } from "vitest";
import { parseShard, shardStories } from "../scripts/wrap-sweep-shard.ts";

/** A story list in no particular order, as `index.json` may give it. */
const STORIES = Array.from({ length: 37 }, (_, k) => `title-${(k * 7) % 5}--story-${(k * 13) % 37}`);

describe("wrap sweep shard", () => {
  it("reads i/n", () => {
    expect(parseShard("1/1")).toEqual({ index: 1, count: 1 });
    expect(parseShard("3/4")).toEqual({ index: 3, count: 4 });
    for (const bad of ["0/4", "5/4", "1/0", "2", "a/b", "1/2/3", "-1/2", ""]) expect(() => parseShard(bad)).toThrow(/--shard/);
  });

  for (const count of [1, 2, 4]) {
    it(`puts every story in exactly one of ${count} shard(s)`, () => {
      const shards = Array.from({ length: count }, (_, k) => shardStories(STORIES, { index: k + 1, count }));
      const all = shards.flat();
      expect(all).toHaveLength(STORIES.length);
      expect(new Set(all).size).toBe(STORIES.length);
      expect([...all].sort()).toEqual([...STORIES].sort());
      const sizes = shards.map((s) => s.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    });
  }

  it("does not hang on the input order", () => {
    const reversed = [...STORIES].reverse();
    for (let index = 1; index <= 4; index++) expect(shardStories(reversed, { index, count: 4 })).toEqual(shardStories(STORIES, { index, count: 4 }));
  });

  it("is the whole list for 1/1", () => {
    expect(shardStories(STORIES, { index: 1, count: 1 })).toEqual([...STORIES].sort());
  });
});
