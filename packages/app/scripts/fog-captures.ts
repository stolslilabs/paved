/**
 * FOG-STUDY: a GIF per variant and a few stills of the stories `Renderer/Fog of war`, on the phone (375 x 812 at DPR 2).
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/fog-captures.ts --out <folder> [--url http://localhost:6006] [--frames 24] [--move-frames 36] [--fps 12] [--gpu]
 *     [--only village]
 *     [--args falloff:0 --suffix -hard] [--stills]
 *
 * Each capture opens a fresh page, waits for the board and the fog, stops the render loop and draws its frames one by one: the
 * ambient time moved 1 / fps, every effect on the loop stepped (the fog's drift and its lifts), `scene.render()`, and a screenshot
 * of the page. A capture with moves places a tile (or buys a cell) at the frames it names (`window.__fogPlace()`), so the fog
 * lifts in the GIF at the board's own pace. ffmpeg (on the PATH) makes the GIF from the frames, with one palette for the clip, and
  * a JPEG of a still. `--stills` takes one frame of each (to judge a look quickly).
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
/** A clip of the drift alone (two seconds), and one with moves (three: a lift is 0.8 s). */
const FRAMES = Number(arg("frames", "24"));
const MOVE_FRAMES = Number(arg("move-frames", "36"));
const FPS = Number(arg("fps", "12"));
const GPU = process.argv.includes("--gpu");
const STILLS = process.argv.includes("--stills");
const ONLY = arg("only", "");
/** Extra story args for every capture (`falloff:0;mist:0`), to compare a knob. */
const EXTRA = arg("args", "");
const SUFFIX = arg("suffix", "");
if (!OUT) throw new Error("--out <folder> is required (captures are not committed from here)");

interface Capture {
  name: string;
  story: string;
  args?: string;
  /** Frames to record: 1 for a still. */
  frames: number;
  /** The frames at which a tile is placed (or a cell bought). */
  moves?: number[];
}
const MOVES = [3, 14, 25];
const CAPTURES: Capture[] = [
  { name: "fog-hard-edge", story: "hard-edge", frames: FRAMES },
  { name: "fog-voxel-edge", story: "voxel-edge", frames: 1 },
  { name: "fog-soft-falloff", story: "soft-falloff", frames: FRAMES },
  { name: "fog-landscape", story: "landscape", frames: FRAMES },
  { name: "fog-village", story: "village", frames: 1 },
  // The moves' clips hold the drift (the lift is their point, and a still fog keeps the GIF small).
  { name: "fog-interactive", story: "interactive", args: "interactive:!false;drift:0", frames: MOVE_FRAMES, moves: MOVES },
  { name: "fog-interactive-hard-edge", story: "interactive", args: "interactive:!false;falloff:0;mist:0;drift:0", frames: MOVE_FRAMES, moves: MOVES },
  { name: "fog-village-growing", story: "village-growing", args: "autoplay:0;interactive:!false;drift:0", frames: MOVE_FRAMES, moves: MOVES },
  { name: "fog-landscape-hard-edge", story: "landscape-hard-edge", frames: 1 },
  { name: "fog-close-voxel-edge", story: "voxel-edge", args: "view:close", frames: 1 },
  { name: "fog-close-soft-edge", story: "voxel-edge", args: "view:close;voxelEdge:!false", frames: 1 },
  { name: "fog-close-hard-edge", story: "voxel-edge", args: "view:close;voxelEdge:!false;falloff:0", frames: 1 },
  { name: "fog-night", story: "night", frames: 1 },
  { name: "fog-off", story: "off", frames: 1 },
  // The corners (#648), close up: pass `--args cornerRadius:0 --suffix -sharp` for the cells' sharp corners.
  { name: "fog-corners-one", story: "corners", args: "shape:one", frames: 1 },
  { name: "fog-corners-l", story: "corners", args: "shape:L", frames: 1 },
  { name: "fog-corners-diagonal", story: "corners", args: "shape:diagonal", frames: 1 },
]
  .filter((c) => !ONLY || c.name.includes(ONLY))
  .map((c) => (STILLS ? { ...c, frames: c.moves ? c.moves[0]! + 13 : 1 } : c));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  GPU
    ? { headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] }
    : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);

for (const capture of CAPTURES) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const args = [capture.args, EXTRA].filter(Boolean).join(";");
  await page.goto(`${URL_BASE}/iframe.html?id=renderer-fog-of-war--${capture.story}&viewMode=story${args ? `&args=${args}` : ""}`, { timeout: 180_000, waitUntil: "commit" });
  await page.waitForSelector("[data-ready]", { timeout: 300_000 });
  // The models and the shadows settled; the readout and the button hidden (the board alone).
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: "output, button { display: none !important; }" });
  const webgl: string = await page.evaluate(() => {
    const s = (window as any).__fogScene;
    s.stop();
    return s.getWebGL().renderer ?? "unknown";
  });
  const frames = join(OUT, `${capture.name}-frames`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  for (let f = 0; f < capture.frames; f++) {
    if (capture.moves?.includes(f)) {
      await page.evaluate(() => (window as any).__fogPlace());
      // React commits the move and its effects (the tiles, the reveal) in a task of its own.
      await page.waitForTimeout(150);
    }
    await page.evaluate((dt) => {
      const s = (window as any).__fogScene;
      s.ambient.time.value += dt;
      // Every effect on the loop (the fog), as the loop steps them, and the placement's fades (a new slot's plate).
      for (const effect of (s.ambient as any).effects) effect.step(s.ambient.time.value);
      s.tiles.update(performance.now());
      s.render();
    }, 1 / FPS);
    if (STILLS && f < capture.frames - 1) continue;
    await page.screenshot({ path: join(frames, `${String(f).padStart(3, "0")}.png`) });
  }
  if (capture.frames === 1 || STILLS) {
    const last = String(capture.frames - 1).padStart(3, "0");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(frames, `${last}.png`), "-vf", "scale=375:-1", "-q:v", "3", join(OUT, `${capture.name}${SUFFIX}.jpg`)]);
  } else {
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%03d.png"),
      "-vf", "scale=375:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
      "-loop", "0", join(OUT, `${capture.name}${SUFFIX}.gif`),
    ]);
  }
  rmSync(frames, { recursive: true, force: true });
  console.error(`${capture.name}: ${capture.frames} frame(s), ${webgl}`);
  await page.close();
}
await browser.close();
