import * as THREE from "three";
import { GROUND_VOXELS } from "./feature-codes";
import { VOXEL_SIZE, outlineFadeOf, type OutlineFadeSettings } from "./outlines";
import { TILE_SIZE } from "./types";

/**
 * The placement visuals (SLOTS, P-68; SLOTS2, P-72; PLATES, P-74): a platform on every slot of the tile in hand, the
 * tile placed on one before it is confirmed, and the confirm.
 *
 * - The plates (Dorfromantik's): a low slab with rounded corners and a rounded top edge, inset in its cell so two
 *   neighbouring plates never touch, sized in voxels. Three states (`plateStateOf`): valid (the current rotation fits
 *   there): the base plate under a slightly white aura; possible (another rotation fits): the base plate, pale neutral
 *   blue; invalid (no rotation fits): greyscale, more transparent.
 * - The tile placed, not confirmed: its plate's aura becomes a rim around the tile, at the tiles' ground top, white
 *   while its rotation fits, red while it does not (the one place that rule lives: `placementTone`); on confirm it turns
 *   green and fades out.
 * - Every plate is an instance of one mesh and every aura of another: two draw calls for any number of slots. Each
 *   state change eases over `motion.colorMs` (150 ms); under reduced motion it is instant and the confirm's fade short.
 * - The grid (SLOTS2's ring hairlines) stays as a setting, off by default (`grid.enabled`).
 */
export interface PlacementSettings {
  /** The colours, CSS hex (the app's tokens: plate, plate-off and plate-aura; ember-500 and meadow-400). */
  colors: { plate: string; invalid: string; aura: string; red: string; green: string };
  grid: {
    enabled: boolean;
    /** A pale neutral (ink-200). */
    color: string;
    /** The lines' opacity at ring 1. */
    opacity: number;
    /** The share of `opacity` of a line whose farther cell is at ring 1, 2 or 3; 0 from ring 4. Linear along a line. */
    rings: [number, number, number];
    /** The hairline's width in device px, at every zoom (antialiased: its coverage of each pixel). */
    widthDevicePx: number;
    /** Fade the grid on zoom-out with the outlines' curve (`placementFade`); off, it holds its opacity at every zoom. */
    farFade: boolean;
    /** With `farFade`: fully on from this share of the opening tile size S, off at the outlines' `fadeOffFactor`. */
    farFadeStart: number;
  };
  /** The plates, in voxels (a tile is `TILE_VOXELS` wide). */
  plates: {
    enabled: boolean;
    /** The gap between two neighbouring plates (each is inset half of it in its cell), `PLATE_GAP_VOXELS` bounds it. */
    gap: number;
    /** The slab's height. */
    height: number;
    /** The corners' radius, seen from above. */
    radius: number;
    /** The top edge's rounding. */
    bevel: number;
    /** The base plate's opacity (possible and valid). */
    opacity: number;
    /** An invalid plate's opacity: more transparent. */
    invalidOpacity: number;
  };
  /** The aura above a valid plate, and the placed tile's rim, in voxels. */
  aura: {
    enabled: boolean;
    /** Above the plate's top. */
    height: number;
    /** Its soft edge, half inside the plate's edge, half beyond. */
    falloff: number;
    /** Its strength, 0 to 1. */
    intensity: number;
    /** The placed tile's rim: its reach on each side of the tile's edge. */
    placedFalloff: number;
    placedIntensity: number;
  };
  motion: {
    /** A change of state (a rotation, a slot chosen, red and back), ms. */
    colorMs: number;
    /** The confirm: to green, then a fade out, ms. */
    confirmMs: number;
    /** The confirm's fade under reduced motion, ms. */
    reducedConfirmMs: number;
    /** `"auto"`: the device's `prefers-reduced-motion`. */
    reducedMotion: boolean | "auto";
  };
}

export type PlacementSettingsInput = { [K in keyof PlacementSettings]?: Partial<PlacementSettings[K]> };

/** The gap between neighbouring plates, voxels: never 0, so they never touch; the story's control spans the same. */
export const PLATE_GAP_VOXELS = { min: 1, max: 12 } as const;

export const DEFAULT_PLACEMENT_SETTINGS: PlacementSettings = {
  colors: { plate: "#b7ccdc", invalid: "#929292", aura: "#f5f9fc", red: "#f85e4d", green: "#6eca6f" },
  grid: { enabled: false, color: "#d1d9df", opacity: 0.32, rings: [1, 0.5, 0.1], widthDevicePx: 1, farFade: false, farFadeStart: 1 },
  plates: { enabled: true, gap: 4, height: 2, radius: 5, bevel: 1, opacity: 0.9, invalidOpacity: 0.45 },
  aura: { enabled: true, height: 1.5, falloff: 2, intensity: 0.35, placedFalloff: 4, placedIntensity: 0.6 },
  motion: { colorMs: 150, confirmMs: 700, reducedConfirmMs: 150, reducedMotion: "auto" },
};

/** `input` over `base`, group by group. */
export function resolvePlacementSettings(input: PlacementSettingsInput = {}, base = DEFAULT_PLACEMENT_SETTINGS): PlacementSettings {
  return {
    colors: { ...base.colors, ...input.colors },
    grid: { ...base.grid, ...input.grid },
    plates: { ...base.plates, ...input.plates },
    aura: { ...base.aura, ...input.aura },
    motion: { ...base.motion, ...input.motion },
  };
}

/** The farthest ring the grid draws: ring 4 and beyond are 0. */
export const GRID_RINGS = 4;

/** The grid's opacity (a share of `grid.opacity`) at a ring: rings 0 and 1 the first value, 2 and 3 theirs, 0 from 4. */
export function gridRingOpacity(ring: number, rings: PlacementSettings["grid"]["rings"] = DEFAULT_PLACEMENT_SETTINGS.grid.rings): number {
  if (!(ring >= 0)) return 0;
  if (ring <= 1) return rings[0];
  if (ring >= GRID_RINGS) return 0;
  return rings[Math.round(ring) - 1] ?? 0;
}

/** The ring distances around a set of cells (Chebyshev), over their bounds and `GRID_RINGS` more on each side. */
export interface RingField {
  minX: number;
  minY: number;
  width: number;
  height: number;
  /** Row by row (y), `width` cells a row: 0 on a tile, 1 next to one, up to `GRID_RINGS` (capped). */
  rings: Uint8Array;
}

/** Each cell's ring distance to the nearest of `cells` (grid coordinates), Chebyshev, capped at `GRID_RINGS`. */
export function ringField(cells: ReadonlyArray<{ x: number; y: number }>): RingField | null {
  if (cells.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  minX -= GRID_RINGS;
  minY -= GRID_RINGS;
  const width = maxX + GRID_RINGS - minX + 1;
  const height = maxY + GRID_RINGS - minY + 1;
  const rings = new Uint8Array(width * height).fill(GRID_RINGS);
  // Each tile lowers the cells within its rings: at most 81 cells a tile.
  for (const c of cells) {
    for (let dy = -GRID_RINGS + 1; dy < GRID_RINGS; dy++) {
      for (let dx = -GRID_RINGS + 1; dx < GRID_RINGS; dx++) {
        const i = (c.y + dy - minY) * width + (c.x + dx - minX);
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (ring < rings[i]!) rings[i] = ring;
      }
    }
  }
  return { minX, minY, width, height, rings };
}

/** A cell's grid opacity (a share of `grid.opacity`), from its ring; 0 outside the field. */
function cellOpacity(field: RingField, x: number, y: number, rings: PlacementSettings["grid"]["rings"]): number {
  const i = x - field.minX;
  const j = y - field.minY;
  if (i < 0 || j < 0 || i >= field.width || j >= field.height) return 0;
  return gridRingOpacity(field.rings[j * field.width + i]!, rings);
}

/**
 * The opacity (a share of `grid.opacity`) of the grid line nearest the point (x, y), in cell units (a cell's centre at
 * whole numbers, the lines at halves): the nearest vertical and horizontal lines, as the shader picks them, and of the two
 * the nearer. A line between two cells takes the farther ring of the two (the smaller opacity, SLOTS2): the board's edge
 * and the lines inside ring 1 are full, ring 2's half, ring 3's almost gone, and nothing reaches beyond ring 3; along the
 * line it is linear from one row (or column) of cells to the next. The shader draws each of the two lines at this
 * opacity times its coverage of the pixel and keeps the larger, which on a line is the value here.
 */
export function gridLineOpacityAt(field: RingField, x: number, y: number, rings: PlacementSettings["grid"]["rings"] = DEFAULT_PLACEMENT_SETTINGS.grid.rings): number {
  const along = (line: number, at: number, cell: (a: number, b: number) => number) => {
    const j = Math.floor(at);
    const t = at - j;
    const edge = (row: number) => Math.min(cell(line - 1, row), cell(line, row));
    return edge(j) * (1 - t) + edge(j + 1) * t;
  };
  // The nearest line on each axis, as the shader's `floor(h + 0.5)` with h = x + 0.5: line L lies at L - 0.5, between
  // cells L - 1 and L.
  const lx = Math.floor(x + 1);
  const ly = Math.floor(y + 1);
  const vertical = along(lx, y, (a, b) => cellOpacity(field, a, b, rings));
  const horizontal = along(ly, x, (a, b) => cellOpacity(field, b, a, rings));
  return Math.abs(x - (lx - 0.5)) <= Math.abs(y - (ly - 0.5)) ? vertical : horizontal;
}

/**
 * A grid hairline's coverage of a pixel whose centre is `distPx` device px from the line: `widthDevicePx` wide, the same
 * on screen at every zoom (the shader's `gridLine`).
 */
export function gridLineCoverage(distPx: number, widthDevicePx: number = DEFAULT_PLACEMENT_SETTINGS.grid.widthDevicePx): number {
  return Math.min(1, Math.max(0, widthDevicePx * 0.5 + 0.5 - distPx));
}

/**
 * The grid's share of its opacity at a zoom: 1 at every zoom, unless `farFade`, then the outlines' curve fully on from
 * `farFadeStart` x S (the far end of the zoom only, by default from the opening view out).
 */
export function gridFade(tilePx: number, openingTilePx: number, grid: Pick<PlacementSettings["grid"], "farFade" | "farFadeStart">, outlines: OutlineFadeSettings): number {
  if (!grid.farFade || !(tilePx > 0 && openingTilePx > 0)) return 1;
  return placementFade(tilePx, openingTilePx, { ...outlines, fadeFullFactor: Math.max(grid.farFadeStart, outlines.fadeOffFactor) });
}

/**
 * The share of the placement lines' opacity on zoom-out: the outlines' fade (`outlineFadeOf`: off at `fadeOffFactor` of the
 * opening tile size S, fully on from `fadeFullFactor` of it, `1 - t^p` with their exponent and eased end), never under `floor`.
 */
export function placementFade(tilePx: number, openingTilePx: number, outlines: OutlineFadeSettings, floor = 0): number {
  const fade = outlineFadeOf(tilePx, openingTilePx, outlines);
  return floor + (1 - floor) * fade;
}

/** A plate's state for the tile in hand: its current rotation fits (valid), another does (possible), none does (invalid). */
export type PlateState = "valid" | "possible" | "invalid";

/** The placed tile's colour: the aura's while its rotation fits, red while it does not, green on confirm. */
export type PlacementTone = "aura" | "red" | "green";

/**
 * The tone of a tile placed on a slot, not confirmed: the aura's while its rotation fits the cell, red while it does not
 * (PM ruling on P-68 item 4). The one place that rule lives: red on any rotation would be a change here.
 */
export function placementTone(fits: boolean): PlacementTone {
  return fits ? "aura" : "red";
}

/** Whether the device asks for reduced motion (`prefers-reduced-motion: reduce`); false where there is no `matchMedia`. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The confirm at `elapsed` ms: how far the colour has gone from the placed tone to green (0 to 1), and the rim's
 * opacity (1 to 0, an ease-out). Under reduced motion the colour is green at once and the fade is short.
 */
export function confirmProgress(elapsed: number, motion: PlacementSettings["motion"], reduced: boolean): { color: number; opacity: number; done: boolean } {
  const duration = Math.max(1, reduced ? motion.reducedConfirmMs : motion.confirmMs);
  const t = Math.min(1, Math.max(0, elapsed / duration));
  // The green is reached in the first third, the fade runs over the whole.
  const color = reduced ? 1 : Math.min(1, t * 3);
  // A gentle fade: slow at both ends (a smoothstep).
  const opacity = 1 - t * t * (3 - 2 * t);
  return { color, opacity: t >= 1 ? 0 : opacity, done: t >= 1 };
}

/** The share of a change of state done at `elapsed` ms (a smoothstep); at once under reduced motion. */
export function colorProgress(elapsed: number, motion: PlacementSettings["motion"], reduced: boolean): number {
  if (reduced || !(motion.colorMs > 0)) return 1;
  const t = Math.min(1, Math.max(0, elapsed / motion.colorMs));
  return t * t * (3 - 2 * t);
}

/** A plate's shape in world units (`plateShapeOf`). */
export interface PlateShape {
  /** The side, seen from above: the cell less the gap. */
  size: number;
  height: number;
  radius: number;
  bevel: number;
}

/** The plates' settings as world units, each bounded: the gap within `PLATE_GAP_VOXELS`, the radius and bevel within the slab. */
export function plateShapeOf(plates: Pick<PlacementSettings["plates"], "gap" | "height" | "radius" | "bevel">): PlateShape {
  const gap = Math.min(PLATE_GAP_VOXELS.max, Math.max(PLATE_GAP_VOXELS.min, Number.isFinite(plates.gap) ? plates.gap : PLATE_GAP_VOXELS.min));
  const size = TILE_SIZE - gap * VOXEL_SIZE;
  const height = Math.max(0.25, Number.isFinite(plates.height) ? plates.height : 1) * VOXEL_SIZE;
  const radius = Math.min(size / 2, Math.max(0, (plates.radius || 0) * VOXEL_SIZE));
  const bevel = Math.min(radius, height, Math.max(0, (plates.bevel || 0) * VOXEL_SIZE));
  return { size, height, radius, bevel };
}

/** Points along each of a plate's corners, and along its top edge's rounding. */
const CORNER_SEGMENTS = 6;
const BEVEL_SEGMENTS = 3;

/**
 * A plate's slab, centred on its cell, from the ground (y 0) up: a rounded square seen from above, its top edge rounded
 * by `bevel` (a quarter circle), smooth normals all round, no bottom face (never seen).
 */
export function createPlateGeometry(shape: PlateShape): THREE.BufferGeometry {
  const half = shape.size / 2;
  const r = shape.radius;
  const b = Math.min(shape.bevel, r, shape.height);
  const h = shape.height;
  // The outline, counter-clockwise from +x towards +z: each corner's angle and centre.
  const around: { cos: number; sin: number; cx: number; cz: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const mid = k * (Math.PI / 2) + Math.PI / 4;
    const cx = Math.sign(Math.cos(mid)) * (half - r);
    const cz = Math.sign(Math.sin(mid)) * (half - r);
    for (let s = 0; s <= CORNER_SEGMENTS; s++) {
      const phi = k * (Math.PI / 2) + (s / CORNER_SEGMENTS) * (Math.PI / 2);
      around.push({ cos: Math.cos(phi), sin: Math.sin(phi), cx, cz });
    }
  }
  // The profile from the ground up: the side, then the rounding to the top.
  const rings: { d: number; y: number; nh: number; nv: number }[] = [{ d: 0, y: 0, nh: 1, nv: 0 }];
  for (let k = 0; k <= BEVEL_SEGMENTS; k++) {
    const theta = (k / BEVEL_SEGMENTS) * (Math.PI / 2);
    rings.push({ d: b * (1 - Math.cos(theta)), y: h - b + b * Math.sin(theta), nh: Math.cos(theta), nv: Math.sin(theta) });
  }
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const n = around.length;
  const ring = (d: number, y: number, nh: number, nv: number) => {
    const len = Math.hypot(nh, nv) || 1;
    for (const p of around) {
      position.push(p.cx + (r - d) * p.cos, y, p.cz + (r - d) * p.sin);
      normal.push((nh / len) * p.cos, nv / len, (nh / len) * p.sin);
    }
  };
  for (const { d, y, nh, nv } of rings) ring(d, y, nh, nv);
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const c = i * n + ((j + 1) % n);
      const e = (i + 1) * n + ((j + 1) % n);
      const f = (i + 1) * n + j;
      index.push(a, e, c, a, f, e);
    }
  }
  // The top: a fan from the centre over the outline, facing up.
  const capRing = position.length / 3;
  ring(b, h, 0, 1);
  const centre = position.length / 3;
  position.push(0, h, 0);
  normal.push(0, 1, 0);
  for (let j = 0; j < n; j++) index.push(centre, capRing + ((j + 1) % n), capRing + j);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setIndex(index);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A rounded square's signed distance (negative inside): half side `half`, corner radius `radius`. */
export function roundedSquareDistance(x: number, z: number, half: number, radius: number): number {
  const r = Math.min(Math.max(radius, 0), half);
  const qx = Math.abs(x) - (half - r);
  const qz = Math.abs(z) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

/**
 * The aura's strength at a point of its cell (world units around the cell's centre), the shader in TypeScript: over a
 * plate, 1 inside it falling smoothly to 0 across `falloff` centred on its edge (no hard edge to alias); placed, a rim on
 * the tile's edge falling off on both sides (a gaussian of `falloff`), so the tile's middle stays its own colour.
 */
export function auraAt(x: number, z: number, shape: PlateShape, falloff: number, placed: number): number {
  const f = Math.max(falloff, 1e-4);
  const smooth = (e0: number, e1: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const wash = 1 - smooth(-f / 2, f / 2, roundedSquareDistance(x, z, shape.size / 2, shape.radius));
  const sd = roundedSquareDistance(x, z, TILE_SIZE / 2, shape.radius) / f;
  const rim = Math.exp(-4 * sd * sd);
  return wash + (rim - wash) * placed;
}

/*
 * In the shader:
 * - The quad lies flat, centred on its cell (world units), moved by its instance to the cell and the aura's height.
 * - aAura: its strength (x), its falloff in world units (y), and how placed it is (z, 0 a plate's wash, 1 the tile's rim).
 */
const auraVertex = /* glsl */ `
attribute vec3 aAura;
varying vec2 vLocal;
varying vec3 vAura;
varying vec3 vColor;
void main() {
  vLocal = position.xz;
  vAura = aAura;
  #ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
  #else
  vColor = vec3( 1.0 );
  #endif
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
}
`;

/*
 * In the shader (`auraAt`):
 * - The plate's wash: 1 inside, a smoothstep across the falloff centred on its edge.
 * - The placed tile's rim: a gaussian on the cell's edge, so the tile's middle keeps its own colour.
 * - Premultiplied, over what is drawn: a tint, not a glow (`ONE, ONE_MINUS_SRC_ALPHA`).
 */
const auraFragment = /* glsl */ `
uniform vec3 plate;
varying vec2 vLocal;
varying vec3 vAura;
varying vec3 vColor;
float roundedSquare( vec2 p, float h, float r ) {
  vec2 q = abs( p ) - vec2( h - r );
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - r;
}
void main() {
  float f = max( vAura.y, 1e-4 );
  float wash = 1.0 - smoothstep( -0.5 * f, 0.5 * f, roundedSquare( vLocal, plate.x, plate.y ) );
  float sd = roundedSquare( vLocal, plate.z, plate.y ) / f;
  float a = vAura.x * mix( wash, exp( -4.0 * sd * sd ), vAura.z );
  if ( a <= 0.002 ) discard;
  gl_FragColor = vec4( vColor * a, a );
}
`;

type AuraMaterial = THREE.ShaderMaterial & { uniforms: { plate: THREE.IUniform<THREE.Vector3> } };

function createAuraMaterial(): AuraMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { plate: { value: new THREE.Vector3() } },
    vertexShader: auraVertex,
    fragmentShader: auraFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  }) as AuraMaterial;
}

/**
 * The plates' material: lit like the tiles (so the day and night cycle and the shadows reach them), coloured and faded
 * per instance (`instanceColor`, `aOpacity`).
 */
function createPlateMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float aOpacity;\nvarying float vPlateOpacity;\n${shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vPlateOpacity = aOpacity;")}`;
    shader.fragmentShader = `varying float vPlateOpacity;\n${shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.a *= vPlateOpacity;")}`;
  };
  material.customProgramCacheKey = () => "paved-plate";
  return material;
}

/** The grid under the plates; the auras over them, after the tiles. */
const GRID_ORDER = -2;
const PLATE_ORDER = -1;
const AURA_ORDER = 2;

/** The placed tile's rim: just over a tile's ground top (its own and its neighbours'), under their features. */
const PLACED_AURA_Y = (GROUND_VOXELS + 0.5) * VOXEL_SIZE;

/** A slot as the board gives it: grid coordinates, whether the tile in hand fits it at all, and at the current rotation. */
export interface PlacementSlot {
  x: number;
  y: number;
  /** The current rotation fits here (valid). Unset: it does. */
  fits?: boolean;
  /** Some rotation fits here. False: an invalid plate (greyscale, more transparent). Unset: it does. */
  legal?: boolean;
}

/** A slot's plate state. */
export function plateStateOf(slot: Pick<PlacementSlot, "fits" | "legal">): PlateState {
  if (slot.legal === false) return "invalid";
  return slot.fits === false ? "possible" : "valid";
}

/**
 * One plate's eased values: its colour (linear rgb), its opacity, its aura's colour and strength, and how placed it is
 * (0 a plate's wash, 1 the placed tile's rim).
 */
const VALUES = 9;
const [OPACITY, AURA_RGB, AURA, PLACED] = [3, 4, 7, 8];

interface PlateEntry {
  x: number;
  y: number;
  state: PlateState;
  from: Float32Array;
  to: Float32Array;
  since: number;
  /** Gone from the slots: fading out, then removed. */
  leaving: boolean;
  /** Last written at its target: no frame needed until it changes. */
  settled: boolean;
}

/** What `update` reports: whether the next frame must be drawn (an effect still moves). */
export interface PlacementUpdate {
  animating: boolean;
}

const cellKey = (x: number, y: number) => `${x},${y}`;

/**
 * Draws the placement visuals: the grid, the plates, their auras, the placed tile's rim and the confirm. It owns its
 * geometries and materials (one instanced mesh for the plates, one for the auras): `dispose` frees them.
 */
export class PlacementRenderer {
  readonly group = new THREE.Group();
  private settings: PlacementSettings = DEFAULT_PLACEMENT_SETTINGS;
  private reduced = false;

  private gridMesh: THREE.Mesh | null = null;
  private gridGeometry: THREE.PlaneGeometry | null = null;
  private gridMaterial: GridMaterial | null = null;
  private gridTexture: THREE.DataTexture | null = null;
  private gridKey = "";

  private slotGroup: THREE.Group;
  private shape: PlateShape = plateShapeOf(DEFAULT_PLACEMENT_SETTINGS.plates);
  private plateGeometry: THREE.BufferGeometry | null = null;
  private plateMaterial: THREE.MeshStandardMaterial | null = null;
  private plateMesh: THREE.InstancedMesh | null = null;
  private auraGeometry: THREE.BufferGeometry | null = null;
  private auraMaterial: AuraMaterial | null = null;
  private auraMesh: THREE.InstancedMesh | null = null;

  private slots: PlacementSlot[] = [];
  private plates = new Map<string, PlateEntry>();
  /** The placed tile's cell and whether its rotation fits there; null with no tile placed. */
  private ghost: { x: number; y: number; fits: boolean } | null = null;
  private confirm: { x: number; y: number; from: THREE.Color; since: number } | null = null;
  /** The instances must be written again (a change not yet drawn). */
  private dirty = false;

  private fade = 1;
  private outlines: OutlineFadeSettings = { fadeOffFactor: 0.85, fadeFullFactor: 1.5, fadeExponent: 2, fadeEasedEnd: false };
  private zoom = { tilePx: Number.NaN, openingTilePx: Number.NaN };

  /** `slotGroup`: where the plates go (the tile renderer's group of empty slots); unset, a group of its own. */
  constructor(slotGroup?: THREE.Group) {
    this.slotGroup = slotGroup ?? new THREE.Group();
    if (!slotGroup) this.group.add(this.slotGroup);
  }

  getSettings(): PlacementSettings {
    return this.settings;
  }

  /** New settings: the plate and aura geometries rebuilt (their shape), every plate's target set again at once. */
  setSettings(settings: PlacementSettings, outlines?: OutlineFadeSettings): void {
    this.settings = settings;
    if (outlines) this.outlines = { fadeOffFactor: outlines.fadeOffFactor, fadeFullFactor: outlines.fadeFullFactor, fadeExponent: outlines.fadeExponent, fadeEasedEnd: outlines.fadeEasedEnd };
    this.shape = plateShapeOf(settings.plates);
    this.plateGeometry?.dispose();
    this.plateGeometry = null;
    this.auraGeometry?.dispose();
    this.auraGeometry = null;
    this.disposeMeshes();
    this.gridKey = "";
    this.applyZoom();
    for (const entry of this.plates.values()) {
      entry.to = this.targetOf(entry);
      entry.from = entry.to.slice();
    }
    this.dirty = true;
    this.writeInstances(Number.NaN);
  }

  /** Reduced motion: instant changes, a short confirm. */
  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  isReducedMotion(): boolean {
    return this.reduced;
  }

  /** The placed tiles' cells (grid coordinates): the grid, when on, is drawn around them. */
  setTileCells(cells: ReadonlyArray<{ x: number; y: number }>): void {
    const field = this.settings.grid.enabled ? ringField(cells) : null;
    const key = field ? `${field.minX},${field.minY},${field.width},${field.height},${field.rings.join("")}` : "";
    if (key === this.gridKey) return;
    this.gridKey = key;
    if (!field) {
      if (this.gridMesh) this.gridMesh.visible = false;
      return;
    }
    const { grid } = this.settings;
    const data = new Uint8Array(field.width * field.height * 4);
    for (let i = 0; i < field.rings.length; i++) {
      const value = Math.round(gridRingOpacity(field.rings[i]!, grid.rings) * 255);
      data[i * 4] = value;
      data[i * 4 + 3] = 255;
    }
    this.gridTexture?.dispose();
    this.gridTexture = new THREE.DataTexture(data, field.width, field.height, THREE.RGBAFormat);
    // Read cell by cell (`texelFetch`): the shader interpolates along each line itself.
    this.gridTexture.magFilter = THREE.NearestFilter;
    this.gridTexture.minFilter = THREE.NearestFilter;
    this.gridTexture.needsUpdate = true;
    const material = (this.gridMaterial ??= createGridMaterial());
    material.uniforms.rings.value = this.gridTexture;
    material.uniforms.field.value.set(field.minX, field.minY, field.width, field.height);
    this.gridGeometry?.dispose();
    this.gridGeometry = new THREE.PlaneGeometry(field.width * TILE_SIZE, field.height * TILE_SIZE).rotateX(-Math.PI / 2);
    if (!this.gridMesh) {
      this.gridMesh = new THREE.Mesh(this.gridGeometry, material);
      this.gridMesh.renderOrder = GRID_ORDER;
      this.gridMesh.userData.grid = true;
      this.group.add(this.gridMesh);
    } else this.gridMesh.geometry = this.gridGeometry;
    this.gridMesh.visible = true;
    // The field's centre, in world units: cells from minX to minX + width - 1.
    this.gridMesh.position.set((field.minX + (field.width - 1) / 2) * TILE_SIZE, 0.005, (field.minY + (field.height - 1) / 2) * TILE_SIZE);
    this.applyGrid();
  }

  /** Every slot of the tile in hand with its state (`plateStateOf`): a plate on each, easing in, out and between states. */
  setSlots(slots: ReadonlyArray<PlacementSlot>, now: number = performance.now()): void {
    this.slots = slots.slice();
    this.syncPlates(now);
  }

  /**
   * The tile placed on a slot, not confirmed (null: none, or a hover only): its plate's aura becomes its rim, the aura's
   * colour while `fits`, red while not (`placementTone`), easing over `motion.colorMs`.
   */
  setGhost(ghost: { x: number; y: number; fits: boolean } | null, now: number = performance.now()): void {
    const before = this.ghost;
    if (before?.x === ghost?.x && before?.y === ghost?.y && before?.fits === ghost?.fits) return;
    this.ghost = ghost && { x: ghost.x, y: ghost.y, fits: ghost.fits };
    this.syncPlates(now);
  }

  /** The placed tile's cell, while there is one. */
  getGhost(): { x: number; y: number; fits: boolean } | null {
    return this.ghost;
  }

  /**
   * The confirm at a cell (the placed tile is drawn by the board now): the rim turns green from the placed tile's colour
   * and fades out. Null: none.
   */
  startConfirm(cell: { x: number; y: number } | null, now: number = performance.now()): void {
    if (!cell) {
      this.confirm = null;
      this.dirty = true;
      this.writeInstances(now);
      return;
    }
    const entry = this.plates.get(cellKey(cell.x, cell.y));
    const from = entry ? this.current(entry, now) : null;
    const color = from && from[PLACED]! > 0.5 ? new THREE.Color(from[AURA_RGB]!, from[AURA_RGB + 1]!, from[AURA_RGB + 2]!) : new THREE.Color(this.settings.colors.aura);
    this.confirm = { x: cell.x, y: cell.y, from: color, since: now };
    this.dirty = true;
    this.writeInstances(now);
  }

  /** The zoom: the grid's fade, when `grid.farFade` is on. */
  setZoom(tilePx: number, openingTilePx: number): void {
    this.zoom = { tilePx, openingTilePx };
    this.applyZoom();
  }

  private applyZoom(): void {
    const { tilePx, openingTilePx } = this.zoom;
    this.fade = tilePx > 0 && openingTilePx > 0 ? gridFade(tilePx, openingTilePx, this.settings.grid, this.outlines) : 1;
    this.applyGrid();
  }

  private applyGrid(): void {
    const material = this.gridMaterial;
    if (!material) return;
    const { grid } = this.settings;
    material.uniforms.color.value.set(grid.color);
    material.uniforms.opacity.value = grid.opacity * this.fade;
    material.uniforms.widthPx.value = grid.widthDevicePx;
    if (this.gridMesh) this.gridMesh.visible = grid.enabled && this.fade > 0 && this.gridKey !== "";
  }

  /** The plates of `slots` and the placed tile's cell: new ones ease in, gone ones out, changed ones to their state. */
  private syncPlates(now: number): void {
    const wanted = new Map<string, PlateState>();
    for (const slot of this.slots) wanted.set(cellKey(slot.x, slot.y), plateStateOf(slot));
    // A tile placed where no slot was given still stands on its plate.
    if (this.ghost && !wanted.has(cellKey(this.ghost.x, this.ghost.y))) wanted.set(cellKey(this.ghost.x, this.ghost.y), "valid");
    for (const [key, entry] of this.plates) {
      if (wanted.has(key) || entry.leaving) continue;
      entry.from = this.current(entry, now);
      entry.to = entry.from.slice();
      entry.to[OPACITY] = 0;
      entry.to[AURA] = 0;
      entry.since = now;
      entry.leaving = true;
      entry.settled = false;
    }
    for (const [key, state] of wanted) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      const entry = this.plates.get(key);
      if (!entry) {
        const fresh: PlateEntry = { x, y, state, from: new Float32Array(VALUES), to: new Float32Array(VALUES), since: now, leaving: false, settled: false };
        fresh.to = this.targetOf(fresh);
        // A new plate eases in from nothing, in its own colours.
        fresh.from = fresh.to.slice();
        fresh.from[OPACITY] = 0;
        fresh.from[AURA] = 0;
        this.plates.set(key, fresh);
        continue;
      }
      entry.state = state;
      entry.leaving = false;
      const to = this.targetOf(entry);
      if (to.every((v, i) => v === entry.to[i])) continue;
      entry.from = this.current(entry, now);
      entry.to = to;
      entry.since = now;
      entry.settled = false;
    }
    this.dirty = true;
    this.writeInstances(now);
  }

  /** A plate's values for its state, and for the placed tile when it is its cell. */
  private targetOf(entry: Pick<PlateEntry, "x" | "y" | "state">): Float32Array {
    const { colors, plates, aura } = this.settings;
    const placed = this.ghost !== null && this.ghost.x === entry.x && this.ghost.y === entry.y;
    const tone = placed ? placementTone(this.ghost!.fits) : null;
    const plate = new THREE.Color(entry.state === "invalid" ? colors.invalid : tone === "red" ? colors.red : colors.plate);
    const glow = new THREE.Color(tone ? colors[tone] : colors.aura);
    const values = new Float32Array(VALUES);
    values.set([plate.r, plate.g, plate.b], 0);
    values[OPACITY] = plates.enabled ? (entry.state === "invalid" ? plates.invalidOpacity : plates.opacity) : 0;
    values.set([glow.r, glow.g, glow.b], AURA_RGB);
    values[AURA] = !aura.enabled ? 0 : placed ? aura.placedIntensity : entry.state === "valid" ? aura.intensity : 0;
    values[PLACED] = placed ? 1 : 0;
    return values;
  }

  /** How far a plate's change has gone at `now` (NaN: done). */
  private progress(entry: PlateEntry, now: number): number {
    return Number.isFinite(now) ? colorProgress(now - entry.since, this.settings.motion, this.reduced) : 1;
  }

  /** A plate's values at `now`, eased from `from` to `to` over `motion.colorMs`. */
  private current(entry: PlateEntry, now: number): Float32Array {
    const t = this.progress(entry, now);
    const out = new Float32Array(VALUES);
    for (let i = 0; i < VALUES; i++) out[i] = entry.from[i]! + (entry.to[i]! - entry.from[i]!) * t;
    return out;
  }

  private ensureMeshes(plates: number, auras: number): { plate: THREE.InstancedMesh; aura: THREE.InstancedMesh } {
    const grow = (have: THREE.InstancedMesh | null, need: number) => !have || have.instanceMatrix.count < need;
    if (grow(this.plateMesh, plates)) {
      const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, plates))));
      this.plateMesh?.removeFromParent();
      this.plateMesh?.dispose();
      const geometry = (this.plateGeometry ??= createPlateGeometry(this.shape));
      geometry.setAttribute("aOpacity", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
      const mesh = new THREE.InstancedMesh(geometry, (this.plateMaterial ??= createPlateMaterial()), capacity);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      // The instances move over the board: no culling by the first one's bounds.
      mesh.frustumCulled = false;
      mesh.renderOrder = PLATE_ORDER;
      mesh.userData.plates = true;
      this.plateMesh = mesh;
      this.slotGroup.add(mesh);
    }
    if (grow(this.auraMesh, auras)) {
      const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, auras))));
      this.auraMesh?.removeFromParent();
      this.auraMesh?.dispose();
      const geometry = (this.auraGeometry ??= this.createAuraGeometry());
      geometry.setAttribute("aAura", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
      const mesh = new THREE.InstancedMesh(geometry, (this.auraMaterial ??= createAuraMaterial()), capacity);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = AURA_ORDER;
      mesh.userData.auras = true;
      this.auraMesh = mesh;
      this.group.add(mesh);
    }
    return { plate: this.plateMesh!, aura: this.auraMesh! };
  }

  /** The aura's quad: the cell and the farther of the two falloffs around it. */
  private createAuraGeometry(): THREE.BufferGeometry {
    const { aura } = this.settings;
    const reach = TILE_SIZE / 2 + 1.25 * Math.max(aura.falloff, aura.placedFalloff, 0) * VOXEL_SIZE;
    return new THREE.PlaneGeometry(2 * reach, 2 * reach).rotateX(-Math.PI / 2);
  }

  /** Writes every plate and aura instance at `now` (NaN: their targets). */
  private writeInstances(now: number): void {
    if (!this.dirty) return;
    this.dirty = false;
    const entries = [...this.plates.values()];
    const confirm = this.confirm && this.confirmValues(now);
    const auraCount = entries.length + (confirm ? 1 : 0);
    if (entries.length === 0 && !confirm && !this.plateMesh) return;
    const { plate, aura } = this.ensureMeshes(entries.length, auraCount);
    const { aura: auraSettings } = this.settings;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const opacity = plate.geometry.getAttribute("aOpacity") as THREE.InstancedBufferAttribute;
    const auraAttr = aura.geometry.getAttribute("aAura") as THREE.InstancedBufferAttribute;
    const plateTop = this.shape.height + auraSettings.height * VOXEL_SIZE;
    let a = 0;
    const pushAura = (x: number, y: number, rgb: ArrayLike<number>, offset: number, strength: number, placed: number) => {
      if (!(strength > 0.001)) return;
      matrix.makeTranslation(x * TILE_SIZE, plateTop + (PLACED_AURA_Y - plateTop) * placed, y * TILE_SIZE);
      aura.setMatrixAt(a, matrix);
      aura.setColorAt(a, color.setRGB(rgb[offset]!, rgb[offset + 1]!, rgb[offset + 2]!));
      const falloff = (auraSettings.falloff + (auraSettings.placedFalloff - auraSettings.falloff) * placed) * VOXEL_SIZE;
      auraAttr.setXYZ(a, strength, falloff, placed);
      a++;
    };
    entries.forEach((entry, i) => {
      const v = this.current(entry, now);
      entry.settled = this.progress(entry, now) >= 1;
      matrix.makeTranslation(entry.x * TILE_SIZE, 0, entry.y * TILE_SIZE);
      plate.setMatrixAt(i, matrix);
      plate.setColorAt(i, color.setRGB(v[0]!, v[1]!, v[2]!));
      opacity.setX(i, v[OPACITY]!);
      pushAura(entry.x, entry.y, v, AURA_RGB, v[AURA]!, v[PLACED]!);
    });
    if (confirm) pushAura(confirm.x, confirm.y, confirm.rgb, 0, confirm.strength, 1);
    plate.count = entries.length;
    plate.instanceMatrix.needsUpdate = true;
    if (plate.instanceColor) plate.instanceColor.needsUpdate = true;
    opacity.needsUpdate = true;
    aura.count = a;
    aura.instanceMatrix.needsUpdate = true;
    if (aura.instanceColor) aura.instanceColor.needsUpdate = true;
    auraAttr.needsUpdate = true;
    this.auraMaterial!.uniforms.plate.value.set(this.shape.size / 2, this.shape.radius, TILE_SIZE / 2);
    plate.visible = plate.count > 0;
    aura.visible = aura.count > 0;
  }

  /** The confirm's rim at `now`: from the placed tile's colour to green, fading out. */
  private confirmValues(now: number): { x: number; y: number; rgb: number[]; strength: number; done: boolean } | null {
    const confirm = this.confirm;
    if (!confirm) return null;
    const elapsed = Number.isFinite(now) ? now - confirm.since : 0;
    const { color, opacity, done } = confirmProgress(elapsed, this.settings.motion, this.reduced);
    const rgb = confirm.from.clone().lerp(new THREE.Color(this.settings.colors.green), color);
    const strength = this.settings.aura.enabled ? this.settings.aura.placedIntensity * opacity : 0;
    return { x: confirm.x, y: confirm.y, rgb: [rgb.r, rgb.g, rgb.b], strength, done };
  }

  /**
   * Moves the effects to `now` (ms, `performance.now()`): the plates' easing, the confirm's fade. True while one still
   * moves, so the scene draws the next frame; false when nothing does (render on demand holds).
   */
  update(now: number): PlacementUpdate {
    let animating = false;
    for (const [key, entry] of this.plates) {
      const done = this.progress(entry, now) >= 1;
      if (done && entry.leaving) this.plates.delete(key);
      // Moving, or at its end but not yet drawn there: one more frame.
      if (!done || !entry.settled || entry.leaving) {
        animating = true;
        this.dirty = true;
      }
    }
    if (this.confirm) {
      this.dirty = true;
      // One more frame after the end draws it gone.
      animating = true;
      if (this.confirmValues(now)!.done) this.confirm = null;
    }
    this.writeInstances(now);
    return { animating };
  }

  /** The confirm's rim is on screen. */
  isConfirming(): boolean {
    return this.confirm !== null;
  }

  /** The plates' instanced mesh (null before the first slot), for tests and tools. */
  getPlateMesh(): THREE.InstancedMesh | null {
    return this.plateMesh;
  }

  /** The auras' instanced mesh (null before the first slot). */
  getAuraMesh(): THREE.InstancedMesh | null {
    return this.auraMesh;
  }

  private disposeMeshes(): void {
    for (const mesh of [this.plateMesh, this.auraMesh]) {
      mesh?.removeFromParent();
      mesh?.dispose();
    }
    this.plateMesh = this.auraMesh = null;
  }

  dispose(): void {
    this.disposeMeshes();
    this.group.clear();
    this.gridMesh = null;
    this.gridGeometry?.dispose();
    this.gridGeometry = null;
    this.gridMaterial?.dispose();
    this.gridMaterial = null;
    this.gridTexture?.dispose();
    this.gridTexture = null;
    this.gridKey = "";
    this.plateGeometry?.dispose();
    this.plateGeometry = null;
    this.auraGeometry?.dispose();
    this.auraGeometry = null;
    this.plateMaterial?.dispose();
    this.plateMaterial = null;
    this.auraMaterial?.dispose();
    this.auraMaterial = null;
    this.plates.clear();
    this.slots = [];
    this.ghost = null;
    this.confirm = null;
  }
}

/*
 * In the shader:
 * - Cell units: a tile's centre at whole numbers, the lines between cells at halves.
 */
const gridVertex = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vCell;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vCell = world.xz / ${TILE_SIZE.toFixed(1)};
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

/*
 * In the shader:
 * - A hairline's coverage of a pixel at `dist` from it, both in the units of `px` (one device px): `widthPx` device px
 *   at every zoom (gridLineCoverage).
 * - The field's first cell (grid coordinates) and its size in cells.
 * - A cell's opacity, by its grid coordinates; the field's margin cells are 0, so the clamp reads 0 outside.
 * - The vertical line between cells line - 1 and line, at y: the smaller of the two (the farther ring), linear between rows.
 * - Distance to the nearest line on each axis, in cell units, and a device px in cell units across each line: the length
 *   of the coordinate's screen gradient (fwidth's sum would widen a line seen at an angle).
 * - Each line's opacity: the farther ring of its two cells (the smaller opacity), linear along it from one row of cells
 *   to the next (gridLineOpacityAt).
 */
const gridFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 color;
uniform float opacity;
uniform float widthPx;
uniform sampler2D rings;
uniform vec4 field;
varying vec2 vCell;
float gridLine( float dist, float px, float w ) {
  return clamp( w * 0.5 + 0.5 - dist / max( px, 1e-6 ), 0.0, 1.0 );
}
float cellAt( float x, float y ) {
  ivec2 size = ivec2( field.zw );
  ivec2 at = clamp( ivec2( x - field.x, y - field.y ), ivec2( 0 ), size - 1 );
  return texelFetch( rings, at, 0 ).r;
}
float verticalLine( float line, float y ) {
  float j = floor( y );
  float t = y - j;
  return mix( min( cellAt( line - 1.0, j ), cellAt( line, j ) ), min( cellAt( line - 1.0, j + 1.0 ), cellAt( line, j + 1.0 ) ), t );
}
float horizontalLine( float line, float x ) {
  float i = floor( x );
  float t = x - i;
  return mix( min( cellAt( i, line - 1.0 ), cellAt( i, line ) ), min( cellAt( i + 1.0, line - 1.0 ), cellAt( i + 1.0, line ) ), t );
}
void main() {
  vec2 h = vCell + 0.5;
  vec2 dist = 0.5 - abs( fract( h ) - 0.5 );
  vec2 px = max( vec2( length( vec2( dFdx( h.x ), dFdy( h.x ) ) ), length( vec2( dFdx( h.y ), dFdy( h.y ) ) ) ), vec2( 1e-6 ) );
  float lineX = gridLine( dist.x, px.x, widthPx );
  float lineY = gridLine( dist.y, px.y, widthPx );
  vec2 lines = floor( h + 0.5 );
  float a = max( verticalLine( lines.x, vCell.y ) * lineX, horizontalLine( lines.y, vCell.x ) * lineY ) * opacity;
  if ( a <= 0.0 ) discard;
  gl_FragColor = vec4( color * a, a );
  #include <fog_fragment>
}
`;

type GridMaterial = THREE.ShaderMaterial & {
  uniforms: {
    color: THREE.IUniform<THREE.Color>;
    opacity: THREE.IUniform<number>;
    widthPx: THREE.IUniform<number>;
    rings: THREE.IUniform<THREE.DataTexture | null>;
    field: THREE.IUniform<THREE.Vector4>;
  };
};

function createGridMaterial(): GridMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        color: { value: new THREE.Color() },
        opacity: { value: 1 },
        widthPx: { value: 1 },
        rings: { value: null },
        field: { value: new THREE.Vector4() },
      },
    ]),
    vertexShader: gridVertex,
    fragmentShader: gridFragment,
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  }) as GridMaterial;
}
