import { describe, expect, it } from "vitest";
import { EngineGame, OrientationType, PlanType } from "@paved/game-core";
import { fillBoard } from "../scripts/render-tiles/board";

const ORIENTATIONS = Object.values(OrientationType);
const planOf = (key: string) => key.toUpperCase() as PlanType;

describe("the Story backgrounds' boards (scripts/render-tiles/board.ts, #721)", () => {
  it("fill every cell of the rectangle once, the starter at the centre, the same board for the same seed", () => {
    const board = fillBoard(5, 4, 9);
    expect(board).toHaveLength(20);
    expect(new Set(board.map((t) => `${t.dx},${t.dy}`)).size).toBe(20);
    expect(Math.min(...board.map((t) => t.dx))).toBe(-2);
    expect(Math.max(...board.map((t) => t.dx))).toBe(2);
    expect(new Set(board.map((t) => t.dy))).toEqual(new Set([-1, 0, 1, 2]));
    expect(board[0]).toEqual({ key: "rfffrfcfr", dx: 0, dy: 0, orientation: ORIENTATIONS.indexOf(OrientationType.South) });
    expect(fillBoard(5, 4, 9)).toEqual(board);
    expect(fillBoard(5, 4, 10)).not.toEqual(board);
  });

  it("fit every tile to its neighbours by the game's rule, with at most two wonders", () => {
    const board = fillBoard(7, 6, 3);
    // Each tile, put last on the board of all the others, is a legal placement there.
    for (const [index, tile] of board.entries()) {
      if (index === 0) continue;
      const game = EngineGame.start({ deck: "story", seed: 0n, sequence: [PlanType.FFFFFFCFF] });
      board.forEach((other, i) => {
        if (i > 0 && i !== index) game.write({ id: 1_000 + i, plan: planOf(other.key), orientation: ORIENTATIONS[other.orientation]!, x: other.dx, y: -other.dy });
      });
      expect(game.refusal({ x: tile.dx, y: -tile.dy, orientation: ORIENTATIONS[tile.orientation]! }, planOf(tile.key)), `${tile.key} at ${tile.dx},${tile.dy}`).toBeNull();
    }
    expect(board.filter((t) => t.key.startsWith("w")).length).toBeLessThanOrEqual(2);
  });
});
