// The chimney smoke (CHIMNEY-SMOKE-1 and -2, #770): its own chunk, an ambient effect on the one ambient loop (`ambient-loop.ts`).
// `GameScene.syncSmoke` loads it the first time a board scene can draw it (`RendererSettings.smoke`, on in the app's boards only),
// finds the chimneys of each model drawn and places their mouths (`syncSmokeTiles`); the tile renderer swaps the placed tiles to
// their types' smoke-free twins (`SmokeFree`) while the smoke can be drawn.
//
// Everything that moves moves in its vertex shader, from the loop's time uniform: the CPU sets uniforms and counts, and places
// the mouths once when the tiles change. All the puffs of a scene are one instanced draw; the mouths' dark caps are a second.
import * as THREE from "three";
import type { AmbientEffect } from "./ambient-loop";
import { chimneyOptionsOf, findChimneys, mouthPoint, type CellBox, type Chimney } from "./chimneys";
import { MAX_SMOKE_CHIMNEYS, smokeLookOf, type SmokeMode, type SmokeSettings } from "./chimney-smoke-settings";
import type { Season } from "./daynight-settings";
import { sunAt } from "./daynight";
import { isOutline, outlineGeometry } from "./outlines";
import { cellIndex, voxelize, type VoxelGrid } from "./voxelizer";

/** A drawn tile, as the smoke reads it: its model id, its type's model (the loader's) and the tile's own clone on the board. */
export interface SmokeSource {
  key: string;
  type: THREE.Object3D;
  tile: THREE.Object3D;
  /** The tile's own key (`${game_id}-${id}`): a key not seen before is a tile just placed, whose smoke fades in (`placeSeconds`). */
  id?: string;
}

/** The smoke now, for the stories' readout and the tests. */
export interface SmokeStats {
  mode: SmokeMode;
  season: Season | null;
  /** The smoke's share now, 0 to 1 (a change of season fades it), and its thickness (the season's amount, eased too). */
  presence: number;
  amount: number;
  /** The chimneys on the board, and the puffs drawn (instances). */
  chimneys: number;
  puffs: number;
  /** The draws the smoke adds to a frame: the puffs' and the caps'. */
  drawCalls: number;
  /** Whether the placed tiles draw their types' smoke-free twins now (`hidesVoxels`), and the triangles each tile of the prepared types leaves out. */
  voxelsHidden: boolean;
  hiddenTriangles: number;
}

/** A small seeded generator (mulberry32): the same puffs on every device and every load. */
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

/** A type's one textured mesh (its outline is a child, never first) and the matrix from it to the type's root. */
function meshOf(type: THREE.Object3D): { mesh: THREE.Mesh; toModel: THREE.Matrix4 } | null {
  type.updateMatrixWorld(true);
  const toRoot = type.matrixWorld.clone().invert();
  let found: { mesh: THREE.Mesh; toModel: THREE.Matrix4 } | null = null;
  type.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh) || isOutline(child) || !(child.geometry as THREE.BufferGeometry).getAttribute("uv")) return;
    found = { mesh: child, toModel: toRoot.clone().multiply(child.matrixWorld) };
  });
  return found;
}

/** How far past a smoke box a face's centre or an outline's piece may lie and still be the smoke's, in voxels. */
const FACE_SLACK = 0.02;

/** A box of grid cells as its corners in the grid's frame (x, y, layer), widened by the slack. */
const spanOf = (b: CellBox): [number, number, number, number, number, number] => [
  b.x0 - FACE_SLACK,
  b.y0 - FACE_SLACK,
  b.layer0 - FACE_SLACK,
  b.x1 + 1 + FACE_SLACK,
  b.y1 + 1 + FACE_SLACK,
  b.layer1 + 1 + FACE_SLACK,
];

/** A point of the model's frame (x, height, z) in grid cells (x, y, layer). */
function gridPoint(point: THREE.Vector3, grid: Pick<VoxelGrid, "origin" | "step">): [number, number, number] {
  const [ox, oy, oz] = grid.origin;
  return [(point.x - ox) / grid.step, (point.z - oz) / grid.step, (point.y - oy) / grid.step];
}

/** Whether a point of the model's frame lies in (or on) one of the boxes. */
function inBoxes(point: THREE.Vector3, grid: Pick<VoxelGrid, "origin" | "step">, boxes: readonly CellBox[]): boolean {
  const p = gridPoint(point, grid);
  return boxes.some((b) => {
    const span = spanOf(b);
    return p.every((v, k) => v >= span[k]! && v <= span[k + 3]!);
  });
}

/**
 * A model's triangles without its smoke voxels' faces: the index of the triangles whose centre lies outside every smoking
 * chimney's smoke boxes, and how many were left out. `toModel` takes the geometry to the grid's frame.
 */
export function smokeFreeIndex(geometry: THREE.BufferGeometry, toModel: THREE.Matrix4, grid: Pick<VoxelGrid, "origin" | "step">, chimneys: readonly Chimney[]): { index: number[]; dropped: number } {
  const boxes = chimneys.flatMap((c) => c.boxes);
  const position = geometry.getAttribute("position");
  const source = geometry.getIndex();
  const triangles = (source ? source.count : position.count) / 3;
  const vertex = (k: number) => (source ? source.getX(k) : k);
  const v = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const index: number[] = [];
  let dropped = 0;
  for (let t = 0; t < triangles; t++) {
    centre.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centre.add(v.fromBufferAttribute(position, vertex(t * 3 + k)).applyMatrix4(toModel));
    centre.divideScalar(3);
    if (boxes.length && inBoxes(centre, grid, boxes)) dropped++;
    else index.push(vertex(t * 3), vertex(t * 3 + 1), vertex(t * 3 + 2));
  }
  return { index, dropped };
}

/** The parts of [0, 1] along a segment from `a` to `b` (grid cells) that lie inside the box `span` (the slab method), or null. */
function clipInside(a: readonly number[], b: readonly number[], span: readonly number[]): [number, number] | null {
  let [t0, t1] = [0, 1];
  for (let k = 0; k < 3; k++) {
    const [lo, hi, d] = [span[k]!, span[k + 3]!, b[k]! - a[k]!];
    if (Math.abs(d) < 1e-9) {
      if (a[k]! < lo || a[k]! > hi) return null;
      continue;
    }
    let [u0, u1] = [(lo - a[k]!) / d, (hi - a[k]!) / d];
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (t0 >= t1) return null;
  }
  return [t0, t1];
}

/**
 * An outline's segments (start xyz, end xyz) without those of the smoke voxels: each segment with its pieces inside the smoke
 * boxes cut out, so an edge that runs up a stack and on into its smoke (one collinear segment, `mergeCollinearSegments`) keeps
 * the stack's part. `toModel` takes the segments to the grid's frame.
 */
export function smokeFreeSegments(segments: ArrayLike<number>, toModel: THREE.Matrix4, grid: Pick<VoxelGrid, "origin" | "step">, chimneys: readonly Chimney[]): Float32Array {
  const spans = chimneys.flatMap((c) => c.boxes).map(spanOf);
  const kept: number[] = [];
  const [start, end] = [new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i + 5 < segments.length; i += 6) {
    start.set(segments[i]!, segments[i + 1]!, segments[i + 2]!);
    end.set(segments[i + 3]!, segments[i + 4]!, segments[i + 5]!);
    const [a, b] = [gridPoint(start.clone().applyMatrix4(toModel), grid), gridPoint(end.clone().applyMatrix4(toModel), grid)];
    // The pieces of [0, 1] inside a box, merged, then what lies between them kept.
    const cuts = spans
      .map((span) => clipInside(a, b, span))
      .filter((c): c is [number, number] => !!c)
      .sort((x, y) => x[0] - y[0]);
    let from = 0;
    const keep = (t0: number, t1: number) => {
      if (t1 - t0 < 1e-6) return;
      for (const t of [t0, t1]) kept.push(...new THREE.Vector3().lerpVectors(start, end, t).toArray());
    };
    for (const [t0, t1] of cuts) {
      keep(from, t0);
      from = Math.max(from, t1);
    }
    keep(from, 1);
  }
  return Float32Array.from(kept);
}

/**
 * A model type without its white smoke voxels (#770 item 2, owner 2026-10-25: hidden on the placed tiles where the real smoke is
 * drawn, shown wherever it is not). Built once a type, in the smoke's chunk; the tile renderer swaps a placed tile's geometries
 * for these twins (`TileRenderer.setSmokeFree`), and the pending tile, the ghost and every other view keep the loader's. No
 * shader reads it: the shadow map, the outlines and the faces follow the swap.
 */
export interface SmokeFree {
  /** The type's geometries to their twins: the faces' (the loader's attributes, its own index without the smoke's triangles) and the outline's (its own segments). */
  readonly geometries: ReadonlyMap<THREE.BufferGeometry, THREE.BufferGeometry>;
  /** The triangles the faces' twin leaves out. */
  readonly triangles: number;
  /** A voxel grid of the model (the drop's, #512) without the smoke's voxels: what falls when a tile is placed. */
  dropGrid(grid: VoxelGrid): VoxelGrid;
}

/** The faces' twin: the loader's attributes, shared (no upload of their own), and an index without the smoke's triangles. */
function freeFaces(geometry: THREE.BufferGeometry, index: number[]): THREE.BufferGeometry {
  const free = new THREE.BufferGeometry();
  free.name = `${geometry.name}#smoke-free`;
  for (const [name, attribute] of Object.entries(geometry.attributes)) free.setAttribute(name, attribute);
  free.setIndex(new THREE.BufferAttribute(geometry.getAttribute("position").count > 65535 ? Uint32Array.from(index) : Uint16Array.from(index), 1));
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  free.boundingBox = geometry.boundingBox!.clone();
  free.boundingSphere = geometry.boundingSphere!.clone();
  return free;
}

/** A grid without the voxels at `cells` (x, y, layer): the same frame and size, fewer voxels. */
export function withoutVoxels(grid: VoxelGrid, cells: ReadonlyArray<readonly [number, number, number]>): VoxelGrid {
  const drop = new Set(cells.map(([x, y, l]) => cellIndex(grid, x, y, l)));
  const keep: number[] = [];
  for (let v = 0; v < grid.count; v++) if (!drop.has(cellIndex(grid, grid.cells[v * 3]!, grid.cells[v * 3 + 1]!, grid.cells[v * 3 + 2]!))) keep.push(v);
  const occupied = grid.occupied.slice();
  for (const i of drop) occupied[i] = 0;
  const visible = Uint8Array.from(keep, (v) => grid.visible[v]!);
  return {
    ...grid,
    count: keep.length,
    cells: Uint8Array.from(keep.flatMap((v) => [grid.cells[v * 3]!, grid.cells[v * 3 + 1]!, grid.cells[v * 3 + 2]!])),
    entry: Uint8Array.from(keep, (v) => grid.entry[v]!),
    visible,
    visibleCount: visible.reduce((sum, x) => sum + x, 0),
    occupied,
  };
}

/** A type's twins, from its mesh, its outline (a child of the mesh, the tile renderer's) and its smoking chimneys. */
function smokeFreeOf(mesh: THREE.Mesh, toModel: THREE.Matrix4, grid: VoxelGrid, smoking: readonly Chimney[]): SmokeFree {
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const faces = mesh.geometry as THREE.BufferGeometry;
  const { index, dropped } = smokeFreeIndex(faces, toModel, grid, smoking);
  geometries.set(faces, freeFaces(faces, index));
  const outline = mesh.children.find((c) => isOutline(c)) as THREE.Mesh | undefined;
  const start = (outline?.geometry as THREE.InstancedBufferGeometry | undefined)?.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute | undefined;
  if (outline && start) geometries.set(outline.geometry, outlineGeometry(smokeFreeSegments(start.data.array as Float32Array, toModel, grid, smoking)));
  const cells = smoking.flatMap((c) => c.smoke);
  const grids = new WeakMap<VoxelGrid, VoxelGrid>();
  return {
    geometries,
    triangles: dropped,
    dropGrid: (source) => {
      let shown = grids.get(source);
      if (!shown) grids.set(source, (shown = withoutVoxels(source, cells)));
      return shown;
    },
  };
}

/** A unit square facing the camera, -0.5 to 0.5 on both axes. */
function quad(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

const SMOKE_VERTEX = /* glsl */ `
attribute vec4 aMouth;
attribute vec3 aPuff;
attribute float aBorn;
uniform float uTime;
uniform float uPlace;
uniform float uLife;
uniform float uRise;
uniform vec2 uSize;
uniform float uSwirl;
uniform float uStretch;
uniform vec2 uWind;
uniform float uAmount;
varying vec2 vUv;
varying float vFade;
varying float vAge;
varying float vSeed;
void main() {
  // A puff's age, 0 at the mouth to 1 gone: each chimney at its own pace, its puffs spread along the cycle.
  float pace = 0.85 + 0.3 * aPuff.z;
  float t = fract(uTime / (uLife * pace) + aPuff.x + 0.37 * aPuff.z);
  // Fast out of the mouth, slower as it cools.
  float lift = 1.0 - pow(1.0 - t, 1.7);
  vec3 at = (modelMatrix * vec4(aMouth.xyz, 1.0)).xyz;
  at.y += uRise * lift;
  float sway = uSwirl * t;
  at.x += uWind.x * t * t + sway * sin(uTime * 0.8 + aPuff.y * 6.2831853 + t * 5.0);
  at.z += uWind.y * t * t + sway * cos(uTime * 0.6 + aPuff.y * 4.0 + t * 4.0);
  // A 2 x 2 chimney sends wider puffs; the season's amount thickens them a little.
  float mouth = clamp(aMouth.w / 0.075, 1.0, 1.6);
  float size = mix(uSize.x, uSize.y, sqrt(t)) * (0.8 + 0.4 * aPuff.y) * mouth * mix(0.85, 1.15, clamp(uAmount - 0.5, 0.0, 1.0));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  // Turned in its plane (less for a stretched wisp, which stays upright), then stretched upward.
  float angle = (aPuff.y * 6.2831853 + t * (aPuff.y - 0.5) * 2.0) / (uStretch * uStretch);
  vec2 corner = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * position.xy;
  corner.y *= uStretch;
  // A tile just placed: its chimneys' smoke fades in from its placement (aBorn, the loop's time then).
  float placed = clamp((uTime - aBorn) / uPlace, 0.0, 1.0);
  vFade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.5, 1.0, t)) * placed;
  vAge = t;
  vSeed = aPuff.y;
  vUv = position.xy;
  vec3 world = at + (right * corner.x + up * corner.y) * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SMOKE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uShade;
uniform vec3 uLight;
uniform float uOpacity;
uniform float uBillow;
varying vec2 vUv;
varying float vFade;
varying float vAge;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.03 + 7.1) + 0.15 * noise(p * 4.01 + 3.7); }
void main() {
  // A soft round, its edge torn by a noise that rolls upward (no texture: generated here, self-hosted by construction).
  float n = fbm(vUv * 3.0 + vec2(vSeed * 17.0, vSeed * 9.0 - uTime * 0.25));
  float d = length(vUv) * 2.0 + (n - 0.5) * uBillow;
  float a = smoothstep(1.0, 0.35, d);
  // Lit from above: the puff's top in the colour, its underside in the shade.
  float lit = clamp(0.55 + vUv.y * 0.9 + (n - 0.5) * 0.4, 0.0, 1.0);
  vec3 color = mix(uShade, uColor, lit) * uLight;
  float alpha = a * vFade * uOpacity * mix(1.0, 0.55, vAge);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

/** A cap's thickness and how far it stands over the stack's top, in voxels. */
const CAP_THICKNESS = 0.12;
const CAP_LIFT = 0.02;
/** The flue's opening: a dark soot colour. */
const CAP_COLOR = "#2b2724";

interface Prepared {
  grid: VoxelGrid | null;
  chimneys: Chimney[];
  /** The type's smoke-free twins (none for a type with no smoking chimney). */
  free: SmokeFree | null;
}

/** A tile's placement time for one that was on the board before the smoke saw it: long ago, so no fade. */
const LONG_AGO = -1e6;

/**
 * The smoke of a board's chimneys: one instanced draw of `puffs` billboards a chimney, rising from each mouth, growing, swaying
 * and fading out, bent by the wind; and one instanced draw of the mouths' dark caps. `time` is the ambient loop's uniform.
 *
 * `prepare(key, type)` finds a model type's chimneys, smoking and bare (its voxel grid, once a type), and builds its smoke-free
 * twins (`freeOf`); `setTiles` places the mouths of the board's tiles in `frame` (the board's group, where `object` is added). The
 * white smoke voxels are hidden while the smoke can be drawn (`hidesVoxels`: the mode "moving", the smoke on), at every season,
 * summer's too (owner, 2026-10-25: in summer neither smoke nor white voxels), and shown again when it cannot (the Low tier,
 * reduced motion, "Ambient effects" off): the caller swaps the placed tiles' geometries. The season comes from the cycle
 * (`setCycle`), the wind from the cloud shadows' (`setWind`), the mode from the settings and tiers (`smokeMode`). `dispose` frees
 * the geometries and materials, the twins included (the caller has put its tiles back on the loader's first).
 */
export class ChimneySmoke implements AmbientEffect {
  readonly object = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly caps: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  private readonly mouths: THREE.InstancedBufferAttribute;
  private readonly puffs: THREE.InstancedBufferAttribute;
  private readonly births: THREE.InstancedBufferAttribute;
  /** Each tile's placement time on the loop's clock (`SmokeSource.id`), for the fade of a tile just placed. */
  private readonly born = new Map<string, number>();
  /** Whether `setTiles` was given a tile yet: the tiles of that first call were on the board before the smoke (no fade). */
  private sawTiles = false;
  private readonly uniforms;
  private readonly prepared = new Map<string, Prepared>();
  private settings: SmokeSettings;
  private mode: SmokeMode = "moving";
  private season: Season | null = null;
  private daylight = 1;
  private wind: [number, number] = [0, 0];
  private presence = 0;
  private amount = 1;
  private chimneyCount = 0;
  private capCount = 0;
  private last: number | null = null;
  private disposed = false;

  constructor(
    private readonly time: { value: number },
    settings: SmokeSettings,
  ) {
    this.settings = settings;
    this.object.name = "chimney-smoke";
    const geometry = quad();
    this.mouths = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SMOKE_CHIMNEYS * 32 * 4), 4);
    this.puffs = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SMOKE_CHIMNEYS * 32 * 3), 3);
    geometry.setAttribute("aMouth", this.mouths);
    geometry.setAttribute("aPuff", this.puffs);
    this.births = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SMOKE_CHIMNEYS * 32), 1);
    geometry.setAttribute("aBorn", this.births);
    geometry.instanceCount = 0;
    this.uniforms = {
      uTime: time,
      uPlace: { value: 1 },
      uLife: { value: 5 },
      uRise: { value: 2.6 },
      uSize: { value: new THREE.Vector2(0.16, 0.6) },
      uSwirl: { value: 0.1 },
      uStretch: { value: 1 },
      uWind: { value: new THREE.Vector2() },
      uAmount: { value: 1 },
      uColor: { value: new THREE.Color() },
      uShade: { value: new THREE.Color() },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 0 },
      uBillow: { value: 0.35 },
    };
    const material = new THREE.ShaderMaterial({
      name: "chimney-smoke",
      vertexShader: SMOKE_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // A transparent double-sided material is drawn twice by three (its back faces, then its front ones). A puff is a quad that
      // faces the camera, with nothing behind it to sort: one pass, one draw.
      forceSinglePass: true,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "chimney-smoke-puffs";
    // The puffs move in the shader: no bounding sphere holds them, and there is one draw for all.
    this.mesh.frustumCulled = false;
    // Before the weather's falling layers (15): a flake in front of a plume is drawn over it.
    this.mesh.renderOrder = 14;
    this.mesh.visible = false;
    this.object.add(this.mesh);

    this.caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ name: "chimney-caps", color: CAP_COLOR }), MAX_SMOKE_CHIMNEYS);
    this.caps.name = "chimney-caps";
    this.caps.count = 0;
    this.caps.visible = false;
    this.caps.receiveShadow = true;
    this.object.add(this.caps);
    this.apply();
  }

  /**
   * A model type's chimneys, found once a type (its voxel grid, read from the loader's geometry: its smoke voxels in), and its
   * smoke-free twins (`freeOf`), built from its mesh and the outline the tile renderer gave it.
   */
  prepare(key: string, type: THREE.Object3D): readonly Chimney[] {
    let done = this.prepared.get(key);
    if (!done) {
      const found = meshOf(type);
      const grid = found ? voxelize({ geometry: found.mesh.geometry, toModel: found.toModel }, { name: key }) : null;
      const chimneys = grid ? findChimneys(grid, chimneyOptionsOf(key)).chimneys : [];
      const smoking = chimneys.filter((c) => c.kind === "smoking");
      const free = found && grid && smoking.length ? smokeFreeOf(found.mesh, found.toModel, grid, smoking) : null;
      done = { grid, chimneys, free };
      this.prepared.set(key, done);
    }
    return done.chimneys;
  }

  /** Whether `prepare` has read a model type. */
  has(key: string): boolean {
    return this.prepared.has(key);
  }

  /** A prepared type's smoke-free twins, or null (a type with no smoking chimney, or not prepared). */
  freeOf(key: string): SmokeFree | null {
    return this.prepared.get(key)?.free ?? null;
  }

  /** The white voxels hidden on the placed tiles while the smoke can be drawn (every season), shown while it cannot. */
  hidesVoxels(): boolean {
    return this.mode === "moving" && this.settings.enabled;
  }

  /** The board's drawn tiles: the mouths of the prepared types (`prepare`), placed in `frame` (the group `object` is in). */
  setTiles(sources: readonly SmokeSource[], frame: THREE.Object3D): void {
    if (this.disposed) return;
    frame.updateMatrixWorld(true);
    const toFrame = frame.matrixWorld.clone().invert();
    const next = random(770);
    const point = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const cap = new THREE.Matrix4();
    let chimney = 0;
    let instance = 0;
    this.capCount = 0;
    const perChimney = Math.min(32, Math.max(1, Math.round(smokeLookOf(this.settings).puffs)));
    // The tiles already on the board when the smoke first saw some: no fade. A tile seen later is one just placed.
    const first = !this.sawTiles;
    const seen = new Set<string>();
    for (const { key, tile, id } of this.sources(sources)) {
      const done = this.prepared.get(key);
      if (id !== undefined) {
        seen.add(id);
        if (!this.born.has(id)) this.born.set(id, first ? LONG_AGO : this.time.value);
      }
      const born = id === undefined ? LONG_AGO : this.born.get(id)!;
      if (!done?.grid || !done.chimneys.length) continue;
      tile.updateWorldMatrix(true, false);
      matrix.multiplyMatrices(toFrame, tile.matrixWorld);
      const tileScale = matrix.getMaxScaleOnAxis();
      const step = done.grid.step;
      for (const c of done.chimneys) {
        if (chimney >= MAX_SMOKE_CHIMNEYS) break;
        point.fromArray(mouthPoint(done.grid, c)).applyMatrix4(matrix);
        const width = Math.max(c.mouth.width, c.mouth.depth) * step * tileScale;
        const seed = next();
        chimney++;
        for (let p = 0; p < perChimney; p++) {
          this.mouths.setXYZW(instance, point.x, point.y, point.z, width);
          this.puffs.setXYZ(instance, p / perChimney, next(), seed);
          this.births.setX(instance, born);
          instance++;
        }
        if (c.kind !== "smoking") continue;
        // The cap (a smoking chimney's: a bare one has its top face): a thin dark box over the mouth, in the model's frame, then the tile's.
        const [mx, my, mz] = mouthPoint(done.grid, c);
        this.capCount++;
        cap
          .makeScale(c.mouth.width * step, CAP_THICKNESS * step, c.mouth.depth * step)
          .setPosition(mx, my + (CAP_LIFT + CAP_THICKNESS / 2) * step, mz)
          .premultiply(matrix);
        this.caps.setMatrixAt(this.capCount - 1, cap);
      }
    }
    for (const id of [...this.born.keys()]) if (!seen.has(id)) this.born.delete(id);
    if (seen.size) this.sawTiles = true;
    this.chimneyCount = chimney;
    this.mesh.geometry.instanceCount = instance;
    this.mouths.needsUpdate = true;
    this.puffs.needsUpdate = true;
    this.births.needsUpdate = true;
    this.caps.count = this.capCount;
    this.caps.instanceMatrix.needsUpdate = true;
    this.apply();
  }

  /** The sources whose type was prepared (the others have no chimneys known yet). */
  private sources(sources: readonly SmokeSource[]): readonly SmokeSource[] {
    return sources.filter((s) => this.prepared.has(s.key));
  }

  setSettings(settings: SmokeSettings): void {
    const puffs = smokeLookOf(this.settings).puffs;
    this.settings = settings;
    if (this.mode !== "moving") this.snap();
    // A new number of puffs a chimney needs the instances laid out again: the caller's `setTiles`.
    if (smokeLookOf(settings).puffs !== puffs) this.needsTiles = true;
    this.apply();
  }

  /** True after a change of the puffs a chimney: `setTiles` lays the instances out again. */
  needsTiles = false;

  /** Off or moving (`smokeMode`). A change of mode shows the smoke at once, with no fade. */
  setMode(mode: SmokeMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.snap();
    this.apply();
  }

  /** The cycle's point (`GameScene.getDayNight`): its season, and its position for the daylight. Null with the cycle off: summer's day. */
  setCycle(point: { season: Season; position: number } | null): void {
    // With the cycle off the season is summer's day, as for the weather (#770, open point 1): no smoke.
    const season = point?.season ?? "summer";
    const daylight = point ? sunAt(point.season, point.position).up : 1;
    if (season === this.season && Math.abs(daylight - this.daylight) < 1e-3) return;
    const first = this.season === null;
    this.season = season;
    this.daylight = daylight;
    if (first || this.mode !== "moving") this.snap();
    this.apply();
  }

  /** The cloud shadows' wind (`CloudShadowSettings.windDirection`, degrees on the board, and `windSpeed`, world units a second). */
  setWind(directionDegrees: number, speed: number): void {
    const r = (directionDegrees * Math.PI) / 180;
    this.wind = [Math.cos(r) * speed, Math.sin(r) * speed];
    this.apply();
  }

  private target(): number {
    const season = this.season ? this.settings.seasons[this.season] : null;
    return this.mode === "moving" && this.settings.enabled && !!season?.enabled ? 1 : 0;
  }

  private targetAmount(): number {
    return this.season ? this.settings.seasons[this.season].amount : 1;
  }

  private snap(): void {
    this.presence = this.target();
    this.amount = this.targetAmount();
  }

  /** The loop stepped to `seconds`: the smoke fades toward its season's share. True while a puff shows (they always move). */
  step(seconds: number): boolean {
    const dt = this.last === null ? 0 : Math.min(0.1, Math.max(0, seconds - this.last));
    this.last = seconds;
    if (this.mode !== "moving") return false;
    const rate = this.settings.fadeSeconds > 0 ? dt / this.settings.fadeSeconds : 1;
    const [goal, goalAmount] = [this.target(), this.targetAmount()];
    let changed = false;
    if (this.presence !== goal) {
      this.presence = goal > this.presence ? Math.min(goal, this.presence + rate) : Math.max(goal, this.presence - rate);
      changed = true;
    }
    if (this.amount !== goalAmount) {
      const delta = Math.abs(goalAmount - this.amount);
      this.amount += Math.sign(goalAmount - this.amount) * Math.min(delta, rate);
      changed = true;
    }
    if (changed) this.apply();
    return this.mesh.visible;
  }

  private apply(): void {
    if (this.disposed) return;
    const s = this.settings;
    const look = smokeLookOf(s);
    const u = this.uniforms;
    u.uPlace.value = Math.max(1e-3, s.placeSeconds);
    u.uLife.value = Math.max(0.5, look.lifeSeconds);
    u.uRise.value = look.rise;
    u.uSize.value.set(look.sizeStart, look.sizeEnd);
    u.uSwirl.value = look.swirl;
    u.uStretch.value = Math.max(0.25, look.stretch);
    u.uBillow.value = look.billow;
    u.uWind.value.set(this.wind[0] * look.drift * look.lifeSeconds, this.wind[1] * look.drift * look.lifeSeconds);
    u.uAmount.value = this.amount;
    u.uColor.value.set(look.color);
    u.uShade.value.set(look.shade);
    u.uOpacity.value = Math.min(1, look.opacity * this.presence * Math.sqrt(this.amount));
    // The scene's light, as the fog takes it: the day's, down to `night` of it with a moonlit blue at full night.
    u.uLight.value.setRGB(0.6 * s.night, 0.7 * s.night, 1 * s.night).lerp(new THREE.Color(1, 1, 1), this.daylight);
    this.mesh.visible = this.mode === "moving" && this.mesh.geometry.instanceCount > 0 && u.uOpacity.value > 0.001;
    // The caps close the stacks the hidden smoke left open: at every season, in every mode.
    this.caps.visible = this.caps.count > 0 && this.hidesVoxels();
  }

  stats(): SmokeStats {
    return {
      mode: this.mode,
      season: this.season,
      presence: this.presence,
      amount: this.amount,
      chimneys: this.chimneyCount,
      puffs: this.mesh.visible ? this.mesh.geometry.instanceCount : 0,
      drawCalls: (this.mesh.visible ? 1 : 0) + (this.caps.visible ? 1 : 0),
      voxelsHidden: this.hidesVoxels(),
      hiddenTriangles: this.hidesVoxels() ? [...this.prepared.values()].reduce((sum, p) => sum + (p.free?.triangles ?? 0), 0) : 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.caps.geometry.dispose();
    this.caps.material.dispose();
    this.caps.dispose();
    this.object.removeFromParent();
    // The twins (the faces' shares the loader's attributes: disposed with the scene, after its tiles went back to the loader's).
    for (const done of this.prepared.values()) for (const twin of done.free?.geometries.values() ?? []) twin.dispose();
    this.prepared.clear();
    this.born.clear();
  }
}
