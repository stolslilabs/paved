import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";

/**
 * CHAT-DRAWER-KEYBOARD (#1025, the Codex review of #1024): with a phone's keyboard open, the chat drawer's composer stays above it.
 * A real (headless Chromium) browser lays the drawer out (`chat-keyboard/harness.tsx`: `ChatScene` with the World's or the guild's
 * conversation), against the Vite dev server of this package (or `PAVED_E2E_URL`, a server already up):
 *
 *   bunx playwright-core install chromium-headless-shell   (once)
 *   bun run e2e -- chat-keyboard
 *
 * Headless Chromium has no on-screen keyboard: the page's `visualViewport` is replaced by one whose height the test sets, as a
 * phone's keyboard does (its `resize` handler called), while the layout viewport keeps its 700 px. The review's figures: at 320,
 * 360 and 375 px, a 700 px layout viewport, `visualViewport.height` 360 px, the World's field ended at y=446 and the guild's at
 * y=522, under the visible foot. Per width and tab: the field's foot is at most the visible foot, the composer whole, the messages
 * still a scroller of their own (their last one reachable); the keyboard closed, the conversation keeps its 20rem minimum again.
 * Each check prints its line (tab, width, figures): the pass's list of the PR.
 */

const LAYOUT_H = 700;
const KEYBOARD_VV_H = 360;
const WIDTHS = [320, 360, 375] as const;
const TABS = ["world", "guild"] as const;
/** Each check's ceiling: a load and three layouts take seconds; a stall fails here, not at the job's 15 minutes. */
const TEST_MS = 90_000;

let vite: ViteDevServer | null = null;
let base = process.env.PAVED_E2E_URL ?? "";
let browser: Browser;

beforeAll(async () => {
  if (!base) {
    vite = await createServer({
      root: fileURLToPath(new URL("..", import.meta.url)),
      logLevel: "error",
      server: { port: 0, host: "127.0.0.1" },
      // The scan from the harness's page only, as Training's (`training.e2e.ts`): crawling `scripts/` fails on a render page's bare
      // `three`, and Vite then skips the pre-bundling.
      optimizeDeps: { entries: ["e2e/chat-keyboard/index.html"] },
    });
    await vite.listen();
    const addr = vite.httpServer?.address();
    base = addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : "";
  }
  browser = await chromium.launch({ headless: true });
  if (vite) {
    // A dev server on a cold cache (CI, or after the other e2e files' servers) finds dependencies at run time and reloads the page
    // each time: that destroyed the first test's page right after its load ("Execution context was destroyed", #1044). Each tab is
    // loaded once to its field first, so the reloads land here and the tests find every dependency served.
    const page = await browser.newPage();
    for (const tab of TABS) {
      // A reload may interrupt the load itself: the field, which a reload does not lose track of, says when the page is up.
      await page.goto(`${base}/e2e/chat-keyboard/index.html?tab=${tab}`, { waitUntil: "load", timeout: TEST_MS }).catch(() => undefined);
      await page.locator("[data-slot=chat-conversation] form input").waitFor({ timeout: TEST_MS });
    }
    await page.waitForLoadState("networkidle");
    await page.close();
  }
}, 3 * TEST_MS);

afterAll(async () => {
  await browser?.close();
  await vite?.close();
});

/** Before the page's scripts: a `visualViewport` whose height `__keyboard(h)` sets (null: the layout viewport's), its handler called. */
function fakeVisualViewport() {
  let height: number | null = null;
  const fake = {
    get width() {
      return innerWidth;
    },
    get height() {
      return height ?? innerHeight;
    },
    offsetTop: 0,
    offsetLeft: 0,
    pageTop: 0,
    pageLeft: 0,
    scale: 1,
    onresize: null as null | (() => void),
    onscroll: null,
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
  (window as unknown as { __keyboard: (h: number | null) => void }).__keyboard = (h) => {
    height = h;
    fake.onresize?.();
  };
}

interface Figures {
  /** The field's foot (px from the layout viewport's top). */
  fieldBottom: number;
  /** The composer's form's top and foot. */
  formTop: number;
  formBottom: number;
  /** The conversation's box. */
  boxTop: number;
  boxHeight: number;
  /** The messages' scroller. */
  logHeight: number;
  logScrolls: boolean;
  /** The last message within the messages' box once scrolled to the end. */
  lastReached: boolean;
}

function figures(page: Page): Promise<Figures> {
  return page.evaluate(() => {
    const field = document.querySelector<HTMLInputElement>("[data-slot=chat-conversation] form input")!.getBoundingClientRect();
    const form = document.querySelector("[data-slot=chat-conversation] form")!.getBoundingClientRect();
    const box = document.querySelector("[data-slot=chat-conversation]")!.getBoundingClientRect();
    const log = document.querySelector<HTMLElement>("[data-slot=chat-conversation] [role=log]")!;
    log.scrollTop = log.scrollHeight;
    const logBox = log.getBoundingClientRect();
    const rows = log.querySelectorAll("li");
    const last = rows[rows.length - 1]?.getBoundingClientRect();
    return {
      fieldBottom: Math.round(field.bottom),
      formTop: Math.round(form.top),
      formBottom: Math.round(form.bottom),
      boxTop: Math.round(box.top),
      boxHeight: Math.round(box.height),
      logHeight: Math.round(logBox.height),
      logScrolls: log.scrollHeight > log.clientHeight + 1,
      lastReached: !!last && last.bottom <= logBox.bottom + 1,
    };
  });
}

const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

describe("the chat drawer with a phone's keyboard open (#1025)", () => {
  for (const width of WIDTHS)
    describe(`${width} x ${LAYOUT_H}`, () => {
      let context: BrowserContext;
      beforeAll(async () => {
        context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width, height: LAYOUT_H }, reducedMotion: "reduce" });
        await context.addInitScript(fakeVisualViewport);
      });
      afterAll(() => context?.close());

      for (const tab of TABS)
        it(`keeps the ${tab}'s composer above the keyboard, the messages scrolling`, async () => {
          const page = await context.newPage();
          await page.goto(`${base}/e2e/chat-keyboard/index.html?tab=${tab}`, { waitUntil: "load", timeout: TEST_MS });
          await page.evaluate(() => document.fonts.ready);
          const field = page.locator("[data-slot=chat-conversation] form input");
          await field.waitFor({ timeout: TEST_MS });
          const open = await figures(page);
          await field.focus();
          await page.evaluate((h) => (window as unknown as { __keyboard: (h: number) => void }).__keyboard(h), KEYBOARD_VV_H);
          await settle(page);
          const typing = await figures(page);
          await page.evaluate(() => (window as unknown as { __keyboard: (h: null) => void }).__keyboard(null));
          await settle(page);
          const closed = await figures(page);
          console.log(
            `${tab} ${width}px: keyboard closed field foot ${open.fieldBottom}, box ${open.boxHeight}; open (visible foot ${KEYBOARD_VV_H}) field foot ${typing.fieldBottom}, box ${typing.boxTop}+${typing.boxHeight}, messages ${typing.logHeight} px scrolling ${typing.logScrolls}; closed again box ${closed.boxHeight}`,
          );
          // The control: without the keyboard the field is under the visible foot the keyboard leaves, so the pass proves something.
          expect(open.fieldBottom).toBeGreaterThan(KEYBOARD_VV_H);
          expect(typing.fieldBottom).toBeLessThanOrEqual(KEYBOARD_VV_H);
          expect(typing.formTop).toBeGreaterThanOrEqual(typing.boxTop);
          expect(typing.logHeight).toBeGreaterThan(0);
          expect(typing.logScrolls).toBe(true);
          expect(typing.lastReached).toBe(true);
          expect(await field.evaluate((el) => el === document.activeElement)).toBe(true);
          // The keyboard closed: the conversation has its height and its 20rem (320 px) minimum back.
          expect(closed.boxHeight).toBeGreaterThanOrEqual(320);
          expect(closed.fieldBottom).toBe(open.fieldBottom);
          await page.close();
        }, TEST_MS);
    });
});
