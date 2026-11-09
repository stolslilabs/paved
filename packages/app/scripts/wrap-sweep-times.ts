/**
 * SWEEP-SPEED: refreshes `wrap-sweep-times.json`, the time of each story that `--shard` balances the wrap sweep's shards on,
 * from the reports of one full sweep (every story, every shard).
 *
 *   node scripts/wrap-sweep-times.ts --run <run id>...   # CI runs' `wrap-sweep-timings-*` artifacts, through `gh` (several runs:
 *                                                        # each story keeps its longest time)
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
import { dirname, join, relative, sep } from "node:path";
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
  const ids = argv.slice(runAt + 1);
  if (ids.length === 0 || !ids.every((r) => /^\d+$/.test(r))) throw new Error("--run takes GitHub Actions run ids");
  scratch = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "wrap-sweep-times-"));
  for (const run of ids) execFileSync("gh", ["run", "download", run, "--pattern", "wrap-sweep-timings-*", "--dir", join(scratch, run)], { stdio: "inherit" });
  files = jsonFiles(scratch);
  source = `Stolsis CI run${ids.length > 1 ? "s" : ""} ${ids.join(", ")}`;
}
if (files.length === 0) {
  console.error("usage: wrap-sweep-times.ts --run <run id>... | wrap-sweep-times.ts <report.json>... [--partial]");
  process.exit(2);
}
try {
  type Report = SweepReport & { shard?: { index: number; count: number } | null };
  // One group a run (its own folder under the download), or the local files as one sweep: each must hold every shard of it.
  const groups = new Map<string, Report[]>();
  for (const f of files) {
    const key = scratch ? relative(scratch, f).split(sep)[0] : "local";
    groups.set(key, [...(groups.get(key) ?? []), JSON.parse(readFileSync(f, "utf8")) as Report]);
  }
  for (const [key, group] of groups) {
    const counts = new Set(group.map((r) => r.shard?.count ?? 1));
    if (counts.size > 1) throw new Error(`${key}: the reports come from different shard counts (${[...counts].join(", ")}): one full sweep a run`);
    const [count] = counts;
    const seen = new Set(group.map((r) => r.shard?.index ?? 1));
    if (seen.size < count && !partial) throw new Error(`${key}: ${seen.size} of ${count} shards' reports: every shard of the sweep is needed (or --partial)`);
    if (seen.size < count) source += `, shard(s) ${[...seen].sort((a, b) => a - b).join(", ")} of ${count}`;
  }
  const reports = [...groups.values()].flat();
  const seconds = timesFromReports(reports);
  const total = Object.values(seconds).reduce((sum, s) => sum + s, 0);
  writeFileSync(OUT, `${JSON.stringify({ source, generated: new Date().toISOString().slice(0, 10), seconds }, null, 1)}\n`);
  console.log(`${Object.keys(seconds).length} stories, ${(total / 60).toFixed(1)} worker-minutes, from ${reports.length} report(s) of ${source}: ${OUT}`);
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
