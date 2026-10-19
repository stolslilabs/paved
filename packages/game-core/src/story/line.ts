// A Story line: the moves of one run, in play order, as one short string the plan stores and the tests replay. A build
// is the orientation's initial and the cell relative to the starter (`N1,0`: North at x 1, y 0), a discard is `D`;
// the moves are separated by a space.

import { EngineGame, type Placement } from "../engine/game";
import { OrientationType } from "../types/orientation";
import type { PlanType } from "../types/plan";

/** One move of a line: a placement (relative to the starter) or a discard. */
export type LineMove = { readonly action: "build"; readonly placement: Placement } | { readonly action: "discard" };

const INITIALS: Record<string, OrientationType> = {
  N: OrientationType.North,
  E: OrientationType.East,
  S: OrientationType.South,
  W: OrientationType.West,
};

/** The line of `moves` (any move with an `action` and, for a build, a `placement`). */
export function encodeLine(moves: readonly LineMove[]): string {
  return moves
    .map((move) => (move.action === "discard" ? "D" : `${move.placement.orientation[0]}${move.placement.x},${move.placement.y}`))
    .join(" ");
}

/** The moves of `line`; throws on a token that is not a move. */
export function decodeLine(line: string): LineMove[] {
  if (line.trim() === "") return [];
  return line
    .trim()
    .split(/\s+/)
    .map((token) => {
      if (token === "D") return { action: "discard" } as const;
      const match = /^([NESW])(-?\d+),(-?\d+)$/.exec(token);
      if (!match) throw new Error(`Story line: not a move: ${token}`);
      return {
        action: "build",
        placement: { orientation: INITIALS[match[1] as string] as OrientationType, x: Number(match[2]), y: Number(match[3]) },
      } as const;
    });
}

/** Plays `line` on a new game of `deck` (after the starter, in draw order) and `placed`; the game at the end. */
export function replayLine(
  deck: readonly PlanType[],
  line: string,
  placed?: readonly ({ plan: PlanType } & Placement)[],
): EngineGame {
  const game = EngineGame.start({ deck: "story", seed: 0n, sequence: deck, placed });
  for (const move of decodeLine(line)) {
    if (move.action === "discard") game.discard();
    else game.build(move.placement);
  }
  return game;
}
