import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, devices, type Browser, type BrowserContext, type CDPSession, type Locator, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * PAGES-SCROLL (#782, the owner's decisions of 2026-10-26): every page and every side panel scrolls when its content is taller
 * than the screen, its header sticky. A real (headless Chromium) browser lays the pages out, against the Vite dev server of
 * this package (or `PAVED_E2E_URL`, a server already up with the same env):
 *
 *   bunx playwright-core install chromium-headless-shell   (once)
 *   bun run e2e -- pages-scroll   [PAVED_E2E_SHOTS=<folder>: the League and the Chests at 375 px, scrolled to their end]
 *
 * - Each page's scene, with content taller than the screen (`pages-scroll/harness.tsx`: a long defence
 *   log, ...), at 375 x 812 in the tab frame (a phone: touch, dragged by a finger) and at 1440 x 900 in the home's side panel
 *   (the wheel); a page of fixed length on a shorter screen of the same width (`SHORT`). Play and Cobbles are full-screen
 *   flows below `desktop`: there the document is what scrolls (`FLOWS`), under their sticky top bar. Per page and width: its
 *   content is taller than its region, the region is the one element that scrolls, it reaches the page's last element, and
 *   the header stays at the region's top. A page whose content fits fails: the pass would prove nothing.
 * - The app on the mock, at 1440 x 900: the panel has no close button; a click on the village outside it closes it and gives
 *   the focus back to the overlay's button that opened it; Escape closes it.
 *
 * Chromium's touch emulation is not iOS Safari: a real phone (or the Mac's iOS simulator) stays the check of iOS. Each check
 * prints its line (page, width, figures): the pass's list of the PR.
 */

const PAGES = ["shop", "chests", "league", "settings", "missions", "vault", "defence", "themes", "theme", "tiles", "referral", "credits", "play", "cobbles"] as const;
const TITLES: Record<(typeof PAGES)[number], string> = {
  shop: "Tile shop",
  chests: "Chests",
  league: "League",
  settings: "Settings",
  missions: "Missions",
  vault: "Vault",
  defence: "League",
  themes: "Themes",
  tiles: "My tiles",
  referral: "Referral",
  credits: "Credits",
  theme: "Forest",
  play: "Choose a mode",
  cobbles: "Cobbles",
};

/**
 * The full-screen flows below `desktop` (Play, Cobbles: no tab frame, the document scrolls, under their sticky top bar); in the
 * side panel from `desktop` they scroll in its body as every other page.
 */
const FLOWS: ReadonlySet<(typeof PAGES)[number]> = new Set(["play", "cobbles"]);

/**
 * The pages whose content has a fixed length (no list to grow: the league's carousel and season, the referral's link and earnings), shorter
 * than a 1440 x 900 panel (and, the referral, than a 375 x 812 phone): they are measured on a shorter screen of the same width,
 * an iPhone SE's 667 px, a 720 px laptop (the referral's panel: 667 px), where that content is taller than the region.
 */
const SHORT: Partial<Record<(typeof PAGES)[number], { phone: number; desktop: number }>> = {
  // The league's carousel (#785) and its season: one card each, shorter than a phone since the ladder left, and shorter again
  // since #833 (one card size, no Attack button): it fits a 560 px window, so a shorter one.
  league: { phone: 500, desktop: 460 },
  referral: { phone: 667, desktop: 667 },
  // The Chests page with its modal closed (#784): the day's slots and the tile kept, no list since the modal took the chests.
  chests: { phone: 548, desktop: 560 },
  // The mode choice's five rows and the Cobbles' packs, of fixed length too: an iPhone SE's view under Safari's bars (548 px),
  // a 560 px browser window.
  play: { phone: 548, desktop: 560 },
  cobbles: { phone: 548, desktop: 560 },
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

let vite: ViteDevServer | null = null;
let base = process.env.PAVED_E2E_URL ?? "";
let browser: Browser;
const shots = process.env.PAVED_E2E_SHOTS ?? "";

beforeAll(async () => {
  if (!base) {
    // The mock, and a devnet burner so the app's pages read a connected player: the mock writes to the device's ledger only.
    process.env.VITE_DATA_SOURCE ??= "mock";
    process.env.VITE_PLAYER_ADDRESS ??= "0x0123456789abcdef";
    process.env.VITE_PLAYER_PRIVATE_KEY ??= "0x1";
    vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
    await vite.listen();
    const addr = vite.httpServer?.address();
    base = addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : "";
  }
  browser = await chromium.launch({ headless: true });
  if (shots) mkdirSync(shots, { recursive: true });
});

afterAll(async () => {
  await browser?.close();
  await vite?.close();
});

/** A finger's drag from `y0` to `y1`. */
async function drag(cdp: CDPSession, x: number, y0: number, y1: number): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] });
    await pause(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pause(350);
}

interface Measure {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** The elements of the document that scroll vertically (their `data-slot`, else their tag). */
  scrollers: string[];
  lastInView: boolean;
  headerAtTop: boolean;
}

/** The region's figures; the page's last element and its header against the region's box; every vertical scroller of the page. */
function measure(region: Locator): Promise<Measure> {
  return region.evaluate((el: HTMLElement) => {
    // The document (a flow's): its box is the viewport.
    const doc = el === document.scrollingElement;
    const box = doc ? { top: 0, bottom: innerHeight } : el.getBoundingClientRect();
    const header = el.querySelector("[data-slot=page-header]")?.getBoundingClientRect();
    let last: Element | null = el.querySelector("main");
    while (last?.lastElementChild) last = last.lastElementChild;
    const end = last?.getBoundingClientRect();
    const scrollers = [...document.querySelectorAll<HTMLElement>("*")]
      .filter((n) => ["auto", "scroll"].includes(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1)
      .map((n) => n.dataset.slot ?? n.tagName.toLowerCase());
    return {
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: el.scrollHeight,
      clientHeight: doc ? innerHeight : el.clientHeight,
      scrollers,
      lastInView: !!end && end.bottom <= box.bottom + 1 && end.top >= box.top - 1,
      headerAtTop: !!header && Math.abs(header.top - box.top) < 1,
    };
  });
}

/** Opens the harness's page, its fonts in, and scrolls its region to the end; the figures before and after. */
async function scrollPage(page: Page, id: (typeof PAGES)[number], panel: boolean, scroll: () => Promise<void>) {
  await page.goto(`${base}/e2e/pages-scroll/index.html?page=${id}${panel ? "&panel=1" : ""}`, { waitUntil: "networkidle" });
  const scope = panel ? page.getByRole("dialog", { name: TITLES[id] }) : page.locator("body");
  await scope.getByRole("heading", { level: 1, name: TITLES[id] }).waitFor({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await pause(400);
  const flow = !panel && FLOWS.has(id);
  // A flow has no region: the document scrolls, and it must hold none.
  if (flow) expect(await page.locator("[data-slot=page-scroll]").count()).toBe(0);
  const region = flow ? page.locator("html") : scope.locator("[data-slot=page-scroll]");
  const before = await measure(region);
  for (let i = 0; i < 20; i++) {
    const m = await measure(region);
    if (m.scrollTop + m.clientHeight >= m.scrollHeight - 1) break;
    await scroll();
  }
  return { before, after: await measure(region) };
}

function expectScrolled(label: string, { before, after }: { before: Measure; after: Measure }, flow = false) {
  const overflow = before.scrollHeight - before.clientHeight;
  console.log(`${label}: content ${before.scrollHeight} px in a ${before.clientHeight} px region, scrolled ${after.scrollTop} of ${overflow} px, last element ${after.lastInView ? "in view" : "NOT in view"}, header ${after.headerAtTop ? "sticky" : "NOT at the top"}, scrollers [${before.scrollers.join(", ")}]`);
  // The content is taller than the screen's region: otherwise the pass proves nothing.
  expect(overflow, `${label}: the content must be taller than its region`).toBeGreaterThan(40);
  // A flow's document scrolls, no element in it; a page's region is the one element that scrolls.
  expect(before.scrollers, `${label}: the region is the one element that scrolls`).toEqual(flow ? [] : ["page-scroll"]);
  expect(after.scrollTop + after.clientHeight).toBeGreaterThanOrEqual(after.scrollHeight - 1);
  expect(after.lastInView, `${label}: the last element is in view at the end`).toBe(true);
  expect(after.headerAtTop, `${label}: the header stays at the top`).toBe(true);
}

describe("at 375 x 812, every page scrolls in the tab frame to its last element (#782)", () => {
  let context: BrowserContext;
  let page: Page;
  let cdp: CDPSession;
  beforeAll(async () => {
    context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });
    page = await context.newPage();
    cdp = await context.newCDPSession(page);
  });
  afterAll(() => context?.close());

  it.each(PAGES)("%s", async (id) => {
    const height = SHORT[id]?.phone ?? 812;
    await page.setViewportSize({ width: 375, height });
    const result = await scrollPage(page, id, false, () => drag(cdp, 187, height - 200, 150));
    expectScrolled(`375 x ${height} ${id}${FLOWS.has(id) ? " (flow, the document)" : ""}`, result, FLOWS.has(id));
    if (shots && (id === "league" || id === "chests")) await page.screenshot({ path: join(shots, `375-${id}.png`) });
  });
});

describe("at 1440 x 900, every side panel scrolls to its page's last element (#782)", () => {
  let context: BrowserContext;
  let page: Page;
  beforeAll(async () => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    page = await context.newPage();
  });
  afterAll(() => context?.close());

  it.each(PAGES)("%s", async (id) => {
    const height = SHORT[id]?.desktop ?? 900;
    await page.setViewportSize({ width: 1440, height });
    const result = await scrollPage(page, id, true, async () => {
      const box = (await page.locator("[data-slot=page-scroll]").boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 600);
      await pause(250);
    });
    expectScrolled(`1440 x ${height} ${id}`, result);
    expect(await page.getByRole("dialog").getByRole("button", { name: "Close" }).count()).toBe(0);
    if (shots && (id === "league" || id === "chests")) await page.screenshot({ path: join(shots, `1440-${id}.png`) });
  });
});

describe("the app's side panel at 1440 x 900: no close button, a click outside or Escape closes it (#782)", () => {
  let context: BrowserContext;
  let page: Page;
  beforeAll(async () => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    // A player past the welcome: a close leads to the home.
    await context.addInitScript(() => localStorage.setItem("welcomed", "1"));
    page = await context.newPage();
  });
  afterAll(() => context?.close());

  const overlay = (name: string) => page.getByRole("navigation", { name: "Village" }).getByRole("button", { name: new RegExp(`^${name}`) });

  // The League control under the profile (#829), the home's way to the League since #856 (no League in the right column).
  const leagueControl = () => page.getByRole("button", { name: /^League: / });

  it("a click on the village closes it, and the focus goes back to the button that opened it", async () => {
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await leagueControl().click({ timeout: 30_000 });
    const dialog = page.getByRole("dialog", { name: "League" });
    await dialog.waitFor();
    expect(await dialog.getByRole("button", { name: "Close" }).count()).toBe(0);
    // Outside the panel: the League's opens on the left since #829 (28 rem wide), so the click lands on the
    // sky right of the board (a click on the board would take the focus once the panel is gone).
    await page.mouse.click(1200, 700);
    await dialog.waitFor({ state: "detached", timeout: 5000 });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect.poll(() => leagueControl().evaluate((el) => el === document.activeElement)).toBe(true);
  });

  it("Escape closes it", async () => {
    await overlay("Vault").click();
    const dialog = page.getByRole("dialog", { name: "Vault" });
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5000 });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect.poll(() => overlay("Vault").evaluate((el) => el === document.activeElement)).toBe(true);
  });
});

/**
 * NO-SCROLLBARS at every width (#835): no page draws a bar at 375 (a phone, the tab frame), 800 (a narrow desktop window, the
 * tab frame, classic bars) and 1440 (the side panel). Playwright's headless Chromium hides every bar by default
 * (`--hide-scrollbars`), which would make the pass prove nothing: this browser is launched without it, so a bar the app let
 * through would be drawn, 15 px wide. Per page and width: the document and every element compute `scrollbar-width: none`, and
 * no scroller (the document included) gives any of its width to a gutter, so the content keeps its width when the page starts
 * or stops scrolling.
 */
describe("at 375, 800 and 1440 px, no page draws a scroll bar (#835)", () => {
  let bars: Browser;
  beforeAll(async () => {
    bars = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  });
  afterAll(() => bars?.close());

  const WIDTHS = [
    { width: 375, height: 812, phone: true },
    { width: 800, height: 900, phone: false },
    { width: 1440, height: 900, phone: false },
  ] as const;

  for (const w of WIDTHS) {
    describe(`${w.width} px`, () => {
      let context: BrowserContext;
      let page: Page;
      beforeAll(async () => {
        context = await bars.newContext({ ...(w.phone ? devices["iPhone 13"] : {}), viewport: { width: w.width, height: w.height }, reducedMotion: "reduce" });
        page = await context.newPage();
      });
      afterAll(() => context?.close());

      it.each(PAGES)("%s", async (id) => {
        const panel = w.width >= 1024;
        // A page of fixed length on its shorter screen (`SHORT`), where it has more than the screen: the phone's below `desktop`
        // (the tab frame, or a flow's document), the panel's from it.
        // At 800 px the mode choice's rows sit wider and fit even 548 px: a 420 px window (a laptop's, its browser docked low).
        const narrow = w.width === 800 && id === "play" ? 420 : undefined;
        await page.setViewportSize({ width: w.width, height: narrow ?? (panel ? SHORT[id]?.desktop : SHORT[id]?.phone) ?? w.height });
        await page.goto(`${base}/e2e/pages-scroll/index.html?page=${id}${panel ? "&panel=1" : ""}`, { waitUntil: "networkidle" });
        const scope = panel ? page.getByRole("dialog", { name: TITLES[id] }) : page.locator("body");
        await scope.getByRole("heading", { level: 1, name: TITLES[id] }).waitFor({ timeout: 20_000 });
        await page.evaluate(() => document.fonts.ready);
        await pause(400);
        const found = await page.evaluate(() => {
          const all = [document.documentElement, ...document.querySelectorAll<HTMLElement>("body, body *")];
          const name = (n: HTMLElement) => n.dataset.slot ?? n.tagName.toLowerCase();
          const styled = all.filter((n) => getComputedStyle(n).scrollbarWidth !== "none").map(name);
          const scrollers = all.filter((n) => n === document.documentElement || ["auto", "scroll"].includes(getComputedStyle(n).overflowY));
          // A gutter is the box's width less its borders and its inner width; the document's is the viewport's less its own.
          const gutters = scrollers
            .map((n) => {
              const s = getComputedStyle(n);
              const gutter = n === document.documentElement ? innerWidth - n.clientWidth : n.offsetWidth - n.clientWidth - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth);
              return { name: name(n), gutter: Math.round(gutter), scrolls: n.scrollHeight > n.clientHeight + 1 };
            })
            .filter((g) => g.gutter !== 0);
          const scrolling = scrollers.filter((n) => n.scrollHeight > n.clientHeight + 1).map(name);
          return { styled, gutters, scrolling };
        });
        console.log(`${w.width} px ${id}: scrolling [${found.scrolling.join(", ")}], elements with a bar style ${found.styled.length}, gutters ${JSON.stringify(found.gutters)}`);
        // The page has something that scrolls (or the pass proves nothing), and none of it draws a bar.
        expect(found.scrolling.length, `${w.width} ${id}: something scrolls`).toBeGreaterThan(0);
        expect(found.styled, `${w.width} ${id}: every element hides its bar`).toEqual([]);
        expect(found.gutters, `${w.width} ${id}: no scroller gives width to a bar`).toEqual([]);
      });
    });
  }
});
