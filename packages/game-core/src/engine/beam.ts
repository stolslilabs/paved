// The best known score of a long Story level: a beam search over the moves of a fixed deck, on the
// engine itself (`solver.ts` is exhaustive and stops being practical above six drawn tiles). At each
// draw every kept position tries every legal cell and rotation of the tile in hand, and a discard;
// the children are ranked by their score plus an estimate of their open structures, and the best
// `width` are kept. The last draw ranks by the real score, and the last `tail` draws can be solved
// exactly from the best positions. A seed line (the designer's) is kept in the beam at every draw, so
// the search never ends below it. Deterministic: the same options give the same line. Offline tool:
// it stays out of the package index (the client never runs it).

import { CategoryType } from "../types/category";
import type { PlanType } from "../types/plan";
import { EngineGame, multiplier, type EngineConfig, type Placement } from "./game";
import { distinctPlacements, solveFrom, type SolverMove } from "./solver";

/** How a position is valued before its structures close. */
export interface Estimate {
  /** The share of an open structure's value kept per open half-edge (0 to 1). */
  readonly decay: number;
  /** The points a forest is counted per road and city along it (300 when it scores). */
  readonly forest: number;
  /** The open half-edges a draw can close, on average: a structure with more than `reach` per draw left counts 0. */
  readonly reach: number;
}

export const DEFAULT_ESTIMATE: Estimate = { decay: 0.6, forest: 300, reach: 1 };

export interface BeamOptions {
  /** Positions kept per draw. */
  readonly width: number;
  readonly estimate?: Estimate;
  /** Children kept per position (default all): fewer keeps the beam from filling with one board's variants. */
  readonly perParent?: number;
  /** Draws at the end solved exactly from the best `tailStates` positions (default 0, none). */
  readonly tail?: number;
  /** Positions the exact tail starts from (default 8). */
  readonly tailStates?: number;
  /** Tiles on the board before the first draw (a level's `placed`). */
  readonly placed?: EngineConfig["placed"];
  /**
   * A line the search starts from (the designer's, `designer.ts`): its position at each draw is kept in the beam whatever
   * its estimate, so the search ends at least at the line's score.
   */
  readonly seed?: readonly SolverMove[];
}

export interface BeamResult {
  /** The best final score found: a lower bound of the optimum, not a proof of it. */
  readonly score: number;
  /** The moves that reach it, in play order. */
  readonly moves: readonly SolverMove[];
  /** Positions built (children of the beam, and of the exact tail). */
  readonly nodes: number;
}

interface Node {
  readonly game: EngineGame;
  readonly move: SolverMove | null;
  readonly parent: Node | null;
  readonly value: number;
  /** The board key (`withTile`): two positions with the same key are the same board. */
  readonly key: readonly [number, number];
}

const BASE: Record<string, number> = { [CategoryType.Road]: 100, [CategoryType.City]: 200 };

/** The score of `game` plus what its open structures would be worth closed, discounted by their open half-edges. */
export function estimate(game: EngineGame, weights: Estimate = DEFAULT_ESTIMATE): number {
  if (game.over) return game.score;
  // The draws left, the tile in hand included: a structure with more open half-edges cannot close
  const left = game.tileLimit - game.tileCount + 1;
  let value = game.score;
  for (const structure of game.openEdges()) {
    if (structure.open > left * weights.reach) continue;
    let full: number;
    if (structure.category === CategoryType.Wonder) full = 900;
    else if (structure.category === CategoryType.Forest) {
      full = (structure.neighbours * weights.forest * multiplier(structure.size)) / 10000;
    }
    else full = (structure.size * (BASE[structure.category] ?? 0) * multiplier(structure.size)) / 10000;
    value += full * weights.decay ** structure.open;
  }
  return value;
}

/** A 32-bit FNV-1a hash of a placed tile; a board's key XORs those of its tiles, so the order of play does not matter. */
function tileHash(text: string, basis: number): number {
  let hash = basis;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** The two 32-bit halves of a board key, with one more tile. */
function withTile(key: readonly [number, number], plan: PlanType, placement: Placement): [number, number] {
  const text = `${placement.x},${placement.y},${plan},${placement.orientation}`;
  return [(key[0] ^ tileHash(text, 2166136261)) >>> 0, (key[1] ^ tileHash(text, 3735928559)) >>> 0];
}

function line(node: Node): SolverMove[] {
  const moves: SolverMove[] = [];
  for (let at: Node | null = node; at?.move; at = at.parent) moves.push(at.move);
  return moves.reverse();
}

/** Searches the start position `start` (not changed) with a beam of `options.width`. */
export function beamFrom(start: EngineGame, options: BeamOptions): BeamResult {
  const weights = options.estimate ?? DEFAULT_ESTIMATE;
  const tail = options.tail ?? 0;
  const perParent = options.perParent ?? Number.POSITIVE_INFINITY;
  let nodes = 0;
  let beam: Node[] = [{ game: start.clone(), move: null, parent: null, value: estimate(start, weights), key: [0, 0] }];
  // The seed line's position at the current draw, kept in the beam (its node there, or its own)
  let seeded: Node | null = options.seed?.length ? beam[0] : null;
  let depth = 0;

  while (beam.length > 0 && !beam[0].game.over && beam[0].game.hand) {
    const left = beam[0].game.tileLimit - beam[0].game.tileCount + 1;
    if (left <= tail) break;
    const children: Node[] = [];
    for (const node of beam) {
      const plan = (node.game.hand as { plan: PlanType }).plan;
      const placements = distinctPlacements(node.game, plan);
      for (const placement of placements) {
        const game = node.game.clone();
        game.build(placement);
        nodes += 1;
        children.push({
          game,
          move: { action: "build", plan, placement },
          parent: node,
          value: estimate(game, weights),
          key: withTile(node.key, plan, placement),
        });
      }
      // On the last tile a discard only matters when nothing fits (a build never takes points)
      if (node.game.tileCount >= node.game.tileLimit && placements.length > 0) continue;
      const game = node.game.clone();
      game.discard();
      nodes += 1;
      children.push({ game, move: { action: "discard", plan }, parent: node, value: estimate(game, weights), key: node.key });
    }
    // Best first, ties in the order found (a stable sort); one node per board
    children.sort((a, b) => b.value - a.value);
    const seen = new Set<string>();
    const kept = new Map<Node, number>();
    beam = [];
    for (const child of children) {
      const key = `${child.key[0]}:${child.key[1]}`;
      if (seen.has(key)) continue;
      const siblings = kept.get(child.parent as Node) ?? 0;
      if (siblings >= perParent) continue;
      seen.add(key);
      kept.set(child.parent as Node, siblings + 1);
      beam.push(child);
      if (beam.length >= options.width) break;
    }
    // The seed's next position: the beam's node of the same board, or its own in place of the last one kept
    const move = options.seed?.[depth];
    if (seeded && move) {
      const game = seeded.game.clone();
      if (move.action === "build") game.build(move.placement);
      else game.discard();
      nodes += 1;
      const key = move.action === "build" ? withTile(seeded.key, move.plan, move.placement) : seeded.key;
      const same = beam.find((node) => node.key[0] === key[0] && node.key[1] === key[1] && node.game.score >= game.score);
      seeded = same ?? { game, move, parent: seeded, value: estimate(game, weights), key };
      if (!same) beam.splice(Math.min(beam.length, options.width - 1), 1, seeded);
    } else {
      seeded = null;
    }
    depth += 1;
  }

  let best: { score: number; moves: SolverMove[] } = { score: -1, moves: [] };
  const ends = tail > 0 ? beam.slice(0, options.tailStates ?? 8) : beam;
  if (seeded && !ends.includes(seeded)) ends.push(seeded);
  for (const node of ends) {
    if (node.game.over || !node.game.hand) {
      if (node.game.score > best.score) best = { score: node.game.score, moves: line(node) };
      continue;
    }
    const end = solveFrom(node.game);
    nodes += end.nodes;
    if (end.optimum > best.score) best = { score: end.optimum, moves: [...line(node), ...end.moves] };
  }
  return { score: best.score, moves: best.moves, nodes };
}

/** Searches a level: `sequence` is the deck after the starter, in draw order. */
export function beam(sequence: readonly PlanType[], options: BeamOptions): BeamResult {
  return beamFrom(EngineGame.start({ deck: "story", seed: 0n, sequence, placed: options.placed }), options);
}
