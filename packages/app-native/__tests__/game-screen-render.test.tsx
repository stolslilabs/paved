import { describe, expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";
import { GameScreen } from "../src/GameScreen";
import type { RenderSurfaceAdapter } from "@paved/renderer";

const mockGameCanvasNative = vi.fn(() => null);

vi.mock("@paved/renderer/react-native", () => ({
  GameCanvasNative: (props: unknown) => {
    mockGameCanvasNative(props);
    return null;
  },
}));

function makeSurface(): RenderSurfaceAdapter {
  return {
    getSize: () => ({ width: 320, height: 200 }),
    getDevicePixelRatio: () => 2,
    onResize: () => () => undefined,
    bindInput: () => undefined,
    unbindInput: () => undefined,
  };
}

describe("GameScreen render wiring", () => {
  it("forwards tile and character state updates to GameCanvasNative", () => {
    const surface = makeSurface();
    const initialTiles = [{ game_id: 1, id: 1, player_id: "0x1", plan: 1, orientation: 1, x: 0, y: 0, occupied_spot: 0, worldX: 0, worldZ: 0 }];
    const initialCharacters = [{ gameId: 1, playerId: "0x1", index: 0, tileId: 1, spot: 1, weight: 1, power: 1, color: "#fff", worldX: 0, worldZ: 0 }];

    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <GameScreen
          surface={surface}
          tiles={initialTiles as any}
          characters={initialCharacters as any}
          cameraMode="play"
        />
      );
    });

    const firstProps = mockGameCanvasNative.mock.lastCall?.[0] as any;
    expect(firstProps.tiles).toEqual(initialTiles);
    expect(firstProps.characters).toEqual(initialCharacters);
    expect(firstProps.cameraMode).toBe("play");

    const nextTiles = [...initialTiles, { ...initialTiles[0], id: 2, worldX: 1 }];
    act(() => {
      tree!.update(
        <GameScreen
          surface={surface}
          tiles={nextTiles as any}
          characters={initialCharacters as any}
          cameraMode="showcase"
        />
      );
    });

    const secondProps = mockGameCanvasNative.mock.lastCall?.[0] as any;
    expect(secondProps.tiles).toEqual(nextTiles);
    expect(secondProps.cameraMode).toBe("showcase");
  });
});
