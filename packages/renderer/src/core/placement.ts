import * as THREE from "three";
import { isOutline, outlineFade, type OutlineSettings } from "./outlines";
import { NEON_LINE_GLSL, createNeonFrameGeometry, createNeonFrameMaterial, setNeonFrame, type NeonFrameMaterial } from "./neon";
import { TILE_SIZE } from "./types";

/**
 * The placement visuals (SLOTS, P-68): the grid around the placed tiles, the legal slots of the tile in hand, and the
 * tile placed on a slot before it is confirmed.
 *
 * - The grid: pale, thin lines all around the board, fading by ring distance from the placed tiles (Chebyshev: the
 *   8 cells around a tile are its first ring): a line takes the nearer ring of its two cells, linear along it.
 * - A legal slot (any rotation): a flat fill and a neon border along the grid lines, dashed; solid and brighter where the
 *   current rotation fits.
 * - The tile placed, not confirmed: an aura around its cell (a halo on the ground and a curtain up its sides, waves
 *   running outward and up) and a pale veil over the tile. Yellow while its rotation fits, red while it does not (the
 *   one place that rule lives: `placementTone`), green on confirm, then a fade to nothing.
 *
 * Lines are a share of a tile wide in world units with a device-px floor, antialiased in their shaders (`neon.ts`), and
 * fade like the outlines on zoom-out (OUT-FADE's curve, `placementFade`). The waves loop; under reduced motion the aura
 * is still, a colour changes at once, and the confirm fade is short.
 */
export interface PlacementSettings {
  /** The state colours, CSS hex (the app's Tailwind tokens: primary gold-300, ember-500, meadow-400). */
  colors: { yellow: string; red: string; green: string };
  grid: {
    enabled: boolean;
    /** A pale neutral (ink-200). */
    color: string;
    /** The lines' opacity one ring from a tile. */
    opacity: number;
    /** The share of `opacity` of a line whose nearer cell is at ring 1, 2 or 3; 0 from ring 4. Linear along a line. */
    rings: [number, number, number];
    /** The line's width, a share of a tile. */
    width: number;
    /** The thinnest line, in device px. */
    minWidthDevicePx: number;
  };
  slots: {
    enabled: boolean;
    /** The flat fill's opacity. */
    fillOpacity: number;
    /** The border's width, a share of a tile. */
    width: number;
    /** The border's halo on each side, a share of a tile. */
    glow: number;
    /** The border's brightness where the current rotation does not fit (dashed). */
    intensity: number;
    /** Where it fits (solid): brighter, the neon "more intense". */
    fitIntensity: number;
    /** The halo's brightness against the line's. */
    glowIntensity: number;
    /** A gap's share of a dash period (long dashes, smaller gaps). */
    gap: number;
    /** 2 dashes a side below this tile size (CSS px), 3 above; blended over `dashBlendPx` around it. */
    dashesAtTilePx: number;
    dashBlendPx: number;
    /** The border keeps at least this share when the zoom-out fade takes the grid away: the slots stay findable. */
    fadeFloor: number;
  };
  aura: {
    enabled: boolean;
    intensity: number;
    /** The curtain's height, a share of a tile. */
    height: number;
    /** The halo's reach on the ground beyond the cell, a share of a tile. */
    halo: number;
    /** Waves along the aura's height (and along the halo, outward). */
    waves: number;
    /** How deep the waves cut, 0 (none) to 1. */
    waveAmount: number;
    /** One loop of the waves, ms. */
    periodMs: number;
    /** The placed cell's border, solid, at this brightness. */
    borderIntensity: number;
  };
  veil: {
    /** The veil's opacity over the tile. */
    opacity: number;
    /** How pale: the state colour mixed with white by this share. */
    whiten: number;
  };
  motion: {
    /** A colour change (yellow to red and back), ms. */
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

export const DEFAULT_PLACEMENT_SETTINGS: PlacementSettings = {
  colors: { yellow: "#f0bf5b", red: "#f85e4d", green: "#6eca6f" },
  grid: { enabled: true, color: "#d1d9df", opacity: 0.32, rings: [1, 0.4, 0.1], width: 0.012, minWidthDevicePx: 1 },
  slots: {
    enabled: true,
    fillOpacity: 0.03,
    width: 0.025,
    glow: 0.07,
    intensity: 1.3,
    fitIntensity: 2.4,
    glowIntensity: 0.55,
    gap: 0.28,
    dashesAtTilePx: 80,
    dashBlendPx: 16,
    fadeFloor: 0.6,
  },
  aura: { enabled: true, intensity: 1.6, height: 0.45, halo: 0.2, waves: 2, waveAmount: 0.5, periodMs: 1800, borderIntensity: 2.8 },
  veil: { opacity: 0.16, whiten: 0.5 },
  motion: { colorMs: 220, confirmMs: 700, reducedConfirmMs: 150, reducedMotion: "auto" },
};

/** `input` over `base`, group by group. */
export function resolvePlacementSettings(input: PlacementSettingsInput = {}, base = DEFAULT_PLACEMENT_SETTINGS): PlacementSettings {
  return {
    colors: { ...base.colors, ...input.colors },
    grid: { ...base.grid, ...input.grid },
    slots: { ...base.slots, ...input.slots },
    aura: { ...base.aura, ...input.aura },
    veil: { ...base.veil, ...input.veil },
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
 * the nearer. A line between two cells takes the nearer ring of the two (the smaller), so the outer edges of the first
 * ring are fully visible, the second ring's perceptible, the third's almost gone; along the line it is linear from one row
 * (or column) of cells to the next. The shader draws each of the two lines at this opacity times its coverage of the pixel
 * and keeps the larger, which on a line is the value here.
 */
export function gridLineOpacityAt(field: RingField, x: number, y: number, rings: PlacementSettings["grid"]["rings"] = DEFAULT_PLACEMENT_SETTINGS.grid.rings): number {
  const along = (line: number, at: number, cell: (a: number, b: number) => number) => {
    const j = Math.floor(at);
    const t = at - j;
    const edge = (row: number) => Math.max(cell(line - 1, row), cell(line, row));
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
 * The share of the placement lines' opacity on zoom-out: OUT-FADE's curve (`outlineFade`, off at `fadeOffFactor` of the
 * opening tile size S, fully on from `fadeFullFactor` of it), never under `floor`.
 */
export function placementFade(tilePx: number, openingTilePx: number, outlines: Pick<OutlineSettings, "fadeOffFactor" | "fadeFullFactor">, floor = 0): number {
  const fade = outlineFade(tilePx, outlines.fadeOffFactor * openingTilePx, outlines.fadeFullFactor * openingTilePx);
  return floor + (1 - floor) * fade;
}

/** The dashes a side: 0 for 2, 1 for 3, linear over `dashBlendPx` centred on `dashesAtTilePx` (no pop on a zoom step). */
export function slotDashBlend(tilePx: number, slots: Pick<PlacementSettings["slots"], "dashesAtTilePx" | "dashBlendPx"> = DEFAULT_PLACEMENT_SETTINGS.slots): number {
  const half = Math.max(0, slots.dashBlendPx) / 2;
  if (half === 0) return tilePx >= slots.dashesAtTilePx ? 1 : 0;
  return Math.min(1, Math.max(0, (tilePx - (slots.dashesAtTilePx - half)) / (2 * half)));
}

/** The dashes a side the eye counts at a tile size: 2 or 3. */
export function slotDashCount(tilePx: number, slots?: Pick<PlacementSettings["slots"], "dashesAtTilePx" | "dashBlendPx">): 2 | 3 {
  return slotDashBlend(tilePx, slots) >= 0.5 ? 3 : 2;
}

/** The placed tile's state colour. */
export type PlacementTone = "yellow" | "red" | "green";

/**
 * The tone of a tile placed on a slot, not confirmed: yellow while its rotation fits the cell, red while it does not
 * (PM ruling on P-68 item 4). The one place that rule lives: red on any rotation would be a change here.
 */
export function placementTone(fits: boolean): PlacementTone {
  return fits ? "yellow" : "red";
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
 * The confirm at `elapsed` ms: how far the colour has gone from the placed tone to green (0 to 1), and the effects'
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

/** The share of a colour change done at `elapsed` ms (a smoothstep); at once under reduced motion. */
export function colorProgress(elapsed: number, motion: PlacementSettings["motion"], reduced: boolean): number {
  if (reduced || !(motion.colorMs > 0)) return 1;
  const t = Math.min(1, Math.max(0, elapsed / motion.colorMs));
  return t * t * (3 - 2 * t);
}

const gridVertex = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vCell;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  // Cell units: a tile's centre at whole numbers, the lines between cells at halves.
  vCell = world.xz / ${TILE_SIZE.toFixed(1)};
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const gridFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 color;
uniform float opacity;
uniform float lineWidth;
uniform float minPx;
uniform sampler2D rings;
// The field's first cell (grid coordinates) and its size in cells.
uniform vec4 field;
varying vec2 vCell;
${NEON_LINE_GLSL}
// A cell's opacity, by its grid coordinates; the field's margin cells are 0, so the clamp reads 0 outside.
float cellAt( float x, float y ) {
  ivec2 size = ivec2( field.zw );
  ivec2 at = clamp( ivec2( x - field.x, y - field.y ), ivec2( 0 ), size - 1 );
  return texelFetch( rings, at, 0 ).r;
}
// The vertical line between cells line - 1 and line, at y: the larger of the two, linear between rows.
float verticalLine( float line, float y ) {
  float j = floor( y );
  float t = y - j;
  return mix( max( cellAt( line - 1.0, j ), cellAt( line, j ) ), max( cellAt( line - 1.0, j + 1.0 ), cellAt( line, j + 1.0 ) ), t );
}
float horizontalLine( float line, float x ) {
  float i = floor( x );
  float t = x - i;
  return mix( max( cellAt( i, line - 1.0 ), cellAt( i, line ) ), max( cellAt( i + 1.0, line - 1.0 ), cellAt( i + 1.0, line ) ), t );
}
void main() {
  vec2 h = vCell + 0.5;
  // Distance to the nearest line on each axis, in cell units, and a device px in cell units.
  vec2 dist = 0.5 - abs( fract( h ) - 0.5 );
  vec2 px = max( fwidth( h ), vec2( 1e-6 ) );
  float lineX = neonLine( dist.x, lineWidth, px.x, minPx );
  float lineY = neonLine( dist.y, lineWidth, px.y, minPx );
  // Each line's opacity: the nearer ring of its two cells (the larger opacity), linear along it from one row of cells to
  // the next (gridLineOpacityAt).
  vec2 lines = floor( h + 0.5 );
  float a = max( verticalLine( lines.x, vCell.y ) * lineX, horizontalLine( lines.y, vCell.x ) * lineY ) * opacity;
  if ( a <= 0.0 ) discard;
  gl_FragColor = vec4( color * a, a );
  #include <fog_fragment>
}
`;

const auraVertex = /* glsl */ `
attribute float aV;
attribute float aWall;
varying float vV;
varying float vWall;
varying vec3 vNormalView;
varying vec3 vViewPosition;
void main() {
  vV = aV;
  vWall = aWall;
  vNormalView = normalize( normalMatrix * normal );
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  vViewPosition = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const auraFragment = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float intensity;
uniform float phase;
uniform float waves;
uniform float waveAmount;
varying float vV;
varying float vWall;
varying vec3 vNormalView;
varying vec3 vViewPosition;
void main() {
  // Bright at the cell's edge, falling to 0 at the far end: no hard edge to alias.
  float base = ( 1.0 - vV ) * ( 1.0 - vV );
  float wave = 0.5 + 0.5 * sin( 6.28318530718 * ( vV * waves - phase ) );
  float a = base * mix( 1.0, wave, waveAmount ) * intensity * opacity;
  // The curtain fades out as it turns edge-on (seen from above it would be a thin, aliased line), and its far side,
  // which faces away, is not drawn: the aura is drawn over what is in front of it (no depth test), not through the tile.
  float facing = dot( normalize( vNormalView ), normalize( -vViewPosition ) );
  a *= mix( 1.0, smoothstep( 0.15, 0.5, facing ), vWall );
  gl_FragColor = vec4( color * a, 0.0 );
}
`;

type AuraMaterial = THREE.ShaderMaterial & {
  uniforms: {
    color: THREE.IUniform<THREE.Color>;
    opacity: THREE.IUniform<number>;
    intensity: THREE.IUniform<number>;
    phase: THREE.IUniform<number>;
    waves: THREE.IUniform<number>;
    waveAmount: THREE.IUniform<number>;
  };
};

type GridMaterial = THREE.ShaderMaterial & {
  uniforms: {
    color: THREE.IUniform<THREE.Color>;
    opacity: THREE.IUniform<number>;
    lineWidth: THREE.IUniform<number>;
    minPx: THREE.IUniform<number>;
    rings: THREE.IUniform<THREE.DataTexture | null>;
    field: THREE.IUniform<THREE.Vector4>;
  };
};

function createAuraMaterial(): AuraMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color() },
      opacity: { value: 1 },
      intensity: { value: 1 },
      phase: { value: 0 },
      waves: { value: 2 },
      waveAmount: { value: 0.5 },
    },
    vertexShader: auraVertex,
    fragmentShader: auraFragment,
    transparent: true,
    depthWrite: false,
    // A glow over the neighbours' ground: their trees and roofs would cut its halo into pieces.
    depthTest: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  }) as AuraMaterial;
}

/**
 * The aura around one cell, in world units, centred on it: a halo on the ground from just inside the cell's edge to
 * `halo` beyond it (mitred at the corners), and a curtain up its four sides `height` high. `aV` runs from 0 at the edge
 * to 1 at the far end (outward on the ground, up the curtain); `aWall` is 1 on the curtain.
 */
export function createAuraGeometry(height: number, halo: number): THREE.BufferGeometry {
  const half = TILE_SIZE / 2;
  const inner = half * 0.96;
  const outer = half + Math.max(0, halo) * TILE_SIZE;
  const wall = half + 0.004 * TILE_SIZE;
  const top = Math.max(0, height) * TILE_SIZE;
  const position: number[] = [];
  const normal: number[] = [];
  const v: number[] = [];
  const isWall: number[] = [];
  const index: number[] = [];
  const quad = (p: number[][], n: number[], vs: number[], w: number) => {
    const base = position.length / 3;
    for (let k = 0; k < 4; k++) {
      position.push(...p[k]!);
      normal.push(...n);
      v.push(vs[k]!);
      isWall.push(w);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // The four sides: outward direction (dx, dz) and the side's direction (sx, sz).
  const sides = [
    [1, 0, 0, 1],
    [-1, 0, 0, -1],
    [0, 1, -1, 0],
    [0, -1, 1, 0],
  ];
  const y = GROUND_TOP + 0.02;
  for (const [dx, dz, sx, sz] of sides) {
    // Ground halo: a trapezoid from the inner square to the outer one.
    quad(
      [
        [dx! * inner - sx! * inner, y, dz! * inner - sz! * inner],
        [dx! * inner + sx! * inner, y, dz! * inner + sz! * inner],
        [dx! * outer + sx! * outer, y, dz! * outer + sz! * outer],
        [dx! * outer - sx! * outer, y, dz! * outer - sz! * outer],
      ],
      [0, 1, 0],
      [0, 0, 1, 1],
      0,
    );
    if (top > 0) {
      quad(
        [
          [dx! * wall - sx! * wall, GROUND_TOP, dz! * wall - sz! * wall],
          [dx! * wall + sx! * wall, GROUND_TOP, dz! * wall + sz! * wall],
          [dx! * wall + sx! * wall, GROUND_TOP + top, dz! * wall + sz! * wall],
          [dx! * wall - sx! * wall, GROUND_TOP + top, dz! * wall - sz! * wall],
        ],
        [dx!, 0, dz!],
        [0, 0, 1, 1],
        1,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute("aV", new THREE.Float32BufferAttribute(v, 1));
  geometry.setAttribute("aWall", new THREE.Float32BufferAttribute(isWall, 1));
  geometry.setIndex(index);
  return geometry;
}

/**
 * A tile's ground top (every base model's ground is 0.4 of its 4 units): the aura's halo and the placed cell's border lie
 * just above it, over the neighbours' ground and the tile's own, not under them.
 */
const GROUND_TOP = 0.4 * (TILE_SIZE / 4);

/** The veil's draw order: after the faces, before the outlines (1), so the outlines stay dark on top. */
const VEIL_ORDER = 0.5;
/** After every tile and veil: the aura adds light over what is drawn. */
const AURA_ORDER = 2;
/** The grid under the slots, the slots under the aura. */
const GRID_ORDER = -2;
const SLOT_ORDER = -1;

/** The same depth bias as the outlines: the veil lies exactly on the faces it covers. */
const VEIL_DEPTH_BIAS = { factor: -1, units: -4 } as const;

function createVeilMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth });
  material.polygonOffset = true;
  material.polygonOffsetFactor = VEIL_DEPTH_BIAS.factor;
  material.polygonOffsetUnits = VEIL_DEPTH_BIAS.units;
  return material;
}

/**
 * Turns a tile's model (a container of a model clone, which shares the type's geometry) into its veil: every mesh drawn
 * with `material`, its outlines dropped, no shadow. The geometry stays shared: only the clone's own objects change.
 */
export function veilOf(model: THREE.Object3D, material: THREE.Material): THREE.Object3D {
  const veil = model.clone();
  const outlines: THREE.Object3D[] = [];
  veil.traverse((child) => {
    if (isOutline(child)) outlines.push(child);
    else if (child instanceof THREE.Mesh) {
      child.material = material;
      child.castShadow = false;
      child.receiveShadow = false;
      child.renderOrder = VEIL_ORDER;
    }
  });
  for (const outline of outlines) outline.removeFromParent();
  veil.userData.veil = true;
  return veil;
}

/** The placed cell's border: drawn over the neighbours' features, as the aura is. */
function overlayFrame(): NeonFrameMaterial {
  const material = createNeonFrameMaterial();
  material.depthTest = false;
  return material;
}

/** A slot as the board gives it: grid coordinates, and whether the tile in hand fits it at the current rotation. */
export interface PlacementSlot {
  x: number;
  y: number;
  /** The current rotation fits here (solid border). Unset: it does (the old meaning of a lit slot). */
  fits?: boolean;
}

/** One effect's colour and its change: from `from` to `to`, started at `since`. */
interface ToneState {
  from: THREE.Color;
  to: THREE.Color;
  since: number;
  tone: PlacementTone;
}

/** What `update` reports: whether the next frame must be drawn (an effect still moves). */
export interface PlacementUpdate {
  animating: boolean;
}

/**
 * Draws the placement visuals: the grid, the slot cells, the placed tile's aura and veil, and the confirm's fade. It
 * owns its geometries and materials (one of each per kind, shared by every cell): `dispose` frees them. A tile's veil
 * shares the tile's geometry.
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
  private slotGeometry: THREE.BufferGeometry | null = null;
  private dashedMaterial: NeonFrameMaterial | null = null;
  private solidMaterial: NeonFrameMaterial | null = null;
  private slots: PlacementSlot[] = [];

  private auraGeometry: THREE.BufferGeometry | null = null;
  private ghostAura: AuraMaterial | null = null;
  private ghostVeil: THREE.MeshBasicMaterial | null = null;
  private ghostBorder: NeonFrameMaterial | null = null;
  private ghostTone: ToneState | null = null;
  /** The placed ghost's cell (grid), while it has an aura: its slot's own border is not drawn under it. */
  private ghostCell: { x: number; y: number } | null = null;
  private ghostAnimated = false;

  private confirmGroup: THREE.Group | null = null;
  private confirmAura: AuraMaterial | null = null;
  private confirmVeil: THREE.MeshBasicMaterial | null = null;
  private confirmBorder: NeonFrameMaterial | null = null;
  private confirmFrom = new THREE.Color();
  private confirmSince = 0;

  /** The zoom the lines were last set for. */
  private zoomKey = "";
  private fade = 1;
  private borderFade = 1;
  private outlines: Pick<OutlineSettings, "fadeOffFactor" | "fadeFullFactor"> = { fadeOffFactor: 0.85, fadeFullFactor: 1.15 };
  private zoom = { tilePx: Number.NaN, openingTilePx: Number.NaN, pixelRatio: 1 };

  /** `slotGroup`: where the slot cells go (the tile renderer's group of empty slots); unset, a group of its own. */
  constructor(slotGroup?: THREE.Group) {
    this.slotGroup = slotGroup ?? new THREE.Group();
    if (!slotGroup) this.group.add(this.slotGroup);
  }

  getSettings(): PlacementSettings {
    return this.settings;
  }

  /** New settings: every material set again, the aura's geometry rebuilt (its height and halo). */
  setSettings(settings: PlacementSettings, outlines?: Pick<OutlineSettings, "fadeOffFactor" | "fadeFullFactor">): void {
    this.settings = settings;
    if (outlines) this.outlines = { fadeOffFactor: outlines.fadeOffFactor, fadeFullFactor: outlines.fadeFullFactor };
    this.auraGeometry?.dispose();
    this.auraGeometry = null;
    this.slotGeometry?.dispose();
    this.slotGeometry = null;
    this.gridKey = "";
    this.zoomKey = "";
    this.applyZoom();
    this.rebuildSlots();
  }

  /** Reduced motion: still aura, instant colours, a short confirm. */
  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  isReducedMotion(): boolean {
    return this.reduced;
  }

  /** The placed tiles' cells (grid coordinates): the grid is drawn around them. */
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
    const material = (this.gridMaterial ??= this.createGridMaterial());
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

  /** The legal slots of the tile in hand (any rotation), with whether the current rotation fits each. */
  setSlots(slots: ReadonlyArray<PlacementSlot>): void {
    this.slots = slots.slice();
    this.rebuildSlots();
  }

  private rebuildSlots(): void {
    this.slotGroup.clear();
    if (!this.settings.slots.enabled || this.slots.length === 0) return;
    const geometry = (this.slotGeometry ??= this.frameGeometry(this.settings.slots.glow));
    const dashed = (this.dashedMaterial ??= createNeonFrameMaterial());
    const solid = (this.solidMaterial ??= createNeonFrameMaterial());
    this.applySlots();
    for (const slot of this.slots) {
      if (this.ghostCell && this.ghostCell.x === slot.x && this.ghostCell.y === slot.y) continue;
      const mesh = new THREE.Mesh(geometry, slot.fits === false ? dashed : solid);
      mesh.position.set(slot.x * TILE_SIZE, 0.02, slot.y * TILE_SIZE);
      mesh.scale.set(TILE_SIZE, 1, TILE_SIZE);
      mesh.renderOrder = SLOT_ORDER;
      mesh.userData.slot = { x: slot.x, y: slot.y, fits: slot.fits !== false };
      this.slotGroup.add(mesh);
    }
  }

  /** A frame's quad in cell units (the shader reads them): a cell and its halo's margin. Its mesh is scaled to the tile. */
  private frameGeometry(margin: number): THREE.BufferGeometry {
    return createNeonFrameGeometry(margin);
  }

  /**
   * Dresses a ghost (a container holding the tile's model at its cell): the veil over it, and, when `placed`, the aura
   * and the cell's solid border. `fits` picks the tone (`placementTone`); a change of tone runs over `motion.colorMs`.
   */
  dressGhost(container: THREE.Object3D, model: THREE.Object3D | null, cell: { x: number; y: number }, placed: boolean, fits: boolean, now: number): void {
    const tone = placementTone(fits);
    const target = new THREE.Color(this.settings.colors[tone]);
    if (!this.ghostTone) this.ghostTone = { from: target.clone(), to: target.clone(), since: now, tone };
    else if (this.ghostTone.tone !== tone) {
      this.ghostTone = { from: this.currentGhostColor(now), to: target, since: now, tone };
    } else this.ghostTone.to.copy(target);
    const veil = (this.ghostVeil ??= createVeilMaterial());
    if (model) container.add(veilOf(model, veil));
    this.ghostAnimated = placed && this.settings.aura.enabled;
    const before = this.ghostCell;
    this.ghostCell = placed ? { x: cell.x, y: cell.y } : null;
    if (placed && this.settings.aura.enabled) {
      const aura = (this.ghostAura ??= createAuraMaterial());
      const border = (this.ghostBorder ??= overlayFrame());
      this.addAura(container, aura, border);
    }
    if (before?.x !== this.ghostCell?.x || before?.y !== this.ghostCell?.y) this.rebuildSlots();
    this.applyGhost(now);
  }

  /** The placed ghost moved to another cell (same tile, same tone): its slot's border is drawn again, the new one's not. */
  setGhostCell(cell: { x: number; y: number } | null): void {
    if (this.ghostCell?.x === cell?.x && this.ghostCell?.y === cell?.y) return;
    this.ghostCell = cell && { x: cell.x, y: cell.y };
    this.rebuildSlots();
  }

  /** No ghost: the tone is forgotten, so the next one starts at its own colour. */
  clearGhost(): void {
    this.ghostTone = null;
    this.ghostAnimated = false;
    if (this.ghostCell) {
      this.ghostCell = null;
      this.rebuildSlots();
    }
  }

  /**
   * The confirm at a cell: `container` holds the tile's model there (the placed tile is drawn by the board now); its veil
   * and aura turn green from the ghost's colour and fade out, then go. Null: none.
   */
  startConfirm(container: THREE.Object3D | null, model: THREE.Object3D | null, now: number): void {
    if (this.confirmGroup) {
      this.group.remove(this.confirmGroup);
      this.confirmGroup = null;
    }
    if (!container) return;
    this.confirmFrom.copy(this.ghostTone ? this.currentGhostColor(now) : new THREE.Color(this.settings.colors.yellow));
    this.confirmSince = now;
    const veil = (this.confirmVeil ??= createVeilMaterial());
    if (model) container.add(veilOf(model, veil));
    if (this.settings.aura.enabled) this.addAura(container, (this.confirmAura ??= createAuraMaterial()), (this.confirmBorder ??= overlayFrame()));
    container.userData.confirm = true;
    this.confirmGroup = new THREE.Group();
    this.confirmGroup.add(container);
    this.group.add(this.confirmGroup);
    this.applyConfirm(now);
  }

  private addAura(container: THREE.Object3D, aura: AuraMaterial, border: NeonFrameMaterial): void {
    const geometry = (this.auraGeometry ??= createAuraGeometry(this.settings.aura.height, this.settings.aura.halo));
    const mesh = new THREE.Mesh(geometry, aura);
    mesh.renderOrder = AURA_ORDER;
    mesh.userData.aura = true;
    container.add(mesh);
    const frame = new THREE.Mesh((this.slotGeometry ??= this.frameGeometry(this.settings.slots.glow)), border);
    frame.position.y = GROUND_TOP + 0.025;
    frame.scale.set(TILE_SIZE, 1, TILE_SIZE);
    frame.renderOrder = AURA_ORDER;
    frame.userData.auraBorder = true;
    container.add(frame);
  }

  /** The zoom: the lines' fade (OUT-FADE's curve) and the dashes follow the tile's size on screen. */
  setZoom(tilePx: number, openingTilePx: number, pixelRatio: number): void {
    this.zoom = { tilePx, openingTilePx, pixelRatio };
    this.applyZoom();
  }

  private applyZoom(): void {
    const { tilePx, openingTilePx, pixelRatio } = this.zoom;
    const key = `${tilePx},${openingTilePx},${pixelRatio}`;
    if (key === this.zoomKey) return;
    this.zoomKey = key;
    const known = tilePx > 0 && openingTilePx > 0;
    this.fade = known ? placementFade(tilePx, openingTilePx, this.outlines) : 1;
    this.borderFade = known ? placementFade(tilePx, openingTilePx, this.outlines, this.settings.slots.fadeFloor) : 1;
    this.applyGrid();
    this.applySlots();
  }

  private applyGrid(): void {
    const material = this.gridMaterial;
    if (!material) return;
    const { grid } = this.settings;
    material.uniforms.color.value.set(grid.color);
    material.uniforms.opacity.value = grid.opacity * this.fade;
    material.uniforms.lineWidth.value = grid.width;
    material.uniforms.minPx.value = grid.minWidthDevicePx;
    if (this.gridMesh) this.gridMesh.visible = grid.enabled && this.fade > 0 && this.gridKey !== "";
  }

  private applySlots(): void {
    const { slots, colors, grid } = this.settings;
    const dashBlend = Number.isFinite(this.zoom.tilePx) ? slotDashBlend(this.zoom.tilePx, slots) : 0;
    const common = {
      color: colors.yellow,
      opacity: this.borderFade,
      lineWidth: slots.width,
      glowWidth: slots.glow,
      minPx: grid.minWidthDevicePx,
      glowIntensity: slots.glowIntensity,
      fillOpacity: slots.fillOpacity,
      gap: slots.gap,
      dashBlend,
    };
    if (this.dashedMaterial) setNeonFrame(this.dashedMaterial, { ...common, intensity: slots.intensity, dashed: true });
    if (this.solidMaterial) setNeonFrame(this.solidMaterial, { ...common, intensity: slots.fitIntensity, dashed: false });
  }

  private currentGhostColor(now: number): THREE.Color {
    const tone = this.ghostTone;
    if (!tone) return new THREE.Color(this.settings.colors.yellow);
    const t = colorProgress(now - tone.since, this.settings.motion, this.reduced);
    return tone.from.clone().lerp(tone.to, t);
  }

  private applyGhost(now: number): void {
    const color = this.currentGhostColor(now);
    this.applyEffects(color, 1, now, this.ghostVeil, this.ghostAura, this.ghostBorder);
  }

  private applyConfirm(now: number): boolean {
    const { color, opacity, done } = confirmProgress(now - this.confirmSince, this.settings.motion, this.reduced);
    const green = new THREE.Color(this.settings.colors.green);
    this.applyEffects(this.confirmFrom.clone().lerp(green, color), opacity, now, this.confirmVeil, this.confirmAura, this.confirmBorder);
    return done;
  }

  private applyEffects(color: THREE.Color, opacity: number, now: number, veil: THREE.MeshBasicMaterial | null, aura: AuraMaterial | null, border: NeonFrameMaterial | null): void {
    const { veil: veilSettings, aura: auraSettings, slots, grid } = this.settings;
    if (veil) {
      // The colour is linear (`THREE.Color.set` converts the CSS sRGB); a pale veil is that colour towards white.
      veil.color.copy(color).lerp(new THREE.Color(1, 1, 1), veilSettings.whiten);
      veil.opacity = veilSettings.opacity * opacity;
      veil.visible = veil.opacity > 0;
    }
    if (aura) {
      aura.uniforms.color.value.copy(color);
      aura.uniforms.opacity.value = opacity;
      aura.uniforms.intensity.value = auraSettings.intensity;
      aura.uniforms.waves.value = auraSettings.waves;
      aura.uniforms.waveAmount.value = auraSettings.waveAmount;
      aura.uniforms.phase.value = this.reduced || !(auraSettings.periodMs > 0) ? 0 : (now % auraSettings.periodMs) / auraSettings.periodMs;
    }
    if (border) {
      setNeonFrame(border, {
        opacity: opacity * this.borderFade,
        lineWidth: slots.width,
        glowWidth: slots.glow,
        minPx: grid.minWidthDevicePx,
        intensity: auraSettings.borderIntensity,
        glowIntensity: slots.glowIntensity,
        fillOpacity: 0,
        dashed: false,
      });
      border.uniforms.color.value.copy(color);
    }
  }

  /**
   * Moves the effects to `now` (ms, `performance.now()`): the colour changes, the waves, the confirm's fade. True while
   * one still moves, so the scene draws the next frame; false when nothing does (render on demand holds).
   */
  update(now: number): PlacementUpdate {
    let animating = false;
    if (this.ghostTone) {
      this.applyGhost(now);
      const changing = !this.reduced && now - this.ghostTone.since < this.settings.motion.colorMs;
      animating ||= changing || (this.ghostAnimated && !this.reduced && this.settings.aura.periodMs > 0);
    }
    if (this.confirmGroup) {
      if (this.applyConfirm(now)) {
        this.group.remove(this.confirmGroup);
        this.confirmGroup = null;
      }
      // One more frame after the end draws it gone.
      animating = true;
    }
    return { animating };
  }

  /** The confirm's effects are on screen. */
  isConfirming(): boolean {
    return this.confirmGroup !== null;
  }

  private createGridMaterial(): GridMaterial {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          color: { value: new THREE.Color() },
          opacity: { value: 1 },
          lineWidth: { value: 0.012 },
          minPx: { value: 1 },
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

  dispose(): void {
    this.group.clear();
    this.slotGroup.clear();
    this.confirmGroup = null;
    this.gridMesh = null;
    this.gridGeometry?.dispose();
    this.gridGeometry = null;
    this.gridMaterial?.dispose();
    this.gridMaterial = null;
    this.gridTexture?.dispose();
    this.gridTexture = null;
    this.gridKey = "";
    this.slotGeometry?.dispose();
    this.slotGeometry = null;
    this.auraGeometry?.dispose();
    this.auraGeometry = null;
    for (const material of [this.dashedMaterial, this.solidMaterial, this.ghostAura, this.ghostVeil, this.ghostBorder, this.confirmAura, this.confirmVeil, this.confirmBorder]) material?.dispose();
    this.dashedMaterial = this.solidMaterial = this.ghostBorder = this.confirmBorder = null;
    this.ghostAura = this.confirmAura = null;
    this.ghostVeil = this.confirmVeil = null;
    this.ghostTone = null;
    this.ghostCell = null;
    this.slots = [];
  }
}
