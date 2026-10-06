// Client bench driver. Run on the Mac, from packages/app-web:  bun run bench
//
// Builds the bench page, serves it from a local static server, and drives headed Chrome
// (real GPU, not headless) through Playwright. Three benches (method: docs/measures/client-baseline.md):
//
//   bun run bench                         frame time along the camera path, unthrottled (baseline B)
//   bun run bench --profiles throttled    the same under the throttled profile (P-7)
//   bun run bench --click                 click-to-display latency, both profiles
//   bun run bench --play                  the real Game page polling a local mock of Torii, both profiles
//
// Profiles: `unthrottled` (the machine as it is) and `throttled` (CDP CPU throttling 4x and a
// 60 Hz requestAnimationFrame cap, see frame-cap.ts). Each run is one fresh browser context;
// raw JSON of every run, a summary JSON and a markdown table go under docs/measures/client-baseline/.
//
// Options: --profiles unthrottled,throttled  --sizes 38,72  --runs 5  --warmup 1  --duration <ms>
//          --no-build  --profile  --profile-only  --summarize-only  --out <dir>  --window 1440x900
//          --offscreen (headed, GPU kept, window at x = -10000: nothing shows while the Mac is in use)
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceMapConsumer } from "source-map-js";
import { chromium } from "playwright-core";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { capFrameRate } from "./frame-cap";
import { createMockChain } from "./mock-chain";
import type { MockChain } from "./mock-chain";
import {
  cpuProfileTable,
  summarizeClicks,
  summarizePlays,
  summarizeRuns,
  clicksToMarkdown,
  playsToMarkdown,
  toMarkdown,
} from "./stats";
import type { ClickRun, PlayRun, RunResult } from "./stats";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const appWeb = join(repo, "packages/app-web");
const fixtures = join(repo, "packages/game-core/bench/fixtures");
const measures = join(repo, "docs/measures/client-baseline");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "true";
}
const kind: "board" | "click" | "play" = arg("click") ? "click" : arg("play") ? "play" : "board";

interface Profile {
  name: "unthrottled" | "throttled";
  /** CDP Emulation.setCPUThrottlingRate; 1 is none. */
  cpuRate: number;
  /** requestAnimationFrame cap, or null for the display's own rate. */
  fps: number | null;
}
const PROFILES: Record<string, Profile> = {
  unthrottled: { name: "unthrottled", cpuRate: 1, fps: null },
  throttled: { name: "throttled", cpuRate: 4, fps: 60 },
};
const profiles = (arg("profiles", kind === "board" ? "unthrottled" : "unthrottled,throttled") as string)
  .split(",")
  .map((p) => {
    if (!PROFILES[p]) throw new Error(`unknown profile ${p} (unthrottled, throttled)`);
    return PROFILES[p];
  });
const sizes = (arg("sizes", "38,72") as string).split(",").map(Number);
const runs = Number(arg("runs", kind === "play" ? "3" : "5"));
const warmup = Number(arg("warmup", "1"));
const durationMs = Number(arg("duration", kind === "play" ? "60000" : "20000"));
const [winW, winH] = (arg("window", "1440x900") as string).split("x").map(Number);
const defaultOut =
  kind === "board" ? (profiles.length === 1 && profiles[0].name === "throttled" ? join(measures, "throttled") : measures) : join(measures, kind);
const outDir = resolve(arg("out", defaultOut) as string);
const doBuild = arg("no-build") === undefined;
const offscreen = arg("offscreen") !== undefined;
const profileOnly = arg("profile-only") !== undefined;
const doProfile = arg("profile") !== undefined || profileOnly;
const summarizeOnly = arg("summarize-only") !== undefined;

const sh = (cmd: string, args: string[]): string =>
  spawnSync(cmd, args, { encoding: "utf8" }).stdout.trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Load average (1, 5, 15 min) of the machine, recorded with every run. */
const loadAvg = (): number[] => sh("sysctl", ["-n", "vm.loadavg"]).replace(/[{}]/g, "").trim().split(/\s+/).map(Number);

function build(script: string, extra: string[] = [], env: Record<string, string> = {}): void {
  console.log(`build: bun run ${script} ${extra.join(" ")} ${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  const r = spawnSync(process.execPath, ["run", script, ...extra], {
    cwd: appWeb,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`build failed: ${script}`);
}

function serve(root: string, mock?: MockChain) {
  const base = resolve(root);
  return Bun.serve({
    // Loopback only: the bench page and the mock are for this machine's browser.
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (mock) {
        const res = await mock.handle(req, url.pathname);
        if (res) return res;
      }
      if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
      const path = url.pathname === "/" ? "/bench.html" : decodeURIComponent(url.pathname);
      const full = resolve(base, "." + path);
      if (full !== base && !full.startsWith(base + sep)) return new Response("forbidden", { status: 403 });
      const file = Bun.file(full);
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
    loadAvgAtStart: loadAvg(),
    windowArg: `${winW}x${winH}`,
    window: offscreen ? "off screen" : "on screen",
    profiles,
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

/** A fresh context and page under a profile: CPU throttling through CDP, the frame cap before any page script. */
async function openPage(browser: Browser, profile: Profile) {
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const cdp = await context.newCDPSession(page);
  if (profile.cpuRate !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });
  if (profile.fps !== null) await page.addInitScript(capFrameRate, profile.fps);
  return { context, page, errors, cdp };
}

const benchError = (page: Page) => page.evaluate(() => (window as any).__benchError as string | undefined);

// ---- Board: frame time along the camera path ---------------------------------------------

function runOnce(browser: Browser, base: string, size: number, profile: Profile, cpuProfile: boolean, shotPath?: string) {
  return withTimeout(runOnceUnbounded(browser, base, size, profile, cpuProfile, shotPath), durationMs + 300_000, `board ${size}`);
}

async function runOnceUnbounded(browser: Browser, base: string, size: number, profile: Profile, cpuProfile: boolean, shotPath?: string) {
  const { context, page, errors, cdp } = await openPage(browser, profile);
  let load: unknown = null;
  let path: unknown = null;
  if (cpuProfile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }
  await page.goto(`${base}/bench.html?bench=${size}&duration=${durationMs}`, { waitUntil: "commit" });
  if (cpuProfile) {
    await page.waitForFunction(() => (window as any).__benchPhase === "path" || (window as any).__benchError, null, { timeout: 240_000, polling: 20 });
    load = (await cdp.send("Profiler.stop")).profile;
    await cdp.send("Profiler.start");
  }
  await page.waitForFunction(() => (window as any).__benchResult || (window as any).__benchError, null, {
    timeout: durationMs + 240_000,
    polling: 250,
  });
  if (cpuProfile) path = (await cdp.send("Profiler.stop")).profile;
  // The camera path ends on the far, top-down view of the whole board.
  if (shotPath) await page.screenshot({ path: shotPath, type: "jpeg", quality: 80 });
  const result = await page.evaluate(() => (window as any).__benchResult ?? { error: (window as any).__benchError });
  await context.close();
  if (result.error || errors.length) console.warn(`  page errors: ${result.error ?? errors.join(" | ")}`);
  return { result, errors, load, path };
}

/** Resolver of bundle positions to original sources: the sourcemap of each frame's own script. */
function sourceResolver(assetsDir: string) {
  const consumers = new Map<string, SourceMapConsumer | null>();
  const consumerFor = (url: string): SourceMapConsumer | null => {
    const file = basename(new URL(url, "http://localhost").pathname);
    if (!consumers.has(file)) {
      const map = join(assetsDir, `${file}.map`);
      consumers.set(file, existsSync(map) ? new SourceMapConsumer(JSON.parse(readFileSync(map, "utf8"))) : null);
    }
    return consumers.get(file)!;
  };
  return (url: string, line: number, column: number): string | null => {
    const pos = consumerFor(url)?.originalPositionFor({ line: line + 1, column });
    if (!pos?.source) return null;
    const src = pos.source.replace(/^(\.\.\/)+/, "").replace(/node_modules\/\.bun\/[^/]+\/node_modules\//, "");
    return `${src}:${pos.line}`;
  };
}

const launch = () =>
  chromium.launch({
    channel: "chrome",
    headless: false,
    args: [`--window-size=${winW},${winH}`, offscreen ? "--window-position=-10000,0" : "--window-position=0,0", "--enable-precise-memory-info"],
  });

function boardSummary(machine: unknown, when = new Date().toISOString()) {
  const summaries: Record<string, ReturnType<typeof summarizeRuns>> = {};
  const files = readdirSync(outDir).filter((f) => /^run-\d+-\d+\.json$/.test(f));
  const bySize = new Map<number, RunResult[]>();
  for (const f of files.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    const r: RunResult = JSON.parse(readFileSync(join(outDir, f), "utf8"));
    bySize.set(r.tileCount, [...(bySize.get(r.tileCount) ?? []), r]);
  }
  for (const [size, rs] of [...bySize].sort((a, b) => a[0] - b[0])) summaries[size] = summarizeRuns(rs);
  const n = Math.max(...[...bySize.values()].map((rs) => rs.length));
  const summary = { when, profile: profiles[0], durationMs, runs: n, warmup, machine, summaries };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
  const md = toMarkdown(summary as any);
  writeFileSync(join(outDir, "summary.md"), md);
  console.log("\n" + md);
}

async function measureBoard() {
  if (doBuild) build("build:bench");
  const profile = profiles[0];
  if (profiles.length > 1) throw new Error("the board bench takes one profile per invocation (its own --out)");
  const server = serve(join(appWeb, "dist-bench"));
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await launch();
  const machine = machineInfo(browser.version());
  writeFileSync(join(outDir, "machine.json"), JSON.stringify(machine, null, 2) + "\n");
  console.log(`machine: ${machine.chip}, ${machine.macOS}, Chrome ${machine.chrome}, profile ${profile.name}`);

  for (const size of sizes) {
    for (let i = 0; i < warmup + runs; i++) {
      const isWarm = i < warmup;
      console.log(`board ${size} (${profile.name}): ${isWarm ? "warm-up" : `run ${i - warmup + 1}/${runs}`}`);
      const { result } = await runOnce(browser, base, size, profile, false, i === warmup ? join(outDir, `screenshot-${size}.jpg`) : undefined);
      if (result.error) throw new Error(result.error);
      if (isWarm) continue;
      // Labelled by what the page drew, not by what was asked.
      result.driver = { profile: profile.name, loadAvg: loadAvg() };
      writeFileSync(join(outDir, `run-${result.tileCount}-${i - warmup + 1}.json`), JSON.stringify(result) + "\n");
    }
  }
  await browser.close();
  server.stop(true);
  boardSummary(machine);
}

/** One run of the largest board with the CPU profiler attached, on a build made for the profile (see vite.bench.config.ts). */
async function cpuProfile() {
  if (doBuild) build("build:bench", ["--outDir", "dist-profile"], { BENCH_PROFILE: "1" });
  const root = join(appWeb, "dist-profile");
  const server = serve(root);
  const browser = await launch();
  const big = Math.max(...sizes);
  console.log(`profile: board ${big}`);
  const { load, path } = await runOnce(browser, `http://127.0.0.1:${server.port}`, big, profiles[0], true);
  await browser.close();
  server.stop(true);
  const resolve = sourceResolver(join(root, "assets"));
  const out = { board: big, load: cpuProfileTable(load as any, resolve), path: cpuProfileTable(path as any, resolve) };
  writeFileSync(join(outDir, "cpu-profile-summary.json"), JSON.stringify(out, null, 1) + "\n");
}

// ---- Click: input to the first presented frame with the new tile ---------------------------

async function clickOnce(browser: Browser, base: string, size: number, profile: Profile, shotPath?: string): Promise<ClickRun> {
  const { context, page, errors } = await openPage(browser, profile);
  await page.goto(`${base}/bench.html?bench=${size}&mode=click`, { waitUntil: "commit" });
  await page.waitForFunction(() => (window as any).__benchClick?.ready || (window as any).__benchError, null, { timeout: 240_000, polling: 250 });
  const err = await benchError(page);
  if (err) throw new Error(err);
  const count: number = await page.evaluate(() => (window as any).__benchClick.result.placements);
  const settled = (i: number) =>
    page.evaluate((i) => {
      const l = (window as any).__benchClick.latency;
      return l.samples.length + l.misses.length > i;
    }, i);
  for (let i = 0; i < count; i++) {
    const t = await page.evaluate((i) => (window as any).__benchClick.target(i), i);
    if (!t) {
      await page.screenshot({ path: join(outDir, "error-off-screen.jpg"), type: "jpeg", quality: 80 });
      throw new Error(`placement ${i} is off screen (screenshot: error-off-screen.jpg)`);
    }
    // Aim, then click: the pointer rests on the cell first, as a player's does.
    await page.mouse.move(t.x, t.y);
    await sleep(200);
    await page.mouse.click(t.x, t.y);
    // No polling while the frame is drawn: wait, then check.
    await sleep(profile.cpuRate > 1 ? 1000 : 400);
    for (let k = 0; k < 50 && !(await settled(i)); k++) await sleep(100);
  }
  if (shotPath) await page.screenshot({ path: shotPath, type: "jpeg", quality: 80 });
  const result = await page.evaluate(() => (window as any).__benchClick.result);
  await context.close();
  if (errors.length) console.warn(`  page errors: ${errors.join(" | ")}`);
  return { ...result, profile: profile.name, driver: { loadAvg: loadAvg() } };
}

async function measureClick() {
  if (doBuild) build("build:bench");
  const server = serve(join(appWeb, "dist-bench"));
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await launch();
  const machine = machineInfo(browser.version());
  writeFileSync(join(outDir, "machine.json"), JSON.stringify(machine, null, 2) + "\n");
  for (const profile of profiles) {
    for (const size of sizes) {
      for (let i = 0; i < warmup + runs; i++) {
        const isWarm = i < warmup;
        console.log(`click ${size} (${profile.name}): ${isWarm ? "warm-up" : `run ${i - warmup + 1}/${runs}`}`);
        const shot = i === warmup ? join(outDir, `screenshot-${profile.name}-${size}.jpg`) : undefined;
        const result = await withTimeout(clickOnce(browser, base, size, profile, shot), 600_000, `click ${size}`);
        console.log(`  ${result.samples.length} placements shown, ${result.misses.length} missed`);
        if (isWarm) continue;
        writeFileSync(join(outDir, `click-${profile.name}-${result.tileCount}-${i - warmup + 1}.json`), JSON.stringify(result) + "\n");
      }
    }
  }
  await browser.close();
  server.stop(true);
  clickSummary(machine);
}

/** Raw runs of a bench in file order (numeric: run 2 before run 10), each named by its file. */
function readRuns<T>(pattern: RegExp): T[] {
  return readdirSync(outDir)
    .filter((f) => pattern.test(f))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((f) => ({ ...JSON.parse(readFileSync(join(outDir, f), "utf8")), file: f }));
}

function clickSummary(machine: unknown, when = new Date().toISOString()) {
  const results = readRuns<ClickRun>(/^click-.+\.json$/);
  const summary = { when, machine, ...summarizeClicks(results) };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
  const md = clicksToMarkdown(summary);
  writeFileSync(join(outDir, "summary.md"), md);
  console.log("\n" + md);
}

// ---- Play: the real Game page polling the mock -----------------------------------------------

/** Seconds into the session at which a tile is placed: every 7 s from 5 s, ending 5 s before the end. */
const placementTimes = (ms: number) => Array.from({ length: Math.floor((ms - 10_000) / 7000) + 1 }, (_, k) => 5000 + 7000 * k);

async function placeInGame(page: Page, mock: MockChain): Promise<boolean> {
  const next = mock.next();
  if (!next) return false;
  await page.evaluate(() => (window as any).__benchPlay.hold(true));
  await sleep(200);
  // Rotate with the game's own hotkey until the tile in hand has the placement's orientation.
  for (let k = 0; k < 4 && (await page.evaluate(() => (window as any).__benchPlay.orientation())) !== next.orientation; k++) {
    await page.keyboard.press("r");
    await sleep(100);
  }
  const t = await page.evaluate(([x, y]) => (window as any).__benchPlay.target(x, y), [next.x, next.y]);
  if (!t) throw new Error(`cell (${next.x}, ${next.y}) is off screen`);
  await page.mouse.move(t.x, t.y);
  await sleep(200);
  await page.mouse.click(t.x, t.y); // selects the cell (Game.tsx handleTileClick)
  await sleep(300);
  await page.keyboard.press("c"); // confirms (Game.tsx hotkey -> handleConfirm -> build)
  await sleep(800);
  await page.evaluate(() => (window as any).__benchPlay.hold(false));
  return true;
}

async function playOnce(browser: Browser, base: string, profile: Profile, mock: MockChain, shotPath?: string): Promise<PlayRun> {
  mock.reset();
  const { context, page, errors } = await openPage(browser, profile);
  await page.goto(`${base}/bench.html?mode=play&tiles=72`, { waitUntil: "commit" });
  await page.waitForFunction(() => (window as any).__benchPlay?.ready || (window as any).__benchError, null, { timeout: 240_000, polling: 250 });
  const err = await benchError(page);
  if (err) throw new Error(err);
  await page.evaluate((d) => (window as any).__benchPlay.start(d), durationMs);
  const t0 = Date.now();
  let attempted = 0;
  for (const at of placementTimes(durationMs)) {
    await sleep(Math.max(0, t0 + at - Date.now()));
    if (await placeInGame(page, mock)) attempted++;
  }
  await sleep(Math.max(0, t0 + durationMs - Date.now()));
  const result = await page.evaluate(() => (window as any).__benchPlay.stop());
  if (shotPath) await page.screenshot({ path: shotPath, type: "jpeg", quality: 80 });
  await context.close();
  const pageErrors = errors.filter((e) => !e.startsWith("Failed to load resource"));
  if (pageErrors.length) console.warn(`  page errors: ${pageErrors.slice(0, 5).join(" | ")}`);
  if (mock.unknown.size) console.warn(`  mock: unanswered RPC methods ${[...mock.unknown].join(", ")}`);
  return {
    ...result,
    profile: profile.name,
    driver: { loadAvg: loadAvg(), attempted, applied: mock.placed, mockCalls: mock.calls.slice(), pageErrors },
  };
}

async function measurePlay() {
  const playRoot = join(appWeb, "dist-bench", "play");
  if (doBuild) build("build:bench", ["--outDir", "dist-bench/play"], { BENCH_PLAY: "1" });
  // A later board or click build empties dist-bench, this build with it.
  if (!existsSync(join(playRoot, "bench.html"))) throw new Error(`no in-play build in ${playRoot}: run without --no-build`);
  const mock = createMockChain(fixtures, 72);
  const server = serve(playRoot, mock);
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await launch();
  const machine = machineInfo(browser.version());
  writeFileSync(join(outDir, "machine.json"), JSON.stringify(machine, null, 2) + "\n");
  for (const profile of profiles) {
    for (let i = 0; i < warmup + runs; i++) {
      const isWarm = i < warmup;
      console.log(`play (${profile.name}): ${isWarm ? "warm-up" : `run ${i - warmup + 1}/${runs}`}`);
      const shot = i === warmup ? join(outDir, `screenshot-${profile.name}.jpg`) : undefined;
      const result = await withTimeout(playOnce(browser, base, profile, mock, shot), durationMs + 600_000, "play");
      console.log(`  ${result.driver.applied}/${result.driver.attempted} placements applied, ${result.confirms.length} shown`);
      if (isWarm) continue;
      writeFileSync(join(outDir, `play-${profile.name}-${i - warmup + 1}.json`), JSON.stringify(result) + "\n");
    }
  }
  await browser.close();
  server.stop(true);
  playSummary(machine);
}

function playSummary(machine: unknown, when = new Date().toISOString()) {
  const results = readRuns<PlayRun>(/^play-.+\.json$/);
  const summary = { when, machine, ...summarizePlays(results) };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
  const md = playsToMarkdown(summary);
  writeFileSync(join(outDir, "summary.md"), md);
  console.log("\n" + md);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  if (summarizeOnly) {
    const machine = JSON.parse(readFileSync(join(outDir, "machine.json"), "utf8"));
    // Keep the date of the measure, not of the recomputation.
    const old = existsSync(join(outDir, "summary.json")) ? JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) : {};
    if (kind === "click") clickSummary(machine, old.when);
    else if (kind === "play") playSummary(machine, old.when);
    else boardSummary(machine, old.when);
    return;
  }
  // Keep the display awake: a sleeping display stops requestAnimationFrame.
  const caffeinate = spawn("caffeinate", ["-d", "-i"], { stdio: "ignore" });
  try {
    if (kind === "click") await measureClick();
    else if (kind === "play") await measurePlay();
    else {
      if (!profileOnly) await measureBoard();
      if (doProfile) await cpuProfile();
    }
  } finally {
    caffeinate.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
