import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
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

    await scene.init({ surface, pixelRatio: [0.5, 1.5], shadows: false });

    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5);
    expect(renderer.setSize).toHaveBeenCalledWith(320, 180);
  });

  it("uses surface resize callback to update renderer and camera", async () => {
    const adapter = createSurfaceAdapter({ width: 300, height: 200 }, 2);
    const { scene, controller, renderer } = createSceneHarness();

    await scene.init({ surface: adapter.surface });

    (adapter.surface.getSize as any) = () => ({ width: 640, height: 360 });
    adapter.emitResize();

    expect(renderer.setSize).toHaveBeenLastCalledWith(640, 360);
    expect(controller.resize).toHaveBeenCalledWith(640, 360);
    expect((scene as any).effects.resize).toHaveBeenCalledWith(640, 360);
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
