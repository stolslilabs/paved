import type { EngineGame } from "../engine/game";
import type { CategoryType } from "../types/category";
import { layoutGame, type LayoutTile } from "./free-village";

// A layout's points by structure (#758), apart from `free-village.ts` so that only the pages that list them carry it.

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
