/**
 * V2-VILLAGE-UI (#739): the v2 village's captures at 375 x 812 and 1440 x 900 (DPR 2), from the stories `Scenes/Village v2`
 * (the layout and its editor, the chests, the daily shop, on fakes) and `Pages/Village` (the pages on the mock ledger), for the
 * pull request.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up, or a static build served)
 *   node scripts/village-v2-captures.ts --out <folder> [--url http://localhost:6006] [--only chests]
 *
 * The screens draw the plan (no WebGL needed). Each capture is written as WebP (the browser encodes it, at 0.85), as
 * `src/stories/captures/village-v2/`'s are. Node 24 runs it as is (type stripping).
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
if (!OUT) throw new Error("--out <folder> is required");

const SIZES = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
];
const layout = (state: string) => ({ name: `layout-${state}`, story: `scenes-village-v2-layout--${state}` });
const chests = (state: string) => ({ name: `chests-${state}`, story: `scenes-village-v2-chests--${state}` });
const shop = (state: string) => ({ name: `shop-${state}`, story: `scenes-village-v2-shop--${state}` });
const CAPTURES = [
  ...["start", "growing", "editing", "holding", "placing", "lifted", "changed", "reset", "full", "leaving", "saved", "visit"].map(layout),
  ...["waiting", "opening", "epic", "epic-chosen", "rare", "basic", "cobbles-won", "taken", "taken-last", "story-chest", "slots", "open-pending", "closed", "kept", "free", "no-ranks", "capped", "last-minute", "ready", "empty"].map(chests),
  ...["today", "one-bought", "all-bought", "short"].map(shop),
  // The pages as the app wires them, on the mock ledger (#739): `Pages/Village`.
  ...["board", "fresh", "chests", "shop", "visit"].map((state) => ({ name: `page-${state}`, story: `pages-village--${state}` })),
];

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

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const capture of CAPTURES.filter((c) => !ONLY || c.name.includes(ONLY))) {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
      await page.goto(`${URL_BASE}/iframe.html?id=${capture.story}&viewMode=story`, { waitUntil: "load" });
      // The story drew (the first visit waits for Storybook's compile): its top bar's title is there.
      await page.waitForSelector("#storybook-root h1", { timeout: 90_000 });
      // The tiles' art loads (Storybook's own socket keeps the network busy: no idle to wait for).
      await page.waitForFunction(() => [...document.querySelectorAll("#storybook-root img")].every((img) => (img as HTMLImageElement).complete), null, { timeout: 60_000 });
      await page.waitForTimeout(1_500);
      const png = await page.screenshot({ fullPage: false, timeout: 180_000 });
      await page.close();
      const file = join(OUT, `${capture.name}-${size.width}.webp`);
      writeFileSync(file, await toWebp(png));
      console.log(file);
    }
  }
} finally {
  await browser.close();
}
