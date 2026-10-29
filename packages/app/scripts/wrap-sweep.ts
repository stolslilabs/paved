/**
 * WRAP360: every story of the built Storybook, at 360 px (the priority width) and 320 px (small mobile), checked
 * for text that does not fit. Headless Chromium only (Playwright's headless shell), against `storybook-static`
 * served on the loopback by this script.
 *
 *   bun run --filter @paved/app build-storybook
 *   node scripts/wrap-sweep.ts [--dir storybook-static] [--widths 360,320] [--filter <id part>] [--workers 4] [--json <file>]
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. The browser is the one `playwright-core`
 * names: `bunx playwright-core install chromium-headless-shell` once.
 *
 * Kinds, one row per element:
 * - `viewport`: the element sticks out of the viewport (left or right), with no clipping or scrolling ancestor.
 * - `overflow`: the content of a box is wider than the box (`scrollWidth > clientWidth`), the box does not clip
 *   it, and text leaves the box. Only the innermost such box is listed.
 * - `clip`: text cut by an ancestor with `overflow: hidden` or `clip` (either axis), without an ellipsis.
 * - `truncate`: an ellipsis (`text-overflow: ellipsis`) whose full text is not reachable: no `title` or
 *   on the element or an ancestor. An ellipsis with one of them is fine and not listed.
 * - `scroll`: a box that scrolls horizontally. Only deliberate scrollers are fine, and they are in ALLOWED.
 * - `page`: the page itself scrolls horizontally.
 * - `split`: an address (`0x…`, short or full) or a monospace word (between spaces and hyphens) broken over two lines although it would fit on one
 *   line: "0x05f1…" over "6e7f". A run too long for any line (a full address in a sentence) may wrap.
 * - `error`: the story failed to render.
 *
 * Exit code 1 when a finding is not in ALLOWED.
 */
import { createServer, type Server } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { sweepStory } from "./wrap-sweep-retry.ts";

type Kind = "viewport" | "overflow" | "clip" | "truncate" | "scroll" | "split" | "page" | "error";

interface Finding {
  story: string;
  width: number;
  kind: Kind;
  element: string;
}

interface Allowed {
  /** A story id, or a pattern over story ids. */
  story: string | RegExp;
  kind: Kind;
  /** A part of the element's description, as the table prints it. */
  element: string;
}

/**
 * Deliberate exceptions. Each entry says why; none is a blanket skip of a story, a kind or a width.
 */
const ALLOWED: (Allowed & { why: string })[] = [
  // A carousel: its track is wider than its window and the window clips it, by design (Embla).
  { story: /^ui-carousel--/, kind: "clip", element: "div[carousel-content]", why: "carousel window" },
  { story: /^ui-carousel--/, kind: "overflow", element: 'div "DailyOne deck', why: "carousel track" },
  // Story's campaign cards (#592): the same carousel on a phone, its next card peeking past the window, by design.
  // The same page among the page shells of HEADER-HEIGHT (#676).
  { story: /^(scenes-story--|pages-headers--story-campaigns$|containers-pagesheet--story-(phone|wide)$)/, kind: "clip", element: "div[carousel-content]", why: "carousel window" },
  { story: /^(scenes-story--|pages-headers--story-campaigns$|containers-pagesheet--story-(phone|wide)$)/, kind: "overflow", element: 'div "Tutorial', why: "carousel track" },
  // A horizontal scroller, by design: the story shows ScrollArea's horizontal mode.
  { story: "ui-scroll-area--horizontal", kind: "scroll", element: "div[scroll-area-viewport]", why: "horizontal scroller" },
  // The same for ScrollRegion (NO-SCROLLBARS, #609): its horizontal story is a sideways scroller with the edge hint.
  { story: "ui-scroll-region--horizontal", kind: "scroll", element: "div[scroll-region]", why: "horizontal scroller" },
  // The village board (#646): its cells keep the 44 px touch floor, so a village wider than a phone scrolls both ways in a
  // ScrollRegion with the edge hint, by design.
  // The wired village page (#646 PR 2) and its header story draw the same plan in the same scroller.
  { story: /^(scenes-village|containers-villageboard|pages-village)--|^pages-headers--village$/, kind: "scroll", element: "div[scroll-region]", why: "village plan scroller" },
  // The v2 village (#739): its layout board scrolls both ways the same; the editor's inventory is a carousel whose window clips its track.
  { story: /^(scenes-village-v2-layout|containers-layoutboard)--/, kind: "scroll", element: "div[scroll-region]", why: "v2 village scroller" },
  { story: /^(scenes-village-v2-layout|containers-inventorytray)--/, kind: "clip", element: "div[carousel-content]", why: "carousel window" },
  { story: /^(scenes-village-v2-layout|containers-inventorytray)--/, kind: "overflow", element: 'div "×', why: "carousel track" },
  // The home's edit mode (#753) is the v2 village's editor in the home's scene: its plan keeps the touch floor and scrolls both
  // ways, its inventory is the same carousel. The home's view fits its plan to the screen: no scroller there.
  { story: /^scenes-home--(editing|holding|placing|lifted|moved|reset-holding|changed|leaving|refused|scene-editing|scene-placed|scene-moved|press-into-edit|scene-press-into-edit|die|slots)/, kind: "scroll", element: "div[scroll-region]", why: "v2 village scroller" },
  { story: /^scenes-home--(editing|holding|placing|lifted|moved|reset-holding|changed|leaving|refused|scene-editing|scene-placed|scene-moved|press-into-edit|scene-press-into-edit|die|slots)/, kind: "clip", element: "div[carousel-content]", why: "carousel window" },
  { story: /^scenes-home--(editing|holding|placing|lifted|moved|reset-holding|changed|leaving|refused|scene-editing|scene-placed|scene-moved|press-into-edit|scene-press-into-edit|die|slots)/, kind: "overflow", element: 'div "×', why: "carousel track" },
  // The League page's carousel of the 23 leagues (#785), one per view: its window clips its track, by design.
  { story: /^(scenes-pvp-league--|scenes-home-panels--league$|pages-pvp--league(-matches)?(-phone|-wide)?$|pages-headers--pvp-league$)/, kind: "clip", element: "div[carousel-content]", why: "carousel window" },
  { story: /^(scenes-pvp-league--|scenes-home-panels--league$|pages-pvp--league(-matches)?(-phone|-wide)?$|pages-headers--pvp-league$)/, kind: "overflow", element: 'div "Wood0 – 399', why: "carousel track" },
  // The same village board in the PvP result's reward dialog (#647), opened by Choose.
  { story: "scenes-pvp-result--reward-sheet-open", kind: "scroll", element: "div[scroll-region]", why: "village plan scroller" },
  // The avatar creator's part tabs (#626): ten parts do not fit a phone, so the tab list scrolls sideways in a ScrollRegion with
  // the edge hint, the open tab kept in view, by design.
  { story: /^(scenes-avatarcreator--|pages-headers--avatar$)/, kind: "scroll", element: 'div[scroll-region] "Skin tone', why: "part tabs scroller" },
  // Specimens outside WRAP360's files (`ui/` primitives' stories and the Foundations in `src/styles`): one line per
  // specimen on purpose (a weight, a figure, a tooltip on each side). Not the components' layout.
  { story: "ui-tooltip--sides", kind: "page", element: "html scrollWidth", why: "four triggers in a row" },
  { story: "ui-tooltip--sides", kind: "viewport", element: "tooltip-", why: "four triggers in a row" },
  { story: "ui-tooltip--sides", kind: "overflow", element: 'div "toprightbottomleft"', why: "four triggers in a row" },
  // Foundations/Typography: each weight's line ("Place the tile, close the road", "1,240 · 0123456789") and each figure
  // row is one specimen line, by design.
  { story: "foundations-typography--weights", kind: "page", element: "html scrollWidth", why: "type specimen lines" },
  { story: "foundations-typography--weights", kind: "viewport", element: 'span "Place the tile, close the road"', why: "type specimen line" },
  { story: "foundations-typography--weights", kind: "viewport", element: 'span "1,240 · 0123456789"', why: "type specimen line" },
  { story: "foundations-typography--weights", kind: "overflow", element: 'li "font-sans font-', why: "type specimen line" },
  { story: "foundations-typography--weights", kind: "overflow", element: 'li "font-display font-', why: "type specimen line" },
  { story: "foundations-typography--weights", kind: "overflow", element: 'li "numeric font-', why: "type specimen line" },
  { story: "foundations-typography--tabular-numbers", kind: "page", element: "html scrollWidth", why: "figure specimen rows" },
  { story: "foundations-typography--tabular-numbers", kind: "viewport", element: 'ul "1111111,2408,8880.0012,345"', why: "figure specimen row" },
  { story: "foundations-typography--tabular-numbers", kind: "overflow", element: 'section "font-sans tabular-nums', why: "figure specimen row" },
  { story: "foundations-typography--tabular-numbers", kind: "overflow", element: 'section "numeric (Space Mono', why: "figure specimen row" },
  { story: "foundations-typography--tabular-numbers", kind: "overflow", element: 'code "font-sans proportional-nums"', why: "figure specimen row" },
  // The board's canvas keeps the width it mounted at when the window narrows (opened at 320 px it fits). The renderer's
  // files belong to R-VIS, not WRAP360; R-VIS's canvas ResizeObserver should make these two entries unneeded.
  { story: /^containers-boardviewport--/, kind: "page", element: "html scrollWidth 360 > 320", why: "canvas resize, R-VIS" },
  { story: /^renderer-outlines--/, kind: "page", element: "html scrollWidth 360 > 320", why: "canvas resize, R-VIS" },
  // Camera fit (CAMERA-FIT, #678): the board sits in a box of the screen preset's size (375 to 1920 px), so the frame is
  // read at that size; on a narrower window the story's own box scrolls sideways, by design.
  { story: /^renderer-camera-fit--/, kind: "scroll", element: " · N ", why: "screen-size preview scroller" },
];

const KIND_ORDER: Kind[] = ["error", "page", "viewport", "overflow", "clip", "truncate", "split", "scroll"];

function args() {
  const argv = process.argv.slice(2);
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    dir: resolve(get("dir") ?? join(here, "..", "storybook-static")),
    widths: (get("widths") ?? "360,320").split(",").map(Number),
    filter: get("filter"),
    workers: Number(get("workers") ?? 4),
    json: get("json"),
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
      // The build's hashed files never change: cached, a story does not fetch the preview's ~115 files again (a sweep
      // served 113,000 requests and 5.3 GB without, 16,000 and 0.9 GB with).
      const cache = path.startsWith("/assets/") ? { "cache-control": "public, max-age=31536000, immutable" } : {};
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", ...cache }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

/** Runs in the page: the findings of the story on screen, at the current width. */
function inspect(): { kind: string; element: string }[] {
  const vw = document.documentElement.clientWidth;
  const out: { kind: string; element: string; el: Element }[] = [];
  const clips = (v: string) => v === "hidden" || v === "clip";
  const scrolls = (v: string) => v === "auto" || v === "scroll";

  const describe = (el: Element) => {
    const slot = el.getAttribute("data-slot");
    const label = el.getAttribute("aria-label");
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
    return `${el.tagName.toLowerCase()}${slot ? `[${slot}]` : ""}${label ? `[aria-label="${label}"]` : ""}${text ? ` "${text}"` : ""}`;
  };

  /** Hidden for the eye: not laid out, invisible, or the 1 px box of `sr-only`. */
  const hidden = (el: Element, r: DOMRect, cs: CSSStyleDeclaration) =>
    cs.display === "none" || cs.visibility === "hidden" || (r.width <= 1 && r.height <= 1) || (cs.position === "absolute" && cs.clip !== "auto" && cs.clip !== "");

  /** Text rects of an element's text nodes, the descendants' included, but not those inside a scroller below it (they scroll, they are not cut). */
  const textRects = (el: Element) => {
    const rects: DOMRect[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const parent = n.parentElement;
      // Screen-reader text (`sr-only`) is never drawn: its run may pass its 1 px box, and the board's edge, unseen.
      if (!parent || parent.closest("svg") || parent.closest(".sr-only")) continue;
      const pcs = getComputedStyle(parent);
      if (pcs.visibility === "hidden" || pcs.display === "none") continue;
      // Text in a scroller, or cut by an ellipsis box, below `el` is that box's to judge (`scroll`, `truncate`), not `el`'s: a
      // page title cut with an ellipsis (#781) runs past a clipping page root without being cut by it.
      let scrolled = false;
      for (let a: Element | null = parent; a && a !== el; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (scrolls(acs.overflowX) || scrolls(acs.overflowY)) scrolled = true;
        if (acs.textOverflow === "ellipsis" && clips(acs.overflowX)) scrolled = true;
      }
      if (scrolled) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0) rects.push(r);
    }
    return rects;
  };

  const skip = new Set<Element>();
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg, canvas, script, style, #storybook-docs, .sb-wrapper, .sb-errordisplay, .sb-preparing-story, .sb-preparing-docs")) continue;
    if (el.parentElement && skip.has(el.parentElement)) {
      skip.add(el);
      continue;
    }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (hidden(el, r, cs)) {
      skip.add(el);
      continue;
    }

    // Out of the viewport, and nothing clips or scrolls it: the outermost such element only.
    if (r.right > vw + 1 || r.left < -1) {
      let held = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (clips(acs.overflowX) || scrolls(acs.overflowX)) held = true;
      }
      const parentOut = out.some((f) => f.kind === "viewport" && f.el === el.parentElement);
      if (!held && !parentOut && cs.position !== "fixed") out.push({ kind: "viewport", element: describe(el), el });
    }

    if (cs.display === "inline" || el.clientWidth === 0) continue;
    const wide = el.scrollWidth > el.clientWidth + 1;
    if (scrolls(cs.overflowX)) {
      if (wide) out.push({ kind: "scroll", element: describe(el), el });
    } else if (cs.textOverflow === "ellipsis" && wide) {
      const reachable = el.closest("[title]");
      if (!reachable) out.push({ kind: "truncate", element: describe(el), el });
    } else if (clips(cs.overflowX) || clips(cs.overflowY)) {
      if (cs.webkitLineClamp && cs.webkitLineClamp !== "none") {
        // A line clamp ends in an ellipsis: the same rule as text-overflow.
        if (el.scrollHeight > el.clientHeight + 1 && !el.closest("[title]")) out.push({ kind: "truncate", element: describe(el), el });
      } else {
        // Each axis counts only where it clips: a vertical scroller with `overflow-x: hidden` cuts nothing vertically.
        const box = el.getBoundingClientRect();
        const x = clips(cs.overflowX);
        const y = clips(cs.overflowY);
        const cut = textRects(el).some((t) => (x && (t.right > box.right + 1 || t.left < box.left - 1)) || (y && (t.bottom > box.bottom + 1 || t.top < box.top - 1)));
        if (cut) out.push({ kind: "clip", element: describe(el), el });
      }
    } else if (wide) {
      // Only text that leaves the box counts: a hover background bled into the parent's padding (`-mx-2`) does not.
      const box = el.getBoundingClientRect();
      if (textRects(el).some((t) => t.right > box.right + 1 || t.left < box.left - 1)) out.push({ kind: "overflow", element: describe(el), el });
    }
  }

  // Runs that must not break: each address (`0x` and hex, an ellipsis inside when shortened), and each word of monospace
  // text (an id, a figure, a hash: a sentence set in mono may wrap at its spaces and hyphens, as "tabular-nums" does in a
  // narrow cell; a word may not).
  // A shortened address is split as soon as its rects sit on two lines. A full address is split when they do while its
  // width fits the line it sits in: the content width of its nearest block that is not itself a flex or grid item, since a
  // squeezed item ("0x05f1…" over "6e7f" beside a button) is the very defect. A monospace word is split when its width
  // fits its own block.
  const ADDRESS = /0x[0-9a-fA-F]+(?:…[0-9a-fA-F]+)?/g;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? "";
    const parent = n.parentElement;
    if (!text.trim() || !parent || skip.has(parent) || parent.closest("svg, script, style, #storybook-docs, .sb-wrapper, .sb-errordisplay")) continue;
    const pcs = getComputedStyle(parent);
    if (pcs.display === "none" || pcs.visibility === "hidden") continue;
    const runs: [number, number, boolean][] = [];
    if (/mono/i.test(pcs.fontFamily)) for (const m of text.matchAll(/[^ \t\n-]+/g)) runs.push([m.index ?? 0, (m.index ?? 0) + m[0].length, false]);
    for (const m of text.matchAll(ADDRESS)) {
      const at = m.index ?? 0;
      const same = runs.findIndex(([s, e]) => s === at && e === at + m[0].length);
      if (same >= 0) runs[same][2] = true;
      else runs.push([at, at + m[0].length, true]);
    }
    const room = (el: Element | null, lineBox: boolean) => {
      const item = (e: Element) => !!e.parentElement && /flex|grid/.test(getComputedStyle(e.parentElement).display);
      while (el && (getComputedStyle(el).display.startsWith("inline") || (lineBox && item(el)))) el = el.parentElement;
      if (!el) return 0;
      const ecs = getComputedStyle(el);
      return el.clientWidth - parseFloat(ecs.paddingLeft) - parseFloat(ecs.paddingRight);
    };
    for (const [start, end, address] of runs) {
      const range = document.createRange();
      range.setStart(n, start);
      range.setEnd(n, end);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const lines = new Set(rects.map((r) => Math.round(r.top / 4)));
      if (lines.size < 2) continue;
      const width = rects.reduce((sum, r) => sum + r.width, 0);
      const run = text.slice(start, end);
      if ((address && run.includes("…")) || width <= room(parent, address) + 1) out.push({ kind: "split", element: `${describe(parent)} run "${run.slice(0, 40)}"`, el: parent });
    }
  }

  // The innermost box of a chain of overflows is the cause; its ancestors only carry it.
  const result = out.filter((f) => f.kind !== "overflow" || !out.some((g) => g !== f && g.kind === "overflow" && f.el.contains(g.el)));
  if (document.documentElement.scrollWidth > window.innerWidth + 1) result.push({ kind: "page", element: `html scrollWidth ${document.documentElement.scrollWidth} > ${window.innerWidth}`, el: document.documentElement });
  return result.map(({ kind, element }) => ({ kind, element }));
}

/** Opens a story's preview and waits for its render (play function included) to end; resolves to an error message or null. */
async function render(page: Page, origin: string, id: string): Promise<string | null> {
  try {
    // `domcontentloaded`, not `load`: the wait below is for the story's own render phase. (The 30 s of `goto` that slow runners
    // passed went before either event, to the commit after a canvas story: see `worker`.)
    await page.goto(`${origin}/iframe.html?viewMode=story&id=${encodeURIComponent(id)}`, { waitUntil: "domcontentloaded" });
    const phase = await page.waitForFunction(
      () => {
        const render = (window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }).__STORYBOOK_PREVIEW__?.currentRender;
        if (document.body.classList.contains("sb-show-errordisplay")) return "errored";
        return render && ["finished", "completed", "errored", "aborted"].includes(render.phase ?? "") ? render.phase : false;
      },
      undefined,
      { timeout: 60_000 },
    );
    const result = await phase.jsonValue();
    if (result === "finished" || result === "completed") return null;
    const message = await page.evaluate(() => document.querySelector(".sb-errordisplay")?.textContent?.trim().slice(0, 200) ?? "");
    return `${result}: ${message}`;
  } catch (e) {
    return (e as Error).message.split("\n")[0];
  }
}

/** Fonts loaded, animations done (or 1.5 s), two frames. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const end = performance.now() + 1500;
    while (performance.now() < end && document.getAnimations().some((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity)) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(100);
}

function allowed(f: Finding) {
  return ALLOWED.some((a) => a.kind === f.kind && (typeof a.story === "string" ? a.story === f.story : a.story.test(f.story)) && f.element.includes(a.element));
}

async function main() {
  const opts = args();
  const index = JSON.parse(await readFile(join(opts.dir, "index.json"), "utf8")) as { entries: Record<string, { id: string; type: string }> };
  const stories = Object.values(index.entries)
    .filter((e) => e.type === "story" && (!opts.filter || e.id.includes(opts.filter)))
    .map((e) => e.id);
  const { server, origin } = await serve(opts.dir);
  const started = performance.now();
  const findings: Finding[] = [];
  /** How long each story took to open (navigation and render), ms: the summary names the slowest. */
  const opened: { story: string; ms: number }[] = [];
  // The 3D stories (board, tiles, outlines) take seconds each in software WebGL; spread them over the workers
  // rather than let four of them start together: a fixed shuffle, so two runs take the same order.
  let seed = 360;
  const queue = stories
    .map((id) => ({ id, key: (seed = (seed * 1103515245 + 12345) % 2147483648) }))
    .sort((a, b) => a.key - b.key)
    .map((s) => s.id);

  async function worker() {
    // One browser per worker: each has its own GPU process, and software WebGL (the 3D stories) is its bottleneck.
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: opts.widths[0], height: 740 }, reducedMotion: "reduce" });
    let page = await context.newPage();
    // The next page, the last one closed (its frames stop).
    const fresh = async (old: Page) => {
      await old.close().catch(() => {});
      return context.newPage();
    };
    for (let id = queue.shift(); id; id = queue.shift()) {
      // A navigation timeout is retried once on a fresh page (a slow runner, not a wrap defect), and logged.
      const swept = await sweepStory(page, id, opts.widths, {
        render: async (p, story) => {
          const at = performance.now();
          const error = await render(p, origin, story);
          opened.push({ story, ms: performance.now() - at });
          return error;
        },
        fresh,
        setWidth: (p, width) => p.setViewportSize({ width, height: 740 }),
        settle,
        inspect: (p) => p.evaluate(inspect),
        wait: (p, ms) => p.waitForTimeout(ms),
        log: (message) => console.log(message),
      });
      page = swept.page;
      for (const f of swept.findings) findings.push({ ...f, kind: f.kind as Kind });
      // A story that draws on a canvas (the 3D board, tiles, outlines, in software WebGL) keeps its renderer busy with its
      // frames: navigated in place, the next story commits only once that renderer is free, which took up to 14 s on a 12-core
      // Mac with 4 workers and passed `goto`'s 30 s on slow CI runners. Its page is closed instead (its frames stop) and
      // the next story gets a new one; the others keep the page, whose warm scripts a new page would compile again (about
      // 0.1 s a story). The same after a story that did not render.
      const failed = swept.findings.some((f) => f.kind === "error");
      if (failed || (await page.evaluate(() => document.querySelector("canvas") !== null).catch(() => true))) page = await fresh(page);
    }
    await browser.close();
  }

  try {
    await Promise.all(Array.from({ length: Math.min(opts.workers, stories.length) }, worker));
  } finally {
    server.close();
  }

  findings.sort((a, b) => a.story.localeCompare(b.story) || b.width - a.width || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const open = findings.filter((f) => !allowed(f));
  const rows = findings.map((f) => [allowed(f) ? "allowed" : "FINDING", f.story, String(f.width), f.kind, f.element]);
  const head = ["status", "story", "width", "kind", "element"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join("  ");
  if (rows.length) console.log([line(head), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n"));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  opened.sort((a, b) => b.ms - a.ms);
  const slowest = opened.slice(0, 3).map((o) => `${o.story} ${(o.ms / 1000).toFixed(1)} s`);
  console.log(`\n${stories.length} stories x ${opts.widths.join(", ")} px in ${seconds} s: ${open.length} finding(s), ${findings.length - open.length} allowed.`);
  console.log(`Slowest to open: ${slowest.join(", ")}.`);
  if (opts.json) {
    const timings = opened.map((o) => ({ story: o.story, ms: Math.round(o.ms) }));
    await writeFile(opts.json, JSON.stringify({ stories: stories.length, widths: opts.widths, seconds: Number(seconds), findings, opened: timings }, null, 2));
  }
  process.exitCode = open.length ? 1 : 0;
}

await main();
