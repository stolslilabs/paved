import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => (await import("./helpers/hooks")).reactWithHooks());

const scenes = vi.hoisted(() => [] as unknown[]);

vi.mock("../src/core/GameScene", async () => ({
  GameScene: (await import("./helpers/hooks")).createFakeSceneClass(scenes),
}));

import { GameCanvasNative, type GameCanvasNativeProps } from "../src/react-native/GameCanvasNative";
import { commit, flush, type FakeScene } from "./helpers/hooks";
import type { RenderSurfaceAdapter } from "../src/core/types";

const surface = {} as RenderSurfaceAdapter;

function mount(props: Partial<GameCanvasNativeProps> = {}) {
  const unmount = commit(() => GameCanvasNative({ surface, ...props }));
  return { scene: scenes[scenes.length - 1] as FakeScene, unmount };
}

describe("GameCanvasNative lifecycle", () => {
  beforeEach(() => {
    scenes.length = 0;
  });

  it("starts the scene and calls onReady once init resolves", async () => {
    const onReady = vi.fn();
    const { scene } = mount({ onReady });

    scene.resolveInit();
    await flush();

    expect(scene.start).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(scene);
  });

  it("unmount before init resolves: disposed at once, no start, no onReady", async () => {
    const onReady = vi.fn();
    const { scene, unmount } = mount({ onReady });

    unmount();
    scene.resolveInit();
    await flush();

    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(scene.start).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("leaves the caller's GL context alone: the surface outlives the scene", () => {
    const { scene, unmount } = mount();
    unmount();
    expect(scene.dispose).toHaveBeenCalledWith({ releaseContext: false });
  });

  it("init rejects: onError is called, no unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const onError = vi.fn();
      const { scene } = mount({ onError });
      const error = new Error("no GL context");

      scene.rejectInit(error);
      await flush();

      expect(onError).toHaveBeenCalledWith(error);
      expect(scene.start).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("init rejects after unmount: onError is not called", async () => {
    const onError = vi.fn();
    const { scene, unmount } = mount({ onError });

    unmount();
    scene.rejectInit(new Error("late"));
    await flush();

    expect(onError).not.toHaveBeenCalled();
  });
});
