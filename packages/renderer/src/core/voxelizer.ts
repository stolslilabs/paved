// Types only from three: the voxelizer is read by the voxel drop (#512) and the night windows (#513), each in a chunk of its own,
// and shares nothing with the board's chunk. Nothing calls it yet (VOXELIZER, P-84).
import type { BufferGeometry } from "three";
import { traceMeasure, traceStart } from "./load-trace";
import { GROUND_VOXELS, LABEL_COLUMNS } from "./feature-codes";

/**
 * The voxel grid of a tile model, rebuilt from the geometry the renderer loaded. A model is one mesh with one 256 x 1 palette,
 * every triangle's UV a single texel, so a face's colour is its palette entry; the mesh is a closed solid on a grid of 40 x 40
 * columns (`LABEL_COLUMNS`), with coplanar faces partly merged and the faces between two solid voxels removed.
 *
 * The solid voxels come back by column parity: along the height axis, the horizontal faces over a column, sorted, alternate a
 * bottom face (opens) and a top face (closes). A voxel's colour is the entry of a face it owns (a top face first, then a side,
 * then a bottom one); a voxel with no face (inside the solid) takes the colour of the voxel above it, the nearest one that has
 * a face, since the column above a voxel always ends in a top face. A model whose columns do not alternate (a vertex off the
 * grid) returns nothing and is logged by name: there is no tolerance here (ASSET-SNAP, P-78, fixed the last one).
 *
 * The work is done in the model's frame the renderer gives it (`toModel`: the mesh's matrix, as `columnTops` takes it): Y up,
 * the ground at the model's lowest point. The grid's step is the larger of the footprint's sides over 40, so the quantized
 * copies (8-bit positions about the model's centre, a node scale of 12.7) and the unquantized sources give the same grid.
 */

/** The palette's width in texels: an entry is `floor(u * PALETTE_SIZE)`. */
export const PALETTE_SIZE = 256;

/** The palette `u` that reads an entry's texel at its centre. */
export const paletteU = (entry: number): number => (entry + 0.5) / PALETTE_SIZE;

/** How far a face's vertices may stand off a grid plane, in voxels, for the face to count as flat on it. */
const FLAT = 0.05;

/**
 * Where a column's sample lies in a voxel, from its centre (in voxels): off every diagonal and edge of an axis-aligned grid, so
 * that a quad split along its diagonal is crossed once (the shift of `scripts/voxel-parity.ts`, in voxel units).
 */
const SHIFT_B = 0.013;
const SHIFT_C = 0.021;

/** The model a grid is built from: the loaded geometry, and the matrix that takes it to the model's frame (Y up). */
export interface VoxelSource {
  readonly geometry: BufferGeometry;
  readonly toModel?: { readonly elements: ArrayLike<number> };
}

/** What `voxelize` knows besides the geometry: the model's name, for its log line. */
export interface VoxelizeOptions {
  readonly name?: string;
}

/** The solid voxels of a model, as typed arrays (no object per voxel). Cells are x, y (the ground's two axes) and layer. */
export interface VoxelGrid {
  /** The grid's size along x, along y (the ground's other axis) and in layers (the height). */
  readonly sizeX: number;
  readonly sizeY: number;
  readonly layers: number;
  /** A voxel's side in the model's frame (the units `toModel` gives), derived from the geometry. */
  readonly step: number;
  /** The grid's corner (cell 0, 0, 0) in the model's frame: x, height, and the ground's other axis (the model's z). */
  readonly origin: readonly [number, number, number];
  /** The number of solid voxels. */
  readonly count: number;
  /** The cell of voxel `v`: `cells[3v]` x, `cells[3v + 1]` y, `cells[3v + 2]` layer. Layer by layer from the bottom, then row by row. */
  readonly cells: Uint8Array;
  /** The palette entry of voxel `v` (0 to 255); its texel's `u` is `paletteU(entry)`. */
  readonly entry: Uint8Array;
  /**
   * 1 when voxel `v` has a face the mesh draws, else 0: one of its six neighbours is air, or past the grid (the sides and the
   * top, and the bottom of layer 0 too, as #512's count does: the bottom is 1,444 of the 38 x 38 voxels inside the first layer).
   */
  readonly visible: Uint8Array;
  /** The voxels with a free face. */
  readonly visibleCount: number;
  /** 1 for a solid cell, in layer-major order (`cellIndex`): the grid as a volume, for a reader that needs the air too. */
  readonly occupied: Uint8Array;
  /** The layer of the ground slab's top: the slab is the first `GROUND_VOXELS` (4) layers, the art's convention in every model. */
  readonly groundTop: number;
  /** The solid voxels in the slab, and the ones above it (the decor). */
  readonly slabCount: number;
  /** How long the build took, in ms (`performance.now`). */
  readonly buildMs: number;
}

/** Why a model gave no grid. */
export type VoxelFailure = "no-faces" | "odd-columns" | "no-solid";

/** The index of a cell in `VoxelGrid.occupied`. */
export const cellIndex = (grid: Pick<VoxelGrid, "sizeX" | "sizeY">, x: number, y: number, layer: number): number => x + grid.sizeX * (y + grid.sizeY * layer);

/** A triangle list's faces on the grid's planes, as `[lower voxel, upper voxel, entry, axis]` rows (-1: past the grid). */
class Hits {
  data = new Int32Array(4096);
  length = 0;
  push(lower: number, upper: number, entry: number, axis: number): void {
    if (this.length + 4 > this.data.length) {
      const grown = new Int32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const d = this.data;
    d[this.length] = lower;
    d[this.length + 1] = upper;
    d[this.length + 2] = entry;
    d[this.length + 3] = axis;
    this.length += 4;
  }
}

/**
 * The voxel grid of a model, or `null` when its columns do not alternate bottom and top faces (logged with `options.name`).
 * Synchronous: about a few ms for a tile on a desktop (`VoxelGrid.buildMs`); `VoxelCache.request` runs it in an idle slice.
 */
export function voxelize(source: VoxelSource, options: VoxelizeOptions = {}): VoxelGrid | null {
  const start = traceStart();
  const began = performance.now();
  const name = options.name ?? "model";
  const result = build(source, began);
  if (typeof result === "string") {
    console.warn(`[voxelizer] ${name}: no voxels, the model's columns are not a closed solid (${result})`);
    return null;
  }
  traceMeasure(`voxelize-${name}`, start);
  return result;
}

function build(source: VoxelSource, began: number): VoxelGrid | VoxelFailure {
  const { geometry } = source;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex();
  if (!position || position.count < 3) return "no-faces";
  const count = position.count;

  // The positions in the model's frame (Y up), and its box.
  const m = source.toModel?.elements ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const p = new Float32Array(count * 3);
  let [minX, maxX, minY, maxY, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const [px, py, pz] = [position.getX(i), position.getY(i), position.getZ(i)];
    const w = m[3]! * px + m[7]! * py + m[11]! * pz + m[15]! || 1;
    const x = (m[0]! * px + m[4]! * py + m[8]! * pz + m[12]!) / w;
    const y = (m[1]! * px + m[5]! * py + m[9]! * pz + m[13]!) / w;
    const z = (m[2]! * px + m[6]! * py + m[10]! * pz + m[14]!) / w;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  // The step: the footprint's larger side over the 40 columns, so a quantized copy and its source agree.
  const step = Math.max(maxX - minX, maxZ - minZ) / LABEL_COLUMNS;
  if (!(step > 0)) return "no-faces";
  const dims = [Math.max(1, Math.round((maxX - minX) / step)), Math.max(1, Math.round((maxY - minY) / step)), Math.max(1, Math.round((maxZ - minZ) / step))] as const;
  const [sizeX, layers, sizeY] = dims;
  const plane = sizeX * sizeY;
  // A cell's flat index is x + sizeX * y + plane * layer: the strides of the three axes (x, height, y).
  const STRIDE = [1, plane, sizeX] as const;
  const total = plane * layers;
  // The vertices in grid units, in place.
  for (let i = 0; i < count; i++) {
    p[i * 3] = (p[i * 3]! - minX) / step;
    p[i * 3 + 1] = (p[i * 3 + 1]! - minY) / step;
    p[i * 3 + 2] = (p[i * 3 + 2]! - minZ) / step;
  }

  // Pass 1: every face lying on a grid plane, onto the cells it covers; the ones along the height also flip their column.
  const hits = new Hits();
  const flips = new Uint8Array(plane * (layers + 1));
  const triangles = index ? index.count : count;
  const vertex = (t: number) => (index ? index.getX(t) : t);
  const lo = [0, 0];
  const hi = [0, 0];
  let faces = 0;
  for (let t = 0; t + 2 < triangles; t += 3) {
    const [a, b, c] = [vertex(t) * 3, vertex(t + 1) * 3, vertex(t + 2) * 3];
    // The axis the triangle lies flat on (0 x, 1 height, 2 y), if any.
    let axis = -1;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(p[a + k]! - p[b + k]!) < FLAT && Math.abs(p[a + k]! - p[c + k]!) < FLAT) {
        axis = k;
        break;
      }
    }
    if (axis < 0) continue;
    const [kb, kc] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const [ab, ac, bb, bc, cb, cc] = [p[a + kb!]!, p[a + kc!]!, p[b + kb!]!, p[b + kc!]!, p[c + kb!]!, p[c + kc!]!];
    const det = (bb - ab) * (cc - ac) - (cb - ab) * (bc - ac);
    if (Math.abs(det) < 1e-9) continue; // edge-on: covers no cell
    const at = Math.round((p[a + axis]! + p[b + axis]! + p[c + axis]!) / 3);
    const extent = [dims[kb!], dims[kc!]] as const;
    lo[0] = Math.max(0, Math.floor(Math.min(ab, bb, cb)) - 1);
    hi[0] = Math.min(extent[0] - 1, Math.ceil(Math.max(ab, bb, cb)));
    lo[1] = Math.max(0, Math.floor(Math.min(ac, bc, cc)) - 1);
    hi[1] = Math.min(extent[1] - 1, Math.ceil(Math.max(ac, bc, cc)));
    const uSum = uv ? uv.getX(vertex(t)) + uv.getX(vertex(t + 1)) + uv.getX(vertex(t + 2)) : 0;
    const entry = Math.min(PALETTE_SIZE - 1, Math.max(0, Math.floor((uSum / 3) * PALETTE_SIZE)));
    // The voxel on each side of the plane, for the cell (ib, ic): `base` plus the strides of the three axes.
    const [sb, sc, sa] = [STRIDE[kb!]!, STRIDE[kc!]!, STRIDE[axis]!];
    const [below, above] = [at > 0 ? (at - 1) * sa : -1, at < dims[axis]! ? at * sa : -1];
    for (let ic = lo[1]!; ic <= hi[1]!; ic++) {
      const pc = ic + 0.5 + SHIFT_C;
      for (let ib = lo[0]!; ib <= hi[0]!; ib++) {
        const pb = ib + 0.5 + SHIFT_B;
        const u = ((pb - ab) * (cc - ac) - (cb - ab) * (pc - ac)) / det;
        const v = ((bb - ab) * (pc - ac) - (pb - ab) * (bc - ac)) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const base = ib * sb + ic * sc;
        hits.push(below < 0 ? -1 : base + below, above < 0 ? -1 : base + above, entry, axis);
        faces++;
        if (axis === 1) flips[base + at * plane] ^= 1;
      }
    }
  }
  if (faces === 0) return "no-faces";

  // The solid voxels, column by column: a flip at a plane toggles inside/outside from that layer up; a column that does not end
  // outside is odd.
  const occupied = new Uint8Array(total);
  let solid = 0;
  for (let column = 0; column < plane; column++) {
    let inside = 0;
    for (let l = 0; l < layers; l++) {
      inside ^= flips[column + plane * l]!;
      if (inside) {
        occupied[column + plane * l] = 1;
        solid++;
      }
    }
    inside ^= flips[column + plane * layers]!;
    if (inside) return "odd-columns";
  }
  if (solid === 0) return "no-solid";
  // The ground slab is the models' first `GROUND_VOXELS` layers (the art's convention, as the classifier reads it): roads and rivers
  // sink some of its columns and a dense forest covers half the tile above it, so no count of the columns tells its top.
  const groundHeight = Math.min(GROUND_VOXELS, layers);

  // Pass 2: each face gives its colour to the solid voxel it bounds; the top face of a voxel first, then a side, then the bottom.
  const color = new Uint8Array(total);
  const rank = new Uint8Array(total); // 0 none, 1 bottom, 2 side, 3 top
  const attribute = (voxel: number, entry: number, ranked: number) => {
    if (voxel < 0 || !occupied[voxel] || rank[voxel]! >= ranked) return;
    color[voxel] = entry;
    rank[voxel] = ranked;
  };
  const rows = hits.data;
  for (let h = 0; h < hits.length; h += 4) {
    const [lower, upper, entry, axis] = [rows[h]!, rows[h + 1]!, rows[h + 2]!, rows[h + 3]!];
    const [belowSolid, aboveSolid] = [lower >= 0 && occupied[lower]!, upper >= 0 && occupied[upper]!];
    if (belowSolid === aboveSolid) continue; // a face between two solids or two airs: not a surface
    if (belowSolid) attribute(lower, entry, axis === 1 ? 3 : 2);
    else attribute(upper, entry, axis === 1 ? 1 : 2);
  }
  // A voxel with no face takes the colour of the one above, top layer first (it always has one: a column ends in a top face).
  for (let l = layers - 2; l >= 0; l--) {
    for (let column = 0; column < plane; column++) {
      const voxel = column + plane * l;
      if (occupied[voxel] && !rank[voxel] && occupied[voxel + plane]) color[voxel] = color[voxel + plane]!;
    }
  }

  // The output, layer by layer from the bottom, row by row.
  const cells = new Uint8Array(solid * 3);
  const entry = new Uint8Array(solid);
  const visible = new Uint8Array(solid);
  let [v, visibleCount, slabCount] = [0, 0, 0];
  for (let l = 0; l < layers; l++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        const voxel = x + sizeX * (y + sizeY * l);
        if (!occupied[voxel]) continue;
        cells[v * 3] = x;
        cells[v * 3 + 1] = y;
        cells[v * 3 + 2] = l;
        entry[v] = color[voxel]!;
        // Air, or the grid's edge, next to it.
        const free =
          x === 0 || x === sizeX - 1 || y === 0 || y === sizeY - 1 || l === 0 || l === layers - 1 ||
          !occupied[voxel - 1]! || !occupied[voxel + 1]! || !occupied[voxel - sizeX]! || !occupied[voxel + sizeX]! ||
          !occupied[voxel + plane]! || !occupied[voxel - plane]!;
        if (free) {
          visible[v] = 1;
          visibleCount++;
        }
        if (l < groundHeight) slabCount++;
        v++;
      }
    }
  }

  return {
    sizeX,
    sizeY,
    layers,
    step,
    origin: [minX, minY, minZ],
    count: solid,
    cells,
    entry,
    visible,
    visibleCount,
    occupied,
    groundTop: groundHeight - 1,
    slabCount,
    buildMs: performance.now() - began,
  };
}

/** Runs `task` when the main thread is idle (`requestIdleCallback`), or on the next task where there is none. */
function whenIdle(task: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(task, { timeout: 250 });
  else setTimeout(task, 0);
}

/**
 * The grids of a board's model types, one per type, shared the way the type's geometry is (`TileRenderer.tileType`): the first
 * reader builds it, the others get the same object. `get` builds now; `request` builds in an idle slice, one type a slice, and
 * resolves with the grid (or `null` for a model that is not a closed solid, logged once). Nothing holds the geometry: `forget`
 * and `clear` let go of the grids, which are plain typed arrays.
 *
 * It plugs into `TileRenderer.tileType(key)` with `grids.get(key, { geometry, toModel })` on the type's mesh; the renderer owns
 * one cache and clears it in `dispose`. It is not wired yet (it waits for PLATES, #514, which holds `TileRenderer`).
 */
export class VoxelCache {
  private readonly grids = new Map<string, VoxelGrid | null>();
  private readonly pending = new Map<string, Promise<VoxelGrid | null>>();

  /** The grid of a type if it is built, `null` when the type is not a closed solid, `undefined` when it is not built yet. */
  peek(key: string): VoxelGrid | null | undefined {
    return this.grids.get(key);
  }

  /** The grid of a type, built now if it is not. */
  get(key: string, source: VoxelSource): VoxelGrid | null {
    const known = this.grids.get(key);
    if (known !== undefined) return known;
    const grid = voxelize(source, { name: key });
    this.grids.set(key, grid);
    return grid;
  }

  /** The grid of a type, built in an idle slice if it is not (the same promise for every caller of a type). */
  request(key: string, source: VoxelSource, skip?: () => boolean): Promise<VoxelGrid | null> {
    const known = this.grids.get(key);
    if (known !== undefined) return Promise.resolve(known);
    let pending = this.pending.get(key);
    if (!pending) {
      const created: Promise<VoxelGrid | null> = new Promise<VoxelGrid | null>((resolve) => {
        whenIdle(() => {
          // A reader that no longer wants the grid (`skip`, asked when the slice runs) builds nothing.
          if (skip?.()) {
            if (this.pending.get(key) === created) this.pending.delete(key);
            resolve(null);
            return;
          }
          // Still the current request: build and keep. Forgotten or cleared meanwhile: the callers of this request get their
          // grid, but it is not kept, and a later request for the type starts its own build from its own source.
          if (this.pending.get(key) === created) {
            this.pending.delete(key);
            resolve(this.get(key, source));
          } else resolve(voxelize(source, { name: key }));
        });
      });
      pending = created;
      this.pending.set(key, pending);
    }
    return pending;
  }

  /** Lets go of one type's grid. */
  forget(key: string): void {
    this.grids.delete(key);
    this.pending.delete(key);
  }

  /** Lets go of every grid. */
  clear(): void {
    this.grids.clear();
    this.pending.clear();
  }

  /** The types with a grid (or a logged failure) so far. */
  get size(): number {
    return this.grids.size;
  }
}
