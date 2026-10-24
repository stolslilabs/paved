import type { BoardTile } from "@paved/chain";
import { SIDES, cellKey, edgeOf, type Cell } from "./layout-rules";

/**
 * The v1 village's rules on the client's side (#646, part of #637), for the stories' fakes and the reward's placement until
 * the v2 contracts replace them (#733): the v2 village's own rules are `layout-rules.ts` (#739). The parcels, the copies and
 * the tiers left the client with v2; the territory stays until the wiring, as the reward's tile still goes on an owned cell.
 *
 * - A village is a set of owned cells (connected, the 9 of the start on a fresh one) and the tiles placed on them.
 * - No border rule: a side that faces a cell not owned, or a free one, stays open. Two placed tiles side by side share the
 *   category of their facing edges, as on the board.
 * - The fog in the plan view: clear over the owned cells and their neighbours.
 */

export { cellKey, edgeOf, type Cell };

/** A player's village: the owned cells and the tiles placed on them (the board's own tile type), the score. */
export interface Village {
  /** Its owner's name, as the profile shows it. */
  owner: string;
  /** The owner's level (#641). */
  level: number;
  cells: readonly Cell[];
  tiles: readonly BoardTile[];
  /** The village's score (#640): what an attacker plays against. */
  score: number;
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

/**
 * Whether `plan` turned to `orientation` may go on `cell`, as `Village.place` rules it: an owned free cell next to a placed
 * tile (a chain village always holds its starter; an empty one, the stories' fakes, takes a first tile anywhere), whose placed
 * neighbours share each facing edge. A test checks it against game-core's engine.
 */
export function fits(village: Pick<Village, "cells" | "tiles">, plan: number, orientation: number, cell: Cell): boolean {
  if (!village.cells.some((c) => c.x === cell.x && c.y === cell.y)) return false;
  const byCell = new Map(village.tiles.map((t) => [cellKey(t), t]));
  if (byCell.has(cellKey(cell))) return false;
  let neighbours = 0;
  const matches = SIDES.every(([dx, dy], side) => {
    const n = byCell.get(cellKey({ x: cell.x + dx, y: cell.y + dy }));
    if (n) neighbours += 1;
    return !n || edgeOf(plan, orientation, side) === edgeOf(n.plan, n.orientation, (side + 2) % 4);
  });
  return matches && (neighbours > 0 || village.tiles.length === 0);
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

/** The orientation a tile dropped on `cell` takes: the one shown if it fits there, else the first that does; null when none. */
export function dropOrientation(village: Pick<Village, "cells" | "tiles">, plan: number, orientation: number, cell: Cell): number | null {
  if (fits(village, plan, orientation, cell)) return orientation;
  return orientationsAt(village, plan, cell)[0] ?? null;
}
