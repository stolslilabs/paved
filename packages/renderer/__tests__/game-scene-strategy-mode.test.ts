import { describe, expect, it, vi } from "vitest";
import { GameScene } from "../src/core/GameScene";
import type { TileRenderData } from "../src/core/types";

function makeTile(overrides: Partial<TileRenderData> = {}): TileRenderData {
  return {
    game_id: 1,
    id: 1,
    player_id: "0x1",
    plan: 9,
    orientation: 1,
    x: 0,
    y: 0,
    occupied_spot: 0,
    worldX: 0,
    worldZ: 0,
    ...overrides,
  };
}

describe("GameScene strategy mode refresh", () => {
  it("re-renders existing tiles immediately when strategy mode changes", () => {
    const scene = new GameScene();

    const updateTiles = vi.fn();
    const setStrategyMode = vi.fn();
    (scene as any).tiles = { updateTiles, setStrategyMode };

    const tiles = [makeTile()];
    scene.updateTiles(tiles);
    updateTiles.mockClear();

    scene.setStrategyMode(true);

    expect(setStrategyMode).toHaveBeenCalledWith(true);
    expect(updateTiles).toHaveBeenCalledWith(tiles);
  });
});
