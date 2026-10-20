/**
 * BIRDS (#574): the frame time of the board with the birds on and off, on the phone profile (360 x 780 at DPR 3, CPU throttled 4x
 * through CDP), at the Medium tier and the Low tier, at a phone's play distance (160) and at the game's opening camera, on the
 * recorded 72-tile board of the story `Renderer/Birds` (`Board`).
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/birds-bench.ts [--url http://localhost:6006] [--rounds 3] [--warm 30] [--frames 120] [--gpu]
 *
 * Each run opens a fresh page (a fresh WebGL context), waits for the board and its perches, stops the render loop and draws frames
 * one by one: the ambient time moved 1/30 s, the birds stepped (a flock launched near the camera's target whenever none flies, so
 * every "on" frame has birds in the air: the worst case, not the average of a flight every 14 s), `scene.render()`, then
 * `gl.finish()`, so a frame's time holds its CPU work and the GPU's. Warm-up frames are dropped; the rounds alternate the order of
 * the configurations. The Low tier turns the ambient effects off by design: "low, forced on" steps the birds there anyway, as a
 * reference of their cost on that tier.
 *
 * Without `--gpu` it runs headless on SwiftShader (software WebGL): its figures show the relative cost on this machine, not a
 * device's frame time. `--gpu` opens a visible window on the machine's GPU: a measure, to run on the Mac only when the owner
 * allows a window there (`docs/measures/client-baseline.md`). Node 24 runs it as is (type stripping).
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

interface Config {
  quality: "medium" | "low";
  birds: boolean;
}
const VIEWS: ReadonlyArray<readonly [string, string]> = [
  ["160 (phone play)", "view:phone-play"],
  ["opening (game camera)", "view:game"],
];
const CONFIGS: ReadonlyArray<readonly [string, Config]> = [
  ["medium, on", { quality: "medium", birds: true }],
  ["medium, off", { quality: "medium", birds: false }],
  ["low, off (the tier's default)", { quality: "low", birds: false }],
  ["low, forced on (reference)", { quality: "low", birds: true }],
];

interface Run {
  times: number[];
  calls: number;
  flying: number;
  perches: number;
  tier: string;
  webgl: string;
  size: number[];
}

const browser = await chromium.launch(
  GPU ? { headless: false } : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);
const results = new Map<string, { times: number[]; calls: Set<number>; flying: number; run: Run }>();
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))]!;

for (let round = 0; round < ROUNDS; round++) {
  for (const [view, args] of VIEWS) {
    for (const [name, config] of round % 2 ? [...CONFIGS].reverse() : CONFIGS) {
      const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3 });
      const cdp = await page.context().newCDPSession(page);
      await page.goto(`${URL_BASE}/iframe.html?id=renderer-birds--board&viewMode=story&args=${args};intervalSeconds:600;quality:${config.quality}`, { timeout: 180_000, waitUntil: "commit" });
      // Ready once the board is drawn at its view and the perches are placed.
      await page.waitForSelector("[data-ready]", { timeout: 300_000 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const run: Run = await page.evaluate(
        async ({ config, warm, frames }) => {
          // The story exposes its scene and birds (`BirdsBoard`); typed loosely, the script imports nothing of the renderer.
          const s = (window as any).__birdsScene;
          const b = (window as any).__birds;
          s.stop();
          s.setFrameObserver(null);
          const near = s.tiles.getGroup().worldToLocal(s.controls.controls.target.clone());
          const gl = s.renderer.getContext();
          const info = s.renderer.info;
          info.autoReset = false;
          const times: number[] = [];
          let calls = 0;
          let flying = 0;
          // One frame per animation frame, as the board draws: a long synchronous loop takes the CPU throttle's pauses inside its
          // frames.
          for (let f = 0; f < warm + frames; f++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            s.ambient.time.value += 1 / 30;
            if (config.birds) {
              if (b.stats().flying === 0 && b.states().length === 0) b.launch("flock", near);
              b.step(s.ambient.time.value);
            }
            info.reset();
            const start = performance.now();
            s.render();
            gl.finish();
            const ms = performance.now() - start;
            calls = info.render.calls;
            if (f >= warm) {
              times.push(ms);
              flying += b.stats().flying;
            }
          }
          return { times, calls, flying: flying / frames, perches: b.stats().perches, tier: s.getQuality(), webgl: s.getWebGL().renderer ?? "unknown", size: [s.renderer.domElement.width, s.renderer.domElement.height] };
        },
        { config, warm: WARM, frames: FRAMES },
      );
      await page.close();
      const key = `${view} | ${name}`;
      const entry = results.get(key) ?? { times: [], calls: new Set<number>(), flying: 0, run };
      entry.times.push(...run.times);
      entry.calls.add(run.calls);
      entry.flying = Math.max(entry.flying, run.flying);
      results.set(key, entry);
      console.error(`round ${round + 1} ${key}: p95 ${quantile(run.times, 0.95).toFixed(1)} ms`);
    }
  }
}

console.log("| view | config | tier | frames | p50 ms | p95 ms | draw calls | birds in the air (mean) |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [key, e] of results) {
  const [view, name] = key.split(" | ");
  console.log(`| ${view} | ${name} | ${e.run.tier} | ${e.times.length} | ${quantile(e.times, 0.5).toFixed(1)} | ${quantile(e.times, 0.95).toFixed(1)} | ${[...e.calls].join("/")} | ${e.flying.toFixed(1)} |`);
}
const first = [...results.values()][0]?.run;
console.log(`\n${first?.perches} perches; drawing buffer ${first?.size.join(" x ")}, ${first?.webgl}, ${GPU ? "GPU, visible window" : "headless, software WebGL: not a device's frame time"}`);
await browser.close();
