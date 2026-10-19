// The ambient particles (AMBIENT-PARTICLES, #572): their own chunk, loaded by `GameScene` the first time the ambient effects are
// on. One `Points` draw per kind for the whole board, the motion in the vertex shader from the ambient loop's one time uniform:
// the CPU sets nothing a frame. The emitters come from each model type's voxel grid (`voxelizer.ts`), once per type.
import * as THREE from "three";
import { planKeyOfModel, planLayout, paletteOfModel } from "./feature-layout";
import { isOutline } from "./outlines";
import { BASE_PALETTE_CLASSES, FOREST_PALETTE_CLASSES } from "./features";
import { VoxelCache, cellIndex, type VoxelGrid } from "./voxelizer";
import type { AmbientEffect } from "./ambient-loop";
import type { AmbientParticlesSettings, ParticleKindSettings } from "./ambient-settings";

/** The particle kinds, each one draw: the water's motes and the wonders' sparkles. */
export const PARTICLE_KINDS = ["water", "wonder"] as const;
export type ParticleKind = (typeof PARTICLE_KINDS)[number];

/**
 * The water's palette entries, the same in the base palette and the Forest one: the texels the tile shader's water mask picks
 * (`WATER_MASK_GLSL`, by hue). `ambient-particles.test.ts` reads every palette and checks that these entries, and only these,
 * hold the water's colours.
 */
export const WATER_ENTRIES: readonly number[] = [17, 136, 137, 227];

/** The emitters of a model type, in its model's frame (the type's root, Y up): x, y, z per emitter, on the voxel's top face. */
export interface Emitters {
  water: Float32Array;
  wonder: Float32Array;
}

const NO_EMITTERS: Emitters = { water: new Float32Array(0), wonder: new Float32Array(0) };

/**
 * The emitters of a grid: the water's top voxels (water under air), and on a wonder's plan the wonder's top voxels (a palette
 * entry of the wonder's class under air). Each emitter is the centre of the voxel's top face, in the grid's model frame.
 * `wonderEntries` empty (a plan with no wonder spot): no wonder emitter, whatever the palette's colours say (the Forest
 * palette's wonder entries are also its flowers).
 */
export function findEmitters(grid: VoxelGrid, waterEntries: readonly number[], wonderEntries: readonly number[]): Emitters {
  const water = new Uint8Array(256);
  for (const e of waterEntries) water[e] = 1;
  const wonder = new Uint8Array(256);
  for (const e of wonderEntries) wonder[e] = 1;
  const found: Record<ParticleKind, number[]> = { water: [], wonder: [] };
  const [ox, oy, oz] = grid.origin;
  for (let v = 0; v < grid.count; v++) {
    const entry = grid.entry[v]!;
    if (!water[entry] && !wonder[entry]) continue;
    const [x, y, layer] = [grid.cells[v * 3]!, grid.cells[v * 3 + 1]!, grid.cells[v * 3 + 2]!];
    const top = layer === grid.layers - 1 || !grid.occupied[cellIndex(grid, x, y, layer + 1)];
    if (!top) continue;
    found[water[entry] ? "water" : "wonder"].push(ox + (x + 0.5) * grid.step, oy + (layer + 1) * grid.step, oz + (y + 0.5) * grid.step);
  }
  return { water: Float32Array.from(found.water), wonder: Float32Array.from(found.wonder) };
}

/** The wonder's palette entries for a model id: its palette's wonder class when its plan has a wonder spot, else none. */
export function wonderEntriesOf(key: string): readonly number[] {
  const plan = planKeyOfModel(key);
  const palette = paletteOfModel(key);
  if (!plan || !palette) return [];
  if (!planLayout(plan).category.includes("Wonder")) return [];
  return (palette === "forest" ? FOREST_PALETTE_CLASSES : BASE_PALETTE_CLASSES).wonder;
}

/** A 32-bit integer hash (a mix of Murmur3's finaliser): the same picks for a tile on every viewer and reload. */
export function hash32(a: number, b = 0): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** How many particles a tile with `emitters` emitter voxels holds: `density` per voxel, at least one when it has any, at most `perTile`. */
export function particlesFor(emitters: number, kind: Pick<ParticleKindSettings, "density" | "perTile" | "enabled">): number {
  if (!kind.enabled || emitters <= 0) return 0;
  return Math.min(kind.perTile, Math.max(1, Math.round(emitters * kind.density)));
}

/** A tile to emit from: its emitters and the matrix from its model's frame to the particles' (the board's group). */
export interface EmitterTile {
  emitters: Emitters;
  matrix: THREE.Matrix4;
  /** A number of its own (its index on the board, a hash of its key): which emitters it picks, and its particles' seeds. */
  seed: number;
}

/**
 * The particles of one kind on the board, as two arrays: positions (x, y, z, the emitter's top face in the board's frame) and
 * seeds (0 to 1: where each is in its life, and its sway). Each tile picks `particlesFor` of its emitters by its seed; past
 * `boardCap`, a deterministic share of them is dropped, evenly over the board.
 */
export function layoutParticles(tiles: readonly EmitterTile[], kind: ParticleKind, settings: ParticleKindSettings, boardCap: number): { position: Float32Array; seed: Float32Array } {
  const position: number[] = [];
  const seed: number[] = [];
  const v = new THREE.Vector3();
  for (const tile of tiles) {
    const emitters = tile.emitters[kind];
    const count = emitters.length / 3;
    const n = particlesFor(count, settings);
    for (let i = 0; i < n; i++) {
      const h = hash32(tile.seed, i + (kind === "water" ? 0 : 1 << 20));
      const e = h % count;
      v.set(emitters[e * 3]!, emitters[e * 3 + 1]!, emitters[e * 3 + 2]!).applyMatrix4(tile.matrix);
      position.push(v.x, v.y, v.z);
      seed.push(hash32(h, 7) / 0xffffffff);
    }
  }
  const total = seed.length;
  if (total <= boardCap) return { position: Float32Array.from(position), seed: Float32Array.from(seed) };
  // Over the cap: every k-th, k fractional, so the share kept is even across the board.
  const keptPosition = new Float32Array(boardCap * 3);
  const keptSeed = new Float32Array(boardCap);
  for (let k = 0; k < boardCap; k++) {
    const i = Math.floor((k * total) / boardCap);
    keptPosition.set(position.slice(i * 3, i * 3 + 3), k * 3);
    keptSeed[k] = seed[i]!;
  }
  return { position: keptPosition, seed: keptSeed };
}

const VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uLife;
  uniform float uRise;
  uniform float uDrift;
  uniform float uSize;
  uniform float uScale;
  uniform vec2 uPixels;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uGlow;
  varying float vAlpha;
  void main() {
    // Each particle runs its own life, offset by its seed: it fades in, rises and sways, fades out, and starts again a little
    // aside (a new sway each life).
    float t = uTime / uLife + aSeed;
    float phase = fract(t);
    float life = floor(t);
    float turn = fract(sin(dot(vec2(aSeed, life), vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
    vec3 p = position;
    p.y += phase * uRise;
    float sway = 6.2831853 * phase * 0.7 + turn;
    p.x += sin(sway) * uDrift;
    p.z += cos(sway * 0.83) * uDrift;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float fade = smoothstep(0.0, 0.25, phase) * (1.0 - smoothstep(0.55, 1.0, phase));
    vAlpha = uOpacity * uFade * fade * uGlow;
    // The size in device px: the world size at this depth (uScale: the drawing buffer's height x zoom over 2 tan(fov / 2)). A particle
    // with no light left is a point of no size: no fragment.
    // Held between the floor and the cap (uPixels, device px): never under a pixel, never a blob.
    gl_PointSize = vAlpha < 0.002 ? 0.0 : clamp(uSize * uScale / max(-mv.z, 0.001), uPixels.x, uPixels.y) * sqrt(uGlow);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    // A soft round sprite: a core, then a soft rim to nothing at the edge (a steeper falloff reads as a point of 3 px).
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.15, 1.0, d);
    gl_FragColor = vec4(uColor, a * vAlpha);
  }
`;

interface KindUniforms {
  [name: string]: THREE.IUniform;
  uTime: { value: number };
  uLife: THREE.IUniform<number>;
  uRise: THREE.IUniform<number>;
  uDrift: THREE.IUniform<number>;
  uSize: THREE.IUniform<number>;
  uScale: THREE.IUniform<number>;
  uPixels: THREE.IUniform<THREE.Vector2>;
  uOpacity: THREE.IUniform<number>;
  uFade: THREE.IUniform<number>;
  uGlow: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Color>;
}

/** What `AmbientParticles` reads of the board: its drawn tiles, as `TileRenderer.drawnModels` gives them. */
export interface ParticleSource {
  key: string;
  type: THREE.Object3D;
  tile: THREE.Object3D;
}

/** A model type's mesh and the matrix from its geometry to the type's root (the model's frame), as `TileRenderer.labelFeatures` takes it. */
function meshOf(type: THREE.Object3D): { geometry: THREE.BufferGeometry; toModel: THREE.Matrix4 } | null {
  type.updateMatrixWorld(true);
  const toRoot = type.matrixWorld.clone().invert();
  let found: { geometry: THREE.BufferGeometry; toModel: THREE.Matrix4 } | null = null;
  type.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh) || isOutline(child) || !(child.geometry as THREE.BufferGeometry).getAttribute("uv")) return;
    found = { geometry: child.geometry, toModel: toRoot.clone().multiply(child.matrixWorld) };
  });
  return found;
}

/**
 * The board's ambient particles: one `THREE.Points` per kind under `object`, which the scene adds to the board's group. `time`
 * is the ambient loop's uniform. `setTiles` lays the particles out again (the board changed; the emitters of a type not seen
 * yet are built in an idle slice, then `onChange` asks for a frame); `setZoom`, `setNight` and `setViewport` set uniforms.
 * `dispose` frees the two geometries and materials (the voxel grids are plain arrays).
 */
export class AmbientParticles implements AmbientEffect {
  readonly object = new THREE.Group();
  private readonly points: Record<ParticleKind, THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>>;
  private readonly uniforms: Record<ParticleKind, KindUniforms>;
  private readonly grids = new VoxelCache();
  private readonly emitters = new Map<string, Emitters>();
  private readonly building = new Set<string>();
  private settings: AmbientParticlesSettings;
  private sources: ParticleSource[] = [];
  private frame: THREE.Object3D | null = null;
  private night = 0;
  private pixelRatio = 1;
  private disposed = false;
  /** Called when an emitter build lands and the particles were laid out again: the scene draws a frame. */
  onChange: (() => void) | null = null;

  constructor(time: { value: number }, settings: AmbientParticlesSettings) {
    this.settings = settings;
    this.object.name = "ambient-particles";
    const make = (kind: ParticleKind) => {
      const uniforms: KindUniforms = {
        uTime: time,
        uLife: { value: 1 },
        uRise: { value: 0 },
        uDrift: { value: 0 },
        uSize: { value: 0 },
        uScale: { value: 1 },
        uPixels: { value: new THREE.Vector2(1, 64) },
        uOpacity: { value: 0 },
        uFade: { value: 1 },
        uGlow: { value: 1 },
        uColor: { value: new THREE.Color() },
      };
      const material = new THREE.ShaderMaterial({
        name: `AmbientParticles.${kind}`,
        uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(new THREE.BufferGeometry(), material);
      points.name = `ambient-${kind}`;
      // The positions move in the shader: no bounding sphere would hold them. One draw a kind, culled by nothing.
      points.frustumCulled = false;
      // After the faces and the outlines (`renderOrder` 1): the particles write no depth.
      points.renderOrder = 2;
      this.object.add(points);
      return { points, uniforms };
    };
    const water = make("water");
    const wonder = make("wonder");
    this.points = { water: water.points, wonder: wonder.points };
    this.uniforms = { water: water.uniforms, wonder: wonder.uniforms };
    this.applySettings();
  }

  /** New settings: the uniforms, and the layout when the counts may change. */
  setSettings(settings: AmbientParticlesSettings): void {
    const before = this.settings;
    this.settings = settings;
    this.applySettings();
    const layout = (k: ParticleKind) =>
      before[k].enabled !== settings[k].enabled || before[k].density !== settings[k].density || before[k].perTile !== settings[k].perTile;
    if (layout("water") || layout("wonder") || before.boardCap !== settings.boardCap) this.layout();
  }

  private applySettings(): void {
    for (const kind of PARTICLE_KINDS) {
      const s = this.settings[kind];
      const u = this.uniforms[kind];
      u.uLife.value = s.lifeSeconds;
      u.uRise.value = s.rise;
      u.uDrift.value = s.drift;
      u.uSize.value = s.size;
      u.uOpacity.value = s.opacity;
      u.uColor.value.set(s.color);
      u.uPixels.value.set(this.settings.minPixels * this.pixelRatio, this.settings.maxPixels * this.pixelRatio);
      this.points[kind].visible = s.enabled;
    }
    this.setNight(this.night);
  }

  /**
   * The board's drawn tiles (`TileRenderer.drawnModels`) and the group the particles hang in (`frame`, the board's: the compass
   * turns both). Types whose emitters are known are laid out now; the others are built in idle slices, and laid out as each lands.
   */
  setTiles(sources: ParticleSource[], frame: THREE.Object3D): void {
    this.sources = sources;
    this.frame = frame;
    for (const { key, type } of sources) {
      if (this.emitters.has(key) || this.building.has(key)) continue;
      const mesh = meshOf(type);
      if (!mesh) {
        this.emitters.set(key, NO_EMITTERS);
        continue;
      }
      this.building.add(key);
      void this.grids.request(key, mesh, () => this.disposed).then((grid) => {
        this.building.delete(key);
        if (this.disposed) return;
        this.emitters.set(key, grid ? findEmitters(grid, WATER_ENTRIES, wonderEntriesOf(key)) : NO_EMITTERS);
        this.layout();
        this.onChange?.();
      });
    }
    this.layout();
  }

  /** Resolves once every type asked for has its emitters: for tests and captures. */
  async whenReady(): Promise<void> {
    while (this.building.size > 0) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /** The emitters of a type, once built. */
  emittersOf(key: string): Emitters | undefined {
    return this.emitters.get(key);
  }

  private layout(): void {
    if (this.disposed || !this.frame) return;
    this.frame.updateMatrixWorld(true);
    const toFrame = this.frame.matrixWorld.clone().invert();
    const tiles: EmitterTile[] = [];
    let index = 0;
    for (const { key, tile } of this.sources) {
      index++;
      const emitters = this.emitters.get(key);
      if (!emitters || (!emitters.water.length && !emitters.wonder.length)) continue;
      tile.updateWorldMatrix(true, false);
      const position = tile.parent?.position;
      // The tile's own seed: its cell (its container's place), so a tile keeps its particles when the board around it changes.
      const seed = position ? hash32(Math.round(position.x * 16), Math.round(position.z * 16)) : index;
      tiles.push({ emitters, matrix: toFrame.clone().multiply(tile.matrixWorld), seed });
    }
    for (const kind of PARTICLE_KINDS) {
      const { position, seed } = layoutParticles(tiles, kind, this.settings[kind], this.settings.boardCap);
      const points = this.points[kind];
      points.geometry.dispose();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      points.geometry = geometry;
    }
  }

  /** The zoom fade, 0 to 1 (the outlines' curve, `GameScene`): 0 hides the particles. */
  setZoom(fade: number): void {
    for (const kind of PARTICLE_KINDS) this.uniforms[kind].uFade.value = fade;
  }

  /** The night's level, 0 by day to 1 at full night (the day and night cycle's): the night glow scales with it. */
  setNight(level: number): void {
    this.night = level;
    const glow = 1 + this.settings.nightGlow * Math.min(1, Math.max(0, level));
    for (const kind of PARTICLE_KINDS) this.uniforms[kind].uGlow.value = glow;
  }

  /**
   * The drawing buffer's height in device px, the camera's vertical field of view in degrees, its zoom (the play camera's is
   * 5) and the pixel ratio: a particle's size on screen, and its floor and cap in device px.
   */
  setViewport(heightDevicePx: number, fovDegrees: number, zoom = 1, pixelRatio = 1): void {
    this.pixelRatio = pixelRatio;
    const scale = (heightDevicePx * zoom) / (2 * Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2));
    for (const kind of PARTICLE_KINDS) {
      this.uniforms[kind].uScale.value = scale;
      this.uniforms[kind].uPixels.value.set(this.settings.minPixels * pixelRatio, this.settings.maxPixels * pixelRatio);
    }
  }

  /** The particles drawn of each kind, and the draws they take (one per kind with any). */
  stats(): { water: number; wonder: number; drawCalls: number } {
    const count = (kind: ParticleKind) => (this.points[kind].visible ? (this.points[kind].geometry.getAttribute("aSeed")?.count ?? 0) : 0);
    const water = count("water");
    const wonder = count("wonder");
    return { water, wonder, drawCalls: (water > 0 ? 1 : 0) + (wonder > 0 ? 1 : 0) };
  }

  /** The loop stepped: a frame is wanted while any particle shows. */
  step(): boolean {
    if (!this.object.visible || this.uniforms.water.uFade.value <= 0) return false;
    return this.stats().drawCalls > 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const kind of PARTICLE_KINDS) {
      this.points[kind].geometry.dispose();
      this.points[kind].material.dispose();
    }
    this.object.removeFromParent();
    this.object.clear();
    this.grids.clear();
    this.emitters.clear();
    this.sources = [];
    this.frame = null;
    this.onChange = null;
  }
}
