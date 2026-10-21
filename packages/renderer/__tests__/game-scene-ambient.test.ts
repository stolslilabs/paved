import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import type { RenderSurfaceAdapter } from "../src/core/types";
import type { RendererSettingsInput } from "../src/core/settings";
import type { AmbientEffect } from "../src/core/ambient-loop";
import { placementStubs } from "./helpers/placement-stubs";
import { createCloudUniforms } from "../src/core/cloud-shader";
import { createSnowUniforms } from "../src/core/snow-shader";
import { boardReveal } from "../src/core/fog-of-war-settings";
import { DEFAULT_WEATHER_SETTINGS } from "../src/core/weather-settings";

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
    snowUniforms: createSnowUniforms(),
    group: new THREE.Group(),
    getGroup() {
      return this.group;
    },
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

  it("at a held night step no frame unless they dim the moon, whatever the window lights' switch", async () => {
    const night = { enabled: true, freezeAt: 0.8, reducedMotion: false };
    const { scene, tiles, frames, renders } = await createScene({ ...CLOUDS, dayNight: night });
    await (scene as any).dayNightLoad;
    await vi.waitFor(() => expect(scene.getClouds()).not.toBeNull());
    expect(scene.getDayNight()).toMatchObject({ phase: "night" });
    // The default: the clouds go with the sun. Nothing to dim, nothing drawn, the time frozen board stays idle.
    expect(scene.getClouds()).toMatchObject({ visible: false });
    expect(tiles.cloudUniforms.uCloudDark.value).toBe(0);
    frames(10);
    const idle = renders();
    frames(120);
    expect(renders() - idle).toBe(0);

    // The moon's share on: the clouds dim the moon, at its share times the night's level, with the windows on or off.
    for (const nightLights of [true, false]) {
      scene.setSettings({ ...CLOUDS, dayNight: { ...night, nightLights }, ambient: { enabled: true, reducedMotion: false, clouds: { moon: 0.5 } } });
      expect(scene.getClouds()).toMatchObject({ visible: true });
      expect(tiles.cloudUniforms.uCloudDark.value).toBe(0.2);
      expect(tiles.cloudUniforms.uCloudMoon.value).toBeCloseTo(0.5);
      frames(10);
      const moving = renders();
      frames(120);
      expect(renders() - moving).toBeGreaterThan(20);
    }

    // By day the moon's share is 0: only the sun is dimmed.
    scene.setSettings({ ...CLOUDS, dayNight: { ...night, freezeAt: 0.3 }, ambient: { enabled: true, reducedMotion: false, clouds: { moon: 0.5 } } });
    expect(tiles.cloudUniforms.uCloudMoon.value).toBe(0);
    expect(scene.getClouds()).toMatchObject({ visible: true });
    scene.dispose();
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

describe("GameScene: the weather (#658) in every board", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The game's board: the ambient effects on (their setting's default), the cycle held at a season's noon by the fixed wheel. */
  const held = (season: number, extra: RendererSettingsInput = {}): RendererSettingsInput => ({
    quality: "medium",
    ambient: { enabled: true, reducedMotion: false, clouds: { enabled: false } },
    dayNight: { enabled: true, freezeAt: season + 0.3, reducedMotion: false },
    ...extra,
  });
  const AUTUMN = 1;
  const WINTER = 2;

  it("loads its chunk, follows the wheel's season and fades into the next over three seconds on the loop", async () => {
    const { scene, tiles, frames, renders } = await createScene(held(AUTUMN));
    await (scene as any).dayNightLoad;
    await vi.waitFor(() => expect(scene.getWeather()).not.toBeNull());
    frames(2);
    expect(scene.getWeather()).toMatchObject({ mode: "moving", season: "autumn", presence: { autumn: 1 } });
    expect(scene.getWeather()!.particles.rain).toBeGreaterThan(0);
    // The rain falls: the loop draws about 30 frames a second.
    const before = renders();
    frames(60);
    expect(renders() - before).toBeGreaterThanOrEqual(28);

    // A tap on the wheel (fixed: the next season held): winter fades in as autumn fades out.
    scene.setSettings(held(WINTER));
    frames(90);
    const mid = scene.getWeather()!;
    expect(mid.season).toBe("winter");
    expect(mid.presence.winter).toBeGreaterThan(0.3);
    expect(mid.presence.winter).toBeLessThan(0.7);
    expect(mid.presence.autumn).toBeCloseTo(1 - mid.presence.winter);
    frames(120);
    expect(scene.getWeather()).toMatchObject({ presence: { autumn: 0, winter: 1 } });
    expect(tiles.snowUniforms.uSnowCover.value).toBeCloseTo(DEFAULT_WEATHER_SETTINGS.winter.cover);
    expect(tiles.snowUniforms.uSnowVeil.value).toBe(DEFAULT_WEATHER_SETTINGS.winter.veil);

    scene.dispose();
    expect(scene.getWeather()).toBeNull();
    expect(tiles.snowUniforms.uSnowCover.value).toBe(0);
  });

  it("is off with the 'Ambient effects' off and on the Low tier; still under reduced motion", async () => {
    const { scene, tiles } = await createScene(held(WINTER));
    await (scene as any).dayNightLoad;
    await vi.waitFor(() => expect(scene.getWeather()).not.toBeNull());
    expect(scene.getWeather()!.mode).toBe("moving");

    scene.setSettings(held(WINTER, { ambient: { enabled: false } }));
    expect(scene.getWeather()).toMatchObject({ mode: "off", drawCalls: 0 });
    expect(tiles.snowUniforms.uSnowCover.value).toBe(0);

    scene.setSettings(held(WINTER, { quality: "low" }));
    expect(scene.getWeather()).toMatchObject({ mode: "off", drawCalls: 0 });

    // Reduced motion: nothing falls, the grade and the veil stay, the loop is off (nothing steps, nothing draws on its own).
    scene.setSettings(held(WINTER, { ambient: { enabled: true, reducedMotion: true, clouds: { enabled: false } } }));
    expect(scene.getWeather()).toMatchObject({ mode: "still", season: "winter", particles: { snow: 0 }, drawCalls: 1 });
    expect(tiles.snowUniforms.uSnowCover.value).toBeGreaterThan(0);
    expect(scene.getAmbient().running).toBe(false);
    scene.dispose();
  });

  it("with Day and night off (the wheel's fixed summer, the look's lights): summer's brightness, by day", async () => {
    const { scene } = await createScene(held(WINTER, { dayNight: { enabled: false } }));
    await vi.waitFor(() => expect(scene.getWeather()).not.toBeNull());
    expect(scene.getDayNight()).toBeNull();
    expect(scene.getWeather()).toMatchObject({ mode: "moving", season: "summer", daylight: 1, presence: { summer: 1 }, drawCalls: 1 });
    // Turned on, the cycle's season takes over (winter held by the wheel).
    scene.setSettings(held(WINTER));
    await (scene as any).dayNightLoad;
    expect(scene.getWeather()!.season).toBe("winter");
    scene.dispose();
  });

  it("does not load with the effects off, nor on the Low tier", async () => {
    const off = await createScene(held(AUTUMN, { ambient: { enabled: false } }));
    const low = await createScene(held(AUTUMN, { quality: "low" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    for (const { scene } of [off, low]) {
      expect((scene as any).weatherLoad).toBeNull();
      scene.dispose();
    }
  });

  it("brings autumn's more clouds to the cloud shadows while it shows", async () => {
    const { scene } = await createScene(held(AUTUMN, { ambient: { enabled: true, reducedMotion: false } }));
    const coverage = (scene as any).cloudSettings().seasonCoverage.autumn;
    expect(coverage).toBeCloseTo(1.2 * DEFAULT_WEATHER_SETTINGS.autumn.clouds);
    scene.setSettings(held(AUTUMN, { ambient: { enabled: true, reducedMotion: false }, weather: { enabled: false } }));
    expect((scene as any).cloudSettings().seasonCoverage.autumn).toBeCloseTo(1.2);
    scene.dispose();
  });
});

describe("GameScene: the fog of war (#648)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const FOG: RendererSettingsInput = { ...ON, fog: { enabled: true } };
  const board = boardReveal([{ x: 0, y: 0 }]);

  it("is off by default, and loads nothing without a reveal", async () => {
    const off = await createScene(ON);
    off.scene.setFogReveal(board);
    await new Promise((r) => setTimeout(r, 0));
    expect(off.scene.getFog()).toBeNull();
    off.scene.dispose();
    const noReveal = await createScene(FOG);
    await new Promise((r) => setTimeout(r, 0));
    expect(noReveal.scene.getFog()).toBeNull();
    noReveal.scene.dispose();
  });

  it("on with a reveal: loads its chunk in the board's group, the owner's variant (the landscape, rounded corners)", async () => {
    const { scene, tiles } = await createScene(FOG);
    scene.setFogReveal(board);
    await vi.waitFor(() => expect(scene.getFog()).not.toBeNull());
    expect(scene.getFog()).toMatchObject({ mode: "moving", cells: board.length });
    expect(scene.getFog()!.props).toBeGreaterThan(0);
    // The Landscape story's falloff and billow (#633), the study's drift and mist.
    expect(scene.getSettings().fog).toMatchObject({ enabled: true, falloff: 2.5, billow: 0.7, drift: 0.6, mist: 0.35, cornerRadius: 0.5, landscape: { enabled: true } });
    expect(tiles.group.children.some((o) => o.name === "fog-of-war")).toBe(true);
    // A tile placed: the fog lifts on the loop.
    scene.setFogReveal(boardReveal([{ x: 0, y: 0 }, { x: 1, y: 0 }]), [{ x: 1, y: 0 }]);
    expect(scene.getFog()).toMatchObject({ lifting: true });
    scene.dispose();
    expect(tiles.group.children.some((o) => o.name === "fog-of-war")).toBe(false);
  });

  it("stays on at every tier: still on Low and with the effects off; gone without a reveal or with the setting off", async () => {
    const { scene } = await createScene(FOG);
    scene.setFogReveal(board);
    await vi.waitFor(() => expect(scene.getFog()).not.toBeNull());
    scene.setSettings({ ...FOG, quality: "low" });
    expect(scene.getFog()!.mode).toBe("still");
    scene.setSettings({ ...FOG, ambient: { enabled: false } });
    expect(scene.getFog()!.mode).toBe("still");
    scene.setSettings({ ...FOG, fog: { enabled: false } });
    expect(scene.getFog()!.mode).toBe("off");
    scene.setSettings(FOG);
    expect(scene.getFog()!.mode).toBe("moving");
    scene.setFogReveal(null);
    expect(scene.getFog()!.mode).toBe("off");
    scene.dispose();
  });

  it("names the grid cell under a point of the surface (a drag's drop on the board), none before init", async () => {
    expect(new GameScene().gridAt({ x: 10, y: 10 })).toBeNull();
    const { scene } = await createScene(FOG);
    // The camera at (0, 30, 30) looks at the board's origin: the screen's middle is over cell (0, 0).
    (scene as any).camera.lookAt(0, 0, 0);
    expect(scene.gridAt({ x: 375 / 2, y: 812 / 2 })).toEqual({ x: 0, y: 0 });
    scene.dispose();
  });

  it("ends a lift at once when the device turns reduced motion on mid-lift", async () => {
    const device = { reduce: false, listeners: [] as Array<() => void> };
    vi.stubGlobal("matchMedia", (q: string) => ({
      get matches() {
        return q.includes("reduce") && device.reduce;
      },
      addEventListener: (_: string, listener: () => void) => device.listeners.push(listener),
      removeEventListener: vi.fn(),
    }));
    // The ambient effects follow the device's reduced motion ("auto").
    const { scene, frames } = await createScene({ ...FOG, ambient: { enabled: true, reducedMotion: "auto", clouds: { enabled: false } } });
    scene.setFogReveal(board);
    await vi.waitFor(() => expect(scene.getFog()).not.toBeNull());
    frames(10);
    scene.setFogReveal(boardReveal([{ x: 0, y: 0 }, { x: 1, y: 0 }]), [{ x: 1, y: 0 }]);
    expect(scene.getFog()).toMatchObject({ mode: "moving", lifting: true });
    device.reduce = true;
    for (const listener of device.listeners) listener();
    expect(scene.getAmbient().running).toBe(false);
    expect(scene.getFog()).toMatchObject({ mode: "still", lifting: false });
    scene.dispose();
  });
});
