// The cloud shadows (CLOUD-SHADOWS, #573): their own chunk, loaded by `GameScene` the first time the ambient effects are on with
// the clouds. The tile shader's term (`cloud-shader.ts`) is in the board's chunk; this chunk makes the cloud map once, sets the
// term's uniforms from the settings, and drifts the clouds on the one ambient loop (`AmbientEffect`).
import * as THREE from "three";
import type { AmbientEffect } from "./ambient-loop";
import type { CloudShadowSettings } from "./ambient-settings";
import type { CloudUniforms } from "./cloud-shader";
import type { Season } from "./daynight-settings";

/** The cloud map's side, in texels: 128 x 128, one channel (16 KB, and its mipmaps). */
export const CLOUD_MAP_SIZE = 128;
/** The noise's octaves: lattices of 4, 8, 16 and 32 cells across the map, each half the weight of the one before. */
const OCTAVES = [4, 8, 16, 32] as const;
/**
 * The least the clouds move, in world units, before a step draws a frame: a quarter of a voxel (0.075). At the default wind a step
 * of the 30 a second loop moves them 0.017, so the board draws about 15 frames a second, never a still frame.
 */
export const CLOUD_MIN_MOVE = 0.02;
/** The quantile table's steps: the noise's value under which a share of the map lies (`cloudEdges`). */
const QUANTILE_STEPS = 256;

/** A small seeded generator (mulberry32): the same clouds on every device and every load. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A soft tileable noise, `size` x `size`, 0 to 1 (its lowest texel 0, its highest 1): value noise on lattices that wrap (`OCTAVES`),
 * smoothly interpolated and summed, so the map repeats with no seam.
 */
export function cloudNoise(size: number = CLOUD_MAP_SIZE, seed = 573): Float32Array {
  const next = random(seed);
  const out = new Float32Array(size * size);
  let weight = 1;
  for (const cells of OCTAVES) {
    const lattice = Float32Array.from({ length: cells * cells }, next);
    const at = (x: number, y: number) => lattice[(y % cells) * cells + (x % cells)]!;
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        out[y * size + x]! += (top + (bottom - top) * sy) * weight;
      }
    }
    weight /= 2;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of out) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! - min) / (max - min);
  return out;
}

/** The noise's quantiles: entry k is the value under which k / `QUANTILE_STEPS` of the map lies. */
export function noiseQuantiles(noise: ArrayLike<number>): Float32Array {
  const sorted = Float32Array.from(noise).sort();
  return Float32Array.from({ length: QUANTILE_STEPS + 1 }, (_, k) => sorted[Math.min(sorted.length - 1, Math.round((k / QUANTILE_STEPS) * (sorted.length - 1)))]!);
}

const quantile = (table: Float32Array, share: number): number => table[Math.round(Math.min(1, Math.max(0, share)) * QUANTILE_STEPS)]!;

/**
 * The edge of a cloud on the noise (`uCloudEdge`): a share `coverage` of the map is above its middle, and its soft edge spans a
 * share `softness` of the map around it. In shares of the map, not in noise values, so the knobs mean the same whatever the noise.
 */
export function cloudEdges(table: Float32Array, coverage: number, softness: number): [number, number] {
  const middle = 1 - coverage;
  const low = quantile(table, middle - softness / 2);
  const high = Math.max(quantile(table, middle + softness / 2), low + 1 / 255);
  return [low, high];
}

/** The wind's direction on the board (x, z), from its angle in degrees. */
export function windOf(degrees: number): [number, number] {
  const r = (degrees * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

const fract = (v: number) => v - Math.floor(v);

/** The wisps' plane: its side, world units (the board's 72 tiles span about 30), at the clouds' height. */
const WISPS_SIDE = 800;

const WISPS_VERTEX = /* glsl */ `
varying vec2 vCloudXZ;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vCloudXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const WISPS_FRAGMENT = /* glsl */ `
uniform sampler2D uCloudMap;
uniform float uCloudScale;
uniform vec2 uCloudOffset;
uniform vec2 uCloudEdge;
uniform float uWispOpacity;
varying vec2 vCloudXZ;
void main() {
  float cloud = smoothstep(uCloudEdge.x, uCloudEdge.y, texture2D(uCloudMap, vCloudXZ * uCloudScale + uCloudOffset).r);
  gl_FragColor = vec4(vec3(1.0), uWispOpacity * cloud);
}
`;

/**
 * The cloud shadows on the ambient loop. `GameScene` hands it the tile shader's uniforms (`TileRenderer.cloudUniforms`) and adds
 * `object` (the wisps, hidden unless `wisps` is above 0) to its scene. It turns on and off with the effects (`setActive`); the
 * season, while the cycle draws the board, scales the coverage (`setSeason`). Nothing here touches the shadow map: the clouds
 * are a term of the light, so a cloud that moves draws a frame and never a shadow pass.
 */
export class CloudShadows implements AmbientEffect {
  /** The wisps (`CloudShadowSettings.wisps`): one plane at the clouds' height, one draw when shown. */
  readonly object: THREE.Mesh;
  /** A frame is wanted (a setting changed): `GameScene` sets it to `requestRender`. */
  onChange: (() => void) | null = null;
  private readonly texture: THREE.DataTexture;
  private readonly quantiles: Float32Array;
  private readonly clearMap: THREE.Texture;
  private readonly wispOpacity = { value: 0 };
  private settings: CloudShadowSettings;
  private season: Season | null = null;
  private active = false;
  /** The light the clouds dim (`setLight`): the sun up (0 to 1), and the night's level for the moon's share (0 by day). */
  private sun = 1;
  private night = 0;
  private wind: [number, number] = [1, 0];
  /** The wind's travel, world units, at the last step, and at the last step that drew. */
  private travel = 0;
  private drawnTravel: number | null = null;

  constructor(
    private readonly uniforms: CloudUniforms,
    settings: CloudShadowSettings,
  ) {
    const noise = cloudNoise();
    this.quantiles = noiseQuantiles(noise);
    const texels = Uint8Array.from(noise, (v) => Math.round(v * 255));
    this.texture = new THREE.DataTexture(texels, CLOUD_MAP_SIZE, CLOUD_MAP_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.needsUpdate = true;
    this.clearMap = uniforms.uCloudMap.value;
    uniforms.uCloudMap.value = this.texture;

    const material = new THREE.ShaderMaterial({
      name: "cloud-wisps",
      vertexShader: WISPS_VERTEX,
      fragmentShader: WISPS_FRAGMENT,
      uniforms: {
        uCloudMap: uniforms.uCloudMap,
        uCloudScale: uniforms.uCloudScale,
        uCloudOffset: uniforms.uCloudOffset,
        uCloudEdge: uniforms.uCloudEdge,
        uWispOpacity: this.wispOpacity,
      },
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(WISPS_SIDE, WISPS_SIDE).rotateX(-Math.PI / 2), material);
    this.object.name = "cloud-wisps";
    this.object.renderOrder = 20;
    this.object.castShadow = false;
    this.object.receiveShadow = false;
    this.object.visible = false;
    this.settings = settings;
    this.apply();
  }

  setSettings(settings: CloudShadowSettings): void {
    this.settings = settings;
    this.apply();
  }

  /** The season the cycle draws (its coverage factor), or null with the cycle off (the plain coverage). */
  setSeason(season: Season | null): void {
    if (season === this.season) return;
    this.season = season;
    this.apply();
  }

  /**
   * The light the clouds can dim: `sun`, how up the sun is (0 under the horizon), and `night`, the cycle's night level (0 by day,
   * 1 at full night), which scales `moon`. With the cycle off, the look's sun: (1, 0). A held night with `moon` at 0 leaves
   * nothing to dim: the clouds are then not visible and step no frame.
   */
  setLight(sun: number, night: number): void {
    if (sun === this.sun && night === this.night) return;
    const was = this.visible;
    const moon = this.moonShare();
    this.sun = sun;
    this.night = night;
    // A moving cycle calls this on each of its steps: only a change the light shows sets the uniforms again.
    if (this.visible !== was || this.moonShare() !== moon) this.apply();
  }

  /** The share of the darkness the moon's light takes now: `moon` times the night's level. */
  private moonShare(): number {
    return this.settings.moon * this.night;
  }

  /** On with the ambient effects and the clouds' own switch; off, the term reads nothing and the wisps hide. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.drawnTravel = null;
    this.apply();
  }

  /** The coverage in effect: the setting times the season's factor, at most 1. */
  coverage(): number {
    const factor = this.season ? this.settings.seasonCoverage[this.season] : 1;
    return Math.min(1, this.settings.coverage * factor);
  }

  /**
   * Whether the clouds draw anything: on, with some coverage, and either a darkness on a light that shines (the sun up, or the
   * moon's share at night) or wisps.
   */
  get visible(): boolean {
    const s = this.settings;
    const dims = s.darkness > 0 && (this.sun > 0 || this.moonShare() > 0);
    return this.active && s.enabled && this.coverage() > 0 && (dims || s.wisps > 0);
  }

  /** What the clouds draw now, for the stories' readout and the tests. */
  stats(): { visible: boolean; coverage: number; darkness: number; wisps: boolean; travel: number } {
    return { visible: this.visible, coverage: this.coverage(), darkness: this.uniforms.uCloudDark.value, wisps: this.object.visible, travel: this.travel };
  }

  /**
   * The loop stepped to `seconds`: the clouds drift by the wind's travel since the loop's time 0. True (a frame) when they moved
   * by at least `CLOUD_MIN_MOVE` since the last frame they drew, or on the first step after a change.
   */
  step(seconds: number): boolean {
    if (!this.visible) return false;
    this.travel = seconds * this.settings.windSpeed;
    if (this.drawnTravel !== null && Math.abs(this.travel - this.drawnTravel) < CLOUD_MIN_MOVE) return false;
    this.drawnTravel = this.travel;
    this.setOffset();
    return true;
  }

  /** The cloud map's offset for the wind's travel: the pattern moves with the wind, wrapped to one period (float precision). */
  private setOffset(): void {
    const s = 1 / this.settings.scale;
    this.uniforms.uCloudOffset.value.set(fract(-this.wind[0] * this.travel * s), fract(-this.wind[1] * this.travel * s));
  }

  private apply(): void {
    const s = this.settings;
    const visible = this.visible;
    const [low, high] = cloudEdges(this.quantiles, this.coverage(), s.softness);
    this.wind = windOf(s.windDirection);
    this.uniforms.uCloudScale.value = 1 / s.scale;
    this.uniforms.uCloudEdge.value.set(low, high);
    this.uniforms.uCloudHeight.value = s.height;
    this.uniforms.uCloudDark.value = visible ? s.darkness : 0;
    this.uniforms.uCloudMoon.value = this.moonShare();
    this.wispOpacity.value = s.wisps;
    this.object.visible = visible && s.wisps > 0;
    this.object.position.y = s.height;
    this.drawnTravel = null;
    this.setOffset();
    this.onChange?.();
  }

  dispose(): void {
    this.uniforms.uCloudDark.value = 0;
    this.uniforms.uCloudMap.value = this.clearMap;
    this.texture.dispose();
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
    this.onChange = null;
  }
}
