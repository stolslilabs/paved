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

/** The GIF's palette: a 6 x 6 x 6 colour cube (216), then a ramp of 40 greys (the fog, the panels), 256 in all. */
const GREYS = 40;
const palette = (): number[] => {
  const out: number[] = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) out.push(r * 51, g * 51, b * 51);
  for (let i = 0; i < GREYS; i++) {
    const v = Math.round((i * 255) / (GREYS - 1));
    out.push(v, v, v);
  }
  return out;
};
/** A pixel's palette index: a near-grey one on the ramp, any other in the cube. */
const indexOf = (r: number, g: number, b: number): number => {
  if (Math.max(r, g, b) - Math.min(r, g, b) < 14) return 216 + Math.round((((r + g + b) / 3) * (GREYS - 1)) / 255);
  return Math.round(r / 51) * 36 + Math.round(g / 51) * 6 + Math.round(b / 51);
};

/** A frame's palette indices, LZW-coded in 255-byte sub-blocks (GIF89a, minimum code size 8). */
function lzw(indices: Uint8Array): number[] {
  const out: number[] = [];
  let cur = 0;
  let bits = 0;
  let size = 9;
  const emit = (code: number) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>>= 8;
      bits -= 8;
    }
  };
  const CLEAR = 256;
  let next = 258;
  let table = new Map<number, number>();
  emit(CLEAR);
  let prefix = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(CLEAR);
      table = new Map();
      next = 258;
      size = 9;
    } else {
      table.set(key, next);
      if (next === 1 << size) size++;
      next++;
    }
    prefix = k;
  }
  emit(prefix);
  emit(257);
  if (bits > 0) out.push(cur & 0xff);
  const blocks: number[] = [8];
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255);
    blocks.push(chunk.length, ...chunk);
  }
  blocks.push(0);
  return blocks;
}

/** An animated GIF of `frames` (RGBA), each shown `delayCs` hundredths of a second, looping. */
function encodeGif(width: number, height: number, frames: Uint8Array[], delayCs: number): Buffer {
  const bytes: number[] = [];
  const u16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
  bytes.push(...Buffer.from("GIF89a"));
  u16(width);
  u16(height);
  bytes.push(0xf7, 0, 0, ...palette());
  bytes.push(0x21, 0xff, 11, ...Buffer.from("NETSCAPE2.0"), 3, 1, 0, 0, 0);
  for (const rgbaFrame of frames) {
    const indices = new Uint8Array(width * height);
    for (let p = 0; p < indices.length; p++) indices[p] = indexOf(rgbaFrame[p * 4]!, rgbaFrame[p * 4 + 1]!, rgbaFrame[p * 4 + 2]!);
    bytes.push(0x21, 0xf9, 4, 0);
    u16(delayCs);
    bytes.push(0, 0, 0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    bytes.push(0);
    for (const b of lzw(indices)) bytes.push(b);
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
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
