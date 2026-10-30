import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => (await import("./helpers/hooks")).reactWithHooks());

const scenes = vi.hoisted(() => [] as unknown[]);

vi.mock("../src/core/GameScene", async () => ({
  GameScene: (await import("./helpers/hooks")).createFakeSceneClass(scenes),
}));

// Each adapter wraps the canvas it was given; a canvas has one WebGL context.
vi.mock("../src/core/WebSurfaceAdapter", () => ({
  createWebSurfaceAdapter: vi.fn((canvas: unknown) => ({ canvas })),
}));

import { GameCanvas, type GameCanvasProps } from "../src/react/GameCanvas";
import { commit, flush, type FakeScene } from "./helpers/hooks";

type FakeCanvas = { style: Record<string, string>; removed: boolean; remove(): void };

const canvases: FakeCanvas[] = [];

beforeEach(() => {
  scenes.length = 0;
  canvases.length = 0;
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas: FakeCanvas = {
        style: {},
        removed: false,
        remove() {
          canvas.removed = true;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  });
});

function mount(props: GameCanvasProps = {}) {
  const container = { appendChild: vi.fn() };
  const unmount = commit(() => GameCanvas(props), container);
  return { container, scene: scenes[scenes.length - 1] as FakeScene, unmount };
}

const canvasOf = (scene: FakeScene) => (scene.surface as { canvas: FakeCanvas }).canvas;

describe("GameCanvas lifecycle", () => {
  it("gives the scene its own canvas inside the container", () => {
    const { container, scene } = mount();

    expect(canvases).toHaveLength(1);
    expect(container.appendChild).toHaveBeenCalledWith(canvases[0]);
    expect(canvasOf(scene)).toBe(canvases[0]);
    expect(canvases[0].style).toMatchObject({ display: "block", width: "100%", height: "100%" });
  });

  it("starts the scene and calls onReady once init resolves", async () => {
    const onReady = vi.fn();
    const { scene } = mount({ onReady });

    scene.resolveInit();
    await flush();

    expect(scene.start).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(scene);
    expect(scene.dispose).not.toHaveBeenCalled();
  });

  it("applies a camera mode asked before the scene started, as it starts (#875)", async () => {
    const { scene } = mount({ cameraMode: "free" });
    scene.setCameraMode.mockClear();

    scene.resolveInit();
    await flush();

    expect(scene.setCameraMode).toHaveBeenCalledWith("free");
    expect(scene.start).toHaveBeenCalledTimes(1);
  });

  it("leaves the play camera alone as it starts", async () => {
    const { scene } = mount();
    scene.setCameraMode.mockClear();

    scene.resolveInit();
    await flush();

    expect(scene.setCameraMode).not.toHaveBeenCalled();
  });

  it("unmount before init resolves: scene disposed at once, no start, no onReady", async () => {
    const onReady = vi.fn();
    const { scene, unmount } = mount({ onReady });

    unmount();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(canvasOf(scene).removed).toBe(true);

    scene.resolveInit();
    await flush();

    expect(scene.start).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("unmount after init resolved: scene disposed once", async () => {
    const { scene, unmount } = mount();

    scene.resolveInit();
    await flush();
    unmount();

    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(canvasOf(scene).removed).toBe(true);
  });

  it("init rejects: onError is called, nothing is unhandled", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const onError = vi.fn();
      const onReady = vi.fn();
      const { scene } = mount({ onError, onReady });
      const error = new Error("no WebGL context");

      scene.rejectInit(error);
      await flush();

      expect(onError).toHaveBeenCalledWith(error);
      expect(onReady).not.toHaveBeenCalled();
      expect(scene.start).not.toHaveBeenCalled();
      expect(scene.dispose).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("init rejects without onError: no unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { scene } = mount();
      scene.rejectInit(new Error("no WebGL context"));
      await flush();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("init rejects, then unmount: onError once, the scene's dispose is called again harmlessly", async () => {
    const onError = vi.fn();
    const { scene, unmount } = mount({ onError });

    scene.rejectInit(new Error("no WebGL context"));
    await flush();
    unmount();

    expect(onError).toHaveBeenCalledTimes(1);
    // GameScene.dispose is idempotent (game-scene-dispose.test.ts), so the second call is a no-op.
    expect(scene.dispose.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("init rejects after unmount: onError is not called", async () => {
    const onError = vi.fn();
    const { scene, unmount } = mount({ onError });

    unmount();
    scene.rejectInit(new Error("late"));
    await flush();

    expect(onError).not.toHaveBeenCalled();
  });

  it("StrictMode mount, cleanup, mount: the second scene has its own canvas and keeps it", async () => {
    const container = { appendChild: vi.fn() };
    const render = () => GameCanvas({});
    // The first effect run, then its cleanup, then the second run, as StrictMode does.
    const unmountA = commit(render, container);
    const a = scenes[0] as FakeScene;
    unmountA();
    const unmountB = commit(render, container);
    const b = scenes[1] as FakeScene;

    // A's init resolves last, after B's.
    b.resolveInit();
    await flush();
    a.resolveInit();
    await flush();

    expect(canvasOf(a)).not.toBe(canvasOf(b));
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(canvasOf(a).removed).toBe(true);
    // B was never disposed, so the context of its canvas was never lost; it started normally.
    expect(b.dispose).not.toHaveBeenCalled();
    expect(canvasOf(b).removed).toBe(false);
    expect(a.start).not.toHaveBeenCalled();
    expect(b.start).toHaveBeenCalledTimes(1);

    unmountB();
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it("a basePath change replaces the scene and its canvas", async () => {
    const container = { appendChild: vi.fn() };
    const unmountA = commit(() => GameCanvas({ basePath: "/a" }), container);
    const a = scenes[0] as FakeScene;
    a.resolveInit();
    await flush();

    unmountA();
    commit(() => GameCanvas({ basePath: "/b" }), container);
    const b = scenes[1] as FakeScene;
    b.resolveInit();
    await flush();

    expect(a.init.mock.calls[0][0]).toMatchObject({ basePath: "/a" });
    expect(b.init.mock.calls[0][0]).toMatchObject({ basePath: "/b" });
    expect(canvasOf(a)).not.toBe(canvasOf(b));
    expect(canvasOf(a).removed).toBe(true);
    expect(canvasOf(b).removed).toBe(false);
    expect(b.dispose).not.toHaveBeenCalled();
    expect(b.start).toHaveBeenCalledTimes(1);
  });
});
