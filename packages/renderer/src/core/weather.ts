// The weather (WEATHER-STUDY, #607 PR 2): its own chunk, an ambient effect on the one ambient loop (`ambient-loop.ts`). A weather
// tied to the season: a blazing sun in summer, the rain and the leaves in autumn, the snow in winter, sun rays and petals in spring.
// The board does not call it: the stories (`Renderer/Weather`) do (`loadWeather`), for the owner to judge it first.
//
// Everything that moves moves in its vertex shader, from the loop's time uniform: the CPU sets uniforms and counts, nothing more.
// The particles fall in a box around the camera's target that wraps (`mod`), so they stay put in the world as the camera pans and
// none is ever made or freed.
import * as THREE from "three";
import type { AmbientEffect } from "./ambient-loop";
import type { Season } from "./daynight-settings";
import { sunAt } from "./daynight";
import type { SnowUniforms } from "./snow-shader";
import { PLACEHOLDER_HEIGHT } from "./TileRenderer";
import {
  PARTICLE_FALL,
  PARTICLE_MAX,
  PARTICLE_SIZE,
  RAYS_MAX,
  SPLASH_MAX,
  type GradeSettings,
  type ParticleLayer,
  type ParticleSettings,
  type WeatherMode,
  type WeatherSettings,
} from "./weather-settings";

/** A small seeded generator (mulberry32): the same weather on every device and every load. */
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

/** The season each layer belongs to. */
const LAYER_SEASON: Record<ParticleLayer, Season> = { rain: "autumn", leaves: "autumn", snow: "winter", petals: "spring" };
/** How high each layer's box goes over the ground, world units: the rain and the snow from above the camera's view, the leaves and petals low. */
const LAYER_HEIGHT: Record<ParticleLayer, number> = { rain: 16, leaves: 3.5, snow: 12, petals: 4 };
/** Each layer's colours (linear), one picked per particle. */
const LAYER_COLORS: Record<ParticleLayer, [string, string, string]> = {
  rain: ["#d6e4f2", "#c4d4e6", "#e6eef7"],
  leaves: ["#c8641e", "#d9a021", "#9e3b1b"],
  snow: ["#ffffff", "#f2f6ff", "#e8f0ff"],
  petals: ["#ffd6e6", "#fff2f6", "#ffc2d9"],
};
/** How far a particle sways from its line, world units, and how fast its flat shape turns (leaves and petals tumble). */
const LAYER_SWAY: Record<ParticleLayer, number> = { rain: 0, leaves: 0.6, snow: 0.35, petals: 0.5 };
const LAYER_SPIN: Record<ParticleLayer, number> = { rain: 0, leaves: 2.2, snow: 0, petals: 1.6 };
const LAYER_SHAPE: Record<ParticleLayer, number> = { rain: 0, snow: 1, leaves: 2, petals: 3 };

/** A unit quad, x across from -0.5 to 0.5 and y from 0 to 1 (a streak's tail to its head, a flake's bottom to its top). */
function quad(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/** One random vec4 per instance: where it starts (x, y, z in the box, 0 to 1) and its own speed and look (w). */
function seeds(count: number, seed: number): THREE.InstancedBufferAttribute {
  const next = random(seed);
  return new THREE.InstancedBufferAttribute(Float32Array.from({ length: count * 4 }, next), 4);
}

const PARTICLE_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCenter;
uniform float uArea;
uniform float uHeight;
uniform float uBase;
uniform float uFall;
uniform vec2 uWind;
uniform float uSize;
uniform float uSway;
uniform float uSpin;
uniform float uShape;
varying vec2 vUv;
varying float vFade;
varying float vPick;
void main() {
  float pace = 0.8 + 0.4 * aSeed.w;
  float t = uTime * pace;
  float y = uHeight - mod(aSeed.y * uHeight + t * uFall, uHeight);
  vec2 sway = uSway * vec2(sin(uTime * 1.3 + aSeed.w * 40.0), cos(uTime * 0.9 + aSeed.x * 30.0));
  vec2 xz = aSeed.xz * uArea + uWind * t + sway;
  xz = mod(xz - uCenter.xz + 0.5 * uArea, uArea) + uCenter.xz - 0.5 * uArea;
  vec3 at = vec3(xz.x, uBase + y, xz.y);
  float h = y / uHeight;
  vec2 edge = abs(xz - uCenter.xz) / (0.5 * uArea);
  vFade = smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.8, h) * (1.0 - smoothstep(0.75, 1.0, max(edge.x, edge.y)));
  vUv = position.xy + vec2(0.5, 0.0);
  vPick = fract(aSeed.w * 7.31);
  vec3 world;
  if (uShape < 0.5) {
    // A streak: along its fall, turned about it to face the camera, a twentieth as wide as it is long.
    vec3 axis = normalize(vec3(uWind.x, -uFall, uWind.y));
    vec3 side = normalize(cross(axis, normalize(cameraPosition - at)));
    world = at + side * position.x * uSize * 0.05 - axis * position.y * uSize;
  } else {
    // A flake, a leaf, a petal: a square facing the camera, turned in its plane and flattened by its tumble.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float angle = aSeed.x * 6.2831853 + uTime * uSpin * (aSeed.w - 0.5) * 2.0;
    float flip = mix(1.0, 0.25 + 0.75 * abs(cos(uTime * uSpin * 0.7 + aSeed.z * 6.2831853)), step(0.5, uSpin));
    vec2 corner = vec2(position.x, (position.y - 0.5) * flip);
    corner = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * corner;
    world = at + (right * corner.x + up * corner.y) * uSize * (0.7 + 0.6 * aSeed.z);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uOpacity;
uniform float uLight;
uniform float uShape;
varying vec2 vUv;
varying float vFade;
varying float vPick;
void main() {
  vec2 p = vUv - vec2(0.5);
  float a;
  if (uShape < 0.5) {
    // The streak: thin at its ends, brightest at its head.
    a = (1.0 - abs(p.x) * 2.0) * smoothstep(0.0, 0.6, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
  } else if (uShape < 1.5) {
    // The flake: a soft round.
    a = smoothstep(0.5, 0.15, length(p));
  } else if (uShape < 2.5) {
    // The leaf: a pointed oval.
    float w = 0.5 * sin(3.14159265 * clamp(vUv.y, 0.0, 1.0));
    a = smoothstep(w, w - 0.08, abs(p.x));
  } else {
    // The petal: a soft oval, rounder at its top.
    a = smoothstep(0.5, 0.35, length(p * vec2(1.6, 1.0 + 0.4 * p.y)));
  }
  vec3 color = vPick < 0.34 ? uColorA : vPick < 0.67 ? uColorB : uColorC;
  float alpha = a * vFade * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color * uLight, alpha);
}
`;

const SPLASH_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCenter;
uniform float uArea;
uniform float uBase;
uniform float uSize;
varying vec2 vUv;
varying float vAge;
float hash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float period = 0.5 + 0.5 * aSeed.w;
  float cycle = (uTime + aSeed.z * period) / period;
  float k = floor(cycle);
  vAge = cycle - k;
  vec2 spot = vec2(hash(aSeed.xy + k), hash(aSeed.yx + k * 1.37));
  vec2 xz = uCenter.xz + (spot - 0.5) * uArea * 0.7;
  vUv = position.xy * 2.0 - vec2(0.0, 1.0);
  vec3 world = vec3(xz.x + position.x * uSize, uBase, xz.y + (position.y - 0.5) * uSize);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SPLASH_FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uLight;
varying vec2 vUv;
varying float vAge;
void main() {
  float r = length(vUv);
  float ring = smoothstep(0.18, 0.0, abs(r - vAge * 0.9));
  float alpha = ring * (1.0 - vAge) * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vec3(0.85, 0.9, 0.97) * uLight, alpha);
}
`;

const OVERLAY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The grade, the glare, the shimmer and the light shafts in one full-screen draw: the colour it writes, `tint`, multiplies the
 * board's light; its alpha, the glare and the shafts, adds `tint * alpha` (the blend `src * src.a + dst * src`). Its alpha leaves
 * the target's as it is, so the backdrop of the cycle still fills the sky (the finish pass adds it where the board leaves the
 * target clear, the light over it). The shafts fan out from the sun's side of the screen (`uSun`), as the game's camera, looking
 * down, would see light falling through the air between it and the board; they turn slowly, from the loop's time.
 */
const OVERLAY_FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform float uGlare;
uniform float uGlareSize;
uniform vec2 uSun;
uniform float uAspect;
uniform float uShimmer;
uniform float uRays;
uniform float uRayCount;
uniform float uRaySize;
uniform float uRaySpeed;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 d = (vUv * 2.0 - 1.0 - uSun) * vec2(uAspect, 1.0);
  vec2 g = d / (2.0 * uGlareSize);
  float light = uGlare * exp(-dot(g, g) * 2.0);
  if (uRays > 0.0) {
    float r = length(d);
    float angle = atan(d.y, d.x);
    float shafts = smoothstep(0.55, 1.0, sin(angle * uRayCount + uTime * uRaySpeed * 0.12));
    shafts += 0.6 * smoothstep(0.7, 1.0, sin(angle * uRayCount * 1.7 - uTime * uRaySpeed * 0.08 + 1.3));
    light += uRays * shafts * exp(-r / (1.6 * uRaySize)) * smoothstep(0.05, 0.5, r);
  }
  float ripple = sin(vUv.y * 140.0 - uTime * 2.4 + sin(vUv.x * 9.0 + uTime * 0.9) * 2.5);
  float shimmer = uShimmer * ripple * smoothstep(0.45, 1.0, vUv.y);
  gl_FragColor = vec4(uTint * (1.0 + shimmer), light);
}
`;

/** A blend that keeps the target's alpha: the cycle's backdrop is laid where the board left it clear. */
function keepAlpha(material: THREE.ShaderMaterial, src: THREE.BlendingSrcFactor, dst: THREE.BlendingDstFactor): void {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = src;
  material.blendDst = dst;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
}

const linear = (hex: string) => new THREE.Color(hex);

/** One falling layer: one instanced draw of its count, none while it is hidden. */
class Particles {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly uniforms;

  constructor(
    readonly layer: ParticleLayer,
    time: { value: number },
    center: { value: THREE.Vector3 },
  ) {
    const geometry = quad();
    geometry.setAttribute("aSeed", seeds(PARTICLE_MAX[layer], 607 + LAYER_SHAPE[layer]));
    geometry.instanceCount = 0;
    const [a, b, c] = LAYER_COLORS[layer];
    this.uniforms = {
      uTime: time,
      uCenter: center,
      uArea: { value: 48 },
      uHeight: { value: LAYER_HEIGHT[layer] },
      uBase: { value: PLACEHOLDER_HEIGHT },
      uFall: { value: PARTICLE_FALL[layer] },
      uWind: { value: new THREE.Vector2() },
      uSize: { value: PARTICLE_SIZE[layer] },
      uSway: { value: LAYER_SWAY[layer] },
      uSpin: { value: LAYER_SPIN[layer] },
      uShape: { value: LAYER_SHAPE[layer] },
      uColorA: { value: linear(a) },
      uColorB: { value: linear(b) },
      uColorC: { value: linear(c) },
      uOpacity: { value: 0 },
      uLight: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      name: `weather-${layer}`,
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = `weather-${layer}`;
    // The particles move in the shader: no bounding sphere holds them, and the box follows the camera's target.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    this.mesh.visible = false;
  }

  /** Its settings at `presence` (the season's share, 0 to 1) under the wind (x, z, world units a second) and the light. */
  apply(s: ParticleSettings, presence: number, area: number, wind: [number, number], light: number, moving: boolean): void {
    const count = Math.round(s.density * PARTICLE_MAX[this.layer]);
    const u = this.uniforms;
    u.uArea.value = area;
    u.uFall.value = PARTICLE_FALL[this.layer] * s.speed;
    u.uSize.value = PARTICLE_SIZE[this.layer] * s.size;
    u.uWind.value.set(wind[0] * s.wind, wind[1] * s.wind);
    u.uOpacity.value = s.opacity * presence;
    u.uLight.value = light;
    this.mesh.geometry.instanceCount = count;
    // Nothing falls under reduced motion: a still flake would read as a speck on the board.
    this.mesh.visible = moving && s.enabled && count > 0 && u.uOpacity.value > 0.001;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** The weather now, for the stories' readout and the tests. */
export interface WeatherStats {
  mode: WeatherMode;
  season: Season | null;
  /** Each season's share, 0 to 1 (1 the season shown; a change of season fades one into the next). */
  presence: Record<Season, number>;
  /** The particles drawn now, by layer. */
  particles: Record<ParticleLayer, number>;
  splashes: number;
  rays: number;
  /** The draws the weather adds to a frame. */
  drawCalls: number;
  /** The share of the faces up under snow now. */
  cover: number;
  /** The daylight the weather sees, 0 (night) to 1. */
  daylight: number;
}

/** How far past the screen's centre the glare's middle sits at most (the screen's edge is 1). */
const GLARE_EDGE = 1.35;

const SEASON_LIST: Season[] = ["summer", "autumn", "winter", "spring"];

/**
 * The weather on the board. The caller adds `object` to the scene (world space, not the board's group: the box follows the camera's
 * target) and registers the weather on the scene's ambient loop; `snow` is the tile shader's snow (`TileRenderer.snowUniforms`).
 * The season comes from the cycle (`setCycle`, the wheel: auto, the cycle's season; fixed, the chosen one), the wind from the cloud
 * shadows (`setWind`), the mode from the settings, the tier and reduced motion (`setMode`, `weatherMode`). Each change calls
 * `onChange` (a frame). `dispose` frees what it made and turns the snow off.
 */
export class Weather implements AmbientEffect {
  readonly object = new THREE.Group();
  /** A frame is wanted (a setting, the season, the mode changed): the caller sets it to `requestRender`. */
  onChange: (() => void) | null = null;
  private readonly time: { value: number };
  private readonly center = { value: new THREE.Vector3() };
  private readonly layers: Record<ParticleLayer, Particles>;
  private readonly splashes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly overlay: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private settings: WeatherSettings;
  private mode: WeatherMode = "off";
  private season: Season | null = null;
  private daylight = 1;
  private wind: [number, number] = [0, 0];
  private readonly presence: Record<Season, number> = { summer: 0, autumn: 0, winter: 0, spring: 0 };
  private last: number | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private readonly sunDir = new THREE.Vector3(0.4, 0.8, 0.4).normalize();
  private disposed = false;

  constructor(
    time: { value: number },
    private readonly snow: SnowUniforms,
    settings: WeatherSettings,
  ) {
    this.time = time;
    this.settings = settings;
    this.object.name = "weather";
    this.layers = {
      rain: new Particles("rain", time, this.center),
      leaves: new Particles("leaves", time, this.center),
      snow: new Particles("snow", time, this.center),
      petals: new Particles("petals", time, this.center),
    };
    for (const layer of Object.values(this.layers)) this.object.add(layer.mesh);

    const splashGeometry = quad();
    splashGeometry.setAttribute("aSeed", seeds(SPLASH_MAX, 1607));
    splashGeometry.instanceCount = 0;
    this.splashes = new THREE.Mesh(
      splashGeometry,
      new THREE.ShaderMaterial({
        name: "weather-splashes",
        vertexShader: SPLASH_VERTEX,
        fragmentShader: SPLASH_FRAGMENT,
        uniforms: {
          uTime: time,
          uCenter: this.center,
          uArea: { value: 48 },
          uBase: { value: PLACEHOLDER_HEIGHT + 0.01 },
          uSize: { value: 0.22 },
          uOpacity: { value: 0 },
          uLight: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.splashes.name = "weather-splashes";
    this.splashes.frustumCulled = false;
    this.splashes.renderOrder = 14;
    this.splashes.visible = false;
    this.object.add(this.splashes);

    const overlayGeometry = new THREE.BufferGeometry();
    // One triangle over the whole screen.
    overlayGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const overlayMaterial = new THREE.ShaderMaterial({
      name: "weather-grade",
      vertexShader: OVERLAY_VERTEX,
      fragmentShader: OVERLAY_FRAGMENT,
      uniforms: {
        uTint: { value: new THREE.Color(1, 1, 1) },
        uGlare: { value: 0 },
        uGlareSize: { value: 0.7 },
        uSun: { value: new THREE.Vector2(0, 2) },
        uAspect: { value: 1 },
        uShimmer: { value: 0 },
        uRays: { value: 0 },
        uRayCount: { value: 6 },
        uRaySize: { value: 1 },
        uRaySpeed: { value: 1 },
        uTime: time,
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    keepAlpha(overlayMaterial, THREE.SrcAlphaFactor, THREE.SrcColorFactor);
    this.overlay = new THREE.Mesh(overlayGeometry, overlayMaterial);
    this.overlay.name = "weather-grade";
    this.overlay.frustumCulled = false;
    // Last of the scene: it grades what is under it, the particles included.
    this.overlay.renderOrder = 30;
    this.overlay.visible = false;
    this.object.add(this.overlay);
    // Each frame drawn, whatever drew it (the camera, the loop), before the first of the weather's draws: the box under the
    // camera's look, the sun's place on the screen. Once a frame (three's frame counter), whichever mesh draws first.
    let followed = -1;
    for (const mesh of this.meshes()) {
      mesh.onBeforeRender = (renderer, scene, camera) => {
        if (renderer.info.render.frame === followed) return;
        followed = renderer.info.render.frame;
        this.follow(scene, camera as THREE.PerspectiveCamera);
      };
    }
    this.apply();
  }

  private meshes(): THREE.Mesh[] {
    return [...Object.values(this.layers).map((l) => l.mesh), this.splashes, this.overlay];
  }

  setSettings(settings: WeatherSettings): void {
    this.settings = settings;
    this.apply();
  }

  /** Off, still (reduced motion: nothing falls) or moving (`weatherMode`). A change of mode shows the season at once, with no fade. */
  setMode(mode: WeatherMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.snap();
    this.apply();
  }

  /**
   * The cycle's point (`GameScene.getDayNight`): its season (with the wheel fixed, the chosen one, since the cycle holds it) and
   * its position, for the daylight (the sun's height, 0 at night). Null with the cycle off: no season, no weather.
   */
  setCycle(point: { season: Season; position: number } | null): void {
    const season = point?.season ?? null;
    const daylight = point ? sunAt(point.season, point.position).up : 1;
    if (season === this.season && Math.abs(daylight - this.daylight) < 1e-3) return;
    const first = this.season === null;
    this.season = season;
    this.daylight = daylight;
    // The first season (and every change while nothing moves) shows at once; a change while the weather moves fades in.
    if (first || this.mode !== "moving") this.snap();
    this.apply();
  }

  /** The cloud shadows' wind (`CloudShadowSettings.windDirection`, degrees on the board, and `windSpeed`). */
  setWind(directionDegrees: number, speed: number): void {
    const r = (directionDegrees * Math.PI) / 180;
    this.wind = [Math.cos(r) * speed, Math.sin(r) * speed];
    this.apply();
  }

  private snap(): void {
    for (const s of SEASON_LIST) this.presence[s] = this.target(s);
  }

  /** The share a season should have: 1 for the season shown, if its weather is on, else 0. */
  private target(season: Season): number {
    return this.mode !== "off" && this.settings.enabled && this.season === season && this.settings[season].enabled ? 1 : 0;
  }

  /** The loop stepped to `seconds`: the seasons fade toward their share. True while anything moves (a frame). */
  step(seconds: number): boolean {
    const dt = this.last === null ? 0 : Math.min(0.1, Math.max(0, seconds - this.last));
    this.last = seconds;
    if (this.mode !== "moving") return false;
    let fading = false;
    const rate = this.settings.fadeSeconds > 0 ? dt / this.settings.fadeSeconds : 1;
    for (const s of SEASON_LIST) {
      const goal = this.target(s);
      const now = this.presence[s];
      if (now === goal) continue;
      this.presence[s] = goal > now ? Math.min(goal, now + rate) : Math.max(goal, now - rate);
      fading = true;
    }
    if (fading) this.apply();
    return fading || this.moves();
  }

  /** Something on the board moves on its own: a layer falling, the splashes, the shafts' turn, the shimmer. */
  private moves(): boolean {
    return (
      Object.values(this.layers).some((l) => l.mesh.visible) ||
      this.splashes.visible ||
      (this.overlay.visible && (this.overlay.material.uniforms.uShimmer!.value > 0 || this.overlay.material.uniforms.uRays!.value > 0))
    );
  }

  private apply(): void {
    if (this.disposed) return;
    const s = this.settings;
    const moving = this.mode === "moving";
    const p = this.presence;
    const day = this.daylight;
    const light = s.night + (1 - s.night) * day;
    const sun = (k: number) => k * day;

    // The particles, lit by the daylight (they are not lit by the scene's lights: a few per cent of the light at night).
    this.layers.rain.apply(s.autumn.rain, p.autumn, s.area, this.wind, light, moving);
    this.layers.leaves.apply(s.autumn.leaves, p.autumn, s.area, this.wind, light, moving);
    this.layers.snow.apply(s.winter.snow, p.winter, s.area, this.wind, light, moving);
    this.layers.petals.apply(s.spring.petals, p.spring, s.area, this.wind, light, moving);

    const splashes = this.splashes.material.uniforms;
    const splashCount = Math.round(s.autumn.splashes * SPLASH_MAX);
    splashes.uArea!.value = s.area;
    splashes.uOpacity!.value = Math.min(1, 2.5 * s.autumn.rain.opacity) * p.autumn;
    splashes.uLight!.value = light;
    this.splashes.geometry.instanceCount = splashCount;
    this.splashes.visible = moving && s.autumn.rain.enabled && splashCount > 0 && p.autumn > 0.001;

    // The shafts: held (their turn frozen) under reduced motion, gone with the sun.
    const r = s.spring.rays;
    const rayCount = Math.round(r.density * RAYS_MAX);
    const rays = r.enabled && rayCount > 0 ? sun(r.opacity * p.spring) : 0;

    // The grade: each season's tint at its share and the daylight (a grade of the night would only darken it more).
    const tint = new THREE.Color(1, 1, 1);
    for (const season of SEASON_LIST) tint.multiply(gradeOf(s[season].grade, sun(p[season])));
    // Summer's stronger sun: the light raised by its brightness.
    tint.multiplyScalar(1 + sun(s.summer.brightness * p.summer));
    const overlay = this.overlay.material.uniforms;
    overlay.uTint!.value.copy(tint);
    overlay.uGlare!.value = sun(s.summer.glare * p.summer);
    overlay.uGlareSize!.value = s.summer.glareSize;
    overlay.uShimmer!.value = moving ? sun(s.summer.shimmer * p.summer) : 0;
    overlay.uRays!.value = rays > 5e-4 ? rays : 0;
    overlay.uRayCount!.value = Math.max(1, rayCount);
    overlay.uRaySize!.value = r.size;
    overlay.uRaySpeed!.value = r.speed;
    const graded = Math.abs(tint.r - 1) + Math.abs(tint.g - 1) + Math.abs(tint.b - 1) > 1e-3;
    this.overlay.visible = this.mode !== "off" && (graded || overlay.uGlare!.value > 1e-4 || overlay.uShimmer!.value > 0 || overlay.uRays!.value > 0);

    // The snow on the tops: static, it stays under reduced motion; it comes and goes with winter's share.
    this.snow.uSnowCover.value = this.mode !== "off" && s.winter.enabled ? s.winter.cover * p.winter : 0;

    this.onChange?.();
  }

  /** Before a frame: the box's centre where the camera looks at the ground, the sun's direction and its place on the screen. */
  private follow(scene: THREE.Object3D, camera: THREE.PerspectiveCamera): void {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const look = camera.getWorldDirection(new THREE.Vector3());
    const along = look.y < -1e-3 ? (PLACEHOLDER_HEIGHT - origin.y) / look.y : 60;
    this.center.value.copy(origin).addScaledVector(look, Math.min(along, 400));
    this.center.value.y = PLACEHOLDER_HEIGHT;

    this.keyLight ??= findKeyLight(scene);
    if (this.keyLight) {
      const from = this.keyLight.getWorldPosition(new THREE.Vector3());
      const to = this.keyLight.target.getWorldPosition(new THREE.Vector3());
      const dir = from.sub(to);
      if (dir.lengthSq() > 0) this.sunDir.copy(dir.normalize());
    }
    // Where the glare and the shafts come from: the sun's place on the screen (-1 to 1) when it is ahead of the camera; when it is behind or
    // above (the game's camera looks down, the noon sun is at its back), a light leak just past the screen's edge on the sun's
    // side, or past the top when the sun is straight behind.
    const view = this.sunDir.clone().transformDirection(camera.matrixWorldInverse);
    const fy = 1 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const sun = this.overlay.material.uniforms.uSun!.value as THREE.Vector2;
    if (view.z < -0.2) sun.set((view.x * fy) / camera.aspect / -view.z, (view.y * fy) / -view.z);
    else if (Math.hypot(view.x, view.y) > 0.15) sun.set(view.x, view.y).normalize().multiplyScalar(GLARE_EDGE);
    else sun.set(0, GLARE_EDGE);
    if (sun.length() > GLARE_EDGE) sun.setLength(GLARE_EDGE);
    this.overlay.material.uniforms.uAspect!.value = camera.aspect;
  }

  stats(): WeatherStats {
    const particles = Object.fromEntries(Object.entries(this.layers).map(([k, l]) => [k, l.mesh.visible ? l.mesh.geometry.instanceCount : 0])) as Record<ParticleLayer, number>;
    const meshes = this.meshes();
    return {
      mode: this.mode,
      season: this.season,
      presence: { ...this.presence },
      particles,
      splashes: this.splashes.visible ? this.splashes.geometry.instanceCount : 0,
      rays: this.overlay.visible && this.overlay.material.uniforms.uRays!.value > 0 ? this.overlay.material.uniforms.uRayCount!.value : 0,
      drawCalls: meshes.filter((m) => m.visible).length,
      cover: this.snow.uSnowCover.value,
      daylight: this.daylight,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.snow.uSnowCover.value = 0;
    for (const layer of Object.values(this.layers)) layer.dispose();
    for (const mesh of [this.splashes, this.overlay]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.object.removeFromParent();
    this.object.clear();
    this.keyLight = null;
    this.onChange = null;
  }
}

/** A grade's tint at `share`: white (no change) at 0, its colour mixed in by `amount` at 1. */
export function gradeOf(grade: GradeSettings, share: number): THREE.Color {
  return new THREE.Color(1, 1, 1).lerp(new THREE.Color(grade.color), grade.amount * Math.min(1, Math.max(0, share)));
}

/** The scene's sun: its shadow-casting directional light (`GameScene`'s key light, which the cycle moves). */
function findKeyLight(scene: THREE.Object3D): THREE.DirectionalLight | null {
  let found: THREE.DirectionalLight | null = null;
  scene.traverse((child) => {
    if (!found && child instanceof THREE.DirectionalLight && child.castShadow) found = child;
  });
  return found;
}
