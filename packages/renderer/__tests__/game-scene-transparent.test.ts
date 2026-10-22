import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import { DEFAULT_RENDERER_SETTINGS, resolveRendererSettings } from "../src/core/settings";
import { FinishPass, finishDefines } from "../src/core/post-shaders";
import type { RenderSurfaceAdapter } from "../src/core/types";
import { placementStubs } from "./helpers/placement-stubs";

const adapter: RenderSurfaceAdapter = {
  getSize: () => ({ width: 320, height: 200 }),
  getDevicePixelRatio: () => 1,
  onResize: () => vi.fn(),
  bindInput: vi.fn(),
  unbindInput: vi.fn(),
};

/** A scene on fakes, its renderer factory and clear colour recorded. */
async function createScene(transparent?: boolean) {
  const renderer = {
    setPixelRatio: vi.fn(),
    forceContextLoss: vi.fn(),
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    dispose: vi.fn(),
    shadowMap: { enabled: false, type: 0, autoUpdate: true, needsUpdate: false },
    domElement: { width: 320, height: 200 },
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
    dispose: vi.fn(),
  };
  const createRenderer = vi.fn((_surface: RenderSurfaceAdapter, _transparent?: boolean) => renderer as any);
  const scene = new GameScene({ createRenderer, createCameraController: vi.fn(() => controller as any) });
  (scene as any).assets.preloadAll = vi.fn().mockResolvedValue(undefined);
  (scene as any).effects = { setLook: vi.fn(), setTransparent: vi.fn(), init: vi.fn(), setCapabilities: vi.fn(), setProfile: vi.fn(), setBackdrop: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
  (scene as any).tiles = { ...placementStubs(), setLook: vi.fn(), updateTiles: vi.fn(), setStrategyMode: vi.fn(), setHover: vi.fn(), setAvailableSlots: vi.fn(), setOutlineStroke: vi.fn(), updateBoardFrame: vi.fn() };
  await scene.init({ surface: adapter, settings: transparent === undefined ? undefined : { transparent } });
  return { scene, renderer, createRenderer, effects: (scene as any).effects };
}

// The app's tile stack draws its tiles over the page (`StackView`): a canvas with alpha, nothing behind the tiles.
describe("GameScene over the page (transparent)", () => {
  it("is off by default, and a partial input keeps it as given", () => {
    expect(DEFAULT_RENDERER_SETTINGS.transparent).toBe(false);
    expect(resolveRendererSettings({ transparent: true }).transparent).toBe(true);
    expect(resolveRendererSettings({ quality: "low" }, resolveRendererSettings({ transparent: true })).transparent).toBe(true);
  });

  it("asks its renderer for alpha, clears to transparent, draws no background or fog, and premultiplies its output", async () => {
    const { scene, renderer, createRenderer, effects } = await createScene(true);
    expect(effects.setTransparent).toHaveBeenCalledWith(true);
    expect(createRenderer.mock.calls[0]![1]).toBe(true);
    expect(renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0);
    expect(scene.scene.background).toBeNull();
    expect(scene.scene.fog).toBeNull();
  });

  it("the board keeps its opaque canvas, its background, its fog and its finish pass", async () => {
    const { scene, renderer, createRenderer, effects } = await createScene();
    expect(effects.setTransparent).not.toHaveBeenCalled();
    expect(createRenderer.mock.calls[0]![1]).toBe(false);
    expect(renderer.setClearColor).not.toHaveBeenCalled();
    expect(scene.scene.background).toBeInstanceOf(THREE.Color);
    expect(scene.scene.fog).not.toBeNull();
  });
});

describe("the finish pass over the page", () => {
  const look = resolveRendererSettings().look;

  it("un-premultiplies the scene's colour before the tone map and premultiplies the result; the backdrop wins over it", () => {
    expect(finishDefines(look, false, false, true)).toHaveProperty("PREMULTIPLIED");
    expect(finishDefines(look, false, false, false)).not.toHaveProperty("PREMULTIPLIED");
    expect(finishDefines(look, false, true, true)).not.toHaveProperty("PREMULTIPLIED");
    const pass = new FinishPass(look, null, false, true);
    expect(pass.material.defines).toHaveProperty("PREMULTIPLIED");
    const shader = pass.material.fragmentShader;
    expect(shader.indexOf("color.rgb /= max(color.a, 1e-4);")).toBeGreaterThan(-1);
    expect(shader.indexOf("color.rgb /= max(color.a, 1e-4);")).toBeLessThan(shader.indexOf("AgXToneMapping(color.rgb)"));
    expect(shader.indexOf("gl_FragColor.rgb *= clamp(gl_FragColor.a, 0.0, 1.0);")).toBeGreaterThan(shader.indexOf("sRGBTransferOETF(color)"));
  });
});
