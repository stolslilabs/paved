import { describe, expect, it } from "vitest";
import TIMES_FILE from "../scripts/wrap-sweep-times.json";
import { dealStories, parseShard, shardStories, timesFromReports, weigh, type Times } from "../scripts/wrap-sweep-shard.ts";

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

  /** Times for most of STORIES, a few slow ones among them; the last five ids are unknown (new stories). */
  const TIMES: Times = Object.fromEntries(STORIES.slice(0, -5).map((id, k) => [id, k % 9 === 0 ? 40 + k : 1 + (k % 4)]));
  const load = (ids: string[], times: Times, fallback: number) => ids.reduce((sum, id) => sum + (times[id] ?? fallback), 0);

  for (const count of [1, 2, 3, 4, 6, 8, 12, 50]) {
    it(`by time, puts every story in exactly one of ${count} shard(s)`, () => {
      const shards = dealStories(STORIES, count, TIMES);
      expect(shards).toHaveLength(count);
      const all = shards.flat();
      expect(all).toHaveLength(STORIES.length);
      expect([...all].sort()).toEqual([...STORIES].sort());
      for (let index = 1; index <= count; index++) expect(shardStories(STORIES, { index, count }, TIMES)).toEqual(shards[index - 1]);
    });
  }

  it("balances by time: no shard ends more than the longest story above the lightest", () => {
    const shards = dealStories(STORIES, 4, TIMES);
    const known = Object.values(TIMES).sort((a, b) => a - b);
    const median = (known[(known.length >> 1) - 1] + known[known.length >> 1]) / 2;
    const loads = shards.map((s) => load(s, TIMES, median));
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(Math.max(...known));
    // The slow stories spread: no shard holds two of the four slowest while another holds none.
    const slowest = Object.entries(TIMES).sort(([, a], [, b]) => b - a).slice(0, 4).map(([id]) => id);
    for (const s of shards) expect(s.filter((id) => slowest.includes(id))).toHaveLength(1);
  });

  it("weighs a story the times lack as their median", () => {
    // Known 9, 2, 1 (median 2), longest first: a (9) to the first shard; b (2), new (2) and c (1) to the second, lighter.
    expect(dealStories(["a", "b", "c", "new"], 2, { a: 9, b: 2, c: 1 })).toEqual([["a"], ["b", "c", "new"]]);
    // Known 8, 8, 1 (median 8): a and b split, new (8) joins a (a tie, the lower index), c (1) joins b.
    expect(dealStories(["a", "b", "c", "new"], 2, { a: 8, b: 8, c: 1 })).toEqual([["a", "new"], ["b", "c"]]);
  });

  it("weighs a new story of a timed title as that title's median, before the median of all", () => {
    const times = { "3d--a": 60, "3d--b": 80, "ui--a": 1, "ui--b": 2, "ui--c": 3 };
    const w = weigh([...Object.keys(times), "3d--new", "ui--new", "other--new"], times);
    expect([w.get("3d--new"), w.get("ui--new"), w.get("other--new")]).toEqual([70, 2, 3]);
    expect(weigh(["a--x", "b--y"]).get("a--x")).toBe(1);
  });


  it("by time, does not hang on the input order or on duplicates", () => {
    const reversed = [...STORIES].reverse();
    expect(dealStories(reversed, 4, TIMES)).toEqual(dealStories(STORIES, 4, TIMES));
    expect(dealStories([...STORIES, ...STORIES.slice(0, 3)], 4, TIMES)).toEqual(dealStories(STORIES, 4, TIMES));
  });

  it("splits the committed times file's stories, and new ones, into exactly one shard each", () => {
    const file = TIMES_FILE as { seconds: Times };
    const ids = [...Object.keys(file.seconds), "new-story--one", "new-story--two"];
    expect(Object.keys(file.seconds).length).toBeGreaterThan(2000);
    for (const count of [4, 8, 10]) {
      const all = dealStories(ids, count, file.seconds).flat();
      expect(all).toHaveLength(ids.length);
      expect(new Set(all)).toEqual(new Set(ids));
    }
  });

  it("reads the times of a sweep's reports in seconds, to a tenth, the longer of two", () => {
    const times = timesFromReports([
      { timings: [{ story: "b--x", ms: 1234 }, { story: "a--y", ms: 49 }] },
      { timings: [{ story: "b--x", ms: 2050 }] },
      {},
    ]);
    expect(times).toEqual({ "a--y": 0, "b--x": 2.1 });
    expect(Object.keys(times)).toEqual(["a--y", "b--x"]);
  });
});
