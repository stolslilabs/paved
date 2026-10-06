// Visual parity of the renderer step: screenshots of the bench boards from fixed cameras, and a
// pixel diff of two sets. Run on the Mac, with the bench's own dependencies installed
// (`bun install --cwd scripts/bench`):
//
//   bun docs/measures/client-renderer/screenshots.ts shoot <dist-bench dir> <out dir>
//   bun docs/measures/client-renderer/screenshots.ts diff <dir A> <dir B> [<diff out dir>]
//
// `shoot` serves a built bench page (`bun run build:bench` in packages/app-web) and, for the 38
// and 72 boards, holds four cameras (the bench's click mode, so nothing moves) and saves a PNG of
// each: the whole board top-down, a tilted mid view, a close tilted view, and a close view of a
// pending tile placed with a real click. `diff` compares two sets pixel by pixel in the browser.
import { chromium } from "../../../scripts/bench/node_modules/playwright-core";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const VIEWS = [
  { name: "overview", distance: 280, polar: 0.01 },
  { name: "mid", distance: 120, polar: Math.PI * 0.15 },
  { name: "close", distance: 40, polar: Math.PI * 0.15 },
] as const;

const launch = () =>
  chromium.launch({ channel: "chrome", headless: false, args: ["--window-size=1440,900", "--window-position=0,0"] });

function serve(root: string) {
  const base = resolve(root);
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname === "/" ? "/bench.html" : decodeURIComponent(url.pathname);
      const full = resolve(base, "." + path);
      if (full !== base && !full.startsWith(base + sep)) return new Response("forbidden", { status: 403 });
      const file = Bun.file(full);
      return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
    },
  });
}

async function shoot(dist: string, out: string) {
  mkdirSync(out, { recursive: true });
  const server = serve(dist);
  const browser = await launch();
  for (const size of [38, 72]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 813 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.port}/bench.html?bench=${size}&mode=click`);
    await page.waitForFunction(() => (window as any).__benchClick?.ready || (window as any).__benchError, null, { timeout: 120_000 });
    const hold = async (distance: number, polar: number, at?: { x: number; z: number }) => {
      await page.evaluate(
        ({ distance, polar, at }) => {
          const bench = (window as any).__benchClick;
          const scene = bench.scene;
          const b = bench.board.bounds;
          const cx = at ? at.x : (b.minX + b.maxX) / 2;
          const cz = at ? at.z : (b.minZ + b.maxZ) / 2;
          scene.controls.controls.target.set(cx, 0, cz);
          scene.camera.position.set(cx, distance * Math.cos(polar), cz + distance * Math.sin(polar));
          scene.requestRender();
        },
        { distance, polar, at },
      );
      // Let damping settle and the frame present.
      await page.evaluate(() => new Promise<void>((r) => { let n = 0; const f = () => (++n >= 60 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    };
    for (const view of VIEWS) {
      await hold(view.distance, view.polar);
      await page.locator("canvas").screenshot({ path: join(out, `${size}-${view.name}.png`) });
    }
    // A pending tile, placed by a real click from the overview.
    await hold(280, 0.01);
    const target = await page.evaluate(() => (window as any).__benchClick.target(0));
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).__benchClick.next === 1);
    const at = await page.evaluate(() => {
      const t = (window as any).__benchClick.board.placements[0];
      return { x: t.worldX * 3, z: t.worldZ * 3 };
    });
    await hold(30, Math.PI * 0.15, at);
    await page.locator("canvas").screenshot({ path: join(out, `${size}-pending.png`) });
    const error = await page.evaluate(() => (window as any).__benchError ?? null);
    if (error) throw new Error(error);
    await context.close();
    console.log(`shot board ${size}`);
  }
  await browser.close();
  server.stop(true);
}

async function diff(a: string, b: string, out?: string) {
  const browser = await launch();
  const page = await browser.newPage();
  if (out) mkdirSync(out, { recursive: true });
  const rows: string[] = ["| Screenshot | Pixels that differ | Of which by more than 16/255 | Max channel difference |", "|---|---|---|---|"];
  for (const file of readdirSync(a).filter((f) => f.endsWith(".png")).sort()) {
    const url = (dir: string) => `data:image/png;base64,${readFileSync(join(dir, file)).toString("base64")}`;
    const r = await page.evaluate(
      async ({ ua, ub }) => {
        const load = (src: string) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
        const [ia, ib] = await Promise.all([load(ua), load(ub)]);
        const w = ia.width;
        const h = ia.height;
        const read = (img: HTMLImageElement) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, w, h);
        };
        const da = read(ia).data;
        const db = read(ib).data;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d")!;
        const outImg = ctx.createImageData(w, h);
        let differ = 0;
        let strong = 0;
        let max = 0;
        for (let p = 0; p < w * h; p++) {
          let d = 0;
          for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(da[p * 4 + k] - db[p * 4 + k]));
          if (d > 0) differ++;
          if (d > 16) strong++;
          if (d > max) max = d;
          // Grey copy of B, differences in red (scaled up).
          const g = (db[p * 4] + db[p * 4 + 1] + db[p * 4 + 2]) / 6;
          outImg.data[p * 4] = d > 0 ? Math.min(255, 64 + d * 8) : g;
          outImg.data[p * 4 + 1] = d > 0 ? 0 : g;
          outImg.data[p * 4 + 2] = d > 0 ? 0 : g;
          outImg.data[p * 4 + 3] = 255;
        }
        ctx.putImageData(outImg, 0, 0);
        return { total: w * h, differ, strong, max, png: c.toDataURL("image/png") };
      },
      { ua: url(a), ub: url(b) },
    );
    const pct = (n: number) => `${n} (${((100 * n) / r.total).toFixed(3)} %)`;
    rows.push(`| ${file} | ${pct(r.differ)} | ${pct(r.strong)} | ${r.max} |`);
    if (out) writeFileSync(join(out, file), Buffer.from(r.png.split(",")[1], "base64"));
  }
  await browser.close();
  console.log(rows.join("\n"));
}

const [cmd, x, y, z] = process.argv.slice(2);
if (cmd === "shoot") await shoot(x, y);
else if (cmd === "diff") await diff(x, y, z);
else throw new Error("usage: shoot <dist> <out> | diff <a> <b> [<out>]");
