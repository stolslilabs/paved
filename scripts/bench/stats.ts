// Statistics of the frame-time bench: percentiles, per-run and across-run summaries, the
// markdown table, and the CPU-profile aggregation.

export interface RunResult {
  tileCount: number;
  durationMs: number;
  ttiMs: number;
  refreshMs: number;
  rafDeltas: number[];
  cpuMs: number[];
  calls: number[];
  triangles: number[];
  gpuMs: number[] | null;
  rafFrames: number;
  renderedFrames: number;
  heapBytes: { atTti: number | null; atEnd: number | null };
  info: { geometries: number; textures: number; programs: number };
  gl: { renderer: string; vendor: string; version: string };
  page: {
    innerWidth: number;
    innerHeight: number;
    devicePixelRatio: number;
    canvasWidth: number;
    canvasHeight: number;
    userAgent: string;
  };
}

/** Nearest-rank percentile, p in 0..100. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[Math.min(rank, s.length) - 1];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export interface Spread {
  median: number;
  min: number;
  max: number;
}

const spread = (xs: number[]): Spread => ({
  median: percentile(xs, 50),
  min: Math.min(...xs),
  max: Math.max(...xs),
});

export interface RunStats {
  refreshMs: number;
  rafP50: number;
  rafP95: number;
  rafP99: number;
  rafMax: number;
  fps: number;
  /** Frames whose interval was more than 1.5 refresh intervals. */
  droppedPct: number;
  cpuP50: number;
  cpuP95: number;
  cpuP99: number;
  gpuP50: number | null;
  gpuP95: number | null;
  /** Draw calls and triangles of the median frame, and the spread over the frames of the run. */
  calls: number;
  callsP95: number;
  callsMin: number;
  callsMax: number;
  triangles: number;
  trianglesP95: number;
  trianglesMin: number;
  trianglesMax: number;
  ttiMs: number;
  heapTtiMB: number | null;
  heapEndMB: number | null;
  rendered: number;
  raf: number;
}

export function runStats(r: RunResult): RunStats {
  const mb = (b: number | null) => (b === null ? null : b / 2 ** 20);
  const dropped = r.rafDeltas.filter((d) => d > 1.5 * r.refreshMs).length;
  return {
    refreshMs: r.refreshMs,
    rafP50: percentile(r.rafDeltas, 50),
    rafP95: percentile(r.rafDeltas, 95),
    rafP99: percentile(r.rafDeltas, 99),
    rafMax: Math.max(...r.rafDeltas),
    fps: 1000 / mean(r.rafDeltas),
    droppedPct: (100 * dropped) / r.rafDeltas.length,
    cpuP50: percentile(r.cpuMs, 50),
    cpuP95: percentile(r.cpuMs, 95),
    cpuP99: percentile(r.cpuMs, 99),
    gpuP50: r.gpuMs && r.gpuMs.length ? percentile(r.gpuMs, 50) : null,
    gpuP95: r.gpuMs && r.gpuMs.length ? percentile(r.gpuMs, 95) : null,
    calls: percentile(r.calls, 50),
    callsP95: percentile(r.calls, 95),
    callsMin: Math.min(...r.calls),
    callsMax: Math.max(...r.calls),
    triangles: percentile(r.triangles, 50),
    trianglesP95: percentile(r.triangles, 95),
    trianglesMin: Math.min(...r.triangles),
    trianglesMax: Math.max(...r.triangles),
    ttiMs: r.ttiMs,
    heapTtiMB: mb(r.heapBytes.atTti),
    heapEndMB: mb(r.heapBytes.atEnd),
    rendered: r.renderedFrames,
    raf: r.rafFrames,
  };
}

export interface BoardSummary {
  tileCount: number;
  runs: number;
  perRun: RunStats[];
  /** Median of each per-run figure, with the min and max over the runs. */
  stats: Record<keyof RunStats, Spread | null>;
  gl: RunResult["gl"];
  page: RunResult["page"];
  info: RunResult["info"];
}

export function summarizeRuns(results: RunResult[]): BoardSummary {
  const perRun = results.map(runStats);
  const keys = Object.keys(perRun[0]) as Array<keyof RunStats>;
  const stats = {} as BoardSummary["stats"];
  for (const k of keys) {
    const xs = perRun.map((r) => r[k]).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    stats[k] = xs.length === perRun.length ? spread(xs) : null;
  }
  return {
    tileCount: results[0].tileCount,
    runs: results.length,
    perRun,
    stats,
    gl: results[0].gl,
    page: results[0].page,
    info: results[results.length - 1].info,
  };
}

const f = (s: Spread | null, digits = 2, unit = ""): string =>
  s === null
    ? "n/a"
    : `${s.median.toFixed(digits)}${unit} (${s.min.toFixed(digits)}–${s.max.toFixed(digits)})`;

/** Lowest minimum and highest maximum over the runs. */
const range = (lo: Spread | null, hi: Spread | null, digits: number): string =>
  lo === null || hi === null ? "n/a" : `${lo.min.toFixed(digits)}–${hi.max.toFixed(digits)}`;

interface Summary {
  durationMs: number;
  runs: number;
  warmup: number;
  summaries: Record<string, BoardSummary>;
}

export function toMarkdown(summary: Summary): string {
  const sizes = Object.keys(summary.summaries);
  const rows: Array<[string, (b: BoardSummary) => string]> = [
    ["Frame interval p50 (ms)", (b) => f(b.stats.rafP50)],
    ["Frame interval p95 (ms)", (b) => f(b.stats.rafP95)],
    ["Frame interval p99 (ms)", (b) => f(b.stats.rafP99)],
    ["Frame interval max (ms)", (b) => f(b.stats.rafMax)],
    ["Frames per second (mean)", (b) => f(b.stats.fps, 1)],
    ["Frames over 1.5 refresh intervals (%)", (b) => f(b.stats.droppedPct, 1)],
    ["CPU per frame p50 (ms)", (b) => f(b.stats.cpuP50)],
    ["CPU per frame p95 (ms)", (b) => f(b.stats.cpuP95)],
    ["CPU per frame p99 (ms)", (b) => f(b.stats.cpuP99)],
    ["GPU per frame p50 (ms)", (b) => f(b.stats.gpuP50)],
    ["GPU per frame p95 (ms)", (b) => f(b.stats.gpuP95)],
    ["Draw calls, median frame (all passes)", (b) => f(b.stats.calls, 0)],
    ["Draw calls, p95 frame", (b) => f(b.stats.callsP95, 0)],
    ["Draw calls, min–max over frames", (b) => range(b.stats.callsMin, b.stats.callsMax, 0)],
    ["Triangles, median frame (all passes)", (b) => f(b.stats.triangles, 0)],
    ["Triangles, p95 frame", (b) => f(b.stats.trianglesP95, 0)],
    ["Triangles, min–max over frames", (b) => range(b.stats.trianglesMin, b.stats.trianglesMax, 0)],
    ["Time to interactive (ms)", (b) => f(b.stats.ttiMs, 0)],
    ["JS heap at interactive (MB)", (b) => f(b.stats.heapTtiMB, 1)],
    ["JS heap at end of path (MB)", (b) => f(b.stats.heapEndMB, 1)],
    ["Rendered frames / rAF frames (median run)", (b) => `${b.stats.rendered?.median ?? "n/a"} / ${b.stats.raf?.median ?? "n/a"}`],
  ];
  const head = `| Figure | ${sizes.map((s) => `${s} tiles`).join(" | ")} |\n|---|${sizes.map(() => "---").join("|")}|\n`;
  const body = rows.map(([name, fn]) => `| ${name} | ${sizes.map((s) => fn(summary.summaries[s])).join(" | ")} |`).join("\n");
  const first = summary.summaries[sizes[0]];
  const refresh = f(first.stats.refreshMs, 2);
  const profile = (summary as any).profile?.name ? `Profile: ${(summary as any).profile.name}. ` : "";
  return (
    profile +
    `Median of ${summary.runs} measured runs (after ${summary.warmup} warm-up), min–max in brackets. ` +
    `Camera path of ${summary.durationMs / 1000} s per run. Idle refresh interval: ${refresh} ms.\n\n` +
    head +
    body +
    "\n"
  );
}

// ---- CPU profile -------------------------------------------------------------------------

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  children?: number[];
}
interface CpuProfile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

export interface ProfileRow {
  fn: string;
  selfMs: number;
  totalMs: number;
  selfPct: number;
}

/** Maps a position in a script (its URL, 0-based line and column) to a readable label, or null. */
export type Resolver = (url: string, line: number, column: number) => string | null;

export function cpuProfileTable(profile: CpuProfile, resolve?: Resolver, top = 30) {
  const parent = new Map<number, number>();
  const byId = new Map<number, ProfileNode>();
  for (const n of profile.nodes) {
    byId.set(n.id, n);
    for (const c of n.children ?? []) parent.set(c, n.id);
  }
  const key = (n: ProfileNode) => {
    const cf = n.callFrame;
    const resolved = resolve && cf.url ? resolve(cf.url, cf.lineNumber, cf.columnNumber) : null;
    if (resolved) return `${cf.functionName || "(anonymous)"} ${resolved}`;
    const file = cf.url ? cf.url.split("/").pop() : "";
    return `${cf.functionName || "(anonymous)"}${file ? ` ${file}:${cf.lineNumber + 1}` : ""}`;
  };
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  let all = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    // time until the next sample, in ms
    const dt = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0) / 1000;
    all += dt;
    let id: number | undefined = profile.samples[i];
    const leaf = byId.get(id);
    if (!leaf) continue;
    self.set(key(leaf), (self.get(key(leaf)) ?? 0) + dt);
    const seen = new Set<string>();
    while (id !== undefined) {
      const n = byId.get(id)!;
      const k = key(n);
      if (!seen.has(k)) {
        seen.add(k);
        total.set(k, (total.get(k) ?? 0) + dt);
      }
      id = parent.get(id);
    }
  }
  const rows: ProfileRow[] = [...self.entries()]
    .map(([fn, selfMs]) => ({ fn, selfMs, totalMs: total.get(fn) ?? selfMs, selfPct: (100 * selfMs) / all }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, top);
  const inclusive: ProfileRow[] = [...total.entries()]
    .filter(([fn]) => !fn.startsWith("(root)") && !fn.startsWith("(program)") && !fn.startsWith("(idle)"))
    .map(([fn, totalMs]) => ({ fn, selfMs: self.get(fn) ?? 0, totalMs, selfPct: (100 * (self.get(fn) ?? 0)) / all }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, top);
  const named = (name: string) => self.get(name) ?? 0;
  return {
    sampledMs: all,
    idleMs: named("(idle)"),
    programMs: named("(program)"),
    gcMs: named("(garbage collector)"),
    topSelf: rows,
    topInclusive: inclusive,
  };
}

// ---- Click-to-display ----------------------------------------------------------------------

export interface DisplaySample {
  index: number;
  handledMs: number | null;
  renderedMs: number;
  presentedMs: number;
  ticks: number;
}

export interface ClickRun {
  mode: "click";
  /** Raw file the run was read from. */
  file?: string;
  profile: string;
  tileCount: number;
  refreshMs: number;
  placements: number;
  samples: DisplaySample[];
  misses: number[];
  driver: { loadAvg: number[] };
}

export interface Dist {
  n: number;
  p50: number;
  p95: number;
  max: number;
}

const dist = (xs: number[]): Dist => ({ n: xs.length, p50: percentile(xs, 50), p95: percentile(xs, 95), max: xs.length ? Math.max(...xs) : NaN });

export interface ClickGroup {
  profile: string;
  tileCount: number;
  runs: number;
  placements: number;
  shown: number;
  missed: number;
  refreshMs: number;
  /** Pooled over every placement of every run. */
  presented: Dist;
  rendered: Dist;
  handled: Dist;
  /** p95 of input-to-presented of each run: median, min and max over the runs. */
  presentedP95PerRun: Spread;
  loadAvg1: Spread;
}

const groupBy = <T>(xs: T[], key: (x: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

const PROFILE_ORDER = ["unthrottled", "throttled"];
const byProfile = (a: { profile: string }, b: { profile: string }) => PROFILE_ORDER.indexOf(a.profile) - PROFILE_ORDER.indexOf(b.profile);

export function summarizeClicks(results: ClickRun[]) {
  const groups: ClickGroup[] = [];
  for (const rs of groupBy(results, (r) => `${r.profile}/${r.tileCount}`).values()) {
    const samples = rs.flatMap((r) => r.samples);
    groups.push({
      profile: rs[0].profile,
      tileCount: rs[0].tileCount,
      runs: rs.length,
      placements: rs.reduce((a, r) => a + r.placements, 0),
      shown: samples.length,
      missed: rs.reduce((a, r) => a + r.misses.length, 0),
      refreshMs: percentile(rs.map((r) => r.refreshMs), 50),
      presented: dist(samples.map((s) => s.presentedMs)),
      rendered: dist(samples.map((s) => s.renderedMs)),
      handled: dist(samples.flatMap((s) => (s.handledMs === null ? [] : [s.handledMs]))),
      presentedP95PerRun: spread(rs.map((r) => percentile(r.samples.map((s) => s.presentedMs), 95))),
      loadAvg1: spread(rs.map((r) => r.driver.loadAvg[0])),
    });
  }
  groups.sort((a, b) => byProfile(a, b) || a.tileCount - b.tileCount);
  return { groups };
}

const ms = (x: number, digits = 1) => (Number.isFinite(x) ? x.toFixed(digits) : "n/a");

export function clicksToMarkdown(summary: { groups: ClickGroup[] }): string {
  const cols = summary.groups.map((g) => `${g.profile}, ${g.tileCount} tiles`);
  const rows: Array<[string, (g: ClickGroup) => string]> = [
    ["Placements shown / clicked", (g) => `${g.shown} / ${g.placements} (${g.runs} runs)`],
    ["Input to presented frame p50 (ms)", (g) => ms(g.presented.p50)],
    ["Input to presented frame p95 (ms)", (g) => ms(g.presented.p95)],
    ["Input to presented frame max (ms)", (g) => ms(g.presented.max)],
    ["p95 per run, median (min–max) (ms)", (g) => f(g.presentedP95PerRun, 1)],
    ["Input to end of render p50 / p95 (ms)", (g) => `${ms(g.rendered.p50)} / ${ms(g.rendered.p95)}`],
    ["Input to click handler p50 / p95 (ms)", (g) => `${ms(g.handled.p50)} / ${ms(g.handled.p95)}`],
    ["Frame interval (idle, ms)", (g) => ms(g.refreshMs, 2)],
    ["Load average (1 min) after the runs", (g) => f(g.loadAvg1, 1)],
  ];
  return (
    `Pooled over every placement of every measured run. Input: the pointerup event of the click.\n\n` +
    `| Figure | ${cols.join(" | ")} |\n|---|${cols.map(() => "---").join("|")}|\n` +
    rows.map(([name, fn]) => `| ${name} | ${summary.groups.map(fn).join(" | ")} |`).join("\n") +
    "\n"
  );
}

// ---- In play: polling cost --------------------------------------------------------------------

interface FetchRecord {
  kind: string;
  what: string;
  start: number;
  end: number;
}
interface CommitRecord {
  phase: string;
  actualMs: number;
  commitTime: number;
}
interface LongTask {
  start: number;
  duration: number;
}

export interface PlayRun {
  mode: "play";
  /** Raw file the run was read from. */
  file?: string;
  profile: string;
  tileCount: number;
  ttiMs: number;
  refreshMs: number;
  session: { start: number; end: number; durationMs: number };
  rafDeltas: number[];
  cpuMs: number[];
  calls: number[];
  triangles: number[];
  commits: CommitRecord[];
  longTasks: LongTask[];
  fetches: FetchRecord[];
  inputs: Array<{ type: string; key?: string; ts: number }>;
  confirms: DisplaySample[];
  confirmMisses: number[];
  heapBytes: { atTti: number | null; atEnd: number | null };
  driver: { loadAvg: number[]; attempted: number; applied: number; mockCalls: unknown[]; pageErrors: string[] };
}

/** Input in the 3 s before `t`: what the page does then may answer a placement. */
const IDLE_AFTER_INPUT_MS = 3000;

/**
 * What the page does with no input in the 3 s before: RPC requests and React commits. Since P-10
 * the page does not poll, so both should be 0; a Torii-era run counts its polls here.
 */
export function idleWork(r: PlayRun) {
  const inSession = (t: number) => t >= r.session.start && t <= r.session.end;
  const idle = (t: number) => !r.inputs.some((i) => i.ts <= t && t - i.ts < IDLE_AFTER_INPUT_MS);
  const requests = r.fetches.filter((x) => inSession(x.start));
  return {
    requests: requests.length,
    idleRequests: requests.filter((x) => idle(x.start)).length,
    idleCommits: r.commits.filter((c) => inSession(c.commitTime) && idle(c.commitTime)).length,
  };
}

export function playRunStats(r: PlayRun) {
  const inSession = (t: number) => t >= r.session.start && t <= r.session.end;
  const tasks = r.longTasks.filter((t) => inSession(t.start));
  const commits = r.commits.filter((c) => inSession(c.commitTime));
  const work = idleWork(r);
  const minutes = (r.session.end - r.session.start) / 60000;
  return {
    file: r.file ?? null,
    sessionS: (r.session.end - r.session.start) / 1000,
    ttiMs: r.ttiMs,
    refreshMs: r.refreshMs,
    rafP50: percentile(r.rafDeltas, 50),
    rafP95: percentile(r.rafDeltas, 95),
    rafP99: percentile(r.rafDeltas, 99),
    droppedPct: (100 * r.rafDeltas.filter((d) => d > 1.5 * r.refreshMs).length) / r.rafDeltas.length,
    cpuP95: percentile(r.cpuMs, 95),
    longTasks: tasks.length,
    longTaskMs: tasks.reduce((a, t) => a + t.duration, 0),
    longTaskP95: percentile(tasks.map((t) => t.duration), 95),
    longTaskMax: tasks.length ? Math.max(...tasks.map((t) => t.duration)) : 0,
    longTasksPerMin: tasks.length / minutes,
    loadLongTasks: r.longTasks.filter((t) => t.start < r.session.start).length,
    commits: commits.length,
    commitsPerMin: commits.length / minutes,
    commitP50: percentile(commits.map((c) => c.actualMs), 50),
    commitP95: percentile(commits.map((c) => c.actualMs), 95),
    commitMax: commits.length ? Math.max(...commits.map((c) => c.actualMs)) : 0,
    requests: work.requests,
    idleRequests: work.idleRequests,
    idleCommits: work.idleCommits,
    confirmP50: percentile(r.confirms.map((s) => s.presentedMs), 50),
    confirmP95: percentile(r.confirms.map((s) => s.presentedMs), 95),
    placements: `${r.driver.applied}/${r.driver.attempted}`,
    loadAvg1: r.driver.loadAvg[0],
  };
}

export type PlayStats = ReturnType<typeof playRunStats>;

export function summarizePlays(results: PlayRun[]) {
  const groups = [...groupBy(results, (r) => r.profile).values()]
    .map((rs) => {
      const perRun = rs.map(playRunStats);
      const stats = {} as Record<keyof PlayStats, Spread | null>;
      for (const k of Object.keys(perRun[0]) as Array<keyof PlayStats>) {
        const xs = perRun.map((p) => p[k]).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
        stats[k] = xs.length === perRun.length ? spread(xs) : null;
      }
      // Long tasks and commits pooled over the runs, for distributions with enough samples.
      const tasks = rs.flatMap((r) => r.longTasks.filter((t) => t.start >= r.session.start && t.start <= r.session.end).map((t) => t.duration));
      const commits = rs.flatMap((r) => r.commits.filter((c) => c.commitTime >= r.session.start && c.commitTime <= r.session.end).map((c) => c.actualMs));
      const confirms = rs.flatMap((r) => r.confirms.map((s) => s.presentedMs));
      return {
        profile: rs[0].profile,
        runs: rs.length,
        perRun,
        stats,
        placements: perRun.map((p) => p.placements),
        pooled: { longTaskMs: dist(tasks), commitMs: dist(commits), confirmMs: dist(confirms) },
      };
    })
    .sort(byProfile);
  return { groups };
}

export function playsToMarkdown(summary: ReturnType<typeof summarizePlays>): string {
  type G = (typeof summary.groups)[number];
  const cols = summary.groups.map((g) => `${g.profile} (${g.runs} runs)`);
  const rows: Array<[string, (g: G) => string]> = [
    ["Session (s)", (g) => f(g.stats.sessionS, 1)],
    ["Placements applied / attempted (per run)", (g) => g.placements.join(", ")],
    ["Time to interactive (ms)", (g) => f(g.stats.ttiMs, 0)],
    ["Frame interval p50 (ms)", (g) => f(g.stats.rafP50)],
    ["Frame interval p95 (ms)", (g) => f(g.stats.rafP95)],
    ["Frame interval p99 (ms)", (g) => f(g.stats.rafP99)],
    ["Frames over 1.5 intervals (%)", (g) => f(g.stats.droppedPct, 1)],
    ["Long tasks > 50 ms in the session (count)", (g) => f(g.stats.longTasks, 0)],
    ["Long tasks, total (ms)", (g) => f(g.stats.longTaskMs, 0)],
    ["Long task duration p95, pooled (ms)", (g) => `${ms(g.pooled.longTaskMs.p95, 0)} (n=${g.pooled.longTaskMs.n}, max ${ms(g.pooled.longTaskMs.max, 0)})`],
    ["React commits in the session (count)", (g) => f(g.stats.commits, 0)],
    ["Commit render time p95, pooled (ms)", (g) => `${ms(g.pooled.commitMs.p95)} (n=${g.pooled.commitMs.n}, max ${ms(g.pooled.commitMs.max)})`],
    ["Requests to the node in the session (count)", (g) => f(g.stats.requests, 0)],
    ["Requests with no input in the 3 s before (polling: 0 expected)", (g) => f(g.stats.idleRequests, 0)],
    ["React commits with no input in the 3 s before", (g) => f(g.stats.idleCommits, 0)],
    ["Confirm (key C) to presented frame p50 / p95, pooled (ms)", (g) => `${ms(g.pooled.confirmMs.p50)} / ${ms(g.pooled.confirmMs.p95)} (n=${g.pooled.confirmMs.n})`],
    ["Load average (1 min) after the run", (g) => f(g.stats.loadAvg1, 1)],
  ];
  return (
    `Median of the measured runs, min–max in brackets, unless pooled.\n\n` +
    `| Figure | ${cols.join(" | ")} |\n|---|${cols.map(() => "---").join("|")}|\n` +
    rows.map(([name, fn]) => `| ${name} | ${summary.groups.map(fn).join(" | ")} |`).join("\n") +
    "\n"
  );
}
