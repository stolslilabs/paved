import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import type { LookSettings, ToneMappingMode } from "./look";

/**
 * The passes LIGHT adds to the composer: the ambient occlusion (`AoPass`, its own pass, only when on) and the final pass
 * (`FinishPass`, always: AO applied, exposure and tone map, grade, vignette, sRGB). The final pass replaces three's
 * `OutputPass` and the former vignette pass: one full-screen pass whatever is on, each effect a `#define` so an effect
 * that is off costs no instruction.
 */

/** Taps of the AO's spiral: fixed (no per-pixel noise), so a still or panning camera shows no dither. */
export const AO_SAMPLES = 12;

const AoShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform mat4 cameraProjectionMatrix;
    uniform mat4 cameraProjectionMatrixInverse;
    uniform float radius;
    varying vec2 vUv;

    vec3 viewPosition(vec2 uv, float depth) {
      vec4 p = cameraProjectionMatrixInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    vec3 viewPositionAt(vec2 uv) {
      return viewPosition(uv, texture2D(tDepth, uv).x);
    }

    void main() {
      float depth = texture2D(tDepth, vUv).x;
      if (depth >= 1.0) { gl_FragColor = vec4(1.0); return; }
      vec3 p = viewPosition(vUv, depth);
      // The normal from the depth: on each axis, the neighbour on the same face (the nearer in depth), so a silhouette
      // does not bend it.
      vec2 texel = 1.0 / resolution;
      vec3 r = viewPositionAt(vUv + vec2(texel.x, 0.0)) - p;
      vec3 l = p - viewPositionAt(vUv - vec2(texel.x, 0.0));
      vec3 u = viewPositionAt(vUv + vec2(0.0, texel.y)) - p;
      vec3 d = p - viewPositionAt(vUv - vec2(0.0, texel.y));
      vec3 n = normalize(cross(abs(r.z) < abs(l.z) ? r : l, abs(u.z) < abs(d.z) ? u : d));
      if (n.z < 0.0) n = -n;
      // The radius on screen, in uv, at this depth; under about a texel the AO cannot show: skip it.
      vec2 screen = radius * vec2(cameraProjectionMatrix[0][0], cameraProjectionMatrix[1][1]) * 0.5 / -p.z;
      if (screen.y * resolution.y < 1.5) { gl_FragColor = vec4(1.0); return; }
      float occlusion = 0.0;
      for (int i = 0; i < ${AO_SAMPLES}; i++) {
        float f = (float(i) + 0.5) / float(${AO_SAMPLES});
        float angle = f * 7.0 * 6.2831853;
        vec2 offset = vec2(cos(angle), sin(angle)) * f * screen;
        vec3 v = viewPositionAt(vUv + offset) - p;
        float distance = length(v);
        // Occluders in front of the face, nearer than the radius, count by their angle above it (Alchemy's estimator).
        float rangeCheck = 1.0 - smoothstep(radius * 0.5, radius, distance);
        occlusion += max(dot(v, n) / (distance + 1e-4) - 0.1, 0.0) * rangeCheck;
      }
      gl_FragColor = vec4(vec3(1.0 - occlusion / float(${AO_SAMPLES})), 1.0);
    }`,
};

/**
 * Screen-space ambient occlusion from the scene's depth texture, into a target of its own at `resolution` of the
 * drawing buffer. It does not draw the scene again (no normal pass: the normals come from the depth) and writes nothing
 * to the composer's buffers (`needsSwap` false): `FinishPass` reads its texture.
 */
export class AoPass extends Pass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private scale: number;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    settings: LookSettings["ao"],
  ) {
    super();
    this.needsSwap = false;
    this.scale = settings.resolution;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.target.texture.name = "AoPass.ao";
    this.material = new THREE.ShaderMaterial({
      name: "AoShader",
      uniforms: {
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraProjectionMatrix: { value: new THREE.Matrix4() },
        cameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
        radius: { value: settings.radius },
      },
      vertexShader: AoShader.vertexShader,
      fragmentShader: AoShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setRadius(radius: number): void {
    this.material.uniforms.radius.value = radius;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width * this.scale));
    const h = Math.max(1, Math.round(height * this.scale));
    this.target.setSize(w, h);
    this.material.uniforms.resolution.value.set(w, h);
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.tDepth.value = readBuffer.depthTexture;
    u.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    u.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

const TONE_MAPPING_DEFINES: Record<ToneMappingMode, string | null> = {
  agx: "AGX_TONE_MAPPING",
  aces: "ACES_FILMIC_TONE_MAPPING",
  neutral: "NEUTRAL_TONE_MAPPING",
  none: null,
};

/**
 * The `#define`s of the final pass for a look: one per effect that is on (and AO only when `AoPass` runs), the backdrop
 * when the day and night cycle draws one (`backdrop`), and the premultiplied output of a scene over the page
 * (`transparent`, `RendererSettings.transparent`; the backdrop covers the page, so it wins).
 */
export function finishDefines(look: LookSettings, ao: boolean, backdrop = false, transparent = false): Record<string, string> {
  const defines: Record<string, string> = {};
  if (backdrop) defines.BACKDROP = "";
  else if (transparent) defines.PREMULTIPLIED = "";
  const tone = TONE_MAPPING_DEFINES[look.toneMapping.mode];
  if (tone) defines[tone] = "";
  if (ao) defines.AO = "";
  if (look.grade.enabled) defines.GRADE = "";
  if (look.vignette.enabled) defines.VIGNETTE = "";
  return defines;
}

const FinishShader = {
  // A raw shader, as three's `OutputShader`: three adds no tone map or colour space of its own.
  vertexShader: /* glsl */ `
    precision highp float;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tAo;
    uniform float aoIntensity;
    uniform float saturation;
    uniform float contrast;
    uniform float warmth;
    uniform float vignetteOffset;
    uniform float vignetteDarkness;
    uniform vec3 backdropTop;
    uniform vec3 backdropBottom;
    varying vec2 vUv;

    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>

    #ifdef BACKDROP
    vec3 oklabToLinear(vec3 c) {
    vec3 l = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.291485548) * c;
    return max(mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.707614701) * (l * l * l), 0.0);
    }
    #endif

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      #ifdef PREMULTIPLIED
        // Over the page: the scene was cleared to transparent, so its colour is premultiplied by its alpha (a see-through
        // face, an edge). The tone map, the grade and the transfer take the colour itself; it is premultiplied again at the end.
        color.rgb /= max(color.a, 1e-4);
      #endif
      #ifdef AO
        color.rgb *= mix(1.0, texture2D(tAo, vUv).r, aoIntensity);
      #endif
      // three's curves apply \`toneMappingExposure\` themselves.
      #if defined( AGX_TONE_MAPPING )
        color.rgb = AgXToneMapping(color.rgb);
      #elif defined( ACES_FILMIC_TONE_MAPPING )
        color.rgb = ACESFilmicToneMapping(color.rgb);
      #elif defined( NEUTRAL_TONE_MAPPING )
        color.rgb = NeutralToneMapping(color.rgb);
      #else
        color.rgb = clamp(color.rgb * toneMappingExposure, 0.0, 1.0);
      #endif
      #ifdef GRADE
        float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        color.rgb = mix(vec3(luma), color.rgb, saturation);
        color.rgb = (color.rgb - 0.18) * contrast + 0.18;
        color.rgb *= vec3(1.0 + warmth, 1.0, 1.0 - warmth);
        color.rgb = clamp(color.rgb, 0.0, 1.0);
      #endif
      #ifdef BACKDROP
        float uncovered = 1.0 - clamp(color.a, 0.0, 1.0);
        color.rgb += oklabToLinear(mix(backdropBottom, backdropTop, vUv.y)) * uncovered;
        color.a = 1.0;
      #endif
      #ifdef VIGNETTE
        vec2 centred = (vUv - 0.5) * vignetteOffset;
        color.rgb *= mix(1.0 - vignetteDarkness, 1.0, clamp(1.0 - dot(centred, centred) * 2.0, 0.0, 1.0));
      #endif
      gl_FragColor = sRGBTransferOETF(color);
      #ifdef PREMULTIPLIED
        gl_FragColor.rgb *= clamp(gl_FragColor.a, 0.0, 1.0);
      #endif
      #ifdef BACKDROP
        float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        gl_FragColor.rgb += (dither - 0.5) / 255.0 * uncovered;
      #endif
    }`,
};

/**
 * The last pass of the look (or the one before SMAA): the AO applied, the exposure and the tone map, the grade, the
 * vignette, then the sRGB transfer. The tone-mapping functions read three's `toneMappingExposure` uniform.
 */
export class FinishPass extends Pass {
  readonly material: THREE.RawShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(look: LookSettings, ao: THREE.Texture | null, backdrop = false, transparent = false) {
    super();
    this.material = new THREE.RawShaderMaterial({
      name: "FinishShader",
      defines: finishDefines(look, ao !== null, backdrop, transparent),
      uniforms: {
        tDiffuse: { value: null },
        tAo: { value: ao },
        aoIntensity: { value: look.ao.intensity },
        toneMappingExposure: { value: look.toneMapping.exposure },
        saturation: { value: look.grade.saturation },
        contrast: { value: look.grade.contrast },
        warmth: { value: look.grade.warmth },
        vignetteOffset: { value: look.vignette.offset },
        vignetteDarkness: { value: look.vignette.darkness },
        backdropTop: { value: new THREE.Vector3() },
        backdropBottom: { value: new THREE.Vector3() },
      },
      vertexShader: FinishShader.vertexShader,
      fragmentShader: FinishShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** The backdrop's two ends, the screen's top and bottom, in OKLab (`BACKDROP`). */
  setBackdrop(top: readonly number[], bottom: readonly number[]): void {
    this.material.uniforms.backdropTop.value.fromArray(top);
    this.material.uniforms.backdropBottom.value.fromArray(bottom);
  }

  /** The exposure, multiplied by the render profile's (`Effects.setExposure`). */
  setExposure(exposure: number): void {
    this.material.uniforms.toneMappingExposure.value = exposure;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
