/**
 * FOG-EVERYWHERE (#648): stills of the fog of war on the game's board (`Scenes/Board`, the stories Fog, FogAtNight and
 * FogVillage), on a phone (375 x 812 at DPR 2) and on desktop (1440 x 900 at DPR 1).
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/fog-board-captures.ts --out <folder> [--url http://localhost:6006] [--gpu] [--only night]
 *
 * Each capture opens a fresh page, waits for the board's canvas, the models, the fog's chunk and its first lift, then takes a
 * JPEG of the page. Without `--gpu` it runs headless on SwiftShader (software WebGL; the outlines are off there); with it,
 * headless Chromium on the machine's GPU. Node 24 runs it as is (type stripping).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const URL_BASE = arg("url", "http://localhost:6006");
const OUT = arg("out", "");
const GPU = process.argv.includes("--gpu");
const ONLY = arg("only", "");
/** How long the board settles: the models, the fog's chunk, the shadows. */
const SETTLE_MS = Number(arg("settle", "8000"));
if (!OUT) throw new Error("--out <folder> is required (captures are not committed from here)");

const STORIES = [
  ["fog-board-day", "fog"],
  ["fog-board-night", "fog-at-night"],
  ["fog-board-village", "fog-village"],
] as const;
const VIEWPORTS = [
  ["375", { width: 375, height: 812 }, 2],
  ["1440", { width: 1440, height: 900 }, 1],
] as const;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  GPU
    ? { headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] }
    : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);
for (const [name, story] of STORIES) {
  for (const [label, viewport, deviceScaleFactor] of VIEWPORTS) {
    const file = `${name}-${label}${GPU ? "-gpu" : ""}`;
    if (ONLY && !file.includes(ONLY)) continue;
    const page = await browser.newPage({ viewport, deviceScaleFactor });
    await page.goto(`${URL_BASE}/iframe.html?id=scenes-board--${story}&viewMode=story`, { timeout: 180_000, waitUntil: "commit" });
    await page.waitForSelector("canvas", { timeout: 300_000 });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: join(OUT, `${file}.jpg`), type: "jpeg", quality: 82 });
    console.error(`${file}: done`);
    await page.close();
  }
}
await browser.close();
