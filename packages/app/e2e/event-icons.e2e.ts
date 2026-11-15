import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";

/**
 * EVENT-ICONS-FIX (#1173): on Play, an icon that breaks out of a Limited card's top edge stays clear of the card above it (and of
 * that card's countdown tab, in its bottom right corner). A real (headless Chromium) browser lays out Play with the four events at
 * once (`PLAY_EVENTS`), against the Vite dev server of this package (or `PAVED_E2E_URL`, a server already up):
 *
 *   bunx playwright-core install chromium-headless-shell   (once)
 *   bun run e2e -- event-icons
 *
 * At 320, 360 and 375 px, at 1x and 2x density: for each Limited card after the first, every image that rises above its top edge has
 * its painted top (its first row of pixels with alpha, read from the image itself) at or below the previous card's bottom edge. The
 * image's box may reach higher, its transparent margin painting nothing. Each prints its line (width, density, card, clearance).
 */

const WIDTHS = [320, 360, 375] as const;
const DENSITIES = [1, 2] as const;
const HEIGHT = 1400;
/** The cards that share `EVENT_ICON` (play-modes.tsx). */
const EVENTS = ["expedition", "masterpiece", "colossus"];
/** A card's outline paints 2 px under its box (its `drop-shadow`). */
const SHADOW = 2;

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

describe("Play's event icons clear the previous card (#1173)", () => {
  for (const width of WIDTHS) {
    for (const density of DENSITIES) {
      it(`${width} x ${HEIGHT} @${density}x`, async () => {
        const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: density, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
        try {
          const page = await context.newPage();
          await page.goto(`${base}/e2e/event-icons/index.html`, { waitUntil: "networkidle" });
          await page.locator('[data-slot="colossus-card"]').waitFor();
          const rows = await page.evaluate(async (shadow) => {
            const section = document.querySelector('section[aria-labelledby="play-limited"]')!;
            const cards = [...section.querySelectorAll<HTMLElement>(":scope > [data-mode]")];
            return Promise.all(
              cards.map(async (card, i) => {
                const top = card.getBoundingClientRect().top;
                const img = [...card.querySelectorAll("img")].find((el) => el.getBoundingClientRect().top < top);
                if (!img) return null;
                await img.decode();
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(img, 0, 0);
                const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const painted = (y: number) => {
                  for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3]! > 8) return true;
                  return false;
                };
                let first = 0;
                while (first < canvas.height && !painted(first)) first++;
                let last = canvas.height - 1;
                while (last > first && !painted(last)) last--;
                const box = img.getBoundingClientRect();
                const scale = box.height / canvas.height;
                const previous = cards[i - 1];
                const rewards = card.querySelector('[role="img"][aria-label^="Rewards"]');
                return {
                  mode: card.dataset.mode!,
                  above: previous?.dataset.mode ?? null,
                  src: img.currentSrc.split("/").slice(-2).join("/"),
                  paintedTop: box.top + first * scale,
                  paintedBottom: box.top + (last + 1) * scale,
                  previousBottom: previous ? previous.getBoundingClientRect().bottom + shadow : null,
                  rewardsTop: rewards ? rewards.getBoundingClientRect().top : null,
                };
              }),
            );
          }, SHADOW);
          const icons = rows.filter((r) => r !== null);
          const gap = (a: number | null, b: number | null) => (a === null || b === null ? "-" : `${(a - b).toFixed(1)} px`);
          for (const r of icons) console.log(`event-icons ${width}px @${density}x ${r.mode} (${r.src}): clear of ${r.above ?? "nothing"} by ${gap(r.paintedTop, r.previousBottom)}, of its rewards by ${gap(r.rewardsTop, r.paintedBottom)}`);
          const events = icons.filter((r) => EVENTS.includes(r.mode));
          expect(events.map((r) => r.mode).sort()).toEqual([...EVENTS].sort());
          for (const r of events) {
            if (r.previousBottom !== null) expect(r.paintedTop, `${r.mode}'s icon under ${r.above}`).toBeGreaterThanOrEqual(r.previousBottom);
            expect(r.paintedBottom, `${r.mode}'s icon over its rewards`).toBeLessThanOrEqual(r.rewardsTop!);
          }
        } finally {
          await context.close();
        }
      });
    }
  }
});
