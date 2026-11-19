/**
 * TOWN-HALL: voxel grids for the Town Hall's generator. A base tile model read back to its voxels (as the renderer's
 * `voxelizer.ts` does, by column parity), a grid to build in, and the mesh of a grid as the tile models are meshed: one
 * closed solid, one quad per visible voxel face, every vertex of a face on one texel of the 256 x 1 palette.
 */
import type { Primitive } from "@gltf-transform/core";

/** A tile's side, in voxels, and the height of the ground slab every model stands on. */
export const TILE_VOXELS = 40;
export const GROUND = 4;
/** The layers read from a base model: more than the tallest one has (35).*/
export const HEIGHT_OF_SOURCES = 40;
/** A voxel's side in a model's units (a tile is 4 units wide). */
export const STEP = 0.1;

/** A box of voxels: `x` east, `z` south, `y` up; a cell holds a palette entry + 1, 0 for air. */
export class Grid {
  readonly cells: Uint16Array;
  readonly sizeX: number;
  readonly sizeZ: number;
  readonly height: number;
  constructor(sizeX: number, sizeZ: number, height: number) {
    this.sizeX = sizeX;
    this.sizeZ = sizeZ;
    this.height = height;
    this.cells = new Uint16Array(sizeX * sizeZ * height);
  }
  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.sizeX && z >= 0 && z < this.sizeZ && y >= 0 && y < this.height;
  }
  /** The palette entry at a cell, or -1 for air (and past the grid). */
  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.cells[x + this.sizeX * (z + this.sizeZ * y)]! - 1 : -1;
  }
  /** Sets a cell to a palette entry, or to air with -1. Past the grid: nothing. */
  set(x: number, y: number, z: number, entry: number): void {
    if (this.inside(x, y, z)) this.cells[x + this.sizeX * (z + this.sizeZ * y)] = entry + 1;
  }
  /** A box, both corners included; `entry` is an entry or a function of the cell (a surface keeps the models' two-tone grain). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, entry: number | ((x: number, y: number, z: number) => number)): void {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, typeof entry === "function" ? entry(x, y, z) : entry);
  }
  /** The first empty layer above every voxel. */
  top(): number {
    const plane = this.sizeX * this.sizeZ;
    for (let y = this.height - 1; y >= 0; y--) for (let i = 0; i < plane; i++) if (this.cells[i + plane * y]) return y + 1;
    return 0;
  }
  /** The highest solid layer of a column, or -1. */
  columnTop(x: number, z: number): number {
    for (let y = this.height - 1; y >= 0; y--) if (this.get(x, y, z) >= 0) return y;
    return -1;
  }
  /** This grid turned a quarter turn clockwise (seen from above) `turns` times. */
  turned(turns: number): Grid {
    let grid: Grid = this;
    for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
      const next = new Grid(grid.sizeZ, grid.sizeX, grid.height);
      for (let y = 0; y < grid.height; y++) for (let z = 0; z < grid.sizeZ; z++) for (let x = 0; x < grid.sizeX; x++) next.set(grid.sizeZ - 1 - z, y, x, grid.get(x, y, z));
      grid = next;
    }
    return grid;
  }
  /** Copies a box of `from` (its corner `fx`, `fz`, `w` by `d` columns, every layer) to `x`, `z` here. */
  paste(from: Grid, fx: number, fz: number, w: number, d: number, x: number, z: number): void {
    for (let y = 0; y < Math.min(this.height, from.height); y++) for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) this.set(x + i, y, z + j, from.get(fx + i, y, fz + j));
  }
}

/**
 * The voxels of a tile model's primitive, in the model's own frame as the sources are (x and y on the ground from -4 to 0,
 * the top at negative z): `x` east, `z` south (the model's y), layers up. The solid comes from the horizontal faces, which
 * alternate bottom and top up a column; a voxel's colour is the entry of a face it owns, else the entry above it.
 */
export function readVoxels(prim: Primitive, height: number): Grid {
  const position = prim.getAttribute("POSITION")!;
  const uv = prim.getAttribute("TEXCOORD_0")!;
  const indices = prim.getIndices()!.getArray()!;
  const n = TILE_VOXELS;
  const grid = new Grid(n, n, height);
  const p = (i: number): [number, number, number] => {
    const e = position.getElement(i, [0, 0, 0]);
    return [e[0]! / STEP + n, e[1]! / STEP + n, -e[2]! / STEP];
  };
  const entryOf = (a: number, b: number, c: number) => {
    const u = (uv.getElement(a, [0, 0])[0]! + uv.getElement(b, [0, 0])[0]! + uv.getElement(c, [0, 0])[0]!) / 3;
    return Math.min(255, Math.max(0, Math.floor(u * 256)));
  };
  // flips[col][layer]: a horizontal face at the bottom of `layer`; faceEntry: the entry of a face on each side of a voxel.
  const flips = new Uint8Array(n * n * (height + 1));
  const topEntry = new Int16Array(n * n * height).fill(-1);
  const sideEntry = new Int16Array(n * n * height).fill(-1);
  const cell = (x: number, y: number, z: number) => x + n * (z + n * y);
  const covers = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number) => {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [ia, ib, ic] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    const [a, b, c] = [p(ia), p(ib), p(ic)];
    const axis = [0, 1, 2].find((k) => Math.abs(a[k]! - b[k]!) < 0.05 && Math.abs(a[k]! - c[k]!) < 0.05);
    if (axis === undefined) continue;
    const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const at = Math.round(a[axis]!);
    const entry = entryOf(ia, ib, ic);
    const normal = (b[u]! - a[u]!) * (c[v]! - a[v]!) - (c[u]! - a[u]!) * (b[v]! - a[v]!);
    for (let i = Math.floor(Math.min(a[u]!, b[u]!, c[u]!)); i <= Math.ceil(Math.max(a[u]!, b[u]!, c[u]!)); i++) {
      for (let j = Math.floor(Math.min(a[v]!, b[v]!, c[v]!)); j <= Math.ceil(Math.max(a[v]!, b[v]!, c[v]!)); j++) {
        if (!covers(a[u]!, a[v]!, b[u]!, b[v]!, c[u]!, c[v]!, i + 0.513, j + 0.521)) continue;
        if (axis === 2) {
          // A horizontal face over column (i, j) at layer `at`.
          if (i < 0 || j < 0 || i >= n || j >= n || at < 0 || at > height) continue;
          flips[i + n * (j + n * at)] ^= 1;
          if (at > 0 && at <= height) topEntry[cell(i, at - 1, j)] = entry; // kept only if that voxel is solid: a top face
        } else {
          // A side face: (i, j) is (other ground axis, layer); it paints the solid voxel on either side.
          const layer = j;
          if (layer < 0 || layer >= height || !Number.isFinite(normal)) continue;
          for (const side of [at - 1, at]) {
            const [x, z] = axis === 0 ? [side, i] : [i, side];
            if (x >= 0 && z >= 0 && x < n && z < n) sideEntry[cell(x, layer, z)] = entry;
          }
        }
      }
    }
  }
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    let solid = false;
    const column: number[] = [];
    for (let y = 0; y < height; y++) {
      if (flips[x + n * (z + n * y)]) solid = !solid;
      if (solid) column.push(y);
    }
    if (solid && !flips[x + n * (z + n * height)]) throw new Error(`readVoxels: column ${x},${z} is not closed`);
    let above = 0;
    for (let k = column.length - 1; k >= 0; k--) {
      const y = column[k]!;
      const topFree = k === column.length - 1 || column[k + 1] !== y + 1;
      const own = topFree && topEntry[cell(x, y, z)]! >= 0 ? topEntry[cell(x, y, z)]! : sideEntry[cell(x, y, z)]!;
      above = own >= 0 ? own : above;
      grid.set(x, y, z, above);
    }
  }
  return grid;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

const FACES: Array<{ n: [number, number, number]; q: Array<[number, number, number]> }> = [
  { n: [1, 0, 0], q: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], q: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], q: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], q: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { n: [0, 0, 1], q: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], q: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

/**
 * The mesh of a grid in the tile models' frame (x and y on the ground, from minus the footprint to 0; the top at negative
 * z, which the node's rotation turns up): the faces that see air, coplanar faces of one entry merged along x or z into
 * strips, so a flat roof or a wall is a few quads. The solid is closed: the faces on the grid's border are drawn.
 */
export function meshOf(grid: Grid): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const { sizeX, sizeZ, height } = grid;
  const dims = [sizeX, height, sizeZ];
  for (const { n, q } of FACES) {
    const axis = n.findIndex((v) => v !== 0);
    // The strip runs along `run` (x, or z for the faces that look along x), stacked along `other`.
    const run = axis === 0 ? 2 : 0;
    const other = 3 - axis - run;
    const at = [0, 0, 0];
    for (at[axis] = 0; at[axis]! < dims[axis]!; at[axis]!++) {
      for (at[other] = 0; at[other]! < dims[other]!; at[other]!++) {
        let start = -1;
        let entry = -1;
        for (let r = 0; r <= dims[run]!; r++) {
          at[run] = r;
          const here = r < dims[run]! ? grid.get(at[0]!, at[1]!, at[2]!) : -1;
          const seen = here >= 0 && grid.get(at[0]! + n[0], at[1]! + n[1], at[2]! + n[2]) < 0 ? here : -1;
          if (seen === entry) continue;
          if (entry >= 0) {
            const base = positions.length / 3;
            const from = [at[0]!, at[1]!, at[2]!];
            from[run] = start;
            const length = r - start;
            for (const corner of q) {
              const v = [from[0]! + corner[0], from[1]! + corner[1], from[2]! + corner[2]];
              v[run] = from[run]! + corner[run]! * length;
              // Grid (x east, y up, z south) to the model's frame: x - sizeX, z - sizeZ on the ground, -y the height.
              positions.push((v[0]! - sizeX) * STEP, (v[2]! - sizeZ) * STEP, -v[1]! * STEP);
              normals.push(n[0], n[2], -n[1]);
              uvs.push((entry + 0.5) / 256, 0.5);
            }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          start = r;
          entry = seen;
        }
      }
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}
