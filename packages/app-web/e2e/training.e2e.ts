import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import { TRAINING_KEY, type SavedMove } from "../src/training/storage";
import {
  ORIENTATIONS,
  cellPoint,
  closureText,
  confirmDisabled,
  openTraining,
  panelRects,
  readSave,
  readUi,
  ready,
  replaySave,
  rng,
  rotateTo,
  shownSlots,
  slotToEngine,
  VIEWPORT,
  type MoveReport,
} from "./bot";
import type { EngineGame } from "@paved/game-core";

/**
 * The battle test of Training (T2, D-27): complete games played in a real (headless) browser by a bot, against the Vite
 * dev server with no chain configured (or `PAVED_E2E_URL`, a server already up). Every move is checked against the engine's
 * replay of what the browser saved. `PAVED_E2E_GAMES` sets the number of full games of the first test (default 2: the length that passes in one run on a loaded VPS).
 */
const GAMES = Number(process.env.PAVED_E2E_GAMES ?? 2);
/** A seed (hex felt, `0x…`) for the first game of the first test, to replay a failing game: the log prints every seed in full. */
const FIRST_SEED = process.env.PAVED_E2E_SEED;
if (FIRST_SEED !== undefined && !/^0x[0-9a-f]{1,64}$/.test(FIRST_SEED)) throw new Error("PAVED_E2E_SEED must be a lowercase hex felt, 0x…");
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

let server: ViteDevServer | null = null;
let browser: Browser;
let base = process.env.PAVED_E2E_URL ?? "";
const moveTimes: MoveReport[] = [];

beforeAll(async () => {
  if (!base) {
    server = await createServer({
      root: fileURLToPath(new URL("..", import.meta.url)),
      logLevel: "error",
      server: { port: 0, host: "127.0.0.1", strictPort: false },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("no dev server address");
    base = `http://127.0.0.1:${address.port}`;
  }
  browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  const times = (kind: MoveReport["kind"]) => moveTimes.filter((m) => m.kind === kind).map((m) => m.ms).sort((a, b) => a - b);
  for (const kind of ["place", "discard"] as const) {
    const t = times(kind);
    if (t.length === 0) continue;
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    console.log(`[e2e] ${kind}: ${t.length} moves, mean ${mean.toFixed(0)} ms, p95 ${t[Math.floor(t.length * 0.95)]} ms, max ${t[t.length - 1]} ms (click to the page showing the move)`);
  }
});

async function freshPage(options: { viewport?: { width: number; height: number }; init?: () => void } = {}): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext({ viewport: options.viewport ?? VIEWPORT });
  await context.addInitScript(() => {
    (window as any).__PAVED_E2E__ = {};
  });
  if (options.init) await context.addInitScript(options.init);
  context.setDefaultNavigationTimeout(120_000);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}

const sorted = (cells: Array<{ x: number; y: number }>) => cells.map((c) => `${c.x},${c.y}`).sort();

/** The page shows what the engine says: score, tiles, discards, and the save replays to the same state. */
async function expectMirror(page: Page, model: EngineGame, where: string, move?: SavedMove): Promise<void> {
  await page.waitForFunction(
    ([built, discarded]) => document.body.innerText.includes(`${built}/38`) && /Discarded\s*\n?\s*(\d+)/.exec(document.body.innerText)?.[1] === String(discarded),
    [model.built, model.discarded] as [number, number],
    { timeout: 30_000 },
  );
  const ui = await readUi(page);
  expect(ui.score, `${where}: score`).toBe(model.score);
  expect(ui.built, `${where}: built`).toBe(model.built);
  expect(ui.discarded, `${where}: discarded`).toBe(model.discarded);
  // The game-over dialog is up only when the engine says the game is over (it may lag behind the last move, never lead it).
  if (!model.over) expect(ui.complete, `${where}: no game-over dialog while the game goes on`).toBeNull();
  const save = await readSave(page);
  expect(save, `${where}: saved`).not.toBeNull();
  // What the page saved is the move the bot made: a click on another cell cannot pass silently.
  if (move) expect(save!.moves.at(-1), `${where}: the saved move`).toEqual(move);
  const replayed = replaySave(save!);
  expect(replayed.score, `${where}: engine replay of the save`).toBe(ui.score);
  expect(replayed.built).toBe(model.built);
  expect(replayed.discarded).toBe(model.discarded);
  expect(replayed.over).toBe(model.over);
}

interface PlayOptions {
  /** Chance of discarding although a placement exists (the bot always discards when none does). */
  discardRate?: number;
  /** Stop (return) once this many moves were made, game not over. */
  stopAfter?: number;
  /** Use the keyboard (C, D) instead of the buttons for confirm and discard. */
  keyboard?: boolean;
  /** Check the highlighted slots against the engine at every orientation, at every move. */
  checkSlots?: boolean;
}

interface PlayResult {
  model: EngineGame;
  moves: number;
  closed: number;
  zeroClosures: number;
  discards: number;
}

/** Plays from the saved state of the page, in lockstep with an engine model, until the game is over or `stopAfter` moves. */
async function play(page: Page, random: () => number, options: PlayOptions = {}): Promise<PlayResult> {
  const save = await readSave(page);
  if (!save) throw new Error("no saved game to play");
  const model = replaySave(save);
  const out: PlayResult = { model, moves: 0, closed: 0, zeroClosures: 0, discards: 0 };
  const { discardRate = 0, stopAfter = Infinity, keyboard = false, checkSlots = true } = options;
  while (!model.over && out.moves < stopAfter) {
    const legal = model.legalPlacements();
    const at = `seed ${save.seed}, move ${model.built + model.discarded + 1}`;

    if (checkSlots) {
      for (let o = 1; o <= 4; o++) {
        await rotateTo(page, o);
        const want = legal.filter((p) => ORIENTATIONS.indexOf(p.orientation) === o).map((p) => ({ x: p.x, y: p.y }));
        const shown = (await shownSlots(page)).map(slotToEngine);
        expect(sorted(shown), `${at}: highlighted slots at orientation ${o}`).toEqual(sorted(want));
      }
    }

    if (legal.length === 0 || random() < discardRate) {
      const before = model.score;
      const t0 = performance.now();
      if (keyboard) await page.keyboard.press("d");
      else await page.getByText("Discard", { exact: true }).click();
      const result = model.discard();
      out.discards += 1;
      out.moves += 1;
      expect(result.points, `${at}: the penalty is 50 points at most the score`).toBe(Math.min(before, 50));
      await expectMirror(page, model, `${at} after discard`, { k: "d" });
      moveTimes.push({ kind: "discard", ms: performance.now() - t0 });
      continue;
    }

    // A cell the camera cannot bring clear of the panels is skipped, as a player would pick another one.
    let placement = legal[Math.floor(random() * legal.length)];
    let point: { x: number; y: number } | null = null;
    for (let tries = 0; tries < 6 && !point; tries++) {
      placement = legal[Math.floor(random() * legal.length)];
      await rotateTo(page, ORIENTATIONS.indexOf(placement.orientation));
      point = await cellPoint(page, placement.x, -placement.y).catch(() => null);
    }
    if (!point) throw new Error(`${at}: no legal cell could be brought on screen`);
    expect(await confirmDisabled(page), `${at}: Confirm is disabled until a slot is picked`).toBe(true);
    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    try {
      await expect.poll(() => confirmDisabled(page), { message: `${at}: the page refuses ${JSON.stringify(placement)}`, timeout: 20_000 }).toBe(false);
    } catch (error) {
      if (process.env.PAVED_E2E_SHOTS) await page.screenshot({ path: `${process.env.PAVED_E2E_SHOTS}/refused-${save.seed.slice(0, 8)}-${model.built}.png` });
      console.log(`[e2e] ${at}: panels ${JSON.stringify(await panelRects(page))}; clicked ${JSON.stringify(point)} for ${JSON.stringify(placement)}; view ${JSON.stringify(await page.evaluate(() => (window as any).__PAVED_E2E__.view))}`);
      throw error;
    }

    const t0 = performance.now();
    if (keyboard) await page.keyboard.press("c");
    else await page.getByText("Confirm", { exact: true }).click();
    const result = model.build(placement);
    out.moves += 1;
    // `|| 0`: the save is JSON, where -0 is 0.
    await expectMirror(page, model, `${at} after build`, { k: "b", o: ORIENTATIONS.indexOf(placement.orientation), x: placement.x || 0, y: placement.y || 0 });
    moveTimes.push({ kind: "place", ms: performance.now() - t0 });

    const ui = await readUi(page);
    expect(ui.alert, `${at}: no error notice after a legal move`).toBeNull();
    expect(ui.closures, `${at}: closing points shown`).toEqual(result.scored.map(closureText));
    out.closed += result.scored.length;
    out.zeroClosures += result.scored.filter((s) => s.points === 0).length;
  }
  if (model.over) {
    const ui = await readUi(page);
    expect(ui.complete, "the game-over dialog").not.toBeNull();
    expect(ui.complete!.finalScore.replace(/\D/g, "")).toBe(String(model.score));
    console.log(`[e2e] game over: seed ${save.seed}, ${model.built} built + ${model.discarded} discarded, score ${model.score} (the page: Built ${ui.built}/38)`);
  } else {
    expect((await readUi(page)).complete).toBeNull();
  }
  return out;
}

describe("Training, played by a bot in a headless browser", () => {
  it(`plays ${GAMES} complete games, with New game between them`, async () => {
    const { context, page, errors } = await freshPage();
    if (FIRST_SEED) await page.addInitScript(([key, seed]) => localStorage.setItem(key, JSON.stringify({ v: 1, seed, moves: [] })), [TRAINING_KEY, FIRST_SEED] as [string, string]);
    await openTraining(page, base);
    const seeds = new Set<string>();
    let closed = 0;
    let zero = 0;
    for (let g = 0; g < GAMES; g++) {
      const first = await readSave(page);
      expect(first?.moves, "a new game starts empty").toEqual([]);
      expect(seeds.has(first!.seed), "a new game has a new seed").toBe(false);
      seeds.add(first!.seed);
      // Even games place and discard only when stuck, odd ones also discard at will and use the keyboard.
      const result = await play(page, rng(1000 + g), g % 2 ? { discardRate: 0.25, keyboard: true } : {});
      closed += result.closed;
      zero += result.zeroClosures;
      expect(result.model.over).toBe(true);
      expect(result.model.tileCount, "the game ends once 38 tiles were drawn").toBe(38);
      expect((await readUi(page)).complete?.finalScore).toBeDefined();
      await page.getByText("New game", { exact: true }).click();
      await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) ?? "{}").moves?.length === 0, TRAINING_KEY);
      await expect.poll(async () => (await readUi(page)).complete, { message: "the dialog goes with the finished game", timeout: 30_000 }).toBeNull();
      await expectMirror(page, replaySave((await readSave(page))!), "new game");
    }
    console.log(`[e2e] ${GAMES} complete games: ${closed} closures seen, ${zero} of them for 0 points`);
    expect(closed, "the bot closed structures").toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await context.close();
  }, 900_000);

  it("resumes the same state after a reload, mid-game and after the end", async () => {
    const { context, page, errors } = await freshPage();
    await openTraining(page, base);
    const random = rng(77);
    for (const stop of [6, 11, 9]) {
      await play(page, random, { stopAfter: stop, checkSlots: false });
      const save = await readSave(page);
      const before = await readUi(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await ready(page);
      expect(await readSave(page), "the save survives the reload").toEqual(save);
      const after = await readUi(page);
      expect({ ...after, closures: [] }, "the page shows the same state").toEqual({ ...before, closures: [] });
    }
    // The game goes on from the resumed state to its end.
    const end = await play(page, random, { checkSlots: false });
    expect(end.model.over).toBe(true);
    const finalScore = (await readUi(page)).complete?.finalScore;
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    expect((await readUi(page)).complete?.finalScore, "a finished game resumes on its result").toBe(finalScore);
    // Closing the tab: a new page of the same browser profile.
    await page.close();
    const reopened = await context.newPage();
    await openTraining(reopened, base);
    expect((await readUi(reopened)).complete?.finalScore).toBe(finalScore);
    expect(errors).toEqual([]);
    await context.close();
  }, 600_000);

  it("surrenders: the game ends with its score, saved as such", async () => {
    const { context, page } = await freshPage();
    await openTraining(page, base);
    const result = await play(page, rng(5), { stopAfter: 8, checkSlots: false });
    await page.getByText("Surrender", { exact: true }).click();
    await page.getByText("Confirm surrender", { exact: true }).click();
    result.model.surrender();
    await page.getByRole("dialog", { name: "Game complete" }).waitFor();
    const ui = await readUi(page);
    expect(ui.complete!.finalScore.replace(/\D/g, "")).toBe(String(result.model.score));
    const save = await readSave(page);
    expect(save!.moves.at(-1)).toEqual({ k: "s" });
    expect(replaySave(save!).over).toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    expect((await readUi(page)).complete?.finalScore.replace(/\D/g, "")).toBe(String(result.model.score));
    await context.close();
  }, 300_000);

  it("keyboard shortcuts do nothing under the surrender dialog", async () => {
    const { context, page } = await freshPage();
    await openTraining(page, base);
    await page.getByText("Surrender", { exact: true }).click();
    await page.getByRole("dialog", { name: "Surrender" }).waitFor();
    await page.keyboard.press("d");
    await page.waitForTimeout(200);
    expect((await readSave(page))!.moves, "a discard typed under the dialog is not played").toEqual([]);
    await context.close();
  }, 60_000);

  it("starts a new game on a corrupt or stale save, and keeps a valid one afterwards", async () => {
    for (const bad of ["not json", '{"v":2}', '{"v":1,"seed":"0x1","moves":[{"k":"b","o":1,"x":99,"y":99}]}', '{"v":1,"seed":"0x1","moves":[{"k":"s"},{"k":"d"}]}']) {
      const { context, page, errors } = await freshPage({ init: undefined });
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRAINING_KEY, bad] as [string, string]);
      await openTraining(page, base);
      const save = await readSave(page);
      expect(save?.moves, `a game starts over ${bad}`).toEqual([]);
      expect((await readUi(page)).score).toBe(0);
      expect(errors).toEqual([]);
      await context.close();
    }
  }, 120_000);

  it("plays with storage disabled, and does not resume", async () => {
    const { context, page, errors } = await freshPage({
      init: () => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("denied", "SecurityError");
          },
        });
      },
    });
    await page.goto(`${base}/game?mode=training`, { waitUntil: "domcontentloaded" });
    await ready(page);
    await page.waitForFunction(() => (window as any).__PAVED_E2E__.view);
    // The tile in hand may fit nowhere as it is: turn it until a slot is lit.
    let slots = await shownSlots(page);
    for (let o = 2; slots.length === 0 && o <= 4; o++) {
      await rotateTo(page, o);
      slots = await shownSlots(page);
    }
    expect(slots.length).toBeGreaterThan(0);
    const point = await cellPoint(page, slots[0].x, slots[0].y);
    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    await page.getByText("Confirm", { exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("1/38"));
    expect(errors).toEqual([]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    expect((await readUi(page)).built, "nothing was saved: a new game").toBe(0);
    await context.close();
  }, 120_000);

  it("keeps the save valid when two tabs play the same game", async () => {
    const { context, page: a, errors } = await freshPage();
    await openTraining(a, base);
    const b = await context.newPage();
    await openTraining(b, base);
    expect((await readSave(b))!.seed, "the second tab resumes the same game").toBe((await readSave(a))!.seed);
    await play(b, rng(3), { stopAfter: 3, checkSlots: false });
    // Tab A still holds its own state (no moves): its next move overwrites the save with A's view of the game.
    let slots = await shownSlots(a);
    for (let o = 2; slots.length === 0 && o <= 4; o++) {
      await rotateTo(a, o);
      slots = await shownSlots(a);
    }
    const point = await cellPoint(a, slots[0].x, slots[0].y);
    await a.mouse.move(point.x, point.y);
    await a.mouse.click(point.x, point.y);
    await a.getByText("Confirm", { exact: true }).click();
    await a.waitForFunction(() => document.body.innerText.includes("1/38"));
    const save = await readSave(a);
    expect(() => replaySave(save!), "whatever the interleaving, the save replays").not.toThrow();
    expect(errors).toEqual([]);
    await context.close();
  }, 120_000);

  it("shows its controls at a phone width", async () => {
    const { context, page } = await freshPage({ viewport: { width: 390, height: 844 } });
    await openTraining(page, base);
    for (const label of ["Rotate", "Confirm", "Discard", "Surrender"]) {
      const box = await page.getByText(label, { exact: true }).first().boundingBox();
      expect(box, label).not.toBeNull();
      expect(box!.x, `${label} inside the viewport (left)`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${label} inside the viewport (right)`).toBeLessThanOrEqual(390);
      expect(box!.y + box!.height, `${label} inside the viewport (bottom)`).toBeLessThanOrEqual(844);
    }
    await context.close();
  }, 60_000);

  it("shows the saved game on the Landing card: Play, Resume, View result", async () => {
    const { context, page } = await freshPage();
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const card = page.getByTestId("mode-card-training");
    await card.waitFor();
    expect(await card.innerText()).toContain("Play");
    await openTraining(page, base);
    await play(page, rng(9), { stopAfter: 2, checkSlots: false });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await card.waitFor();
    expect(await card.innerText()).toContain("Resume");
    await openTraining(page, base);
    await play(page, rng(9), { checkSlots: false });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await card.waitFor();
    expect(await card.innerText()).toContain("View result");
    await card.getByText("View result", { exact: true }).click();
    await ready(page);
    expect((await readUi(page)).complete).not.toBeNull();
    await context.close();
  }, 600_000);
});
