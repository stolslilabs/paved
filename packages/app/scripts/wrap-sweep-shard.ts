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

/** `"2/4"` as `{ index: 2, count: 4 }`; throws on anything else (a zero, an index past the count, a missing part). */
export function parseShard(value: string): Shard {
  const m = /^(\d+)\/(\d+)$/.exec(value.trim());
  const index = m ? Number(m[1]) : 0;
  const count = m ? Number(m[2]) : 0;
  if (!m || count < 1 || index < 1 || index > count) throw new Error(`--shard takes i/n with 1 <= i <= n, not "${value}"`);
  return { index, count };
}

/**
 * The stories of one shard. The ids are sorted first, so the split does not hang on the order of `index.json`, then dealt in
 * turn (the k-th id goes to shard k mod n + 1): the parts differ by one story at most, and the stories of one title, which
 * sit together in the sorted list (the 3D ones, slow, among them), spread over the shards rather than land in one.
 */
export function shardStories(ids: readonly string[], { index, count }: Shard): string[] {
  return [...ids].sort().filter((_, k) => k % count === index - 1);
}
