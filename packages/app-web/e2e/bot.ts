import type { Page } from "playwright-core";
import { CategoryType, OrientationType, type EngineGame } from "@paved/game-core";
import { CENTER } from "../src/utils/game-helpers";
import { TRAINING_KEY, replayTraining as replay, type SavedGame } from "@paved/game-core";

/** The window of the test: small, because the software GL of a headless VPS draws every frame on the CPU. */
export const VIEWPORT = { width: 1024, height: 640 };

export const ORIENTATIONS = Object.values(OrientationType);

/** A small deterministic generator (mulberry32), so that a failing game replays from its number. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Ui {
  score: number;
  built: number;
  discarded: number;
  closures: string[];
  /** The "Game complete" dialog, with its final score text when shown. */
  complete: { finalScore: string } | null;
  alert: string | null;
}

/** The label of the text that follows `label` in the status panel ("Score" then its value). */
async function after(page: Page, label: string): Promise<string> {
  return page.getByText(label, { exact: true }).first().locator("xpath=following-sibling::*[1]").innerText({ timeout: 5000 });
}

export async function readUi(page: Page): Promise<Ui> {
  const [score, built, discarded, closures, dialog, alert] = await Promise.all([
    after(page, "Score"),
    after(page, "Built"),
    after(page, "Discarded"),
    page.locator('[data-testid="closures"] span').allInnerTexts(),
    page.getByRole("dialog", { name: "Game complete" }).count(),
    page.getByRole("alert").allInnerTexts(),
  ]);
  return {
    score: Number(score.replace(/[^\d]/g, "")),
    built: Number(built.split("/")[0]),
    discarded: Number(discarded),
    closures,
    complete: dialog ? { finalScore: await page.getByTestId("final-score").innerText() } : null,
    alert: alert[0] ?? null,
  };
}

export async function readSave(page: Page): Promise<SavedGame | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), TRAINING_KEY);
  return raw ? (JSON.parse(raw) as SavedGame) : null;
}

/** The engine's own replay of what the browser saved: the oracle of every check. */
export function replaySave(save: SavedGame): EngineGame {
  return replay(BigInt(save.seed), save.moves);
}

/** The line the page prints for a structure the engine says a move closed. */
export function closureText(c: { category: CategoryType; size: number; points: number }): string {
  return `${c.category} closed: size ${c.size}, ${c.points > 0 ? "+" : ""}${c.points} points`;
}

export const confirmDisabled = (page: Page): Promise<boolean> =>
  page
    .getByText("Confirm", { exact: true })
    .first()
    .evaluate((el) => {
      const b = el.closest("[tag=button]") ?? el;
      return b.getAttribute("aria-disabled") === "true" || b.hasAttribute("disabled");
    });

export async function openTraining(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/game?mode=training`, { waitUntil: "domcontentloaded" });
  await ready(page);
}

export async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__PAVED_E2E__?.ready, null, { timeout: 120_000 });
}

/** Rotates until the page shows `orientation` (1..4, the chain's codes); returns the presses. */
export async function rotateTo(page: Page, orientation: number): Promise<number> {
  let presses = 0;
  while ((await page.evaluate(() => (window as any).__PAVED_E2E__.view.orientation)) !== orientation) {
    await page.keyboard.press("r");
    presses += 1;
    if (presses > 4) throw new Error(`orientation ${orientation} not reachable`);
    await page.waitForTimeout(0);
  }
  return presses;
}

export async function shownSlots(page: Page): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate(() => (window as any).__PAVED_E2E__.view.slots);
}

/** Clearance kept around a panel, so that its edge and shadow are not clicked either. */
const PANEL_MARGIN = 8;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The boxes of the overlay panels the page draws over the board (status, camera buttons, action bar, notice, dialogs), read
 * from the page: the children of the click-through grid layer that take pointer events, and the alert. Nothing is fixed.
 */
export async function panelRects(page: Page): Promise<Rect[]> {
  return page.evaluate(() => {
    const boxes: DOMRect[] = [];
    for (const layer of document.querySelectorAll("div")) {
      const style = getComputedStyle(layer);
      if (style.pointerEvents !== "none" || style.display !== "grid") continue;
      for (const child of Array.from(layer.children)) if (getComputedStyle(child).pointerEvents !== "none") boxes.push(child.getBoundingClientRect());
    }
    for (const el of document.querySelectorAll('[role="alert"], [role="dialog"]')) boxes.push(el.getBoundingClientRect());
    return boxes.filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
  });
}

const insideRect = (p: { x: number; y: number }, r: Rect, margin = PANEL_MARGIN): boolean =>
  p.x >= r.x - margin && p.x <= r.x + r.width + margin && p.y >= r.y - margin && p.y <= r.y + r.height + margin;

/** True when the topmost element at (x, y) is the board's canvas: what a real click on the board reaches. */
export async function hitsBoard(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName === "CANVAS", [x, y]);
}

/** Page coordinates of a cell; recentres the camera, then zooms out, when the cell is off screen or under a panel. */
export async function cellPoint(page: Page, x: number, z: number): Promise<{ x: number; y: number }> {
  const { width, height } = VIEWPORT;
  let covered: string | null = null;
  for (let attempt = 0; attempt < 14; attempt++) {
    covered = null;
    const p = await page.evaluate(([cx, cz]) => (window as any).__PAVED_E2E__.target(cx, cz), [x, z]);
    const panels = p ? await panelRects(page) : [];
    const underPanel = p && panels.some((r) => insideRect(p, r));
    if (p && !underPanel && p.x > 20 && p.x < width - 20 && p.y > 20 && p.y < height - 20) {
      // The camera glides after a move or a zoom: click only once the cell stops moving.
      await page.waitForTimeout(120);
      const again = await page.evaluate(([cx, cz]) => (window as any).__PAVED_E2E__.target(cx, cz), [x, z]);
      // Whatever the panel boxes say, the click must land on the canvas.
      if (!again || Math.abs(again.x - p.x) >= 0.5 || Math.abs(again.y - p.y) >= 0.5) continue;
      if (await hitsBoard(page, again.x, again.y)) return again;
      // Something other than the canvas sits there: recentre or zoom below, as for a cell under a panel.
      covered = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return el ? `${el.tagName.toLowerCase()}${el.getAttribute("role") ? ` role=${el.getAttribute("role")}` : ""}` : "nothing";
      }, [again.x, again.y]);
    }
    if (attempt === 0 || attempt === 1) await page.keyboard.press("f");
    else {
      await page.mouse.move(width / 2, height / 2);
      await page.mouse.wheel(0, 300);
    }
    await page.waitForTimeout(350);
  }
  throw new Error(covered ? `cell ${x},${z} covered by ${covered}` : `cell ${x},${z} stays off screen`);
}

/**
 * Parks the pointer over a panel, off the board, and waits out the renderer's hover throttle (50 ms). The page enables
 * Confirm for the cell under the pointer (the ghost tile) as well as for a clicked one, and the camera moves of `cellPoint`
 * leave the pointer over the board centre: with the board centred on a cell that fits the tile, Confirm is on before any click.
 */
export async function parkPointer(page: Page): Promise<void> {
  const [panel] = (await panelRects(page)).sort((a, b) => b.width * b.height - a.width * a.height);
  const at = panel ? { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 } : { x: 2, y: 2 };
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(150);
}

export interface MoveReport {
  kind: "place" | "discard" | "surrender";
  /** From the click on Confirm / Discard to the page showing the new state, milliseconds. */
  ms: number;
}

/** The engine cell of a page slot: the page's world cell (x, z) is the engine's (x, -z). */
export const slotToEngine = (s: { x: number; y: number }) => ({ x: s.x, y: -s.y });

export { CENTER };
