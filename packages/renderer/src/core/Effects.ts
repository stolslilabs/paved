import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
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
const MSAA_SAMPLES = 4;

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

  constructor(config: EffectsConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    profile: RenderProfile = "play",
  ): void {
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
    // The scene is drawn into the composer's target, not the canvas: the canvas's `antialias` does not reach it, so
    // the target is multisampled itself (the outlines' and the tiles' edges would alias and crawl while panning).
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: this.capabilities.supportsMultisampling === false ? 0 : MSAA_SAMPLES,
    });
    target.texture.name = "EffectComposer.rt1";
    this.composer = new EffectComposer(renderer, target);
    // A given target makes the composer take its size as CSS pixels: give it the CSS size, with the pixel ratio.
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
  }

  render(): void {
    this.composer?.render();
  }

  resize(width: number, height: number): void {
    this.composer?.setSize(width, height);
    this.ssaoPass?.setSize(width, height);
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
  }
}
