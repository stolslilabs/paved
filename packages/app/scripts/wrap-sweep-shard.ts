/**
 * The wrap sweep's `--shard i/n`: the i-th of n parts of the story list (1-based, as vitest and Playwright count). Kept apart
 * from `wrap-sweep.ts` (which runs the sweep on import) so a test can import it.
 * Node 24 runs it as is (type stripping): the syntax stays erasable.
 */

export interface Shard {
  /** 1 to `count`. */
  index: number;
  count: number;
}

/** Story id to seconds, as `wrap-sweep-times.json` holds them (SWEEP-SPEED). */
export type Times = Readonly<Record<string, number>>;

/** `"2/4"` as `{ index: 2, count: 4 }`; throws on anything else (a zero, an index past the count, a missing part). */
export function parseShard(value: string): Shard {
  const m = /^(\d+)\/(\d+)$/.exec(value.trim());
  const index = m ? Number(m[1]) : 0;
  const count = m ? Number(m[2]) : 0;
  if (!m || count < 1 || index < 1 || index > count) throw new Error(`--shard takes i/n with 1 <= i <= n, not "${value}"`);
  return { index, count };
}

const known = (t: number | undefined): t is number => typeof t === "number" && Number.isFinite(t) && t >= 0;

/** The median of `values`, or `fallback` when there are none. */
function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A story's title part: `renderer-weather` of `renderer-weather--cycle`. */
const title = (id: string) => id.split("--")[0];

/**
 * Each story's weight, in seconds: its time in `times`; for a story the file lacks (a new one), the median of the timed stories
 * of its own title (the stories of one title cost alike: a new 3D story weighs as the other 3D ones), else the median of every
 * timed story of the list; with no time at all, 1 (every story weighs the same).
 */
export function weigh(ids: readonly string[], times: Times = {}): Map<string, number> {
  const byTitle = new Map<string, number[]>();
  for (const id of ids) {
    const t = times[id];
    if (known(t)) byTitle.set(title(id), [...(byTitle.get(title(id)) ?? []), t]);
  }
  const all = median([...byTitle.values()].flat(), 1);
  return new Map(ids.map((id) => [id, known(times[id]) ? times[id] : median(byTitle.get(title(id)) ?? [], all)]));
}

/**
 * Every shard of `ids` at once, balanced by time: greedy bin packing (longest first, each story to the shard with the least
 * time so far, the one with fewer stories and then the lower index on a tie), on the weights of `weigh`. The ids are sorted first
 * and ties broken by id, so the split hangs neither on the order of `index.json` nor on the machine: every story lands in exactly
 * one shard. With no times at all, every story weighs the same and the shards differ by one story at most. Each shard's ids come
 * back sorted.
 */
export function dealStories(ids: readonly string[], count: number, times: Times = {}): string[][] {
  const unique = [...new Set(ids)].sort();
  const weights = weigh(unique, times);
  const order = unique.map((id) => ({ id, w: weights.get(id) ?? 1 })).sort((a, b) => b.w - a.w || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shards = Array.from({ length: count }, () => ({ ids: [] as string[], load: 0 }));
  for (const { id, w } of order) {
    let best = 0;
    for (let k = 1; k < count; k++) {
      const a = shards[k];
      const b = shards[best];
      if (a.load < b.load || (a.load === b.load && a.ids.length < b.ids.length)) best = k;
    }
    shards[best].ids.push(id);
    shards[best].load += w;
  }
  return shards.map((s) => s.ids.sort());
}

/**
 * The order a shard's workers take its stories in: the longest first (a long story started last would leave the other workers
 * idle at the end), ties in the order given. Every story once.
 */
export function longestFirst(ids: readonly string[], times: Times = {}): string[] {
  const weights = weigh(ids, times);
  return ids.map((id, k) => ({ id, k, w: weights.get(id) ?? 1 })).sort((a, b) => b.w - a.w || a.k - b.k).map((s) => s.id);
}

/** The stories of one shard: the `index`-th part of `dealStories`. */
export function shardStories(ids: readonly string[], { index, count }: Shard, times: Times = {}): string[] {
  return dealStories(ids, count, times)[index - 1];
}

/** What `wrap-sweep.ts --json` writes that the times are read from: each story's whole time in its worker, ms. */
export interface SweepReport {
  timings?: readonly { story: string; ms: number }[];
}

/**
 * The times of one full sweep, from its shards' reports: each story's seconds, to a tenth, ids sorted (a stable file). A story
 * swept twice (two reports of one shard) keeps the longer time.
 */
export function timesFromReports(reports: readonly SweepReport[]): Record<string, number> {
  const seconds = new Map<string, number>();
  for (const r of reports) for (const t of r.timings ?? []) seconds.set(t.story, Math.max(seconds.get(t.story) ?? 0, Math.round(t.ms / 100) / 10));
  return Object.fromEntries([...seconds].sort(([a], [b]) => (a < b ? -1 : 1)));
}
