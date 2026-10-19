// The figures of a game's end (#539): its closings summed per category, the largest of each in tiles, the most valuable,
// the tiles placed and discarded, and what was left unscored. Pure: read from an `EngineGame`, nothing played; Training,
// Challenge (a replay of its tiles) and Story mode read the same figures.

import { CategoryType } from "../types/category";
import type { ClosedStructure, EngineGame, OpenStructure } from "./game";

/** The categories that score, in the order the score screen lists them. */
export const SCORING_CATEGORIES = [CategoryType.Road, CategoryType.City, CategoryType.Forest, CategoryType.Wonder] as const;
export type ScoringCategory = (typeof SCORING_CATEGORIES)[number];

export interface CategoryStats {
  readonly category: ScoringCategory;
  /** Structures of the category scored (a D-19 tie included, at 0 points). */
  readonly closed: number;
  readonly points: number;
  /** The closed one with the most tiles (more points, then the first closed, on a tie); null when none closed. */
  readonly largest: ClosedStructure | null;
  /** Structures of the category left unscored at the end. */
  readonly open: number;
}

export interface GameStats {
  readonly score: number;
  /** Tiles placed by a move: the starter and a story's `placed` are not counted. */
  readonly placed: number;
  readonly discarded: number;
  /** The points the discards took (each at most the score then). */
  readonly discardPenalty: number;
  /** Per scoring category, in `SCORING_CATEGORIES` order. */
  readonly categories: readonly CategoryStats[];
  /** Every structure scored, in move order. */
  readonly closings: readonly ClosedStructure[];
  /** The closing worth the most points (the first on a tie); null when nothing scored. */
  readonly best: ClosedStructure | null;
  /** Structures left unscored at the end, and the one with the most tiles. */
  readonly open: { readonly count: number; readonly largest: OpenStructure | null };
}

/** The larger of two structures by tiles, then points; `a`, the earlier, on a tie. */
function larger<T extends { tiles: number; points?: number }>(a: T | null, b: T): T {
  if (!a) return b;
  if (b.tiles !== a.tiles) return b.tiles > a.tiles ? b : a;
  return (b.points ?? 0) > (a.points ?? 0) ? b : a;
}

/** The figures of `game` as it stands (over or not). Holds no reference to the engine's state that a later move changes. */
export function gameStats(game: EngineGame): GameStats {
  const closings = [...game.closings()];
  const open = game.openStructures();
  const categories = SCORING_CATEGORIES.map((category): CategoryStats => {
    const of = closings.filter((c) => c.category === category);
    return {
      category,
      closed: of.length,
      points: of.reduce((sum, c) => sum + c.points, 0),
      largest: of.reduce<ClosedStructure | null>(larger, null),
      open: open.filter((s) => s.category === category).length,
    };
  });
  return {
    score: game.score,
    placed: game.built,
    discarded: game.discarded,
    discardPenalty: game.discardPenalty,
    categories,
    closings,
    best: closings.reduce<ClosedStructure | null>((best, c) => (!best || c.points > best.points ? c : best), null),
    open: { count: open.length, largest: open.reduce<OpenStructure | null>(larger, null) },
  };
}
