/**
 * DIRECTION-D (#537, PR 2): the app's copies of direction D's renders, under `src/assets/renders/`.
 *
 *   nice -n 10 node scripts/app-renders.ts [--only <name>]
 *
 * The masters are the renders of `scripts/direction-renders.ts` (the bench's recorded boards and the voxel wordmark through the
 * board's own renderer), committed in `src/directions/renders/` (the Direction stories that first showed them are gone). The app shows them smaller than they
 * were drawn, so each copy is resized to twice its largest box on screen and re-encoded as a lossy WebP, transparency kept. The
 * run opens one headless Chromium (playwright-core's), draws each master on a canvas and writes `toDataURL("image/webp", q)`.
 * It reads only the masters, so a second run writes the same files. Vite emits each copy as its own file, fetched when its
 * `<img>` is drawn: nothing goes into a JavaScript chunk, nothing is fetched from another host.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const MASTERS = join(APP, "src/directions/renders");
const OUT = join(APP, "src/assets/renders");

interface Copy {
  /** The master's name in `src/directions/renders`, and the copy's. */
  name: string;
  width: number;
  height: number;
  quality: number;
}

/** Each copy at twice its largest box: the hero at a phone's width and a wide screen's, the thumbnails as the scenes set them. */
export const COPIES: readonly Copy[] = [
  { name: "wordmark", width: 840, height: 240, quality: 0.86 },
  { name: "hero-tall", width: 750, height: 1000, quality: 0.7 },
  { name: "hero-wide", width: 1440, height: 720, quality: 0.7 },
  { name: "mode-challenge", width: 320, height: 200, quality: 0.8 },
  { name: "mode-training", width: 320, height: 200, quality: 0.8 },
  { name: "mode-tutorial", width: 320, height: 200, quality: 0.8 },
];

async function run(): Promise<void> {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let total = 0;
    for (const copy of COPIES) {
      if (only && copy.name !== only) continue;
      const master = readFileSync(join(MASTERS, `${copy.name}.webp`)).toString("base64");
      const url = await page.evaluate(async ({ master, width, height, quality }) => {
        const blob = await (await fetch(`data:image/webp;base64,${master}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, width, height);
        return canvas.toDataURL("image/webp", quality);
      }, { master, ...copy });
      const body = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
      if (body.subarray(8, 12).toString("latin1") !== "WEBP") throw new Error(`app-renders: ${copy.name} is not a WebP`);
      writeFileSync(join(OUT, `${copy.name}.webp`), body);
      total += body.length;
      console.log(`${copy.name}.webp: ${copy.width} x ${copy.height}, ${body.length} B`);
    }
    console.log(`total: ${total} B`);
  } finally {
    await browser.close();
  }
}

await run();
