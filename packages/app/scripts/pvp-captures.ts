/**
 * PVP-FLOW-2 (#647 PR 2): the wired PvP pages' captures at 375 x 812 and 1440 x 900 (DPR 2), from the stories `Pages/PvP`
 * (the pages themselves on the mock data source: the search, the scout, an attack, its result, the league), for the pull
 * request.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up)
 *   node scripts/pvp-captures.ts --out <folder> [--url http://localhost:6006]
 *
 * The pages draw the plan board (`BoardMap`), so no WebGL is needed. Each capture is written as WebP (the browser encodes it,
 * at 0.85), in `src/stories/captures/pvp/`. Node 24 runs it as is (type stripping).
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
/** Each story and the text its page shows once it has read the ledger. */
const CAPTURES = [
  { name: "page-search", story: "pages-pvp--search", ready: "Searching for a village" },
  { name: "page-scout", story: "pages-pvp--scout", ready: "Village score" },
  { name: "page-attack", story: "pages-pvp--attack", ready: "Attack:" },
  { name: "page-result", story: "pages-pvp--result", ready: "Village reward" },
  { name: "page-league", story: "pages-pvp--league", ready: "Leagues" },
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
      // The page read the ledger (the first visit waits for Storybook's compile): its text is shown.
      await page.waitForSelector(`#storybook-root :text('${capture.ready}')`, { timeout: 90_000 });
      // The tiles' art loads (Storybook's own socket keeps the network busy: no idle to wait for).
      await page.waitForFunction(() => [...document.querySelectorAll("#storybook-root img")].every((img) => (img as HTMLImageElement).complete), null, { timeout: 60_000 });
      await page.waitForTimeout(4_000);
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
