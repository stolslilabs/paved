/**
 * HEADER-HEIGHT (#676): every page outside the board has one header height per breakpoint. Each story of `Pages/Headers`
 * (one per page, in the shell's providers) at 375 px and at 1440 px: every header it shows, the `data-slot="page-header"`
 * elements and the navigation's header when it is one (from `desktop`, not the fixed bottom bar), is as tall as the
 * `--header-h` token (theme.css) at that width, the same on every page, and the topmost starts at the top of the page.
 * Headless Chromium only (Playwright's headless shell), against `storybook-static` served on the loopback by this script.
 *
 *   bun run --filter @paved/app build-storybook
 *   node scripts/header-sweep.ts [--dir storybook-static] [--widths 375,1440]
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. The browser is the one `playwright-core` names:
 * `bunx playwright-core install chromium-headless-shell` once. Exit code 1 on a failed check.
 */
import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";

/** The stories of the page shells: one per page outside the board (src/stories/page-headers.stories.tsx). */
const PREFIX = "pages-headers--";

function args() {
  const argv = process.argv.slice(2);
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    dir: resolve(get("dir") ?? join(here, "..", "storybook-static")),
    widths: (get("widths") ?? "375,1440").split(",").map(Number),
  };
}

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};

/** The static site, on the loopback, on a free port. */
async function serve(dir: string): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    let file = join(dir, path);
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

/** Opens a story's preview and waits for its render to end, then for the fonts and two frames. */
async function render(page: Page, origin: string, id: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?viewMode=story&id=${encodeURIComponent(id)}`);
  await page.waitForFunction(
    () => {
      const render = (window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }).__STORYBOOK_PREVIEW__?.currentRender;
      if (document.body.classList.contains("sb-show-errordisplay")) throw new Error("the story failed to render");
      return render && ["finished", "completed"].includes(render.phase ?? "");
    },
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

interface Measure {
  /** `--header-h` at this width, in px. */
  token: number;
  /** Each header shown: its height and its top, in px. */
  headers: { name: string; height: number; top: number }[];
}

/** Runs in the page: the token and the headers on screen. */
function measure(): Measure {
  const root = document.documentElement;
  const rem = parseFloat(getComputedStyle(root).fontSize);
  const raw = getComputedStyle(root).getPropertyValue("--header-h").trim();
  const token = raw.endsWith("rem") ? parseFloat(raw) * rem : parseFloat(raw);
  const shown = (el: Element) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
  const candidates = [...document.querySelectorAll('[data-slot="page-header"], nav[aria-label="Main"]')].filter(
    (el) => shown(el) && (el.matches('[data-slot="page-header"]') || getComputedStyle(el).position !== "fixed"),
  );
  return {
    token,
    headers: candidates.map((el) => {
      const r = el.getBoundingClientRect();
      const label = el.getAttribute("aria-label");
      return { name: `${el.tagName.toLowerCase()}${label ? `[${label}]` : ""}`, height: Math.round(r.height * 100) / 100, top: Math.round(r.top * 100) / 100 };
    }),
  };
}

async function main() {
  const opts = args();
  const index = JSON.parse(await readFile(join(opts.dir, "index.json"), "utf8")) as { entries: Record<string, { id: string; type: string }> };
  const stories = Object.values(index.entries)
    .filter((e) => e.type === "story" && e.id.startsWith(PREFIX))
    .map((e) => e.id);
  const failures: string[] = [];
  if (stories.length === 0) failures.push(`no story under ${PREFIX}: is storybook-static built?`);
  const { server, origin } = await serve(opts.dir);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    for (const width of opts.widths) {
      const heights = new Map<number, string[]>();
      for (const id of stories) {
        const name = id.slice(PREFIX.length);
        await page.setViewportSize({ width, height: 800 });
        await render(page, origin, id);
        const { token, headers } = await page.evaluate(measure);
        if (!(token > 0)) failures.push(`${name} at ${width} px: no --header-h`);
        if (headers.length === 0) failures.push(`${name} at ${width} px: no header`);
        for (const h of headers) {
          if (Math.abs(h.height - token) > 0.5) failures.push(`${name} at ${width} px: ${h.name} is ${h.height} px, --header-h is ${token} px`);
          heights.set(h.height, [...(heights.get(h.height) ?? []), name]);
        }
        const top = Math.min(...headers.map((h) => h.top));
        if (headers.length && Math.abs(top) > 0.5) failures.push(`${name} at ${width} px: the first header starts at ${top} px, not at the top`);
        console.log(`${width} px  ${name.padEnd(16)}  ${headers.map((h) => `${h.name} ${h.height}`).join(", ")}  (--header-h ${token})`);
      }
      if (heights.size > 1) failures.push(`at ${width} px the headers differ: ${[...heights].map(([h, pages]) => `${h} px (${[...new Set(pages)].join(", ")})`).join("; ")}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\n${stories.length} pages x ${opts.widths.join(", ")} px: ${failures.length ? `${failures.length} failure(s)` : "one header height per width"}.`);
  process.exitCode = failures.length ? 1 : 0;
}

await main();
