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

/** A scene whose effects record, at each render, whether the shadow map was due to be drawn. */
async function createScene() {
  const renderer = {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    dispose: vi.fn(),
    shadowMap: { enabled: false, type: 0, autoUpdate: true, needsUpdate: false },
    domElement: { width: 320, height: 200 },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
  };
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
  let onCameraChange = () => {};
  const controller = {
    camera,
    controls: {
      addEventListener: vi.fn((_type: string, cb: () => void) => (onCameraChange = cb)),
      target: new THREE.Vector3(),
    },
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
  const shadowDrawn: boolean[] = [];
  (scene as any).effects = {
    init: vi.fn(),
    setCapabilities: vi.fn(),
    setProfile: vi.fn(),
    resize: vi.fn(),
    // three draws the map when needsUpdate is set, then clears it
    render: vi.fn(() => {
      shadowDrawn.push(renderer.shadowMap.needsUpdate);
      renderer.shadowMap.needsUpdate = false;
    }),
    dispose: vi.fn(),
  };
  (scene as any).tiles = { updateTiles: vi.fn(), setStrategyMode: vi.fn(), setHover: vi.fn(), setAvailableSlots: vi.fn() };
  await scene.init({ surface: adapter });
  return { scene, renderer, shadowDrawn, moveCamera: () => onCameraChange() };
}

describe("GameScene shadow map", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws the shadow map when the tiles change, not when only the camera moves", async () => {
    const queue: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => queue.push(cb));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { scene, renderer, shadowDrawn, moveCamera } = await createScene();
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(false);

    scene.start(); // first frame draws the map
    moveCamera();
    queue.shift()!();
    scene.updateTiles([]);
    queue.shift()!();
    moveCamera();
    queue.shift()!();
    scene.setHoveredTile(null);
    scene.setAvailableSlots([]);
    queue.shift()!();
    scene.setCompassRotation(Math.PI / 2);
    queue.shift()!();
    scene.setStrategyMode(true);
    queue.shift()!();

    expect(shadowDrawn).toEqual([true, false, true, false, false, true, true]);
  });
});
