/**
 * V2-HOME-VILLAGE (#753): the home's captures at 375 x 812, 768 x 1024 and 1440 x 900 (DPR 2), from the stories `Scenes/Home`
 * (the village in the game scene, its overlays in view and in edit mode), and a GIF at 375 px of view, Edit, a tile in hand and
 * back, for the pull request.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up, or a static build served)
 *   node scripts/home-village-captures.ts --out <folder> [--url http://localhost:6006] [--only scene] [--gif]
 *
 * The `scene` stories draw the real renderer (WebGL: the headless browser's software GL); the others the plan view. Each capture
 * is written as WebP (the browser encodes it, at 0.85). `--gif` also writes `home-375.gif` from frames of the plan view's
 * stories, with the ffmpeg Playwright installs (`PLAYWRIGHT_FFMPEG`, else `ffmpeg` on the PATH). Node 24 runs it as is.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const URL_BASE = arg("url", "http://localhost:6006");
const OUT = arg("out", "");
const ONLY = arg("only", "");
const GIF = process.argv.includes("--gif");
if (!OUT) throw new Error("--out <folder> is required");

const SIZES = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];
const CAPTURES = ["scene", "scene-editing", "view", "resume", "guest", "unfounded", "loading", "editing", "placing", "leaving", "saved"].map((state) => ({ name: state, story: `scenes-home--${state}` }));

/** A PNG encoded as WebP by the browser (a blank page's canvas). */
async function toWebp(png: Buffer): Promise<Buffer> {
  const page = await browser.newPage();
  const url = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas.toDataURL("image/webp", 0.85);
  }, png.toString("base64"));
  await page.close();
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

/** A story drawn and settled: its heading, its images, the canvas's first frames. */
async function open(story: string, size: { width: number; height: number }, scale = 2) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: scale });
  await page.goto(`${URL_BASE}/iframe.html?id=${story}&viewMode=story`, { waitUntil: "load" });
  await page.waitForSelector("#storybook-root h1", { state: "attached", timeout: 90_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("#storybook-root img")].every((img) => (img as HTMLImageElement).complete), null, { timeout: 60_000 });
  await page.waitForTimeout(story.includes("scene") ? 8_000 : 1_500);
  return page;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const capture of CAPTURES.filter((c) => !ONLY || c.name.includes(ONLY))) {
    for (const size of SIZES) {
      const page = await open(capture.story, size);
      const png = await page.screenshot({ fullPage: false, timeout: 180_000 });
      await page.close();
      const file = join(OUT, `${capture.name}-${size.width}.webp`);
      writeFileSync(file, await toWebp(png));
      console.log(file);
    }
  }
  if (GIF) {
    // View, Edit (the hammer), a road in hand, set on a cell, Back: one frame each, held a second, at 375 px.
    const frames = join(OUT, "gif-frames");
    mkdirSync(frames, { recursive: true });
    const page = await open("scenes-home--view", { width: 375, height: 812 }, 1);
    let n = 0;
    const shot = async (hold = 1) => {
      for (let i = 0; i < hold; i++) await page.screenshot({ path: join(frames, `${String(n++).padStart(3, "0")}.png`) });
    };
    await shot(2);
    await page.getByRole("button", { name: "Edit village" }).click();
    await page.waitForTimeout(600);
    await shot(2);
    await page.locator("[data-slot=carousel-item] button, [aria-labelledby=inventory-title] button").first().click();
    await page.waitForTimeout(600);
    await shot(2);
    await page.locator("[data-kind=plate]").first().click();
    await page.waitForTimeout(600);
    await shot(2);
    await page.getByRole("button", { name: "Leave edit mode" }).click();
    await page.waitForTimeout(600);
    await shot(2);
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await page.waitForTimeout(600);
    await shot(2);
    await page.close();
    const ffmpeg = process.env.PLAYWRIGHT_FFMPEG ?? "ffmpeg";
    const gif = join(OUT, "home-375.gif");
    execFileSync(ffmpeg, ["-y", "-framerate", "1", "-i", join(frames, "%03d.png"), "-vf", "split[a][b];[a]palettegen[p];[b][p]paletteuse", gif]);
    console.log(gif);
  }
} finally {
  await browser.close();
}
