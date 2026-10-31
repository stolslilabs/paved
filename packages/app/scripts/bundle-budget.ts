/**
 * The bundle budget (docs/client/v2-architecture.md, section 12, Q3 (d)): the sizes of the built app, held to the limits
 * of `scripts/bundle-budget.json`. `bun run build` runs it last, so the client job fails on a build over budget.
 *
 *   node scripts/bundle-budget.ts [--dist dist] [--table]
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. Sizes are of the files in `dist/assets`, not of
 * the source maps: raw bytes, and gzip bytes at level 9 (what a CDN sends, near enough to compare builds).
 *
 * - `entry`: the module script of `index.html`.
 * - `largestRoute`: the biggest chunk that is a page of `src/routes/pages` (a route's own code, not the chunks it shares).
 * - `firstLoadJs`: all the JavaScript the first load of `/` fetches: the entry, the chunks `index.html` preloads, the route
 *   chunk of `/` (`firstLoad.route`), and every chunk those import statically.
 * - `css`: the stylesheets of `dist/assets`.
 * - `fontAwesome`: the three scripts of `dist/fontawesome/js` (the subset: the owner's whole files must stay out of `dist/`).
 *
 * A mock build (#927) must also carry no starknet.js (`starknetInMock`): its chunks cannot fetch it, nor reach a node.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { dataSourceOf } from "../src/data/source-of.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = join(HERE, "..");

export const METRICS = ["entry", "largestRoute", "firstLoadJs", "css", "fontAwesome"] as const;
export type Metric = (typeof METRICS)[number];
export interface Size {
  raw: number;
  gzip: number;
}
export type Sizes = Record<Metric, Size>;

export interface Budget {
  /** The page chunk `/` shows, by its name before the hash. */
  firstLoad: { route: string };
  limits: Sizes;
}

export const readBudget = (): Budget => JSON.parse(readFileSync(join(HERE, "bundle-budget.json"), "utf8")) as Budget;

const measure = (file: string): Size => {
  const bytes = readFileSync(file);
  return { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
};
const sum = (sizes: Size[]): Size => ({ raw: sizes.reduce((n, s) => n + s.raw, 0), gzip: sizes.reduce((n, s) => n + s.gzip, 0) });

/** The files a chunk imports statically (`import x from"./a.js"`, `export*from"./a.js"`, `import"./a.js"`), not `import()`. */
export function staticImports(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/(?:^|[;}\n])\s*(?:import|export)\s*(?:[^"'`;()]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g)) out.add(m[1]!);
  return [...out];
}

/** The files a chunk loads with `import("./x.js")`: the route chunks are among them. */
export function dynamicImports(code: string): string[] {
  return [...new Set([...code.matchAll(/\bimport\(\s*["'`]\.\/([^"'`)]+\.js)["'`]\s*\)/g)].map((m) => m[1]!))];
}

/** The files `index.html` loads: its module script, its preloads, its stylesheets. */
export function htmlAssets(html: string): { entry: string; preloads: string[]; css: string[] } {
  const hrefs = (re: RegExp) => [...html.matchAll(re)].map((m) => m[1]!.replace(/^\//, ""));
  const entry = hrefs(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)[0];
  if (!entry) throw new Error("index.html has no module script");
  return {
    entry,
    preloads: hrefs(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g),
    css: hrefs(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
  };
}

/** The page names of `src/routes/pages`: a page's chunk is `<name>-<hash>.js`. */
export function pageNames(): string[] {
  return readdirSync(join(APP, "src/routes/pages")).filter((f) => f.endsWith(".tsx")).map((f) => f.replace(/\.tsx$/, ""));
}

export function measureDist(dist: string, firstLoadRoute: string): Sizes & { routes: Record<string, Size>; firstLoadFiles: string[] } {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const { entry, preloads, css } = htmlAssets(html);
  const assets = readdirSync(join(dist, "assets"));
  // A page's chunk is the one named for it that some chunk loads with `import()`: a module of the same name that is only
  // imported statically (`settings-*.js` twice) is a shared chunk, not the route.
  const dynamic = new Set(assets.filter((f) => f.endsWith(".js")).flatMap((f) => dynamicImports(readFileSync(join(dist, "assets", f), "utf8"))));
  const chunk = (name: string) => {
    const hit = assets.filter((f) => new RegExp(`^${name}-[A-Za-z0-9_-]{8}\\.js$`).test(f) && dynamic.has(f));
    if (hit.length !== 1)
      throw new Error(
        `the page "${name}" must have exactly one chunk ${name}-<hash>.js that is loaded with import(), found ${hit.length}${hit.length ? ` (${hit.join(", ")})` : ""}. ` +
          "The budget cannot measure a page it cannot find: fix the chunk, or the match in scripts/bundle-budget.ts.",
      );
    return `assets/${hit[0]}`;
  };

  // A page without exactly one chunk would drop out of `largestRoute` unseen: `chunk` fails instead.
  const routes: Record<string, Size> = {};
  for (const page of pageNames()) routes[page] = measure(join(dist, chunk(page)));

  const files = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const dep of staticImports(readFileSync(join(dist, file), "utf8"))) visit(`assets/${dep}`);
  };
  for (const f of [entry, ...preloads, chunk(firstLoadRoute)]) visit(f);

  const stylesheets = new Set([...css, ...assets.filter((f) => f.endsWith(".css")).map((f) => `assets/${f}`)]);
  const fa = existsSync(join(dist, "fontawesome/js")) ? readdirSync(join(dist, "fontawesome/js")).filter((f) => f.endsWith(".js")) : [];
  const biggest = Object.values(routes).reduce<Size>((a, b) => (b.raw > a.raw ? b : a), { raw: 0, gzip: 0 });
  return {
    entry: measure(join(dist, entry)),
    largestRoute: biggest,
    firstLoadJs: sum([...files].map((f) => measure(join(dist, f)))),
    css: sum([...stylesheets].map((f) => measure(join(dist, f)))),
    fontAwesome: sum(fa.map((f) => measure(join(dist, "fontawesome/js", f)))),
    routes,
    firstLoadFiles: [...files].sort(),
  };
}

const KB = (n: number) => `${(n / 1024).toFixed(1)} KiB`;

/**
 * What a static output (`dist/`, `storybook-static/`) must not hold, whatever its sizes: the owner's whole Font Awesome
 * files. `fontawesome/` there is the README and the subset scripts of `js/`, nothing else.
 */
export function forbidden(dir: string): string[] {
  const fa = join(dir, "fontawesome");
  if (!existsSync(fa)) return [];
  return readdirSync(fa)
    .filter((f) => f !== "README.md" && f !== "js")
    .map((f) => `fontawesome/${f} is in ${dir.split("/").pop()}: the owner's whole Font Awesome files must stay out of the output`);
}

/** starknet.js's mark in a chunk: a JSON-RPC method its provider sends, which no other code of the app names. */
export const STARKNET_MARK = "starknet_chainId";
/** The mark of `src/data/mock/starknet-shim.ts`, which a mock build carries in place of starknet.js (`vite.config.ts`). */
export const SHIM_MARK = "starknet.js is not in a mock build";

/** Whether the environment builds the mock (`VITE_DATA_SOURCE`, `VITE_NETWORK`), as `vite.config.ts` reads it. */
export const mockEnv = (env: Record<string, string | undefined> = process.env): boolean => dataSourceOf({ source: env.VITE_DATA_SOURCE, network: env.VITE_NETWORK }) === "mock";

/**
 * The chunks of a mock build that carry starknet.js, as messages (#927: a mock build fetches nothing outside its origin). A
 * build is a mock one when `mock` says so (the environment's source, by default) or when it carries the shim.
 */
export function starknetInMock(dist: string, mock = mockEnv()): string[] {
  const chunks = readdirSync(join(dist, "assets")).filter((f) => f.endsWith(".js"));
  const holding = (mark: string) => chunks.filter((f) => readFileSync(join(dist, "assets", f), "utf8").includes(mark));
  if (!mock && holding(SHIM_MARK).length === 0) return [];
  return holding(STARKNET_MARK).map((f) => `assets/${f} carries starknet.js in a mock build: the mock fetches nothing outside the app's origin (vite.config.ts)`);
}

/** The metrics over their limit, as messages that say which figure, by how much, and where the limit is. */
export function overBudget(sizes: Sizes, limits: Sizes): string[] {
  const out: string[] = [];
  for (const metric of METRICS)
    for (const unit of ["raw", "gzip"] as const) {
      const over = sizes[metric][unit] - limits[metric][unit];
      if (over > 0)
        out.push(`${metric} ${unit} is ${sizes[metric][unit]} bytes (${KB(sizes[metric][unit])}), ${over} over its budget of ${limits[metric][unit]} (${KB(limits[metric][unit])})`);
    }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--dist");
  const dist = at >= 0 ? resolve(process.cwd(), args[at + 1]!) : join(APP, "dist");
  if (!existsSync(join(dist, "index.html"))) throw new Error(`no build in ${dist}: run the build first`);
  const budget = readBudget();
  const sizes = measureDist(dist, budget.firstLoad.route);
  if (args.includes("--table")) {
    console.log("| Metric | Raw | Gzip | Budget raw | Budget gzip |\n|---|---|---|---|---|");
    for (const m of METRICS) console.log(`| ${m} | ${sizes[m].raw} | ${sizes[m].gzip} | ${budget.limits[m].raw} | ${budget.limits[m].gzip} |`);
    return;
  }
  const problems = [...forbidden(dist), ...starknetInMock(dist), ...overBudget(sizes, budget.limits)];
  for (const m of METRICS) console.log(`${m.padEnd(13)} ${String(sizes[m].raw).padStart(8)} raw  ${String(sizes[m].gzip).padStart(8)} gzip   (budget ${budget.limits[m].raw} / ${budget.limits[m].gzip})`);
  if (problems.length > 0) {
    console.error(`\nBundle over budget:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    console.error("\nCut the bundle, or raise the limit in packages/app/scripts/bundle-budget.json in the same pull request, with the reason.");
    process.exit(1);
  }
  console.log("Bundle within budget.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
