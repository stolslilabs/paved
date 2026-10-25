import { EngineGame } from "../engine/game";
import type { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import { BASE_PLAN_CODES, isPlanCode } from "./rarity";

// The free village (PvP v2, #732, owner decisions of 2026-10-24): any connected layout of the tiles a player holds (their
// inventory), rearranged at any time, with no territory and no physical limit. At most `slots` tiles, the starter included
// (`slotsOf`, 8 + level); the starter stays at (0, 0), facing South, and can never be moved. Every facing edge matches.
//
// The score of a layout is the engine's, its tiles built in one canonical order: a breadth-first walk from the starter, the
// neighbours of each tile taken north, east, south, west. A forest scores when it closes with no open road along it, so the
// order of building can change a score; the walk makes it a function of the layout alone (the same tiles at the same cells,
// in any listing order, score the same). The contracts (#733) score a layout the same way.
//
// Plans and orientations are the contracts' codes (plan 1 to 19, orientation 1 north to 4 west); cells are relative to the
// starter, x east, y north.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/** A tile of a layout, the starter left out: plan and orientation codes, its cell. */
export interface LayoutTile {
  readonly plan: number;
  readonly orientation: number;
  readonly x: number;
  readonly y: number;
}

/** The starter: `RFFFRFCFR` (plan 9) facing South (orientation 3) at (0, 0). Never in a layout's list, never moved. */
export const STARTER_TILE: LayoutTile = { plan: 9, orientation: 3, x: 0, y: 0 };

/**
 * The tiles a player holds, by plan: `inventory[plan - 1]` copies of plan `plan` (19 counts). The starter is not in it.
 * A layout places some of them; the rest wait in the inventory.
 */
export type Inventory = readonly number[];

/** Why a layout is refused, in the order it is checked. */
export type LayoutRefusal =
  | "too-many-tiles"
  | "invalid-plan"
  | "invalid-orientation"
  | "starter-cell"
  | "duplicate-cell"
  | "not-held"
  | "not-connected"
  | "cannot-place";

/** What a layout is checked against: the player's slots and inventory. */
export interface LayoutLimits {
  readonly slots: number;
  readonly inventory: Inventory;
}

/** An empty inventory: 0 of each of the 19 plans. */
export const emptyInventory = (): number[] => new Array<number>(BASE_PLAN_CODES.length).fill(0);

/** The inventory of a list of plan codes. */
export function inventoryOf(plans: readonly number[]): number[] {
  const counts = emptyInventory();
  for (const plan of plans) {
    if (!isPlanCode(plan)) throw new Error(`Not a plan code: ${plan}`);
    counts[plan - 1]! += 1;
  }
  return counts;
}

/** The inventory's tiles not placed by `tiles` (never below 0). */
export function freeInventory(inventory: Inventory, tiles: readonly LayoutTile[]): number[] {
  const free = BASE_PLAN_CODES.map((plan) => inventory[plan - 1] ?? 0);
  for (const tile of tiles) if (isPlanCode(tile.plan)) free[tile.plan - 1] = Math.max(0, free[tile.plan - 1]! - 1);
  return free;
}

/** The tiles of an inventory, counted. */
export const inventorySize = (inventory: Inventory): number => inventory.reduce((sum, n) => sum + n, 0);

const key = (x: number, y: number): string => `${x},${y}`;
/** North, east, south, west. */
const SIDES = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;

/**
 * The tiles in the canonical build order, a breadth-first walk from the starter (neighbours north, east, south, west), or
 * null when some tile is not connected to the starter. Duplicate cells and the starter's cell are the caller's to refuse.
 */
export function buildOrder(tiles: readonly LayoutTile[]): LayoutTile[] | null {
  const byCell = new Map(tiles.map((t) => [key(t.x, t.y), t]));
  const order: LayoutTile[] = [];
  const seen = new Set([key(0, 0)]);
  const queue: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  while (queue.length > 0) {
    const at = queue.shift()!;
    for (const [dx, dy] of SIDES) {
      const k = key(at.x + dx, at.y + dy);
      const tile = byCell.get(k);
      if (!tile || seen.has(k)) continue;
      seen.add(k);
      order.push(tile);
      queue.push(tile);
    }
  }
  return order.length === tiles.length ? order : null;
}

/** The starter alone on the engine, with no territory: the board a layout is built on, and an attack is played on. */
export function starterBoard(): EngineGame {
  return EngineGame.start({ deck: "village", seed: 0n });
}

/** Why `tiles` are refused against `limits`, or null: a layout the player may save. */
export function layoutRefusal(tiles: readonly LayoutTile[], limits: LayoutLimits): LayoutRefusal | null {
  if (tiles.length + 1 > limits.slots) return "too-many-tiles";
  const cells = new Set<string>();
  for (const t of tiles) {
    if (!isPlanCode(t.plan)) return "invalid-plan";
    if (!Number.isInteger(t.orientation) || t.orientation < 1 || t.orientation > 4) return "invalid-orientation";
    if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) return "not-connected";
    if (t.x === 0 && t.y === 0) return "starter-cell";
    const k = key(t.x, t.y);
    if (cells.has(k)) return "duplicate-cell";
    cells.add(k);
  }
  const free = BASE_PLAN_CODES.map((plan) => limits.inventory[plan - 1] ?? 0);
  for (const t of tiles) if (--free[t.plan - 1]! < 0) return "not-held";
  return shapeRefusal(tiles);
}

/** The rules of the layout's shape alone (connected, every facing edge matching), with valid codes and cells. */
function shapeRefusal(tiles: readonly LayoutTile[]): "not-connected" | "cannot-place" | null {
  const order = buildOrder(tiles);
  if (!order) return "not-connected";
  const game = starterBoard();
  for (const t of order) {
    if (game.refusal(placementOf(t), PLANS[t.plan] as PlanType) !== null) return "cannot-place";
    game.place(PLANS[t.plan] as PlanType, placementOf(t));
  }
  return null;
}

const placementOf = (t: LayoutTile) => ({ orientation: ORIENTATIONS[t.orientation] as OrientationType, x: t.x, y: t.y });

/** A valid layout on the engine, built in the canonical order; throws with the refusal for one that is not connected or does not fit. */
export function layoutGame(tiles: readonly LayoutTile[]): EngineGame {
  const order = buildOrder(tiles);
  if (!order) throw new Error("Layout: not-connected");
  const game = starterBoard();
  for (const t of order) {
    if (!isPlanCode(t.plan)) throw new Error("Layout: invalid-plan");
    if (game.refusal(placementOf(t), PLANS[t.plan] as PlanType) !== null) throw new Error("Layout: cannot-place");
    game.place(PLANS[t.plan] as PlanType, placementOf(t));
  }
  return game;
}

/** The score of a valid layout: its tiles built in the canonical order. */
export function layoutScore(tiles: readonly LayoutTile[]): number {
  return layoutGame(tiles).score;
}

/** A structure's areas on one of its tiles, by cell: a mask, bit `area - 1` (the form the renderer's `setLitAreas` takes). */
export interface CellAreas {
  readonly x: number;
  readonly y: number;
  readonly areas: number;
}

/** One line of a layout's points (#758): a structure the layout scored, as a game's score screen lists its closings. */
export interface LayoutLine {
  /** The structure, the same for the same structure in another layout (its category and its areas on their cells). */
  readonly key: string;
  readonly category: CategoryType;
  readonly points: number;
  /** Its distinct tiles (a wonder's: the wonder and the tiles around it). */
  readonly tiles: number;
  /** Its nodes, the areas it spans (the bonus's size). */
  readonly size: number;
  /** Its areas on each of its tiles, by cell, in cell order. */
  readonly areas: readonly CellAreas[];
}

/** A layout's points by structure: `lines`, the most points first, and `other`, the points no structure holds; they add up to `score`. */
export interface LayoutBreakdown {
  readonly lines: readonly LayoutLine[];
  readonly other: number;
  readonly score: number;
}

/**
 * The points of a built village by structure (#758): every structure it scored (`closings()`, a forest closed at 0 included),
 * with its areas by cell, the most points first (the build's order on a tie). Open structures score nothing and are left out.
 * Whatever the score holds that no structure does is `other` (none in a layout: nothing is discarded), so the lines and `other`
 * add up to the score exactly.
 */
export function breakdownOf(game: EngineGame): LayoutBreakdown {
  const cells = new Map(game.placed().map((t) => [t.id, t]));
  const lines = game.closings().map((c): LayoutLine => {
    const areas = (c.areas ?? [])
      .flatMap(({ tileId, areas }) => {
        const tile = cells.get(tileId);
        return tile ? [{ x: tile.x, y: tile.y, areas }] : [];
      })
      .sort((a, b) => a.x - b.x || a.y - b.y);
    return {
      key: `${c.category}:${areas.map((a) => `${a.x},${a.y},${a.areas}`).join(";")}`,
      category: c.category,
      points: c.points,
      tiles: c.tiles,
      size: c.size,
      areas,
    };
  });
  const sorted = lines.map((line, i) => ({ line, i })).sort((a, b) => b.line.points - a.line.points || a.i - b.i).map((x) => x.line);
  const listed = lines.reduce((sum, l) => sum + l.points, 0);
  return { lines: sorted, other: game.score - listed, score: game.score };
}

/** A valid layout's points by structure (`breakdownOf` its canonical build): the lines add up to `layoutScore(tiles)`. */
export function layoutBreakdown(tiles: readonly LayoutTile[]): LayoutBreakdown {
  return breakdownOf(layoutGame(tiles));
}

/** Whether two layouts hold the same tiles at the same cells, in any order. */
export function sameLayout(a: readonly LayoutTile[], b: readonly LayoutTile[]): boolean {
  if (a.length !== b.length) return false;
  const cells = new Map(a.map((t) => [key(t.x, t.y), t]));
  return b.every((t) => {
    const other = cells.get(key(t.x, t.y));
    return other !== undefined && other.plan === t.plan && other.orientation === t.orientation;
  });
}

/** Why the editor refuses a change: a layout refusal, or a cell with no tile to lift, or the starter. */
export type DraftRefusal = LayoutRefusal | "no-tile" | "starter";

/**
 * A layout being edited (#739's editor): each change is checked as a whole layout, so the draft is valid at every step (it never
 * splits, never holds more than the slots or the inventory, never mismatches an edge). It is local; saving sends `tiles`.
 */
export class VillageDraft {
  private list: LayoutTile[];
  private game: EngineGame;

  constructor(
    private readonly limits: LayoutLimits,
    tiles: readonly LayoutTile[] = [],
  ) {
    const refused = layoutRefusal(tiles, limits);
    if (refused) throw new Error(`Layout: ${refused}`);
    this.list = tiles.map((t) => ({ ...t }));
    this.game = layoutGame(this.list);
  }

  get tiles(): readonly LayoutTile[] {
    return this.list;
  }

  /** The layout's score, as it would be saved. */
  get score(): number {
    return this.game.score;
  }

  /** The tiles placed, the starter included, and the slots. */
  get used(): number {
    return this.list.length + 1;
  }

  get slots(): number {
    return this.limits.slots;
  }

  /** The inventory left to place. */
  get free(): number[] {
    return freeInventory(this.limits.inventory, this.list);
  }

  /** The tile at a cell (the starter at (0, 0)), or null. */
  tileAt(x: number, y: number): LayoutTile | null {
    if (x === 0 && y === 0) return STARTER_TILE;
    return this.list.find((t) => t.x === x && t.y === y) ?? null;
  }

  /** Every cell and orientation code where `plan` fits now (next to a tile, every facing edge matching). */
  placements(plan: number): LayoutTile[] {
    if (!isPlanCode(plan)) return [];
    return this.game.legalPlacements(PLANS[plan] as PlanType).map((p) => ({ plan, orientation: ORIENTATIONS.indexOf(p.orientation), x: p.x, y: p.y }));
  }

  /** Why placing `tile` is refused, or null. */
  placeRefusal(tile: LayoutTile): DraftRefusal | null {
    return layoutRefusal([...this.list, tile], this.limits);
  }

  /** Places a tile from the inventory. */
  place(tile: LayoutTile): void {
    this.commit([...this.list, { ...tile }], this.placeRefusal(tile));
  }

  /** Why the tile at `cell` cannot be sent back to the inventory (or lifted to move it), or null: the starter, no tile, a split. */
  liftRefusal(x: number, y: number): DraftRefusal | null {
    if (x === 0 && y === 0) return "starter";
    if (!this.list.some((t) => t.x === x && t.y === y)) return "no-tile";
    return buildOrder(this.without(x, y)) ? null : "not-connected";
  }

  /** Sends the tile at `cell` back to the inventory; returns it. */
  lift(x: number, y: number): LayoutTile {
    const refused = this.liftRefusal(x, y);
    if (refused) throw new Error(`Layout: ${refused}`);
    const tile = this.tileAt(x, y)!;
    this.commit(this.without(x, y), null);
    return tile;
  }

  /** Why the tile at `from` cannot go to `to` turned to `orientation` (the same cell: a rotation in place), or null. */
  moveRefusal(from: { x: number; y: number }, to: { x: number; y: number; orientation: number }): DraftRefusal | null {
    if (from.x === 0 && from.y === 0) return "starter";
    const tile = this.list.find((t) => t.x === from.x && t.y === from.y);
    if (!tile) return "no-tile";
    return layoutRefusal([...this.without(from.x, from.y), { plan: tile.plan, orientation: to.orientation, x: to.x, y: to.y }], this.limits);
  }

  /** Moves or turns the tile at `from`. */
  move(from: { x: number; y: number }, to: { x: number; y: number; orientation: number }): void {
    const refused = this.moveRefusal(from, to);
    const tile = this.list.find((t) => t.x === from.x && t.y === from.y);
    this.commit(tile ? [...this.without(from.x, from.y), { plan: tile.plan, orientation: to.orientation, x: to.x, y: to.y }] : this.list, refused);
  }

  /** Every tile back to the inventory: the starter alone. */
  reset(): void {
    this.commit([], null);
  }

  private without(x: number, y: number): LayoutTile[] {
    return this.list.filter((t) => t.x !== x || t.y !== y);
  }

  private commit(tiles: LayoutTile[], refused: DraftRefusal | null): void {
    if (refused) throw new Error(`Layout: ${refused}`);
    this.game = layoutGame(tiles);
    this.list = tiles;
  }
}
