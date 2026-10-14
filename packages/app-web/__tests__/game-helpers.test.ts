import { describe, it, expect } from "vitest";
import { CENTER, toRenderBoard } from "../src/utils/game-helpers";
import type { SessionState } from "@paved/chain";

describe("toRenderBoard", () => {
  const state = {
    key: { mode: "challenge", gameId: 3 },
    tiles: [
      { id: 1, plan: 4, orientation: 1, x: CENTER, y: CENTER },
      { id: 2, plan: 7, orientation: 2, x: CENTER + 1, y: CENTER - 1, pending: true },
    ],
  } as unknown as SessionState;

  it("places tiles in world space, y north turned to z south", () => {
    const tiles = toRenderBoard(state, "0xabc");
    expect(tiles.map((t) => [t.id, t.worldX, t.worldZ, t.pending ?? false])).toEqual([
      [1, 0, 0, false],
      [2, 1, 1, true],
    ]);
  });
});
