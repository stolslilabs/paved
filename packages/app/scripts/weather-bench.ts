/**
 * WEATHER-STUDY (#607 PR 2), WEATHER-WIRE (#658): the frame time of the board with each season's weather on and off, on the phone
 * profile (360 x 780 at DPR 3, CPU throttled 4x through CDP), at the Medium tier and the Low tier, at a phone's play distance (160),
 * on the recorded 72-tile board of the stories `Renderer/Weather` (one per season, the wheel fixed at its day). The weather is the
 * scene's own (`RendererSettings.weather`), as on every board.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/weather-bench.ts [--url http://localhost:6006] [--rounds 3] [--warm 30] [--frames 120] [--gpu] [--headed]
 *
 * Each run opens a fresh page (a fresh WebGL context), waits for the board, stops the render loop and draws frames one by one: the
 * ambient time moved 1/30 s, then, timed together, the weather stepped, `scene.render()` and `gl.finish()`. A frame's time holds the
 * weather's step, the draw's CPU work and the GPU's. Warm-up frames are dropped; the rounds alternate the order of the
 * configurations. The Low tier turns the weather off by design: "low, on" and "low, off" differ only by the setting, to show it. The
 * cloud shadows stay on and still in every configuration (they are not stepped), so the figures differ by the
 * weather alone.
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

const SEASONS = ["summer", "autumn", "winter", "spring"] as const;
interface Config {
  quality: "medium" | "low";
  weather: boolean;
}
const CONFIGS: ReadonlyArray<readonly [string, Config]> = [
  ["medium, on", { quality: "medium", weather: true }],
  ["medium, off", { quality: "medium", weather: false }],
  ["low, on (off by the tier)", { quality: "low", weather: true }],
  ["low, off", { quality: "low", weather: false }],
];

interface Run {
  times: number[];
  calls: number;
  weatherDraws: number;
  mode: string;
  tier: string;
  webgl: string;
  size: number[];
}

const browser = await chromium.launch(
  GPU
    ? { headless: !HEADED, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"] }
    : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);
const results = new Map<string, { times: number[]; calls: Set<number>; run: Run }>();
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))]!;

for (let round = 0; round < ROUNDS; round++) {
  for (const season of SEASONS) {
    for (const [name, config] of round % 2 ? [...CONFIGS].reverse() : CONFIGS) {
      const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3 });
      const cdp = await page.context().newCDPSession(page);
      await page.goto(`${URL_BASE}/iframe.html?id=renderer-weather--${season}&viewMode=story`, { timeout: 180_000, waitUntil: "commit" });
      await page.waitForSelector("[data-ready]", { timeout: 300_000 });
      // The season's weather in full (its fade done) before the timed frames.
      await page.waitForFunction(() => {
        const s = (window as any).__weatherScene?.getWeather();
        return !!s && (s.mode === "off" || Object.values(s.presence as Record<string, number>).every((p) => p === 0 || p === 1));
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const run: Run = await page.evaluate(
        async ({ config, warm, frames }) => {
          // The story exposes its scene (`WeatherBoard`); typed loosely, the script imports nothing of the renderer.
          const s = (window as any).__weatherScene;
          s.stop();
          s.setFrameObserver(null);
          const settings = s.getSettings();
          s.setSettings({ ...settings, quality: config.quality, weather: { ...settings.weather, enabled: config.weather } });
          // The scene's weather (its mode set by the settings and the tier): stepped alone, the clouds stay still.
          const w = s.weather;
          const gl = s.renderer.getContext();
          const info = s.renderer.info;
          info.autoReset = false;
          const times: number[] = [];
          let calls = 0;
          for (let f = 0; f < warm + frames; f++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            s.ambient.time.value += 1 / 30;
            info.reset();
            const start = performance.now();
            w?.step(s.ambient.time.value);
            s.render();
            gl.finish();
            const ms = performance.now() - start;
            calls = info.render.calls;
            if (f >= warm) times.push(ms);
          }
          const stats = s.getWeather() ?? { drawCalls: 0, mode: "not loaded" };
          return { times, calls, weatherDraws: stats.drawCalls, mode: stats.mode, tier: s.getQuality(), webgl: s.getWebGL().renderer ?? "unknown", size: [s.renderer.domElement.width, s.renderer.domElement.height] };
        },
        { config, warm: WARM, frames: FRAMES },
      );
      await page.close();
      const key = `${season} | ${name}`;
      const entry = results.get(key) ?? { times: [], calls: new Set<number>(), run };
      entry.times.push(...run.times);
      entry.calls.add(run.calls);
      results.set(key, entry);
      console.error(`round ${round + 1} ${key}: p95 ${quantile(run.times, 0.95).toFixed(1)} ms (${run.mode}, ${run.weatherDraws} weather draws)`);
    }
  }
}

console.log("| season | config | tier | weather | frames | p50 ms | p95 ms | draw calls (weather's) |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [key, e] of results) {
  const [season, name] = key.split(" | ");
  console.log(`| ${season} | ${name} | ${e.run.tier} | ${e.run.mode} | ${e.times.length} | ${quantile(e.times, 0.5).toFixed(1)} | ${quantile(e.times, 0.95).toFixed(1)} | ${[...e.calls].join("/")} (${e.run.weatherDraws}) |`);
}
const first = [...results.values()][0]?.run;
console.log(`\ndrawing buffer ${first?.size.join(" x ")}, ${first?.webgl}, ${GPU ? `GPU, ${HEADED ? "visible window" : "headless"}` : "headless, software WebGL: not a device's frame time"}`);
await browser.close();
