/**
 * V2-HOME-VILLAGE (#753): the home's captures at 375 x 812, 768 x 1024 and 1440 x 900 (DPR 2), from the stories `Scenes/Home`
 * (the village in the game scene, its overlays in view and in edit mode), and a GIF at 375 px of view, Edit, a tile in hand and
 * back, for the pull request.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up, or a static build served)
 *   node scripts/home-village-captures.ts --out <folder> [--url http://localhost:6006] [--only scene] [--gif]
 *
 * The `scene` stories draw the real renderer (WebGL: the headless browser's software GL); the others the plan view. Each capture
 * is written as WebP (the browser encodes it, at 0.85). `--gif` also writes `home-375.gif`: the plan view's story played (view,
 * Edit, a tile in hand, set on a cell, Back, Leave), one frame a second, encoded here (a fixed palette, a colour cube and a grey ramp, LZW: no
 * package and no ffmpeg needed). Node 24 runs it as is.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { encodeGif } from "./gif.ts";

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
const CAPTURES = ["scene", "scene-editing", "view", "resume", "guest", "editing", "leaving"].map((state) => ({ name: state, story: `scenes-home--${state}` }));

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

/** A PNG's pixels (RGBA), decoded by the browser. */
async function rgba(png: Buffer): Promise<{ width: number; height: number; data: Uint8Array }> {
  const page = await browser.newPage();
  const out = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let bin = "";
    for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { width: canvas.width, height: canvas.height, b64: btoa(bin) };
  }, png.toString("base64"));
  await page.close();
  return { width: out.width, height: out.height, data: new Uint8Array(Buffer.from(out.b64, "base64")) };
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
    // View, Edit (the hammer), a road in hand, set on a cell, Back (asked: changes), Leave: one frame each, held two seconds, at 375 px.
    const page = await open("scenes-home--interactive", { width: 375, height: 812 }, 1);
    const frames: Uint8Array[] = [];
    let size = { width: 375, height: 812 };
    const shot = async () => {
      const frame = await rgba(await page.screenshot());
      size = { width: frame.width, height: frame.height };
      frames.push(frame.data);
    };
    const step = async (act: () => Promise<void>) => {
      await act();
      await page.waitForTimeout(1_200);
      await shot();
    };
    await shot();
    await step(() => page.getByRole("button", { name: "Edit village" }).click());
    await step(() => page.locator("[aria-labelledby=inventory-title] button").first().click());
    await step(() => page.locator("[data-kind=plate]").first().click());
    await step(() => page.getByRole("button", { name: "Hold to place the tile" }).click({ delay: 600 }));
    await step(() => page.getByRole("button", { name: "Leave edit mode" }).click());
    await step(() => page.getByRole("button", { name: "Leave", exact: true }).click());
    await page.close();
    const gif = join(OUT, "home-375.gif");
    writeFileSync(gif, encodeGif(size.width, size.height, frames, 200));
    console.log(gif);
  }
} finally {
  await browser.close();
}
