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

describe("resume recovery", () => {
  it("requests a render tick after resume token changes", () => {
    const fakeScene = {
      requestRender: vi.fn(),
    };

    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<GameScreen surface={makeSurface()} resumeToken={0} />);
    });

    const initialProps = mockGameCanvasNative.mock.lastCall?.[0] as any;
    act(() => {
      initialProps.onReady(fakeScene);
    });

    act(() => {
      tree!.update(<GameScreen surface={makeSurface()} resumeToken={1} />);
    });

    expect(fakeScene.requestRender).toHaveBeenCalledTimes(1);
  });
});
