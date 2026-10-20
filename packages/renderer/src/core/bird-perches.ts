// The birds' perches (BIRDS, #574): the tree tops of a model type, read off its voxel grid (`voxelizer.ts`) once per type. No three
// here; the birds' chunk (`birds.ts`) holds this module.
import { BASE_PALETTE_CLASSES, FOREST_PALETTE_CLASSES } from "./features";
import type { PaletteName } from "./feature-layout";
import type { VoxelGrid } from "./voxelizer";

/** How a tree top is told from the grass and the bushes, in voxels. */
export interface PerchRules {
  /** The least height of a tree top over the ground slab's top: the grass and the low bushes are under it. */
  minAbove: number;
  /** A tree top is the highest vegetation column within this many columns around it (a square). */
  radius: number;
  /** Two perches at least this many columns apart: one perch per crown. */
  spacing: number;
}

export const DEFAULT_PERCH_RULES: PerchRules = { minAbove: 3, radius: 2, spacing: 4 };

/** The vegetation entries of a palette (grass, leaves, trunks: `features.ts`), what a forest column is topped with. */
export const vegetationOf = (palette: PaletteName): readonly number[] => (palette === "forest" ? FOREST_PALETTE_CLASSES : BASE_PALETTE_CLASSES).vegetation;

/**
 * The perches of a grid: the tree tops, as x, y, z in the grid's model frame (the centre of the top voxel's top face), highest
 * first. A tree top is a column topped with vegetation, at least `minAbove` voxels over the slab, the highest within `radius`
 * columns; of two closer than `spacing`, the higher stays.
 */
export function findPerches(grid: VoxelGrid, vegetation: readonly number[], rules: PerchRules = DEFAULT_PERCH_RULES): Float32Array {
  const { sizeX, sizeY } = grid;
  const isVegetation = new Uint8Array(256);
  for (const e of vegetation) isVegetation[e] = 1;
  // The top of each column (-1: empty) and its entry: the voxels are sorted by layer, so the last one seen is the top.
  const top = new Int16Array(sizeX * sizeY).fill(-1);
  const entry = new Uint8Array(sizeX * sizeY);
  for (let v = 0; v < grid.count; v++) {
    const c = grid.cells[v * 3]! + sizeX * grid.cells[v * 3 + 1]!;
    top[c] = grid.cells[v * 3 + 2]!;
    entry[c] = grid.entry[v]!;
  }
  const floor = grid.groundTop + rules.minAbove;
  const tree = (c: number) => top[c]! >= floor && isVegetation[entry[c]!] === 1;
  const candidates: number[] = [];
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      const c = x + sizeX * y;
      if (!tree(c)) continue;
      let highest = true;
      for (let dy = -rules.radius; dy <= rules.radius && highest; dy++) {
        for (let dx = -rules.radius; dx <= rules.radius; dx++) {
          const [nx, ny] = [x + dx, y + dy];
          if (nx < 0 || ny < 0 || nx >= sizeX || ny >= sizeY) continue;
          if (top[nx + sizeX * ny]! > top[c]!) {
            highest = false;
            break;
          }
        }
      }
      if (highest) candidates.push(c);
    }
  }
  // Highest first, then in column order: the same perches on every run.
  candidates.sort((a, b) => top[b]! - top[a]! || a - b);
  const kept: number[] = [];
  for (const c of candidates) {
    const [x, y] = [c % sizeX, Math.floor(c / sizeX)];
    if (kept.every((k) => Math.max(Math.abs((k % sizeX) - x), Math.abs(Math.floor(k / sizeX) - y)) >= rules.spacing)) kept.push(c);
  }
  const [ox, oy, oz] = grid.origin;
  const out = new Float32Array(kept.length * 3);
  kept.forEach((c, i) => {
    out[i * 3] = ox + ((c % sizeX) + 0.5) * grid.step;
    out[i * 3 + 1] = oy + (top[c]! + 1) * grid.step;
    out[i * 3 + 2] = oz + (Math.floor(c / sizeX) + 0.5) * grid.step;
  });
  return out;
}
