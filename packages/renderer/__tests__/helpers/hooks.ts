import { vi } from "vitest";

// The renderer has no DOM or react-dom in its test setup, so the two hooks the canvas components
// use are replaced by a one-render simulation: refs keep their slot, effects run on commit.
export const hooks = {
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => void | (() => void)>,
  index: 0,
};

export async function reactWithHooks() {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const slot = (hooks.refs[hooks.index] ??= { current: initial });
      hooks.index++;
      return slot;
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
}

/** A commit of `render`: the first ref (if `firstRef` is given) is filled as React would. */
export function commit(render: () => unknown, firstRef?: unknown) {
  hooks.refs = [];
  hooks.effects = [];
  hooks.index = 0;
  if (firstRef !== undefined) hooks.refs[0] = { current: firstRef };
  render();
  const cleanups = hooks.effects.map((effect) => effect());
  return () => cleanups.forEach((cleanup) => typeof cleanup === "function" && cleanup());
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Scene double: its init settles when the test says so, and disposing loses its surface's context. */
export function createFakeSceneClass(scenes: unknown[]) {
  return class {
    resolveInit!: () => void;
    rejectInit!: (error: unknown) => void;
    surface: unknown;
    disposed = 0;
    init = vi.fn((config: { surface: unknown }) => {
      this.surface = config.surface;
      return new Promise<void>((resolve, reject) => {
        this.resolveInit = resolve;
        this.rejectInit = reject;
      });
    });
    start = vi.fn();
    dispose = vi.fn((_options?: { releaseContext?: boolean }) => {
      this.disposed++;
    });
    onTileClick = vi.fn();
    onTileHover = vi.fn();
    onHoverLeave = vi.fn();
    updateTiles = vi.fn();
    setHoveredTile = vi.fn();
    setAvailableSlots = vi.fn();
    setConfirmedTile = vi.fn();
    setStrategyMode = vi.fn();
    setCompassRotation = vi.fn();
    setCameraMode = vi.fn();
    setSettings = vi.fn();
    setSkins = vi.fn();
    setCovered = vi.fn();
    constructor() {
      scenes.push(this);
    }
  };
}

export type FakeScene = InstanceType<ReturnType<typeof createFakeSceneClass>>;
