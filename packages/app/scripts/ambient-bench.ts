/**
 * AMBIENT-PARTICLES (#572): the frame time of the board with the ambient particles on and off, on the phone profile (360 x 780
 * at DPR 3, CPU throttled 4x through CDP), at the Medium tier and the Low tier, at a phone's play distance (160) and at the
 * opening (240), on the recorded 72-tile board of the stories `Renderer/Ambient particles` (`Board`, `BoardAtOpening`).
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/ambient-bench.ts [--url http://localhost:6006] [--rounds 3] [--warm 30] [--frames 120] [--gpu]
 *
 * Each run opens a fresh page (a fresh WebGL context), waits for the board, stops the render loop and draws frames one by one:
 * the ambient time moved 1/30 s, `scene.render()`, then `gl.finish()`, so a frame's time holds its CPU work and the GPU's
 * (`finish` waits for the GPU). Warm-up frames are dropped; the rounds alternate the order of the configurations. The Low tier
 * turns the particles off by design: "low, forced on" shows them anyway, as a reference of their cost there.
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
  enabled: boolean;
  force?: boolean;
}
const VIEWS: ReadonlyArray<readonly [string, string]> = [
  ["160 (phone play)", "board"],
  ["240 (opening)", "board-at-opening"],
];
const CONFIGS: ReadonlyArray<readonly [string, Config]> = [
  ["medium, on", { quality: "medium", enabled: true }],
  ["medium, off", { quality: "medium", enabled: false }],
  ["low, off (the tier's default)", { quality: "low", enabled: true }],
  ["low, forced on (reference)", { quality: "low", enabled: true, force: true }],
];

interface Run {
  times: number[];
  calls: number;
  tier: string;
  particles: number[];
  webgl: string;
  size: number[];
}

const browser = await chromium.launch(
  GPU ? { headless: false } : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);
const results = new Map<string, { times: number[]; calls: Set<number>; run: Run }>();
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))]!;

for (let round = 0; round < ROUNDS; round++) {
  for (const [view, story] of VIEWS) {
    for (const [name, config] of round % 2 ? [...CONFIGS].reverse() : CONFIGS) {
      const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3 });
      const cdp = await page.context().newCDPSession(page);
      await page.goto(`${URL_BASE}/iframe.html?id=renderer-ambient-particles--${story}&viewMode=story`, { timeout: 180_000, waitUntil: "commit" });
      await page.waitForSelector("[data-ready]", { timeout: 300_000 });
      // The emitters are built in idle slices after the first frame.
      await page.waitForTimeout(4000);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const run: Run = await page.evaluate(
        async ({ config, warm, frames }) => {
          // The story exposes its scene (`AmbientParticlesBoard`); typed loosely, the script imports nothing of the renderer.
          const s = (window as any).__ambientScene;
          s.stop();
          s.setFrameObserver(null);
          const current = s.getSettings();
          s.setSettings({ ...current, quality: config.quality, ambient: { ...current.ambient, enabled: config.enabled } });
          const particles = s.scene.getObjectByName("ambient-particles");
          if (config.force && particles) particles.visible = true;
          const gl = s.renderer.getContext();
          const info = s.renderer.info;
          info.autoReset = false;
          const times: number[] = [];
          let calls = 0;
          // One frame per animation frame, as the board draws: a long synchronous loop takes the CPU throttle's pauses inside its
          // frames (measured: past about 80 frames, every other frame took seconds).
          for (let f = 0; f < warm + frames; f++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            s.ambient.time.value += 1 / 30;
            info.reset();
            const start = performance.now();
            s.render();
            gl.finish();
            const ms = performance.now() - start;
            calls = info.render.calls;
            if (f >= warm) times.push(ms);
          }
          const counts = particles?.visible
              particles.children.map((p: any) => (p.visible ? (p.geometry.getAttribute("aSeed")?.count ?? 0) : 0))
            : [0, 0];
          return { times, calls, tier: s.getQuality(), particles: counts, webgl: s.getWebGL().renderer ?? "unknown", size: [s.renderer.domElement.width, s.renderer.domElement.height] };
        },
        { config, warm: WARM, frames: FRAMES },
      );
      await page.close();
      const key = `${view} | ${name}`;
      const entry = results.get(key) ?? { times: [], calls: new Set<number>(), run };
      entry.times.push(...run.times);
      entry.calls.add(run.calls);
      results.set(key, entry);
      console.error(`round ${round + 1} ${key}: p95 ${quantile(run.times, 0.95).toFixed(1)} ms`);
    }
  }
}

console.log("| view | config | tier | frames | p50 ms | p95 ms | draw calls | particles (water+wonder) |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [key, e] of results) {
  const [view, name] = key.split(" | ");
  console.log(`| ${view} | ${name} | ${e.run.tier} | ${e.times.length} | ${quantile(e.times, 0.5).toFixed(1)} | ${quantile(e.times, 0.95).toFixed(1)} | ${[...e.calls].join("/")} | ${e.run.particles.join("+")} |`);
}
const first = [...results.values()][0]?.run;
console.log(`\ndrawing buffer ${first?.size.join(" x ")}, ${first?.webgl}, ${GPU ? "GPU, visible window" : "headless, software WebGL: not a device's frame time"}`);
await browser.close();
