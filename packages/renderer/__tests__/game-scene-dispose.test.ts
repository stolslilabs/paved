import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import type { RenderSurfaceAdapter } from "../src/core/types";

function createSurface(): RenderSurfaceAdapter {
  return {
    getSize: () => ({ width: 320, height: 200 }),
    getDevicePixelRatio: () => 1,
    onResize: vi.fn(() => vi.fn()),
    bindInput: vi.fn(),
    unbindInput: vi.fn(),
  };
}

function createScene() {
  const renderer = {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    shadowMap: { enabled: false, type: 0 },
    domElement: { width: 320, height: 200, toDataURL: vi.fn(() => "") },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
  };
  const controller = {
    camera: new THREE.PerspectiveCamera(50, 1, 1, 2000),
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
  return { scene, renderer, controller };
}

describe("GameScene.dispose", () => {
  it("frees the renderer and releases its WebGL context", async () => {
    const { scene, renderer, controller } = createScene();
    await scene.init({ surface: createSurface() });

    scene.dispose();

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect((scene as any).effects.dispose).toHaveBeenCalledTimes(1);
    expect(scene.scene.children).toHaveLength(0);
  });

  it("does not throw when init never created a renderer", () => {
    const { scene } = createScene();
    expect(() => scene.dispose()).not.toThrow();
  });
});

describe("GameScene.dispose, idempotence and ownership", () => {
  it("a second dispose changes nothing", async () => {
    const { scene, renderer, controller } = createScene();
    await scene.init({ surface: createSurface() });

    scene.dispose();
    scene.dispose();

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the context when the surface's owner frees it", async () => {
    const { scene, renderer } = createScene();
    await scene.init({ surface: createSurface() });

    scene.dispose({ releaseContext: false });

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).not.toHaveBeenCalled();
  });

  it("disposed while the models load: init binds no input handler and leaves no resize subscription", async () => {
    const { scene } = createScene();
    const surface = createSurface();
    const unsubscribe = vi.fn();
    surface.onResize = vi.fn(() => unsubscribe);
    let release!: () => void;
    (scene as any).assets.preloadAll = vi.fn(() => new Promise<void>((r) => (release = r)));

    const pending = scene.init({ surface });
    scene.dispose();
    release();
    await pending;

    expect(surface.bindInput).not.toHaveBeenCalled();
    // The resize subscription is taken before the load (a resize during it counts) and released by the dispose.
    expect(surface.onResize).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("init after dispose works again on the same instance", async () => {
    const { scene, renderer } = createScene();
    await scene.init({ surface: createSurface() });
    scene.dispose();

    await scene.init({ surface: createSurface() });
    scene.dispose();

    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(2);
  });
});
