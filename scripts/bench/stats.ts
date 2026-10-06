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
  calls: number;
  triangles: number;
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
    triangles: percentile(r.triangles, 50),
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
    ["Draw calls per frame (all passes)", (b) => f(b.stats.calls, 0)],
    ["Triangles per frame (all passes)", (b) => f(b.stats.triangles, 0)],
    ["Time to interactive (ms)", (b) => f(b.stats.ttiMs, 0)],
    ["JS heap at interactive (MB)", (b) => f(b.stats.heapTtiMB, 1)],
    ["JS heap at end of path (MB)", (b) => f(b.stats.heapEndMB, 1)],
    ["Rendered frames / rAF frames (median run)", (b) => `${b.stats.rendered?.median ?? "n/a"} / ${b.stats.raf?.median ?? "n/a"}`],
  ];
  const head = `| Figure | ${sizes.map((s) => `${s} tiles`).join(" | ")} |\n|---|${sizes.map(() => "---").join("|")}|\n`;
  const body = rows.map(([name, fn]) => `| ${name} | ${sizes.map((s) => fn(summary.summaries[s])).join(" | ")} |`).join("\n");
  const first = summary.summaries[sizes[0]];
  const refresh = f(first.stats.refreshMs, 2);
  return (
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

/** Maps a bundle position (0-based line and column) to a readable label, or null. */
export type Resolver = (line: number, column: number) => string | null;

export function cpuProfileTable(profile: CpuProfile, resolve?: Resolver, top = 30) {
  const parent = new Map<number, number>();
  const byId = new Map<number, ProfileNode>();
  for (const n of profile.nodes) {
    byId.set(n.id, n);
    for (const c of n.children ?? []) parent.set(c, n.id);
  }
  const key = (n: ProfileNode) => {
    const cf = n.callFrame;
    const resolved = resolve && cf.url ? resolve(cf.lineNumber, cf.columnNumber) : null;
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
