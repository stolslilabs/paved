/**
 * The wrap sweep's shards: `--shard 2/4` sweeps the second of four shares of the stories, so the CI spreads one sweep
 * over parallel jobs (the `wrap-sweep` job of `.github/workflows/test.yaml`). Kept apart from `wrap-sweep.ts` (which
 * runs the sweep on import) so a test can import it. Node 24 runs it as is (type stripping): the syntax stays erasable.
 */

export interface Shard {
  /** From 1 to `count`. */
  index: number;
  count: number;
}

/** `"2/4"` is `{ index: 2, count: 4 }`; no value is the whole set, `1/1`. Throws on anything else. */
export function parseShard(value: string | undefined): Shard {
  if (value === undefined) return { index: 1, count: 1 };
  const m = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(m?.[1]);
  const count = Number(m?.[2]);
  if (!m || index < 1 || index > count) throw new Error(`--shard takes <index>/<count> with 1 <= index <= count, not "${value}"`);
  return { index, count };
}

/**
 * The stories of one shard: every `count`-th of the queue, from the `index`-th. The queue is the sweep's fixed shuffle,
 * so the 3D stories spread over the shards as they spread over the workers. Every story is in exactly one shard.
 */
export function shardOf<T>(queue: readonly T[], { index, count }: Shard): T[] {
  return queue.filter((_, i) => i % count === index - 1);
}
