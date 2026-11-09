import { describe, expect, it } from "vitest";
import TIMES_FILE from "../scripts/wrap-sweep-times.json";
import { dealStories, parseShard, planShards, SLOW_RENDER_S, shardStories, slowStories, timesFromReports, weigh, type Times } from "../scripts/wrap-sweep-shard.ts";

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

  it("reads the times of a sweep's reports in seconds, to a tenth, the longer of two, with the render", () => {
    const times = timesFromReports([
      { timings: [{ story: "b--x", ms: 1234, render: 400 }, { story: "a--y", ms: 49 }] },
      { timings: [{ story: "b--x", ms: 2050, render: 300 }] },
      {},
    ]);
    expect(times).toEqual({ seconds: { "a--y": 0, "b--x": 2.1 }, render: { "a--y": 0, "b--x": 0.4 } });
    expect(Object.keys(times.seconds)).toEqual(["a--y", "b--x"]);
  });

  /** Slow renders: two avatar stories and a new one of the same title; the others are quick. */
  const RENDER: Times = { "avatar--a": 40, "avatar--b": 30, "ui--a": 1, "ui--b": 2, "renderer--x": 3 };
  const IDS = [...Object.keys(RENDER), "avatar--new", "ui--new", ...STORIES];

  it("weighs a new story by the whole file, even in a selection without its timed siblings", () => {
    const file = TIMES_FILE as { seconds: Times; render: Times };
    const alone = ["scenes-avatarcreator--new"];
    const creator = Object.entries(file.seconds).filter(([id]) => id.startsWith("scenes-avatarcreator--")).map(([, t]) => t).sort((a, b) => a - b);
    expect(weigh(alone, file.seconds).get(alone[0])).toBe(creator.length % 2 ? creator[creator.length >> 1] : (creator[(creator.length >> 1) - 1] + creator[creator.length >> 1]) / 2);
    expect(weigh(alone, file.seconds).get(alone[0])).toBeGreaterThan(1);
    expect([...slowStories(alone, file.render)]).toEqual(alone);
    // A title the file lacks: the whole file's median, not 1.
    expect(weigh(["brand-new--story"], { "a--1": 4, "b--1": 6, "c--1": 100 }).get("brand-new--story")).toBe(6);
  });

  it("finds the slow stories by their render, a new one of a slow title included", () => {
    expect([...slowStories(IDS, RENDER)].sort()).toEqual(["avatar--a", "avatar--b", "avatar--new"]);
    expect(slowStories(IDS).size).toBe(0);
    expect(SLOW_RENDER_S).toBe(20);
  });

  for (const [count, slow] of [[12, 6], [4, 1], [3, 2], [2, 1], [5, 0], [3, 3]] as const) {
    it(`puts the slow stories on the first ${slow} of ${count} shards, every story in exactly one`, () => {
      const shards = planShards(IDS, count, slow, TIMES, RENDER);
      expect(shards).toHaveLength(count);
      const all = shards.flat();
      expect(all).toHaveLength(new Set(IDS).size);
      expect(new Set(all)).toEqual(new Set(IDS));
      const slowIds = slowStories(IDS, RENDER);
      if (slow > 0 && slow < count) {
        for (const s of shards.slice(0, slow)) expect(s.every((id) => slowIds.has(id))).toBe(true);
        for (const s of shards.slice(slow)) expect(s.some((id) => slowIds.has(id))).toBe(false);
      } else expect(shards).toEqual(dealStories(IDS, count, TIMES));
      for (let index = 1; index <= count; index++) expect(shardStories(IDS, { index, count }, TIMES, slow, RENDER)).toEqual(shards[index - 1]);
    });
  }

  it("plans the committed file's stories, and new ones, into exactly one shard each, the slow ones on the slow shards", () => {
    const file = TIMES_FILE as { seconds: Times; render: Times };
    const ids = [...Object.keys(file.seconds), "scenes-avatarcreator--new", "new-story--one"];
    const slowIds = slowStories(ids, file.render);
    expect(slowIds.has("scenes-avatarcreator--new")).toBe(true);
    expect(slowIds.size).toBeGreaterThan(50);
    const shards = planShards(ids, 12, 6, file.seconds, file.render);
    expect(new Set(shards.flat())).toEqual(new Set(ids));
    expect(shards.flat()).toHaveLength(ids.length);
    for (const s of shards.slice(0, 6)) expect(s.every((id) => slowIds.has(id))).toBe(true);
  });
});
