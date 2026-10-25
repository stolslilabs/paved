/**
 * V2-HOME-LOADING (#761): the home's loading for the pull request. The stories of the fog (`Elements/VillageFog`, and the
 * home's `Fogged`, `Clearing` and `Ready`) at 375 x 812 and 1440 x 900 (DPR 2), as WebP; and, with `--app`, a GIF at 375 px
 * of a cold arrival on the built app under the throttled phone profile (`load-trace.ts`'s `phone`: the CPU slowed 4x, the
 * network shaped as DevTools' Fast 4G, 9 Mbit/s down and a 170 ms round trip), from Chromium's screencast, resampled at 10
 * frames a second, with the times of the village's first frame and of the fog's clearing.
 *
 *   bun run storybook                 (in another shell, or pass --storybook to a Storybook already up)
 *   node scripts/home-loading-captures.ts --out <folder> [--storybook http://localhost:6006]
 *     [--app https://localhost:8743/ --spki <base64 sha256>]   (the built app served over HTTPS, see load-trace.ts)
 *     [--only stories|gif]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { encodeGif } from "./gif.ts";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const STORYBOOK = arg("storybook", "http://localhost:6006");
const APP = arg("app", "");
const SPKI = arg("spki", "");
const OUT = arg("out", "");
const ONLY = arg("only", "");
if (!OUT) throw new Error("--out <folder> is required");

const SIZES = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
];
/** Each story, and what it waits for: the fog drawn, or gone once the village is drawn. */
const STORIES = [
  { name: "fog-element", story: "elements-villagefog--fogged", until: "fogged" },
  { name: "fogged", story: "scenes-home--fogged", until: "fogged" },
  { name: "clearing", story: "scenes-home--clearing", until: "clearing" },
  { name: "ready", story: "scenes-home--clearing", until: "gone" },
] as const;

/** An image (PNG or JPEG bytes) as WebP or as RGBA pixels, by the browser. */
async function decode(browser: Browser, bytes: Buffer, mime: string, as: "webp" | "rgba") {
  const page = await browser.newPage();
  const out = await page.evaluate(
    async ({ b64, mime, as }) => {
      const img = new Image();
      img.src = `data:${mime};base64,${b64}`;
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
    { b64: bytes.toString("base64"), mime, as },
  );
  await page.close();
  return { width: out.width, height: out.height, data: Buffer.from(out.b64, "base64") };
}

async function stories(browser: Browser) {
  for (const s of STORIES) {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
      await page.goto(`${STORYBOOK}/iframe.html?id=${s.story}&viewMode=story`, { waitUntil: "load" });
      await page.waitForSelector("[data-village-fog]", { state: "attached", timeout: 120_000 });
      if (s.until === "clearing") await page.waitForSelector("[data-village-fog=clearing]", { state: "attached", timeout: 180_000, });
      if (s.until === "gone") await page.waitForSelector("[data-village-fog]", { state: "detached", timeout: 180_000 });
      // The fogged frames settle (the mist rolls in); the clearing one is caught mid-way; the drawn village gets its next frames.
      await page.waitForTimeout(s.until === "clearing" ? 250 : s.until === "gone" ? 2_000 : 1_500);
      const png = await page.screenshot({ timeout: 180_000 });
      await page.close();
      const file = join(OUT, `${s.name}-${size.width}.webp`);
      writeFileSync(file, (await decode(browser, png, "image/png", "webp")).data);
      console.log(file);
    }
  }
}

/** A cold arrival on the throttled phone profile: the screencast's frames until the fog is gone, then a second more. */
async function gif(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    localStorage.setItem("welcomed", "1");
    (globalThis as { __PAVED_LOAD_TRACE__?: boolean }).__PAVED_LOAD_TRACE__ = true;
    const times: Record<string, number> = {};
    (globalThis as { __fog?: Record<string, number> }).__fog = times;
    new MutationObserver(() => {
      const fog = document.querySelector("[data-village-fog]");
      const state = fog?.getAttribute("data-village-fog") ?? (times.fogged !== undefined ? "gone" : null);
      if (state && times[state] === undefined) times[state] = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-village-fog"] });
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 170, downloadThroughput: (9e6 / 8) | 0, uploadThroughput: (1.5e6 / 8) | 0 });
  const frames: Array<{ at: number; jpeg: Buffer }> = [];
  cdp.on("Page.screencastFrame", (e) => {
    frames.push({ at: e.metadata.timestamp! * 1000, jpeg: Buffer.from(e.data, "base64") });
    void cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 375, maxHeight: 812, everyNthFrame: 1 });
  const start = Date.now();
  await page.goto(APP, { waitUntil: "commit", timeout: 180_000 });
  await page.waitForFunction(() => (globalThis as { __fog?: Record<string, number> }).__fog?.gone !== undefined, undefined, { timeout: 180_000, polling: 100 });
  await page.waitForTimeout(1_000);
  await cdp.send("Page.stopScreencast");
  const times = await page.evaluate(() => ({
    ...(globalThis as { __fog?: Record<string, number> }).__fog,
    firstFrame: (() => {
      const m = performance.getEntriesByName("paved:first-frame")[0];
      return m ? m.startTime + m.duration : undefined;
    })(),
  }));
  await context.close();
  // 10 frames a second from the navigation: each shows the last screencast frame before its time.
  const t0 = start;
  const end = frames[frames.length - 1]!.at;
  const picked: Buffer[] = [];
  for (let t = t0, i = 0; t <= end; t += 100) {
    while (i + 1 < frames.length && frames[i + 1]!.at <= t) i++;
    picked.push(frames[i]!.jpeg);
  }
  const decoded = [];
  for (const jpeg of picked) decoded.push(await decode(browser, jpeg, "image/jpeg", "rgba"));
  const { width, height } = decoded[0]!;
  const file = join(OUT, "home-loading-375.gif");
  writeFileSync(file, encodeGif(width, height, decoded.filter((d) => d.width === width && d.height === height).map((d) => new Uint8Array(d.data)), 10));
  console.log(file, JSON.stringify(Object.fromEntries(Object.entries(times).map(([k, v]) => [k, v === undefined ? null : Math.round(v)]))));
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...(SPKI ? [`--ignore-certificate-errors-spki-list=${SPKI}`] : [])],
});
try {
  if (ONLY !== "gif") await stories(browser);
  if (APP && ONLY !== "stories") await gif(browser);
} finally {
  await browser.close();
}
