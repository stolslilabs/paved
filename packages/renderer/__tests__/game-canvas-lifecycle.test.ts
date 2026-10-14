import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The renderer has no DOM or react-dom in its test setup, so the two hooks GameCanvas
// uses are replaced by a one-render simulation: refs keep their slot, effects run on commit.
const hooks = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => void | (() => void)>,
  index: 0,
}));

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useRef: (initial: unknown) => {
    const slot = (hooks.refs[hooks.index] ??= { current: initial });
    hooks.index++;
    return slot;
  },
  useEffect: (effect: () => void | (() => void)) => {
    hooks.effects.push(effect);
  },
}));

const scenes = vi.hoisted(() => [] as unknown[]);

vi.mock("../src/core/GameScene", () => ({
  GameScene: class {
    resolveInit!: () => void;
    rejectInit!: (error: unknown) => void;
    init = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          this.resolveInit = resolve;
          this.rejectInit = reject;
        }),
    );
    start = vi.fn();
    dispose = vi.fn();
    onTileClick = vi.fn();
    onTileHover = vi.fn();
    onHoverLeave = vi.fn();
    updateTiles = vi.fn();
    setHoveredTile = vi.fn();
    setAvailableSlots = vi.fn();
    setStrategyMode = vi.fn();
    setCompassRotation = vi.fn();
    setCameraMode = vi.fn();
    constructor() {
      scenes.push(this);
    }
  },
}));

vi.mock("../src/core/WebSurfaceAdapter", () => ({
  createWebSurfaceAdapter: vi.fn(() => ({})),
}));

import { GameCanvas, type GameCanvasProps } from "../src/react/GameCanvas";

type FakeScene = {
  init: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  resolveInit: () => void;
  rejectInit: (error: unknown) => void;
};

function mount(props: GameCanvasProps = {}) {
  hooks.refs = [];
  hooks.effects = [];
  hooks.index = 0;
  // The first ref of GameCanvas is the canvas: give it an element, as React would.
  hooks.refs[0] = { current: {} };
  GameCanvas(props);
  const cleanups = hooks.effects.map((effect) => effect());
  const scene = scenes[scenes.length - 1] as FakeScene;
  return {
    scene,
    unmount: () => cleanups.forEach((cleanup) => typeof cleanup === "function" && cleanup()),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("GameCanvas lifecycle", () => {
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
    expect(scene.dispose).not.toHaveBeenCalled();
  });

  it("unmount before init resolves: no start, no onReady, scene disposed", async () => {
    const onReady = vi.fn();
    const { scene, unmount } = mount({ onReady });

    unmount();
    scene.resolveInit();
    await flush();

    expect(scene.start).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });

  it("unmount after init resolved: scene disposed once", async () => {
    const { scene, unmount } = mount();

    scene.resolveInit();
    await flush();
    unmount();

    expect(scene.dispose).toHaveBeenCalledTimes(1);
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

  it("init rejects after unmount: onError is not called", async () => {
    const onError = vi.fn();
    const { scene, unmount } = mount({ onError });

    unmount();
    scene.rejectInit(new Error("late"));
    await flush();

    expect(onError).not.toHaveBeenCalled();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });
});
