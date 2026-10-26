import { EAST, NORTH, SOUTH, WEST, edgeCategory, opposite } from "../engine/geometry";
import { STARTER_TILE, type Inventory, type LayoutTile } from "./free-village";
import { BASE_PLAN_CODES } from "./rarity";

// A random compact village (#803, owner decisions of 2026-10-26): the die of the editor. Not an optimiser: it grows a layout
// from the starter alone, a tile at a time, each on a legal cell (next to a tile, every facing edge matching, the same rule as
// `VillageDraft`), chosen by compactness (the cell with the most neighbours, the bounding box kept near a square) plus a seeded
// random share, so two seeds give two villages. The score is never looked at. Several tries run within a budget of steps (never
// of time, so a seed always gives the same village); the one with the most tiles wins, then the squarest. A light board of its own (edges only, no engine game, no structure scored), so a
// try costs little; the client runs it in a Web Worker.

/** North, east, south, west: the step to the neighbour and the engine's direction code of the edge facing it. */
const SIDES = [
  [0, 1, NORTH],
  [1, 0, EAST],
  [0, -1, SOUTH],
  [-1, 0, WEST],
] as const;

/** The tries of a press at most. */
export const RANDOM_LAYOUT_TRIES = 48;
/**
 * The steps the tries may take at most: a step is a plan checked on a free cell. The work is counted, not timed, so the budget
 * stops the tries at the same point on every machine. The hardest stock measured (one of each plan, 28 slots) takes at most
 * about 91,000 steps for its 48 tries, 20 to 35 ms in Node on a loaded machine; the budget stops a larger village near the same
 * work, within the issue's 150 ms on a phone about 4x slower.
 */
export const RANDOM_LAYOUT_STEPS = 100_000;

export interface RandomLayoutBudget {
  /** At most this many tries (default `RANDOM_LAYOUT_TRIES`). */
  readonly tries?: number;
  /** No try starts once this many steps are used (default `RANDOM_LAYOUT_STEPS`); the first one always runs. */
  readonly steps?: number;
}

export interface RandomLayout {
  /** The layout, the starter left out: valid against the stock and the slots (`layoutRefusal` gives null). */
  readonly tiles: LayoutTile[];
  /** The tries that ran. */
  readonly tries: number;
  /** The steps they took. */
  readonly steps: number;
  /** The steps ran out before the tries did: the best found so far (the same for the same seed). */
  readonly exhausted: boolean;
}

/** A 32-bit PRNG (mulberry32): the same seed, the same numbers in [0, 1). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed of try `n` of a press. */
const trySeed = (seed: number, n: number): number => (Math.imul(seed >>> 0, 0x9e3779b1) + Math.imul(n + 1, 0x85ebca77)) >>> 0;

const key = (x: number, y: number): number => (x + 512) * 1024 + (y + 512);

interface Grown {
  readonly tiles: LayoutTile[];
  /** The plans checked on free cells. */
  readonly steps: number;
  readonly width: number;
  readonly height: number;
}

/** How a grown layout ranks (lower is better): fewer tiles missing, then the longer side, then the holes of its box, then the gap between its sides. */
function rank(g: Grown, target: number): number[] {
  const cells = g.tiles.length + 1;
  return [target - g.tiles.length, Math.max(g.width, g.height), g.width * g.height - cells, Math.abs(g.width - g.height)];
}

const better = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
};

/** One try: the starter alone, then a tile at a time until `target` tiles or none fits anywhere. */
function grow(stock: readonly number[], target: number, side: number, next: () => number): Grown {
  const left = [...stock];
  const board = new Map<number, { plan: number; orientation: number }>([[key(0, 0), { plan: STARTER_TILE.plan, orientation: STARTER_TILE.orientation }]]);
  const frontier = new Map<number, { x: number; y: number }>();
  const open = (x: number, y: number) => {
    for (const [dx, dy] of SIDES) {
      const k = key(x + dx, y + dy);
      if (!board.has(k)) frontier.set(k, { x: x + dx, y: y + dy });
    }
  };
  open(0, 0);
  let [minX, maxX, minY, maxY] = [0, 0, 0, 0];
  const tiles: LayoutTile[] = [];
  let steps = 0;
  while (tiles.length < target) {
    let best: { x: number; y: number; plan: number; orientations: number[] } | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const cell of frontier.values()) {
      // The facing edges this cell must match, and how it would stretch the box.
      const facing: [number, number][] = [];
      for (const [dx, dy, direction] of SIDES) {
        const n = board.get(key(cell.x + dx, cell.y + dy));
        if (n) facing.push([direction, edgeCategory(n.plan, n.orientation, opposite(direction))]);
      }
      const width = Math.max(maxX, cell.x) - Math.min(minX, cell.x) + 1;
      const height = Math.max(maxY, cell.y) - Math.min(minY, cell.y) + 1;
      const compact = facing.length - 3 * (Math.max(0, width - side) + Math.max(0, height - side)) - 0.5 * Math.abs(width - height);
      for (const plan of BASE_PLAN_CODES) {
        if (left[plan - 1]! <= 0) continue;
        steps += 1;
        const orientations: number[] = [];
        for (let o = 1; o <= 4; o++) if (facing.every(([d, c]) => edgeCategory(plan, o, d) === c)) orientations.push(o);
        if (orientations.length === 0) continue;
        const value = compact + 2 * next();
        if (value > bestValue) {
          bestValue = value;
          best = { x: cell.x, y: cell.y, plan, orientations };
        }
      }
    }
    if (!best) break;
    const orientation = best.orientations[Math.floor(next() * best.orientations.length)]!;
    board.set(key(best.x, best.y), { plan: best.plan, orientation });
    frontier.delete(key(best.x, best.y));
    open(best.x, best.y);
    left[best.plan - 1]! -= 1;
    [minX, maxX, minY, maxY] = [Math.min(minX, best.x), Math.max(maxX, best.x), Math.min(minY, best.y), Math.max(maxY, best.y)];
    tiles.push({ plan: best.plan, orientation, x: best.x, y: best.y });
  }
  return { tiles, steps, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * A random compact layout of `stock` (the player's whole stock by plan, the starter left out: the inventory plus the tiles placed
 * now) within `slots` (the starter included): as many tiles as fit, up to `slots - 1`, in a shape near a square. The same seed
 * and budget always give the same layout, on any machine; another seed, most likely another layout.
 */
export function randomLayout(stock: Inventory, slots: number, seed: number, budget: RandomLayoutBudget = {}): RandomLayout {
  const counts = BASE_PLAN_CODES.map((plan) => Math.max(0, Math.floor(stock[plan - 1] ?? 0)));
  const target = Math.max(0, Math.min(slots - 1, counts.reduce((sum, n) => sum + n, 0)));
  const cells = target + 1;
  const side = Math.ceil(Math.sqrt(cells));
  // The best box there can be: `side` long, as few rows as hold the cells.
  const ideal = [0, side, side * Math.ceil(cells / side) - cells, side - Math.ceil(cells / side)];
  const tries = Math.max(1, Math.floor(budget.tries ?? RANDOM_LAYOUT_TRIES));
  const limit = budget.steps ?? RANDOM_LAYOUT_STEPS;
  let best: { grown: Grown; rank: number[] } | null = null;
  let ran = 0;
  let steps = 0;
  let exhausted = false;
  while (ran < tries) {
    if (ran > 0 && steps >= limit) {
      exhausted = true;
      break;
    }
    const grown = grow(counts, target, side, random(trySeed(seed, ran)));
    ran += 1;
    steps += grown.steps;
    const r = rank(grown, target);
    if (!best || better(r, best.rank)) best = { grown, rank: r };
    if (!better(ideal, best.rank)) break;
  }
  return { tiles: best!.grown.tiles, tries: ran, steps, exhausted };
}
