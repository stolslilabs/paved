import { describe, expect, it, vi } from "vitest";
import { GameScene } from "../src/core/GameScene";

describe("GameScene camera mode wiring", () => {
  it("forwards camera mode to controller and requests render", () => {
    const scene = new GameScene();
    const setMode = vi.fn();
    const setProfile = vi.fn();

    (scene as any).controls = { setMode };
    (scene as any).effects = { setProfile };
    const requestRenderSpy = vi.spyOn(scene, "requestRender");

    (scene as any).setCameraMode("showcase");

    expect(setMode).toHaveBeenCalledWith("showcase");
    expect(setProfile).toHaveBeenCalledWith("showcase");
    expect(requestRenderSpy).toHaveBeenCalled();
  });

  it("computes board bounds from tiles and forwards recenter to controller", () => {
    const scene = new GameScene();
    const setBoardBounds = vi.fn();
    const focusBounds = vi.fn();
    const updateTiles = vi.fn();

    (scene as any).controls = {
      setMode: vi.fn(),
      setBoardBounds,
      focusBounds,
    };
    (scene as any).tiles = {
      updateTiles,
      setStrategyMode: vi.fn(),
    };

    scene.updateTiles([
      {
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
      },
      {
        game_id: 1,
        id: 2,
        player_id: "0x1",
        plan: 9,
        orientation: 1,
        x: 0,
        y: 0,
        occupied_spot: 0,
        worldX: 2,
        worldZ: -1,
      },
    ]);

    expect(setBoardBounds).toHaveBeenCalled();

    (scene as any).focusBoard();

    expect(focusBounds).toHaveBeenCalledWith({
      minX: 0,
      maxX: 6,
      minZ: -3,
      maxZ: 0,
    });
  });
});
