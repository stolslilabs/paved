import type { BoardTile } from "@paved/chain";
import { EngineGame, layoutScore as coreLayoutScore } from "@paved/game-core";
import { planCode } from "../elements/tile-chip";
import { STARTER, isStarter } from "./layout-starter";

/**
 * The v2 village's rules on the client's side (#739, part of #732), for the stories' fakes until the contracts give them
 * (#733: the inventory, the free layout and the slots; #736: the chests; #737: the shop). The wiring reads the contracts'
 * answers and keeps these shapes; nothing here is the source of truth.
 *
 * - A village is a free layout of the player's collected tiles: any cells, no territory, rearranged at any time.
 * - Its tiles are capped by the slots unlocked: 8 + level (level 1 is 9 slots, level 20 is 28). The starter takes one.
 * - A layout is valid when every tile is joined to the starter (connected) and every pair of facing edges matches. The
 *   editor keeps it valid at every step (the owner's decisions of #739): a tile goes only on a legal cell, as on the board
 *   (next to a placed tile, every facing edge matching), and a tile whose removal would split the village cannot be lifted.
 * - The starter stays: at (0, 0), facing South, never selected, moved, turned or sent back.
 */

export interface Cell {
  x: number;
  y: number;
}

export const cellKey = (c: Cell) => `${c.x},${c.y}`;

/** The last level for now (#732: it can only be raised later). */
export const MAX_LEVEL = 20;
/** The slots of level 0's: a level adds one (`slots = 8 + level`). */
export const BASE_SLOTS = 8;

/** The slots a level unlocks: `8 + level`, the level held between 1 and `MAX_LEVEL`. */
export const slotsFor = (level: number): number => BASE_SLOTS + Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));

export { STARTER, isStarter } from "./layout-starter";

/** A player's v2 village: its saved layout (the starter included), the owner's level, the score an attacker plays against. */
export interface VillageLayout {
  owner: string;
  level: number;
  tiles: readonly BoardTile[];
  score: number;
}

/** The collected tiles not in the saved layout, a count per chain plan id. */
export type Inventory = Readonly<Record<number, number>>;

/** North, east, south, west: the order of a tile's edges after its orientation's quarter turns. */
export const SIDES = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/** The letters of a plan's edges in its nine (Center, NW, N, NE, E, SE, S, SW, W): N, E, S, W. */
const EDGE_LETTERS = [2, 4, 6, 8] as const;

/** The category letter of the edge of `plan` turned to `orientation` (1 north to 4 west, a quarter turn clockwise each) facing side `side` (0 north to 3 west). */
export function edgeOf(plan: number, orientation: number, side: number): string {
  const turned = (side - (orientation - 1) + 8) % 4;
  return planCode(plan)[EDGE_LETTERS[turned]!] ?? "";
}

/** A faulty edge: the tile at `cell` and its neighbour on `side` (0 north, 1 east) show different categories there. */
export interface Fault {
  cell: Cell;
  side: 0 | 1;
}

/** The pairs of facing edges that differ, each once (from the tile to the south or west of the pair). */
export function faultsOf(tiles: readonly BoardTile[]): Fault[] {
  const byCell = new Map(tiles.map((t) => [cellKey(t), t]));
  const out: Fault[] = [];
  for (const t of tiles) {
    for (const side of [0, 1] as const) {
      const [dx, dy] = SIDES[side];
      const n = byCell.get(cellKey({ x: t.x + dx, y: t.y + dy }));
      if (n && edgeOf(t.plan, t.orientation, side) !== edgeOf(n.plan, n.orientation, (side + 2) % 4)) out.push({ cell: { x: t.x, y: t.y }, side });
    }
  }
  return out;
}

/** The tiles not joined to the starter by a chain of neighbours (all of them when the starter is missing). */
export function detachedOf(tiles: readonly BoardTile[]): BoardTile[] {
  const byCell = new Map(tiles.map((t) => [cellKey(t), t]));
  const start = tiles.find(isStarter);
  const seen = new Set<string>();
  const queue: Cell[] = start ? [start] : [];
  if (start) seen.add(cellKey(start));
  while (queue.length) {
    const c = queue.pop()!;
    for (const [dx, dy] of SIDES) {
      const k = cellKey({ x: c.x + dx, y: c.y + dy });
      if (!seen.has(k) && byCell.has(k)) {
        seen.add(k);
        queue.push(byCell.get(k)!);
      }
    }
  }
  return tiles.filter((t) => !seen.has(cellKey(t)));
}

/** What a layout's check says: its faults, its tiles cut off from the starter, the tiles past the slots, and whether it can be saved. */
export interface LayoutCheck {
  faults: Fault[];
  detached: BoardTile[];
  /** The tiles placed, the starter included. */
  used: number;
  slots: number;
  /** The tiles past the slots (0 within them). */
  over: number;
  starter: boolean;
  valid: boolean;
}

export function checkLayout(tiles: readonly BoardTile[], slots: number): LayoutCheck {
  const faults = faultsOf(tiles);
  const detached = detachedOf(tiles);
  const starter = tiles.some((t) => isStarter(t) && t.x === STARTER.x && t.y === STARTER.y && t.orientation === STARTER.orientation);
  const over = Math.max(0, tiles.length - slots);
  return { faults, detached, used: tiles.length, slots, over, starter, valid: starter && faults.length === 0 && detached.length === 0 && over === 0 };
}

/** Why a layout cannot be saved, in words (the starter and the slots first, then every fault there is); null when it can. */
export function layoutProblem(check: LayoutCheck): string | null {
  if (!check.starter) return "The starter is missing.";
  if (check.over > 0) return `${check.over} ${check.over === 1 ? "tile" : "tiles"} past your slots: take ${check.over === 1 ? "it" : "them"} off.`;
  const parts: string[] = [];
  if (check.detached.length > 0) parts.push(`${check.detached.length} ${check.detached.length === 1 ? "tile is" : "tiles are"} cut off from the starter`);
  if (check.faults.length > 0) parts.push(`${check.faults.length} ${check.faults.length === 1 ? "edge does" : "edges do"} not match`);
  return parts.length ? `${parts.join("; ")}.` : null;
}

/** A cell where a plan can go, with the orientations that fit there (1 north to 4 west). */
export type Spot = Cell & { orientations: number[] };

/** The empty cells next to the layout's tiles, nearest the centre first, north before south, east before west. */
export function frontier(tiles: readonly BoardTile[]): Cell[] {
  const taken = new Set(tiles.map(cellKey));
  const out = new Map<string, Cell>();
  for (const t of tiles) {
    for (const [dx, dy] of SIDES) {
      const c = { x: t.x + dx, y: t.y + dy };
      if (!taken.has(cellKey(c))) out.set(cellKey(c), c);
    }
  }
  return [...out.values()].sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y)) || b.y - a.y || b.x - a.x);
}

/** The orientations of `plan` at `cell` whose edges match every placed neighbour. */
export function fittingAt(tiles: readonly BoardTile[], plan: number, cell: Cell): number[] {
  const byCell = new Map(tiles.map((t) => [cellKey(t), t]));
  return [1, 2, 3, 4].filter((o) =>
    SIDES.every(([dx, dy], side) => {
      const n = byCell.get(cellKey({ x: cell.x + dx, y: cell.y + dy }));
      return !n || edgeOf(plan, o, side) === edgeOf(n.plan, n.orientation, (side + 2) % 4);
    }),
  );
}

/** The legal cells of `plan`, as the board's plates: next to a placed tile, with an orientation whose every facing edge matches. */
export function legalSpots(tiles: readonly BoardTile[], plan: number): Spot[] {
  return frontier(tiles)
    .map((c) => ({ ...c, orientations: fittingAt(tiles, plan, c) }))
    .filter((c) => c.orientations.length > 0);
}

/** Whether tile `id` can be lifted: not the starter, and the others stay joined to the starter without it. */
export function canLift(tiles: readonly BoardTile[], id: number): boolean {
  const tile = tiles.find((t) => t.id === id);
  if (!tile || isStarter(tile)) return false;
  return detachedOf(tiles.filter((t) => t.id !== id)).length === 0;
}

/**
 * A layout's score, game-core's (`layoutScore` of the v2 rules, #741): its tiles built in the canonical order, the starter left
 * out of the list, so the editor's live score is the one saved and attacked. A layout the rules refuse (a story's fake) falls
 * back to the engine's rebuild from the starter (`EngineGame.villageOf`).
 */
export function layoutScore(tiles: readonly BoardTile[]): number {
  try {
    return coreLayoutScore(tiles.filter((t) => !isStarter(t)));
  } catch {
    return EngineGame.villageOf({ territory: tiles.map((t) => ({ x: t.x, y: t.y })), tiles }).score;
  }
}

/** The plan counts of a set of tiles. */
export function countPlans(tiles: readonly Pick<BoardTile, "plan">[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const t of tiles) out[t.plan] = (out[t.plan] ?? 0) + 1;
  return out;
}

/**
 * The tray while editing: the inventory, plus the saved layout's tiles, less the draft's, per plan (the starter is no
 * inventory tile). A plan at 0 stays listed once owned.
 */
export function trayOf(inventory: Inventory, saved: readonly BoardTile[], draft: readonly BoardTile[]): Record<number, number> {
  const out: Record<number, number> = { ...inventory };
  for (const t of saved) if (!isStarter(t)) out[t.plan] = (out[t.plan] ?? 0) + 1;
  for (const t of draft) if (!isStarter(t)) out[t.plan] = (out[t.plan] ?? 0) - 1;
  return out;
}

/** The draft with `plan` placed at `cell` (a free cell), its id the next one. */
export function placeTile(tiles: readonly BoardTile[], plan: number, orientation: number, cell: Cell): BoardTile[] {
  if (tiles.some((t) => t.x === cell.x && t.y === cell.y)) return [...tiles];
  const id = Math.max(STARTER.id, ...tiles.map((t) => t.id)) + 1;
  return [...tiles, { id, plan, orientation, x: cell.x, y: cell.y }];
}

/** The draft with tile `id` taken off (back to the inventory). The starter stays. */
export function takeOffTile(tiles: readonly BoardTile[], id: number): BoardTile[] {
  return tiles.filter((t) => t.id !== id || isStarter(t));
}

/** Whether two layouts hold the same tiles at the same cells and orientations (ids aside). */
export function sameLayout(a: readonly BoardTile[], b: readonly BoardTile[]): boolean {
  if (a.length !== b.length) return false;
  const key = (t: BoardTile) => `${t.x},${t.y},${t.plan},${t.orientation}`;
  const keys = new Set(a.map(key));
  return b.every((t) => keys.has(key(t)));
}

/** The PvP chests a day (#732): at most 3. */
export const PVP_CHESTS_A_DAY = 3;

/** The shop's offers a day (#732): 3 base plans, each bought once. */
export const SHOP_OFFERS = 3;
