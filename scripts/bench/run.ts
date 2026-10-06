// Frame-time bench driver. Run on the Mac, from packages/app-web:  bun run bench
//
// Builds the bench page, serves it from a local static server, and drives headed Chrome
// (real GPU, not headless) through Playwright: for each board, one warm-up run and N measured
// runs of a scripted camera path. Writes the raw JSON of every run, a summary JSON and a
// markdown table under docs/measures/client-baseline/.
//
// Options: --sizes 38,72  --runs 5  --warmup 1  --duration 20000  --no-build  --profile
//          --out <dir>  --window 1440x900
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { SourceMapConsumer } from "source-map-js";
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";
import { cpuProfileTable, summarizeRuns, toMarkdown } from "./stats";
import type { RunResult } from "./stats";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const appWeb = join(repo, "packages/app-web");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "true";
}
const sizes = (arg("sizes", "38,72") as string).split(",").map(Number);
const runs = Number(arg("runs", "5"));
const warmup = Number(arg("warmup", "1"));
const durationMs = Number(arg("duration", "20000"));
const [winW, winH] = (arg("window", "1440x900") as string).split("x").map(Number);
const outDir = resolve(arg("out", join(repo, "docs/measures/client-baseline")) as string);
const doBuild = arg("no-build") === undefined;
const profileOnly = arg("profile-only") !== undefined;
const doProfile = arg("profile") !== undefined || profileOnly;

const sh = (cmd: string, args: string[]): string =>
  spawnSync(cmd, args, { encoding: "utf8" }).stdout.trim();

function build(script: string, extra: string[] = [], env: Record<string, string> = {}): void {
  console.log(`build: bun run ${script} ${extra.join(" ")}`);
  const r = spawnSync(process.execPath, ["run", script, ...extra], {
    cwd: appWeb,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`build failed: ${script}`);
}

function serve(root: string) {
  return Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
      const path = url.pathname === "/" ? "/bench.html" : decodeURIComponent(url.pathname);
      const file = Bun.file(join(root, path));
      if (!(await file.exists())) return new Response("not found", { status: 404 });
      return new Response(file, { headers: { "cache-control": "no-store" } });
    },
  });
}

function machineInfo(browserVersion: string) {
  // Displays: kind, pixels and mode only (no serial numbers).
  let displays: unknown = null;
  try {
    const gpus = JSON.parse(sh("system_profiler", ["SPDisplaysDataType", "-json"])).SPDisplaysDataType;
    displays = gpus.flatMap((g: any) =>
      (g.spdisplays_ndrvs ?? []).map((d: any) => ({
        name: d._name,
        type: d.spdisplays_display_type ?? d.spdisplays_connection_type ?? null,
        pixels: d._spdisplays_pixels,
        mode: d._spdisplays_resolution ?? d.spdisplays_resolution,
        main: d.spdisplays_main === "spdisplays_yes",
      })),
    );
  } catch {
    /* keep null */
  }
  return {
    model: sh("sysctl", ["-n", "hw.model"]),
    chip: sh("sysctl", ["-n", "machdep.cpu.brand_string"]),
    cpuCores: Number(sh("sysctl", ["-n", "hw.ncpu"])),
    memoryGiB: Number(sh("sysctl", ["-n", "hw.memsize"])) / 2 ** 30,
    macOS: `${sh("sw_vers", ["-productVersion"])} (${sh("sw_vers", ["-buildVersion"])})`,
    chrome: browserVersion,
    power: sh("pmset", ["-g", "batt"]).split("\n")[0],
    windowArg: `${winW}x${winH}`,
    displays,
  };
}

/** A hidden or locked window stops requestAnimationFrame: fail instead of waiting for ever. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: no result after ${ms} ms (is the display awake and the window visible?)`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function runOnce(browser: Browser, base: string, size: number, profile: boolean, shotPath?: string) {
  return withTimeout(runOnceUnbounded(browser, base, size, profile, shotPath), durationMs + 180_000, `board ${size}`);
}

async function runOnceUnbounded(browser: Browser, base: string, size: number, profile: boolean, shotPath?: string) {
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  let load: unknown = null;
  let path: unknown = null;
  let cdp: Awaited<ReturnType<typeof context.newCDPSession>> | null = null;
  if (profile) {
    cdp = await context.newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }
  await page.goto(`${base}/bench.html?bench=${size}&duration=${durationMs}`, { waitUntil: "commit" });
  if (cdp) {
    await page.waitForFunction(() => (window as any).__benchPhase === "path" || (window as any).__benchError, null, { timeout: 120_000, polling: 20 });
    load = (await cdp.send("Profiler.stop")).profile;
    await cdp.send("Profiler.start");
  }
  await page.waitForFunction(() => (window as any).__benchResult || (window as any).__benchError, null, {
    timeout: durationMs + 120_000,
    polling: 250,
  });
  if (cdp) path = (await cdp.send("Profiler.stop")).profile;
  // The camera path ends on the far, top-down view of the whole board.
  if (shotPath) await page.screenshot({ path: shotPath, type: "jpeg", quality: 80 });
  const result = await page.evaluate(() => (window as any).__benchResult ?? { error: (window as any).__benchError });
  await context.close();
  if (result.error || errors.length) console.warn(`  page errors: ${result.error ?? errors.join(" | ")}`);
  return { result, errors, load, path };
}

/** Resolver of bundle positions to original sources, from the sourcemap of the profile build. */
function sourceResolver(assetsDir: string) {
  const mapFile = readdirSync(assetsDir).find((f) => f.endsWith(".js.map"));
  if (!mapFile) return undefined;
  const consumer = new SourceMapConsumer(JSON.parse(readFileSync(join(assetsDir, mapFile), "utf8")));
  return (line: number, column: number): string | null => {
    const pos = consumer.originalPositionFor({ line: line + 1, column });
    if (!pos.source) return null;
    const src = pos.source.replace(/^(\.\.\/)+/, "").replace(/node_modules\/\.bun\/[^/]+\/node_modules\//, "");
    return `${src}:${pos.line}`;
  };
}

const launch = () =>
  chromium.launch({
    channel: "chrome",
    headless: false,
    args: [`--window-size=${winW},${winH}`, "--window-position=0,0", "--enable-precise-memory-info"],
  });

async function measure(caffeinate: { kill(): boolean }) {
  if (doBuild) build("build:bench");
  const server = serve(join(appWeb, "dist-bench"));
  const base = `http://localhost:${server.port}`;
  const browser = await launch();
  const machine = machineInfo(browser.version());
  writeFileSync(join(outDir, "machine.json"), JSON.stringify(machine, null, 2) + "\n");
  console.log(`machine: ${machine.chip}, ${machine.macOS}, Chrome ${machine.chrome}`);

  const summaries: Record<string, ReturnType<typeof summarizeRuns>> = {};
  for (const size of sizes) {
    const measured: RunResult[] = [];
    for (let i = 0; i < warmup + runs; i++) {
      const isWarm = i < warmup;
      console.log(`board ${size}: ${isWarm ? "warm-up" : `run ${i - warmup + 1}/${runs}`}`);
      const { result } = await runOnce(
        browser,
        base,
        size,
        false,
        i === warmup ? join(outDir, `screenshot-${size}.jpg`) : undefined,
      );
      if (result.error) throw new Error(result.error);
      if (isWarm) continue;
      writeFileSync(join(outDir, `run-${size}-${i - warmup + 1}.json`), JSON.stringify(result) + "\n");
      measured.push(result);
    }
    summaries[size] = summarizeRuns(measured);
  }
  await browser.close();
  server.stop(true);

  const summary = { when: new Date().toISOString(), durationMs, runs, warmup, machine, summaries };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
  const md = toMarkdown(summary as any);
  writeFileSync(join(outDir, "summary.md"), md);
  console.log("\n" + md);
}

/** One run of the largest board with the CPU profiler attached, on a build made for the profile (see vite.bench.config.ts). */
async function profile() {
  if (doBuild) build("build:bench", ["--outDir", "dist-profile"], { BENCH_PROFILE: "1" });
  const root = join(appWeb, "dist-profile");
  const server = serve(root);
  const browser = await launch();
  const big = Math.max(...sizes);
  console.log(`profile: board ${big}`);
  const { load, path } = await runOnce(browser, `http://localhost:${server.port}`, big, true);
  await browser.close();
  server.stop(true);
  const resolve = sourceResolver(join(root, "assets"));
  const out = { board: big, load: cpuProfileTable(load as any, resolve), path: cpuProfileTable(path as any, resolve) };
  writeFileSync(join(outDir, "cpu-profile-summary.json"), JSON.stringify(out, null, 1) + "\n");
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  // Keep the display awake: a sleeping display stops requestAnimationFrame.
  const caffeinate = spawn("caffeinate", ["-d", "-i"], { stdio: "ignore" });
  try {
    if (!profileOnly) await measure(caffeinate);
    if (doProfile) await profile();
  } finally {
    caffeinate.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
