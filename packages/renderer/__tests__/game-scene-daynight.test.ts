import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import type { RenderSurfaceAdapter } from "../src/core/types";
import type { RendererSettingsInput } from "../src/core/settings";
import { DAY_PHASE_AT, DEFAULT_WINDOW_LIGHT } from "../src/core/daynight-settings";
import { dayNightFrame, sunAt, DAY_SHARE } from "../src/core/daynight";
import { placementStubs } from "./helpers/placement-stubs";

const adapter: RenderSurfaceAdapter = {
  getSize: () => ({ width: 1280, height: 800 }),
  getDevicePixelRatio: () => 1,
  onResize: () => vi.fn(),
  bindInput: vi.fn(),
  unbindInput: vi.fn(),
};

/** A scene on a fake renderer, its effects and tiles recording what the cycle sets; `frame()` runs one loop tick. */
async function createScene(settings: RendererSettingsInput) {
  const queue: Array<() => void> = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => queue.push(cb));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const renderer = {
    setPixelRatio: vi.fn(),
    forceContextLoss: vi.fn(),
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    dispose: vi.fn(),
    shadowMap: { enabled: false, type: 0, autoUpdate: true, needsUpdate: false },
    domElement: { width: 1280, height: 800 },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
  };
  const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
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
  const renders: number[] = [];
  const shadows: boolean[] = [];
  const effects = {
    setLook: vi.fn(),
    init: vi.fn(),
    setCapabilities: vi.fn(),
    setProfile: vi.fn(),
    setAntialiasing: vi.fn(),
    setBackdrop: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(() => {
      renders.push(now);
      shadows.push(renderer.shadowMap.needsUpdate);
      renderer.shadowMap.needsUpdate = false;
    }),
    dispose: vi.fn(),
  };
  (scene as any).effects = effects;
  const tiles = {
    ...placementStubs(),
    setLook: vi.fn(),
    updateTiles: vi.fn(),
    setStrategyMode: vi.fn(),
    setHover: vi.fn(),
    setAvailableSlots: vi.fn(),
    setOutlineStroke: vi.fn(),
    updateBoardFrame: vi.fn(),
    setNightLights: vi.fn(),
    setNightLevel: vi.fn(),
    dispose: vi.fn(),
  };
  (scene as any).tiles = tiles;
  await scene.init({ surface: adapter, settings });
  await (scene as any).dayNightLoad;
  scene.start();
  const frame = (ms = 16) => {
    now += ms;
    queue.shift()?.();
  };
  return {
    scene, renderer, effects, tiles, renders, shadows, frame,
    key: () => (scene as any).directionalLight as THREE.DirectionalLight,
    /** The scene's shadow-casting lights: the key alone, or the key and its twin while the cycle moves. */
    casters: () => scene.scene.children.filter((c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight && c.castShadow),
  };
}

/** The key light's direction toward its light, from its position (the target is the origin). */
const directionOf = (light: THREE.DirectionalLight) => light.position.clone().normalize();

describe("GameScene: the day and night cycle (DAYNIGHT)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is off by default: the look's flat background, no backdrop, the cycle's chunk not loaded", async () => {
    const { scene, effects, tiles } = await createScene({});
    expect(scene.scene.background).toBeInstanceOf(THREE.Color);
    expect(effects.setBackdrop).not.toHaveBeenCalled();
    expect(tiles.setNightLights).not.toHaveBeenCalled();
    expect((scene as any).dayNightLoad).toBeNull();
    expect(scene.getDayNight()).toBeNull();
    scene.dispose();
  });

  it("hands the night lights' source to the tiles: windows when set, never while the cycle is still", async () => {
    const lit = await createScene({ dayNight: { enabled: true, freezeAt: 2 + DAY_PHASE_AT.night, reducedMotion: false, lights: "windows" } });
    expect(lit.tiles.setNightLights).toHaveBeenLastCalledWith(true, "#ffb57a", 0.4, "windows", DEFAULT_WINDOW_LIGHT);
    lit.scene.dispose();
    const still = await createScene({ dayNight: { enabled: true, freezeAt: 2 + DAY_PHASE_AT.night, reducedMotion: true, lights: "windows" } });
    expect(still.tiles.setNightLights).toHaveBeenLastCalledWith(false, "#ffb57a", 0.4, "windows", DEFAULT_WINDOW_LIGHT);
    still.scene.dispose();
    // The windows' own light (#571), field by field over its defaults.
    const tuned = await createScene({ dayNight: { enabled: true, freezeAt: 2 + DAY_PHASE_AT.night, reducedMotion: false, lights: "windows", windowLight: { margin: 0, intensity: 2 } } });
    expect(tuned.tiles.setNightLights).toHaveBeenLastCalledWith(true, "#ffb57a", 0.4, "windows", { ...DEFAULT_WINDOW_LIGHT, margin: 0, intensity: 2 });
    tuned.scene.dispose();
  });

  it("on, draws the backdrop under a transparent scene, and lights the cities at night", async () => {
    const { scene, renderer, effects, tiles, key } = await createScene({ dayNight: { enabled: true, freezeAt: 2 + DAY_PHASE_AT.night, reducedMotion: false } });
    expect(scene.scene.background).toBeNull();
    expect(renderer.setClearColor).toHaveBeenLastCalledWith(0x000000, 0);
    const frame = dayNightFrame(2 + DAY_PHASE_AT.night, 0.85);
    expect(effects.setBackdrop).toHaveBeenLastCalledWith(true, frame.backdrop.top, frame.backdrop.bottom);
    expect(tiles.setNightLights).toHaveBeenLastCalledWith(true, "#ffb57a", 0.4, "columns", DEFAULT_WINDOW_LIGHT);
    expect(tiles.setNightLevel).toHaveBeenLastCalledWith(1);
    expect(key().intensity).toBe(0);
    expect(scene.getDayNight()).toMatchObject({ season: "winter", phase: "night" });
    scene.dispose();
  });

  it("frozen at a summer noon, the sun shines from the south at its height, and nothing redraws on its own", async () => {
    const { scene, key, renders, frame } = await createScene({ dayNight: { enabled: true, freezeAt: DAY_PHASE_AT.day, reducedMotion: false } });
    const sun = sunAt("summer", DAY_PHASE_AT.day);
    const direction = directionOf(key());
    expect(THREE.MathUtils.radToDeg(Math.asin(direction.y))).toBeCloseTo(sun.elevation, 6);
    expect(direction.x).toBeCloseTo(0, 6);
    expect(direction.z).toBeGreaterThan(0);
    frame();
    const after = renders.length;
    for (let i = 0; i < 10; i++) frame(50);
    expect(renders.length).toBe(after);
    scene.dispose();
  });

  it("runs in steps of frameMs: each step draws a frame and moves the shadows, nothing between two steps", async () => {
    const { scene, renders, shadows, frame, key } = await createScene({ dayNight: { enabled: true, season: "summer", reducedMotion: false, frameMs: 100, speed: 10 } });
    frame(); // the first frame
    const before = directionOf(key());
    const start = renders.length;
    const time = (scene as any).dayNightClock.time;
    frame(30);
    frame(30); // still within the same 100 ms step: nothing drawn
    const mid = renders.length;
    frame(60); // a new step
    expect(mid).toBe(start);
    expect(renders.length).toBe(start + 1);
    expect(shadows.at(-1)).toBe(true);
    expect(directionOf(key()).angleTo(before)).toBeGreaterThan(0);
    // x10: the 136 ms of real time since the last step (the loop's first tick, at 1000) are 1.36 s of the cycle.
    expect((scene as any).dayNightClock.time - time).toBeCloseTo(1360, 6);
    scene.dispose();
  });

  it("moves the sun from east to west over the day, and keeps it put through the night (no shadow redrawn)", async () => {
    const { scene, frame, key, shadows } = await createScene({ dayNight: { enabled: true, season: "autumn", reducedMotion: false, frameMs: 10, speed: 1, cycleMs: 1000 } });
    // A 1 s cycle: wait for a morning, then watch the light over the day.
    const point = () => scene.getDayNight()!.position;
    frame(10);
    while (!(point() > 0.1 && point() < 0.15)) frame(10);
    const xs: number[] = [];
    for (let i = 0; i < 30; i++) {
      frame(10);
      xs.push(directionOf(key()).x);
    }
    // Over the day the light's x falls: from the east (+X) toward the west, step by step.
    expect(xs.every((x, i) => i === 0 || x < xs[i - 1])).toBe(true);
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs.at(-1)).toBeLessThan(0);
    // Through the night (after the sunset, before the next dawn): the light stays put, the map is not drawn.
    while (point() < DAY_SHARE + 0.02) frame(10);
    const set = directionOf(key());
    const drawn = shadows.length;
    while (point() < 0.9) frame(10);
    expect(directionOf(key()).distanceTo(set)).toBe(0);
    expect(shadows.slice(drawn).some(Boolean)).toBe(false);
    expect(key().intensity).toBe(0);
    scene.dispose();
  });

  it("is still under reduced motion and on the Low tier: the start season's noon, no night lights, no redraw of its own", async () => {
    for (const settings of [{ dayNight: { enabled: true, season: "spring", reducedMotion: true } }, { quality: "low", dayNight: { enabled: true, season: "spring", reducedMotion: false } }] as RendererSettingsInput[]) {
      const { scene, tiles, renders, frame } = await createScene(settings);
      expect(scene.getDayNight()).toMatchObject({ season: "spring", phase: "day" });
      expect(scene.getDayNight()!.position).toBe(DAY_PHASE_AT.day);
      expect(tiles.setNightLights).toHaveBeenLastCalledWith(false, expect.any(String), expect.any(Number), "columns", DEFAULT_WINDOW_LIGHT);
      frame();
      const after = renders.length;
      for (let i = 0; i < 10; i++) frame(50);
      expect(renders.length).toBe(after);
      scene.dispose();
    }
  });

  it("the Low tier's still noon wins over a frozen night: never a night it is meant to skip", async () => {
    const { scene, tiles } = await createScene({ quality: "low", dayNight: { enabled: true, season: "spring", freezeAt: 2 + DAY_PHASE_AT.night, reducedMotion: false } });
    expect(scene.getDayNight()).toMatchObject({ season: "spring", phase: "day" });
    expect(scene.getDayNight()!.position).toBe(DAY_PHASE_AT.day);
    expect(tiles.setNightLights).toHaveBeenLastCalledWith(false, expect.any(String), expect.any(Number), "columns", DEFAULT_WINDOW_LIGHT);
    scene.dispose();
  });

  it("turned off, gives the look back: its background, an opaque clear, no backdrop, no night lights", async () => {
    const { scene, renderer, effects, tiles } = await createScene({ dayNight: { enabled: true, freezeAt: 0.8, reducedMotion: false } });
    scene.setSettings({ dayNight: { enabled: false } });
    expect(scene.scene.background).toBeInstanceOf(THREE.Color);
    expect(renderer.setClearColor).toHaveBeenLastCalledWith(0x000000, 1);
    expect(effects.setBackdrop).toHaveBeenLastCalledWith(false);
    expect(tiles.setNightLights).toHaveBeenLastCalledWith(false, expect.any(String), expect.any(Number), "columns", DEFAULT_WINDOW_LIGHT);
    expect(scene.getDayNight()).toBeNull();
    scene.dispose();
  });

  it("still or on Low, draws with the key light alone: no twin, one shadow map", async () => {
    for (const settings of [{ dayNight: { enabled: true, reducedMotion: true } }, { quality: "low", dayNight: { enabled: true, reducedMotion: false } }] as RendererSettingsInput[]) {
      const { scene, casters, frame, key } = await createScene(settings);
      for (let i = 0; i < 5; i++) frame(50);
      expect(casters()).toEqual([key()]);
      scene.dispose();
    }
  });

  it("moving, adds the twin; going still releases it and frees its shadow map", async () => {
    const { scene, casters, frame, key } = await createScene({ dayNight: { enabled: true, season: "summer", reducedMotion: false } });
    frame(50);
    expect(casters()).toHaveLength(2);
    const twin = casters().find((l) => l !== key())!;
    const disposed = vi.spyOn(twin.shadow, "dispose");
    scene.setSettings({ dayNight: { enabled: true, season: "summer", reducedMotion: true } });
    expect(casters()).toEqual([key()]);
    expect(disposed).toHaveBeenCalled();
    scene.dispose();
  });

  it("turned off, takes the twin out and frees its shadow map", async () => {
    const { scene, casters, frame, key } = await createScene({ dayNight: { enabled: true, season: "summer", reducedMotion: false } });
    frame(50);
    const twin = casters().find((l) => l !== key())!;
    const disposed = vi.spyOn(twin.shadow, "dispose");
    scene.setSettings({ dayNight: { enabled: false } });
    expect(casters()).toEqual([key()]);
    expect(disposed).toHaveBeenCalled();
    scene.dispose();
  });

  it("disposed with its context kept, frees the twin's shadow map", async () => {
    const { scene, casters, frame, key } = await createScene({ dayNight: { enabled: true, season: "summer", reducedMotion: false } });
    frame(50);
    const twin = casters().find((l) => l !== key())!;
    const disposed = vi.spyOn(twin.shadow, "dispose");
    scene.dispose({ releaseContext: false });
    expect(disposed).toHaveBeenCalled();
  });
});
