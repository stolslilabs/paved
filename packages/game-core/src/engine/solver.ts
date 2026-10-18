// The optimum of a Story level: an exhaustive search over the moves of a fixed deck (every legal
// cell and rotation of the tile in hand, or a discard), on the engine itself so the scores are the
// game's. Rotations that leave the tile looking the same are searched once. Offline tool: it
// stays out of the package index (the client never runs it).

import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import { EngineGame, type Placement } from "./game";
import { areaAt } from "./geometry";

export type SolverMove =
  | { readonly action: "build"; readonly plan: PlanType; readonly placement: Placement }
  | { readonly action: "discard"; readonly plan: PlanType };

export interface Solution {
  /** The best final score. */
  readonly optimum: number;
  /** One sequence of moves that reaches it (the first found), in play order. */
  readonly moves: readonly SolverMove[];
  /** Positions visited, the root included. */
  readonly nodes: number;
}

const ORIENTATIONS = Object.values(OrientationType);
const PLANS = Object.values(PlanType);

/** What the player sees of a placed plan: the area each of the 9 spots belongs to, renamed in order. */
function look(plan: number, orientation: number): string {
  const names = new Map<number, number>();
  const labels: number[] = [];
  for (let spot = 1; spot <= 9; spot++) {
    const area = areaAt(plan, orientation, spot);
    if (!names.has(area)) names.set(area, names.size);
    labels.push(names.get(area) as number);
  }
  return labels.join("");
}

/** The legal placements of the tile in hand, once per distinct look: those worth trying. */
function distinctPlacements(game: EngineGame, plan: PlanType): Placement[] {
  const seen = new Set<string>();
  const kept: Placement[] = [];
  const planCode = PLANS.indexOf(plan);
  for (const placement of game.legalPlacements()) {
    const key = `${placement.x},${placement.y},${look(planCode, ORIENTATIONS.indexOf(placement.orientation))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(placement);
  }
  return kept;
}

export interface SolveOptions {
  /** Search discards too (default). Off, the optimum is that of a player who never discards. */
  readonly discards?: boolean;
}

/** Solves a level: `sequence` is the deck after the starter, in draw order. */
export function solve(sequence: readonly PlanType[], options: SolveOptions = {}): Solution {
  let nodes = 0;
  let best = -1;
  let bestMoves: SolverMove[] = [];
  const path: SolverMove[] = [];

  const visit = (game: EngineGame): void => {
    nodes += 1;
    if (game.over || !game.hand) {
      if (game.score > best) {
        best = game.score;
        bestMoves = [...path];
      }
      return;
    }
    const plan = game.hand.plan;
    const placements = distinctPlacements(game, plan);
    for (const placement of placements) {
      const next = game.clone();
      next.build(placement);
      path.push({ action: "build", plan, placement });
      visit(next);
      path.pop();
    }
    // A build never takes points, so on the last tile a discard only matters when nothing fits
    const last = game.tileCount >= game.tileLimit;
    if (options.discards === false && placements.length > 0) return;
    if (last && placements.length > 0) return;
    const next = game.clone();
    next.discard();
    path.push({ action: "discard", plan });
    visit(next);
    path.pop();
  };

  visit(EngineGame.start({ deck: "story", seed: 0n, sequence }));
  return { optimum: best, moves: bestMoves, nodes };
}

/** The 2-star threshold: 70 % of the optimum, rounded up (integer arithmetic). */
export function twoStarThreshold(optimum: number): number {
  return Math.ceil((optimum * 70) / 100);
}
