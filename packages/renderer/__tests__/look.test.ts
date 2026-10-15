import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { Effects } from "../src/core/Effects";
import { GameScene } from "../src/core/GameScene";
import { TileRenderer } from "../src/core/TileRenderer";
import {
  AUTO_QUALITY,
  DEFAULT_LOOK_PRESET,
  LOOK_PRESETS,
  LOOK_PRESET_NAMES,
  QUALITY_TIERS,
  TIER_EFFECTS,
  lightDirection,
  resolveLook,
  resolveLookSettings,
  resolveQuality,
  type LookSettings,
} from "../src/core/look";
import { AoPass, FinishPass, finishDefines } from "../src/core/post-shaders";
import { DEFAULT_RENDERER_SETTINGS, resolveRendererSettings } from "../src/core/settings";

/** A renderer as far as the composer reads it before drawing: sizes and pixel ratio. */
function fakeRenderer(): THREE.WebGLRenderer {
  return {
    getPixelRatio: () => 2,
    getSize: (v: THREE.Vector2) => v.set(400, 300),
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(800, 600),
    domElement: { width: 800, height: 600 },
  } as unknown as THREE.WebGLRenderer;
}

function effectsFor(look: LookSettings, tier: (typeof QUALITY_TIERS)[number] = "high") {
  const effects = new Effects();
  effects.setLook(look, tier);
  effects.init(fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), "play", "off");
  return effects;
}

/** The look with every effect and light off. */
function allOff(): LookSettings {
  const look = structuredClone(LOOK_PRESETS.mockup);
  for (const group of Object.values(look)) if (typeof group === "object" && "enabled" in group) group.enabled = false;
  look.toneMapping.mode = "none";
  return look;
}

describe("the look's presets", () => {
  it("resolve as documented: mockup by default, each named preset as given, any field over it", () => {
    expect(DEFAULT_LOOK_PRESET).toBe("mockup");
    expect(LOOK_PRESET_NAMES).toEqual(["mockup", "soft", "off"]);
    expect(DEFAULT_RENDERER_SETTINGS.look).toEqual(LOOK_PRESETS.mockup);
    expect(resolveRendererSettings().look).toEqual(LOOK_PRESETS.mockup);
    for (const preset of LOOK_PRESET_NAMES) {
      const settings = resolveRendererSettings({ lookPreset: preset });
      expect(settings.lookPreset).toBe(preset);
      expect(settings.look).toEqual(LOOK_PRESETS[preset]);
    }
    const tuned = resolveRendererSettings({ lookPreset: "soft", look: { bloom: { strength: 0.9 } } });
    expect(tuned.look.bloom).toEqual({ ...LOOK_PRESETS.soft.bloom, strength: 0.9 });
    expect(tuned.look.key).toEqual(LOOK_PRESETS.soft.key);
    // The presets are not changed by a resolution.
    expect(LOOK_PRESETS.soft.bloom.strength).not.toBe(0.9);
  });

  it("keeps the base for an unknown preset or tone-mapping mode", () => {
    expect(resolveRendererSettings({ lookPreset: "x" as never }).look).toEqual(LOOK_PRESETS.mockup);
    expect(resolveLookSettings({}, "x" as never)).toEqual(LOOK_PRESETS.mockup);
    expect(resolveLookSettings({ toneMapping: { mode: "x" as never } }).toneMapping.mode).toBe(LOOK_PRESETS.mockup.toneMapping.mode);
  });

  it("Mockup tone-maps with ACES, Soft with AgX: the two filmic curves to compare", () => {
    expect(LOOK_PRESETS.mockup.toneMapping.mode).toBe("aces");
    expect(LOOK_PRESETS.soft.toneMapping.mode).toBe("agx");
  });

  it("Off has lights but no effect", () => {
    const off = LOOK_PRESETS.off;
    expect(off.key.enabled && off.sky.enabled).toBe(true);
    for (const effect of [off.ao, off.grade, off.vignette, off.fog, off.bloom, off.water]) expect(effect.enabled).toBe(false);
  });
});

describe("quality tiers", () => {
  it("turn off what a tier cannot afford: low no extra pass, medium the bloom, high the AO too", () => {
    expect(TIER_EFFECTS).toEqual({
      low: { ao: false, bloom: false, softShadows: false },
      medium: { ao: false, bloom: true, softShadows: true },
      high: { ao: true, bloom: true, softShadows: true },
    });
    const look = LOOK_PRESETS.mockup;
    const low = resolveLook(look, "low");
    expect([low.ao.enabled, low.bloom.enabled, low.key.shadowSoftness]).toEqual([false, false, 1]);
    const medium = resolveLook(look, "medium");
    expect([medium.ao.enabled, medium.bloom.enabled, medium.key.shadowSoftness]).toEqual([false, true, look.key.shadowSoftness]);
    expect(resolveLook(look, "high")).toEqual(look);
    // A tier never turns an effect on.
    expect(resolveLook(LOOK_PRESETS.off, "high").bloom.enabled).toBe(false);
  });

  it("follow what the device's capabilities forbid", () => {
    const look = resolveLook(LOOK_PRESETS.mockup, "high", { supportsSSAO: false, supportsBloom: false, supportsVignette: false });
    expect([look.ao.enabled, look.bloom.enabled, look.vignette.enabled]).toEqual([false, false, false]);
  });

  it('"auto" picks conservatively: low on a coarse pointer, a small screen or a low-power device, medium elsewhere, never high', () => {
    expect(DEFAULT_RENDERER_SETTINGS.quality).toBe("auto");
    expect(AUTO_QUALITY).toEqual({ coarse: "low", fine: "medium" });
    expect(resolveQuality("auto", true)).toBe("low");
    expect(resolveQuality("auto", false)).toBe("medium");
    expect(resolveQuality("auto", false, { lowPowerDevice: true })).toBe("low");
    for (const coarse of [true, false]) expect(resolveQuality("auto", coarse)).not.toBe("high");
    // Low on a phone: no AO and no bloom.
    const phone = resolveLook(LOOK_PRESETS.mockup, resolveQuality("auto", true));
    expect([phone.ao.enabled, phone.bloom.enabled]).toEqual([false, false]);
    for (const tier of QUALITY_TIERS) expect(resolveQuality(tier, true)).toBe(tier);
    expect(resolveRendererSettings({ quality: "x" as never }).quality).toBe("auto");
  });

  it('"auto" in GameScene reads the window, and follows a resize', () => {
    const scene = new GameScene();
    let size = { width: 1440, height: 900 };
    (scene as any).surface = { getSize: () => size, getDevicePixelRatio: () => 2, hasCoarsePointer: () => false };
    expect(scene.getQuality()).toBe("medium");
    size = { width: 360, height: 780 };
    expect(scene.getQuality()).toBe("low");
    expect(scene.getLook().bloom.enabled).toBe(false);
    (scene as any).surface.hasCoarsePointer = () => true;
    size = { width: 1440, height: 900 };
    expect(scene.getQuality()).toBe("low");
    // High only when chosen.
    scene.setSettings({ quality: "high" });
    expect(scene.getQuality()).toBe("high");
    expect(scene.getLook().ao.enabled).toBe(true);
  });
});

describe("the chain of passes", () => {
  it("runs the scene, the AO, the bloom and the final pass with everything on", () => {
    const effects = effectsFor(LOOK_PRESETS.mockup);
    expect(effects.getPassNames()).toEqual(["render", "ao", "bloom", "finish"]);
    const passes = effects.getComposer()!.passes;
    expect(passes[0]).toBeInstanceOf(RenderPass);
    expect(passes[1]).toBeInstanceOf(AoPass);
    expect(passes[2]).toBeInstanceOf(UnrealBloomPass);
    expect(passes[3]).toBeInstanceOf(FinishPass);
    // The AO reads the scene's depth from both of the composer's targets.
    expect(effects.getComposer()!.renderTarget1.depthTexture).toBeInstanceOf(THREE.DepthTexture);
    expect(effects.getComposer()!.renderTarget2.depthTexture).toBeInstanceOf(THREE.DepthTexture);
  });

  it("runs no extra pass for an effect that is off: only the scene and the final pass with all off", () => {
    const effects = effectsFor(allOff());
    expect(effects.getPassNames()).toEqual(["render", "finish"]);
    expect(effects.getComposer()!.passes).toHaveLength(2);
    expect(effects.getComposer()!.renderTarget1.depthTexture).toBeNull();
    // Off, the final pass compiles no code for the AO, the grade, the vignette or a tone-mapping curve.
    expect(finishDefines(allOff(), false)).toEqual({ SRGB_TRANSFER: "" });
    expect(Object.keys(finishDefines(LOOK_PRESETS.mockup, true)).sort()).toEqual(["ACES_FILMIC_TONE_MAPPING", "AO", "GRADE", "SRGB_TRANSFER", "VIGNETTE"]);
  });

  it("drops each costly pass alone when its effect is off, or its tier forbids it", () => {
    const look = LOOK_PRESETS.mockup;
    expect(effectsFor({ ...look, ao: { ...look.ao, enabled: false } }).getPassNames()).toEqual(["render", "bloom", "finish"]);
    expect(effectsFor({ ...look, bloom: { ...look.bloom, enabled: false } }).getPassNames()).toEqual(["render", "ao", "finish"]);
    expect(effectsFor(look, "medium").getPassNames()).toEqual(["render", "bloom", "finish"]);
    expect(effectsFor(look, "low").getPassNames()).toEqual(["render", "finish"]);
  });

  it("only sets uniforms when a value changes but the passes do not, and rebuilds when an effect is turned off", () => {
    const look = LOOK_PRESETS.mockup;
    const effects = effectsFor(look);
    const composer = effects.getComposer();
    effects.setLook({ ...look, bloom: { ...look.bloom, strength: 0.7 }, grade: { ...look.grade, saturation: 1.3 } }, "high");
    expect(effects.getComposer()).toBe(composer);
    const passes = effects.getComposer()!.passes;
    expect((passes[2] as UnrealBloomPass).strength).toBe(0.7);
    expect((passes[3] as FinishPass).material.uniforms.saturation.value).toBe(1.3);
    effects.setLook({ ...look, grade: { ...look.grade, enabled: false } }, "high");
    expect(effects.getComposer()).not.toBe(composer);
    expect((effects.getComposer()!.passes.at(-1) as FinishPass).material.defines.GRADE).toBeUndefined();
  });

  it("scales the exposure by the render profile", () => {
    const effects = effectsFor(LOOK_PRESETS.mockup);
    const finish = () => effects.getComposer()!.passes.at(-1) as FinishPass;
    expect(finish().material.uniforms.toneMappingExposure.value).toBeCloseTo(LOOK_PRESETS.mockup.toneMapping.exposure);
    effects.setProfile("showcase");
    expect(finish().material.uniforms.toneMappingExposure.value).toBeGreaterThan(LOOK_PRESETS.mockup.toneMapping.exposure);
  });
});

describe("the lights and the scene's effects", () => {
  function lit(look: LookSettings) {
    const scene = new GameScene();
    const setLook = vi.fn();
    (scene as any).effects = { setLook, setAntialiasing: vi.fn() };
    (scene as any).tiles = { setLook: vi.fn() };
    (scene as any).setupLighting();
    scene.setSettings({ look, quality: "high" });
    const lights = scene.scene.children.filter((c): c is THREE.Light => c instanceof THREE.Light);
    return { scene, setLook, lights, tiles: (scene as any).tiles };
  }

  it("draws the key, the fill and the sky from the look", () => {
    const { scene, lights, tiles } = lit(LOOK_PRESETS.mockup);
    const key = lights.find((l): l is THREE.DirectionalLight => l instanceof THREE.DirectionalLight && l.castShadow)!;
    expect(key.color.getHexString()).toBe(LOOK_PRESETS.mockup.key.color.slice(1));
    expect(key.intensity).toBe(LOOK_PRESETS.mockup.key.intensity);
    const dir = key.position.clone().normalize();
    expect(dir.toArray().map((v) => v.toFixed(6))).toEqual(lightDirection(LOOK_PRESETS.mockup.key.azimuth, LOOK_PRESETS.mockup.key.elevation).map((v) => v.toFixed(6)));
    expect(key.shadow.radius).toBe(LOOK_PRESETS.mockup.key.shadowSoftness);
    const fill = lights.find((l): l is THREE.DirectionalLight => l instanceof THREE.DirectionalLight && !l.castShadow)!;
    expect(fill.intensity).toBe(LOOK_PRESETS.mockup.fill.intensity);
    expect(scene.scene.fog).toBeInstanceOf(THREE.FogExp2);
    expect(tiles.setLook).toHaveBeenLastCalledWith(LOOK_PRESETS.mockup.highlights, LOOK_PRESETS.mockup.water);
  });

  it("turns every light and effect off", () => {
    const off = allOff();
    const { scene, lights, tiles } = lit(off);
    for (const light of lights) expect(light.intensity).toBe(0);
    expect(scene.scene.fog).toBeNull();
    expect(tiles.setLook.mock.lastCall[1].enabled).toBe(false);
  });

  it("redraws the shadow map when the key light moves, not for another change", () => {
    const { scene } = lit(LOOK_PRESETS.mockup);
    (scene as any).shadowsDirty = false;
    scene.setSettings({ look: { ...LOOK_PRESETS.mockup, bloom: { ...LOOK_PRESETS.mockup.bloom, strength: 1 } }, quality: "high" });
    expect((scene as any).shadowsDirty).toBe(false);
    scene.setSettings({ look: { ...LOOK_PRESETS.mockup, key: { ...LOOK_PRESETS.mockup.key, azimuth: 10 } }, quality: "high" });
    expect((scene as any).shadowsDirty).toBe(true);
  });
});

describe("the tiles' part of the look", () => {
  it("draws the slots in emissive gold, brighter than 1 so the bloom picks them, and follows a new look", () => {
    const tiles = new TileRenderer({} as never);
    tiles.setAvailableSlots([{ x: 1, y: 0 }]);
    const slot = (tiles.getGroup().children[1].children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const { highlights } = LOOK_PRESETS.mockup;
    expect(slot.color.equals(new THREE.Color(highlights.slotColor).multiplyScalar(highlights.slotIntensity))).toBe(true);
    expect(Math.max(slot.color.r, slot.color.g, slot.color.b)).toBeGreaterThan(1);
    tiles.setLook({ ...highlights, slotColor: "#ffffff", slotIntensity: 2 }, LOOK_PRESETS.mockup.water);
    expect(slot.color.toArray()).toEqual([2, 2, 2]);
    tiles.dispose();
  });

  it("brightens the water through shared uniforms, and turns it off without a recompile", () => {
    const tiles = new TileRenderer({} as never);
    const material = new THREE.MeshStandardMaterial();
    (tiles as any).patchWater(material);
    const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.standard.fragmentShader, vertexShader: "" } as never;
    material.onBeforeCompile(shader, {} as never);
    const { uniforms, fragmentShader } = shader as { uniforms: Record<string, { value: number }>; fragmentShader: string };
    expect(fragmentShader).toContain("waterMask");
    expect(fragmentShader).toContain("roughnessFactor = mix(roughnessFactor, uWaterRoughness, waterMask)");
    expect(material.customProgramCacheKey()).toBe("paved-tile-water");
    tiles.setLook(LOOK_PRESETS.mockup.highlights, LOOK_PRESETS.mockup.water);
    expect([uniforms.uWaterOn.value, uniforms.uWaterBrightness.value]).toEqual([1, LOOK_PRESETS.mockup.water.brightness]);
    tiles.setLook(LOOK_PRESETS.mockup.highlights, { ...LOOK_PRESETS.mockup.water, enabled: false });
    expect(uniforms.uWaterOn.value).toBe(0);
    tiles.dispose();
  });
});
