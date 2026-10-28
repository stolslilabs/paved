/**
 * The boards the Story backgrounds draw (`scripts/render-tiles.ts`, #721): a rectangle of cells every one of which holds a
 * tile, each fitting its neighbours by the game's own rule (`EngineGame.refusal`: the same category on every facing edge),
 * so roads and cities run on from tile to tile as on a played board. The starter sits at (0, 0) as on every board.
 * Deterministic: the same size and seed give the same board.
 */
import { EngineGame, OrientationType, PlanType } from "@paved/game-core";

/** A tile of a render: its plan key, its cell by offset from the starter (`dy` grows to the south, as the page's), its orientation code. */
export interface BoardTile {
  key: string;
  dx: number;
  dy: number;
  orientation: number;
}

const PLANS = Object.values(PlanType).filter((p) => p !== PlanType.None);
const ORIENTATIONS = [OrientationType.North, OrientationType.East, OrientationType.South, OrientationType.West];
const ORIENTATION_CODES = Object.values(OrientationType);
/** A wonder is a landmark: at most this many on a board, so it stays one. */
const WONDERS = 2;

/** A small seeded generator (mulberry32): the board is the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** 0, 1, -1, 2, -2...: from the starter out, so each cell placed touches one placed before it. */
const outward = (low: number, high: number): number[] =>
  Array.from({ length: high - low + 1 }, (_, i) => low + i).sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);

/** A plan's share of forest spots (its key's `f`s of nine), the weight `forest` raises; of city spots (`c`s), the weight `city` raises. */
const forestShare = (plan: PlanType) => [...plan].filter((c) => c === "F").length / 9;
const cityShare = (plan: PlanType) => [...plan].filter((c) => c === "C").length / 9;

/**
 * A full board of `columns` x `rows` cells around the starter (the starter's column and row in the middle, the extra one to
 * the east and the south when a side is even), every cell filled with a fitting tile. `forest` (0: every fitting tile alike)
 * favours the plans with more forest, as a power of their forest share: a forest theme's board shows its woods; `city` the plans
 * with more city, likewise (a walled village, the battle logs' defence, #857). Throws if no board fits (never seen: the search backs up a few cells at most).
 */
export function fillBoard(columns: number, rows: number, seed: number, forest = 0, city = 0): BoardTile[] {
  const xs = outward(-Math.floor((columns - 1) / 2), Math.ceil((columns - 1) / 2));
  // The engine's y grows to the north: the rows run from the starter's to the south's (more of them) and the north's.
  const ys = outward(-Math.ceil((rows - 1) / 2), Math.floor((rows - 1) / 2));
  const cells = ys.flatMap((y) => xs.map((x) => [x, y] as const)).filter(([x, y]) => x !== 0 || y !== 0);
  const next = random(seed);
  const placed: { plan: PlanType; orientation: OrientationType; x: number; y: number }[] = [];
  let steps = 0;
  const search = (game: EngineGame, index: number, wonders: number): boolean => {
    if (index === cells.length) return true;
    if (++steps > 200_000) throw new Error(`render-tiles: no ${columns} x ${rows} board found for seed ${seed}`);
    const [x, y] = cells[index]!;
    // A weighted shuffle (each choice's key a random number raised to one over its weight): the heavier come first more often.
    const choices = PLANS.flatMap((plan) => ORIENTATIONS.map((orientation) => ({ plan, orientation, order: -(next() ** (1 / ((0.05 + forestShare(plan)) ** forest * (0.05 + cityShare(plan)) ** city))) })))
      .filter(({ plan, orientation }) => (wonders < WONDERS || !plan.startsWith("W")) && game.canPlace({ x, y, orientation }, plan))
      .sort((a, b) => a.order - b.order);
    for (const { plan, orientation } of choices) {
      const after = game.clone();
      after.write({ id: 1_000 + index, plan, orientation, x, y });
      placed[index] = { plan, orientation, x, y };
      if (search(after, index + 1, wonders + (plan.startsWith("W") ? 1 : 0))) return true;
    }
    return false;
  };
  const start = EngineGame.start({ deck: "story", seed: 0n, sequence: [PlanType.FFFFFFCFF] });
  if (!search(start, 0, 0)) throw new Error(`render-tiles: no ${columns} x ${rows} board fits for seed ${seed}`);
  const starter = start.tileAt(0, 0)!;
  return [starter, ...placed].map((t) => ({ key: t.plan.toLowerCase(), dx: t.x, dy: t.y === 0 ? 0 : -t.y, orientation: ORIENTATION_CODES.indexOf(t.orientation) }));
}
