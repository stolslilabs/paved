/**
 * V4-CHEST-ART-2 (#874): the chests wired in, for the pull request. A GIF at 375 px of an epic chest opening on the Chests page (the
 * story `Pages/Village` `Chests`, on the mock ledger: the chest shakes, a tap opens it, the lid swings up and back on its hinges, the
 * light bursts and the tiles fly out), and WebP stills at 375 x 812 and 1440 x 900 (DPR 2) of the slots, the modal and the icons.
 *
 *   bun run storybook                 (in another shell, or pass --url to a Storybook already up, or a static build served)
 *   node scripts/chest-captures.ts --out <folder> [--url http://localhost:6006] [--only gif|stills]
 *
 * The GIF's frames are taken on Playwright's clock, paused and stepped 40 ms at a time (25 frames a second), so no frame is lost
 * to a slow screenshot. Node 24 runs it as is (type stripping).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { encodeGif } from "./gif.ts";

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
const STILLS = [
  { name: "page-chests", story: "pages-village--chests" },
  { name: "modal-ready", story: "scenes-village-v2-chests--waiting" },
  { name: "modal-open", story: "scenes-village-v2-chests--epic-chosen" },
  { name: "slots", story: "scenes-village-v2-chests--slots" },
  { name: "slots-full", story: "scenes-village-v2-chests--kept" },
  { name: "art-hinge", story: "elements-chestart--hinge" },
  { name: "art-states", story: "elements-chestart--states" },
  { name: "art-icons", story: "elements-chestart--in-badges-and-text" },
];
const STEP_MS = 40;

const story = (id: string) => `${URL_BASE}/iframe.html?id=${id}&viewMode=story`;

/** An image as WebP or as RGBA pixels, by the browser. */
async function decode(browser: Browser, png: Buffer, as: "webp" | "rgba") {
  const page = await browser.newPage();
  const out = await page.evaluate(
    async ({ b64, as }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      if (as === "webp") return { width: 0, height: 0, b64: canvas.toDataURL("image/webp", 0.85).split(",")[1]! };
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let bin = "";
      for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
      return { width: canvas.width, height: canvas.height, b64: btoa(bin) };
    },
    { b64: png.toString("base64"), as },
  );
  await page.close();
  return { width: out.width, height: out.height, data: Buffer.from(out.b64, "base64") };
}

/** Steps the paused clock until `ready` holds (the lazy chunks come in on the real network meanwhile). */
async function until(page: Page, ready: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 400; i++) {
    if (await ready()) return;
    await page.clock.runFor(50);
    await page.waitForTimeout(25);
  }
  throw new Error(`never came: ${what}`);
}

async function gif(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  await page.clock.install();
  await page.goto(story("pages-village--chests"), { waitUntil: "load" });
  await page.clock.pauseAt(Date.now() + 1000);
  const dialog = page.getByRole("dialog", { name: "Epic chest" });
  const chest = () => dialog.locator('[data-slot="chest-art"]');
  await until(page, async () => (await chest().count()) > 0, "the modal's chest");
  const frames: Buffer[] = [];
  const shoot = async (ms: number) => {
    for (let t = 0; t < ms; t += STEP_MS) {
      frames.push(await page.screenshot());
      await page.clock.runFor(STEP_MS);
    }
  };
  // The chest shakes under "Tap to open"; a tap opens it.
  await shoot(1600);
  await dialog.getByRole("button", { name: /^Open the epic chest/ }).click();
  await until(page, async () => (await dialog.getAttribute("data-phase")) === "reveal" && (await chest().count()) > 0, "the opening");
  await shoot(2400);
  await page.close();
  const decoded = [];
  for (const png of frames) decoded.push(await decode(browser, png, "rgba"));
  const { width, height } = decoded[0]!;
  const file = join(OUT, "chest-epic-opening-375.gif");
  writeFileSync(file, encodeGif(width, height, decoded.filter((d) => d.width === width && d.height === height).map((d) => new Uint8Array(d.data)), STEP_MS / 10));
  console.log(file, `${decoded.length} frames`);
}

async function stills(browser: Browser) {
  for (const s of STILLS) {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
      await page.goto(story(s.story), { waitUntil: "load" });
      await page.waitForSelector('[data-slot="chest-art"], [data-slot="chest-icon"]', { timeout: 60_000 });
      await page.waitForTimeout(2500);
      const file = join(OUT, `${s.name}-${size.width}.webp`);
      writeFileSync(file, (await decode(browser, await page.screenshot(), "webp")).data);
      await page.close();
      console.log(file);
    }
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  if (!ONLY || ONLY === "gif") await gif(browser);
  if (!ONLY || ONLY === "stills") await stills(browser);
} finally {
  await browser.close();
}
