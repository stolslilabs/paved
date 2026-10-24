import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { LOOK_PRESETS } from "../src/core/look";
import { Effects, MSAA_SAMPLES, resolveFaceAntialiasing, type FaceAntialiasing } from "../src/core/Effects";
import {
  CAMERA_NEAR,
  CLOSEST_DISTANCE,
  CameraController,
  PLAY_DEFAULT_POLAR_ANGLE,
  TALLEST_TILE_HEIGHT,
  type CameraInputAdapter,
} from "../src/core/CameraController";
import { DEFAULT_RENDERER_SETTINGS, SMALL_SCREEN_PX, resolveMultisampling, resolveRendererSettings } from "../src/core/settings";
import { GameScene } from "../src/core/GameScene";
import { TILE_SIZE } from "../src/core/types";

const MODELS = fileURLToPath(new URL("../../app/asset-sources/models", import.meta.url));

/** A renderer as far as the composer reads it before drawing: sizes and pixel ratio. */
function fakeRenderer(): THREE.WebGLRenderer {
  return {
    getPixelRatio: () => 2,
    getSize: (v: THREE.Vector2) => v.set(400, 300),
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(800, 600),
    domElement: { width: 800, height: 600 },
  } as unknown as THREE.WebGLRenderer;
}

async function composerFor(antialiasing: FaceAntialiasing, samples?: number) {
  const effects = new Effects();
  effects.init(fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), "play", antialiasing, samples);
  await effects.ready();
  return { effects, composer: effects.getComposer()! };
}

describe("face antialiasing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is MSAA where WebGL 2 multisamples on a GPU, SMAA otherwise, and nothing when the setting is off", () => {
    const gpu = { maxSamples: 4, software: false };
    expect(resolveFaceAntialiasing(true, gpu)).toBe("msaa");
    expect(resolveFaceAntialiasing(false, gpu)).toBe("off");
    expect(resolveFaceAntialiasing(true, { maxSamples: 0, software: false })).toBe("smaa");
    expect(resolveFaceAntialiasing(true, { maxSamples: 2, software: false })).toBe("smaa");
    expect(resolveFaceAntialiasing(true, { maxSamples: 16, software: true })).toBe("smaa");
    expect(resolveFaceAntialiasing(true, { ...gpu, supportsMultisampling: false })).toBe("smaa");
    expect(resolveFaceAntialiasing(false, { maxSamples: 0, software: true })).toBe("off");
    // Fewer samples asked, fewer needed.
    expect(resolveFaceAntialiasing(true, { maxSamples: 2, software: false }, 2)).toBe("msaa");
  });

  it("draws the scene into a multisampled target for MSAA, the same target every frame", async () => {
    const { composer } = await composerFor("msaa");
    expect(MSAA_SAMPLES).toBe(4);
    expect(composer.readBuffer.samples).toBe(MSAA_SAMPLES);
    expect(composer.passes.some((pass) => pass instanceof SMAAPass)).toBe(false);
    // No pass swaps the composer's targets: the scene lands in its read buffer every frame, and the write buffer is never
    // bound, so never allocated. A chain that swapped would draw every other frame into the other target.
    expect(composer.passes.filter((pass) => pass.needsSwap)).toEqual([]);
    // The target is the drawing buffer's size.
    expect([composer.readBuffer.width, composer.readBuffer.height]).toEqual([800, 600]);
  });

  it("swaps no target at any tier: the AO and the bloom draw beside the read buffer or into it", () => {
    for (const tier of ["low", "medium", "high"] as const) {
      const effects = new Effects();
      effects.setLook(LOOK_PRESETS.mockup, tier);
      effects.init(fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), "play", "msaa");
      expect(effects.getComposer()!.passes.filter((pass) => pass.needsSwap)).toEqual([]);
    }
  });

  it("takes the samples of the settings, and rebuilds the chain when they change", async () => {
    const { effects, composer } = await composerFor("msaa", 2);
    expect(composer.readBuffer.samples).toBe(2);
    effects.setAntialiasing("msaa", 4);
    expect(effects.getComposer()!.readBuffer.samples).toBe(4);
    expect(DEFAULT_RENDERER_SETTINGS.msaaSamples).toBe(MSAA_SAMPLES);
    expect(resolveRendererSettings({ msaaSamples: 2 }).msaaSamples).toBe(2);
    // An unsupported count is the default.
    expect(resolveRendererSettings({ msaaSamples: 3 }).msaaSamples).toBe(MSAA_SAMPLES);
  });

  it("ends the chain with SMAA instead, on a target with no samples", async () => {
    vi.stubGlobal("Image", class { src = ""; onload: (() => void) | null = null; });
    const { composer } = await composerFor("smaa");
    expect(composer.renderTarget1.samples).toBe(0);
    expect(composer.passes.at(-1)).toBeInstanceOf(SMAAPass);
    // SMAA reads what the finish pass wrote: the finish pass swaps, and SMAA (three's) swaps back, two swaps a frame.
    expect(composer.passes.filter((pass) => pass.needsSwap)).toEqual(composer.passes.slice(-2));
  });

  it("has neither when off, and rebuilds the chain when the mode changes", async () => {
    vi.stubGlobal("Image", class { src = ""; onload: (() => void) | null = null; });
    const { effects, composer } = await composerFor("off");
    expect(composer.renderTarget1.samples).toBe(0);
    expect(composer.passes.some((pass) => pass instanceof SMAAPass)).toBe(false);
    effects.setAntialiasing("msaa");
    expect(effects.getComposer()!.renderTarget1.samples).toBe(MSAA_SAMPLES);
    effects.setAntialiasing("smaa");
    await effects.ready();
    expect(effects.getComposer()!.passes.at(-1)).toBeInstanceOf(SMAAPass);
    expect(effects.getAntialiasing()).toBe("smaa");
  });

  it("is on by default on coarse pointers and small screens, off elsewhere (the 12 ms rule, P4)", () => {
    const desk = { coarsePointer: false, width: 1440, height: 900 };
    expect(DEFAULT_RENDERER_SETTINGS.multisampling).toBe("auto");
    expect(resolveMultisampling("auto", desk)).toBe(false);
    expect(resolveMultisampling("auto", { ...desk, coarsePointer: true })).toBe(true);
    expect(resolveMultisampling("auto", { ...desk, width: 360, height: 780 })).toBe(true);
    expect(resolveMultisampling("auto", { ...desk, width: SMALL_SCREEN_PX + 1 })).toBe(false);
    expect(resolveMultisampling(true, desk)).toBe(true);
    expect(resolveMultisampling(false, { ...desk, coarsePointer: true })).toBe(false);
    // An unknown value is the default.
    expect(resolveRendererSettings({ multisampling: "x" as never }).multisampling).toBe("auto");
  });

  it("follows the window in GameScene: a resize to a small screen turns MSAA on under \"auto\"", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const scene = new GameScene();
    let size = { width: 1440, height: 900 };
    const setAntialiasing = vi.fn();
    (scene as any).effects = { setLook: vi.fn(), setAntialiasing, resize: vi.fn() };
    (scene as any).renderer = { capabilities: { maxSamples: 4 }, setPixelRatio: vi.fn(), setSize: vi.fn() };
    (scene as any).webgl = { renderer: "Apple GPU", software: false, reason: "GPU renderer" };
    (scene as any).surface = { getSize: () => size, getDevicePixelRatio: () => 2 };
    scene.resize();
    expect(setAntialiasing).toHaveBeenLastCalledWith("off", 4);
    size = { width: 360, height: 780 };
    scene.resize();
    expect(setAntialiasing).toHaveBeenLastCalledWith("msaa", 4);
    info.mockRestore();
  });

  it("builds the chain without SMAA until the lazy module arrives, then rebuilds with it and calls back", async () => {
    vi.stubGlobal("Image", class { src = ""; onload: (() => void) | null = null; });
    // A fresh module: the lazy SMAA class is not loaded yet.
    vi.resetModules();
    const fresh = await import("../src/core/Effects");
    const effects = new fresh.Effects();
    const rebuilt = vi.fn();
    effects.setOnRebuilt(rebuilt);
    effects.init(fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), "play", "smaa");
    expect(effects.getPassNames()).not.toContain("smaa");
    await effects.ready();
    expect(effects.getComposer()!.passes.at(-1)!.constructor.name).toBe("SMAAPass");
    expect(effects.getPassNames().at(-1)).toBe("smaa");
    expect(rebuilt).toHaveBeenCalledTimes(1);
  });

  it("leaves SMAA out where there is no Image constructor (React Native)", async () => {
    vi.stubGlobal("Image", undefined);
    const { composer } = await composerFor("smaa");
    expect(composer.passes.some((pass) => pass instanceof SMAAPass)).toBe(false);
  });
});

/** The height of a tile model once scaled as `TileRenderer` does: its largest side to a tile's width. */
function tileHeight(file: string): number {
  const glb = readFileSync(file);
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const box = new THREE.Box3();
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale ?? [1, 1, 1])),
    );
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const { min, max } = gltf.accessors[primitive.attributes.POSITION];
      box.union(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)).applyMatrix4(matrix));
    }
  }
  const size = box.getSize(new THREE.Vector3());
  return (size.y * TILE_SIZE) / Math.max(size.x, size.y, size.z);
}

describe("the camera's near plane", () => {
  const input = () =>
    ({ target: new THREE.Vector3(), addEventListener: vi.fn(), update: () => false, reset: vi.fn(), dispose: vi.fn() }) as unknown as CameraInputAdapter;

  it("is 5, and the closest zoom is the default minDistance of the controls and of the settings", () => {
    const controller = new CameraController({ width: 1440, height: 900 }, {}, input);
    expect(CAMERA_NEAR).toBe(5);
    expect(controller.camera.near).toBe(5);
    expect(controller.controls.minDistance).toBe(CLOSEST_DISTANCE);
    expect(DEFAULT_RENDERER_SETTINGS.camera.minDistance).toBe(CLOSEST_DISTANCE);
  });

  it("stays in front of the tallest tile at the closest zoom and the play camera's locked tilt", () => {
    const files = readdirSync(MODELS).filter((f) => f.endsWith(".glb"));
    expect(files.length).toBeGreaterThan(0);
    const tallest = Math.max(...files.map((f) => tileHeight(`${MODELS}/${f}`)));
    expect(tallest).toBeCloseTo(TALLEST_TILE_HEIGHT, 3);
    // Along the view, a tile top under the target is TALLEST / cos(tilt) closer than the target.
    expect(CAMERA_NEAR + TALLEST_TILE_HEIGHT / Math.cos(PLAY_DEFAULT_POLAR_ANGLE)).toBeLessThanOrEqual(CLOSEST_DISTANCE);
  });
});
