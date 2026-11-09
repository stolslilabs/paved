/**
 * Prunes turbo's local cache to the tasks of this job's runs, before actions/cache saves it (APP-TEST-SHARD, #1131).
 *
 * The client jobs of .github/workflows/test.yaml restore `.turbo/cache` from an earlier run and save it again at the end.
 * Turbo never deletes an entry, so without this the saved cache would grow by every run's builds. Each turbo run of the
 * job passes `--summarize`, which writes `.turbo/runs/<id>.json` with the hash of every task it ran or replayed; an entry
 * of the cache (`<hash>.tar.zst`, `<hash>-meta.json`, `<hash>-manifest.json`) whose hash is in none of them is deleted.
 *
 * Usage: node scripts/ci/turbo-cache-prune.mts <cache dir> <runs dir>
 * Tested by scripts/ci/turbo-cache-prune.test.mts.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The task hashes of every run summary in `runsDir`. */
export function usedHashes(runsDir: string): Set<string> {
  const hashes = new Set<string>();
  if (!existsSync(runsDir)) return hashes;
  for (const file of readdirSync(runsDir).filter((f) => f.endsWith(".json"))) {
    const summary = JSON.parse(readFileSync(join(runsDir, file), "utf8")) as { tasks?: { hash?: string }[] };
    for (const task of summary.tasks ?? []) if (task.hash) hashes.add(task.hash);
  }
  return hashes;
}

/** The hash an entry of the cache belongs to: the name up to its first `.` or `-`. */
export const hashOf = (file: string): string => file.split(/[.-]/, 1)[0];

/** Deletes the entries of `cacheDir` whose hash is not in `keep`; returns the names kept and deleted. */
export function prune(cacheDir: string, keep: Set<string>): { kept: string[]; deleted: string[] } {
  const kept: string[] = [];
  const deleted: string[] = [];
  if (!existsSync(cacheDir)) return { kept, deleted };
  for (const file of readdirSync(cacheDir)) {
    if (keep.has(hashOf(file))) kept.push(file);
    else {
      rmSync(join(cacheDir, file), { recursive: true, force: true });
      deleted.push(file);
    }
  }
  return { kept, deleted };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cacheDir, runsDir] = process.argv.slice(2);
  if (!cacheDir || !runsDir) {
    console.error("usage: node scripts/ci/turbo-cache-prune.mts <cache dir> <runs dir>");
    process.exit(2);
  }
  const keep = usedHashes(runsDir);
  // No summary means no turbo run wrote one (a step failed early, or --summarize was dropped): keep everything rather
  // than save an empty cache.
  if (keep.size === 0) {
    console.log(`turbo cache: no run summary in ${runsDir}, nothing pruned`);
    process.exit(0);
  }
  const { kept, deleted } = prune(cacheDir, keep);
  console.log(`turbo cache: ${keep.size} task hashes used, ${kept.length} files kept, ${deleted.length} deleted`);
}
