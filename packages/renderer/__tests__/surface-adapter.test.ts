import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import { DEFAULT_RENDERER_SETTINGS } from "../src/core/settings";
import type { RenderSurfaceAdapter, SurfaceInputEvent } from "../src/core/types";

type ResizeCallback = () => void;

function createSurfaceAdapter(size = { width: 400, height: 240 }, dpr = 2): {
  surface: RenderSurfaceAdapter;
  emitResize: () => void;
  emitInput: (event: SurfaceInputEvent) => void;
  onResizeUnsubscribe: ReturnType<typeof vi.fn>;
  unbindInput: ReturnType<typeof vi.fn>;
} {
  let resizeCallback: ResizeCallback = () => undefined;
  let inputHandler: ((event: SurfaceInputEvent) => void) | null = null;
  const onResizeUnsubscribe = vi.fn();
  const unbindInput = vi.fn(() => {
    inputHandler = null;
  });

  const surface: RenderSurfaceAdapter = {
    getSize: () => size,
    getDevicePixelRatio: () => dpr,
    onResize: (cb) => {
      resizeCallback = cb;
      return onResizeUnsubscribe;
    },
    bindInput: (handler) => {
      inputHandler = handler;
    },
    unbindInput,
  };

  return {
    surface,
    emitResize: () => resizeCallback(),
    emitInput: (event) => inputHandler?.(event),
    onResizeUnsubscribe,
    unbindInput,
  };
}

function createController() {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
  camera.position.set(0, 24, 0.1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  return {
    camera,
    controls: {
      addEventListener: vi.fn(),
      target: new THREE.Vector3(),
    },
    update: vi.fn(() => false),
    resize: vi.fn(),
    setMode: vi.fn(),
    setBoardBounds: vi.fn(),
    focusBounds: vi.fn(),
    dispose: vi.fn(),
  };
}

function createRenderer() {
  return {
    setPixelRatio: vi.fn(),
    forceContextLoss: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    domElement: {
      width: 400,
      height: 240,
      toDataURL: vi.fn(() => "data:image/png;base64,mock"),
    },
    shadowMap: {
      enabled: false,
      type: 0,
    },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
  };
}

function createSceneHarness() {
  const controller = createController();
  const renderer = createRenderer();

  const scene = new GameScene({
    createCameraController: vi.fn(() => controller as any),
    createRenderer: vi.fn(() => renderer as any),
  });

  (scene as any).assets.preloadAll = vi.fn().mockResolvedValue(undefined);
  (scene as any).effects = {
    init: vi.fn(),
    setCapabilities: vi.fn(),
    setProfile: vi.fn(),
    setAntialiasing: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };

  return { scene, controller, renderer };
}

describe("RenderSurfaceAdapter integration", () => {
  it("initializes GameScene from surface adapter (no canvas in config)", async () => {
    const { surface } = createSurfaceAdapter({ width: 320, height: 180 }, 3);
    const { scene, renderer } = createSceneHarness();

    await scene.init({ surface, settings: { maxPixelRatio: 1.5 }, shadows: false });

    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5);
    // `false`: three must not pin the canvas's CSS size in px, or it would stop following its container.
    expect(renderer.setSize).toHaveBeenCalledWith(320, 180, false);
  });

  it("uses surface resize callback to update renderer and camera", async () => {
    const adapter = createSurfaceAdapter({ width: 300, height: 200 }, 2);
    const { scene, controller, renderer } = createSceneHarness();

    await scene.init({ surface: adapter.surface, settings: { maxPixelRatio: 1 } });

    (adapter.surface.getSize as any) = () => ({ width: 640, height: 360 });
    adapter.emitResize();

    expect(renderer.setSize).toHaveBeenLastCalledWith(640, 360, false);
    expect(controller.resize).toHaveBeenCalledWith(640, 360);
    expect((scene as any).effects.resize).toHaveBeenCalledWith(640, 360, 1);
  });

  it("follows a change of the device pixel ratio, up to the cap", async () => {
    let dpr = 1;
    const adapter = createSurfaceAdapter({ width: 300, height: 200 }, 1);
    (adapter.surface.getDevicePixelRatio as any) = () => dpr;
    const { scene, controller, renderer } = createSceneHarness();
    await scene.init({ surface: adapter.surface, settings: { maxPixelRatio: 2 } });
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1);

    dpr = 2; // the window moved to a Retina screen
    adapter.emitResize();
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(renderer.setSize).toHaveBeenLastCalledWith(300, 200, false);
    expect(controller.resize).toHaveBeenLastCalledWith(300, 200);
    expect((scene as any).effects.resize).toHaveBeenLastCalledWith(300, 200, 2);

    dpr = 3;
    adapter.emitResize();
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
  });

  it("draws at the screen's pixel ratio, capped at maxPixelRatio: min(devicePixelRatio, cap)", async () => {
    for (const [dpr, cap, expected] of [
      [3, 2, 2],
      [2, 2, 2],
      [2, 1.5, 1.5],
      [1, 2, 1],
      [0.75, 2, 0.75],
      [3, 1, 1],
    ]) {
      const { surface } = createSurfaceAdapter({ width: 320, height: 180 }, dpr);
      const { scene, renderer } = createSceneHarness();
      await scene.init({ surface, settings: { maxPixelRatio: cap }, shadows: false });
      expect(renderer.setPixelRatio, `DPR ${dpr}, cap ${cap}`).toHaveBeenLastCalledWith(expected);
      expect((scene as any).pixelRatio).toBe(expected);
    }
  });

  it("by default (\"auto\") caps at 1.5 on a large screen with a fine pointer, at 2 on a coarse pointer or a small screen", async () => {
    expect(DEFAULT_RENDERER_SETTINGS.maxPixelRatio).toBe("auto");
    for (const [size, dpr, coarse, expected] of [
      [{ width: 1440, height: 900 }, 2, false, 1.5], // the Mac profile
      [{ width: 1440, height: 900 }, 2, true, 2], // a large touch screen
      [{ width: 360, height: 780 }, 3, false, 2], // the phone-like profile, a narrow window
      [{ width: 360, height: 780 }, 3, true, 2], // a phone
      [{ width: 1024, height: 768 }, 1, true, 1], // never above the screen's own ratio
    ] as const) {
      const { surface } = createSurfaceAdapter(size, dpr);
      surface.hasCoarsePointer = () => coarse;
      const { scene, renderer } = createSceneHarness();
      await scene.init({ surface, shadows: false });
      expect(renderer.setPixelRatio, `${size.width}x${size.height} DPR ${dpr} coarse ${coarse}`).toHaveBeenLastCalledWith(expected);
    }
  });

  it("reads the window's size for \"auto\", not the board's: a short panel in a large window is no small screen", async () => {
    for (const [size, viewport, expected] of [
      [{ width: 1440, height: 300 }, { width: 1440, height: 900 }, 1.5], // a short board panel (docked devtools) on a desktop
      [{ width: 1440, height: 900 }, { width: 390, height: 844 }, 2], // the window is a phone's, whatever the surface says
    ] as const) {
      const { surface } = createSurfaceAdapter(size, 2);
      surface.getViewportSize = () => viewport;
      const { scene, renderer } = createSceneHarness();
      await scene.init({ surface, shadows: false });
      expect(renderer.setPixelRatio, `surface ${size.width}x${size.height}, window ${viewport.width}x${viewport.height}`).toHaveBeenLastCalledWith(expected);
    }
  });

  it("re-reads the \"auto\" cap on a resize: a window narrowed to a phone's width gets the small screen's cap", async () => {
    const adapter = createSurfaceAdapter({ width: 1440, height: 900 }, 2);
    const { scene, renderer } = createSceneHarness();
    await scene.init({ surface: adapter.surface });
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    (adapter.surface.getSize as any) = () => ({ width: 390, height: 844 });
    adapter.emitResize();
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect((scene as any).effects.resize).toHaveBeenLastCalledWith(390, 844, 2);
  });

  it("refits the drawing buffer and the composer when the cap changes, and only then", async () => {
    const adapter = createSurfaceAdapter({ width: 300, height: 200 }, 3);
    const { scene, renderer } = createSceneHarness();
    await scene.init({ surface: adapter.surface, settings: { maxPixelRatio: 1 } });
    const effects = (scene as any).effects;
    effects.setAntialiasing = vi.fn();
    scene.setSettings({ maxPixelRatio: 2 });
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(renderer.setSize).toHaveBeenLastCalledWith(300, 200, false);
    expect(effects.resize).toHaveBeenLastCalledWith(300, 200, 2);
    const resizes = effects.resize.mock.calls.length;
    scene.setSettings({ maxPixelRatio: 2, multisampling: true });
    expect(effects.resize).toHaveBeenCalledTimes(resizes);
  });

  it("keeps the last size while the container is hidden (0 x 0)", async () => {
    const adapter = createSurfaceAdapter({ width: 300, height: 200 }, 1);
    const { scene, controller, renderer } = createSceneHarness();
    await scene.init({ surface: adapter.surface });
    const calls = renderer.setSize.mock.calls.length;
    (adapter.surface.getSize as any) = () => ({ width: 0, height: 0 });
    adapter.emitResize();
    expect(renderer.setSize).toHaveBeenCalledTimes(calls);
    expect(controller.resize).not.toHaveBeenCalled();
  });

  it("follows a resize that happens while the models are loading", async () => {
    const adapter = createSurfaceAdapter({ width: 300, height: 200 }, 1);
    const { scene, renderer } = createSceneHarness();
    let loaded!: () => void;
    (scene as any).assets.preloadAll = vi.fn(() => new Promise<void>((resolve) => (loaded = resolve)));
    const init = scene.init({ surface: adapter.surface });
    await Promise.resolve();
    (adapter.surface.getSize as any) = () => ({ width: 500, height: 400 });
    adapter.emitResize();
    expect(renderer.setSize).toHaveBeenLastCalledWith(500, 400, false);
    loaded();
    await init;
  });

  it("drops the resize subscription when disposed while the models load", async () => {
    const adapter = createSurfaceAdapter();
    const { scene } = createSceneHarness();
    let loaded!: () => void;
    (scene as any).assets.preloadAll = vi.fn(() => new Promise<void>((resolve) => (loaded = resolve)));
    const init = scene.init({ surface: adapter.surface });
    await Promise.resolve();
    scene.dispose();
    loaded();
    await init;
    expect(adapter.onResizeUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unbinds adapter listeners during dispose", async () => {
    const adapter = createSurfaceAdapter();
    const { scene, controller, renderer } = createSceneHarness();

    await scene.init({ surface: adapter.surface });
    scene.dispose();

    expect(adapter.unbindInput).toHaveBeenCalledTimes(1);
    expect(adapter.onResizeUnsubscribe).toHaveBeenCalledTimes(1);
    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("routes click interactions from adapter input events", async () => {
    const adapter = createSurfaceAdapter({ width: 400, height: 400 }, 1);
    const { scene } = createSceneHarness();
    const onTileClick = vi.fn();

    await scene.init({ surface: adapter.surface });
    scene.onTileClick(onTileClick);

    adapter.emitInput({ type: "pointerdown", x: 200, y: 200, button: 0 });
    adapter.emitInput({ type: "pointerup", x: 200, y: 200, button: 0 });

    expect(onTileClick).toHaveBeenCalledTimes(1);
    expect(onTileClick).toHaveBeenCalledWith(0, 0);
  });
});
