/**
 * DIRECTIONS-2 (#537, PR 1b): the images of the direction stories D, E and F (since removed), drawn once and committed under
 * `src/directions/renders/`. Nothing imports them: they are the masters of the app's copies (`scripts/app-renders.ts`).
 *
 *   bun run build --filter @paved/renderer      (the page imports the renderer's dist)
 *   nice -n 10 node scripts/direction-renders.ts [--only <name>]
 *
 * It serves `direction-renders/page.ts` with the app's `public/` and manifest (a Vite server on a free local port), opens it in
 * one headless Chromium (playwright-core's) and writes each render of `RENDERS` as a WebP. The boards are the bench's recorded
 * games through the board's own `GameScene`; the wordmark is `assets/banner.svg`'s letters as voxels (see the page). On a
 * machine with no GPU Chromium draws with SwiftShader (software WebGL): the run says which.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoardSpec, WordmarkSpec } from "./direction-renders/page.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const OUT = join(APP, "src/directions/renders");

/** The tiles the hand card, the detail sheet, the collection rows and the podium show, each keyed to transparency. */
const TILE_KEYS = ["ccccccccc", "cccccfrfc", "rfrfffffr", "wffffffff", "sfrfrfrfr", "rfffrfffr", "ffcfffcff", "cfffcfffc", "rfrfrfcff", "ffffffcff"];
const tile = (key: string, theme: number): BoardSpec => ({ kind: "board", board: "tiles", tiles: [{ key, dx: 0, dy: 0, orientation: 1 }], theme, width: 320, height: 320, zoom: 7.8, polar: 40, azimuth: 35, keyed: true });
/** A small realm for a mode card: a few tiles side by side. */
const strip = (keys: string[], cols: number): BoardSpec["tiles"] => keys.map((key, i) => ({ key, dx: (i % cols) - Math.floor(cols / 2), dy: Math.floor(i / cols), orientation: (i % 4) + 1 }));

export const RENDERS: Record<string, BoardSpec | WordmarkSpec> = {
  wordmark: { kind: "wordmark", width: 1400, height: 400 },
  // Home's hero: the 72-tile game, close, from above the south-east, Forest variants.
  "hero-tall": { kind: "board", board: "72", theme: 1, width: 750, height: 1000, zoom: 2, polar: 52, azimuth: 35, offset: [-4, -0.5], keyed: true },
  "hero-wide": { kind: "board", board: "72", theme: 1, width: 1600, height: 800, zoom: 1.6, polar: 55, azimuth: 35, offset: [-3, -0.5], keyed: true },
  // The HUD: the 38-tile game in play, its free slots and the tile in hand placed, pending.
  "hud-tall": { kind: "board", board: "38", theme: 1, width: 750, height: 1624, zoom: 1.5, offset: [-1.5, 0], polar: 42, azimuth: 30, hand: true, keyed: true },
  "hud-wide": { kind: "board", board: "38", theme: 1, width: 1440, height: 900, zoom: 1.6, offset: [-1, 0], polar: 45, azimuth: 30, hand: true, keyed: true },
  // The score screen's banner: the finished 38-tile game, close on its west half.
  "score-wide": { kind: "board", board: "38", theme: 1, width: 1200, height: 560, zoom: 2.6, offset: [-1, 0], polar: 48, azimuth: 35, keyed: true },
  // The mode cards.
  "mode-challenge": { kind: "board", board: "72", theme: 1, width: 640, height: 400, zoom: 3.2, polar: 50, azimuth: 35, offset: [-2, 1], keyed: true },
  "mode-training": { kind: "board", board: "tiles", tiles: strip(["rfrfffffr", "rfffrfffr", "ffcfffcff", "sfrfrfrfr", "wffffffff", "rfrfrfcff"], 3), theme: 0, width: 640, height: 400, zoom: 3.6, polar: 50, azimuth: 35, keyed: true },
  "mode-tutorial": { kind: "board", board: "tiles", tiles: strip(["rfffrfffr", "cccccfrfc"], 2), theme: 1, width: 640, height: 400, zoom: 4.6, polar: 50, azimuth: 35, keyed: true },
  // The tile themes, as Settings offers them: the base models and Forest.
  "theme-0": { kind: "board", board: "tiles", tiles: strip(["cccccfrfc", "rfrfffffr", "wffffffff", "ccccccccc"], 2), theme: 0, width: 480, height: 360, zoom: 4.2, polar: 45, azimuth: 35, keyed: true },
  "theme-1": { kind: "board", board: "tiles", tiles: strip(["cccccfrfc", "rfrfffffr", "wffffffff", "ccccccccc"], 2), theme: 1, width: 480, height: 360, zoom: 4.2, polar: 45, azimuth: 35, keyed: true },
  ...Object.fromEntries(TILE_KEYS.map((key) => [`tile-${key}`, tile(key, 1)])),
};

async function run(): Promise<void> {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const { createServer } = await import("vite");
  const { rendererAssets } = await import("../vite/renderer-assets.ts");
  const { chromium } = await import("playwright-core");
  const server = await createServer({
    configFile: false,
    root: join(HERE, "direction-renders"),
    publicDir: join(APP, "public"),
    plugins: [rendererAssets()],
    // The page draws the wordmark with three.js: the renderer's own copy, so there is one.
    resolve: { alias: [{ find: /^three$/, replacement: resolve(APP, "../renderer/node_modules/three/build/three.module.js") }] },
    server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [resolve(APP, "../..")] } },
    logLevel: "warn",
  });
  await server.listen();
  const address = server.resolvedUrls?.local[0];
  if (!address) throw new Error("direction-renders: the server has no local address");
  const browser = await chromium.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-gpu", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])] });
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1800 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error(`page: ${e.message}`));
    await page.goto(address);
    await page.waitForFunction(() => "paved" in window, undefined, { timeout: 60_000 });
    const gl = await page.evaluate(() => (window as unknown as { paved: { setup(): Promise<{ software: boolean }> } }).paved.setup());
    console.log(`WebGL: ${gl.software ? "software (SwiftShader)" : "GPU"}`);
    mkdirSync(OUT, { recursive: true });
    for (const [name, spec] of Object.entries(RENDERS)) {
      if (only && name !== only) continue;
      const started = performance.now();
      const out = await page.evaluate(
        (s) => (window as unknown as { paved: { render(s: unknown): Promise<{ webp: string; backdrop?: string }> } }).paved.render(s),
        spec,
      );
      const body = Buffer.from(out.webp.slice(out.webp.indexOf(",") + 1), "base64");
      if (body.subarray(8, 12).toString("latin1") !== "WEBP") throw new Error(`direction-renders: ${name} is not a WebP`);
      writeFileSync(join(OUT, `${name}.webp`), body);
      console.log(`${name}.webp: ${body.length} B, ${((performance.now() - started) / 1000).toFixed(1)} s${out.backdrop ? `, backdrop ${out.backdrop}` : ""}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await run();
