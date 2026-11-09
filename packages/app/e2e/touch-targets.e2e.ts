import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";

/**
 * PUZZLE-FIXES (#1137): Play's Resume and the Inbox's Claim all keep the 44 px touch floor, their 36 px pill inside, as the request's
 * answers and the mail's bin do. A real (headless Chromium) browser lays them out, against the Vite dev server of this package (or
 * `PAVED_E2E_URL`, a server already up):
 *
 *   bunx playwright-core install chromium-headless-shell   (once)
 *   bun run e2e -- touch-targets
 *
 * At 320, 360 and 375 px (a phone, touch): each button's box is at least 44 px tall and wide, its pill 36 px tall within it, and a
 * tap 3 px above and below the pill lands on the button. Each prints its line (width, button, sizes): the pass's list of the PR.
 */

const WIDTHS = [320, 360, 375] as const;
const HEIGHT = 812;
const TARGETS = [/^Resume Challenge #\d+$/, /^Claim all$/] as const;
const FLOOR = 44;

let base = process.env.PAVED_E2E_URL ?? "";
let vite: ViteDevServer | undefined;
let browser: Browser;

beforeAll(async () => {
  if (!base) {
    vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
    await vite.listen();
    const addr = vite.httpServer?.address();
    base = addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : "";
  }
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await vite?.close();
});

describe("Resume and Claim all keep the 44 px touch floor (#1137)", () => {
  for (const width of WIDTHS) {
    it(`${width} x ${HEIGHT}`, async () => {
      const context = await browser.newContext({ viewport: { width, height: HEIGHT }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        await page.goto(`${base}/e2e/touch-targets/index.html`, { waitUntil: "networkidle" });
        for (const name of TARGETS) {
          const button = page.getByRole("button", { name });
          await button.waitFor();
          const measure = await button.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const pill = el.querySelector("span")!.getBoundingClientRect();
            const x = pill.left + pill.width / 2;
            const hits = [pill.top - 3, pill.bottom + 3].map((y) => document.elementFromPoint(x, y)?.closest("button") === el);
            return { width: box.width, height: box.height, pill: pill.height, inside: pill.top >= box.top && pill.bottom <= box.bottom, hits };
          });
          console.log(`touch-targets ${width}px ${name.source}: target ${Math.round(measure.width)} x ${Math.round(measure.height)} px, pill ${Math.round(measure.pill)} px tall, taps beside the pill ${measure.hits.every(Boolean) ? "on it" : "missed"}`);
          expect(measure.height).toBeGreaterThanOrEqual(FLOOR);
          expect(measure.width).toBeGreaterThanOrEqual(FLOOR);
          expect(measure.pill).toBe(36);
          expect(measure.inside).toBe(true);
          expect(measure.hits).toEqual([true, true]);
        }
      } finally {
        await context.close();
      }
    });
  }
});
