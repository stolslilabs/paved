import * as THREE from "three";
import { VOXEL_SIZE, outlineFadeOf, type OutlineFadeSettings } from "./outlines";
import { TILE_SIZE } from "./types";

/**
 * The placement visuals (SLOTS, P-68; SLOTS2, P-72; PLATES, P-74; PLACEMENT-TINTS): a plate on every slot of the tile in
 * hand, and the tile in hand tinted on its cell.
 *
 * - The plates: flat (a rounded rectangle at the tiles' bottom, level with the foot of the models around it, no side
 *   faces, no bevel), inset in their cell so two neighbouring plates never touch, sized in voxels. Two states
 *   (`plateStateOf`), one grey with no hue (#588, the owner's: it fits every UI style and backdrop) told apart by opacity
 *   alone: playable (some rotation fits there) a little less transparent, invalid (no rotation fits) more transparent.
 *   One instance of one mesh each: a single draw call for any number of slots. A plate under the tile in hand fades out
 *   (`plates.hideUnderTile`).
 * - The tile in hand is tinted on the model itself (`TileRenderer` draws it, this class owns the states and their ease):
 *   a hover preview has no tint at 50 % opacity (#568: the blue is gone, its colour and strength stay as knobs), a tile
 *   placed and not confirmed (pending) opaque (100 %) with a faint yellow that keeps the tile's light (#605: 0.12 of the
 *   hue, it was 0.4 of the colour and read as a yellow filter), a confirm a temporary green that fades to no tint on the tile the board now draws. There is no red: the
 *   board offers only the rotations that fit (#544).
 * - The pending look's other knobs (#605's proposals, off by default): a slow breathing of the tint (`tints.pendingPulseMs`,
 *   from 0 to `pendingStrength` and back; the faint tint held under reduced motion), a gold frame on the tile's top edges
 *   (`tints.pendingEdge*`, drawn by `TileRenderer` with the outlines' stroke), and the plate under the tile in gold, a
 *   little wider than the tile so its rim shows around it (`plates.pending*`).
 * - Each change of state eases over `motion.colorMs` (150 ms); under reduced motion it is instant and the confirm short.
 * - The grid (SLOTS2's ring hairlines) stays as a setting, off by default (`grid.enabled`).
 */
export interface PlacementSettings {
  /** The plates' colour, CSS hex, one grey for both states (the app's token: plate); the states differ by opacity. */
  colors: { plate: string };
  /** The tile in hand's tints: a colour, how far the model goes to it (0 to 1) and the model's opacity, per state. */
  tints: {
    hoverColor: string;
    hoverStrength: number;
    hoverOpacity: number;
    /** The ease into the hover look, ms (under reduced motion: at once). */
    hoverMs: number;
    pendingColor: string;
    pendingStrength: number;
    pendingOpacity: number;
    /** The ease into the pending look, ms. */
    pendingMs: number;
    /**
     * The pending tint keeps each pixel's brightness, only its hue goes to `pendingColor` (#605: a fixed gold over a tile
     * lit by night read as a yellow filter); off, the pixel goes to the colour itself, as the confirm's does.
     */
    pendingKeepsLight: boolean;
    /** The pending tint breathes from 0 to `pendingStrength` and back over this many ms; 0: held. Held under reduced motion. */
    pendingPulseMs: number;
    /** The frame on the pending tile's top edges: its colour, opacity (0: none) and width (a multiple of the outlines'). */
    pendingEdgeColor: string;
    pendingEdgeOpacity: number;
    pendingEdgeWidth: number;
    /** The confirm: the tint at its start, fading to none; the opacity is the overlay's at its start. */
    confirmColor: string;
    confirmStrength: number;
    confirmOpacity: number;
    /** (The confirm's ease is its fade: `motion.confirmMs`.) */
  };
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
    /** The corners' radius, seen from above. */
    radius: number;
    /** A playable plate's opacity. */
    opacity: number;
    /** An invalid plate's opacity: more transparent, the one thing that tells it from a playable plate. */
    invalidOpacity: number;
    /** The plate under the tile in hand (hover or placed) fades out; off, it stays. */
    hideUnderTile: boolean;
    /** The plate under a pending tile: its colour and opacity (0: hidden as under a hover), whatever `hideUnderTile` says. */
    pendingColor: string;
    pendingOpacity: number;
    /** How far it reaches past the tile's edges, voxels, so its rim shows around the tile; within the gap (`pendingPlateScale`). */
    pendingOutset: number;
  };
  motion: {
    /** A change of a plate's state (a rotation, a slot chosen), ms; the tile's tints have their own (`tints.*Ms`). */
    colorMs: number;
    /** The confirm's green tint fading out, ms. */
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
  colors: { plate: "#c8c8c8" },
  tints: {
    hoverColor: "#4f8dff",
    hoverStrength: 0,
    hoverOpacity: 0.5,
    hoverMs: 150,
    pendingColor: "#f0bf5b",
    pendingStrength: 0.12,
    pendingOpacity: 1,
    pendingMs: 150,
    pendingKeepsLight: true,
    pendingPulseMs: 0,
    pendingEdgeColor: "#f0bf5b",
    pendingEdgeOpacity: 0,
    pendingEdgeWidth: 2,
    confirmColor: "#6eca6f",
    confirmStrength: 0.6,
    confirmOpacity: 1,
  },
  grid: { enabled: false, color: "#d1d9df", opacity: 0.32, rings: [1, 0.5, 0.1], widthDevicePx: 1, farFade: false, farFadeStart: 1 },
  plates: { enabled: true, gap: 4, radius: 3, opacity: 0.55, invalidOpacity: 0.2, hideUnderTile: true, pendingColor: "#f0bf5b", pendingOpacity: 0, pendingOutset: 1.5 },
  motion: { colorMs: 150, confirmMs: 700, reducedConfirmMs: 150, reducedMotion: "auto" },
};

/** `input` over `base`, group by group. */
export function resolvePlacementSettings(input: PlacementSettingsInput = {}, base = DEFAULT_PLACEMENT_SETTINGS): PlacementSettings {
  return {
    colors: { ...base.colors, ...input.colors },
    tints: { ...base.tints, ...input.tints },
    grid: { ...base.grid, ...input.grid },
    plates: { ...base.plates, ...input.plates },
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

/** A plate's state for the tile in hand: some rotation fits there (playable), or none does (invalid). */
export type PlateState = "playable" | "invalid";

/** The tile in hand's look: hovering a cell, or placed there and waiting for confirmation (pending). */
export type TintKind = "hover" | "pending";

/**
 * The tile in hand's tint at a moment: a linear rgb colour, how far the model goes to it, the model's opacity, and the
 * opacity of the frame on its top edges (`tints.pendingEdgeOpacity`; 0 but pending).
 */
export interface GhostTint {
  r: number;
  g: number;
  b: number;
  strength: number;
  opacity: number;
  edge: number;
}

const tintOf = (color: string, strength: number, opacity: number, edge = 0): GhostTint => {
  const c = new THREE.Color(color);
  return { r: c.r, g: c.g, b: c.b, strength: clamp01(strength), opacity: clamp01(opacity), edge: clamp01(edge) };
};

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The ease into a state's look, ms (`tints.*Ms`). */
export function tintEaseMs(kind: TintKind, tints: PlacementSettings["tints"]): number {
  return kind === "hover" ? tints.hoverMs : tints.pendingMs;
}

/** The tint of a state, from the settings. */
export function tintForKind(kind: TintKind, tints: PlacementSettings["tints"]): GhostTint {
  if (kind === "hover") return tintOf(tints.hoverColor, tints.hoverStrength, tints.hoverOpacity);
  return tintOf(tints.pendingColor, tints.pendingStrength, tints.pendingOpacity, tints.pendingEdgeOpacity);
}

/**
 * The pending tint's breath at `elapsed` ms since the tile was placed (`tints.pendingPulseMs`): the share of
 * `pendingStrength`, from 0 up to 1 and back over each period, slow at both ends. 1 (held) with no period.
 */
export function pendingPulse(elapsed: number, periodMs: number): number {
  if (!(periodMs > 0) || !Number.isFinite(elapsed)) return 1;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * Math.max(0, elapsed)) / periodMs);
}

/**
 * The scale of the plate under a pending tile, seen from above: from its inset size to the tile's plus `pendingOutset`
 * on each side, the outset kept half a voxel inside the gap so it never reaches a neighbouring plate.
 */
export function pendingPlateScale(plates: Pick<PlacementSettings["plates"], "gap" | "radius" | "pendingOutset">): number {
  const shape = plateShapeOf(plates);
  const gap = (TILE_SIZE - shape.size) / VOXEL_SIZE;
  const outset = Math.min(Math.max(0, gap / 2 - 0.5), Math.max(0, Number.isFinite(plates.pendingOutset) ? plates.pendingOutset : 0));
  return (TILE_SIZE + 2 * outset * VOXEL_SIZE) / shape.size;
}

/** Which look the tile in hand has: pending once placed, else hover. */
export function tintKindOf(ghost: { placed: boolean }): TintKind {
  return ghost.placed ? "pending" : "hover";
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
 * The confirm at `elapsed` ms: how much of the green tint is left (1 to 0, a smoothstep, slow at both ends). Under
 * reduced motion the fade is short.
 */
export function confirmProgress(elapsed: number, motion: PlacementSettings["motion"], reduced: boolean): { opacity: number; done: boolean } {
  const duration = Math.max(1, reduced ? motion.reducedConfirmMs : motion.confirmMs);
  const t = Math.min(1, Math.max(0, elapsed / duration));
  return { opacity: t >= 1 ? 0 : 1 - t * t * (3 - 2 * t), done: t >= 1 };
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
  radius: number;
}

/** The plates' settings as world units, each bounded: the gap within `PLATE_GAP_VOXELS`, the radius within the plate. */
export function plateShapeOf(plates: Pick<PlacementSettings["plates"], "gap" | "radius">): PlateShape {
  const gap = Math.min(PLATE_GAP_VOXELS.max, Math.max(PLATE_GAP_VOXELS.min, Number.isFinite(plates.gap) ? plates.gap : PLATE_GAP_VOXELS.min));
  const size = TILE_SIZE - gap * VOXEL_SIZE;
  const radius = Math.min(size / 2, Math.max(0, (plates.radius || 0) * VOXEL_SIZE));
  return { size, radius };
}

/** Points along each of a plate's corners. */
const CORNER_SEGMENTS = 6;

/**
 * A plate, centred on its cell, flat at y 0: a rounded square seen from above, one face looking up, nothing else (no side,
 * no bottom, no thickness).
 */
export function createPlateGeometry(shape: PlateShape): THREE.BufferGeometry {
  const half = shape.size / 2;
  const r = shape.radius;
  const position: number[] = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const cx = (k === 0 || k === 3 ? 1 : -1) * (half - r);
    const cz = (k < 2 ? 1 : -1) * (half - r);
    for (let s = 0; s <= CORNER_SEGMENTS; s++) {
      const phi = k * (Math.PI / 2) + (s / CORNER_SEGMENTS) * (Math.PI / 2);
      position.push(cx + r * Math.cos(phi), 0, cz + r * Math.sin(phi));
    }
  }
  const n = (position.length - 3) / 3;
  const normal: number[] = [];
  for (let i = 0; i <= n; i++) normal.push(0, 1, 0);
  const index: number[] = [];
  // A fan from the centre, counter-clockwise from +x towards +z seen from below: facing up needs the reverse order.
  for (let j = 0; j < n; j++) index.push(0, 1 + ((j + 1) % n), 1 + j);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setIndex(index);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The plates' material: lit like the tiles (so the day and night cycle and the shadows reach them), coloured and faded
 * per instance (`instanceColor`, `aOpacity`).
 */
function createPlateMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float aOpacity;\nvarying float vPlateOpacity;\n${shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vPlateOpacity = aOpacity;")}`;
    shader.fragmentShader = `varying float vPlateOpacity;\n${shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.a *= vPlateOpacity;")}`;
  };
  material.customProgramCacheKey = () => "paved-plate";
  return material;
}

/** The grid under the plates. */
const GRID_ORDER = -2;
const PLATE_ORDER = -1;

/**
 * The plates and the grid lie at the tiles' bottom (#588: a model's foot is at y 0, `TileRenderer`), lifted a twentieth
 * of a voxel so they never share a depth with a model's bottom face. Nothing else is drawn at that level: a plate is
 * inset in its own cell (no neighbour's foot under it), and the tile in hand's own foot is under its ground.
 */
export const PLATE_Y = 0.05 * VOXEL_SIZE;

/** A slot as the board gives it: grid coordinates, and whether some rotation of the tile in hand fits it at all. */
export interface PlacementSlot {
  x: number;
  y: number;
  /** Some rotation fits here. False: an invalid plate (more transparent). Unset: it does. */
  legal?: boolean;
}

/** A slot's plate state. */
export function plateStateOf(slot: Pick<PlacementSlot, "legal">): PlateState {
  return slot.legal === false ? "invalid" : "playable";
}

/** One plate's eased values: its colour (linear rgb), its opacity and its scale seen from above. */
const VALUES = 5;
const OPACITY = 3;
const SCALE = 4;

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

const tintValues = (t: GhostTint) => [t.r, t.g, t.b, t.strength, t.opacity, t.edge];

/** The tint's strength among `tintValues`. */
const STRENGTH = 3;

/**
 * Draws the placement visuals: the grid, the plates, and owns the tile in hand's tint states and their ease (the tile
 * itself is `TileRenderer`'s). It owns its geometry and material (one instanced mesh for all the plates): `dispose` frees them.
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

  private slots: PlacementSlot[] = [];
  private plates = new Map<string, PlateEntry>();
  /** The tile in hand's cell and look; null with no tile drawn on the board. */
  private ghost: { x: number; y: number; kind: TintKind } | null = null;
  /** The tint eases from `from` to `to` (six numbers: rgb, strength, opacity, edge) since `since`. */
  /** The tint's final look has been drawn (a frame follows the tick that reached it). */
  private tintDrawn = true;
  private tint = { from: tintValues(tintForKind("hover", DEFAULT_PLACEMENT_SETTINGS.tints)), to: tintValues(tintForKind("hover", DEFAULT_PLACEMENT_SETTINGS.tints)), since: Number.NEGATIVE_INFINITY, ms: DEFAULT_PLACEMENT_SETTINGS.tints.hoverMs };
  private confirm: { x: number; y: number; since: number } | null = null;
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

  /** New settings: the plate geometry rebuilt (its shape), every plate's target and the tint's set again at once. */
  setSettings(settings: PlacementSettings, outlines?: OutlineFadeSettings): void {
    this.settings = settings;
    if (outlines) this.outlines = { fadeOffFactor: outlines.fadeOffFactor, fadeFullFactor: outlines.fadeFullFactor, fadeExponent: outlines.fadeExponent, fadeEasedEnd: outlines.fadeEasedEnd };
    this.shape = plateShapeOf(settings.plates);
    this.plateGeometry?.dispose();
    this.plateGeometry = null;
    this.disposeMeshes();
    this.gridKey = "";
    this.applyZoom();
    for (const entry of this.plates.values()) {
      entry.to = this.targetOf(entry);
      entry.from = entry.to.slice();
    }
    if (this.ghost) {
      this.tint.to = tintValues(tintForKind(this.ghost.kind, settings.tints));
      this.tint.from = this.tint.to.slice();
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
    this.gridMesh.position.set((field.minX + (field.width - 1) / 2) * TILE_SIZE, PLATE_Y, (field.minY + (field.height - 1) / 2) * TILE_SIZE);
    this.applyGrid();
  }

  /** Every slot of the tile in hand with its state (`plateStateOf`): a plate on each, easing in, out and between states. */
  setSlots(slots: ReadonlyArray<PlacementSlot>, now: number = performance.now()): void {
    this.slots = slots.slice();
    this.syncPlates(now);
  }

  /**
   * The tile in hand drawn on a cell (null: none): its look is hover or pending (`tintKindOf`), easing over
   * `motion.colorMs` from the last one while it stays drawn; a tile newly drawn starts at its look.
   */
  setGhost(ghost: { x: number; y: number; kind: TintKind } | null, now: number = performance.now()): void {
    const before = this.ghost;
    if (before?.x === ghost?.x && before?.y === ghost?.y && before?.kind === ghost?.kind) return;
    this.ghost = ghost && { x: ghost.x, y: ghost.y, kind: ghost.kind };
    if (ghost) {
      const to = tintValues(tintForKind(ghost.kind, this.settings.tints));
      this.tint.from = before ? this.ghostTint(now) : to.slice();
      this.tint.to = to;
      this.tint.since = now;
      // Instant under reduced motion: drawn with the change itself.
      this.tintDrawn = this.reduced;
      // Each look has its own ease: the one it eases into.
      this.tint.ms = tintEaseMs(ghost.kind, this.settings.tints);
    }
    this.syncPlates(now);
  }

  /** The tile in hand's cell and look, while there is one. */
  getGhost(): { x: number; y: number; kind: TintKind } | null {
    return this.ghost;
  }

  private tintProgress(now: number): number {
    return Number.isFinite(now) ? colorProgress(now - this.tint.since, { ...this.settings.motion, colorMs: this.tint.ms }, this.reduced) : 1;
  }

  /** The tile in hand's tint at `now` (NaN: its target), eased, breathing while pending; the last one while no tile is drawn. */
  ghostTint(now: number = performance.now()): number[] {
    const t = this.tintProgress(now);
    const tint = this.tint.from.map((v, i) => v + (this.tint.to[i]! - v) * t);
    if (this.isPulsing() && Number.isFinite(now)) tint[STRENGTH]! *= pendingPulse(now - this.tint.since, this.settings.tints.pendingPulseMs);
    return tint;
  }

  /** The pending tint breathes: a tile placed, a period set, and no reduced motion (the faint tint held then). */
  isPulsing(): boolean {
    return this.ghost?.kind === "pending" && this.settings.tints.pendingPulseMs > 0 && !this.reduced;
  }

  /**
   * The confirm at a cell (the board draws the tile now): a green tint over it, fading to none. Null: none. The overlay
   * is `TileRenderer`'s; this class times it (`confirmTint`).
   */
  startConfirm(cell: { x: number; y: number } | null, now: number = performance.now()): void {
    this.confirm = cell && { x: cell.x, y: cell.y, since: now };
  }

  /** The confirm's tint at `now`, fading out (the opacity is the overlay's, 1 at the start); null with none. */
  confirmTint(now: number = performance.now()): { tint: GhostTint; x: number; y: number; done: boolean } | null {
    const confirm = this.confirm;
    if (!confirm) return null;
    const { tints } = this.settings;
    const { opacity, done } = confirmProgress(Number.isFinite(now) ? now - confirm.since : 0, this.settings.motion, this.reduced);
    const base = tintOf(tints.confirmColor, tints.confirmStrength, tints.confirmOpacity);
    return { tint: { ...base, opacity: base.opacity * opacity }, x: confirm.x, y: confirm.y, done };
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

  /** The plates of `slots`: new ones ease in, gone ones out, changed ones to their state. */
  private syncPlates(now: number): void {
    const wanted = new Map<string, PlateState>();
    for (const slot of this.slots) wanted.set(cellKey(slot.x, slot.y), plateStateOf(slot));
    // A tile drawn where no slot was given still stands on its plate (which then hides under it, or not).
    if (this.ghost && !wanted.has(cellKey(this.ghost.x, this.ghost.y))) wanted.set(cellKey(this.ghost.x, this.ghost.y), "playable");
    for (const [key, entry] of this.plates) {
      if (wanted.has(key) || entry.leaving) continue;
      entry.from = this.current(entry, now);
      entry.to = entry.from.slice();
      entry.to[OPACITY] = 0;
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
        // A new plate eases in from nothing, in its own colour.
        fresh.from = fresh.to.slice();
        fresh.from[OPACITY] = 0;
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

  /**
   * A plate's values for its state: hidden under the tile in hand when `plates.hideUnderTile`; under a pending tile, gold
   * and wider than the tile when `plates.pendingOpacity` is set.
   */
  private targetOf(entry: Pick<PlateEntry, "x" | "y" | "state">): Float32Array {
    const { colors, plates } = this.settings;
    const under = this.ghost !== null && this.ghost.x === entry.x && this.ghost.y === entry.y;
    const values = new Float32Array(VALUES);
    values[SCALE] = 1;
    if (under && this.ghost!.kind === "pending" && plates.enabled && plates.pendingOpacity > 0) {
      const gold = new THREE.Color(plates.pendingColor);
      values.set([gold.r, gold.g, gold.b, clamp01(plates.pendingOpacity), pendingPlateScale(plates)], 0);
      return values;
    }
    const covered = plates.hideUnderTile && under;
    const plate = new THREE.Color(colors.plate);
    values.set([plate.r, plate.g, plate.b], 0);
    values[OPACITY] = plates.enabled && !covered ? (entry.state === "invalid" ? plates.invalidOpacity : plates.opacity) : 0;
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

  private ensureMesh(plates: number): THREE.InstancedMesh {
    if (!this.plateMesh || this.plateMesh.instanceMatrix.count < plates) {
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
    return this.plateMesh;
  }

  /** Writes every plate instance at `now` (NaN: their targets). */
  private writeInstances(now: number): void {
    if (!this.dirty) return;
    this.dirty = false;
    const entries = [...this.plates.values()];
    if (entries.length === 0 && !this.plateMesh) return;
    const plate = this.ensureMesh(entries.length);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Matrix4();
    const color = new THREE.Color();
    const opacity = plate.geometry.getAttribute("aOpacity") as THREE.InstancedBufferAttribute;
    entries.forEach((entry, i) => {
      const v = this.current(entry, now);
      entry.settled = this.progress(entry, now) >= 1;
      matrix.makeTranslation(entry.x * TILE_SIZE, PLATE_Y, entry.y * TILE_SIZE).multiply(scale.makeScale(v[SCALE]!, 1, v[SCALE]!));
      plate.setMatrixAt(i, matrix);
      plate.setColorAt(i, color.setRGB(v[0]!, v[1]!, v[2]!));
      opacity.setX(i, v[OPACITY]!);
    });
    plate.count = entries.length;
    plate.instanceMatrix.needsUpdate = true;
    if (plate.instanceColor) plate.instanceColor.needsUpdate = true;
    opacity.needsUpdate = true;
    plate.visible = plate.count > 0;
  }

  /**
   * Moves the effects to `now` (ms, `performance.now()`): the plates' easing, the tint's, the confirm's fade. True while
   * one still moves, so the scene draws the next frame; false when nothing does (render on demand holds).
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
    if (this.tintProgress(now) < 1 || this.isPulsing()) {
      animating = true;
      this.tintDrawn = false;
    } else if (!this.tintDrawn) {
      // Reached after its end (a late tick): one more frame draws the final tint.
      animating = true;
      this.tintDrawn = true;
    }
    if (this.confirm) {
      // One more frame after the end draws it gone.
      animating = true;
      if (this.confirmTint(now)!.done) this.confirm = null;
    }
    this.writeInstances(now);
    return { animating };
  }

  /** The confirm's tint is on screen. */
  isConfirming(): boolean {
    return this.confirm !== null;
  }

  /** The plates' instanced mesh (null before the first slot), for tests and tools. */
  getPlateMesh(): THREE.InstancedMesh | null {
    return this.plateMesh;
  }

  private disposeMeshes(): void {
    this.plateMesh?.removeFromParent();
    this.plateMesh?.dispose();
    this.plateMesh = null;
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
    this.plateMaterial?.dispose();
    this.plateMaterial = null;
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
