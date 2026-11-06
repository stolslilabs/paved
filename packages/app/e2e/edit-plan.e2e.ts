import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";

/**
 * EDIT-PLAN (#1033): the plan view of the home's edit mode (no WebGL, or the renderer failed) keeps every tile and every lit cell
 * within reach: its scroll region is the room the editor's bar and panel leave, so each one scrolls out from under them and a tap at
 * its middle lands on it. A real (headless Chromium) browser lays the stage out, against the Vite dev server of this package (or
 * `PAVED_E2E_URL`, a server already up):
 *
 *   bunx playwright-core install chromium-headless-shell   (once)
 *   bun run e2e -- edit-plan
 *
 * At 320, 360 and 375 px (a phone: the bar floating at the top, the sheet at the foot) and 768 px (a tablet: the side menu at the
 * right, half the screen, the bar docked in its head), 720 px high, the growing village with the saved layouts shown (the sheet's
 * tallest), as the review measured it; three cases: the plan alone (its tiles), a road in hand (its lit cells) and the road placed
 * (the still bubble over the panel). Each prints its line (width, case, targets, the plan's room): the pass's list of the PR.
 */

const WIDTHS = [320, 360, 375, 768] as const;
const HEIGHT = 720;
const CASES = ["view", "hand", "pending"] as const;

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

interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The plan's room, the bar's and the panel's boxes, and the plan's targets (each cell a tap acts on). */
function layout(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element | null | undefined) => {
      const r = e?.getBoundingClientRect();
      return r ? { top: r.top, right: r.right, bottom: r.bottom, left: r.left } : null;
    };
    const plan = document.querySelector("[data-plan-room]");
    return {
      room: box(plan)!,
      bar: box(document.querySelector("[data-edit-bar] header"))!,
      panel: box(document.querySelector("[data-edit-panel] > div"))!,
      side: document.querySelector("[data-edit-panel]")?.getAttribute("data-edit-panel") === "side",
      still: box(document.querySelector('[data-edit-panel] [role=toolbar][aria-label="Tile"]')),
      points: box(document.querySelector("[data-edit-points]")),
      targets: [...document.querySelectorAll<HTMLElement>("[data-plan-room] [data-cell]")]
        .filter((e) => ["tile", "starter", "plate", "pending"].includes(e.dataset.kind ?? ""))
        .map((e) => ({ cell: e.dataset.cell!, kind: e.dataset.kind! })),
    };
  });
}

/**
 * Scrolls the plan as a finger would to bring the target to the middle of the room the overlays leave (right of the points' column),
 * then what a tap at its middle hits: the cell under the point, and the point.
 */
function tapAt(page: Page, cell: string) {
  return page.evaluate((key) => {
    const el = document.querySelector<HTMLElement>(`[data-plan-room] [data-cell="${key}"]`)!;
    const plan = document.querySelector("[data-plan-room]")!;
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && plan.contains(scroller) && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
    const room = plan.getBoundingClientRect();
    const points = document.querySelector("[data-edit-points]")?.getBoundingClientRect();
    const left = Math.max(room.left, points?.right ?? room.left);
    const before = el.getBoundingClientRect();
    scroller?.scrollBy({ left: before.left + before.width / 2 - (left + room.right) / 2, top: before.top + before.height / 2 - (room.top + room.bottom) / 2, behavior: "instant" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return { x, y, hit: hit?.dataset.cell ?? null, inPlan: !!hit?.closest("[data-plan-room]") };
  }, cell);
}

const inside = (p: { x: number; y: number }, b: Box) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;

describe("the plan view keeps every tile and lit cell within reach of a tap (#1033)", () => {
  for (const width of WIDTHS) {
    for (const shown of CASES) {
      it(`${width} x ${HEIGHT}, ${shown}`, async () => {
        const context = await browser.newContext({ viewport: { width, height: HEIGHT }, hasTouch: width < 640, isMobile: width < 640, reducedMotion: "reduce" });
        try {
          const page = await context.newPage();
          await page.goto(`${base}/e2e/edit-plan/index.html?case=${shown}`, { waitUntil: "networkidle" });
          await page.getByRole("complementary", { name: "Editor" }).waitFor();
          // The room follows the panel as it settles (its own chunk, then a measure after 150 ms).
          await page.waitForFunction(() => {
            const plan = document.querySelector<HTMLElement>("[data-plan-room]");
            const panel = document.querySelector("[data-edit-panel] > div")?.getBoundingClientRect();
            if (!plan || !panel) return false;
            const room = plan.getBoundingClientRect();
            return room.bottom <= panel.top + 1 || room.right <= panel.left + 1;
          });
          if (shown === "pending") await page.getByRole("toolbar", { name: "Tile" }).waitFor();
          await page.waitForTimeout(300);
          const { room, bar, panel, side, still, points, targets } = await layout(page);
          // The room is clear of the bar and the panel (and of the still bubble), on its own side of each.
          expect(side).toBe(width >= 640);
          if (side) expect(room.right).toBeLessThanOrEqual(panel.left + 1);
          else {
            expect(room.top).toBeGreaterThanOrEqual(bar.bottom - 1);
            expect(room.bottom).toBeLessThanOrEqual(panel.top + 1);
          }
          // The still bubble over a phone's sheet, at the side menu's top from `tablet`: never over the bar's buttons nor the plan.
          if (still && !side) expect(room.bottom).toBeLessThanOrEqual(still.top + 1);
          if (still && side) expect(still.left).toBeGreaterThanOrEqual(room.right - 1);
          if (still) expect(still.top >= bar.bottom - 1 || still.bottom <= bar.top + 1 || still.right <= bar.left + 1 || still.left >= bar.right - 1).toBe(true);
          expect(targets.length).toBeGreaterThan(shown === "view" ? 20 : 21);
          if (shown !== "view") expect(targets.some((t) => t.kind === (shown === "hand" ? "plate" : "pending"))).toBe(true);
          const missed: string[] = [];
          for (const t of targets) {
            const tap = await tapAt(page, t.cell);
            const covered = [bar, panel, still, points].some((b) => b && inside(tap, b));
            if (tap.hit !== t.cell || !tap.inPlan || covered) missed.push(`${t.kind} ${t.cell} (hit ${tap.hit ?? "nothing"} at ${Math.round(tap.x)},${Math.round(tap.y)})`);
          }
          console.log(
            `edit-plan ${width}x${HEIGHT} ${shown}: ${targets.length - missed.length}/${targets.length} targets tapped; room ${Math.round(room.top)}-${Math.round(room.bottom)} x ${Math.round(room.left)}-${Math.round(room.right)}, ${side ? `side menu from x=${Math.round(panel.left)}` : `bar to y=${Math.round(bar.bottom)}, sheet from y=${Math.round(panel.top)}`}, points to x=${Math.round(points?.right ?? 0)}${still ? `, still bubble from y=${Math.round(still.top)}` : ""}`,
          );
          expect(missed).toEqual([]);
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});
