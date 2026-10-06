import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import type { RenderSurfaceAdapter } from "../src/core/types";

const adapter: RenderSurfaceAdapter = {
  getSize: () => ({ width: 320, height: 200 }),
  getDevicePixelRatio: () => 1,
  onResize: () => vi.fn(),
  bindInput: vi.fn(),
  unbindInput: vi.fn(),
};

function createScene() {
  const renderer = {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    dispose: vi.fn(),
    shadowMap: { enabled: false, type: 0 },
    domElement: { width: 320, height: 200 },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
  };
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
  const controller = {
    camera,
    controls: { addEventListener: vi.fn(), target: new THREE.Vector3() },
    update: vi.fn(() => false),
    resize: vi.fn(),
    setMode: vi.fn(),
    setBoardBounds: vi.fn(),
    dispose: vi.fn(),
  };
  const scene = new GameScene({
    createRenderer: vi.fn(() => renderer as any),
    createCameraController: vi.fn(() => controller as any),
  });
  (scene as any).assets.preloadAll = vi.fn().mockResolvedValue(undefined);
  const effects = {
    init: vi.fn(),
    setCapabilities: vi.fn(),
    setProfile: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
  (scene as any).effects = effects;
  return { scene, effects };
}

describe("GameScene frame observer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("observes every tick and brackets only the frames that render", async () => {
    const queue: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => queue.push(cb));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { scene, effects } = createScene();
    await scene.init({ surface: adapter });

    const events: string[] = [];
    scene.setFrameObserver({
      beforeRender: () => events.push("before"),
      afterTick: ({ rendered, cpuMs }) => {
        expect(cpuMs).toBeGreaterThanOrEqual(0);
        events.push(rendered ? "tick:rendered" : "tick:idle");
      },
    });

    scene.start(); // first tick runs synchronously: the scene starts dirty
    queue.shift()!(); // nothing changed: idle tick
    scene.requestRender();
    queue.shift()!(); // dirty again: renders

    expect(events).toEqual(["before", "tick:rendered", "tick:idle", "before", "tick:rendered"]);
    expect(effects.render).toHaveBeenCalledTimes(2);
  });

  it("renders the same with and without an observer", async () => {
    const queue: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => queue.push(cb));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { scene, effects } = createScene();
    await scene.init({ surface: adapter });
    scene.setFrameObserver({ afterTick: () => {} });
    scene.setFrameObserver(null);

    scene.start();
    queue.shift()!();
    expect(effects.render).toHaveBeenCalledTimes(1);
  });
});
