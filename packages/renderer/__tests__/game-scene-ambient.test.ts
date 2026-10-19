import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import type { RenderSurfaceAdapter } from "../src/core/types";
import type { RendererSettingsInput } from "../src/core/settings";
import { placementStubs } from "./helpers/placement-stubs";
import { SOURCES, loadMesh } from "./helpers/model-meshes";

const HEAVY_TEST_MS = 60_000;

const adapter: RenderSurfaceAdapter = {
  getSize: () => ({ width: 375, height: 812 }),
  getDevicePixelRatio: () => 2,
  onResize: () => vi.fn(),
  bindInput: vi.fn(),
  unbindInput: vi.fn(),
};

/** A drawn tile of `plan` as `TileRenderer.drawnModels` gives it: the type's model and the tile's copy in its container. */
async function drawnTile(plan: string) {
  const type = new THREE.Group();
  type.add(await loadMesh(join(SOURCES, `${plan}.glb`)));
  const container = new THREE.Group();
  const tile = type.clone();
  container.add(tile);
  return { key: plan, type, tile };
}

/** A scene on a fake renderer (as `game-scene-daynight.test.ts`'s), its tiles drawing `drawn`; `frame()` runs one 60 Hz tick. */
async function createScene(settings: RendererSettingsInput, drawn: Awaited<ReturnType<typeof drawnTile>>[] = []) {
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
    shadowMap: { enabled: false, type: 0, autoUpdate: true, needsUpdate: false },
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
    drawnModels: vi.fn(() => drawn),
    dispose: vi.fn(),
  };
  (scene as any).tiles = tiles;
  await scene.init({ surface: adapter, settings });
  await (scene as any).ambientLoad;
  await (scene as any).ambientParticles?.whenReady();
  scene.start();
  const frames = (count: number) => {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      queue.shift()?.();
    }
  };
  return { scene, tiles, frames, renders: () => renders };
}

const ON: RendererSettingsInput = { quality: "medium", ambient: { enabled: true, reducedMotion: false } };

describe("GameScene: the ambient loop and the particles (#572)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is off by default: the particles' chunk is not loaded, nothing draws on its own", async () => {
    const { scene, frames, renders } = await createScene({}, []);
    expect((scene as any).ambientLoad).toBeNull();
    const before = renders();
    frames(60);
    expect(renders() - before).toBe(0);
    expect(scene.getAmbient()).toMatchObject({ running: false, drawCalls: 0 });
    scene.dispose();
  });

  it(
    "on: loads the chunk, adds two draws to the board's group, and draws about 30 frames a second at 60 Hz",
    async () => {
      const drawn = [await drawnTile("rfffrfcfr"), await drawnTile("wffffffff")];
      const { scene, frames, renders } = await createScene(ON, drawn);
      expect(scene.getAmbient()).toMatchObject({ running: true, fps: 30, drawCalls: 2 });
      expect(scene.scene.getObjectByName("ambient-particles")).toBeDefined();
      frames(5);
      const before = renders();
      frames(60);
      const drawnFrames = renders() - before;
      expect(drawnFrames).toBeGreaterThanOrEqual(28);
      expect(drawnFrames).toBeLessThanOrEqual(31);

      // Covered (a full-screen sheet, the score panel): the board goes idle.
      scene.setCovered(true);
      frames(2);
      const covered = renders();
      frames(60);
      expect(renders() - covered).toBe(0);
      scene.setCovered(false);
      frames(60);
      expect(renders() - covered).toBeGreaterThan(25);

      // The setting off: the particles hide (one last frame) and the loop stops.
      scene.setSettings({ ...ON, ambient: { enabled: false } });
      frames(2);
      const off = renders();
      frames(60);
      expect(renders() - off).toBe(0);
      expect(scene.getAmbient()).toMatchObject({ running: false, drawCalls: 0 });
      expect(scene.scene.getObjectByName("ambient-particles")!.visible).toBe(false);

      // The Low tier: off, whatever the setting.
      scene.setSettings({ ...ON, quality: "low" });
      expect(scene.getAmbient().running).toBe(false);
      scene.setSettings(ON);
      expect(scene.getAmbient().running).toBe(true);

      const particles = scene.scene.getObjectByName("ambient-particles")!;
      const disposes = (particles.children as THREE.Points[]).map((p) => vi.spyOn(p.geometry, "dispose"));
      scene.dispose();
      for (const spy of disposes) expect(spy).toHaveBeenCalled();
      expect(scene.getAmbient().running).toBe(false);
    },
    HEAVY_TEST_MS,
  );

  it("under reduced motion (the setting, or the device's for auto): never loaded", async () => {
    const { scene } = await createScene({ ...ON, ambient: { enabled: true, reducedMotion: true } }, []);
    expect((scene as any).ambientLoad).toBeNull();
    scene.dispose();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const auto = await createScene({ ...ON, ambient: { enabled: true } }, []);
    expect((auto.scene as any).ambientLoad).toBeNull();
    auto.scene.dispose();
  });

  it("a board with no water and no wonder stays idle with the effects on", async () => {
    const { scene, frames, renders } = await createScene(ON, []);
    expect(scene.getAmbient().running).toBe(true);
    frames(5);
    const before = renders();
    frames(60);
    expect(renders() - before).toBe(0);
    scene.dispose();
  });
});
