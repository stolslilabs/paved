import type { BoardTile } from "@paved/chain";
import { planCode } from "../elements/tile-chip";

/**
 * The v2 village's rules on the client's side (#739, part of #732), for the stories' fakes until the contracts give them
 * (#733: the inventory, the free layout and the slots; #736: the chests; #737: the shop). The wiring reads the contracts'
 * answers and keeps these shapes; nothing here is the source of truth.
 *
 * - A village is a free layout of the player's collected tiles: any cells, no territory, rearranged at any time.
 * - Its tiles are capped by the slots unlocked: 8 + level (level 1 is 9 slots, level 20 is 28). The starter takes one.
 * - A layout is saved only when valid: every tile joined to the starter (connected), every pair of facing edges matched.
 *   While editing, any state is allowed, and the faults are shown.
 * - The starter stays: at (0, 0), facing South, never moved, turned or taken off.
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

/** The starter (`RFFFRFCFR` facing South at (0, 0), id 1): every village has it, and it stays. */
export const STARTER: BoardTile = { id: 1, plan: 9, orientation: 3, x: 0, y: 0 };
export const isStarter = (tile: Pick<BoardTile, "id">): boolean => tile.id === STARTER.id;

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

/** The draft with tile `id` moved to `cell`; onto another tile, the two swap. The starter stays. */
export function moveTile(tiles: readonly BoardTile[], id: number, cell: Cell): BoardTile[] {
  const tile = tiles.find((t) => t.id === id);
  if (!tile || isStarter(tile)) return [...tiles];
  const other = tiles.find((t) => t.x === cell.x && t.y === cell.y && t.id !== id);
  if (other && isStarter(other)) return [...tiles];
  return tiles.map((t) => (t.id === id ? { ...t, x: cell.x, y: cell.y } : other && t.id === other.id ? { ...t, x: tile.x, y: tile.y } : t));
}

/** The draft with tile `id` turned a quarter clockwise. The starter stays. */
export function rotateTile(tiles: readonly BoardTile[], id: number): BoardTile[] {
  return tiles.map((t) => (t.id === id && !isStarter(t) ? { ...t, orientation: (t.orientation % 4) + 1 } : t));
}

/** The draft with tile `id` taken off (back to the tray). The starter stays. */
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
