import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import type { RenderProfile, EffectsCapabilities } from "./types";
import { resolveEffectsProfile } from "./render-profiles";

// Vignette shader (from postprocessing library, simplified)
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.1 },
    darkness: { value: 0.8 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = clamp(1.0 - dot(uv, uv), 0.0, 1.0);
      texel.rgb *= mix(1.0 - darkness, 1.0, vignette);
      gl_FragColor = texel;
    }
  `,
};

/** Samples of the multisampled scene target. */
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
 * MSAA when the context multisamples at least `MSAA_SAMPLES` on a GPU; SMAA otherwise.
 */
export function resolveFaceAntialiasing(on: boolean, device: FaceAntialiasingDevice): FaceAntialiasing {
  if (!on) return "off";
  const msaa = device.supportsMultisampling !== false && !device.software && device.maxSamples >= MSAA_SAMPLES;
  return msaa ? "msaa" : "smaa";
}

export interface EffectsConfig {
  bloom?: {
    threshold?: number;
    strength?: number;
    radius?: number;
  };
  vignette?: {
    offset?: number;
    darkness?: number;
  };
}

const DEFAULT_CONFIG: EffectsConfig = {
  bloom: {
    threshold: 3,
    strength: 0.5,
    radius: 0.4,
  },
  vignette: {
    offset: 0.1,
    darkness: 0.8,
  },
};

export class Effects {
  private composer: EffectComposer | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private config: EffectsConfig;
  private profile: RenderProfile = "play";
  private ssaoPass: SSAOPass | null = null;
  private capabilities: EffectsCapabilities = {};
  private antialiasing: FaceAntialiasing = "off";

  constructor(config: EffectsConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    profile: RenderProfile = "play",
    antialiasing: FaceAntialiasing = "off",
  ): void {
    this.antialiasing = antialiasing;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.profile = profile;
    this.buildComposer();
  }

  setProfile(profile: RenderProfile): void {
    this.profile = profile;
    this.buildComposer();
  }

  /** The face antialiasing (`resolveFaceAntialiasing`). Rebuilds the passes when it changes. */
  setAntialiasing(antialiasing: FaceAntialiasing): void {
    if (this.antialiasing === antialiasing) return;
    this.antialiasing = antialiasing;
    this.buildComposer();
  }

  getAntialiasing(): FaceAntialiasing {
    return this.antialiasing;
  }

  /** The composer, for tests and the bench: its first target and its passes. */
  getComposer(): EffectComposer | null {
    return this.composer;
  }

  setCapabilities(capabilities: EffectsCapabilities): void {
    this.capabilities = capabilities;
    this.buildComposer();
  }

  private buildComposer(): void {
    if (!this.renderer || !this.scene || !this.camera) return;

    this.composer?.dispose();
    this.ssaoPass = null;
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    // The scene is drawn into the composer's target, not the canvas: the canvas's `antialias` does not reach it. The
    // target is multisampled itself for MSAA; the composer resolves it before the next pass reads it, and the outlines
    // (drawn in the same pass, with their own coverage) are multisampled with the faces.
    const multisample = this.antialiasing === "msaa";
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: multisample ? MSAA_SAMPLES : 0,
    });
    target.texture.name = "EffectComposer.rt1";
    this.composer = new EffectComposer(renderer, target);
    // The composer clones the first target into its second: only the scene needs the samples, not the passes after it.
    this.composer.renderTarget2.samples = 0;
    // A given target makes the composer take its size as CSS pixels with a pixel ratio of 1: give it the renderer's
    // ratio first, so `setSize` (and every resize after) keeps the target at the drawing buffer's size.
    this.composer.setPixelRatio(renderer.getPixelRatio());
    const css = renderer.getSize(new THREE.Vector2());
    this.composer.setSize(css.x, css.y);

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    const profileConfig = resolveEffectsProfile(this.profile, this.capabilities);

    if (profileConfig.ssao.enabled) {
      this.ssaoPass = new SSAOPass(
        scene,
        camera as THREE.PerspectiveCamera,
        renderer.domElement.width,
        renderer.domElement.height,
      );
      this.ssaoPass.kernelRadius = profileConfig.ssao.radius;
      this.ssaoPass.minDistance = profileConfig.ssao.minDistance;
      this.ssaoPass.maxDistance = profileConfig.ssao.maxDistance;
      this.composer.addPass(this.ssaoPass);
    }

    // Bloom
    const bloomConfig = profileConfig.bloom;
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
      bloomConfig.strength ?? 0.5,
      bloomConfig.radius ?? 0.4,
      bloomConfig.threshold ?? 3
    );
    this.composer.addPass(bloomPass);

    // Vignette
    const vignetteConfig = profileConfig.vignette;
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms.offset.value = vignetteConfig.offset ?? 0.1;
    vignettePass.uniforms.darkness.value = vignetteConfig.darkness ?? 0.8;
    this.composer.addPass(vignettePass);

    // SMAA last, where MSAA is not used: it reads the final colour, so it smooths the faces' edges after bloom and
    // vignette, in the same linear colour the passes before it write.
    // Its lookup textures load through `Image`, which React Native does not have: there the faces stay unantialiased.
    if (this.antialiasing === "smaa" && typeof Image !== "undefined") this.composer.addPass(new SMAAPass());
  }

  render(): void {
    this.composer?.render();
  }

  /**
   * Fit the composer's targets to a canvas of `width` x `height` CSS px at `pixelRatio` (the renderer's, by default).
   * The composer sizes every pass, SSAO and bloom included, in device px.
   */
  resize(width: number, height: number, pixelRatio = this.renderer?.getPixelRatio() ?? 1): void {
    this.composer?.setPixelRatio(pixelRatio);
    this.composer?.setSize(width, height);
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
  }
}
