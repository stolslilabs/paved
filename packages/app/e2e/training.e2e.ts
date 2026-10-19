import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { TRAINING_KEY, type EngineGame, type SavedMove } from "@paved/game-core";
import {
  CENTER,
  ORIENTATIONS,
  VIEWPORT,
  bubble,
  nextValid,
  noWebGL,
  openTraining,
  placeButton,
  points,
  readHand,
  readSave,
  readUi,
  ready,
  replaySave,
  rngOf,
  shownSlots,
  slotName,
  type MoveReport,
} from "./bot";

/**
 * The battle test of Training (P-79), on the app: complete games played in a real (headless) browser by a bot, against
 * the Vite dev server with no chain configured (or `PAVED_E2E_URL`, a server already up). The board is the plan view (no
 * WebGL), whose legal slots are buttons. Every move is checked against the engine's replay of what the browser saved, and
 * the slots, the rotations and the tile the page offers against the engine's.
 *
 * - `PAVED_E2E_GAMES`: the full games of the first test (default 2).
 * - `PAVED_E2E_SEED` (a hex felt, `0x…`): the first game's seed, to replay a failing game; the log prints every seed. The
 *   bot's choices come from the seed, its strategy from the game's index: `PAVED_E2E_FROM` (default 0) is the first's.
 * - `PAVED_E2E_ARTIFACTS`: where the seeds and, on a failure, the page's last screenshot go (default `e2e/artifacts`).
 */
const GAMES = Number(process.env.PAVED_E2E_GAMES ?? 2);
const FIRST_SEED = process.env.PAVED_E2E_SEED;
if (FIRST_SEED !== undefined && !/^0x[0-9a-f]{1,64}$/.test(FIRST_SEED)) throw new Error("PAVED_E2E_SEED must be a lowercase hex felt, 0x…");
const FROM = Number(process.env.PAVED_E2E_FROM ?? 0);
const ARTIFACTS = process.env.PAVED_E2E_ARTIFACTS ?? fileURLToPath(new URL("./artifacts", import.meta.url));
mkdirSync(ARTIFACTS, { recursive: true });

let server: ViteDevServer | null = null;
let browser: Browser;
let base = process.env.PAVED_E2E_URL ?? "";
const moveTimes: MoveReport[] = [];

/** Each seed in the log and in the artifacts, as it starts: a game that fails mid-way is named before it fails. */
function logSeed(test: string, seed: string, note = ""): void {
  const line = `[e2e] ${test}: seed ${seed}${note ? `, ${note}` : ""}`;
  console.log(line);
  appendFileSync(join(ARTIFACTS, "seeds.txt"), `${line}\n`);
}

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
  browser = await chromium.launch({ headless: true });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  for (const kind of ["place", "discard"] as const) {
    const t = moveTimes.filter((m) => m.kind === kind).map((m) => m.ms).sort((a, b) => a - b);
    if (t.length === 0) continue;
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    console.log(`[e2e] ${kind}: ${t.length} moves, mean ${mean.toFixed(0)} ms, p95 ${t[Math.floor(t.length * 0.95)]!.toFixed(0)} ms (click to the page showing the move)`);
  }
});

/** A new browser profile on the plan view; on a failure of `body`, the page's last screenshot goes to the artifacts. */
async function withPage(name: string, body: (page: Page, context: BrowserContext) => Promise<void>): Promise<void> {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  await context.addInitScript(noWebGL);
  context.setDefaultNavigationTimeout(120_000);
  const page = await context.newPage();
  const errors: string[] = [];
  context.on("weberror", (e) => errors.push(e.error().message));
  let last = page;
  context.on("page", (p) => (last = p));
  try {
    await body(page, context);
    expect(errors, "no uncaught error in the page").toEqual([]);
  } catch (e) {
    await last.screenshot({ path: join(ARTIFACTS, `${name}.png`), fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await context.close();
  }
}

const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
const sorted = (cells: Array<{ x: number; y: number }>) => [...new Set(cells.map(key))].sort();
/** The engine's placement in the chain's coordinates, as the plan view names its slots. */
const chainOf = (p: { x: number; y: number }) => ({ x: CENTER + p.x, y: CENTER + p.y });
/** The tiles left as the header counts them: the deck less the tiles placed (the starter too) and discarded. */
const remainingOf = (model: EngineGame) => Math.max(0, model.tileLimit - model.built - 1 - model.discarded);

/** The page shows what the engine says (score, tiles left), and the save is the move made and replays to the same state. */
async function expectMirror(page: Page, model: EngineGame, where: string, move?: SavedMove): Promise<void> {
  if (!model.over) {
    await page.waitForFunction((n) => document.querySelector('[data-testid="tiles-left"]')?.textContent?.trim() === String(n), remainingOf(model), { timeout: 60_000 });
    expect((await readUi(page)).score, `${where}: score`).toBe(model.score);
  }
  const save = await readSave(page);
  expect(save, `${where}: saved`).not.toBeNull();
  // What the page saved is the move the bot made: a click on another slot or rotation cannot pass silently.
  if (move) expect(save!.moves.at(-1), `${where}: the saved move`).toEqual(move);
  const replayed = replaySave(save!);
  expect(replayed.score, `${where}: engine replay of the save`).toBe(model.score);
  expect(replayed.built).toBe(model.built);
  expect(replayed.discarded).toBe(model.discarded);
  expect(replayed.over).toBe(model.over);
}

/** The over page shows the engine's final score. */
async function expectOver(page: Page, model: EngineGame): Promise<void> {
  await page.waitForURL(/\/training\/over(\?.*)?$/, { timeout: 60_000 });
  await page.getByRole("button", { name: "Play again" }).waitFor({ timeout: 60_000 });
  const score = await page.getByTestId("final-score").getByTestId("score-value").innerText();
  expect(points(score), "the final score").toBe(model.score);
}

interface PlayOptions {
  /** Chance of discarding although a placement exists (the bot always discards when none does). */
  discardRate?: number;
  /** Stop (return) once this many moves were made, game not over. */
  stopAfter?: number;
  /** At every move: the offered slots against the engine, and every rotation the bubble turns through. */
  checkSlots?: boolean;
  /** Among the legal placements, pick one that closes a structure whenever there is one (the engine's word). */
  seekClosure?: boolean;
}

interface PlayResult {
  model: EngineGame;
  moves: number;
  closed: number;
  closable: number;
}

/** Plays from the saved state of the page, in lockstep with an engine model, until the game is over or `stopAfter` moves. */
async function play(page: Page, random: () => number, options: PlayOptions = {}): Promise<PlayResult> {
  const save = await readSave(page);
  if (!save) throw new Error("no saved game to play");
  const model = replaySave(save);
  const out: PlayResult = { model, moves: 0, closed: 0, closable: 0 };
  const { discardRate = 0, stopAfter = Infinity, checkSlots = true, seekClosure = false } = options;
  const rotate = bubble(page).getByRole("button", { name: "Rotate tile" });
  // The rotation in hand: the page's, then followed through the bot's own clicks (a place turns it back to North).
  let orientation = (await readHand(page)).orientation;
  while (!model.over && out.moves < stopAfter) {
    const legal = model.legalPlacements();
    const at = `seed ${save.seed}, move ${model.built + model.discarded + 1}`;
    const legalAt = (o: number) => sorted(legal.filter((p) => ORIENTATIONS.indexOf(p.orientation) === o).map(chainOf));
    const fitting = async () => sorted((await shownSlots(page)).filter((s) => s.fits));

    // The hand holds the engine's tile, in the rotation the bot expects.
    expect(await readHand(page), `${at}: the tile in hand`).toEqual({ plan: model.hand!.plan.toLowerCase(), orientation });
    expect(await placeButton(page).isDisabled(), `${at}: Place tile is disabled until a slot is picked`).toBe(true);
    if (checkSlots) {
      // Every legal slot of any rotation is a button; those the rotation in hand fits are lit.
      const shown = await shownSlots(page);
      expect(sorted(shown), `${at}: the slots offered`).toEqual(sorted(legal.map(chainOf)));
      expect(sorted(shown.filter((s) => s.fits)), `${at}: the slots lit at rotation ${orientation}`).toEqual(legalAt(orientation));
    }

    if (legal.length === 0 || random() < discardRate) {
      const t0 = performance.now();
      await page.getByRole("button", { name: "Discard" }).click();
      model.discard();
      out.moves += 1;
      await expectMirror(page, model, `${at} after discard`, { k: "d" });
      moveTimes.push({ kind: "discard", ms: performance.now() - t0 });
      continue;
    }

    const closing = seekClosure ? legal.filter((p) => model.clone().build(p).scored.length > 0) : [];
    if (closing.length > 0) out.closable += 1;
    const pool = closing.length > 0 ? closing : legal;
    const placement = pool[Math.floor(random() * pool.length)]!;
    const cell = chainOf(placement);
    const want = ORIENTATIONS.indexOf(placement.orientation);
    // The rotations the engine allows at that cell: the tile lands in the one in hand if it fits, else the first that does.
    const valid = [1, 2, 3, 4].filter((o) => model.canPlace({ orientation: ORIENTATIONS[o]!, x: placement.x, y: placement.y }));
    const slot = page.getByRole("button", { name: slotName(cell.x, cell.y), exact: true });
    await slot.click();
    if (!valid.includes(orientation)) orientation = valid[0]!;
    await expect.poll(() => slot.getAttribute("aria-pressed"), { message: `${at}: the tile stands on its slot`, timeout: 10_000 }).toBe("true");
    await bubble(page).waitFor({ timeout: 10_000 });
    expect(await rotate.count(), `${at}: Rotate shows only with more than one rotation (${valid.join(",")})`).toBe(valid.length > 1 ? 1 : 0);

    // Rotate turns through the valid rotations only: when asked, each one is checked (the hand, the lit slots) and the
    // tile comes back to the first; then it is turned to the bot's.
    const check = async () => {
      await expect.poll(async () => (await readHand(page)).orientation, { message: `${at}: the rotation in hand`, timeout: 10_000 }).toBe(orientation);
      await expect.poll(fitting, { message: `${at}: the slots lit at rotation ${orientation}`, timeout: 10_000 }).toEqual(legalAt(orientation));
    };
    const turn = async () => {
      await rotate.click();
      orientation = nextValid(orientation, valid);
    };
    if (checkSlots) {
      for (let i = 0; i < valid.length; i++) {
        await check();
        if (valid.length > 1) await turn();
      }
    }
    for (let i = 0; i < 4 && orientation !== want; i++) await turn();
    expect(orientation, `${at}: the bubble reaches the rotation wanted`).toBe(want);
    await expect.poll(async () => (await readHand(page)).orientation, { message: `${at}: the rotation in hand`, timeout: 10_000 }).toBe(want);
    await expect.poll(() => placeButton(page).isEnabled(), { message: `${at}: the page refuses ${JSON.stringify(placement)}`, timeout: 20_000 }).toBe(true);
    // The preview on Place tile is the engine's points for that placement.
    const preview = model.clone().build(placement).points;
    const shownPreview = /\+([\d,]+)/.exec(await placeButton(page).innerText());
    expect(shownPreview && points(shownPreview[1]!), `${at}: the preview`).toBe(preview);

    const t0 = performance.now();
    await placeButton(page).click();
    const result = model.build(placement);
    orientation = 1;
    out.moves += 1;
    out.closed += result.scored.length;
    // `|| 0`: the save is JSON, where -0 is 0.
    await expectMirror(page, model, `${at} after build`, { k: "b", o: want, x: placement.x || 0, y: placement.y || 0 });
    moveTimes.push({ kind: "place", ms: performance.now() - t0 });
  }
  if (model.over) {
    await expectOver(page, model);
    console.log(`[e2e] game over: seed ${save.seed}, ${model.built} built + ${model.discarded} discarded, score ${model.score}`);
  }
  return out;
}

describe("Training, played by a bot in a headless browser", () => {
  it(`plays ${GAMES} complete games, with Play again between them`, async () => {
    await withPage("games", async (page) => {
      if (FIRST_SEED) await page.addInitScript(([k, seed]) => localStorage.setItem(k, JSON.stringify({ v: 1, seed, moves: [] })), [TRAINING_KEY, FIRST_SEED] as [string, string]);
      await openTraining(page, base);
      const seeds = new Set<string>();
      let closed = 0;
      let closable = 0;
      for (let g = FROM; g < FROM + GAMES; g++) {
        const first = await readSave(page);
        expect(first?.moves, "a new game starts empty").toEqual([]);
        if (g === FROM && FIRST_SEED) expect(first!.seed, "PAVED_E2E_SEED is the first game's seed").toBe(FIRST_SEED);
        expect(seeds.has(first!.seed), "a new game has a new seed").toBe(false);
        seeds.add(first!.seed);
        // Even games place, discard only when stuck, and go for a closing slot when there is one; odd ones also discard at will.
        const strategy = g % 2 ? { discardRate: 0.25 } : { seekClosure: true };
        logSeed("games", first!.seed, `game ${g} (PAVED_E2E_SEED=${first!.seed} PAVED_E2E_FROM=${g} PAVED_E2E_GAMES=1 replays it)`);
        const result = await play(page, rngOf(first!.seed), strategy);
        closed += result.closed;
        closable += result.closable;
        expect(result.model.over).toBe(true);
        expect(remainingOf(result.model), "the game ends once the deck is spent").toBe(0);
        await page.getByRole("button", { name: "Play again" }).click();
        await page.waitForURL(/\/training$/);
        await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k) ?? "{}").moves?.length === 0, TRAINING_KEY);
        await ready(page);
        await expectMirror(page, replaySave((await readSave(page))!), "new game");
      }
      console.log(`[e2e] ${GAMES} complete games: ${closed} closures, ${closable} moves with a closing slot`);
      if (closable > 0) expect(closed, "the bot closed a structure it was offered").toBeGreaterThan(0);
    });
  }, 900_000);

  it("resumes the same state after a reload, mid-game and after the end", async () => {
    await withPage("resume", async (page, context) => {
      await openTraining(page, base);
      const seed = (await readSave(page))!.seed;
      logSeed("resume", seed);
      const random = rngOf(seed);
      for (const stop of [6, 11, 9]) {
        await play(page, random, { stopAfter: stop, checkSlots: false });
        const save = await readSave(page);
        const before = await readUi(page);
        const hand = await readHand(page);
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready(page);
        expect(await readSave(page), "the save survives the reload").toEqual(save);
        expect(await readUi(page), "the page shows the same state").toEqual(before);
        expect((await readHand(page)).plan, "the same tile in hand").toBe(hand.plan);
      }
      // The game goes on from the resumed state to its end; a reload of a finished game stays on its result.
      const end = await play(page, random, { checkSlots: false });
      expect(end.model.over).toBe(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectOver(page, end.model);
      // Opening Training again in the same browser profile resumes the result too.
      await page.close();
      const reopened = await context.newPage();
      await reopened.goto(`${base}/training`, { waitUntil: "domcontentloaded" });
      await expectOver(reopened, end.model);
    });
  }, 600_000);

  it("surrenders: the game ends with its score, saved as such", async () => {
    await withPage("surrender", async (page) => {
      await openTraining(page, base);
      const seed = (await readSave(page))!.seed;
      logSeed("surrender", seed);
      const { model } = await play(page, rngOf(seed), { stopAfter: 8, checkSlots: false });
      await page.getByRole("region", { name: "Your tile" }).getByRole("button", { name: "Surrender" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Surrender" }).click();
      model.surrender();
      await expectOver(page, model);
      const save = await readSave(page);
      expect(save!.moves.at(-1), "the surrender is saved").toEqual({ k: "s" });
      const replayed = replaySave(save!);
      expect(replayed.over).toBe(true);
      expect(replayed.score).toBe(model.score);
      expect(remainingOf(replayed), "a surrender leaves tiles unplayed").toBeGreaterThan(0);
    });
  }, 300_000);
});
