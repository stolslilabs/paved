import * as THREE from "three";
import { Pass } from "three/addons/postprocessing/Pass.js";

/**
 * The overlay and the underlay (SQUARE-GRID): what is drawn untouched by the look's tone map and grade, as Realms draws it.
 * `OverlayPass` draws each scene into a target of its own after the scene (and the AO and the bloom), and `FinishPass` lays them
 * after the tone map, the grade and the vignette, in linear colour, before the sRGB transfer:
 * - the underlay (`UNDERLAY`) under what the scene left uncovered (its alpha: the scene is cleared to nothing), tone-mapped as
 *   Realms tone-maps (ACES at `underlayExposure`): the square grid's backdrop;
 * - the overlay (`OVERLAY`) over everything, as given (Realms' `toneMapped: false`), blended as Realms blends: the highlight.
 *
 * The overlay's target has no depth buffer: an overlay material tests its fragment against the scene's own depth
 * (`overlayDepthTest`, reading the scene target's depth texture), so the tiles still hide what lies behind them.
 */

/** The scene's depth as the overlay's materials read it: its texture and its size in device px (set by the pass each frame). */
export interface OverlayDepth {
  [name: string]: THREE.IUniform;
  uSceneDepth: { value: THREE.Texture | null };
  uSceneSize: { value: THREE.Vector2 };
}

export function createOverlayDepth(): OverlayDepth {
  return { uSceneDepth: { value: null }, uSceneSize: { value: new THREE.Vector2(1, 1) } };
}

/**
 * What `Effects.setOverlay` takes: the overlay's scene and the depth uniforms its materials read, and the underlay's scene and the
 * exposure of its tone map. A null scene draws nothing of its part.
 */
export interface Overlay {
  scene: THREE.Scene | null;
  depth: OverlayDepth;
  underlay: THREE.Scene | null;
  underlayExposure: number;
}

/**
 * The scene depth test in an overlay material's fragment shader: a fragment behind the scene's surface at its pixel is dropped.
 * `extra` adds uniforms and lines at the end of the shader (after the colour is written). Returns the patch for `onBeforeCompile`.
 */
export function overlayDepthTest(
  depth: OverlayDepth,
  extra: { uniforms?: Record<string, THREE.IUniform>; declarations?: string; output?: string } = {},
): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  return (shader) => {
    Object.assign(shader.uniforms, depth, extra.uniforms);
    shader.fragmentShader = `uniform sampler2D uSceneDepth;\nuniform vec2 uSceneSize;\n${extra.declarations ?? ""}\n${shader.fragmentShader.replace(
      "void main() {",
      "void main() {\n  if ( gl_FragCoord.z > texture2D( uSceneDepth, gl_FragCoord.xy / uSceneSize ).r ) discard;",
    )}`.replace("#include <dithering_fragment>", `#include <dithering_fragment>\n${extra.output ?? ""}`);
  };
}

/**
 * Draws the underlay and the overlay scenes into their own targets (linear; cleared to nothing, so the overlay's colour is its
 * colour times its coverage, premultiplied by the blending, and its alpha the coverage), for `FinishPass` to lay under and over
 * the scene. The overlay reads the depth of the scene target the render pass drew into (`readBuffer.depthTexture`, which
 * `Effects` asks for while an overlay is on). A target is made only for a scene given.
 */
export class OverlayPass extends Pass {
  /** The overlay's target (null with no overlay scene) and the underlay's (null with no underlay). */
  readonly target: THREE.WebGLRenderTarget | null;
  readonly underTarget: THREE.WebGLRenderTarget | null;
  private readonly clearColor = new THREE.Color();

  constructor(
    private readonly overlay: Overlay,
    private readonly camera: THREE.Camera,
    samples = 0,
  ) {
    super();
    this.needsSwap = false;
    this.target = overlay.scene ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, samples }) : null;
    if (this.target) this.target.texture.name = "OverlayPass.overlay";
    this.underTarget = overlay.underlay ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }) : null;
    if (this.underTarget) this.underTarget.texture.name = "OverlayPass.underlay";
  }

  setSize(width: number, height: number): void {
    this.target?.setSize(width, height);
    this.underTarget?.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const { depth, scene, underlay } = this.overlay;
    depth.uSceneDepth.value = readBuffer.depthTexture;
    depth.uSceneSize.value.set(readBuffer.width, readBuffer.height);
    const autoClear = renderer.autoClear;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    for (const [part, target] of [
      [underlay, this.underTarget],
      [scene, this.target],
    ] as const) {
      if (!part || !target) continue;
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
      renderer.render(part, this.camera);
    }
    renderer.autoClear = autoClear;
    renderer.setClearColor(this.clearColor, alpha);
  }

  dispose(): void {
    this.target?.dispose();
    this.underTarget?.dispose();
  }
}
