import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import type { RenderProfile, EffectsCapabilities } from "./types";
import { getLightingProfile } from "./render-profiles";
import { LOOK_PRESETS, resolveLook, type LookSettings, type QualityTier } from "./look";
import { AoPass, FinishPass, finishDefines } from "./post-shaders";

/** Samples of the multisampled scene target, unless the settings give another count (`RendererSettings.msaaSamples`). */
export const MSAA_SAMPLES = 4;

/**
 * How the tile faces are antialiased: `"msaa"` multisamples the scene's target (`MSAA_SAMPLES`), `"smaa"` ends the
 * chain with an SMAA pass (where multisampling is missing or software), `"off"` does neither.
 */
export type FaceAntialiasing = "msaa" | "smaa" | "off";

/** What `resolveFaceAntialiasing` reads of the device. */
export interface FaceAntialiasingDevice {
  /** The most samples a render target takes (`renderer.capabilities.maxSamples`; 0 without WebGL 2 multisampling). */
  maxSamples: number;
  /** Software WebGL (`detectSoftwareWebGL`): multisampling there is rasterised on the CPU. */
  software: boolean;
  /** `EffectsCapabilities.supportsMultisampling`: false forbids multisampling whatever the context says. */
  supportsMultisampling?: boolean;
}

/**
 * The face antialiasing in effect for `RendererSettings.multisampling` on this device: off when the setting is off;
 * MSAA when the context multisamples at least `samples` on a GPU; SMAA otherwise.
 */
export function resolveFaceAntialiasing(on: boolean, device: FaceAntialiasingDevice, samples = MSAA_SAMPLES): FaceAntialiasing {
  if (!on) return "off";
  const msaa = device.supportsMultisampling !== false && !device.software && device.maxSamples >= samples;
  return msaa ? "msaa" : "smaa";
}

/** @deprecated The look (`LookSettings`, `look.ts`) carries the bloom and the vignette now. */
export interface EffectsConfig {
  bloom?: { threshold?: number; strength?: number; radius?: number };
  vignette?: { offset?: number; darkness?: number };
}

/** The passes a look runs, in order: what decides whether the chain must be rebuilt. */
export type EffectsPassName = "render" | "ao" | "bloom" | "finish" | "smaa";

/**
 * The post-processing chain of a look: `RenderPass` (into a half-float target, multisampled for MSAA, with a depth
 * texture when the AO reads it), `AoPass` (when on), `UnrealBloomPass` (when on), `FinishPass` (always: AO applied, tone
 * map, grade, vignette, sRGB), then `SMAAPass` where it antialiases the faces. An effect that is off adds no pass.
 */
export class Effects {
  private composer: EffectComposer | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private profile: RenderProfile = "play";
  private capabilities: EffectsCapabilities = {};
  private antialiasing: FaceAntialiasing = "off";
  /** Samples of the scene's target under MSAA. */
  private samples = MSAA_SAMPLES;
  private look: LookSettings = LOOK_PRESETS.mockup;
  private tier: QualityTier = "high";
  /** The look as drawn (`resolveLook` of the look, the tier and the capabilities). */
  private drawn: LookSettings = LOOK_PRESETS.mockup;
  /** What the current chain was built for (`chainKey`): a change of anything else only updates uniforms. */
  private builtKey = "";
  private bloomPass: UnrealBloomPass | null = null;
  private aoPass: AoPass | null = null;
  private finishPass: FinishPass | null = null;
  private smaaPass: SMAAPass | null = null;
  private passNames: EffectsPassName[] = [];
  /** The day and night cycle's backdrop (`setBackdrop`): composited by the finish pass under what the scene left uncovered. */
  private backdrop = false;
  private backdropTop: readonly number[] = [0, 0, 0];
  private backdropBottom: readonly number[] = [0, 0, 0];

  constructor(_config: EffectsConfig = {}) {}

  init(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    profile: RenderProfile = "play",
    antialiasing: FaceAntialiasing = "off",
    samples = MSAA_SAMPLES,
  ): void {
    this.antialiasing = antialiasing;
    this.samples = samples;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.profile = profile;
    this.rebuild();
  }

  /** The render profile: it scales the look's exposure (`LightingProfile.exposure` against the play profile's). */
  setProfile(profile: RenderProfile): void {
    this.profile = profile;
    this.update();
  }

  /** The face antialiasing (`resolveFaceAntialiasing`) and MSAA's samples. Rebuilds the passes when either changes. */
  setAntialiasing(antialiasing: FaceAntialiasing, samples = this.samples): void {
    if (this.antialiasing === antialiasing && this.samples === samples) return;
    this.antialiasing = antialiasing;
    this.samples = samples;
    this.rebuild();
  }

  getAntialiasing(): FaceAntialiasing {
    return this.antialiasing;
  }

  /**
   * The look and the quality tier it is drawn at (`resolveLook`). The passes are rebuilt only when the set of passes or
   * a target changes; a new value of an effect that stays on only updates its uniforms.
   */
  setLook(look: LookSettings, tier: QualityTier): void {
    this.look = look;
    this.tier = tier;
    this.update();
  }

  /** The look as drawn: the tier's and the capabilities' effects only. */
  getDrawnLook(): LookSettings {
    return this.drawn;
  }

  /** The passes of the current chain, in order (tests, the bench). */
  getPassNames(): readonly EffectsPassName[] {
    return this.passNames;
  }

  /** The composer, for tests and the bench: its first target and its passes. */
  getComposer(): EffectComposer | null {
    return this.composer;
  }

  /**
   * The backdrop of the day and night cycle (DAYNIGHT): on, the finish pass lays a vertical gradient between two OKLab
   * colours (`top`, `bottom`) under what the scene left uncovered (its alpha: the scene is cleared to transparent),
   * after the tone map and the grade, so the gradient's colours reach the screen as given, dithered. Turning it on or off
   * rebuilds the chain; new colours only set uniforms.
   */
  setBackdrop(on: boolean, top: readonly number[] = this.backdropTop, bottom: readonly number[] = this.backdropBottom): void {
    this.backdropTop = top;
    this.backdropBottom = bottom;
    if (on !== this.backdrop) {
      this.backdrop = on;
      this.update();
    } else this.finishPass?.setBackdrop(top, bottom);
  }

  setCapabilities(capabilities: EffectsCapabilities): void {
    this.capabilities = capabilities;
    this.update();
  }

  /** Re-resolve the look; rebuild the chain if its passes or targets changed, else only set the uniforms. */
  private update(): void {
    this.drawn = resolveLook(this.look, this.tier, this.capabilities);
    if (this.chainKey() !== this.builtKey) this.rebuild();
    else this.applyUniforms();
  }

  private chainKey(): string {
    const look = this.drawn;
    return JSON.stringify([
      this.antialiasing,
      this.antialiasing === "msaa" && this.samples,
      look.ao.enabled && look.ao.resolution,
      look.bloom.enabled,
      finishDefines(look, look.ao.enabled, this.backdrop),
    ]);
  }

  private exposure(): number {
    return (this.drawn.toneMapping.exposure * getLightingProfile(this.profile).exposure) / getLightingProfile("play").exposure;
  }

  private applyUniforms(): void {
    const look = this.drawn;
    if (this.bloomPass) {
      this.bloomPass.strength = look.bloom.strength;
      this.bloomPass.radius = look.bloom.radius;
      this.bloomPass.threshold = look.bloom.threshold;
    }
    if (this.aoPass) this.aoPass.setRadius(look.ao.radius);
    if (this.finishPass) {
      const u = this.finishPass.material.uniforms;
      u.aoIntensity.value = look.ao.intensity;
      u.saturation.value = look.grade.saturation;
      u.contrast.value = look.grade.contrast;
      u.warmth.value = look.grade.warmth;
      u.vignetteOffset.value = look.vignette.offset;
      u.vignetteDarkness.value = look.vignette.darkness;
      this.finishPass.setExposure(this.exposure());
      this.finishPass.setBackdrop(this.backdropTop, this.backdropBottom);
    }
  }

  private rebuild(): void {
    this.drawn = resolveLook(this.look, this.tier, this.capabilities);
    if (!this.renderer || !this.scene || !this.camera) return;

    this.disposePasses();
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    const look = this.drawn;
    // The scene is drawn into the composer's target, not the canvas: the canvas's `antialias` does not reach it. The
    // target is multisampled itself for MSAA; the composer resolves it before the next pass reads it, and the outlines
    // (drawn in the same pass, with their own coverage) are multisampled with the faces.
    const multisample = this.antialiasing === "msaa";
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: multisample ? this.samples : 0,
      // The AO reads the scene's depth: a texture instead of a renderbuffer, only then (the composer's clone gets its own).
      ...(look.ao.enabled ? { depthTexture: new THREE.DepthTexture(size.x, size.y) } : {}),
    });
    target.texture.name = "EffectComposer.rt1";
    // The composer clones the first target into its second and swaps the two after every pass that `needsSwap`. Only
    // SMAA reads what the finish pass wrote, so the finish pass swaps only when SMAA follows it: otherwise no pass swaps,
    // the scene lands in the same target every frame (the composer's read buffer, its resolve texture read by the next
    // passes) and the other is never bound, so never allocated (three allocates a target on its first use). One
    // multisampled target, not two (Q3-GPU); P4's chain swapped every frame, and both targets had to multisample.
    this.composer = new EffectComposer(renderer, target);
    // A given target makes the composer take its size as CSS pixels with a pixel ratio of 1: give it the renderer's
    // ratio first, so `setSize` (and every resize after) keeps the target at the drawing buffer's size.
    this.composer.setPixelRatio(renderer.getPixelRatio());
    const names: EffectsPassName[] = ["render"];

    this.composer.addPass(new RenderPass(scene, camera));

    if (look.ao.enabled) {
      this.aoPass = new AoPass(camera as THREE.PerspectiveCamera, look.ao);
      this.composer.addPass(this.aoPass);
      names.push("ao");
    }

    if (look.bloom.enabled) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(size.x, size.y),
        look.bloom.strength,
        look.bloom.radius,
        look.bloom.threshold,
      );
      // Under the backdrop the bloom adds its light to the scene's colour as three's additive blend does (its colour times
      // its alpha), never to the alpha: the backdrop is laid under what the alpha leaves uncovered, and an added alpha
      // would cover it. Without the backdrop the stock blend stays (the chain is rebuilt when the backdrop toggles).
      if (this.backdrop) {
        const blend = this.bloomPass.blendMaterial;
        blend.blending = THREE.CustomBlending;
        blend.blendSrc = THREE.SrcAlphaFactor;
        blend.blendDst = THREE.OneFactor;
        blend.blendSrcAlpha = THREE.ZeroFactor;
        blend.blendDstAlpha = THREE.OneFactor;
      }
      this.composer.addPass(this.bloomPass);
      names.push("bloom");
    }

    // SMAA last, where MSAA is not used: it reads the final, display-encoded colour (its edge detection is tuned for
    // it), so it smooths the faces' edges after everything else.
    // Its lookup textures load through `Image`, which React Native does not have: there the faces stay unantialiased.
    const smaa = this.antialiasing === "smaa" && typeof Image !== "undefined";

    this.finishPass = new FinishPass(look, this.aoPass?.target.texture ?? null, this.backdrop);
    this.finishPass.needsSwap = smaa;
    this.composer.addPass(this.finishPass);
    names.push("finish");

    if (smaa) {
      this.smaaPass = new SMAAPass();
      this.composer.addPass(this.smaaPass);
      names.push("smaa");
    }

    const css = renderer.getSize(new THREE.Vector2());
    this.composer.setSize(css.x, css.y);
    this.passNames = names;
    this.builtKey = this.chainKey();
    this.applyUniforms();
  }

  render(): void {
    this.composer?.render();
  }

  /**
   * Fit the composer's targets to a canvas of `width` x `height` CSS px at `pixelRatio` (the renderer's, by default).
   * The composer sizes every pass, AO and bloom included, in device px.
   */
  resize(width: number, height: number, pixelRatio = this.renderer?.getPixelRatio() ?? 1): void {
    this.composer?.setPixelRatio(pixelRatio);
    this.composer?.setSize(width, height);
  }

  dispose(): void {
    this.disposePasses();
  }

  /**
   * The composer (its two targets, the depth textures with them) and every pass it holds: the composer frees only its
   * own targets and copy pass, not the passes added to it.
   */
  private disposePasses(): void {
    this.composer?.dispose();
    this.aoPass?.dispose();
    this.bloomPass?.dispose();
    this.finishPass?.dispose();
    this.smaaPass?.dispose();
    this.composer = null;
    this.aoPass = null;
    this.bloomPass = null;
    this.finishPass = null;
    this.smaaPass = null;
  }
}
