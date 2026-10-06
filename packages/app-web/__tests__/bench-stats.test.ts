import { describe, it, expect } from "vitest";
import {
  clicksToMarkdown,
  cpuProfileTable,
  idleWork,
  percentile,
  playEra,
  playRunStats,
  playsToMarkdown,
  runStats,
  summarizeClicks,
  summarizePlays,
  summarizeRuns,
  toMarkdown,
} from "../../../scripts/bench/stats";
import type { ClickRun, PlayRun, RunResult } from "../../../scripts/bench/stats";

const board = (over: Partial<RunResult> = {}): RunResult => ({
  tileCount: 72,
  durationMs: 20000,
  ttiMs: 1400,
  refreshMs: 10,
  rafDeltas: [10, 10, 10, 10, 10, 10, 10, 10, 10, 40],
  cpuMs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  calls: [100, 100, 100, 100, 100, 100, 100, 100, 100, 200],
  triangles: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 2000],
  gpuMs: [2, 4],
  rafFrames: 10,
  renderedFrames: 10,
  heapBytes: { atTti: 2 ** 20, atEnd: 3 * 2 ** 20 },
  info: { geometries: 5, textures: 6, programs: 7 },
  gl: { renderer: "r", vendor: "v", version: "1" },
  page: { innerWidth: 1, innerHeight: 1, devicePixelRatio: 1, canvasWidth: 1, canvasHeight: 1, userAgent: "ua" },
  ...over,
});

describe("percentile", () => {
  it("is the nearest rank", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 95)).toBe(10);
    expect(percentile(xs, 90)).toBe(9);
    expect(percentile(xs, 100)).toBe(10);
  });

  it("takes the first value at 0 and the only value of a single sample", () => {
    expect(percentile([3, 1, 2], 0)).toBe(1);
    expect(percentile([7], 95)).toBe(7);
  });

  it("does not sort its input, and is NaN without samples", () => {
    const xs = [3, 1, 2];
    percentile(xs, 50);
    expect(xs).toEqual([3, 1, 2]);
    expect(percentile([], 50)).toBeNaN();
  });
});

describe("runStats", () => {
  it("counts a frame over 1.5 refresh intervals as dropped", () => {
    const s = runStats(board());
    expect(s.droppedPct).toBe(10); // the 40 ms frame of 10
    expect(s.rafP50).toBe(10);
    expect(s.rafMax).toBe(40);
    expect(s.fps).toBeCloseTo(1000 / 13, 5);
  });

  it("reads CPU, GPU, calls, triangles and heap", () => {
    const s = runStats(board());
    expect(s.cpuP95).toBe(10);
    expect(s.gpuP50).toBe(2);
    expect(s.gpuP95).toBe(4);
    expect(s.calls).toBe(100);
    expect(s.callsMax).toBe(200);
    expect(s.trianglesMin).toBe(1000);
    expect(s.heapTtiMB).toBe(1);
    expect(s.heapEndMB).toBe(3);
  });

  it("has no GPU figure when the timer query is missing", () => {
    expect(runStats(board({ gpuMs: null })).gpuP95).toBeNull();
    expect(runStats(board({ gpuMs: [] })).gpuP50).toBeNull();
    expect(runStats(board({ heapBytes: { atTti: null, atEnd: null } })).heapEndMB).toBeNull();
  });
});

describe("summarizeRuns", () => {
  it("gives the median, min and max over the runs of each figure", () => {
    const runs = [board({ ttiMs: 1000 }), board({ ttiMs: 3000 }), board({ ttiMs: 2000 })];
    const s = summarizeRuns(runs);
    expect(s.runs).toBe(3);
    expect(s.stats.ttiMs).toEqual({ median: 2000, min: 1000, max: 3000 });
    expect(s.tileCount).toBe(72);
  });

  it("leaves a figure out when a run lacks it", () => {
    const s = summarizeRuns([board(), board({ gpuMs: null })]);
    expect(s.stats.gpuP95).toBeNull();
    expect(s.stats.cpuP95).not.toBeNull();
  });
});

describe("toMarkdown", () => {
  it("has one column per size, the profile and n/a for a missing figure", () => {
    const summary = {
      durationMs: 20000,
      runs: 2,
      warmup: 1,
      profile: { name: "throttled" },
      summaries: { 38: summarizeRuns([board({ tileCount: 38, gpuMs: null })]), 72: summarizeRuns([board()]) },
    };
    const md = toMarkdown(summary as any);
    expect(md).toContain("Profile: throttled. Median of 2 measured runs (after 1 warm-up)");
    expect(md).toContain("| Figure | 38 tiles | 72 tiles |");
    expect(md).toMatch(/\| GPU per frame p95 \(ms\) \| n\/a \| 4\.00 \(4\.00–4\.00\) \|/);
  });
});

describe("cpuProfileTable", () => {
  // root -> a -> b; one sample each on b, b, a, idle; 1 ms apart.
  const profile = {
    nodes: [
      { id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: 0, columnNumber: 0 }, children: [2, 4] },
      { id: 2, callFrame: { functionName: "a", url: "http://x/assets/app.js", lineNumber: 4, columnNumber: 0 }, children: [3] },
      { id: 3, callFrame: { functionName: "b", url: "http://x/assets/app.js", lineNumber: 9, columnNumber: 0 } },
      { id: 4, callFrame: { functionName: "(idle)", url: "", lineNumber: 0, columnNumber: 0 } },
    ],
    samples: [3, 3, 2, 4],
    timeDeltas: [1000, 1000, 1000, 1000],
  };

  it("splits self and inclusive time", () => {
    const t = cpuProfileTable(profile);
    expect(t.sampledMs).toBeCloseTo(4);
    expect(t.idleMs).toBeCloseTo(1);
    const b = t.topSelf.find((r) => r.fn.startsWith("b "))!;
    expect(b.selfMs).toBeCloseTo(2);
    const a = t.topInclusive.find((r) => r.fn.startsWith("a "))!;
    expect(a.totalMs).toBeCloseTo(3);
    expect(a.selfMs).toBeCloseTo(1);
    expect(t.topInclusive.some((r) => r.fn.startsWith("(idle)") || r.fn.startsWith("(root)"))).toBe(false);
  });

  it("names a function by the original source when a resolver knows it", () => {
    const t = cpuProfileTable(profile, (_url, line) => `src/file.ts:${line + 1}`);
    expect(t.topSelf[0].fn).toBe("b src/file.ts:10");
  });
});

const click = (profile: string, tileCount: number, presented: number[], over: Partial<ClickRun> = {}): ClickRun => ({
  mode: "click",
  profile,
  tileCount,
  refreshMs: 8.3,
  placements: presented.length + 1,
  samples: presented.map((p, index) => ({ index, handledMs: 1, renderedMs: p - 2, presentedMs: p, ticks: 1 })),
  misses: [presented.length],
  driver: { loadAvg: [2, 2, 2] },
  ...over,
});

describe("summarizeClicks", () => {
  it("pools the placements of the runs of a profile and size, unthrottled before throttled", () => {
    const { groups } = summarizeClicks([
      click("throttled", 72, [100, 120]),
      click("unthrottled", 72, [30, 40]),
      click("unthrottled", 72, [50, 60]),
    ]);
    expect(groups.map((g) => `${g.profile}/${g.tileCount}`)).toEqual(["unthrottled/72", "throttled/72"]);
    const g = groups[0];
    expect(g.runs).toBe(2);
    expect(g.shown).toBe(4);
    expect(g.missed).toBe(2);
    expect(g.placements).toBe(6);
    expect(g.presented).toMatchObject({ n: 4, p50: 40, max: 60 });
    expect(g.presentedP95PerRun).toEqual({ median: 40, min: 40, max: 60 });
  });

  it("writes one column per group", () => {
    const md = clicksToMarkdown(summarizeClicks([click("unthrottled", 38, [30]), click("throttled", 72, [90])]));
    expect(md).toContain("| Figure | unthrottled, 38 tiles | throttled, 72 tiles |");
    expect(md).toContain("| Placements shown / clicked | 1 / 2 (1 runs) | 1 / 2 (1 runs) |");
  });
});

const play = (over: Partial<PlayRun> = {}): PlayRun => ({
  mode: "play",
  profile: "unthrottled",
  tileCount: 72,
  ttiMs: 1500,
  refreshMs: 8.3,
  session: { start: 1000, end: 61000, durationMs: 60000 },
  rafDeltas: [8.3, 8.3, 8.3, 20],
  cpuMs: [1, 2, 3, 4],
  calls: [1],
  triangles: [1],
  commits: [],
  longTasks: [],
  fetches: [],
  inputs: [],
  confirms: [],
  confirmMisses: [],
  heapBytes: { atTti: null, atEnd: null },
  driver: { loadAvg: [1, 1, 1], attempted: 8, applied: 8, mockCalls: [], pageErrors: [] },
  ...over,
});
const commit = (t: number, actualMs = 2) => ({ phase: "update", actualMs, commitTime: t });
const rpc = (start: number) => ({ kind: "rpc", what: "starknet_call", start, end: start + 5 });

describe("idleWork", () => {
  it("counts requests and commits with no input in the 3 s before", () => {
    const r = play({
      inputs: [{ type: "keydown", key: "c", ts: 10000 }],
      fetches: [rpc(500), rpc(11000), rpc(20000), rpc(70000)],
      commits: [commit(11500), commit(25000), commit(80000)],
    });
    // 500 and 70000 are outside the session; 11000 follows an input.
    expect(idleWork(r)).toEqual({ requests: 2, idleRequests: 1, idleCommits: 1 });
  });
});

describe("playRunStats", () => {
  it("reads the session, the long tasks and the commits inside it", () => {
    const r = play({
      longTasks: [
        { start: 500, duration: 900 }, // at load
        { start: 5000, duration: 60 },
        { start: 9000, duration: 100 },
      ],
      commits: [commit(2000, 4), commit(3000, 6), commit(90000, 50)],
    });
    const s = playRunStats(r);
    expect(s.sessionS).toBe(60);
    expect(s.longTasks).toBe(2);
    expect(s.longTaskMs).toBe(160);
    expect(s.longTaskMax).toBe(100);
    expect(s.loadLongTasks).toBe(1);
    expect(s.longTasksPerMin).toBe(2);
    expect(s.commits).toBe(2);
    expect(s.commitMax).toBe(6);
    expect(s.droppedPct).toBe(25);
    expect(s.placements).toBe("8/8");
  });
});

describe("play eras", () => {
  const torii = play({ fetches: [{ kind: "sql", what: "paved-Game", start: 2000, end: 2001 }] });

  it("tells a Torii-era run (SQL fetches) from a native one", () => {
    expect(playEra(torii)).toBe("torii");
    expect(playEra(play({ fetches: [rpc(2000)] }))).toBe("native");
    expect(playEra(play())).toBe("native");
  });

  it("keeps the two eras apart and labels the Torii one", () => {
    const summary = summarizePlays([torii, play({ fetches: [rpc(2000)] }), play()]);
    expect(summary.groups.map((g) => `${g.profile}/${g.era}/${g.runs}`)).toEqual(["unthrottled/native/2", "unthrottled/torii/1"]);
    const md = playsToMarkdown(summary);
    expect(md).toContain("unthrottled (2 runs) | unthrottled, Torii era (1 runs)");
    expect(md).toContain("Torii era: the page polled Torii's SQL endpoint");
  });

  it("has no Torii note for native runs only", () => {
    expect(playsToMarkdown(summarizePlays([play()]))).not.toContain("Torii");
  });
});
