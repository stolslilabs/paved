// When each voxel of a tile is launched (VOXEL-DROP, #512): layer by layer from the bottom, within a layer from the tile's centre
// to its edges. Pure arithmetic on the voxelizer's typed arrays, no three.
import type { VoxelDropSettings } from "./voxel-drop-settings";

/** What the schedule reads of a `VoxelGrid`. */
export interface ScheduleGrid {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly layers: number;
  readonly count: number;
  readonly cells: Uint8Array;
  /** The layer of the ground slab's top. */
  readonly groundTop: number;
  readonly slabCount: number;
}

export interface DropSchedule {
  /** The launch time of each voxel (the grid's order), ms from the start of the drop. */
  delays: Float32Array;
  /** The whole drop, ms: the last voxel lands then. */
  durationMs: number;
  /** One voxel's fall, ms: the setting's, at most 80 % of the duration (the shader reads this one). */
  fallMs: number;
  /** The last launch, ms: `durationMs` minus one fall. */
  launchMs: number;
  /** Where the ground slab's launches end and the decor's begin, ms. */
  slabEndMs: number;
}

/** The drop's duration for a tile with `decor` voxels above its ground slab, clamped to the settings' bounds. */
export function dropDuration(decor: number, s: Pick<VoxelDropSettings, "baseMs" | "msPerVoxel" | "minMs" | "maxMs">): number {
  return Math.min(s.maxMs, Math.max(s.minMs, s.baseMs + s.msPerVoxel * decor));
}

/** A fixed pseudo-random number in [0, 1) for a cell: the same tile always drops the same way. */
function hash01(x: number, y: number, layer: number): number {
  let h = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b) ^ Math.imul(layer + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * The launch time of every voxel. The launch window is the duration minus one fall; the ground slab's layers share the first
 * `slabShare` of it and the decor's layers the rest, each layer a part of its phase in proportion to its voxels (a steady
 * number of launches a frame). Within a layer a voxel waits by its distance from the centre (nearest first, with `jitter`),
 * and a layer's window runs into the next one by `overlap`.
 */
export function planDrop(grid: ScheduleGrid, s: VoxelDropSettings): DropSchedule {
  const decor = grid.count - grid.slabCount;
  const durationMs = dropDuration(decor, s);
  const fallMs = Math.min(s.fallMs, durationMs * 0.8);
  const launchMs = Math.max(0, durationMs - fallMs);
  const slabEndMs = decor > 0 && grid.slabCount > 0 ? launchMs * s.slabShare : decor > 0 ? 0 : launchMs;
  const delays = new Float32Array(grid.count);
  const { cells } = grid;
  const [cx, cy] = [grid.sizeX / 2, grid.sizeY / 2];

  // The voxels of each layer are contiguous (the grid's order).
  const first = new Int32Array(grid.layers + 1);
  for (let v = 0; v < grid.count; v++) first[cells[v * 3 + 2]! + 1]!++;
  for (let l = 0; l < grid.layers; l++) first[l + 1]! += first[l]!;

  const phase = (fromLayer: number, toLayer: number, start: number, end: number) => {
    const total = first[toLayer + 1]! - first[fromLayer]!;
    if (total <= 0) return;
    const span = end - start;
    const relative = new Float32Array(total);
    let maxRelative = 0;
    for (let l = fromLayer; l <= toLayer; l++) {
      const [from, to] = [first[l]!, first[l + 1]!];
      if (to === from) continue;
      const a = ((from - first[fromLayer]!) / total) * span;
      const b = ((to - first[fromLayer]!) / total) * span;
      // The nearest and farthest voxel of the layer: its distances run from 0 to 1.
      let [near, far] = [Infinity, -Infinity];
      for (let v = from; v < to; v++) {
        const d = Math.hypot(cells[v * 3]! + 0.5 - cx, cells[v * 3 + 1]! + 0.5 - cy);
        if (d < near) near = d;
        if (d > far) far = d;
      }
      const spread = far - near || 1;
      const window = (b - a) * (1 + 3 * s.overlap);
      for (let v = from; v < to; v++) {
        const d = Math.hypot(cells[v * 3]! + 0.5 - cx, cells[v * 3 + 1]! + 0.5 - cy);
        const r = (d - near) / spread + s.jitter * (hash01(cells[v * 3]!, cells[v * 3 + 1]!, l) - 0.5);
        const at = a + Math.min(1, Math.max(0, r)) * window;
        relative[v - first[fromLayer]!] = at;
        if (at > maxRelative) maxRelative = at;
      }
    }
    // The overlap and the last layers must not run past the phase's end.
    const shrink = maxRelative > span ? span / maxRelative : 1;
    for (let i = 0; i < total; i++) delays[first[fromLayer]! + i] = start + relative[i]! * shrink;
  };

  const slabLayers = Math.min(grid.groundTop, grid.layers - 1);
  phase(0, slabLayers, 0, slabEndMs);
  if (slabLayers + 1 < grid.layers) phase(slabLayers + 1, grid.layers - 1, slabEndMs, launchMs);
  return { delays, durationMs, fallMs, launchMs, slabEndMs };
}
