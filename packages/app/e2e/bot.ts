import type { Page } from "playwright-core";
import { CENTER, OrientationType, TRAINING_KEY, replayTraining, type EngineGame, type SavedGame } from "@paved/game-core";

export { CENTER };

/**
 * The window of the test: a desktop's, wide enough that the plan view's board stands clear of the hand panel (bottom
 * right) and the header (top), so every slot takes a real click.
 */
export const VIEWPORT = { width: 1440, height: 900 };

/** The engine's orientations by the page's number (1 North to 4 West); index 0 is `None`. */
export const ORIENTATIONS = Object.values(OrientationType);
const SIDES = ["north", "east", "south", "west"];

/** A small deterministic generator (mulberry32), so that a failing game replays from its seed. */
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

/** The bot's generator for a game: from the game's seed, so `PAVED_E2E_SEED` replays the bot's choices too. */
export const rngOf = (seed: string): (() => number) => rng(Number(BigInt(seed) & 0xffffffffn));

/**
 * The board with no WebGL: the page draws the plan view (`BoardMap`), whose legal slots are buttons. The bot plays there;
 * the 3D board's clicks are the renderer's tests' and the Storybook's. Runs in the page, before its scripts.
 */
export function noWebGL(): void {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
    if (/webgl/i.test(id)) return null;
    return (getContext as (...args: unknown[]) => unknown).call(this, id, ...rest);
  } as typeof getContext;
}

export async function readSave(page: Page): Promise<SavedGame | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), TRAINING_KEY);
  return raw ? (JSON.parse(raw) as SavedGame) : null;
}

/** The engine's own replay of what the browser saved: the oracle of every check. */
export const replaySave = (save: SavedGame): EngineGame => replayTraining(BigInt(save.seed), save.moves);

/** A figure as `formatPoints` writes it ("1,234", "−12") as a number. */
export function points(text: string): number {
  const n = Number(text.replace(/[^\d]/g, ""));
  return /^\s*[-−]/.test(text) ? -n : n;
}

export interface Ui {
  score: number;
  remaining: number;
}

/** The header's counters: the score and the tiles left. */
export async function readUi(page: Page): Promise<Ui> {
  const [score, remaining] = await Promise.all([
    page.locator("header").getByTestId("score-value").innerText({ timeout: 10_000 }),
    page.getByTestId("tiles-left").innerText({ timeout: 10_000 }),
  ]);
  return { score: points(score), remaining: Number(remaining) };
}

/** The tile in hand as the hand panel draws it: its plan's letters (lower case) and its orientation (1 North to 4 West). */
export async function readHand(page: Page): Promise<{ plan: string; orientation: number }> {
  const label = (await page.getByRole("region", { name: "Your tile" }).getByRole("img").first().getAttribute("aria-label", { timeout: 10_000 })) ?? "";
  const match = /^Tile (\w+), (north|east|south|west)$/.exec(label);
  if (!match) throw new Error(`the hand shows no tile: "${label}"`);
  return { plan: match[1]!, orientation: SIDES.indexOf(match[2]!) + 1 };
}

export interface ShownSlot {
  x: number;
  y: number;
  /** The rotation in hand fits there (a lit plate). */
  fits: boolean;
  /** The tile stands there, chosen and not yet sent. */
  placed: boolean;
}

/** The slots the plan view offers (chain coordinates, from each button's name), with whether the rotation in hand fits. */
export async function shownSlots(page: Page): Promise<ShownSlot[]> {
  const names = await page.locator('button[aria-label^="Slot "]').evaluateAll((buttons) =>
    buttons.map((b) => ({ name: b.getAttribute("aria-label")!, fits: b.getAttribute("data-fits") === "true", placed: b.getAttribute("aria-pressed") === "true" })),
  );
  return names.map(({ name, fits, placed }) => ({ ...slotOf(name), fits, placed }));
}

/** A slot's name ("Slot 2 east, 1 north", "Slot centre") as the chain's x and y. */
export function slotOf(name: string): { x: number; y: number } {
  let x = CENTER;
  let y = CENTER;
  for (const [, n, dir] of name.matchAll(/(\d+) (east|west|north|south)/g)) {
    const d = Number(n);
    if (dir === "east") x += d;
    if (dir === "west") x -= d;
    if (dir === "north") y += d;
    if (dir === "south") y -= d;
  }
  return { x, y };
}

/** The name the plan view gives the slot at the chain's x and y: the inverse of `slotOf`. */
export function slotName(x: number, y: number): string {
  const dx = x - CENTER;
  const dy = y - CENTER;
  const part = (n: number, plus: string, minus: string) => (n === 0 ? null : `${Math.abs(n)} ${n > 0 ? plus : minus}`);
  return `Slot ${[part(dx, "east", "west"), part(dy, "north", "south")].filter(Boolean).join(", ") || "centre"}`;
}

/** The next of the `valid` rotations after `orientation`, clockwise: what the bubble's Rotate does (`nextValid`). */
export function nextValid(orientation: number, valid: readonly number[]): number {
  for (let step = 1; step <= 4; step++) {
    const o = ((orientation - 1 + step) % 4) + 1;
    if (valid.includes(o)) return o;
  }
  return orientation;
}

/** The bubble's Validate, held to place the tile (PLACE-POLISH, #568): the hand panel has no Place tile any more. */
export const validateButton = (page: Page) => bubble(page).getByRole("button", { name: "Hold to place the tile", exact: true });
/** The points preview of the tile placed and not sent, over the header's score ("(+154)"); null when none shows. */
export async function readPreview(page: Page): Promise<number | null> {
  const preview = page.locator("header").getByTestId("score-preview");
  if ((await preview.count()) === 0) return null;
  return points(await preview.innerText());
}

/** The moves saved so far: a placement shows here as soon as the page has made it. */
const savedMoves = async (page: Page) => (await readSave(page))?.moves.length ?? 0;

/**
 * Places the tile as a player does: the mouse pressed on Validate and held until the page has made the move (the hold's
 * 800 ms and the save), then let go. A press let go before the end places nothing (`tapValidate`).
 */
export async function holdToPlace(page: Page): Promise<void> {
  await holdUntilSaved(page, validateButton(page));
}

/** The tile stack's Discard (#606): held as Validate is, while no cell is chosen. */
export const discardButton = (page: Page) => page.getByRole("region", { name: "Your tile" }).getByRole("button", { name: /^Hold to discard the tile/ });

/** Discards the tile as a player does: the stack's trash held until the page has saved the discard, then let go. */
export async function holdToDiscard(page: Page): Promise<void> {
  await holdUntilSaved(page, discardButton(page));
}

/** The mouse pressed on `button` and held until the page has saved one more move, then let go. */
async function holdUntilSaved(page: Page, button: ReturnType<Page["getByRole"]>): Promise<void> {
  const before = await savedMoves(page);
  await button.hover();
  await page.mouse.down();
  try {
    await page.waitForFunction(
      ([key, n]) => (JSON.parse(localStorage.getItem(key) ?? "{}").moves?.length ?? 0) > n,
      [TRAINING_KEY, before] as [string, number],
      { timeout: 20_000 },
    );
  } finally {
    await page.mouse.up();
  }
}

/** A short press on Validate (a tap): the ring starts and rewinds, nothing is placed. Returns whether the save is unchanged. */
export async function tapValidate(page: Page): Promise<boolean> {
  const before = await savedMoves(page);
  await validateButton(page).click();
  // Longer than the hold: a tap that placed would have saved by now.
  await page.waitForTimeout(1_200);
  return (await savedMoves(page)) === before;
}
/** The bubble on the tile placed and not sent (the plan view draws it above the tile stack). */
export const bubble = (page: Page) => page.getByRole("toolbar", { name: "Tile" });

export async function openTraining(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/training`, { waitUntil: "domcontentloaded" });
  await ready(page);
}

/** The board is up (its header's tiles left and a tile in hand), or a finished game's over page is. */
export async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (!!document.querySelector('[data-testid="tiles-left"]') && !!document.querySelector('section[aria-label="Your tile"] [role="img"][aria-label^="Tile "]')) ||
      !!document.querySelector('[data-testid="final-score"]'),
    null,
    { timeout: 120_000 },
  );
}

export interface MoveReport {
  kind: "place" | "discard";
  /** From the press on Validate / the click on Discard to the page showing the new state, milliseconds. */
  ms: number;
}
