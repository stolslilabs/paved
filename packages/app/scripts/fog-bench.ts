/**
 * FOG-STUDY: the frame time of the board with the fog off and in each variant, on a phone profile (375 x 812 at DPR 3, CPU
 * throttled 4x through CDP), at the Medium tier and the Low tier, on the stories `Renderer/Fog of war` (the recorded 72-tile board
 * at the game's opening camera; the village's 38 cells; the board of three tiles placing one every 36 frames, for the lift).
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/fog-bench.ts [--url http://localhost:6006] [--rounds 3] [--warm 30] [--frames 120] [--gpu] [--headed]
 *
 * Each run opens a fresh page (a fresh WebGL context), waits for the board, stops the render loop and draws frames one by one: the
 * ambient time moved 1/30 s, then, timed together, the fog stepped (its drift, a lift's field built and sent), `scene.render()` and
 * `gl.finish()`. A frame's time holds the fog's step, the draw's CPU work and the GPU's. Warm-up frames are dropped; the rounds
 * alternate the order of the configurations. The "lift" run places a tile every 36 frames (the move's React commit is outside the
 * timed part) and reports apart the frames drawn while a cell lifts. On the Low tier the fog stands still (no drift, no lift).
 *
 * Without `--gpu` it runs headless on SwiftShader (software WebGL): its figures show the relative cost on this machine, not a
 * device's frame time. `--gpu` runs headless Chromium on the machine's GPU (no window; `--headed` opens one); the table names
 * the WebGL renderer it got. Node 24 runs it as is (type stripping).
 */
import { chromium } from "playwright-core";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const URL_BASE = arg("url", "http://localhost:6006");
const ROUNDS = Number(arg("rounds", "3"));
const WARM = Number(arg("warm", "30"));
const FRAMES = Number(arg("frames", "120"));
const GPU = process.argv.includes("--gpu");
const HEADED = process.argv.includes("--headed");
const ONLY = arg("only", "");

interface Config {
  story: string;
  args?: string;
  /** Place a tile every this many frames (the lift). */
  placeEvery?: number;
}
const VARIANTS: ReadonlyArray<readonly [string, Config]> = [
  ["off", { story: "off" }],
  ["hard edge", { story: "hard-edge" }],
  ["soft falloff + mist", { story: "soft-falloff" }],
  ["landscape (soft, props)", { story: "landscape" }],
  ["village (38 cells, landscape)", { story: "village" }],
  ["lift (3 tiles + 1 every 36 frames, landscape)", { story: "interactive", args: "interactive:!false", placeEvery: 36 }],
  // The owner's choice (#648): the Landscape story as it is (falloff 2.5, billow 0.7), every corner rounded (the default).
  ["chosen: landscape, rounded corners", { story: "landscape" }],
  ["chosen: village (38 cells)", { story: "village", args: "billow:0.7" }],
  ["chosen: lift (3 tiles + 1 every 36 frames)", { story: "interactive", args: "interactive:!false;falloff:2.5;billow:0.7", placeEvery: 36 }],
  ["chosen, corners sharp", { story: "landscape", args: "cornerRadius:0" }],
];
/** `--only off,chosen`: the configurations whose name holds one of these. */
const ONLY_ANY = ONLY ? ONLY.split(",") : [];
const CONFIGS = VARIANTS.flatMap(([name, c]) =>
  (["medium", "low"] as const).filter((q) => !(c.placeEvery && q === "low")).map((quality) => [`${name} | ${quality}`, { ...c, quality }] as const),
).filter(([name]) => !ONLY_ANY.length || ONLY_ANY.some((o) => name.includes(o)));

interface Run {
  times: number[];
  lifting: number[];
  calls: number;
  fogDraws: number;
  props: number;
  mode: string;
  tier: string;
  webgl: string;
  size: number[];
  buildMs: number[];
}

const browser = await chromium.launch(
  GPU
    ? { headless: !HEADED, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] }
    : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);
const results = new Map<string, { times: number[]; lifting: number[]; buildMs: number[]; calls: Set<number>; run: Run }>();
const quantile = (values: number[], q: number) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))]! : Number.NaN);

for (let round = 0; round < ROUNDS; round++) {
  for (const [name, config] of round % 2 ? [...CONFIGS].reverse() : CONFIGS) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3 });
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`${URL_BASE}/iframe.html?id=renderer-fog-of-war--${config.story}&viewMode=story${config.args ? `&args=${config.args}` : ""}`, { timeout: 180_000, waitUntil: "commit" });
    await page.waitForSelector("[data-ready]", { timeout: 300_000 });
    await page.waitForTimeout(1500);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    // The tier as the game's settings give it; the fog's mode as the story's `fogMode` gives it for the tier (still on Low).
    await page.evaluate((quality) => {
      const scene = (window as any).__fogScene;
      const fog = (window as any).__fog;
      scene.stop();
      scene.setFrameObserver(null);
      scene.setSettings({ ...scene.getSettings(), quality });
      if (fog.stats().mode !== "off") fog.setMode(scene.getQuality() === "low" ? "still" : "moving");
    }, config.quality);
    const times: number[] = [];
    const lifting: number[] = [];
    const buildMs: number[] = [];
    let calls = 0;
    for (let f = 0; f < WARM + FRAMES; f++) {
      if (config.placeEvery && f % config.placeEvery === config.placeEvery - 1) {
        await page.evaluate(() => (window as any).__fogPlace());
        // The move's React commit (the tiles, the reveal) in a task of its own, outside the timed frame.
        await page.waitForTimeout(60);
      }
      const frame: { ms: number; calls: number; lifting: boolean; buildMs: number } = await page.evaluate(async () => {
        // The story exposes its scene and fog (`FogBoard`); typed loosely, the script imports nothing of the renderer.
        const scene = (window as any).__fogScene;
        const fog = (window as any).__fog;
        const gl = scene.renderer.getContext();
        const info = scene.renderer.info;
        info.autoReset = false;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        scene.ambient.time.value += 1 / 30;
        const builds = fog.stats().fieldBuilds;
        const wasLifting = fog.stats().lifting;
        info.reset();
        const start = performance.now();
        fog.step(scene.ambient.time.value);
        scene.render();
        gl.finish();
        const ms = performance.now() - start;
        const stats = fog.stats();
        return { ms, calls: info.render.calls, lifting: wasLifting, buildMs: stats.fieldBuilds > builds ? stats.buildMs : -1 };
      });
      calls = frame.calls;
      if (f < WARM) continue;
      times.push(frame.ms);
      if (frame.lifting) lifting.push(frame.ms);
      if (frame.buildMs >= 0) buildMs.push(frame.buildMs);
    }
    const run: Run = await page.evaluate(() => {
      const scene = (window as any).__fogScene;
      const stats = (window as any).__fog.stats();
      return { times: [], lifting: [], buildMs: [], calls: 0, fogDraws: stats.drawCalls, props: stats.props, mode: stats.mode, tier: scene.getQuality(), webgl: scene.getWebGL().renderer ?? "unknown", size: [scene.renderer.domElement.width, scene.renderer.domElement.height] };
    });
    await page.close();
    const entry = results.get(name) ?? { times: [], lifting: [], buildMs: [], calls: new Set<number>(), run };
    entry.times.push(...times);
    entry.lifting.push(...lifting);
    entry.buildMs.push(...buildMs);
    entry.calls.add(calls);
    results.set(name, entry);
    console.error(`round ${round + 1} ${name}: p95 ${quantile(times, 0.95).toFixed(1)} ms (${run.mode}, ${run.fogDraws} fog draws, ${run.props} props)`);
  }
}

console.log("| variant | tier | fog | frames | p50 ms | p95 ms | p95 while lifting | field build p95 | draw calls (fog's) | props |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [key, e] of results) {
  const [variant] = key.split(" | ");
  const lift = e.lifting.length ? `${quantile(e.lifting, 0.95).toFixed(1)} ms (${e.lifting.length})` : "-";
  const build = e.buildMs.length ? `${quantile(e.buildMs, 0.95).toFixed(2)} ms (${e.buildMs.length})` : "-";
  console.log(`| ${variant} | ${e.run.tier} | ${e.run.mode} | ${e.times.length} | ${quantile(e.times, 0.5).toFixed(1)} | ${quantile(e.times, 0.95).toFixed(1)} | ${lift} | ${build} | ${[...e.calls].join("/")} (${e.run.fogDraws}) | ${e.run.props} |`);
}
const first = [...results.values()][0]?.run;
console.log(`\ndrawing buffer ${first?.size.join(" x ")}, ${first?.webgl}, ${GPU ? `GPU, ${HEADED ? "visible window" : "headless"}` : "headless, software WebGL: not a device's frame time"}`);
await browser.close();
