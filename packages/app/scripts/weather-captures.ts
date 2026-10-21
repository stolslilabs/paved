/**
 * WEATHER-STUDY (#607 PR 2), WEATHER-WIRE (#658): stills of each season by day and at night at 375 x 812 and 1440 x 900 (DPR 2 by default), a
 * GIF per season with things falling, and a GIF of a season fade, from the stories `Renderer/Weather` (the weather the scene draws on
 * every board), at a phone's play distance, the wheel fixed.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/weather-captures.ts --out <folder> [--url http://localhost:6006] [--frames 45] [--fps 15] [--dpr 2] [--gpu]
 *     [--only autumn] [--args snowVeil:0.2 --suffix -veil02]
 *
 * Each capture opens a fresh page, waits for the board and the season's weather in full, stops the render loop and draws its frames
 * one by one: the ambient time moved 1 / fps, every effect on the loop stepped (the weather, the clouds), `scene.render()`, and a
 * screenshot of the page. The fade turns the wheel (the cycle's held moment, as a tap does) after its first second. ffmpeg (on the
 * PATH) makes the GIF from the frames, with one palette for the clip. The time steps are the loop's own, so the GIF plays at the
 * speed the board would, whatever the capture's own pace.
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
/** The device pixel ratio (2 by default; 1 speeds up a software run, whose screenshots take tens of seconds each at 2). */
const DPR = Number(arg("dpr", "2"));
const ONLY = arg("only", "");
/** Extra story args for every capture (`snowVeil:0.2;snowCover:0.3`), to compare a knob. */
const EXTRA = arg("args", "");
const SUFFIX = arg("suffix", "");
if (!OUT) throw new Error("--out <folder> is required (captures are not committed from here)");

interface Capture {
  name: string;
  story: string;
  args?: string;
  /** Frames to record: 1 for a still. */
  frames: number;
  width: number;
  height: number;
  /** The fade: at this frame the wheel turns to `turnTo` (the cycle's held moment, in seasons since a summer's dawn). */
  turnAt?: number;
  turnTo?: number;
}
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };
const SEASONS = ["summer", "autumn", "winter", "spring"] as const;
const CAPTURES: Capture[] = [
  ...SEASONS.flatMap((season) =>
    [PHONE, DESKTOP].flatMap((size) => [
      { name: `weather-${season}-day-${size.width}`, story: season, frames: 1, ...size },
      { name: `weather-${season}-night-${size.width}`, story: `${season}-night`, frames: 1, ...size },
    ]),
  ),
  { name: "weather-autumn-375", story: "autumn", frames: FRAMES, ...PHONE },
  { name: "weather-winter-375", story: "winter", frames: FRAMES, ...PHONE },
  // Autumn to winter: a second of autumn, then the three seconds' fade, then a second of winter.
  { name: "weather-fade-autumn-winter-375", story: "autumn", frames: 5 * FPS, turnAt: FPS, turnTo: 2.3, ...PHONE },
  { name: "weather-winter-reduced-motion-375", story: "reduced-motion", frames: 1, ...PHONE },
  { name: "weather-off-winter-375", story: "winter", args: "weather:!false", frames: 1, ...PHONE },
].filter((c) => !ONLY || c.name.includes(ONLY));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  GPU
    ? { headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] }
    : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);

for (const capture of CAPTURES) {
  const page = await browser.newPage({ viewport: { width: capture.width, height: capture.height }, deviceScaleFactor: DPR });
  const args = [capture.args, EXTRA].filter(Boolean).join(";");
  await page.goto(`${URL_BASE}/iframe.html?id=renderer-weather--${capture.story}&viewMode=story${args ? `&args=${args}` : ""}`, { timeout: 180_000, waitUntil: "commit" });
  await page.waitForSelector("[data-ready]", { timeout: 300_000 });
  await page.waitForFunction(() => {
    const scene = (window as any).__weatherScene;
    const s = scene?.getWeather();
    // The weather off in the settings: its chunk never loads, there is nothing to wait for.
    if (scene && !s && !scene.getSettings().weather.enabled) return true;
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
    await page.evaluate(
      ({ dt, turn }) => {
        const s = (window as any).__weatherScene;
        if (turn !== null) {
          const settings = s.getSettings();
          s.setSettings({ ...settings, dayNight: { ...settings.dayNight, freezeAt: turn } });
        }
        s.ambient.time.value += dt;
        // Every effect on the loop (the weather, the clouds), as the loop steps them.
        for (const effect of (s.ambient as any).effects) effect.step(s.ambient.time.value);
        s.render();
      },
      { dt: 1 / FPS, turn: f === capture.turnAt ? (capture.turnTo ?? null) : null },
    );
    await page.screenshot({ path: join(frames, `${String(f).padStart(3, "0")}.png`), timeout: 300_000 });
  }
  const scale = `scale=${capture.width}:-1`;
  if (capture.frames === 1) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(frames, "000.png"), "-vf", scale, join(OUT, `${capture.name}${SUFFIX}.png`)]);
  } else {
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%03d.png"),
      "-vf", `${scale}:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      "-loop", "0", join(OUT, `${capture.name}${SUFFIX}.gif`),
    ]);
  }
  rmSync(frames, { recursive: true, force: true });
  console.error(`${capture.name}: ${capture.frames} frame(s), ${webgl}`);
  await page.close();
}
await browser.close();
