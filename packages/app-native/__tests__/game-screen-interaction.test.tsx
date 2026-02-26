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

describe("GameScreen interaction", () => {
  it("maps tile click to selected grid coordinates callback", () => {
    const onSelectTile = vi.fn();

    act(() => {
      create(
        <GameScreen
          surface={makeSurface()}
          onSelectTile={onSelectTile}
        />
      );
    });

    const props = mockGameCanvasNative.mock.lastCall?.[0] as any;

    act(() => {
      props.onTileClick(7, -2);
    });

    expect(onSelectTile).toHaveBeenCalledWith({ x: 7, y: -2 });
  });
});
