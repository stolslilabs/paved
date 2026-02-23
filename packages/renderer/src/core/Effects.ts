import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

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
  private config: EffectsConfig;

  constructor(config: EffectsConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ): void {
    this.composer = new EffectComposer(renderer);

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Bloom
    const bloomConfig = this.config.bloom ?? DEFAULT_CONFIG.bloom!;
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
      bloomConfig.strength ?? 0.5,
      bloomConfig.radius ?? 0.4,
      bloomConfig.threshold ?? 3
    );
    this.composer.addPass(bloomPass);

    // Vignette
    const vignetteConfig = this.config.vignette ?? DEFAULT_CONFIG.vignette!;
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
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
  }
}
