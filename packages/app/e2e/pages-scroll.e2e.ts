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
 *   bun run e2e -- pages-scroll   [PAVED_E2E_SHOTS=<folder>: the League at 375 px, scrolled to its end]
 *
 * - Each page's scene, with content taller than the screen (`pages-scroll/harness.tsx`: a long defence
 *   log, ...), at 375 x 812 in the tab frame (a phone: touch, dragged by a finger) and at 1440 x 900 in the home's side panel
 *   (the wheel); a page of fixed length on a shorter screen of the same width (`SHORT`). Per page and width: its
 *   content is taller than its region, the region is the one element that scrolls, it reaches the page's last element, and
 *   the header stays at the region's top. A page whose content fits fails: the pass would prove nothing.
 * - Missions, the League, the Shop, Tiles, Settings (its Themes and Credits), Play and the Vault are the HUD's drawer at every width
 *   (MISSIONS-PAGE, LEAGUE-PAGE, SHOP-PAGE, COLLECTION-PAGE, SETTINGS-PAGE, PLAY-PAGE, VAULT-PAGE, `DRAWERS`): its body is its region, under the
 *   drawer's band, which stays put; from `tablet` its side panel has its close, by design. No full-screen flow is left (Play was
 *   the last).
 * - The app on the mock, at 1440 x 900: the panel has no close button; a click on the village outside it closes it and gives
 *   the focus back to the overlay's button that opened it; Escape closes it.
 *
 * Chromium's touch emulation is not iOS Safari: a real phone (or the Mac's iOS simulator) stays the check of iOS. Each check
 * prints its line (page, width, figures): the pass's list of the PR.
 */

const PAGES = ["shop", "league", "settings", "missions", "vault", "defence", "themes", "tiles", "referral", "credits", "play"] as const;
const TITLES: Record<(typeof PAGES)[number], string> = {
  shop: "Forest",
  league: "League",
  settings: "Settings",
  missions: "Missions",
  vault: "Vault",
  defence: "League",
  themes: "Themes",
  tiles: "Tiles",
  referral: "Referral",
  credits: "Credits",
  play: "Play",
};

/** The HUD's drawers (MISSIONS-PAGE): a dialog at every width, its title in its band, its body the region that scrolls. */
const DRAWERS: ReadonlySet<(typeof PAGES)[number]> = new Set(["league", "missions", "defence", "shop", "tiles", "settings", "themes", "credits", "play", "vault"]);
/** Where a page's title is: a drawer's in its band (a dialog's title), a page's in its header's `h1`. */
const titled = (scope: Locator, id: (typeof PAGES)[number]) =>
  DRAWERS.has(id) ? scope.locator('[data-slot="hud-drawer-title"]', { hasText: TITLES[id] }) : scope.getByRole("heading", { level: 1, name: TITLES[id] });
/** A page's scope: the dialog of its side panel or its drawer, else the document. */
const scopeOf = (page: Page, id: (typeof PAGES)[number], panel: boolean) => (panel || DRAWERS.has(id) ? page.getByRole("dialog", { name: TITLES[id] }) : page.locator("body"));
/** The region that scrolls: a drawer's body, a page's frame or panel body. */
const REGION = (id: (typeof PAGES)[number]) => (DRAWERS.has(id) ? "[data-hud-drawer-body]" : "[data-slot=page-scroll]");

/**
 * The pages whose content has a fixed length (no list to grow: the league as it opens, the referral's link and earnings), shorter
 * than a 1440 x 900 panel (and, the referral, than a 375 x 812 phone): they are measured on a shorter screen of the same width,
 * an iPhone SE's 667 px, a 720 px laptop (the referral's panel: 667 px), where that content is taller than the region.
 */
const SHORT: Partial<Record<(typeof PAGES)[number], { phone: number; desktop: number }>> = {
  // The league as it opens (LEAGUE-PAGE): its carousel, its season and the latest battle logs (eight rows), about a phone's
  // height: an iPhone SE's 667 px, a 720 px laptop.
  league: { phone: 667, desktop: 720 },
  referral: { phone: 667, desktop: 667 },
  // Play's four groups (PLAY-PAGE), of fixed length too (669 px of content, about the drawer's body on a 375 x 812 phone): an
  // iPhone SE's view under Safari's bars (548 px), a 560 px browser window.
  play: { phone: 548, desktop: 560 },
  // The Vault's three tabs (VAULT-PAGE), each shorter than the drawer's body on a 375 x 812 phone since the Position left the forms
  // (its tallest, the Position at the largest figures, about 500 px): the same screens as Play.
  vault: { phone: 548, desktop: 560 },
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

let vite: ViteDevServer | null = null;
let base = process.env.PAVED_E2E_URL ?? "";
let browser: Browser;
const shots = process.env.PAVED_E2E_SHOTS ?? "";

beforeAll(async () => {
  if (!base) {
    // The mock: its writes go to the device's ledger only. The connector needs no env (the device's local key, #918).
    process.env.VITE_DATA_SOURCE ??= "mock";
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
    const box = el.getBoundingClientRect();
    const header = el.querySelector("[data-slot=page-header]")?.getBoundingClientRect();
    // A drawer's band sits right above its body, out of it: it stays at the body's top.
    const band = el.closest("[data-hud-drawer]")?.querySelector("[data-slot=sheet-header]")?.getBoundingClientRect();
    let last: Element | null = el.querySelector("main") ?? (band ? el : null);
    // The last element shown: an inactive tab's panel (Radix keeps it, empty and `hidden`: the Vault's footer tabs) is skipped.
    const shownLast = (n: Element) => {
      let child = n.lastElementChild;
      while (child && (child as HTMLElement).hidden) child = child.previousElementSibling;
      return child;
    };
    for (let next = last && shownLast(last); next; next = shownLast(next)) last = next;
    const end = last?.getBoundingClientRect();
    const scrollers = [...document.querySelectorAll<HTMLElement>("*")]
      .filter((n) => ["auto", "scroll"].includes(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1)
      .map((n) => n.dataset.slot ?? n.tagName.toLowerCase());
    return {
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollers,
      lastInView: !!end && end.bottom <= box.bottom + 1 && end.top >= box.top - 1,
      headerAtTop: header ? Math.abs(header.top - box.top) < 1 : !!band && Math.abs(band.bottom - box.top) < 1,
    };
  });
}

/** Opens the harness's page, its fonts in, and scrolls its region to the end; the figures before and after. */
async function scrollPage(page: Page, id: (typeof PAGES)[number], panel: boolean, scroll: () => Promise<void>) {
  await page.goto(`${base}/e2e/pages-scroll/index.html?page=${id}${panel ? "&panel=1" : ""}`, { waitUntil: "networkidle" });
  const scope = scopeOf(page, id, panel);
  await titled(scope, id).waitFor({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await pause(400);
  const region = scope.locator(REGION(id));
  const before = await measure(region);
  for (let i = 0; i < 20; i++) {
    const m = await measure(region);
    if (m.scrollTop + m.clientHeight >= m.scrollHeight - 1) break;
    await scroll();
  }
  return { before, after: await measure(region) };
}

function expectScrolled(label: string, { before, after }: { before: Measure; after: Measure }, drawer = false) {
  const overflow = before.scrollHeight - before.clientHeight;
  console.log(`${label}: content ${before.scrollHeight} px in a ${before.clientHeight} px region, scrolled ${after.scrollTop} of ${overflow} px, last element ${after.lastInView ? "in view" : "NOT in view"}, header ${after.headerAtTop ? "sticky" : "NOT at the top"}, scrollers [${before.scrollers.join(", ")}]`);
  // The content is taller than the screen's region: otherwise the pass proves nothing.
  expect(overflow, `${label}: the content must be taller than its region`).toBeGreaterThan(40);
  // A page's region is the one element that scrolls.
  expect(before.scrollers, `${label}: the region is the one element that scrolls`).toEqual([drawer ? "scroll-region" : "page-scroll"]);
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
    expectScrolled(`375 x ${height} ${id}${DRAWERS.has(id) ? " (the HUD's drawer)" : ""}`, result, DRAWERS.has(id));
    if (shots && id === "league") await page.screenshot({ path: join(shots, `375-${id}.png`) });
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
      const box = (await page.locator(REGION(id)).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 600);
      await pause(250);
    });
    expectScrolled(`1440 x ${height} ${id}${DRAWERS.has(id) ? " (the HUD's drawer)" : ""}`, result, DRAWERS.has(id));
    // The page panel has no close; the HUD's drawer has its own, by design (MISSIONS-PAGE).
    if (!DRAWERS.has(id)) expect(await page.getByRole("dialog").getByRole("button", { name: "Close" }).count()).toBe(0);
    if (shots && id === "league") await page.screenshot({ path: join(shots, `1440-${id}.png`) });
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
    // The HUD's drawer (LEAGUE-PAGE): its close the red cross; a click outside closes it too.
    expect(await dialog.getByRole("button", { name: "Close" }).count()).toBe(1);
    // Outside the drawer: the League's docks at the left since #829 (28 rem wide), so the click lands on the
    // sky right of the board (a click on the board would take the focus once the drawer is gone).
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
        // (the tab frame), the panel's from it.
        await page.setViewportSize({ width: w.width, height: (panel ? SHORT[id]?.desktop : SHORT[id]?.phone) ?? w.height });
        await page.goto(`${base}/e2e/pages-scroll/index.html?page=${id}${panel ? "&panel=1" : ""}`, { waitUntil: "networkidle" });
        await titled(scopeOf(page, id, panel), id).waitFor({ timeout: 20_000 });
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
