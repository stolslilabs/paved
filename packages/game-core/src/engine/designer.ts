// The designer's line of a Story level: how the team plays a fixed deck by hand, written down as rules so the line is the
// same each time and anyone can check it. It is the human reference beside the search (`beam.ts`): the target of a long
// level is the higher of the two, and the search starts from it. Offline tool: it stays out of the package index.
//
// The rules, for each tile in hand:
// 1. A placement that scores: take the one that scores most.
// 2. Else keep the board tidy: the placement that leaves the fewest open half-edges, then the one that grows the largest
//    open road or city, then the one nearest the starter.
// 3. A tile that fits nowhere is discarded; a tile that fits is never discarded.

import { CategoryType } from "../types/category";
import type { PlanType } from "../types/plan";
import { EngineGame, type EngineConfig, type Placement } from "./game";
import { distinctPlacements, type SolverMove } from "./solver";

interface Choice {
  readonly placement: Placement;
  readonly points: number;
  readonly open: number;
  readonly largest: number;
  readonly distance: number;
}

function better(a: Choice, b: Choice): boolean {
  if (a.points !== b.points) return a.points > b.points;
  if (a.points > 0) return false;
  if (a.open !== b.open) return a.open < b.open;
  if (a.largest !== b.largest) return a.largest > b.largest;
  return a.distance < b.distance;
}

/** The designer's moves from `start` (not changed) to the end of the game. */
export function designerFrom(start: EngineGame): { score: number; moves: SolverMove[] } {
  const game = start.clone();
  const moves: SolverMove[] = [];
  while (!game.over && game.hand) {
    const plan = game.hand.plan;
    let best: Choice | null = null;
    for (const placement of distinctPlacements(game, plan)) {
      const next = game.clone();
      const points = next.build(placement).points;
      const structures = next.openEdges();
      const choice: Choice = {
        placement,
        points,
        open: structures.reduce((n, s) => n + s.open, 0),
        largest: structures.filter((s) => s.category === CategoryType.Road || s.category === CategoryType.City).reduce((n, s) => Math.max(n, s.size), 0),
        distance: Math.abs(placement.x) + Math.abs(placement.y),
      };
      if (!best || better(choice, best)) best = choice;
    }
    if (best) {
      game.build(best.placement);
      moves.push({ action: "build", plan, placement: best.placement });
    } else {
      game.discard();
      moves.push({ action: "discard", plan });
    }
  }
  return { score: game.score, moves };
}

/** The designer's line of a level: `sequence` is the deck after the starter, in draw order. */
export function designer(sequence: readonly PlanType[], placed?: EngineConfig["placed"]): { score: number; moves: SolverMove[] } {
  return designerFrom(EngineGame.start({ deck: "story", seed: 0n, sequence, placed }));
}
