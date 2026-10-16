import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { Effects, type FaceAntialiasing } from "../src/core/Effects";
import { GameScene } from "../src/core/GameScene";
import { LOOK_PRESETS, LOOK_PRESET_NAMES, QUALITY_TIERS, type LookSettings, type QualityTier } from "../src/core/look";
import { AoPass, FinishPass } from "../src/core/post-shaders";
import type { RenderSurfaceAdapter } from "../src/core/types";
import { placementStubs } from "./helpers/placement-stubs";

/** A renderer as far as the composer reads it before drawing: sizes and pixel ratio. */
function fakeRenderer(): THREE.WebGLRenderer {
  return {
    getPixelRatio: () => 2,
    getSize: (v: THREE.Vector2) => v.set(400, 300),
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(800, 600),
    domElement: { width: 800, height: 600 },
  } as unknown as THREE.WebGLRenderer;
}

function effectsFor(look: LookSettings, tier: QualityTier, antialiasing: FaceAntialiasing) {
  const effects = new Effects();
  effects.setLook(look, tier);
  effects.init(fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), "play", antialiasing);
  return effects;
}

/** Every shader material a pass holds, its full-screen quads' and the bloom's arrays included. */
function materialsOf(pass: object): THREE.ShaderMaterial[] {
  const found = new Set<THREE.ShaderMaterial>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 3) return;
    if (value instanceof THREE.ShaderMaterial) return void found.add(value);
    if (value instanceof THREE.Texture || value instanceof THREE.WebGLRenderTarget || value instanceof THREE.Scene || value instanceof THREE.Camera) return;
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child, depth + 1);
    // A full-screen quad keeps its material behind a getter.
    if ("material" in value) visit((value as { material: unknown }).material, depth + 1);
  };
  visit(pass, 0);
  return [...found];
}

const count = (source: string, text: string) => source.split(text).length - 1;

describe("the chain's colour: the sRGB transfer happens once", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("on every path: each preset, tier and face antialiasing ends with exactly one transfer, in FinishPass", () => {
    vi.stubGlobal("Image", class { src = ""; onload: (() => void) | null = null; });
    for (const preset of LOOK_PRESET_NAMES) {
      for (const tier of QUALITY_TIERS) {
        for (const antialiasing of ["off", "msaa", "smaa"] as const) {
          const path = `${preset} ${tier} ${antialiasing}`;
          const effects = effectsFor(LOOK_PRESETS[preset], tier, antialiasing);
          const passes = effects.getComposer()!.passes;
          const transfers = passes.flatMap((pass) =>
            materialsOf(pass).map((m) => ({ pass, calls: count(m.fragmentShader, "sRGBTransferOETF(") + count(m.fragmentShader, "linearToOutputTexel(") })),
          );
          expect(transfers.filter((t) => t.calls > 0).map((t) => [t.pass.constructor.name, t.calls]), path).toEqual([["FinishPass", 1]]);
          // No pass asks three for its own tone map or colour space: three adds them only through these chunks.
          for (const pass of passes)
            for (const m of materialsOf(pass)) {
              expect(m.fragmentShader, path).not.toContain("<colorspace_fragment>");
              expect(m.fragmentShader, path).not.toContain("<tonemapping_fragment>");
            }
          // The finish pass is last, or followed only by SMAA (which reads the display-encoded colour and writes it as is).
          const finish = passes.findIndex((p) => p instanceof FinishPass);
          expect(passes.slice(finish + 1).every((p) => p instanceof SMAAPass), path).toBe(true);
          expect(passes.slice(finish + 1).length, path).toBe(antialiasing === "smaa" ? 1 : 0);
          // The scene is drawn into the composer's target, never the canvas, where three would encode it again.
          expect(passes[0].renderToScreen, path).toBe(false);
          effects.dispose();
        }
      }
    }
  });
});

describe("the chain's resources", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("frees the AO's target and the composer's targets (and their depth textures) when a rebuild drops or resizes the AO", () => {
    const look = LOOK_PRESETS.mockup;
    const effects = effectsFor(look, "high", "off");
    const ao = effects.getComposer()!.passes.find((p) => p instanceof AoPass) as AoPass;
    const composer = effects.getComposer()!;
    const freed = { ao: vi.fn(), rt1: vi.fn(), rt2: vi.fn() };
    ao.target.addEventListener("dispose", freed.ao);
    composer.renderTarget1.addEventListener("dispose", freed.rt1);
    composer.renderTarget2.addEventListener("dispose", freed.rt2);
    expect(composer.renderTarget1.depthTexture).toBeInstanceOf(THREE.DepthTexture);

    effects.setLook({ ...look, ao: { ...look.ao, resolution: 1 } }, "high");
    expect([freed.ao, freed.rt1, freed.rt2].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);

    const ao2 = effects.getComposer()!.passes.find((p) => p instanceof AoPass) as AoPass;
    const freed2 = vi.fn();
    ao2.target.addEventListener("dispose", freed2);
    effects.setLook(look, "low");
    expect(freed2).toHaveBeenCalledTimes(1);
    expect(effects.getComposer()!.passes.some((p) => p instanceof AoPass)).toBe(false);
    effects.dispose();
  });

  it("disposes the SMAA pass on a rebuild and on dispose", () => {
    vi.stubGlobal("Image", class { src = ""; onload: (() => void) | null = null; });
    const effects = effectsFor(LOOK_PRESETS.mockup, "medium", "smaa");
    const first = effects.getComposer()!.passes.at(-1) as SMAAPass;
    expect(first).toBeInstanceOf(SMAAPass);
    const disposeFirst = vi.spyOn(first, "dispose");
    effects.setLook(LOOK_PRESETS.mockup, "low");
    expect(disposeFirst).toHaveBeenCalledTimes(1);
    const second = effects.getComposer()!.passes.at(-1) as SMAAPass;
    expect(second).not.toBe(first);
    const disposeSecond = vi.spyOn(second, "dispose");
    effects.dispose();
    expect(disposeSecond).toHaveBeenCalledTimes(1);
    expect(effects.getComposer()).toBeNull();
    // A second dispose frees nothing twice.
    effects.dispose();
    expect(disposeSecond).toHaveBeenCalledTimes(1);
  });

  it("disposes every pass it built, not only the composer's targets", () => {
    const effects = effectsFor(LOOK_PRESETS.mockup, "high", "off");
    const spies = effects.getComposer()!.passes.slice(1).map((p) => vi.spyOn(p, "dispose"));
    expect(spies).toHaveLength(3);
    effects.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("the start-up builds the chain once", () => {
  const adapter: RenderSurfaceAdapter = {
    getSize: () => ({ width: 400, height: 300 }),
    getDevicePixelRatio: () => 2,
    onResize: () => vi.fn(),
    bindInput: vi.fn(),
    unbindInput: vi.fn(),
  };

  it("for the tier and the capabilities in effect, given before init", async () => {
    const renderer = {
      ...fakeRenderer(),
      forceContextLoss: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(), dispose: vi.fn(), shadowMap: { enabled: false, type: 0 },
      outputColorSpace: "", toneMapping: 0, toneMappingExposure: 1, capabilities: { maxSamples: 4 },
    };
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
    const controller = {
      camera, controls: { addEventListener: vi.fn(), target: new THREE.Vector3() }, update: vi.fn(() => false),
      resize: vi.fn(), setMode: vi.fn(), setBoardBounds: vi.fn(), setLimits: vi.fn(), dispose: vi.fn(),
    };
    const scene = new GameScene({ createRenderer: vi.fn(() => renderer as any), createCameraController: vi.fn(() => controller as any) });
    (scene as any).assets.preloadAll = vi.fn(async () => {});
    (scene as any).tiles = { ...placementStubs(), setLook: vi.fn(), updateTiles: vi.fn(), setStrategyMode: vi.fn(), getGroup: () => new THREE.Group(), dispose: vi.fn() };
    const builds = vi.spyOn(scene.effects as any, "disposePasses");
    scene.setSettings({ quality: "low" });
    await scene.init({ surface: adapter, effectsCapabilities: { supportsBloom: false } });
    expect(builds).toHaveBeenCalledTimes(1);
    expect(scene.effects.getPassNames()).toEqual(["render", "finish"]);
    scene.dispose();
  });
});
