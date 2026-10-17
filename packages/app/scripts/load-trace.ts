/**
 * The board's load timeline (LOAD-FAST): opens a page that mounts the renderer, cold or warm cache, with the renderer's
 * load trace on (`globalThis.__PAVED_LOAD_TRACE__`, `packages/renderer/src/core/load-trace.ts`), and prints, per run, the
 * time from navigation to each step: the manifest, the models (count, bytes, parallelism, protocol, the decode of each
 * after its download), the meshopt decoder, the tile images, the edges, the labels, the first frame (the first 3D tiles)
 * and every model in. Headless Chromium: software WebGL (SwiftShader) unless the machine gives it a GPU, so the first
 * frame's shader compiles and uploads are not a GPU figure. Method and figures: `docs/client/v2-architecture.md`, "Loading".
 *
 *   node scripts/load-trace.ts --url '<page>' [--runs 5] [--cache cold|warm] [--profile desktop|phone] [--json <file>]
 *     [--cpuprofile <file>]   (the measured load's CPU profile, DevTools' format, last run)
 *
 * `desktop`: 1440 x 900 at DPR 2, no throttling. `phone`: 360 x 780 at DPR 3, the CPU slowed 4x and the network shaped to
 * 9 Mbit/s down, 170 ms round trip (an approximation of a phone on 4G: the CPU and the GPU are still this machine's).
 * Warm: the page is loaded once in the same browser context (same HTTP cache), then measured on a second navigation.
 * Needs `bunx playwright-core install chromium-headless-shell` once.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium, type CDPSession, type Page } from "playwright-core";

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    runs: { type: "string", default: "5" },
    cache: { type: "string", default: "cold" },
    profile: { type: "string", default: "desktop" },
    json: { type: "string" },
    timeout: { type: "string", default: "90000" },
    cpuprofile: { type: "string" },
  },
});
if (!args.url) throw new Error("load-trace: --url <page> is required");
if (args.cache !== "cold" && args.cache !== "warm") throw new Error("load-trace: --cache is cold or warm");

const PROFILES = {
  desktop: { width: 1440, height: 900, dpr: 2, cpu: 1, network: null },
  phone: { width: 360, height: 780, dpr: 3, cpu: 4, network: { download: (9e6 / 8) | 0, upload: (1.5e6 / 8) | 0, latency: 170 } },
} as const;
const profile = PROFILES[args.profile as keyof typeof PROFILES];
if (!profile) throw new Error("load-trace: --profile is desktop or phone");

/** A request of the page, from the DevTools protocol (the protocol and the cache are not in the resource timing). */
interface Request {
  url: string;
  protocol?: string;
  status?: number;
  fromCache: boolean;
  bytes: number;
  cacheControl?: string;
}

interface Entry {
  name: string;
  startTime: number;
  duration: number;
}

interface Resource extends Entry {
  responseEnd: number;
  transferSize: number;
  encodedBodySize: number;
}

/** What one load gives: the page's own entries (ms from its navigation) and the requests. */
interface Capture {
  marks: Entry[];
  measures: Entry[];
  resources: Resource[];
  requests: Request[];
  longTasks: Entry[];
}

const isModel = (url: string) => /\.glb(\?|$)/.test(url);
const isTile = (url: string) => /\/tiles\/[^/]+\.png(\?|$)/.test(url);

async function shape(cdp: CDPSession): Promise<void> {
  await cdp.send("Network.enable");
  if (profile.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  if (profile.network) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.network.latency,
      downloadThroughput: profile.network.download,
      uploadThroughput: profile.network.upload,
    });
  }
}

function watchRequests(cdp: CDPSession): Request[] {
  const byId = new Map<string, Request>();
  const all: Request[] = [];
  cdp.on("Network.responseReceived", (e) => {
    const headers = e.response.headers as Record<string, string>;
    const cacheControl = Object.entries(headers).find(([k]) => k.toLowerCase() === "cache-control")?.[1];
    const request: Request = { url: e.response.url, protocol: e.response.protocol, status: e.response.status, fromCache: !!(e.response.fromDiskCache || e.response.fromMemoryCache), bytes: 0, cacheControl };
    byId.set(e.requestId, request);
    all.push(request);
  });
  cdp.on("Network.loadingFinished", (e) => {
    const request = byId.get(e.requestId);
    if (request) request.bytes = e.encodedDataLength;
  });
  return all;
}

async function load(page: Page, url: string, timeout: number): Promise<Capture> {
  await page.goto(url, { waitUntil: "load", timeout });
  await page.waitForFunction(() => performance.getEntriesByName("paved:all-loaded").length > 0, undefined, { timeout, polling: 100 });
  // One frame more: the last model's tiles are drawn in the frame after it comes in.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.evaluate(() => {
    const pick = (e: PerformanceEntry) => ({ name: e.name, startTime: e.startTime, duration: e.duration });
    const paved = (type: string) => performance.getEntriesByType(type).filter((e) => e.name.startsWith("paved:")).map(pick);
    const resources = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).map((e) => ({
      ...pick(e),
      responseEnd: e.responseEnd,
      transferSize: e.transferSize,
      encodedBodySize: e.encodedBodySize,
    }));
    const longTasks = ((globalThis as { __longTasks?: PerformanceEntry[] }).__longTasks ?? []).map(pick);
    return { marks: paved("mark"), measures: paved("measure"), resources, requests: [], longTasks };
  });
}

/** The largest number of requests in flight at once among `spans` (start, end). */
function parallelism(spans: Array<[number, number]>): number {
  const events = spans.flatMap(([s, e]) => [[s, 1], [e, -1]] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let most = 0;
  for (const [, d] of events) most = Math.max(most, (open += d));
  return most;
}

const round = (ms: number | undefined) => (ms === undefined ? null : Math.round(ms));

function summarise(c: Capture) {
  const mark = (name: string) => c.marks.find((m) => m.name === `paved:${name}`)?.startTime;
  const measures = (prefix: string) => c.measures.filter((m) => m.name.startsWith(`paved:${prefix}`));
  const end = (m: Entry) => m.startTime + m.duration;
  const manifest = measures("manifest")[0];
  const models = c.resources.filter((r) => isModel(r.name));
  const tiles = c.resources.filter((r) => isTile(r.name));
  const modelLoads = measures("model ");
  // Decode: from the end of a model's download to its load's end (GLTFLoader's parse, the meshopt decode in the workers).
  const decodes = modelLoads
    .map((m) => {
      const url = m.name.slice("paved:model ".length);
      const resource = models.find((r) => r.name.endsWith(url.replace(/^\.?\/?/, "")) || new URL(r.name).pathname === url);
      return resource ? end(m) - resource.responseEnd : undefined;
    })
    .filter((d): d is number => d !== undefined);
  const firstFrame = measures("first-frame")[0];
  const sum = (xs: Entry[]) => xs.reduce((t, m) => t + m.duration, 0);
  const sorted = [...decodes].sort((a, b) => a - b);
  const modelRequests = c.requests.filter((r) => isModel(r.url));
  return {
    initStart: round(mark("init-start")),
    manifestEnd: round(manifest && end(manifest)),
    manifestMs: round(manifest?.duration),
    meshoptReadyMs: round(measures("meshopt-ready")[0]?.duration),
    models: models.length,
    modelBytes: models.reduce((t, r) => t + r.transferSize, 0),
    modelBodyBytes: models.reduce((t, r) => t + r.encodedBodySize, 0),
    modelsFromCache: modelRequests.filter((r) => r.fromCache).length,
    modelStatus304: modelRequests.filter((r) => r.status === 304).length,
    modelFirstStart: round(Math.min(...models.map((r) => r.startTime))),
    modelLastEnd: round(Math.max(...models.map((r) => r.responseEnd))),
    modelParallelism: parallelism(models.map((r) => [r.startTime, r.responseEnd])),
    protocol: [...new Set(modelRequests.map((r) => r.protocol))].join(","),
    decodeMedianMs: round(sorted[sorted.length >> 1]),
    decodeMaxMs: round(sorted[sorted.length - 1]),
    tiles: tiles.length,
    tilesLoaded: round(mark("tiles-loaded")),
    edgesMs: round(sum(measures("edges"))),
    edgesCalls: measures("edges").length,
    labelsMs: round(sum(measures("labels"))),
    labelsCalls: measures("labels").length,
    firstModelsLoaded: round(mark("first-models-loaded")),
    firstFrameMs: round(firstFrame?.duration),
    firstTileDrawn: round(firstFrame && end(firstFrame)),
    allLoaded: round(mark("all-loaded")),
    longTasksOver50: c.longTasks.length,
    requests: c.requests.length,
    bytes: c.requests.reduce((t, r) => t + r.bytes, 0),
  };
}

const timeout = Number(args.timeout);
const runs: Array<ReturnType<typeof summarise> & { capture: Capture }> = [];
for (let run = 0; run < Number(args.runs); run++) {
  const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr });
    await context.addInitScript(() => {
      (globalThis as { __PAVED_LOAD_TRACE__?: boolean }).__PAVED_LOAD_TRACE__ = true;
      const tasks: PerformanceEntry[] = [];
      (globalThis as { __longTasks?: PerformanceEntry[] }).__longTasks = tasks;
      try {
        new PerformanceObserver((list) => tasks.push(...list.getEntries())).observe({ type: "longtask", buffered: true });
      } catch {
        // No long-task timing in this browser: the count stays 0.
      }
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await shape(cdp);
    if (args.cache === "warm") await load(page, args.url, timeout);
    const requests = watchRequests(cdp);
    if (args.cpuprofile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
      await cdp.send("Profiler.start");
    }
    const capture = await load(page, args.url, timeout);
    if (args.cpuprofile) writeFileSync(args.cpuprofile, JSON.stringify((await cdp.send("Profiler.stop")).profile));
    capture.requests = requests;
    const summary = summarise(capture);
    runs.push({ ...summary, capture });
    console.log(JSON.stringify({ run, profile: args.profile, cache: args.cache, ...summary }));
  } finally {
    await browser.close();
  }
}

const median = (key: keyof ReturnType<typeof summarise>) => {
  const xs = runs.map((r) => r[key]).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  return xs.length ? xs[xs.length >> 1] : null;
};
const keys = Object.keys(runs[0] ?? {}).filter((k) => k !== "capture" && k !== "protocol") as Array<keyof ReturnType<typeof summarise>>;
console.log(JSON.stringify({ median: Object.fromEntries(keys.map((k) => [k, median(k)])), protocol: runs[0]?.protocol, runs: runs.length, profile: args.profile, cache: args.cache, url: args.url }));
if (args.json) writeFileSync(args.json, JSON.stringify(runs, null, 2));
