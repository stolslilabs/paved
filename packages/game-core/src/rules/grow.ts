import { estimate } from "../engine/beam";
import { EngineGame } from "../engine/game";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import { layoutScore, type LayoutTile } from "./free-village";

// A free layout grown by the engine's search (#732, #741): a beam over a set of plans, any of them placed at any legal cell
// at each step (a free village's tiles have no order), ranked by `engine/beam.ts`'s estimate (the score plus what the open
// structures would be worth closed), one node per board. The final layouts are ranked by their canonical score
// (`layoutScore`). Deterministic. Offline tool: the starter layouts (`scripts/v2-layouts.ts`) and the mock's rival villages
// are generated with it; it stays out of the package index (the client never runs it).

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

export interface GrowOptions {
  /** Boards kept per step. */
  readonly width: number;
  /** Children kept per board (default all). */
  readonly perParent?: number;
}

export interface GrownLayout {
  readonly tiles: LayoutTile[];
  readonly score: number;
  /** The plans that found no cell, by code. */
  readonly unplaced: number[];
}

interface Node {
  readonly game: EngineGame;
  readonly tiles: LayoutTile[];
  readonly left: number[];
  readonly value: number;
}

const boardKey = (tiles: readonly LayoutTile[]): string =>
  tiles
    .map((t) => `${t.x},${t.y},${t.plan},${t.orientation}`)
    .sort()
    .join(";");

/** The best layout the beam finds for `plans` (codes, the starter left out). */
export function growLayout(plans: readonly number[], options: GrowOptions): GrownLayout {
  const game = EngineGame.start({ deck: "village", seed: 0n, tileLimit: plans.length + 1 });
  let beam: Node[] = [{ game, tiles: [], left: [...plans], value: estimate(game) }];
  for (let depth = 0; depth < plans.length; depth++) {
    const children: (Node & { parent: Node })[] = [];
    for (const node of beam) {
      for (const plan of new Set(node.left)) {
        for (const p of node.game.legalPlacements(PLANS[plan] as PlanType)) {
          const next = node.game.clone();
          next.place(PLANS[plan] as PlanType, p);
          const left = [...node.left];
          left.splice(left.indexOf(plan), 1);
          const tile = { plan, orientation: ORIENTATIONS.indexOf(p.orientation), x: p.x, y: p.y };
          children.push({ game: next, tiles: [...node.tiles, tile], left, value: estimate(next), parent: node });
        }
      }
    }
    if (children.length === 0) break;
    children.sort((a, b) => b.value - a.value);
    const seen = new Set<string>();
    const kept = new Map<Node, number>();
    const next: Node[] = [];
    for (const child of children) {
      const key = boardKey(child.tiles);
      if (seen.has(key)) continue;
      const siblings = kept.get(child.parent) ?? 0;
      if (siblings >= (options.perParent ?? Number.POSITIVE_INFINITY)) continue;
      seen.add(key);
      kept.set(child.parent, siblings + 1);
      next.push({ game: child.game, tiles: child.tiles, left: child.left, value: child.value });
      if (next.length >= options.width) break;
    }
    beam = next;
  }
  let best: GrownLayout | null = null;
  for (const node of beam) {
    const score = layoutScore(node.tiles);
    if (!best || score > best.score) best = { tiles: node.tiles, score, unplaced: node.left };
  }
  return best!;
}
