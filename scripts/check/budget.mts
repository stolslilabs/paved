/**
 * The bundle budget with its margins (GUARDS, P-71): each limit of packages/app/scripts/bundle-budget.json, the size
 * measured in the last build of packages/app, and the margin left (negative when over). It measures with the app's own
 * script (packages/app/scripts/bundle-budget.ts), imported, so the two never disagree; it changes no limit.
 *
 *   bun run budget [--dist <dir>]      (root script; run the client build first, e.g. `bun run check`)
 *
 * Exits 1 when a figure is over its limit or the output holds a forbidden file (starknet.js in a mock build included), 2 when there is no build to measure.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP, METRICS, forbidden, measureDist, overBudget, readBudget, starknetInMock } from "../../packages/app/scripts/bundle-budget.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const KiB = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
const pct = (margin: number, limit: number) => `${((margin / limit) * 100).toFixed(1)}%`;

const args = process.argv.slice(2);
const at = args.indexOf("--dist");
const dist = at >= 0 ? resolve(process.cwd(), args[at + 1]!) : join(APP, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error(`budget: no build in ${dist.replace(`${ROOT}/`, "")}: build the client first (bun run check builds it)`);
  process.exit(2);
}

const budget = readBudget();
const sizes = measureDist(dist, budget.firstLoad.route);
const rows = METRICS.flatMap((m) =>
  (["raw", "gzip"] as const).map((unit) => {
    const limit = budget.limits[m][unit];
    const size = sizes[m][unit];
    return { name: `${m} ${unit}`, limit, size, margin: limit - size };
  }),
);
console.log(`${"metric".padEnd(18)} ${"limit".padStart(10)} ${"measured".padStart(10)} ${"margin".padStart(10)}`);
for (const r of rows)
  console.log(
    `${r.name.padEnd(18)} ${String(r.limit).padStart(10)} ${String(r.size).padStart(10)} ${String(r.margin).padStart(10)}  (${KiB(r.margin)}, ${pct(r.margin, r.limit)})${r.margin < 0 ? "  OVER" : ""}`,
  );
const tightest = rows.reduce((a, b) => (b.margin / b.limit < a.margin / a.limit ? b : a));
const problems = [...forbidden(dist), ...starknetInMock(dist), ...overBudget(sizes, budget.limits)];
if (problems.length > 0) {
  console.error(`\nBundle over budget:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`budget: within; tightest ${tightest.name}, ${tightest.margin} bytes left (${pct(tightest.margin, tightest.limit)})`);
