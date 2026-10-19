// No three here: the windows of a model and their light are typed arrays over the voxel grid (`voxelizer.ts`), built once per
// model type, in the day and night cycle's chunk (NIGHT-WINDOWS, #513). Nothing calls this while the night lights are off.
import { WINDOW_SPILL_LAYERS } from "./daynight-settings";
import { traceMeasure, traceStart } from "./load-trace";
import { cellIndex, type VoxelGrid } from "./voxelizer";

/**
 * The windows of a tile model, found in its voxel grid, and the light they cast baked into a volume over the same grid.
 *
 * A window here is an air opening in a wall plane: up to 6 cells in a filled rectangle (1 x 1 to 3 x 2, and 4 x 1), with solid
 * all round it in the wall's plane (sides, lintel, sill), air in front, and behind it either solid (a recess, #513's windows)
 * or a room (#571: the houses and the towers are hollow, their walls one voxel thick, and their windows holes through them).
 * A door is the same opening standing on the ground slab and at least two cells high. The openings on the slab that are not
 * as tall (the gaps between trees and stones) are `gap`s: found, told apart, never lit.
 *
 * The light volume holds, per air cell, the light the windows' openings cast on it (channel 0, 0 to 255) and the index of the
 * window that gave the most (channel 1, the window's owner in the list plus one, 0 for none). The light stops at the solid
 * voxels: the flood walks through air only; the rays are blocked by the first solid cell on the way. Past the tile's border
 * it goes on over a flat slab for `margin` voxels, kept apart (`LightVolume.spill`) for the neighbours to read.
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
  /** True for an opening through a thin wall into a room (#571: the houses' and towers'), false for a recess (#513's). */
  readonly through: boolean;
}

/** The biggest opening, in cells, that counts as a window (the issue's 3 x 2, and the 4 x 1 strip the models have). */
export const MAX_WINDOW_CELLS = 6;
export const MAX_WINDOW_WIDTH = 4;
export const MAX_WINDOW_HEIGHT = 2;
/** A door, on the slab, may be taller. */
export const MAX_DOOR_HEIGHT = 4;
/** How far the rays that tell a building's inside from the street look for a solid cell, in voxels (`findOpenings`). */
export const INSIDE_REACH = 8;

/** The cells of an opening, as grid cells. */
export function windowCells(window: Window): Array<readonly [number, number, number]> {
  const [dx, dy] = WALL_DIRECTIONS[window.facing]!;
  // Along the wall: perpendicular to the outward direction, always the positive axis.
  const [ax, ay] = dx === 0 ? [1, 0] : [0, 1];
  const cells: Array<readonly [number, number, number]> = [];
  for (let w = 0; w < window.width; w++) for (let h = 0; h < window.height; h++) cells.push([window.x + ax * w, window.y + ay * w, window.layer + h]);
  return cells;
}

/** Why an opening that has a window's shape is not kept (`OpeningFilter`). */
export type DropReason = "vegetation" | "unlit column";

export interface Found {
  windows: Window[];
  /** The openings that were found and rejected, with why: for the story and the tests. */
  rejected: Array<{ reason: string; facing: number; x: number; y: number; layer: number }>;
  /** The openings of a window's shape that the filter drops, whole, with why (the story's orange boxes). */
  dropped: Array<Window & { readonly reason: DropReason }>;
}

/**
 * Which openings a building keeps (NIGHT-WINDOWS-2, #571). `vegetation`: the palette entries of leaves, trunks and grass
 * (`PaletteClasses.vegetation`); an opening whose wall (the solid ring round it, and its back) is mostly of them is a pocket in a
 * tree, not a window ("vegetation"). `lit`: the columns' lights (`lightColumns`, one byte a column of the 40 x 40 footprint, row
 * by row): when given, an opening is kept only on a lit column, its own or the one behind it ("unlit column"), the first pass's
 * rule, which drops every building farther than 2 columns from a road. A `Uint8Array` alone is `lit`. With neither, every
 * opening is kept.
 */
export interface OpeningFilter {
  readonly vegetation?: readonly number[];
  readonly lit?: Uint8Array;
}

/** The rule the renderer keeps windows by: the structures' (`vegetation`), or the first pass's lit columns (`lit`). */
export type WindowRule = "structures" | "columns";

/**
 * The greys the classifier's vegetation class holds (`#666b6e` to `#8b9194`: the rocks of a forest), which are also the walls of
 * stone buildings (the house of `wffffffff`): not plants for the windows.
 */
const STONE_GREYS = new Set([184, 185, 187, 188]);

/** The palette entries a window's wall cannot mostly be: a class table's vegetation but its greys. */
export const plantEntries = (vegetation: readonly number[]): number[] => vegetation.filter((entry) => !STONE_GREYS.has(entry));

const filterOf = (filter?: Uint8Array | OpeningFilter): OpeningFilter => (filter instanceof Uint8Array ? { lit: filter } : (filter ?? {}));

/** Finds the openings of a grid and keeps those `filter` keeps (`OpeningFilter`). */
export function detectWindows(grid: VoxelGrid, filter?: Uint8Array | OpeningFilter): Window[] {
  return findOpenings(grid, filter).windows;
}

export function findOpenings(grid: VoxelGrid, filter?: Uint8Array | OpeningFilter): Found {
  const { lit, vegetation } = filterOf(filter);
  const plant = new Uint8Array(256);
  for (const entry of vegetation ?? []) plant[entry] = 1;
  const start = traceStart();
  const { sizeX, sizeY, layers, occupied } = grid;
  const solid = (x: number, y: number, l: number) => x >= 0 && y >= 0 && l >= 0 && x < sizeX && y < sizeY && l < layers && occupied[cellIndex(grid, x, y, l)] === 1;
  const air = (x: number, y: number, l: number) => x >= 0 && y >= 0 && l >= 0 && x < sizeX && y < sizeY && l < layers && occupied[cellIndex(grid, x, y, l)] === 0;
  const windows: Window[] = [];
  const rejected: Found["rejected"] = [];
  const dropped: Found["dropped"] = [];
  const slab = grid.groundTop;
  const seen = new Uint8Array(sizeX * sizeY * layers);
  const entries = new Uint8Array(sizeX * sizeY * layers);
  for (let v = 0; v < grid.count; v++) entries[cellIndex(grid, grid.cells[v * 3]!, grid.cells[v * 3 + 1]!, grid.cells[v * 3 + 2]!)] = grid.entry[v]!;
  const entryAt = (x: number, y: number, l: number) => entries[cellIndex(grid, x, y, l)]!;

  WALL_DIRECTIONS.forEach(([dx, dy], facing) => {
    const [ax, ay] = dx === 0 ? [1, 0] : [0, 1];
    // A roof close over a cell: within 3 layers.
    const roofed = (x: number, y: number, l: number) => solid(x, y, l + 1) || solid(x, y, l + 2) || solid(x, y, l + 3);
    // An opening through a thin wall: air behind it too, a room's, the cell itself in a wall's plane (a solid neighbour in the
    // plane) and open sky right over the cell in front (the cell one step inside a house, whose front is the opening under its
    // lintel, is not one). A room: air beside the cell behind, above or below it, or a closed end straight back from it (a
    // narrow house's corridor) before the roof ends; a hole straight through a block is a tunnel. Which side is the inside is
    // decided per opening (`insideBehind`).
    const opensOnRoom = (x: number, y: number, l: number) => {
      const [bx, by] = [x - dx, y - dy];
      if (!air(bx, by, l) || solid(x + dx, y + dy, l + 1)) return false;
      if (!(solid(x + ax, y + ay, l) || solid(x - ax, y - ay, l) || solid(x, y, l + 1) || solid(x, y, l - 1))) return false;
      if (air(bx + ax, by + ay, l) || air(bx - ax, by - ay, l) || air(bx, by, l + 1) || air(bx, by, l - 1)) return true;
      for (let s = 1; s <= INSIDE_REACH; s++) {
        const [cx, cy] = [bx - dx * s, by - dy * s];
        if (solid(cx, cy, l)) return true;
        if (!air(cx, cy, l) || !roofed(cx, cy, l)) return false;
      }
      return false;
    };
    // A candidate: air with solid behind it (a recess) or a room behind it (`opensOnRoom`), and air in front (the wall's plane
    // seen from outside).
    const candidate = (x: number, y: number, l: number) => air(x, y, l) && air(x + dx, y + dy, l) && (solid(x - dx, y - dy, l) || opensOnRoom(x, y, l));
    // How enclosed an air cell is: of the rays up and along the four horizontal directions but `away` (toward the opening), the
    // number that meet a solid cell within `INSIDE_REACH`. The inside of a building scores more than the street in front.
    const enclosure = (x: number, y: number, l: number, awayX: number, awayY: number) => {
      let hits = 0;
      for (const [sx, sy, sl] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
      ] as const) {
        if (sx === awayX && sy === awayY && sl === 0) continue;
        for (let s = 1; s <= INSIDE_REACH; s++) {
          if (solid(x + sx * s, y + sy * s, l + sl * s)) {
            hits++;
            break;
          }
        }
      }
      return hits;
    };
    // Whether the room is behind the opening at (x, y, l), not in front: a roof close over the back and none over the front, or,
    // when both or neither have one (eaves, an open belfry), the back the more enclosed.
    const insideBehind = (x: number, y: number, l: number) => {
      const [back, front] = [roofed(x - dx, y - dy, l), roofed(x + dx, y + dy, l)];
      if (back !== front) return back;
      return enclosure(x - dx, y - dy, l, dx, dy) > enclosure(x + dx, y + dy, l, -dx, -dy);
    };
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
          // An opening through the wall is a window only from the outside (the same hole seen from the room is not one).
          const open = cells.find((c) => air(c[0] - dx, c[1] - dy, c[2]));
          if (open && !insideBehind(open[0], open[1], open[2])) {
            reject("seen from inside");
            continue;
          }
          let kind: OpeningKind = "window";
          if (onSlab) kind = height >= 2 ? "door" : "gap";
          const behindX = first[0] - dx;
          const behindY = first[1] - dy;
          // Through the wall there is no back: the sill's colour stands in.
          const through = !!open;
          const back = through ? entryAt(first[0], first[1], lowL - 1) : entryAt(behindX, behindY, lowL);
          const found: Window = { kind, facing, x: first[0], y: first[1], layer: lowL, width, height, back, through };
          const drop = (reason: DropReason) => {
            reject(reason);
            dropped.push({ ...found, reason });
          };
          if (vegetation) {
            // The wall it opens in: the ring (sides, lintel, sill) and the solid cells behind it.
            const wall: number[] = [];
            for (let h = 0; h < height; h++) wall.push(entryAt(first[0] - ax, first[1] - ay, lowL + h), entryAt(first[0] + ax * width, first[1] + ay * width, lowL + h));
            for (let w = 0; w < width; w++) {
              const [cx, cy] = [first[0] + ax * w, first[1] + ay * w];
              wall.push(entryAt(cx, cy, lowL - 1), entryAt(cx, cy, lowL + height));
              for (let h = 0; h < height; h++) if (solid(cx - dx, cy - dy, lowL + h)) wall.push(entryAt(cx - dx, cy - dy, lowL + h));
            }
            if (wall.filter((entry) => plant[entry]).length * 2 > wall.length) {
              drop("vegetation");
              continue;
            }
          }
          if (lit) {
            const column = (px: number, py: number) => (px >= 0 && py >= 0 && px < sizeX && py < sizeY ? lit[py * sizeX + px] : 0);
            let lights = false;
            for (let w = 0; w < width; w++) lights ||= column(first[0] + ax * w, first[1] + ay * w) === 1 || column(behindX + ax * w, behindY + ay * w) === 1;
            if (!lights) {
              drop("unlit column");
              continue;
            }
          }
          windows.push(found);
        }
      }
    }
  });
  traceMeasure("windows", start);
  return { windows, rejected, dropped };
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
  /**
   * How far past the tile's border the light goes, in voxels (NIGHT-WINDOWS-2, #571): the flood walks on into flat air over
   * the slab, and what lands past the border is kept in `spill`, which the neighbours' fragments read (`TileRenderer`).
   */
  margin: number;
}

/**
 * The second pass's defaults (#571): a longer reach and a margin past the border (the first: 6, 1.5, 0). The falloff is steeper
 * than the first's: the second pass finds about ten times the windows, and a soft falloff floods a city's ground whole.
 */
export const DEFAULT_LIGHT_VOLUME: LightVolumeOptions = { reach: 7, falloff: 2, method: "flood", doors: true, margin: 6 };

/** The layers above the slab the spill keeps, the brightest of them (`WINDOW_SPILL_LAYERS`). */
export const SPILL_LAYERS = WINDOW_SPILL_LAYERS;

/** The most cells a room behind a window holds (`buildLightVolume`); past it the walk stops. */
const ROOM_CELLS = 512;

/**
 * The light that leaves a tile (`LightVolume.spill`): a square of `size` x `size` columns, the tile's grid in its middle with
 * `margin` columns round it, two bytes a column (the light, then the owner as in the volume), row by row; 0 inside the tile.
 */
export interface LightSpill {
  readonly size: number;
  readonly margin: number;
  readonly data: Uint8Array;
}

/** A model's light volume: `light` and `owner` over the grid's cells in `cellIndex` order, and what the RG8 texture holds. */
export interface LightVolume {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly layers: number;
  /** The windows (in their list order) that cast light: `owner` is the index in this list plus one. */
  readonly sources: readonly Window[];
  /**
   * Each source's owner (an index into `sources`): its own, or, for windows that open on one room, the first of them, so the
   * windows of a room switch on together (a tower's four, a house's).
   */
  readonly owners: readonly number[];
  /** Two bytes a cell, the light then the window: the texture's data (RG8, `x` fastest, then `y`, then the layer). */
  readonly data: Uint8Array;
  /** The light past the tile's border (`margin` 0: an empty square of the grid's size). */
  readonly spill: LightSpill;
  /** The size of `data` in bytes (the spill's apart). */
  readonly bytes: number;
  /** How long the build took, in ms. */
  readonly buildMs: number;
}

const light = (volume: Pick<LightVolume, "data">, i: number) => volume.data[i * 2]!;
export { light as lightAt };

type Solid = (x: number, y: number, l: number) => boolean;

/** True when the segment from `a` to `b` (cell centres) crosses a solid cell other than at its ends: a ray's test, a voxel walk. */
function blocked(solid: Solid, a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
  const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 2;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const [x, y, l] = [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
    if (x === b[0] && y === b[1] && l === b[2]) continue;
    if (x === a[0] && y === a[1] && l === a[2]) continue;
    if (solid(x, y, l)) return true;
  }
  return false;
}

/**
 * The light volume of a grid's windows. Each opening's light starts at its front cells at full strength and falls off with the
 * distance (Euclidean, in cells) over `reach`, `(1 - d / reach) ** falloff`, in the half space in front of the wall only. Where
 * two openings reach a cell the brighter one wins and is the owner.
 *
 * An opening through a thin wall (`findOpenings`) looks into a room: the covered air behind it, walked from the cell behind the
 * opening. The room is lit full (its far wall is the window's glass, seen through it), and every window that opens on it takes
 * the first one's owner. Past the grid's border, within `margin`, the slab goes on flat with air over it: the light that lands
 * there is the `spill`.
 */
export function buildLightVolume(grid: VoxelGrid, windows: readonly Window[], options: Partial<LightVolumeOptions> = {}): LightVolume {
  const began = performance.now();
  const { reach, falloff, method, doors, margin: wanted } = { ...DEFAULT_LIGHT_VOLUME, ...options };
  const margin = Math.max(0, Math.round(wanted));
  const { sizeX, sizeY, layers, occupied, groundTop } = grid;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < sizeX && y < sizeY;
  // The grid and the margin round it: past the border, the slab and air over it.
  const solid: Solid = (x, y, l) => {
    if (l < 0 || l >= layers || x < -margin || y < -margin || x >= sizeX + margin || y >= sizeY + margin) return true;
    return inside(x, y) ? occupied[cellIndex(grid, x, y, l)] === 1 : l <= groundTop;
  };
  const [wideX, wideY] = [sizeX + 2 * margin, sizeY + 2 * margin];
  const wideIndex = (x: number, y: number, l: number) => x + margin + wideX * (y + margin + wideY * l);
  const data = new Uint8Array(sizeX * sizeY * layers * 2);
  const spillSize = Math.max(wideX, wideY);
  const spill = new Uint8Array(spillSize * spillSize * 2);
  const sources = windows.filter((w) => w.kind === "window" || (doors && w.kind === "door"));
  const owners = sources.map((_, index) => index);

  // The rooms: covered air (a solid cell above, within `INSIDE_REACH`) walked from the cell behind each opening through a wall.
  const room = new Int32Array(sizeX * sizeY * layers).fill(-1);
  const roomCells: number[][] = [];
  // Past the grid's top is open sky, not a roof.
  const covered = (x: number, y: number, l: number) => {
    for (let s = 1; s <= INSIDE_REACH && l + s < layers; s++) if (solid(x, y, l + s)) return true;
    return false;
  };
  sources.forEach((window, index) => {
    const [dx, dy] = WALL_DIRECTIONS[window.facing]!;
    const starts = windowCells(window)
      .map(([x, y, l]) => [x - dx, y - dy, l] as const)
      .filter(([x, y, l]) => inside(x, y) && !solid(x, y, l));
    if (!starts.length) return;
    const known = starts.map(([x, y, l]) => room[cellIndex(grid, x, y, l)]!).find((r) => r >= 0);
    if (known !== undefined) {
      owners[index] = owners[known]!;
      return;
    }
    const cells: number[] = [];
    // Breadth first, so a room cut at `ROOM_CELLS` keeps the cells nearest its windows.
    const stack = starts.map(([x, y, l]) => [x, y, l] as [number, number, number]);
    for (const [x, y, l] of stack) room[cellIndex(grid, x, y, l)] = index;
    for (let head = 0; head < stack.length && cells.length < ROOM_CELLS; head++) {
      const [x, y, l] = stack[head]!;
      cells.push(cellIndex(grid, x, y, l));
      for (const [sx, sy, sl] of STEPS) {
        const [nx, ny, nl] = [x + sx, y + sy, l + sl];
        if (!inside(nx, ny) || solid(nx, ny, nl) || nl <= groundTop) continue;
        const n = cellIndex(grid, nx, ny, nl);
        if (room[n]! >= 0 || !covered(nx, ny, nl)) continue;
        room[n] = index;
        stack.push([nx, ny, nl]);
      }
    }
    roomCells[index] = cells;
  });

  const owned = (index: number) => Math.min(owners[index]!, 254) + 1;
  const radius = Math.ceil(reach);
  const queue: number[] = [];
  const distance = new Float32Array(wideX * wideY * layers);
  sources.forEach((window, index) => {
    const [dx, dy] = WALL_DIRECTIONS[window.facing]!;
    const own = windowCells(window);
    const owner = owned(index);
    const deposit = (x: number, y: number, l: number, d: number) => {
      const value = Math.round(255 * Math.max(0, 1 - d / reach) ** falloff);
      if (inside(x, y)) {
        const i = cellIndex(grid, x, y, l);
        if (value > data[i * 2]!) {
          data[i * 2] = value;
          data[i * 2 + 1] = owner;
        }
      } else if (l > groundTop && l <= groundTop + SPILL_LAYERS) {
        const i = (y + margin) * spillSize + x + margin;
        if (value > spill[i * 2]!) {
          spill[i * 2] = value;
          spill[i * 2 + 1] = owner;
        }
      }
    };
    const near = (x: number, y: number, l: number) => Math.min(...own.map((c) => Math.hypot(x - c[0], y - c[1], l - c[2])));
    if (method === "rays") {
      // Every air cell of the box around the opening, in front of its plane, with a clear line to one of its cells.
      const [cx, cy, cl] = own[0]!;
      for (let l = cl - radius; l <= cl + window.height - 1 + radius; l++) {
        for (let y = cy - radius - window.width; y <= cy + radius + window.width; y++) {
          for (let x = cx - radius - window.width; x <= cx + radius + window.width; x++) {
            if (solid(x, y, l)) continue;
            if ((x - cx) * dx + (y - cy) * dy < 0) continue;
            let best = Infinity;
            for (const cell of own) {
              const d = Math.hypot(x - cell[0], y - cell[1], l - cell[2]);
              if (d < best && !blocked(solid, cell, [x, y, l])) best = d;
            }
            if (best <= reach) deposit(x, y, l, best);
          }
        }
      }
    } else {
      // The flood: the air cells reached from the opening through air only, within a path of 1.5 x reach steps.
      distance.fill(-1);
      queue.length = 0;
      for (const [x, y, l] of own) {
        distance[wideIndex(x, y, l)] = 0;
        queue.push(x, y, l);
        deposit(x, y, l, 0);
      }
      const limit = Math.ceil(reach * 1.5);
      for (let head = 0; head < queue.length; head += 3) {
        const [x, y, l] = [queue[head]!, queue[head + 1]!, queue[head + 2]!];
        const steps = distance[wideIndex(x, y, l)]!;
        if (steps >= limit) continue;
        for (const [sx, sy, sl] of STEPS) {
          const [nx, ny, nl] = [x + sx, y + sy, l + sl];
          if (solid(nx, ny, nl)) continue;
          const n = wideIndex(nx, ny, nl);
          if (distance[n]! >= 0) continue;
          if ((nx - own[0]![0]) * dx + (ny - own[0]![1]) * dy < 0) continue;
          distance[n] = steps + 1;
          queue.push(nx, ny, nl);
          const d = near(nx, ny, nl);
          if (d <= reach) deposit(nx, ny, nl, d);
        }
      }
    }
  });
  // The rooms, lit full where no window's light is: seen through the opening, their walls glow as the opening does.
  roomCells.forEach((cells, index) => {
    for (const i of cells ?? []) {
      if (data[i * 2]! > 0) continue;
      data[i * 2] = 255;
      data[i * 2 + 1] = owned(index);
    }
  });
  return {
    sizeX,
    sizeY,
    layers,
    sources,
    owners,
    data,
    spill: { size: spillSize, margin, data: spill },
    bytes: data.byteLength,
    buildMs: performance.now() - began,
  };
}

/** The light past the tile's border at a column of the spill's square (`x`, `y` from the grid's corner; 0 inside the tile). */
export function spillOf(volume: LightVolume, x: number, y: number): number {
  const { size, margin, data } = volume.spill;
  const [sx, sy] = [x + margin, y + margin];
  if (sx < 0 || sy < 0 || sx >= size || sy >= size) return 0;
  return data[(sy * size + sx) * 2]!;
}

const STEPS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

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
export function bakeWindows(grid: VoxelGrid, filter?: Uint8Array | OpeningFilter, options: Partial<LightVolumeOptions> = {}): BakedWindows {
  const began = performance.now();
  const windows = detectWindows(grid, filter);
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

  request(key: string, grid: VoxelGrid, filter?: Uint8Array | OpeningFilter, options: Partial<LightVolumeOptions> = {}, skip?: () => boolean): Promise<BakedWindows | null> {
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
          const baked = bakeWindows(grid, filter, options);
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

/**
 * A window's switch-on at a night's level, as the tile shader computes it (`windowOn`, `TileRenderer`): the hash of its owner
 * (`LightVolume.owners`, the index; the shader reads it plus one) and its tile's cell, spread over 0 to 0.85 x `stagger`, then 0 to 1
 * over 0.15 of the level. For the stories' readouts and the tests: the shader is the one that draws.
 */
export function windowSwitch(owner: number, cellX: number, cellY: number, level: number, stagger: number): number {
  const [cx, cy] = [(cellX + 4096) >>> 0, (cellY + 4096) >>> 0];
  let h = (Math.imul(owner + 1, 2654435761 | 0) ^ Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b | 0) >>> 0;
  const at = (((h ^ (h >>> 16)) & 0xffff) / 65535) * stagger * 0.85;
  const t = Math.min(1, Math.max(0, (level - at) / 0.15));
  return t * t * (3 - 2 * t);
}
