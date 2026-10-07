// Client bench driver. Run on the Mac, from packages/app-web:  bun run bench
//
// Builds the bench page, serves it from a local static server, and drives new headless Chrome with the
// real GPU (ANGLE on Metal; no window, owner's rule of 2026-10-07) through Playwright. Three benches (method: docs/measures/client-baseline.md):
//
//   bun run bench                         frame time along the camera path, unthrottled (baseline B)
//   bun run bench --profiles throttled    the same under the throttled profile (P-7)
//   bun run bench --click                 click-to-display latency, both profiles
//   bun run bench --play                  the real Game page against a local mock of the RPC, both profiles
//
// Profiles: `unthrottled` (the machine as it is) and `throttled` (CDP CPU throttling 4x and a
// 60 Hz requestAnimationFrame cap, see frame-cap.ts). Each run is one fresh browser context;
// raw JSON of every run, a summary JSON and a markdown table go under docs/measures/client-baseline/.
//
// Options: --profiles unthrottled,throttled  --sizes 38,72  --runs 5  --warmup 1  --duration <ms>
//          --no-build  --profile  --profile-only  --summarize-only  --out <dir>  --window 1440x900
//          --trial (the 10-second trial: one throttled board run of 10 s at 72 tiles, output under the
//          system temp dir only; prints the WebGL renderer, the launch args and whether gpuMs is present)
//          --headless [--chromium <path>] (smoke runs off the Mac, e.g. on the VPS: software
//          rendering, no GPU; figures not comparable; output under the system temp dir by default;
//          marked as a smoke run in summary.md and summary.json, and refused with --out under
//          docs/measures/)
// There is no on-screen or off-screen mode: --offscreen and --window-position are refused. A GPU-mode run
// fails before any figure is written when the WebGL renderer is SwiftShader or gpuMs is null.
//          --fail-placements (--play self-test of the run's checks: the mock reverts every build,
//          the run must fail)
//
// The bench is not standalone: it imports the mock's codec and addresses from the client workspace
// (packages/chain, packages/app-web/src/bench), so `bun install` at the repository root comes first.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { loadavg, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { SourceMapConsumer } from "source-map-js";
import { chromium } from "playwright-core";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { capFrameRate } from "./frame-cap";
import { TRIAL, checkGpu, launchArgs, parseMode, probeGpu } from "./launch";
import type { GpuFacts } from "./launch";
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
const { mode, trial } = parseMode(process.argv);
const kind: "board" | "click" | "play" = trial ? TRIAL.kind : arg("click") ? "click" : arg("play") ? "play" : "board";

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
const profiles = (trial ? TRIAL.profile : (arg("profiles", kind === "board" ? "unthrottled" : "unthrottled,throttled") as string))
  .split(",")
  .map((p) => {
    if (!PROFILES[p]) throw new Error(`unknown profile ${p} (unthrottled, throttled)`);
    return PROFILES[p];
  });
const sizes = (trial ? String(TRIAL.size) : (arg("sizes", "38,72") as string)).split(",").map(Number);
const runs = trial ? TRIAL.runs : Number(arg("runs", kind === "play" ? "3" : "5"));
const warmup = trial ? TRIAL.warmup : Number(arg("warmup", "1"));
const durationMs = trial ? TRIAL.durationMs : Number(arg("duration", kind === "play" ? "60000" : "20000"));
/** Below these a run measures too little: a path of a few frames, a session with fewer than two placements. */
const MIN_DURATION_MS = { board: 5000, click: 0, play: 17_000 };
const [winW, winH] = (arg("window", "1440x900") as string).split("x").map(Number);
const defaultOut =
  kind === "board" ? (profiles.length === 1 && profiles[0].name === "throttled" ? join(measures, "throttled") : measures) : join(measures, kind);
const failPlacements = arg("fail-placements") !== undefined;
const doBuild = arg("no-build") === undefined;
/** The software smoke mode; every other run is new headless with the GPU. */
const headless = mode === "smoke";
const launchArguments = launchArgs(mode, winW, winH);
const chromiumPath = arg("chromium");
// A headless smoke run never writes into docs/measures unless --out says so.
const outDir = resolve(
  trial ? join(tmpdir(), "paved-bench-trial") : (arg("out", headless ? join(tmpdir(), "paved-bench-headless", kind) : defaultOut) as string),
);
const profileOnly = arg("profile-only") !== undefined;
const doProfile = arg("profile") !== undefined || profileOnly;
const summarizeOnly = arg("summarize-only") !== undefined;

/** Refuses the arguments that would make a run measure nothing. */
function checkArguments(): void {
  const bad = (what: string): never => {
    throw new Error(`${what}`);
  };
  if (!Number.isFinite(durationMs)) bad(`--duration ${arg("duration")} is not a number of milliseconds`);
  if (kind !== "click" && durationMs < MIN_DURATION_MS[kind]) {
    bad(`--duration ${durationMs} ms is too short for the ${kind} bench (minimum ${MIN_DURATION_MS[kind]} ms${kind === "play" ? ": at least two placements" : ""})`);
  }
  if (!Number.isInteger(runs) || runs < 1) bad(`--runs ${arg("runs")}: at least one measured run`);
  if (!Number.isInteger(warmup) || warmup < 0) bad(`--warmup ${arg("warmup")}: a count, 0 or more`);
  if (sizes.length === 0 || sizes.some((n) => !Number.isInteger(n) || n <= 0)) bad(`--sizes ${arg("sizes")}: tile counts such as 38,72`);
  if (failPlacements && kind !== "play") bad("--fail-placements applies to --play");
  if (trial && headless) bad("--trial runs the GPU mode: it cannot be combined with --headless (smoke)");
  if (trial && arg("out") !== undefined) bad("--trial writes under the system temp dir only: --out is refused");
  // A smoke run is not a measure: it never lands where the measures are committed.
  const measuresRoot = join(repo, "docs/measures");
  if (headless && (outDir === measuresRoot || outDir.startsWith(measuresRoot + sep))) {
    bad(`--headless is for smoke runs: figures are not comparable, so --out ${outDir} (under docs/measures/) is refused`);
  }
}

const sh = (cmd: string, args: string[]): string =>
  (spawnSync(cmd, args, { encoding: "utf8" }).stdout ?? "").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Load average (1, 5, 15 min) of the machine, recorded with every run. */
const loadAvg = (): number[] => loadavg();

/** A smoke run says so on top of its table, wherever the table goes. */
const isSmoke = (machine: unknown): boolean => String((machine as { window?: string } | null)?.window ?? "").includes("smoke");
const SMOKE_BANNER = "> **Headless smoke run: not a measure.** Software rendering, no GPU, another machine: the figures are not comparable with any committed one and are never committed.\n\n";
const withBanner = (md: string, machine: unknown) => (isSmoke(machine) ? SMOKE_BANNER : "") + md;

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
    window: headless ? "headless (smoke, not comparable)" : "headless new",
    launchArgs: launchArguments,
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
  // No window: the size is a viewport.
  const context = await browser.newContext({ viewport: { width: winW, height: winH } });
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
  headless
    ? chromium.launch({
        headless: true,
        ...(chromiumPath ? { executablePath: chromiumPath } : {}),
        args: launchArguments,
      })
    : chromium.launch({
        // New headless: the full browser, no window, GPU process kept. Playwright 1.49 starts new headless
        // with channel "chromium" (its own Chromium build: `bunx playwright-core@1.49.1 install chromium`).
        channel: "chromium",
        headless: true,
        args: launchArguments,
      });

/** The browser, after a preflight on a blank page: in GPU mode the run is refused before any figure when the renderer is software or has no GPU timer. */
async function launchChecked(): Promise<Browser> {
  const browser = await launchChecked();
  if (headless) return browser;
  try {
    const page = await browser.newPage();
    const facts: GpuFacts = await page.evaluate(probeGpu);
    await page.close();
    checkGpu(facts);
  } catch (e) {
    await browser.close();
    throw e;
  }
  return browser;
}

/** The profile the raw runs were measured under: they say it (`driver.profile`); an older raw folder is read from its summary. */
function profileOfRuns(runs: RunResult[], old: { profile?: Profile }): Profile {
  const names = new Set(runs.map((r) => r.driver?.profile).filter((p): p is string => Boolean(p)));
  if (names.size > 1) throw new Error(`raw runs in ${outDir} were measured under different profiles: ${[...names].join(", ")}`);
  const name = [...names][0];
  if (name) {
    if (!PROFILES[name]) throw new Error(`raw runs name an unknown profile ${name}`);
    return PROFILES[name];
  }
  // Raw files from before the driver recorded it: the summary written with them, else the arguments.
  return old.profile ?? profiles[0];
}

function boardSummary(machine: unknown, when = new Date().toISOString(), old: { profile?: Profile; warmup?: number } = {}) {
  const summaries: Record<string, ReturnType<typeof summarizeRuns>> = {};
  const files = readdirSync(outDir).filter((f) => /^run-\d+-\d+\.json$/.test(f));
  const bySize = new Map<number, RunResult[]>();
  const all: RunResult[] = [];
  for (const f of files.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    const r: RunResult = JSON.parse(readFileSync(join(outDir, f), "utf8"));
    all.push(r);
    bySize.set(r.tileCount, [...(bySize.get(r.tileCount) ?? []), r]);
  }
  if (all.length === 0) throw new Error(`no raw run-<tiles>-<n>.json in ${outDir}`);
  for (const [size, rs] of [...bySize].sort((a, b) => a[0] - b[0])) summaries[size] = summarizeRuns(rs);
  const n = Math.max(...[...bySize.values()].map((rs) => rs.length));
  // The path length of the raw runs, not of this invocation's --duration.
  const durations = new Set(all.map((r) => r.durationMs));
  if (durations.size > 1) throw new Error(`raw runs in ${outDir} have different path durations: ${[...durations].join(", ")} ms`);
  const summary = { when, profile: profileOfRuns(all, old), durationMs: [...durations][0], runs: n, warmup: old.warmup ?? warmup, machine, summaries };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
  const md = withBanner(toMarkdown(summary as any), machine);
  writeFileSync(join(outDir, "summary.md"), md);
  console.log("\n" + md);
}

async function measureBoard() {
  if (doBuild) build("build:bench");
  const profile = profiles[0];
  if (profiles.length > 1) throw new Error("the board bench takes one profile per invocation (its own --out)");
  const server = serve(join(appWeb, "dist-bench"));
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await launchChecked();
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
      // GPU mode: the run itself must show a hardware renderer and GPU times, before its file is written.
      if (!headless) checkGpu({ renderer: result.gl?.renderer, gpuMs: result.gpuMs });
      // Labelled by what the page drew, not by what was asked.
      result.driver = { profile: profile.name, loadAvg: loadAvg() };
      writeFileSync(join(outDir, `run-${result.tileCount}-${i - warmup + 1}.json`), JSON.stringify(result) + "\n");
    }
  }
  await browser.close();
  server.stop(true);
  boardSummary(machine);
  if (trial) {
    const raw = JSON.parse(readFileSync(join(outDir, "run-72-1.json"), "utf8")) as RunResult;
    console.log("\ntrial (new headless, no window):");
    console.log(`  WebGL renderer: ${raw.gl.renderer}`);
    console.log(`  launch args: ${machine.launchArgs.join(" ")}`);
    console.log(`  Chrome: ${machine.chrome}`);
    console.log(`  gpuMs present: ${raw.gpuMs && raw.gpuMs.length ? "yes" : "no"}`);
    console.log(`  output: ${outDir}`);
  }
}

/** One run of the largest board with the CPU profiler attached, on a build made for the profile (see vite.bench.config.ts). */
async function cpuProfile() {
  if (doBuild) build("build:bench", ["--outDir", "dist-profile"], { BENCH_PROFILE: "1" });
  const root = join(appWeb, "dist-profile");
  const server = serve(root);
  const browser = await launchChecked();
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
  const browser = await launchChecked();
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
  const md = withBanner(clicksToMarkdown(summary), machine);
  writeFileSync(join(outDir, "summary.md"), md);
  console.log("\n" + md);
}

// ---- Play: the real Game page against the mock ------------------------------------------------

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
  if (!t) {
    const camera = await page.evaluate(() => {
      const s = (window as any).__benchPlay.scene;
      return { position: s.camera.position.toArray(), target: s.controls.controls.target.toArray(), canvas: [s.renderer.domElement.clientWidth, s.renderer.domElement.clientHeight] };
    });
    throw new Error(`cell (${next.x}, ${next.y}) is off screen; camera ${JSON.stringify(camera)}`);
  }
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
  try {
    return await playSession(page, errors, base, profile, mock, shotPath);
  } finally {
    await context.close();
  }
}

async function playSession(page: Page, errors: string[], base: string, profile: Profile, mock: MockChain, shotPath?: string): Promise<PlayRun> {
  await page.goto(`${base}/bench.html?mode=play&tiles=72`, { waitUntil: "commit" });
  try {
    await page.waitForFunction(() => (window as any).__benchPlay?.ready || (window as any).__benchError, null, { timeout: Number(arg("ready-timeout", "240000")), polling: 250 });
  } catch (error) {
    const text = await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").slice(0, 120) ?? "").catch(() => "");
    const state = await page
      .evaluate(() => {
        const b = (window as any).__benchPlay;
        const groups = b?.scene?.tiles?.getGroup?.().children ?? [];
        return b ? { scene: Boolean(b.scene), ttiMs: b.ttiMs, refreshMs: b.refreshMs, groups: groups.map((g: any) => `${g.name || g.type}:${g.children?.length}`), frames: b.cpuMs?.length ?? null } : null;
      })
      .catch(() => null);
    console.warn(`  bench state at the timeout: ${JSON.stringify(state)}`);
    throw new Error(`play: page not ready (${String(error).split("\n")[0]}); page shows "${text}"; page errors: ${errors.slice(0, 5).join(" | ") || "none"}`);
  }
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
  const pageErrors = errors.filter((e) => !e.startsWith("Failed to load resource"));
  if (pageErrors.length) console.warn(`  page errors: ${pageErrors.slice(0, 5).join(" | ")}`);
  if (mock.unknown.size) console.warn(`  mock: unanswered RPC methods ${[...mock.unknown].join(", ")}`);
  const applied = mock.placed;
  const fail = (why: string) => {
    throw new Error(`play: ${why} (${attempted} placements attempted, ${applied} applied; page errors: ${pageErrors.slice(0, 3).join(" | ") || "none"})`);
  };
  // A session that is not play, or that the mock did not follow, measures something else: refuse it.
  if (mock.violations.length) {
    const kinds = new Map<string, number>();
    for (const v of mock.violations) kinds.set(v.kind, (kinds.get(v.kind) ?? 0) + 1);
    const first = mock.violations[0];
    fail(`the mock recorded ${mock.violations.length} unexpected calls (${[...kinds].map(([k, n]) => `${k} x${n}`).join(", ")}; first: ${first.kind}: ${first.detail})`);
  }
  if (applied === 0) fail("no placement reached the chain: an idle page, not play");
  if (applied !== attempted) fail("the placements applied differ from the placements attempted");
  return {
    ...result,
    profile: profile.name,
    driver: { loadAvg: loadAvg(), attempted, applied, mockCalls: mock.calls.slice(), pageErrors },
  };
}

async function measurePlay() {
  const playRoot = join(appWeb, "dist-bench", "play");
  if (doBuild) build("build:bench", ["--outDir", "dist-bench/play"], { BENCH_PLAY: "1" });
  // A later board or click build empties dist-bench, this build with it.
  if (!existsSync(join(playRoot, "bench.html"))) throw new Error(`no in-play build in ${playRoot}: run without --no-build`);
  const mock = createMockChain(fixtures, 72, { revertBuilds: failPlacements });
  const server = serve(playRoot, mock);
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await launchChecked();
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
  const md = withBanner(playsToMarkdown(summary), machine);
  writeFileSync(join(outDir, "summary.md"), md);
  console.log("\n" + md);
}

async function main() {
  checkArguments();
  mkdirSync(outDir, { recursive: true });
  if (summarizeOnly) {
    const machine = JSON.parse(readFileSync(join(outDir, "machine.json"), "utf8"));
    // Keep the date of the measure, not of the recomputation.
    const old = existsSync(join(outDir, "summary.json")) ? JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) : {};
    if (kind === "click") clickSummary(machine, old.when);
    else if (kind === "play") playSummary(machine, old.when);
    else boardSummary(machine, old.when, old);
    return;
  }
  // No window and no display: nothing to keep awake.
  if (kind === "click") await measureClick();
  else if (kind === "play") await measurePlay();
  else {
    if (!profileOnly) await measureBoard();
    if (doProfile) await cpuProfile();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
