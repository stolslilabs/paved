/**
 * The fog of war's settings and its reveal logic (FOG-STUDY): a fog over the whole scene but the placed tiles and the free slots
 * around them, or, in a PvP village, the owned cells and the cells next to them. No three here: the cells, the lift of a cell
 * (`RevealTransition`) and the field the fog's shader reads (`buildRevealField`) are plain numbers, tested as they are. The board
 * does not call the fog: the stories (`Renderer/Fog of war`) hand these to `FogOfWar` (`fog-of-war.ts`, a chunk of its own,
 * `loadFogOfWar`) so the owner can judge it first.
 *
 * Cells are the grid's (`TileRenderData.worldX` and `worldZ`): a cell's centre is at `x * TILE_SIZE, z * TILE_SIZE` in the world,
 * its square one `TILE_SIZE` across. Distances in the field are in cells.
 */
import type { DeepPartial } from "./weather-settings";

/** A grid cell: `x` the world's x, `y` the world's z, in cells (`TileRenderData.worldX`, `worldZ`). */
export interface FogCell {
  x: number;
  y: number;
}

/** The four cells next to a cell, the board's neighbours (a tile goes next to a tile, a village cell next to an owned one). */
export const FOG_NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The most cells a PvP village owns, bought one by one. */
export const VILLAGE_MAX_CELLS = 38;

export const cellKey = (x: number, y: number): string => `${x},${y}`;

/** The empty cells next to a tile: where a tile could go next. Each once, in the order the tiles give them. */
export function freeSlots(tiles: Iterable<FogCell>): FogCell[] {
  const list = [...tiles];
  const taken = new Set(list.map((t) => cellKey(t.x, t.y)));
  const slots = new Map<string, FogCell>();
  for (const t of list) {
    for (const [dx, dy] of FOG_NEIGHBOURS) {
      const key = cellKey(t.x + dx, t.y + dy);
      if (!taken.has(key) && !slots.has(key)) slots.set(key, { x: t.x + dx, y: t.y + dy });
    }
  }
  return [...slots.values()];
}

/** The board's revealed cells: the placed tiles and the free slots next to them. */
export function boardReveal(tiles: Iterable<FogCell>): FogCell[] {
  const list = uniqueCells(tiles);
  return [...list, ...freeSlots(list)];
}

/**
 * A PvP village's revealed cells: the owned cells and the cells next to them (the ones that can be bought). Throws past
 * `VILLAGE_MAX_CELLS` owned cells.
 */
export function villageReveal(owned: Iterable<FogCell>): FogCell[] {
  const list = uniqueCells(owned);
  if (list.length > VILLAGE_MAX_CELLS) throw new Error(`[renderer] a village owns at most ${VILLAGE_MAX_CELLS} cells, not ${list.length}`);
  return [...list, ...freeSlots(list)];
}

/** The cells revealed by `next` and not by `previous`: what a placement lifts. */
export function liftedCells(previous: Iterable<FogCell>, next: Iterable<FogCell>): FogCell[] {
  const before = new Set([...previous].map((c) => cellKey(c.x, c.y)));
  return uniqueCells(next).filter((c) => !before.has(cellKey(c.x, c.y)));
}

function uniqueCells(cells: Iterable<FogCell>): FogCell[] {
  const seen = new Map<string, FogCell>();
  for (const c of cells) if (!seen.has(cellKey(c.x, c.y))) seen.set(cellKey(c.x, c.y), { x: c.x, y: c.y });
  return [...seen.values()];
}

/** Where a cell's clear part grows from while it lifts: a side (the neighbour it was revealed from) or its centre (0, 0). */
export type RevealAnchor = readonly [number, number];

/** A cell of the fog's reveal and how far it is lifted: 0 under the fog, 1 clear. */
export interface RevealedCell extends FogCell {
  value: number;
  anchor: RevealAnchor;
}

interface Lift {
  x: number;
  y: number;
  from: number;
  to: number;
  start: number;
  anchor: RevealAnchor;
}

/** The lift's ease (smoothstep): it starts and ends slowly. */
export const easeLift = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * The cells the fog leaves clear and how far each is lifted. A new reveal (`setTarget`) lifts the cells it adds over `seconds`
 * (eased), each growing from the side of a neighbour that was already clear (the tile just placed, when it is one of them:
 * `origin`), and fogs again the cells it drops, shrinking to their centre. `instant` (no motion: reduced motion, the Low tier)
 * and a first reveal show at once. The clock is the caller's, in seconds (the ambient loop's time).
 */
export class RevealTransition {
  private readonly lifts = new Map<string, Lift>();
  private first = true;

  constructor(private seconds: number) {}

  setSeconds(seconds: number): void {
    this.seconds = Math.max(0, seconds);
  }

  /** The cells to reveal now. True when anything changed. */
  setTarget(cells: Iterable<FogCell>, now: number, options: { instant?: boolean; origin?: Iterable<FogCell> } = {}): boolean {
    const target = new Map(uniqueCells(cells).map((c) => [cellKey(c.x, c.y), c]));
    const instant = options.instant || this.first || this.seconds <= 0;
    this.first = false;
    const origin = new Set([...(options.origin ?? [])].map((c) => cellKey(c.x, c.y)));
    let changed = false;
    // The cells clear before this reveal (fully lifted, or on their way): a new cell grows from one of them.
    const clear = new Set([...this.lifts].filter(([, l]) => l.to === 1).map(([k]) => k));
    for (const [key, cell] of target) {
      const lift = this.lifts.get(key);
      if (lift && lift.to === 1) continue;
      changed = true;
      const from = lift ? this.valueOf(lift, now) : 0;
      const anchor = anchorOf(cell, origin, clear);
      this.lifts.set(key, { x: cell.x, y: cell.y, from: instant ? 1 : from, to: 1, start: now, anchor: lift ? lift.anchor : anchor });
    }
    for (const [key, lift] of this.lifts) {
      if (target.has(key) || lift.to === 0) continue;
      changed = true;
      if (instant) this.lifts.delete(key);
      else this.lifts.set(key, { ...lift, from: this.valueOf(lift, now), to: 0, start: now, anchor: [0, 0] });
    }
    if (instant) this.finish();
    return changed;
  }

  /** Moves the lifts to `now`: true while one is under way. Cells fogged again leave the list once their lift ends. */
  step(now: number): boolean {
    let moving = false;
    for (const [key, lift] of this.lifts) {
      if (this.progress(lift, now) < 1) moving = true;
      else if (lift.to === 0) this.lifts.delete(key);
    }
    return moving;
  }

  /** Ends every lift at once (a change to no motion). */
  finish(): void {
    for (const [key, lift] of this.lifts) {
      if (lift.to === 0) this.lifts.delete(key);
      else lift.from = 1;
    }
  }

  /** Every cell with some of it clear (`value` above 0), at `now`. */
  cells(now: number): RevealedCell[] {
    const out: RevealedCell[] = [];
    for (const lift of this.lifts.values()) {
      const value = this.valueOf(lift, now);
      if (value > 0) out.push({ x: lift.x, y: lift.y, value, anchor: lift.anchor });
    }
    return out;
  }

  /** How many cells are clear or lifting (the fogged-again ones until they go). */
  get size(): number {
    return this.lifts.size;
  }

  private progress(lift: Lift, now: number): number {
    if (lift.from === lift.to || this.seconds <= 0) return 1;
    return Math.min(1, Math.max(0, (now - lift.start) / this.seconds));
  }

  private valueOf(lift: Lift, now: number): number {
    return lift.from + (lift.to - lift.from) * easeLift(this.progress(lift, now));
  }
}

/** The side a new cell grows from: a neighbour in `origin` first, then one already clear, else its centre. */
function anchorOf(cell: FogCell, origin: Set<string>, clear: Set<string>): RevealAnchor {
  for (const set of [origin, clear]) {
    for (const [dx, dy] of FOG_NEIGHBOURS) if (set.has(cellKey(cell.x + dx, cell.y + dy))) return [dx, dy];
  }
  return [0, 0];
}

/** A clear rectangle, in cells (a cell spans `x - 0.5` to `x + 0.5`). */
export interface RevealRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * The clear part of each cell: the whole square when lifted, a part of it while it lifts, `value` of the way from its anchor's
 * side (a band growing across the cell), or a square growing from its centre.
 */
export function revealRects(cells: Iterable<RevealedCell>): RevealRect[] {
  const rects: RevealRect[] = [];
  for (const { x, y, value, anchor } of cells) {
    if (value <= 0) continue;
    const v = Math.min(1, value);
    const [ax, ay] = anchor;
    if (ax === 0 && ay === 0) {
      const h = 0.5 * v;
      rects.push({ x0: x - h, x1: x + h, y0: y - h, y1: y + h });
      continue;
    }
    // From the side facing the anchor's neighbour, `v` of a cell into the cell.
    const x0 = ax > 0 ? x + 0.5 - v : x - 0.5;
    const x1 = ax < 0 ? x - 0.5 + v : x + 0.5;
    const y0 = ay > 0 ? y + 0.5 - v : y - 0.5;
    const y1 = ay < 0 ? y - 0.5 + v : y + 0.5;
    rects.push({ x0: ax === 0 ? x - 0.5 : x0, x1: ax === 0 ? x + 0.5 : x1, y0: ay === 0 ? y - 0.5 : y0, y1: ay === 0 ? y + 0.5 : y1 });
  }
  return rects;
}

/** How far the field holds a distance, in cells: the soft falloff and the billow stay within it; beyond it is all fog. */
export const FIELD_REACH = 4;
/** The field's texels a cell, each way. */
export const FIELD_TEXELS = 4;
/** The field's window grows by steps of this many cells, so the board's growth reallocates it seldom. */
export const FIELD_STEP = 8;

/**
 * The fog's field: one byte a texel, the distance from the texel's centre to the nearest clear rectangle (0 inside one), in
 * cells, over `reach` (255 at `reach` and beyond). Texel (0, 0) starts at cell edge (`originX`, `originY`): the cell
 * coordinate `c` is at texel `(c - origin) * texels`. The shader reads it filtered (bilinear): `fieldDistance` does the same.
 */
export interface RevealField {
  data: Uint8Array;
  width: number;
  height: number;
  originX: number;
  originY: number;
  texels: number;
  reach: number;
}

/** The field's window: its first cell edge and its size, in cells. */
export interface FieldWindow {
  originX: number;
  originY: number;
  cellsX: number;
  cellsY: number;
}

/**
 * The window around these cells: their squares, `reach` and a cell more on each side, rounded out to `FIELD_STEP` cells, so the
 * board's growth moves it seldom and a cell lifting never does.
 */
export function fieldWindow(cells: ReadonlyArray<FogCell>, reach = FIELD_REACH): FieldWindow {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const [minX, maxX, minY, maxY] = cells.length ? [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...ys) - 0.5, Math.max(...ys) + 0.5] : [-0.5, 0.5, -0.5, 0.5];
  const margin = reach + 1;
  const originX = Math.floor((minX - margin) / FIELD_STEP) * FIELD_STEP - 0.5;
  const originY = Math.floor((minY - margin) / FIELD_STEP) * FIELD_STEP - 0.5;
  return {
    originX,
    originY,
    cellsX: Math.ceil((maxX + margin - originX) / FIELD_STEP) * FIELD_STEP,
    cellsY: Math.ceil((maxY + margin - originY) / FIELD_STEP) * FIELD_STEP,
  };
}

/** Stamps each rectangle's distance on the texels within `reach` of it, the smaller kept. */
export function stampField(distance: Float32Array, window: FieldWindow, rects: ReadonlyArray<RevealRect>, reach: number, texels: number): void {
  const [width, height] = [window.cellsX * texels, window.cellsY * texels];
  for (const r of rects) {
    const tx0 = Math.max(0, Math.floor((r.x0 - reach - window.originX) * texels));
    const tx1 = Math.min(width - 1, Math.ceil((r.x1 + reach - window.originX) * texels));
    const ty0 = Math.max(0, Math.floor((r.y0 - reach - window.originY) * texels));
    const ty1 = Math.min(height - 1, Math.ceil((r.y1 + reach - window.originY) * texels));
    for (let ty = ty0; ty <= ty1; ty++) {
      const py = window.originY + (ty + 0.5) / texels;
      const dy = Math.max(r.y0 - py, 0, py - r.y1);
      for (let tx = tx0; tx <= tx1; tx++) {
        const px = window.originX + (tx + 0.5) / texels;
        const dx = Math.max(r.x0 - px, 0, px - r.x1);
        const d = Math.sqrt(dx * dx + dy * dy);
        const i = ty * width + tx;
        if (d < distance[i]!) distance[i] = d;
      }
    }
  }
}

/**
 * Builds the field of the cells as they lift. The cells fully clear are stamped once per reveal (their distances kept), the
 * lifting ones on a copy at each build: a step of a lift stamps a few cells, not the board. The window follows the cells'
 * whole squares (`fieldWindow`).
 */
export class RevealFieldBuilder {
  private baseKey = "";
  private base: Float32Array = new Float32Array(0);
  /** The builds made, and how many of them stamped the clear cells again (a new reveal or window). */
  builds = 0;
  baseBuilds = 0;

  constructor(
    readonly reach = FIELD_REACH,
    readonly texels = FIELD_TEXELS,
  ) {}

  build(cells: ReadonlyArray<RevealedCell>): RevealField {
    const { reach, texels } = this;
    const window = fieldWindow(cells, reach);
    const [width, height] = [window.cellsX * texels, window.cellsY * texels];
    const stable = cells.filter((c) => c.value >= 1);
    const moving = cells.filter((c) => c.value < 1);
    const key = `${window.originX},${window.originY},${window.cellsX},${window.cellsY}|${stable.map((c) => cellKey(c.x, c.y)).sort().join(";")}`;
    if (key !== this.baseKey) {
      this.base = new Float32Array(width * height).fill(reach);
      stampField(this.base, window, revealRects(stable), reach, texels);
      this.baseKey = key;
      this.baseBuilds++;
    }
    const distance = moving.length ? this.base.slice() : this.base;
    if (moving.length) stampField(distance, window, revealRects(moving), reach, texels);
    const data = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = Math.round((Math.min(distance[i]!, reach) / reach) * 255);
    this.builds++;
    return { data, width, height, originX: window.originX, originY: window.originY, texels, reach };
  }
}

/** The field of these cells at once (a builder of its own). */
export const buildRevealField = (cells: ReadonlyArray<RevealedCell>, reach = FIELD_REACH, texels = FIELD_TEXELS): RevealField =>
  new RevealFieldBuilder(reach, texels).build(cells);

/** The field's distance at a cell coordinate, in cells, filtered as the GPU reads it (bilinear, clamped to the edge). */
export function fieldDistance(field: RevealField, x: number, y: number): number {
  const fx = (x - field.originX) * field.texels - 0.5;
  const fy = (y - field.originY) * field.texels - 0.5;
  const at = (tx: number, ty: number) => {
    const cx = Math.min(field.width - 1, Math.max(0, tx));
    const cy = Math.min(field.height - 1, Math.max(0, ty));
    return (field.data[cy * field.width + cx]! / 255) * field.reach;
  };
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const u = fx - x0;
  const v = fy - y0;
  const top = at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u;
  const bottom = at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u;
  return top * (1 - v) + bottom * v;
}

/**
 * The distance at which the filtered field crosses a clear rectangle's border: a quarter of a texel (the texel inside reads 0,
 * the one outside half a texel; bilinear meets them halfway). The fog's edge sits there, so it falls on the cells' border.
 */
export const fieldEdge = (texels = FIELD_TEXELS): number => 0.25 / texels;

/** The fog's look and the landscape beyond the clear cells. */
export interface FogSettings {
  /** The fog on (the study's own switch). */
  enabled: boolean;
  /** The edge: 0 a hard line on the cells' border, above 0 a soft falloff over this many cells (up to `FIELD_REACH` - 1). */
  falloff: number;
  /** The edge cut on the voxel grid (a voxel stair, as the models'). */
  voxelEdge: boolean;
  /**
   * How far the noise pushes a soft edge in and out, cells (0 a straight falloff). A hard edge stays on the border. With the
   * falloff, at most `FIELD_REACH` - 0.5 cells.
   */
  billow: number;
  /** The noise's features, cells across. */
  noiseScale: number;
  /** The drift of the fog's noise, world units a second (0 still). */
  drift: number;
  /** Where the drift goes, degrees (0 toward +x, 90 toward +z, the screen's bottom). */
  driftDirection: number;
  /** The fog's colour (sRGB hex) and its shade, the darker colour of its billows. */
  color: string;
  shade: string;
  /** The fog's opacity at its thickest. */
  opacity: number;
  /** A second, higher layer of mist over the edge: its opacity (0 none) and height, world units. */
  mist: number;
  mistHeight: number;
  /** The fog's light at full night, a share of the day's. */
  night: number;
  /** A cell lifts over this many seconds (0 at once). */
  liftSeconds: number;
  landscape: LandscapeSettings;
}

/** The ground and decor beyond the clear cells (an endless landscape fading into the fog). */
export interface LandscapeSettings {
  enabled: boolean;
  /** The ground's colour (sRGB hex), and its second colour, the patches and voxels drawn between the two. */
  ground: string;
  groundAlt: string;
  /** The props a forest's cell holds (trees, bushes; a meadow's one at most, a bush or a rock), 0 none. */
  decor: number;
  /** The props' size, times their own. */
  decorScale: number;
}

/**
 * The study's proposal: a soft falloff over a cell and a half, billowing a little, a cool mist drifting slowly, a lift of
 * 0.8 s. The landscape off (the stories turn it on).
 */
export const DEFAULT_FOG_SETTINGS: FogSettings = {
  enabled: true,
  falloff: 1.5,
  voxelEdge: false,
  billow: 0.6,
  noiseScale: 2.5,
  drift: 0.6,
  driftDirection: 30,
  color: "#c3cdd8",
  shade: "#8e9cad",
  opacity: 1,
  mist: 0.35,
  mistHeight: 0.9,
  night: 0.3,
  liftSeconds: 0.8,
  landscape: { enabled: false, ground: "#4c5931", groundAlt: "#5c6638", decor: 10, decorScale: 1 },
};

export type FogSettingsInput = DeepPartial<FogSettings>;

const at = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const hex = (value: unknown, fallback: string): string => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

/** `input` over `base`, field by field; a value of the wrong kind or out of range keeps the base's. */
export function resolveFogSettings(input: FogSettingsInput = {}, base: FogSettings = DEFAULT_FOG_SETTINGS): FogSettings {
  const l = input.landscape ?? {};
  const falloff = at(input.falloff, base.falloff, 0, FIELD_REACH - 1);
  return {
    enabled: flag(input.enabled, base.enabled),
    falloff,
    voxelEdge: flag(input.voxelEdge, base.voxelEdge),
    // The falloff and the billow stay within the field's reach, so the fog is whole past it (the field holds no farther distance).
    billow: Math.min(at(input.billow, base.billow, 0, 1.5), FIELD_REACH - 0.5 - falloff),
    noiseScale: at(input.noiseScale, base.noiseScale, 0.25, 20),
    drift: at(input.drift, base.drift, 0, 10),
    driftDirection: at(input.driftDirection, base.driftDirection, -360, 360),
    color: hex(input.color, base.color),
    shade: hex(input.shade, base.shade),
    opacity: at(input.opacity, base.opacity, 0, 1),
    mist: at(input.mist, base.mist, 0, 1),
    mistHeight: at(input.mistHeight, base.mistHeight, 0.05, 6),
    night: at(input.night, base.night, 0, 1),
    liftSeconds: at(input.liftSeconds, base.liftSeconds, 0, 10),
    landscape: {
      enabled: flag(l.enabled, base.landscape.enabled),
      ground: hex(l.ground, base.landscape.ground),
      groundAlt: hex(l.groundAlt, base.landscape.groundAlt),
      decor: at(l.decor, base.landscape.decor, 0, 16),
      decorScale: at(l.decorScale, base.landscape.decorScale, 0.25, 4),
    },
  };
}

/**
 * How the fog draws: "off" (the fog off), "still" (no drift, a cell lifts at once: reduced motion, the Low tier, or the ambient
 * effects off, since the drift and the lift step on the ambient loop) or "moving". Unlike the weather, the fog stays on every
 * tier: it tells where a tile can go. `reducedMotion` is the ambient effects' setting: "auto" follows the device's.
 */
export type FogMode = "off" | "still" | "moving";

export function fogMode(
  fog: Pick<FogSettings, "enabled">,
  ambient: { enabled: boolean; reducedMotion: boolean | "auto" },
  quality: string,
  deviceReducedMotion: boolean,
): FogMode {
  if (!fog.enabled) return "off";
  const reduced = ambient.reducedMotion === "auto" ? deviceReducedMotion : ambient.reducedMotion;
  return !ambient.enabled || quality === "low" || reduced ? "still" : "moving";
}
