// The fog of war (FOG-STUDY): its own chunk, an ambient effect on the one ambient loop (`ambient-loop.ts`). A fog over the whole
// scene but the clear cells (the placed tiles and the free slots around them, or a village's owned cells and the cells next to
// them); a cell revealed lifts over a short transition. The board does not call it: the stories (`Renderer/Fog of war`) do
// (`loadFogOfWar`), for the owner to judge it first.
//
// One field drives it all: a small texture (`buildRevealField`, one byte a texel, four texels a cell) of the distance to the nearest
// clear cell, built on the CPU when the reveal changes and while a cell lifts. The fog's floor (a sheet at the ground, or with the
// landscape the ground itself), its mist and the landscape's props read it in their shaders: one texture read a fragment, no draw
// call per cell. The noise that makes the fog billow and drift moves in the shader, from the loop's time uniform.
import * as THREE from "three";
import type { AmbientEffect } from "./ambient-loop";
import type { Season } from "./daynight-settings";
import { sunAt } from "./daynight";
import { TILE_SIZE } from "./types";
import {
  FIELD_REACH,
  FIELD_TEXELS,
  RevealFieldBuilder,
  RevealTransition,
  cellKey,
  fieldEdge,
  type FogCell,
  type FogMode,
  type FogSettings,
} from "./fog-of-war-settings";

/** A voxel of the models: a tile is 40 across. */
const VOXEL = TILE_SIZE / 40;
/** The noise texture's side, in texels, and the features it holds across (it wraps). */
const NOISE_SIZE = 64;
const NOISE_FEATURES = 8;
/** The floor's and the ground's side, world units: past the farthest view (the camera is at most 300 from its target). */
const FLOOR_SIZE = 4000;
/** The fog's floor sits at the tiles' foot; the landscape's ground just under the plates (`PLATE_Y`, 0.004). */
const FLOOR_Y = 0;
const GROUND_Y = -0.02;
/** How far past the soft edge's reach a cell still holds props, cells: beyond, the fog hides them whole. */
const DECOR_MARGIN = 1;

/** A small seeded generator (mulberry32): the same fog and landscape on every device and every load. */
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

const smoothstepTo = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A cell's own seed: its props are the same at every load. */
const cellSeed = (x: number, y: number): number => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;

/** A tileable value noise, two octaves (`NOISE_FEATURES` and twice as many across), one byte a texel. */
export function fogNoise(seed = 7): Uint8Array {
  const next = random(seed);
  const lattice = (n: number) => Float32Array.from({ length: n * n }, next);
  const octaves: Array<[number, Float32Array, number]> = [
    [NOISE_FEATURES, lattice(NOISE_FEATURES), 0.68],
    [NOISE_FEATURES * 2, lattice(NOISE_FEATURES * 2), 0.32],
  ];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const values = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  for (let j = 0; j < NOISE_SIZE; j++) {
    for (let i = 0; i < NOISE_SIZE; i++) {
      let v = 0;
      for (const [n, grid, weight] of octaves) {
        const [u, w] = [(i / NOISE_SIZE) * n, (j / NOISE_SIZE) * n];
        const [x0, y0] = [Math.floor(u), Math.floor(w)];
        const [fx, fy] = [smooth(u - x0), smooth(w - y0)];
        const g = (x: number, y: number) => grid[(((y % n) + n) % n) * n + (((x % n) + n) % n)]!;
        v += weight * (g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy);
      }
      values[j * NOISE_SIZE + i] = v;
    }
  }
  const [min, max] = [Math.min(...values), Math.max(...values)];
  return Uint8Array.from(values, (v) => Math.round(((v - min) / (max - min)) * 255));
}

/** The fog's uniforms, shared by the floor, the mist, the ground and the props. */
interface FogUniforms {
  [name: string]: THREE.IUniform;
  uTime: { value: number };
  uFogField: { value: THREE.Texture };
  /** The field's first cell edge (x, z, in cells) and one over its size in cells. */
  uFogRect: { value: THREE.Vector4 };
  uFogReach: { value: number };
  uFogEdge: { value: number };
  uFogFalloff: { value: number };
  uFogBillow: { value: number };
  uFogVoxel: { value: number };
  uFogNoise: { value: THREE.Texture };
  uFogNoiseScale: { value: number };
  uFogWind: { value: THREE.Vector2 };
  uFogColor: { value: THREE.Color };
  uFogShade: { value: THREE.Color };
  uFogLight: { value: THREE.Color };
  uFogOpacity: { value: number };
}

/** The field's distance at a point of the board (x, z), in cells; the props' vertex shader reads it too. */
const FOG_FIELD_GLSL = /* glsl */ `
uniform sampler2D uFogField;
uniform vec4 uFogRect;
uniform float uFogReach;
uniform float uFogEdge;
float fogDistance(vec2 board) {
  vec2 cell = board / ${TILE_SIZE.toFixed(1)};
  return texture2D(uFogField, (cell - uFogRect.xy) * uFogRect.zw).r * uFogReach;
}
`;

/**
 * `fogAt(board, shift)`: the fog's amount at a point of the board (0 clear, 1 thick) and its noise there (0 to 1). A hard edge
 * (`uFogFalloff` 0) is a line on the cells' border, antialiased by the field's own slope on screen; a soft one thickens over
 * `uFogFalloff` cells, its distance pushed in and out by the noise (`uFogBillow`) away from the border only, so a clear cell
 * stays clear. `uFogVoxel` cuts it all on the voxel grid. `fogColorAt(noise)` is its colour, the shade in the noise's hollows.
 */
const FOG_GLSL = /* glsl */ `
${FOG_FIELD_GLSL}
uniform float uTime;
uniform float uFogFalloff;
uniform float uFogBillow;
uniform float uFogVoxel;
uniform sampler2D uFogNoise;
uniform float uFogNoiseScale;
uniform vec2 uFogWind;
uniform vec3 uFogColor;
uniform vec3 uFogShade;
uniform vec3 uFogLight;
uniform float uFogOpacity;
float fogNoiseAt(vec2 board, vec2 shift) {
  vec2 uv = (board - uFogWind * uTime) * uFogNoiseScale + shift;
  float a = texture2D(uFogNoise, uv).r;
  float b = texture2D(uFogNoise, (board - uFogWind * uTime * 1.6) * uFogNoiseScale * 2.3 + shift.yx + 0.37).r;
  return 0.65 * a + 0.35 * b;
}
vec2 fogAt(vec2 board, vec2 shift) {
  vec2 p = uFogVoxel > 0.5 ? (floor(board / ${VOXEL.toFixed(4)}) + 0.5) * ${VOXEL.toFixed(4)} : board;
  float d = fogDistance(p);
  float n = fogNoiseAt(p, shift);
  float amount;
  if (uFogFalloff <= 0.0) {
    float aa = uFogVoxel > 0.5 ? 1e-4 : max(fwidth(d), 1e-4);
    amount = smoothstep(uFogEdge - 0.5 * aa, uFogEdge + 0.5 * aa, d);
  } else {
    float away = smoothstep(uFogEdge, uFogEdge + 0.5, d);
    amount = smoothstep(uFogEdge, uFogEdge + uFogFalloff, d + (n - 0.5) * 2.0 * uFogBillow * away);
  }
  return vec2(amount, n);
}
vec3 fogColorAt(float n) {
  return mix(uFogShade, uFogColor, smoothstep(0.25, 0.75, n)) * uFogLight;
}
`;

const SHEET_VERTEX = /* glsl */ `
varying vec2 vFogBoard;
void main() {
  vFogBoard = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The floor (`uMist` 0: the fog itself) or the mist over it (patches of it, thicker over the fog's thick part). */
const SHEET_FRAGMENT = /* glsl */ `
${FOG_GLSL}
uniform float uMist;
uniform float uLayerOpacity;
varying vec2 vFogBoard;
void main() {
  vec2 fog = fogAt(vFogBoard, vec2(uMist * 0.41, uMist * 0.23));
  float patches = uMist > 0.0 ? smoothstep(0.35, 0.8, fog.y) : 1.0;
  float alpha = fog.x * uFogOpacity * uLayerOpacity * patches;
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(fogColorAt(fog.y), alpha);
}
`;

/** The landscape's parts in three's standard shader: the board's place of each vertex (`vFogBoard`), the props' growth. */
const LAND_VERTEX_DECLARE = /* glsl */ `
${FOG_FIELD_GLSL}
uniform float uFogFalloff;
uniform float uFogBillow;
varying vec2 vFogBoard;
`;
const LAND_VERTEX = /* glsl */ `
#ifdef FOG_DECOR
  // A prop grows out of the ground past the clear cells' border, and sinks into it as the fog lifts over its cell. Past the
  // fog's reach (its falloff and billow) it is gone: the fog hides it whole there, and its faces would show through the
  // fog's noise as faint squares.
  vec2 fogOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  float fogD = fogDistance(fogOrigin);
  float fogFar = uFogEdge + uFogFalloff + 0.5 * uFogBillow;
  transformed *= smoothstep(uFogEdge, uFogEdge + 0.35, fogD) * (1.0 - smoothstep(fogFar - 0.3, fogFar + 0.2, fogD));
#endif
  vec4 fogBoard = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  fogBoard = instanceMatrix * fogBoard;
#endif
  vFogBoard = fogBoard.xz;
`;
const LAND_FRAGMENT_DECLARE = /* glsl */ `
${FOG_GLSL}
uniform vec3 uGround;
uniform vec3 uGroundAlt;
varying vec2 vFogBoard;
float fogHash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
`;
/** The ground's colour: patches between its two colours, and each voxel a little of its own, as the models are drawn. */
const GROUND_COLOR = /* glsl */ `
#ifdef FOG_GROUND
  vec2 fogVoxel = floor(vFogBoard / ${VOXEL.toFixed(4)});
  float fogPatch = texture2D(uFogNoise, vFogBoard * uFogNoiseScale * 2.0 + 0.11).r;
  diffuseColor.rgb = mix(uGround, uGroundAlt, clamp(1.6 * (fogPatch - 0.5) + 0.5 + 0.3 * (fogHash(fogVoxel) - 0.5), 0.0, 1.0));
#endif
`;
const LAND_FOG = /* glsl */ `
  vec2 fogHere = fogAt(vFogBoard, vec2(0.0));
#ifdef FOG_DECOR
  // A prop dissolves into the thick fog voxel column by voxel column, along the fog's own billows: none stays as a faint block.
  if (fogHere.x * uFogOpacity > 0.25 + 0.45 * fogHash(floor(vFogBoard / ${VOXEL.toFixed(4)}))) discard;
#endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColorAt(fogHere.y), fogHere.x * uFogOpacity);
`;

/** A box of `w` x `h` x `d` voxels, its foot's centre at (`x`, `y`, `z`) voxels, in one colour (sRGB hex). */
type Box = [w: number, h: number, d: number, x: number, y: number, z: number, color: string];

/** The props, in voxels (a tile is 40 across; its ground 4 high): two trees, a bush and a rock. */
const PROPS: Record<string, Box[]> = {
  // A round crown: two crossed slabs (no corners), a lighter cap.
  tree: [
    [2, 3, 2, 0, 0, 0, "#4a3524"],
    [6, 3, 4, 0, 3, 0, "#2c3d2c"],
    [4, 3, 6, 0, 3, 0, "#2c3d2c"],
    [4, 2, 4, 0, 6, 0, "#3b4e33"],
    [2, 1, 2, -1, 8, 1, "#4a5d3a"],
  ],
  pine: [
    [2, 2, 2, 0, 0, 0, "#3f2d1f"],
    [5, 2, 5, 0, 2, 0, "#233428"],
    [3, 2, 3, 0, 4, 0, "#283a2b"],
    [1, 2, 1, 0, 6, 0, "#2d402e"],
  ],
  bush: [
    [3, 2, 3, 0, 0, 0, "#3c4c2c"],
    [2, 1, 2, 0.5, 2, 0.5, "#4a5a33"],
  ],
  rock: [
    [3, 2, 3, 0, 0, 0, "#6f6c64"],
    [2, 1, 2, 0.5, 2, -0.5, "#86827a"],
  ],
};
const PROP_KINDS = Object.keys(PROPS);
/** Each prop's share in a forest and in a meadow (the forests are the noise's high patches). */
const FOREST_SHARE: Record<string, number> = { tree: 0.55, pine: 0.35, bush: 0.1, rock: 0 };
const MEADOW_SHARE: Record<string, number> = { tree: 0.25, pine: 0.05, bush: 0.4, rock: 0.3 };
/** The forests' patches, cells across. */
const FOREST_CELLS = 3;

/** A smooth value noise over the cells (0 to 1), patches `FOREST_CELLS` across: where the forests stand. */
function forestAt(x: number, y: number): number {
  const [u, v] = [x / FOREST_CELLS, y / FOREST_CELLS];
  const [x0, y0] = [Math.floor(u), Math.floor(v)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const [fx, fy] = [smooth(u - x0), smooth(v - y0)];
  const at = (i: number, j: number) => random(cellSeed(i + 7919, j - 104729))();
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

/** One geometry of a prop's boxes, colours per vertex (linear), its foot at y 0. */
function propGeometry(boxes: Box[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  for (const [w, h, d, x, y, z, hex] of boxes) {
    const box = new THREE.BoxGeometry(w * VOXEL, h * VOXEL, d * VOXEL).toNonIndexed();
    box.translate(x * VOXEL, (y + h / 2) * VOXEL, z * VOXEL);
    const color = new THREE.Color(hex);
    positions.push(...(box.getAttribute("position").array as Float32Array));
    normals.push(...(box.getAttribute("normal").array as Float32Array));
    for (let i = 0; i < box.getAttribute("position").count; i++) colors.push(color.r, color.g, color.b);
    box.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** A standard material with the fog's terms (`define`: FOG_GROUND or FOG_DECOR). */
function landMaterial(uniforms: FogUniforms, ground: { uGround: { value: THREE.Color }; uGroundAlt: { value: THREE.Color } }, define: "FOG_GROUND" | "FOG_DECOR"): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: define === "FOG_DECOR" });
  material.defines = { [define]: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, ground);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${LAND_VERTEX_DECLARE}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${LAND_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${LAND_FRAGMENT_DECLARE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${GROUND_COLOR}`)
      .replace("#include <fog_fragment>", `#include <fog_fragment>\n${LAND_FOG}`);
  };
  material.customProgramCacheKey = () => `paved-fog-${define}`;
  return material;
}

/** What the fog draws, for the stories' readout and the tests. */
export interface FogStats {
  mode: FogMode;
  /** The cells clear or lifting. */
  cells: number;
  lifting: boolean;
  /** The fog's draws: the floor (or the ground), the mist, a draw per kind of prop shown. */
  drawCalls: number;
  props: number;
  /** The field's size in texels, and how many times it was built. */
  field: string;
  fieldBuilds: number;
  /** The CPU time of the last field build, ms. */
  buildMs: number;
  daylight: number;
}

/**
 * The fog of war. `object` goes in the board's group (`TileRenderer.getGroup()`), so it turns with the compass: its meshes sit at
 * the group's origin, their own positions are the board's. `setRevealed` gives the clear cells (`boardReveal` or
 * `villageReveal`); a cell added lifts over `liftSeconds` on the ambient loop's time, from the side of `origin` (the tile just
 * placed). The mode (`setMode`, `fogMode`) stops the drift and makes a lift instant. The daylight comes from the cycle
 * (`setCycle`). Each change calls `onChange` (a frame). `dispose` frees what it made.
 */
export class FogOfWar implements AmbientEffect {
  readonly object = new THREE.Group();
  /** Told when the fog changes outside a loop step (a frame). */
  onChange: (() => void) | null = null;
  private settings: FogSettings;
  private mode: FogMode = "moving";
  private daylight = 1;
  private readonly transition: RevealTransition;
  private readonly builder = new RevealFieldBuilder();
  private readonly uniforms: FogUniforms;
  private readonly ground = { uGround: { value: new THREE.Color() }, uGroundAlt: { value: new THREE.Color() } };
  private readonly noise: THREE.DataTexture;
  private field: THREE.DataTexture | null = null;
  private readonly floorGeometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE).rotateX(-Math.PI / 2);
  private readonly floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly mist: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly groundMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly propMaterial: THREE.MeshStandardMaterial;
  private readonly props = new Map<string, THREE.InstancedMesh>();
  private revealed: FogCell[] = [];
  private propsKey = "";
  private buildMs = 0;
  private lifting = false;
  private disposed = false;

  constructor(
    private readonly time: { value: number },
    settings: FogSettings,
  ) {
    this.settings = settings;
    this.transition = new RevealTransition(settings.liftSeconds);
    this.noise = new THREE.DataTexture(fogNoise(), NOISE_SIZE, NOISE_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    this.noise.wrapS = this.noise.wrapT = THREE.RepeatWrapping;
    this.noise.magFilter = this.noise.minFilter = THREE.LinearFilter;
    this.noise.unpackAlignment = 1;
    this.noise.needsUpdate = true;
    this.uniforms = {
      uTime: time,
      // The field's texture once built (`rebuild`, below).
      uFogField: { value: this.noise },
      uFogRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uFogReach: { value: FIELD_REACH },
      uFogEdge: { value: fieldEdge(FIELD_TEXELS) },
      uFogFalloff: { value: 0 },
      uFogBillow: { value: 0 },
      uFogVoxel: { value: 0 },
      uFogNoise: { value: this.noise },
      uFogNoiseScale: { value: 1 },
      uFogWind: { value: new THREE.Vector2() },
      uFogColor: { value: new THREE.Color() },
      uFogShade: { value: new THREE.Color() },
      uFogLight: { value: new THREE.Color(1, 1, 1) },
      uFogOpacity: { value: 1 },
    };
    const sheet = (mist: number) =>
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uMist: { value: mist }, uLayerOpacity: { value: 1 } },
        vertexShader: SHEET_VERTEX,
        fragmentShader: SHEET_FRAGMENT,
        transparent: true,
        depthWrite: false,
      });
    this.floor = new THREE.Mesh(this.floorGeometry, sheet(0));
    this.floor.position.y = FLOOR_Y;
    this.mist = new THREE.Mesh(this.floorGeometry, sheet(1));
    this.groundMesh = new THREE.Mesh(this.floorGeometry, landMaterial(this.uniforms, this.ground, "FOG_GROUND"));
    this.groundMesh.position.y = GROUND_Y;
    this.groundMesh.receiveShadow = true;
    this.propMaterial = landMaterial(this.uniforms, this.ground, "FOG_DECOR");
    for (const mesh of [this.floor, this.mist, this.groundMesh]) mesh.frustumCulled = false;
    // The mist after the floor, both after the opaque board (three sorts the transparent by distance; these lie under it).
    this.floor.renderOrder = 2;
    this.mist.renderOrder = 3;
    this.object.add(this.floor, this.mist, this.groundMesh);
    this.object.name = "fog-of-war";
    this.apply();
    // No cell clear yet: fog everywhere, until `setRevealed`.
    this.rebuild();
  }

  setSettings(settings: FogSettings): void {
    const landscape = settings.landscape.enabled !== this.settings.landscape.enabled || settings.landscape.decor !== this.settings.landscape.decor || settings.landscape.decorScale !== this.settings.landscape.decorScale;
    const reach = settings.falloff !== this.settings.falloff || settings.billow !== this.settings.billow;
    this.settings = settings;
    this.transition.setSeconds(settings.liftSeconds);
    if (landscape || reach) this.propsKey = "";
    this.apply();
    this.syncProps();
    this.onChange?.();
  }

  setMode(mode: FogMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode !== "moving") {
      this.transition.finish();
      this.rebuild();
    }
    this.apply();
    this.onChange?.();
  }

  /** The clear cells; a cell added lifts from the side of `origin` (the tile just placed) or of a cell already clear. */
  setRevealed(cells: ReadonlyArray<FogCell>, origin: ReadonlyArray<FogCell> = []): void {
    this.revealed = cells.map((c) => ({ x: c.x, y: c.y }));
    const changed = this.transition.setTarget(this.revealed, this.time.value, { instant: this.mode !== "moving", origin });
    if (!changed) return;
    this.lifting = this.transition.step(this.time.value);
    this.rebuild();
    this.syncProps();
    this.onChange?.();
  }

  /** The cycle's point (its season and position), for the daylight; null with the cycle off (full day). */
  setCycle(point: { season: Season; position: number } | null): void {
    const daylight = point ? sunAt(point.season, point.position).up : 1;
    if (Math.abs(daylight - this.daylight) < 1e-3) return;
    this.daylight = daylight;
    this.apply();
    this.onChange?.();
  }

  step(seconds: number): boolean {
    if (this.mode !== "moving") return false;
    if (this.lifting) {
      this.lifting = this.transition.step(seconds);
      this.rebuild();
      return true;
    }
    return this.settings.drift > 0;
  }

  stats(): FogStats {
    const props = [...this.props.values()].filter((m) => m.visible && m.count > 0);
    const shown = this.mode !== "off" && this.settings.enabled;
    const land = this.settings.landscape.enabled;
    return {
      mode: shown ? this.mode : "off",
      cells: this.transition.size,
      lifting: this.lifting,
      drawCalls: shown ? (land ? 1 + props.length : 1) + (this.mist.visible ? 1 : 0) : 0,
      props: shown && land ? props.reduce((n, m) => n + m.count, 0) : 0,
      field: this.field ? `${this.field.image.width} x ${this.field.image.height}` : "none",
      fieldBuilds: this.builder.builds,
      buildMs: this.buildMs,
      daylight: this.daylight,
    };
  }

  /** The settings, the mode and the daylight on the uniforms and the meshes. */
  private apply(): void {
    const s = this.settings;
    const u = this.uniforms;
    const shown = s.enabled && this.mode !== "off";
    const land = s.landscape.enabled;
    this.object.visible = shown;
    this.floor.visible = shown && !land;
    this.groundMesh.visible = shown && land;
    this.mist.visible = shown && s.mist > 0;
    for (const mesh of this.props.values()) mesh.visible = shown && land;
    u.uFogFalloff.value = s.falloff;
    u.uFogBillow.value = s.billow;
    u.uFogVoxel.value = s.voxelEdge ? 1 : 0;
    u.uFogNoiseScale.value = 1 / (TILE_SIZE * NOISE_FEATURES * s.noiseScale);
    const angle = (s.driftDirection * Math.PI) / 180;
    const drift = this.mode === "moving" ? s.drift : 0;
    u.uFogWind.value.set(Math.cos(angle) * drift, Math.sin(angle) * drift);
    u.uFogColor.value.set(s.color);
    u.uFogShade.value.set(s.shade);
    u.uFogOpacity.value = s.opacity;
    // The fog's light: the day's, down to `night` of it with a moonlit blue at full night.
    const day = this.daylight;
    u.uFogLight.value.setRGB(0.6 * s.night, 0.7 * s.night, 1 * s.night).lerp(new THREE.Color(1, 1, 1), day);
    this.mist.material.uniforms.uLayerOpacity!.value = s.mist;
    this.mist.position.y = s.mistHeight;
    this.ground.uGround.value.set(s.landscape.ground);
    this.ground.uGroundAlt.value.set(s.landscape.groundAlt);
  }

  /** The field at the loop's time, on its texture (a new texture when the window grows). */
  private rebuild(): void {
    const start = performance.now();
    const field = this.builder.build(this.transition.cells(this.time.value));
    if (!this.field || this.field.image.width !== field.width || this.field.image.height !== field.height) {
      this.field?.dispose();
      this.field = new THREE.DataTexture(field.data, field.width, field.height, THREE.RedFormat, THREE.UnsignedByteType);
      this.field.magFilter = this.field.minFilter = THREE.LinearFilter;
      this.field.wrapS = this.field.wrapT = THREE.ClampToEdgeWrapping;
      this.field.unpackAlignment = 1;
      this.uniforms.uFogField.value = this.field;
    } else {
      (this.field.image.data as Uint8Array).set(field.data);
    }
    this.field.needsUpdate = true;
    this.uniforms.uFogRect.value.set(field.originX, field.originY, field.texels / field.width, field.texels / field.height);
    this.buildMs = performance.now() - start;
  }

  /**
   * The props of the cells near the reveal (within the soft edge's reach and a cell): a few a cell, each cell's own (seeded), on
   * the voxel grid. Rebuilt when the reveal or the landscape's settings change; the shader hides the ones the fog lifts over.
   */
  private syncProps(): void {
    const s = this.settings;
    if (!s.landscape.enabled || s.landscape.decor <= 0) {
      for (const mesh of this.props.values()) mesh.count = 0;
      return;
    }
    const radius = Math.min(FIELD_REACH, Math.ceil(s.falloff + s.billow) + DECOR_MARGIN);
    const key = `${radius}|${s.landscape.decor}|${s.landscape.decorScale}|${this.revealed.map((c) => cellKey(c.x, c.y)).sort().join(";")}`;
    if (key === this.propsKey) return;
    this.propsKey = key;
    const clear = new Set(this.revealed.map((c) => cellKey(c.x, c.y)));
    // The cells within `radius` of a clear one, not clear themselves (a clear cell's props would only sink).
    const near = new Map<string, FogCell>();
    for (const c of this.revealed) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const key = cellKey(c.x + dx, c.y + dy);
          if (!clear.has(key) && dx * dx + dy * dy <= radius * radius) near.set(key, { x: c.x + dx, y: c.y + dy });
        }
      }
    }
    const placed: Record<string, THREE.Matrix4[]> = Object.fromEntries(PROP_KINDS.map((k) => [k, []]));
    const colors: Record<string, THREE.Color[]> = Object.fromEntries(PROP_KINDS.map((k) => [k, []]));
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const cell of near.values()) {
      const next = random(cellSeed(cell.x, cell.y));
      // A forest's cell holds up to `decor` props, a meadow's one at most.
      const forest = smoothstepTo(0.4, 0.7, forestAt(cell.x, cell.y));
      const count = Math.floor(s.landscape.decor * forest + next() * 1.6);
      const share = forest > 0.5 ? FOREST_SHARE : MEADOW_SHARE;
      for (let i = 0; i < count; i++) {
        let pick = next();
        const kind = PROP_KINDS.find((k) => (pick -= share[k]!) < 0) ?? "tree";
        // On the voxel grid, inside the cell's middle (a prop does not straddle two cells).
        const vx = Math.round((next() - 0.5) * 28) * VOXEL;
        const vz = Math.round((next() - 0.5) * 28) * VOXEL;
        const scale = s.landscape.decorScale * (0.8 + 0.45 * next());
        turn.setFromAxisAngle(up, Math.floor(next() * 4) * (Math.PI / 2));
        matrix.compose(new THREE.Vector3(cell.x * TILE_SIZE + vx, GROUND_Y, cell.y * TILE_SIZE + vz), turn, new THREE.Vector3(scale, scale, scale));
        placed[kind]!.push(matrix.clone());
        const shade = 0.85 + 0.25 * next();
        colors[kind]!.push(new THREE.Color(shade, shade, shade));
      }
    }
    for (const kind of PROP_KINDS) {
      const list = placed[kind]!;
      let mesh = this.props.get(kind);
      if (!mesh || mesh.instanceMatrix.count < list.length) {
        const geometry = mesh?.geometry ?? propGeometry(PROPS[kind]!);
        if (mesh) {
          this.object.remove(mesh);
          mesh.dispose();
        }
        mesh = new THREE.InstancedMesh(geometry, this.propMaterial, Math.max(64, Math.ceil(list.length * 1.25)));
        mesh.frustumCulled = false;
        mesh.name = `fog-prop-${kind}`;
        this.props.set(kind, mesh);
        this.object.add(mesh);
      }
      list.forEach((m, i) => {
        mesh!.setMatrixAt(i, m);
        mesh!.setColorAt(i, colors[kind]![i]!);
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = this.object.visible && s.landscape.enabled;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.floorGeometry.dispose();
    this.floor.material.dispose();
    this.mist.material.dispose();
    this.groundMesh.material.dispose();
    this.propMaterial.dispose();
    for (const mesh of this.props.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.props.clear();
    this.noise.dispose();
    this.field?.dispose();
    this.field = null;
    this.object.removeFromParent();
    this.object.clear();
    this.onChange = null;
  }
}
