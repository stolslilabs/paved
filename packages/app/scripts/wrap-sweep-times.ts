/**
 * SWEEP-SPEED: refreshes `wrap-sweep-times.json`, the time of each story that `--shard` balances the wrap sweep's shards on,
 * from the reports of one full sweep (every story, every shard).
 *
 *   node scripts/wrap-sweep-times.ts --run <run id>      # a CI run's `wrap-sweep-timings-*` artifacts, through `gh`
 *   node scripts/wrap-sweep-times.ts <report.json>...    # `wrap-sweep.ts --json` files at hand
 *   ... --partial                                        # accept the reports of some shards only (a sample: the stories of
 *                                                        # the others weigh their title's median)
 *
 * Take a merge-queue or main run (every story swept, on CI's runners): the times of a pull request's selection, or of a local
 * machine, would skew the split. A story missing from the file weighs the median of its title's (`weigh`, `wrap-sweep-shard.ts`),
 * so a new story needs no refresh.
 * Node 24 runs it as is (type stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { timesFromReports, type SweepReport } from "./wrap-sweep-shard.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "wrap-sweep-times.json");

/** Every `.json` under `dir`, at any depth (`gh run download` puts each artifact in its own folder). */
function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? jsonFiles(path) : name.endsWith(".json") ? [path] : [];
  });
}

const partial = process.argv.includes("--partial");
const argv = process.argv.slice(2).filter((a) => a !== "--partial");
const runAt = argv.indexOf("--run");
let files = argv;
let source = "local reports";
let scratch: string | undefined;
if (runAt >= 0) {
  const run = argv[runAt + 1];
  if (!run || !/^\d+$/.test(run)) throw new Error("--run takes a GitHub Actions run id");
  scratch = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "wrap-sweep-times-"));
  execFileSync("gh", ["run", "download", run, "--pattern", "wrap-sweep-timings-*", "--dir", scratch], { stdio: "inherit" });
  files = jsonFiles(scratch);
  source = `Stolsis CI run ${run}`;
}
if (files.length === 0) {
  console.error("usage: wrap-sweep-times.ts --run <run id> | wrap-sweep-times.ts <report.json>...");
  process.exit(2);
}
try {
  const reports = files.map((f) => JSON.parse(readFileSync(f, "utf8")) as SweepReport & { shard?: { index: number; count: number } | null });
  const counts = new Set(reports.map((r) => r.shard?.count ?? 1));
  if (counts.size > 1) throw new Error(`the reports come from different shard counts (${[...counts].join(", ")}): one full sweep only`);
  const [count] = counts;
  const seen = new Set(reports.map((r) => r.shard?.index ?? 1));
  if (seen.size < count && !partial) throw new Error(`${seen.size} of ${count} shards' reports: every shard of the sweep is needed (or --partial)`);
  if (seen.size < count) source += `, shard(s) ${[...seen].sort((a, b) => a - b).join(", ")} of ${count}`;
  const seconds = timesFromReports(reports);
  const total = Object.values(seconds).reduce((sum, s) => sum + s, 0);
  writeFileSync(OUT, `${JSON.stringify({ source, generated: new Date().toISOString().slice(0, 10), seconds }, null, 1)}\n`);
  console.log(`${Object.keys(seconds).length} stories, ${(total / 60).toFixed(1)} worker-minutes, from ${reports.length} report(s) of ${source}: ${OUT}`);
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
