import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import type { RenderSurfaceAdapter } from "../src/core/types";
import type { RendererSettingsInput } from "../src/core/settings";
import type { AmbientEffect } from "../src/core/ambient-loop";
import { placementStubs } from "./helpers/placement-stubs";
import { createCloudUniforms } from "../src/core/cloud-shader";

const adapter: RenderSurfaceAdapter = {
  getSize: () => ({ width: 375, height: 812 }),
  getDevicePixelRatio: () => 2,
  onResize: () => vi.fn(),
  bindInput: vi.fn(),
  unbindInput: vi.fn(),
};

/** A scene on a fake renderer (as `game-scene-daynight.test.ts`'s), with `effects` on its ambient loop; `frames(n)` runs n 60 Hz ticks. */
async function createScene(settings: RendererSettingsInput, effects: AmbientEffect[] = []) {
  const queue: Array<() => void> = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => queue.push(cb));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0));
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const renderer = {
    setPixelRatio: vi.fn(),
    forceContextLoss: vi.fn(),
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    dispose: vi.fn(),
    // Counts the shadow map's redraws: the cloud shadows must ask for none (#573).
    shadowMap: {
      enabled: false,
      type: 0,
      autoUpdate: true,
      redraws: 0,
      get needsUpdate() {
        return false;
      },
      set needsUpdate(on: boolean) {
        if (on) this.redraws++;
      },
    },
    domElement: { width: 750, height: 1624 },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
  };
  const camera = new THREE.PerspectiveCamera(50, 375 / 812, 1, 2000);
  camera.position.set(0, 30, 30);
  const controller = {
    camera,
    controls: { addEventListener: vi.fn(), target: new THREE.Vector3() },
    update: vi.fn(() => false),
    resize: vi.fn(),
    setMode: vi.fn(),
    setBoardBounds: vi.fn(),
    dispose: vi.fn(),
  };
  const scene = new GameScene({ createRenderer: vi.fn(() => renderer as any), createCameraController: vi.fn(() => controller as any) });
  (scene as any).assets.preloadAll = vi.fn().mockResolvedValue(undefined);
  let renders = 0;
  (scene as any).effects = {
    setLook: vi.fn(),
    init: vi.fn(),
    setCapabilities: vi.fn(),
    setProfile: vi.fn(),
    setAntialiasing: vi.fn(),
    setBackdrop: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(() => renders++),
    dispose: vi.fn(),
  };
  const tiles = {
    ...placementStubs(),
    setLook: vi.fn(),
    updateTiles: vi.fn(() => false),
    setStrategyMode: vi.fn(),
    setHover: vi.fn(),
    setAvailableSlots: vi.fn(),
    setOutlineStroke: vi.fn(),
    updateBoardFrame: vi.fn(),
    setNightLights: vi.fn(),
    setNightLevel: vi.fn(),
    cloudUniforms: createCloudUniforms(),
    dispose: vi.fn(),
  };
  (scene as any).tiles = tiles;
  await scene.init({ surface: adapter, settings });
  for (const effect of effects) scene.ambient.register(effect);
  scene.start();
  const frames = (count: number) => {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      queue.shift()?.();
    }
  };
  return { scene, tiles, frames, renders: () => renders, shadowRedraws: () => renderer.shadowMap.redraws };
}

// The loop's own tests: the cloud shadows (#573, `game-scene-clouds.test.ts`) left out, so only the test's effects step.
const ON: RendererSettingsInput = { quality: "medium", ambient: { enabled: true, reducedMotion: false, clouds: { enabled: false } } };

/** An effect that always moves: each step of the loop asks for a frame. */
const moving = () => ({ step: vi.fn((_seconds: number) => true) });

describe("GameScene: the ambient loop (#572)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is off by default: nothing draws on its own, even with an effect registered", async () => {
    const effect = moving();
    const { scene, frames, renders } = await createScene({}, [effect]);
    const before = renders();
    frames(60);
    expect(renders() - before).toBe(0);
    expect(effect.step).not.toHaveBeenCalled();
    expect(scene.getAmbient()).toMatchObject({ running: false, fps: 30 });
    scene.dispose();
  });

  it("on with a moving effect: draws about 30 frames a second at 60 Hz, stops covered, off, on Low", async () => {
    const effect = moving();
    const { scene, frames, renders } = await createScene(ON, [effect]);
    expect(scene.getAmbient()).toMatchObject({ running: true, fps: 30 });
    frames(5);
    const before = renders();
    frames(60);
    const drawnFrames = renders() - before;
    expect(drawnFrames).toBeGreaterThanOrEqual(28);
    expect(drawnFrames).toBeLessThanOrEqual(31);
    // The effect reads the loop's time, which moved.
    expect(scene.ambient.time.value).toBeGreaterThan(0.9);

    // Covered (a full-screen sheet, the score panel): the board goes idle.
    scene.setCovered(true);
    frames(2);
    const covered = renders();
    frames(60);
    expect(renders() - covered).toBe(0);
    scene.setCovered(false);
    frames(60);
    expect(renders() - covered).toBeGreaterThan(25);

    // The setting off: the loop stops.
    scene.setSettings({ ...ON, ambient: { enabled: false, clouds: { enabled: false } } });
    frames(2);
    const off = renders();
    frames(60);
    expect(renders() - off).toBe(0);
    expect(scene.getAmbient().running).toBe(false);

    // The Low tier: off, whatever the setting.
    scene.setSettings({ ...ON, quality: "low" });
    expect(scene.getAmbient().running).toBe(false);
    scene.setSettings(ON);
    expect(scene.getAmbient().running).toBe(true);

    scene.dispose();
    expect(scene.getAmbient().running).toBe(false);
  });

  it("under reduced motion (the setting, or the device's for auto): off", async () => {
    const { scene } = await createScene({ ...ON, ambient: { enabled: true, reducedMotion: true, clouds: { enabled: false } } }, [moving()]);
    expect(scene.getAmbient().running).toBe(false);
    scene.dispose();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const auto = await createScene({ ...ON, ambient: { enabled: true, clouds: { enabled: false } } }, [moving()]);
    expect(auto.scene.getAmbient().running).toBe(false);
    auto.scene.dispose();
  });

  it("on with no effect registered: the board stays idle", async () => {
    const { scene, frames, renders } = await createScene(ON, []);
    expect(scene.getAmbient().running).toBe(false);
    frames(5);
    const before = renders();
    frames(60);
    expect(renders() - before).toBe(0);
    scene.dispose();
  });
});

describe("GameScene: the cloud shadows (#573) on the ambient loop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const CLOUDS: RendererSettingsInput = { quality: "medium", ambient: { enabled: true, reducedMotion: false } };

  it("load their chunk the first time the effects are on, drift on the loop and never redraw the shadow map", async () => {
    const { scene, tiles, frames, renders, shadowRedraws } = await createScene(CLOUDS);
    await vi.waitFor(() => expect(scene.getClouds()).not.toBeNull());
    expect(scene.getClouds()).toMatchObject({ visible: true, coverage: 0.4, darkness: 0.2, wisps: false });
    // The tile shader's term reads the effect's map and darkness.
    expect(tiles.cloudUniforms.uCloudDark.value).toBe(0.2);
    expect(tiles.cloudUniforms.uCloudMap.value.image.width).toBe(128);
    expect(scene.getAmbient().running).toBe(true);

    frames(10);
    const redraws = shadowRedraws();
    const before = renders();
    const offset = tiles.cloudUniforms.uCloudOffset.value.clone();
    frames(120);
    // Two seconds at 60 Hz: the loop steps 30 a second, the clouds draw when they moved a quarter of a voxel (about 15 a second).
    expect(renders() - before).toBeGreaterThanOrEqual(25);
    expect(renders() - before).toBeLessThanOrEqual(31);
    expect(tiles.cloudUniforms.uCloudOffset.value.equals(offset)).toBe(false);
    expect(shadowRedraws()).toBe(redraws);

    // Off with the setting: the term off, nothing more drawn.
    scene.setSettings({ ...CLOUDS, ambient: { enabled: false } });
    expect(tiles.cloudUniforms.uCloudDark.value).toBe(0);
    frames(2);
    const off = renders();
    frames(60);
    expect(renders() - off).toBe(0);

    // The clouds' own switch: the loop has nothing that moves, so the board stays idle.
    scene.setSettings({ ...CLOUDS, ambient: { enabled: true, reducedMotion: false, clouds: { enabled: false } } });
    expect(tiles.cloudUniforms.uCloudDark.value).toBe(0);
    frames(2);
    const own = renders();
    frames(60);
    expect(renders() - own).toBe(0);

    scene.setSettings(CLOUDS);
    expect(tiles.cloudUniforms.uCloudDark.value).toBe(0.2);
    scene.dispose();
    expect(tiles.cloudUniforms.uCloudDark.value).toBe(0);
    expect(scene.getClouds()).toBeNull();
  });

  it("do not load on the Low tier, nor with the effects off", async () => {
    const low = await createScene({ ...CLOUDS, quality: "low" });
    const off = await createScene({ quality: "medium" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(low.scene.getClouds()).toBeNull();
    expect(off.scene.getClouds()).toBeNull();
    low.scene.dispose();
    off.scene.dispose();
  });
});
