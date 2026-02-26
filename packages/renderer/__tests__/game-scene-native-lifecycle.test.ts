import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import type { RenderSurfaceAdapter, SurfaceInputEvent } from "../src/core/types";

function createAdapter() {
  const boundHandlers: Array<(event: SurfaceInputEvent) => void> = [];
  const resizeCallbacks: Array<() => void> = [];
  const unbindInput = vi.fn();

  const adapter: RenderSurfaceAdapter = {
    getSize: () => ({ width: 320, height: 200 }),
    getDevicePixelRatio: () => 2,
    onResize: (cb) => {
      resizeCallbacks.push(cb);
      return vi.fn();
    },
    bindInput: (handler) => {
      boundHandlers.push(handler);
    },
    unbindInput,
  };

  return { adapter, boundHandlers, resizeCallbacks, unbindInput };
}

function createScene(adapter: RenderSurfaceAdapter) {
  const renderer = {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    shadowMap: { enabled: false, type: 0 },
    domElement: { width: 320, height: 200, toDataURL: vi.fn(() => "") },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
  };

  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
  camera.position.set(0, 24, 0.1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const controller = {
    camera,
    controls: { addEventListener: vi.fn(), target: new THREE.Vector3() },
    update: vi.fn(() => false),
    resize: vi.fn(),
    setMode: vi.fn(),
    setBoardBounds: vi.fn(),
    focusBounds: vi.fn(),
    dispose: vi.fn(),
  };

  const scene = new GameScene({
    createRenderer: vi.fn(() => renderer as any),
    createCameraController: vi.fn(() => controller as any),
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

  return { scene, renderer, controller, adapter };
}

describe("GameScene native lifecycle", () => {
  it("does not double-bind input handlers across re-init", async () => {
    const { adapter, boundHandlers, unbindInput } = createAdapter();
    const { scene } = createScene(adapter);

    await scene.init({ surface: adapter });
    await scene.init({ surface: adapter });

    expect(boundHandlers).toHaveLength(2);
    expect(unbindInput).toHaveBeenCalledTimes(1);
  });

  it("unbinds listeners and disposes resources on dispose", async () => {
    const { adapter, unbindInput } = createAdapter();
    const { scene, renderer, controller } = createScene(adapter);

    await scene.init({ surface: adapter });
    scene.dispose();

    expect(unbindInput).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });
});
