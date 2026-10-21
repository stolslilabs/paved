/**
 * HEADER-HEIGHT (#676): every page outside the board has one header height per breakpoint, and its content starts at the
 * same height. Each story of `Pages/Headers` (one per page, in the shell's providers; `src/stories/page-headers.ts` lists
 * them with the routes they cover) at 375 px and at 1440 px:
 * - one header at the top of the page (a `data-slot="page-header"` element, or the navigation's header from `desktop`, not
 *   the fixed bottom bar), as tall as the `--header-h` token (theme.css) at that width;
 * - the content's first box (painted, text, a picture, a control, a tab page's title row from `desktop`) starts at the same
 *   height in the layout on every page but the heroes (Home, Welcome);
 * - every page listed has its story, and every story is listed.
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
import { HERO_PAGES, PAGE_HEADER_STORIES } from "../src/stories/page-headers.ts";

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
  /** The headers at the top of the page: their height. */
  headers: { name: string; height: number }[];
  /** Where the content starts: the top of its first element below the header, in px. */
  content: number | null;
}

/** Runs in the page: the token, the header at the top, and where the content starts. */
function measure(): Measure {
  const root = document.documentElement;
  const rem = parseFloat(getComputedStyle(root).fontSize);
  const raw = getComputedStyle(root).getPropertyValue("--header-h").trim();
  const token = raw.endsWith("rem") ? parseFloat(raw) * rem : parseFloat(raw);
  const shown = (el: Element) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 1 && r.height > 1;
  };
  const fixed = (el: Element) => {
    for (let a: Element | null = el; a; a = a.parentElement) if (getComputedStyle(a).position === "fixed") return true;
    return false;
  };
  const top = [...document.querySelectorAll('[data-slot="page-header"], nav[aria-label="Main"]')].filter(
    (el) => shown(el) && Math.abs(el.getBoundingClientRect().top) < 0.5 && !(el.matches("nav") && getComputedStyle(el).position === "fixed"),
  );
  const bottom = Math.max(0, ...top.map((el) => el.getBoundingClientRect().bottom));
  // The content's first box: one with a background, a border or a shadow, text of its own, a picture, a control, or a header
  // below the top one (a tab page's title row from `desktop`); not in the header, not fixed (the bottom bar, the edge fades).
  // Its place in the layout (`offsetTop`), not on screen: a transform (a chosen card grown a little) moves no content.
  const painted = (cs: CSSStyleDeclaration) =>
    !/rgba\(.*, 0\)$|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== "none";
  const layoutTop = (el: HTMLElement) => {
    let y = 0;
    for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) y += e.offsetTop + (e === el ? 0 : e.clientTop) - (e === el ? 0 : e.scrollTop);
    return y;
  };
  let content: number | null = null;
  for (const el of document.body.querySelectorAll<HTMLElement>("#storybook-root *")) {
    if (top.some((h) => h.contains(el) || el.contains(h)) || !shown(el) || fixed(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "");
    const cs = getComputedStyle(el);
    if (!own && !painted(cs) && !el.matches('img, button, input, canvas, svg, [data-slot="card"], [data-slot="page-header"]')) continue;
    const t = Math.round(layoutTop(el) * 100) / 100;
    if (t >= bottom - 0.5 && (content === null || t < content)) content = t;
  }
  return {
    token,
    content,
    headers: top.map((el) => {
      const label = el.getAttribute("aria-label");
      return { name: `${el.tagName.toLowerCase()}${label ? `[${label}]` : ""}`, height: Math.round(el.getBoundingClientRect().height * 100) / 100 };
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
  const listed = Object.keys(PAGE_HEADER_STORIES);
  for (const name of listed) if (!stories.includes(PREFIX + name)) failures.push(`${name}: listed in page-headers.ts, no story`);
  for (const id of stories) if (!listed.includes(id.slice(PREFIX.length))) failures.push(`${id}: a story not listed in page-headers.ts`);
  const { server, origin } = await serve(opts.dir);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    for (const width of opts.widths) {
      const heights = new Map<number, string[]>();
      const starts = new Map<number, string[]>();
      for (const id of stories) {
        const name = id.slice(PREFIX.length);
        await page.setViewportSize({ width, height: 800 });
        await render(page, origin, id);
        const { token, headers, content } = await page.evaluate(measure);
        if (!(token > 0)) failures.push(`${name} at ${width} px: no --header-h`);
        if (headers.length !== 1) failures.push(`${name} at ${width} px: ${headers.length} headers at the top (${headers.map((h) => h.name).join(", ")}), not one`);
        for (const h of headers) {
          if (Math.abs(h.height - token) > 0.5) failures.push(`${name} at ${width} px: ${h.name} is ${h.height} px, --header-h is ${token} px`);
          heights.set(h.height, [...(heights.get(h.height) ?? []), name]);
        }
        const hero = HERO_PAGES.includes(name);
        if (!hero) {
          if (content === null) failures.push(`${name} at ${width} px: no content below the header`);
          else starts.set(content, [...(starts.get(content) ?? []), name]);
        }
        console.log(`${width} px  ${name.padEnd(18)}  ${headers.map((h) => `${h.name} ${h.height}`).join(", ")}  content at ${content}${hero ? " (hero)" : ""}  (--header-h ${token})`);
      }
      const list = (m: Map<number, string[]>) => [...m].map(([v, pages]) => `${v} px (${[...new Set(pages)].join(", ")})`).join("; ");
      if (heights.size > 1) failures.push(`at ${width} px the headers differ: ${list(heights)}`);
      if (starts.size > 1) failures.push(`at ${width} px the content starts at different heights: ${list(starts)}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\n${stories.length} pages x ${opts.widths.join(", ")} px: ${failures.length ? `${failures.length} failure(s)` : "one header height and one content start per width"}.`);
  process.exitCode = failures.length ? 1 : 0;
}

await main();
