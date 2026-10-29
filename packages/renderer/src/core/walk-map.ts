// No three here: the walk's ground is built from typed arrays and matrices as plain numbers, so it is tested without a scene.
import type { VoxelGrid } from "./voxelizer";
import { FEATURE_CODE } from "./feature-codes";

/**
 * The walk's ground (V4-WALK-1, #876): the board's solid voxels in one grid of the board's frame, and which columns the walker may
 * stand on (the roads and the cities' ground, from the features' classifier), joined across tiles at their edges. Built once per
 * walk from the placed tiles' voxel grids (`voxelizer.ts`), each turned and moved to its cell (`toBoard`).
 */

/** The column labels of a model (`labelTileColumns`): each column's feature, row by row from the grid's corner, and where it lies. */
export interface WalkLabels {
  readonly size: number;
  readonly feature: Uint8Array;
  readonly minX: number;
  readonly minZ: number;
  readonly cell: number;
}

/** A placed tile: its model's voxel grid and labels (in the model's frame) and the matrix from that frame to the board's. */
export interface WalkTile {
  readonly grid: VoxelGrid;
  /** Null: the model's palette has no class table, so none of its ground is walkable (its voxels still stop the walker). */
  readonly labels: WalkLabels | null;
  /** The model's frame to the board's, column-major (three's `Matrix4.elements`): a turn about the vertical, a scale, a move. */
  readonly toBoard: ArrayLike<number>;
}

/** What a column's ground is: none (the walker never stands there), a city's or a road. */
export const WALK_GROUND = { none: 0, city: FEATURE_CODE.city, road: FEATURE_CODE.road } as const;

export class WalkMap {
  /** A voxel's side, in world units (0.075 on a board of 3-unit tiles). */
  readonly voxel: number;
  /** The board-frame corner of column (0, 0): its least x and z. */
  readonly minX: number;
  readonly minZ: number;
  readonly sizeX: number;
  readonly sizeZ: number;
  readonly layers: number;
  /** 1 for a solid voxel, at `x + sizeX * (z + sizeZ * layer)`. */
  readonly solid: Uint8Array;
  /** Each column's ground (`WALK_GROUND`), at `x + sizeX * z`. */
  readonly ground: Uint8Array;
  /** How many columns are walkable. */
  readonly walkable: number;

  constructor(voxel: number, minX: number, minZ: number, sizeX: number, sizeZ: number, layers: number, solid: Uint8Array, ground: Uint8Array) {
    this.voxel = voxel;
    this.minX = minX;
    this.minZ = minZ;
    this.sizeX = sizeX;
    this.sizeZ = sizeZ;
    this.layers = layers;
    this.solid = solid;
    this.ground = ground;
    let walkable = 0;
    for (const g of ground) if (g) walkable++;
    this.walkable = walkable;
  }

  /** Whether a voxel is solid. Past the board's sides and under its bottom everything is (a wall the walker never crosses); over its top, nothing. */
  solidAt(x: number, z: number, layer: number): boolean {
    if (x < 0 || z < 0 || x >= this.sizeX || z >= this.sizeZ || layer < 0) return true;
    if (layer >= this.layers) return false;
    return this.solid[x + this.sizeX * (z + this.sizeZ * layer)] === 1;
  }

  /** A column's ground (`WALK_GROUND`); none past the board. */
  groundAt(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.sizeX || z >= this.sizeZ) return WALK_GROUND.none;
    return this.ground[x + this.sizeX * z]!;
  }

  /** The top of a column's lowest solid run, in layers (where a road or a square lies, under any bridge): 0 for an empty column. */
  surfaceAt(x: number, z: number): number {
    let layer = 0;
    while (layer < this.layers && this.solidAt(x, z, layer)) layer++;
    return layer;
  }
}

/** A point times a column-major 4 x 4 matrix (an affine one: w is 1). */
function apply(m: ArrayLike<number>, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

/** The walk's ground of the tiles given; null with none. */
export function buildWalkMap(tiles: readonly WalkTile[]): WalkMap | null {
  if (!tiles.length) return null;
  // A voxel's side on the board: the model's step times the matrix's scale (the length of its first column).
  const first = tiles[0]!;
  const m0 = first.toBoard;
  const voxel = first.grid.step * Math.hypot(m0[0]!, m0[1]!, m0[2]!);

  // The board's box: each grid's footprint corners and its top, on the board.
  let [minX, maxX, minZ, maxZ, top] = [Infinity, -Infinity, Infinity, -Infinity, 0];
  for (const { grid, toBoard } of tiles) {
    const [ox, oy, oz] = grid.origin;
    const [ex, ey, ez] = [ox + grid.sizeX * grid.step, oy + grid.layers * grid.step, oz + grid.sizeY * grid.step];
    for (const [x, z] of [[ox, oz], [ex, oz], [ox, ez], [ex, ez]] as const) {
      const [bx, , bz] = apply(toBoard, x, oy, z);
      minX = Math.min(minX, bx);
      maxX = Math.max(maxX, bx);
      minZ = Math.min(minZ, bz);
      maxZ = Math.max(maxZ, bz);
    }
    top = Math.max(top, apply(toBoard, ox, ey, oz)[1]);
  }
  const sizeX = Math.max(1, Math.round((maxX - minX) / voxel));
  const sizeZ = Math.max(1, Math.round((maxZ - minZ) / voxel));
  const layers = Math.max(1, Math.ceil(top / voxel - 1e-6));
  const solid = new Uint8Array(sizeX * sizeZ * layers);
  const ground = new Uint8Array(sizeX * sizeZ);
  const column = (x: number, z: number): [number, number] => [Math.floor((x - minX) / voxel), Math.floor((z - minZ) / voxel)];

  for (const { grid, labels, toBoard } of tiles) {
    // Each solid voxel's centre, on the board: a turn by quarters keeps centres on centres.
    const [ox, oy, oz] = grid.origin;
    const s = grid.step;
    const { cells } = grid;
    for (let v = 0; v < grid.count; v++) {
      const [bx, by, bz] = apply(toBoard, ox + (cells[3 * v]! + 0.5) * s, oy + (cells[3 * v + 2]! + 0.5) * s, oz + (cells[3 * v + 1]! + 0.5) * s);
      const [x, z] = column(bx, bz);
      const layer = Math.floor(by / voxel);
      if (x < 0 || z < 0 || x >= sizeX || z >= sizeZ || layer < 0 || layer >= layers) continue;
      solid[x + sizeX * (z + sizeZ * layer)] = 1;
    }
    if (!labels) continue;
    // The roads' and the cities' columns. A road keeps its label where a city's column falls on the same board column.
    const { size, feature, cell } = labels;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const f = feature[row * size + col]!;
        if (f !== WALK_GROUND.road && f !== WALK_GROUND.city) continue;
        const [bx, , bz] = apply(toBoard, labels.minX + (col + 0.5) * cell, oy, labels.minZ + (row + 0.5) * cell);
        const [x, z] = column(bx, bz);
        if (x < 0 || z < 0 || x >= sizeX || z >= sizeZ) continue;
        const k = x + sizeX * z;
        if (ground[k] !== WALK_GROUND.road) ground[k] = f;
      }
    }
  }
  return new WalkMap(voxel, minX, minZ, sizeX, sizeZ, layers, solid, ground);
}
