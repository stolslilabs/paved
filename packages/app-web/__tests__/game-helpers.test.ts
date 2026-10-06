import { describe, it, expect } from "vitest";
import { CENTER, toRenderBoard } from "../src/utils/game-helpers";
import type { SessionState } from "@paved/chain";

describe("toRenderBoard", () => {
  const state = {
    key: { mode: "daily", gameId: 3 },
    tiles: [
      { id: 1, plan: 4, orientation: 1, x: CENTER, y: CENTER },
      { id: 2, plan: 7, orientation: 2, x: CENTER + 1, y: CENTER - 1, pending: true },
    ],
    characters: [{ role: 2, tileId: 2, x: CENTER + 1, y: CENTER - 1, spot: 1 }],
  } as unknown as SessionState;

  it("places tiles in world space, y north turned to z south", () => {
    const { tiles } = toRenderBoard(state, "0xabc");
    expect(tiles.map((t) => [t.id, t.worldX, t.worldZ, t.pending ?? false])).toEqual([
      [1, 0, 0, false],
      [2, 1, 1, true],
    ]);
    expect(tiles[1].occupied_spot).toBe(1);
  });

  it("draws a character on its tile and spot", () => {
    const { characters } = toRenderBoard(state, "0xabc");
    expect(characters).toEqual([
      expect.objectContaining({ gameId: 3, index: 2, tileId: 2, spot: 1, name: "Lady", worldX: 1, worldZ: 1 }),
    ]);
  });
});
