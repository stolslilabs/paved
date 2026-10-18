// No three here: the windows of a model and their light are typed arrays over the voxel grid (`voxelizer.ts`), built once per
// model type, in the day and night cycle's chunk (NIGHT-WINDOWS, #513). Nothing calls this while the night lights are off.
import { traceMeasure, traceStart } from "./load-trace";
import { cellIndex, type VoxelGrid } from "./voxelizer";

/**
 * The windows of a tile model, found in its voxel grid, and the light they cast baked into a volume over the same grid.
 *
 * A window here is an air opening in a wall plane: up to 6 cells in a filled rectangle (1 x 1 to 3 x 2, and 4 x 1), with solid
 * behind every cell, solid all round it in the wall's plane (sides, lintel, sill) and air in front. A door is the same
 * opening standing on the ground slab and at least two cells high. The openings on the slab that are not as tall (the gaps
 * between trees and stones) are `gap`s: found, told apart, never lit.
 *
 * The light volume holds, per air cell, the light the windows' openings cast on it (channel 0, 0 to 255) and the index of the
 * window that gave the most (channel 1, the window's place in the list plus one, 0 for none). The light stops at the solid
 * voxels: the flood walks through air only; the rays are blocked by the first solid cell on the way. It stops at the tile's
 * border too: a window at the edge does not light the next tile.
 */

/** The four horizontal directions a wall can face, as grid steps (x, y of the ground); the wall's outside is `+direction`. */
export const WALL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export type OpeningKind = "window" | "door" | "gap";

/** One opening: its cells (the rectangle's lowest-left corner and size), the wall's outward direction and what it is. */
export interface Window {
  readonly kind: OpeningKind;
  /** Index into `WALL_DIRECTIONS`: the outward direction of the wall. */
  readonly facing: number;
  /** The rectangle's first cell (smallest x, smallest y, lowest layer). */
  readonly x: number;
  readonly y: number;
  readonly layer: number;
  /** Its width along the wall (in cells), its height (in layers). */
  readonly width: number;
  readonly height: number;
  /** The palette entry of the solid at the back of the opening (the colour a window reads in), taken at its first cell. */
  readonly back: number;
}

/** The biggest opening, in cells, that counts as a window (the issue's 3 x 2, and the 4 x 1 strip the models have). */
export const MAX_WINDOW_CELLS = 6;
export const MAX_WINDOW_WIDTH = 4;
export const MAX_WINDOW_HEIGHT = 2;
/** A door, on the slab, may be taller. */
export const MAX_DOOR_HEIGHT = 4;

/** The cells of an opening, as grid cells. */
export function windowCells(window: Window): Array<readonly [number, number, number]> {
  const [dx, dy] = WALL_DIRECTIONS[window.facing]!;
  // Along the wall: perpendicular to the outward direction, always the positive axis.
  const [ax, ay] = dx === 0 ? [1, 0] : [0, 1];
  const cells: Array<readonly [number, number, number]> = [];
  for (let w = 0; w < window.width; w++) for (let h = 0; h < window.height; h++) cells.push([window.x + ax * w, window.y + ay * w, window.layer + h]);
  return cells;
}

interface Found {
  windows: Window[];
  /** The openings that were found and rejected, with why: for the story and the tests. */
  rejected: Array<{ reason: string; facing: number; x: number; y: number; layer: number }>;
}

/**
 * Finds the openings of a grid. `lit` is the columns' lights (`lightColumns`, one byte a column of the 40 x 40 footprint, row by
 * row): an opening is kept only on a lit column (the window's own, or the one behind it); without it every opening is kept.
 */
export function detectWindows(grid: VoxelGrid, lit?: Uint8Array): Window[] {
  return findOpenings(grid, lit).windows;
}

export function findOpenings(grid: VoxelGrid, lit?: Uint8Array): Found {
  const start = traceStart();
  const { sizeX, sizeY, layers, occupied } = grid;
  const solid = (x: number, y: number, l: number) => x >= 0 && y >= 0 && l >= 0 && x < sizeX && y < sizeY && l < layers && occupied[cellIndex(grid, x, y, l)] === 1;
  const air = (x: number, y: number, l: number) => x >= 0 && y >= 0 && l >= 0 && x < sizeX && y < sizeY && l < layers && occupied[cellIndex(grid, x, y, l)] === 0;
  const windows: Window[] = [];
  const rejected: Found["rejected"] = [];
  const slab = grid.groundTop;
  const seen = new Uint8Array(sizeX * sizeY * layers);
  const entries = new Uint8Array(sizeX * sizeY * layers);
  for (let v = 0; v < grid.count; v++) entries[cellIndex(grid, grid.cells[v * 3]!, grid.cells[v * 3 + 1]!, grid.cells[v * 3 + 2]!)] = grid.entry[v]!;
  const entryAt = (x: number, y: number, l: number) => entries[cellIndex(grid, x, y, l)]!;

  WALL_DIRECTIONS.forEach(([dx, dy], facing) => {
    const [ax, ay] = dx === 0 ? [1, 0] : [0, 1];
    // A candidate: air with solid behind it and air in front (the wall's plane seen from outside).
    const candidate = (x: number, y: number, l: number) => air(x, y, l) && solid(x - dx, y - dy, l) && air(x + dx, y + dy, l);
    seen.fill(0);
    for (let l = slab + 1; l < layers; l++) {
      for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
          if (seen[cellIndex(grid, x, y, l)] || !candidate(x, y, l)) continue;
          // The component of candidates in the wall's plane (4-neighbours along the wall and the height).
          const stack: Array<[number, number, number]> = [[x, y, l]];
          const cells: Array<[number, number, number]> = [];
          seen[cellIndex(grid, x, y, l)] = 1;
          let size = 0;
          while (stack.length && size <= 64) {
            const [cx, cy, cl] = stack.pop()!;
            cells.push([cx, cy, cl]);
            size++;
            for (const [sx, sy, sl] of [
              [ax, ay, 0],
              [-ax, -ay, 0],
              [0, 0, 1],
              [0, 0, -1],
            ] as const) {
              const [nx, ny, nl] = [cx + sx, cy + sy, cl + sl];
              if (!candidate(nx, ny, nl) || seen[cellIndex(grid, nx, ny, nl)]) continue;
              seen[cellIndex(grid, nx, ny, nl)] = 1;
              stack.push([nx, ny, nl]);
            }
          }
          // The component's box along the wall.
          const along = (c: readonly [number, number, number]) => (dx === 0 ? c[0] : c[1]);
          const [lo, hi] = [Math.min(...cells.map(along)), Math.max(...cells.map(along))];
          const [lowL, highL] = [Math.min(...cells.map((c) => c[2])), Math.max(...cells.map((c) => c[2]))];
          const [width, height] = [hi - lo + 1, highL - lowL + 1];
          const first = cells.find((c) => along(c) === lo && c[2] === lowL) ?? cells[0]!;
          const reject = (reason: string) => rejected.push({ reason, facing, x: first[0], y: first[1], layer: lowL });
          if (size > 64 || cells.length !== width * height) {
            reject("not a rectangle");
            continue;
          }
          const onSlab = lowL === slab + 1;
          if (width > MAX_WINDOW_WIDTH || height > (onSlab ? MAX_DOOR_HEIGHT : MAX_WINDOW_HEIGHT) || (!onSlab && cells.length > MAX_WINDOW_CELLS)) {
            reject("too large");
            continue;
          }
          // Solid all round it in the wall's plane: the sides, the lintel and the sill (not the corners).
          let closed = true;
          for (let h = 0; h < height; h++) closed &&= solid(first[0] - ax, first[1] - ay, lowL + h) && solid(first[0] + ax * width, first[1] + ay * width, lowL + h);
          for (let w = 0; w < width; w++) closed &&= solid(first[0] + ax * w, first[1] + ay * w, lowL - 1) && solid(first[0] + ax * w, first[1] + ay * w, lowL + height);
          if (!closed) {
            reject("open ring");
            continue;
          }
          let kind: OpeningKind = "window";
          if (onSlab) kind = height >= 2 ? "door" : "gap";
          const behindX = first[0] - dx;
          const behindY = first[1] - dy;
          if (lit) {
            const column = (px: number, py: number) => (px >= 0 && py >= 0 && px < sizeX && py < sizeY ? lit[py * sizeX + px] : 0);
            let lights = false;
            for (let w = 0; w < width; w++) lights ||= column(first[0] + ax * w, first[1] + ay * w) === 1 || column(behindX + ax * w, behindY + ay * w) === 1;
            if (!lights) {
              reject("unlit column");
              continue;
            }
          }
          const back = entryAt(behindX, behindY, lowL);
          windows.push({ kind, facing, x: first[0], y: first[1], layer: lowL, width, height, back });
        }
      }
    }
  });
  traceMeasure("windows", start);
  return { windows, rejected };
}

/** The light a window casts: how it reaches into the air in front of it. */
export type VolumeMethod = "flood" | "rays";

export interface LightVolumeOptions {
  /** How far the light reaches out of an opening, in voxels. */
  reach: number;
  /** The falloff's exponent: 1 is linear, above 1 it drops faster near the window. */
  falloff: number;
  /** "flood" walks the air cells step by step; "rays" casts a short ray from the opening to each cell in reach. */
  method: VolumeMethod;
  /** Which openings cast light: windows always, doors when set (a lit door is a lit door). */
  doors: boolean;
}

export const DEFAULT_LIGHT_VOLUME: LightVolumeOptions = { reach: 6, falloff: 1.5, method: "flood", doors: true };

/** A model's light volume: `light` and `owner` over the grid's cells in `cellIndex` order, and what the RG8 texture holds. */
export interface LightVolume {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly layers: number;
  /** The windows (in their list order) that cast light: `owner` is the index in this list plus one. */
  readonly sources: readonly Window[];
  /** Two bytes a cell, the light then the window: the texture's data (RG8, `x` fastest, then `y`, then the layer). */
  readonly data: Uint8Array;
  /** The size of `data` in bytes. */
  readonly bytes: number;
  /** How long the build took, in ms. */
  readonly buildMs: number;
}

const light = (volume: Pick<LightVolume, "data">, i: number) => volume.data[i * 2]!;
export { light as lightAt };

/** True when the segment from `a` to `b` (cell centres) crosses a solid cell other than at its ends: a ray's test, a voxel walk. */
function blocked(grid: VoxelGrid, a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
  const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 2;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const [x, y, l] = [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
    if (x === b[0] && y === b[1] && l === b[2]) continue;
    if (x === a[0] && y === a[1] && l === a[2]) continue;
    if (grid.occupied[cellIndex(grid, x, y, l)]) return true;
  }
  return false;
}

/**
 * The light volume of a grid's windows. Each opening's light starts at its front cells at full strength and falls off with the
 * distance (Euclidean, in cells) over `reach`, `(1 - d / reach) ** falloff`, in the half space in front of the wall only. Where
 * two openings reach a cell the brighter one wins and is the owner.
 */
export function buildLightVolume(grid: VoxelGrid, windows: readonly Window[], options: Partial<LightVolumeOptions> = {}): LightVolume {
  const began = performance.now();
  const { reach, falloff, method, doors } = { ...DEFAULT_LIGHT_VOLUME, ...options };
  const { sizeX, sizeY, layers } = grid;
  const data = new Uint8Array(sizeX * sizeY * layers * 2);
  const sources = windows.filter((w) => w.kind === "window" || (doors && w.kind === "door"));
  const radius = Math.ceil(reach);
  const queue: number[] = [];
  const distance = new Float32Array(sizeX * sizeY * layers);
  sources.forEach((window, index) => {
    const [dx, dy] = WALL_DIRECTIONS[window.facing]!;
    const own = windowCells(window);
    const deposit = (i: number, d: number) => {
      const value = Math.round(255 * Math.max(0, 1 - d / reach) ** falloff);
      if (value > data[i * 2]!) {
        data[i * 2] = value;
        data[i * 2 + 1] = index + 1;
      }
    };
    if (method === "rays") {
      // Every air cell of the box around the opening, in front of its plane, with a clear line to one of its cells.
      const [cx, cy, cl] = own[0]!;
      for (let l = cl - radius; l <= cl + window.height - 1 + radius; l++) {
        for (let y = cy - radius - window.width; y <= cy + radius + window.width; y++) {
          for (let x = cx - radius - window.width; x <= cx + radius + window.width; x++) {
            if (x < 0 || y < 0 || l < 0 || x >= sizeX || y >= sizeY || l >= layers) continue;
            const i = cellIndex(grid, x, y, l);
            if (grid.occupied[i]) continue;
            if ((x - cx) * dx + (y - cy) * dy < 0) continue;
            let best = Infinity;
            for (const cell of own) {
              const d = Math.hypot(x - cell[0], y - cell[1], l - cell[2]);
              if (d < best && !blocked(grid, cell, [x, y, l])) best = d;
            }
            if (best <= reach) deposit(i, best);
          }
        }
      }
    } else {
      // The flood: the air cells reached from the opening through air only, within a path of 1.5 x reach steps.
      distance.fill(-1);
      queue.length = 0;
      for (const [x, y, l] of own) {
        const i = cellIndex(grid, x, y, l);
        distance[i] = 0;
        queue.push(x, y, l);
        deposit(i, 0);
      }
      const limit = Math.ceil(reach * 1.5);
      for (let head = 0; head < queue.length; head += 3) {
        const [x, y, l] = [queue[head]!, queue[head + 1]!, queue[head + 2]!];
        const steps = distance[cellIndex(grid, x, y, l)]!;
        if (steps >= limit) continue;
        for (const [sx, sy, sl] of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ] as const) {
          const [nx, ny, nl] = [x + sx, y + sy, l + sl];
          if (nx < 0 || ny < 0 || nl < 0 || nx >= sizeX || ny >= sizeY || nl >= layers) continue;
          const n = cellIndex(grid, nx, ny, nl);
          if (distance[n]! >= 0 || grid.occupied[n]) continue;
          if ((nx - own[0]![0]) * dx + (ny - own[0]![1]) * dy < 0) continue;
          distance[n] = steps + 1;
          queue.push(nx, ny, nl);
          const d = Math.min(...own.map((c) => Math.hypot(nx - c[0], ny - c[1], nl - c[2])));
          if (d <= reach) deposit(n, d);
        }
      }
    }
  });
  return { sizeX, sizeY, layers, sources, data, bytes: data.byteLength, buildMs: performance.now() - began };
}

/** The window that gives a cell its light, if any (`owner - 1` indexes `LightVolume.sources`). */
export function ownerAt(volume: LightVolume, x: number, y: number, layer: number): Window | null {
  const owner = volume.data[(x + volume.sizeX * (y + volume.sizeY * layer)) * 2 + 1]!;
  return owner ? volume.sources[owner - 1]! : null;
}

/** The light at a cell, 0 to 255 (0 past the volume). */
export function lightOf(volume: LightVolume, x: number, y: number, layer: number): number {
  if (x < 0 || y < 0 || layer < 0 || x >= volume.sizeX || y >= volume.sizeY || layer >= volume.layers) return 0;
  return volume.data[(x + volume.sizeX * (y + volume.sizeY * layer)) * 2]!;
}

/** What a model type keeps: its windows and their light, with the cost of making them. */
export interface BakedWindows {
  readonly windows: readonly Window[];
  readonly volume: LightVolume;
  /** The detection's time, in ms (the volume's is `volume.buildMs`). */
  readonly detectMs: number;
}

function whenIdle(task: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(task, { timeout: 250 });
  else setTimeout(task, 0);
}

/** Detects and bakes in one go. */
export function bakeWindows(grid: VoxelGrid, lit?: Uint8Array, options: Partial<LightVolumeOptions> = {}): BakedWindows {
  const began = performance.now();
  const windows = detectWindows(grid, lit);
  const detectMs = performance.now() - began;
  return { windows, volume: buildLightVolume(grid, windows, options), detectMs };
}

/**
 * The baked windows of a board's model types, one per type, shared as the grids are (`VoxelCache`): `request` bakes in an idle
 * slice, one type a slice; nothing is built until it is asked, so nothing is built while the night lights are off. `clear`
 * lets go of every volume (they are typed arrays here; the renderer's textures are its own and are disposed with it).
 */
export class WindowCache {
  private readonly baked = new Map<string, BakedWindows>();
  private readonly pending = new Map<string, Promise<BakedWindows | null>>();

  peek(key: string): BakedWindows | undefined {
    return this.baked.get(key);
  }

  request(key: string, grid: VoxelGrid, lit?: Uint8Array, options: Partial<LightVolumeOptions> = {}, skip?: () => boolean): Promise<BakedWindows | null> {
    const known = this.baked.get(key);
    if (known) return Promise.resolve(known);
    let pending = this.pending.get(key);
    if (!pending) {
      const created: Promise<BakedWindows | null> = new Promise<BakedWindows | null>((resolve) => {
        whenIdle(() => {
          // A reader that no longer wants the volume (`skip`, asked when the slice runs) builds nothing.
          if (skip?.()) {
            if (this.pending.get(key) === created) this.pending.delete(key);
            resolve(null);
            return;
          }
          const baked = bakeWindows(grid, lit, options);
          if (this.pending.get(key) === created) {
            this.pending.delete(key);
            this.baked.set(key, baked);
          }
          resolve(baked);
        });
      });
      pending = created;
      this.pending.set(key, pending);
    }
    return pending;
  }

  forget(key: string): void {
    this.baked.delete(key);
    this.pending.delete(key);
  }

  clear(): void {
    this.baked.clear();
    this.pending.clear();
  }

  get size(): number {
    return this.baked.size;
  }
}
