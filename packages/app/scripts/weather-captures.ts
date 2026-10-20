/**
 * WEATHER-STUDY (#607 PR 2): a GIF per season and a few stills of the stories `Renderer/Weather`, on the phone (375 x 812 at DPR 2),
 * at a phone's play distance, the wheel fixed at the season's day.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/weather-captures.ts --out <folder> [--url http://localhost:6006] [--frames 45] [--fps 15] [--gpu] [--only autumn]
 *     [--args glare:0 --suffix -noglare]
 *
 * Each capture opens a fresh page, waits for the board and the season's weather in full, stops the render loop and draws its frames
 * one by one: the ambient time moved 1 / fps, every effect on the loop stepped (the weather, the clouds), `scene.render()`, and a
 * screenshot of the page. ffmpeg (on the PATH) makes the GIF from the frames, with one palette for the clip. The time steps are
 * the loop's own, so the GIF plays at the speed the board would, whatever the capture's own pace.
 *
 * Without `--gpu` it runs headless on SwiftShader (software WebGL; the outlines are off there); with it, headless Chromium on the
 * machine's GPU. Node 24 runs it as is (type stripping).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const URL_BASE = arg("url", "http://localhost:6006");
const OUT = arg("out", "");
const FRAMES = Number(arg("frames", "45"));
const FPS = Number(arg("fps", "15"));
const GPU = process.argv.includes("--gpu");
const ONLY = arg("only", "");
/** Extra story args for every capture (`glare:0;snowCover:0.3`), to compare a knob. */
const EXTRA = arg("args", "");
const SUFFIX = arg("suffix", "");
if (!OUT) throw new Error("--out <folder> is required (captures are not committed from here)");

interface Capture {
  name: string;
  story: string;
  args?: string;
  /** Frames to record: 1 for a still. */
  frames: number;
}
const CAPTURES: Capture[] = [
  { name: "weather-summer", story: "summer", frames: FRAMES },
  { name: "weather-autumn", story: "autumn", frames: FRAMES },
  { name: "weather-winter", story: "winter", frames: FRAMES },
  { name: "weather-spring", story: "spring", frames: FRAMES },
  { name: "weather-autumn-night", story: "autumn-night", frames: FRAMES },
  { name: "weather-winter-night", story: "winter-night", frames: FRAMES },
  { name: "weather-winter-reduced-motion", story: "reduced-motion", frames: 1 },
  { name: "weather-off-summer", story: "summer", args: "weather:!false", frames: 1 },
  { name: "weather-off-autumn", story: "autumn", args: "weather:!false", frames: 1 },
  { name: "weather-off-winter", story: "winter", args: "weather:!false", frames: 1 },
  { name: "weather-off-spring", story: "spring", args: "weather:!false", frames: 1 },
  { name: "weather-summer-still", story: "summer", frames: 1 },
  { name: "weather-autumn-still", story: "autumn", frames: 1 },
  { name: "weather-winter-still", story: "winter", frames: 1 },
  { name: "weather-spring-still", story: "spring", frames: 1 },
].filter((c) => !ONLY || c.name.includes(ONLY));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  GPU
    ? { headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] }
    : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);

for (const capture of CAPTURES) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const args = [capture.args, EXTRA].filter(Boolean).join(";");
  await page.goto(`${URL_BASE}/iframe.html?id=renderer-weather--${capture.story}&viewMode=story${args ? `&args=${args}` : ""}`, { timeout: 180_000, waitUntil: "commit" });
  await page.waitForSelector("[data-ready]", { timeout: 300_000 });
  await page.waitForFunction(() => {
    const s = (window as any).__weather?.stats();
    return !!s && Object.values(s.presence as Record<string, number>).every((p) => p === 0 || p === 1);
  });
  // The models and the shadows settled; the readout hidden (the board alone).
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: "output { display: none !important; }" });
  const webgl: string = await page.evaluate(() => {
    const s = (window as any).__weatherScene;
    s.stop();
    return s.getWebGL().renderer ?? "unknown";
  });
  const frames = join(OUT, `${capture.name}-frames`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  for (let f = 0; f < capture.frames; f++) {
    await page.evaluate((dt) => {
      const s = (window as any).__weatherScene;
      s.ambient.time.value += dt;
      // Every effect on the loop (the weather, the clouds), as the loop steps them.
      for (const effect of (s.ambient as any).effects) effect.step(s.ambient.time.value);
      s.render();
    }, 1 / FPS);
    await page.screenshot({ path: join(frames, `${String(f).padStart(3, "0")}.png`) });
  }
  if (capture.frames === 1) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(frames, "000.png"), "-vf", "scale=375:-1", join(OUT, `${capture.name}${SUFFIX}.png`)]);
  } else {
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%03d.png"),
      "-vf", "scale=375:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
      "-loop", "0", join(OUT, `${capture.name}${SUFFIX}.gif`),
    ]);
  }
  rmSync(frames, { recursive: true, force: true });
  console.error(`${capture.name}: ${capture.frames} frame(s), ${webgl}`);
  await page.close();
}
await browser.close();
