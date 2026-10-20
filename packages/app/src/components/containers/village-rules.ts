import type { BoardTile } from "@paved/chain";
import { planCode } from "../elements/tile-chip";

/**
 * The village's rules on the client's side (#646, part of #637), for the stories' fakes until the contracts give them
 * (#640: the territory, placement and score; #642: the rewards and the tiers). The wiring reads the contracts' answers and
 * keeps these shapes; nothing here is the source of truth.
 *
 * - A village is a set of owned cells (connected, at most 38, the length of a game) and the tiles placed on them.
 * - No border rule: a side that faces a cell not owned, or a free one, stays open. Two placed tiles side by side share the
 *   category of their facing edges, as on the board.
 * - A parcel is a cell next to the village, bought one at a time.
 * - The fog (#633's village variant): clear over the owned cells and their neighbours, the cells that can be bought.
 * - A plan's tier counts its copies for the account (open point 5 of #637, proposed): 1, 2, 4, 8, 16 copies.
 */

/** The most cells a village owns: the length of a game (#637). */
export const MAX_CELLS = 38;

export interface Cell {
  x: number;
  y: number;
}

/** A player's village: the owned cells and the tiles placed on them (the board's own tile type), the copies per plan, the score. */
export interface Village {
  /** Its owner's name, as the profile shows it. */
  owner: string;
  /** The owner's level (#641): it gates the parcels. */
  level: number;
  cells: readonly Cell[];
  tiles: readonly BoardTile[];
  /** The copies of each plan the account holds, by chain plan id (placed tiles and copies added): its tier. */
  copies: Readonly<Record<number, number>>;
  /** The village's score (#640): what an attacker plays against. */
  score: number;
}

/** The tiers, a base under the tile whatever its skin (#637): two of a tier make one of the next. More may come. */
export const TIERS = [
  { name: "Dirt", copies: 1 },
  { name: "Silver", copies: 2 },
  { name: "Gold", copies: 4 },
  { name: "Diamond", copies: 8 },
  { name: "Ruby", copies: 16 },
] as const;

export type Tier = 0 | 1 | 2 | 3 | 4;

/** The tier of a plan held in `copies` copies: the highest whose count it reaches (Dirt for one or none). */
export function tierOf(copies: number): Tier {
  let tier = 0;
  for (let i = 0; i < TIERS.length; i++) if (copies >= TIERS[i]!.copies) tier = i;
  return tier as Tier;
}

export interface TierProgress {
  tier: Tier;
  /** The next tier, or null at the last. */
  next: Tier | null;
  copies: number;
  /** The copies the next tier needs (its count), or null at the last. */
  need: number | null;
}

/** A plan's way to its next tier: "3 of 4 copies to Gold". */
export function tierProgress(copies: number): TierProgress {
  const tier = tierOf(copies);
  const next = tier + 1 < TIERS.length ? ((tier + 1) as Tier) : null;
  return { tier, next, copies, need: next === null ? null : TIERS[next].copies };
}

export const cellKey = (c: Cell) => `${c.x},${c.y}`;

/** North, east, south, west: the order of `SIDES` matches a tile's edges after its orientation's quarter turns. */
const SIDES = [
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

/** The cells next to the village not owned yet: the parcels that can be bought (none once it holds `MAX_CELLS`). */
export function buyableCells(cells: readonly Cell[]): Cell[] {
  if (cells.length >= MAX_CELLS) return [];
  const owned = new Set(cells.map(cellKey));
  const out = new Map<string, Cell>();
  for (const c of cells) {
    for (const [dx, dy] of SIDES) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (!owned.has(cellKey(n))) out.set(cellKey(n), n);
    }
  }
  return [...out.values()].sort((a, b) => b.y - a.y || a.x - b.x);
}

/** The cells the fog leaves clear: the owned ones and their neighbours (#633's village variant), as keys. */
export function clearCells(cells: readonly Cell[]): Set<string> {
  const clear = new Set(cells.map(cellKey));
  for (const c of cells) for (const [dx, dy] of SIDES) clear.add(cellKey({ x: c.x + dx, y: c.y + dy }));
  return clear;
}

/** The owned cells with no tile. */
export function freeCells(village: Pick<Village, "cells" | "tiles">): Cell[] {
  const taken = new Set(village.tiles.map(cellKey));
  return village.cells.filter((c) => !taken.has(cellKey(c)));
}

/** Whether `plan` turned to `orientation` may go on `cell`: an owned free cell whose placed neighbours share each facing edge. */
export function fits(village: Pick<Village, "cells" | "tiles">, plan: number, orientation: number, cell: Cell): boolean {
  if (!village.cells.some((c) => c.x === cell.x && c.y === cell.y)) return false;
  const byCell = new Map(village.tiles.map((t) => [cellKey(t), t]));
  if (byCell.has(cellKey(cell))) return false;
  return SIDES.every(([dx, dy], side) => {
    const n = byCell.get(cellKey({ x: cell.x + dx, y: cell.y + dy }));
    return !n || edgeOf(plan, orientation, side) === edgeOf(n.plan, n.orientation, (side + 2) % 4);
  });
}

/** The orientations of `plan` that fit `cell`, in order (1 north to 4 west). */
export function orientationsAt(village: Pick<Village, "cells" | "tiles">, plan: number, cell: Cell): number[] {
  return [1, 2, 3, 4].filter((o) => fits(village, plan, o, cell));
}

export type LegalCell = Cell & { orientations: number[] };

/** The free owned cells where some orientation of `plan` fits: where the reward's tile can go. */
export function legalCells(village: Pick<Village, "cells" | "tiles">, plan: number): LegalCell[] {
  return freeCells(village)
    .map((c) => ({ ...c, orientations: orientationsAt(village, plan, c) }))
    .filter((c) => c.orientations.length > 0);
}

/** The placed tiles of `plan`: dropping the reward's tile on one adds a copy to the plan instead of placing it. */
export function copyTargets(village: Pick<Village, "tiles">, plan: number): BoardTile[] {
  return village.tiles.filter((t) => t.plan === plan);
}

/** The orientation a tile dropped on `cell` takes: the one shown if it fits there, else the first that does; null when none. */
export function dropOrientation(village: Pick<Village, "cells" | "tiles">, plan: number, orientation: number, cell: Cell): number | null {
  if (fits(village, plan, orientation, cell)) return orientation;
  return orientationsAt(village, plan, cell)[0] ?? null;
}
