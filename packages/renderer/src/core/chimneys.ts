// No three here: the chimneys of a model are read off its voxel grid (`voxelizer.ts`), once per model type, as the windows are
// (`windows.ts`). CHIMNEY-SMOKE-1 (#770 PR 1): the detection and its stories only; nothing on the board calls it yet.
import { paletteOfModel, type PaletteName } from "./feature-layout";
import { PALETTE_CLASSES } from "./features";
import { traceMeasure, traceStart } from "./load-trace";
import { cellIndex, type VoxelGrid } from "./voxelizer";
import { plantEntries } from "./windows";

/**
 * The chimneys of a tile model, found in its voxel grid (#770 item 1). Two kinds:
 *
 * - **Smoking**: the model draws the smoke as white voxels over the stack, a column of small puffs, one to a few voxels each, with
 *   one to three layers of air between them, drifting a column at most from one puff to the next. The light voxels (the palette's
 *   `light` entries) are grouped into plumes (a light voxel joins a plume within a column sideways and up to `PLUME_GAP` layers of
 *   air up or down); a plume is a chimney's smoke when it is free-standing (no solid of another colour beside it), small
 *   (`MAX_SMOKE_VOXELS`), and stands on a narrow stack (1 x 1 to 2 x 2 columns) that rises above a wider roof.
 * - **Bare**: the same stack with nothing on it (owner, 2026-10-25: every chimney smokes), read off the height map of the column
 *   tops, the smoke taken off: a narrow local high point (every column round it lower), whose narrow stack (at most
 *   `MAX_BARE_STACK` layers) stands on a roof above the slab; the stack and its roof not of leaves (a tree), of the walls' stone
 *   (a merlon, a tower's top) or of a wonder's colours (a spire), the stack not of its roof's own colour (a bump of the roof); and
 *   alone at its height (a crenel has twins within `CRENEL_REACH` columns: a tower's crenellation, a wall's merlons).
 *
 * The stacks' colour (`CHIMNEY_ENTRIES`, the palette entries under the models' white smoke) is a hint, not a rule: a bare chimney
 * in another colour is kept, and marked as such (`colour`). The few models the rules settle wrong are named in `CHIMNEY_OVERRIDES`.
 * Every plume and high point that is not kept is returned with its reason, for the story and the tests.
 */

/** The most layers of air between two puffs of one plume (the models leave one to three). */
export const PLUME_GAP = 3;
/** The most voxels a chimney's smoke has (the models' largest is 18, a 2 x 2 chimney's). */
export const MAX_SMOKE_VOXELS = 40;
/** The most layers of air between a stack's top and the first puff over it. */
export const MOUTH_GAP = 2;
/** A stack's widest top, in columns along each axis. */
export const MAX_STACK_WIDTH = 2;
/** The palette colour a light entry has at least on each channel (0 to 255): the smoke's is (224, 228, 234). */
export const LIGHT_MIN_CHANNEL = 200;
/** The most layers of narrow stack a bare chimney has over its roof (the smoking ones have one or two): taller is a spire, a pole. */
export const MAX_BARE_STACK = 3;
/** How close (in columns, either axis) another high point of the same height makes a crenel of a bare candidate. */
export const CRENEL_REACH = 3;

/** A box of cells, both ends included: x, y (the ground's two axes) and layer. */
export interface CellBox {
  readonly x0: number;
  readonly y0: number;
  readonly layer0: number;
  readonly x1: number;
  readonly y1: number;
  readonly layer1: number;
}

export type ChimneyKind = "smoking" | "bare";

/** One chimney: its kind, its mouth, the stack under it and, for a smoking one, the smoke voxels the model draws over it. */
export interface Chimney {
  readonly kind: ChimneyKind;
  /**
   * The mouth: the stack's top layer of solid cells (1 x 1 to 2 x 2 columns, from `x`, `y`), where the smoke leaves the stack
   * at its top face (`layer + 1`, `mouthPoint`).
   */
  readonly mouth: { readonly x: number; readonly y: number; readonly width: number; readonly depth: number; readonly layer: number };
  /** The layers of narrow stack over the roof, the mouth's included. */
  readonly stackHeight: number;
  /** The palette entry of the mouth's first cell, and whether it is one of the chimneys' colours (`CHIMNEY_ENTRIES`). */
  readonly entry: number;
  readonly colour: boolean;
  /** True when `CHIMNEY_OVERRIDES` kept it (the rules rejected it). */
  readonly overridden: boolean;
  /** The smoke voxels, as cells (x, y, layer), lowest first; none for a bare chimney. */
  readonly smoke: ReadonlyArray<readonly [number, number, number]>;
  /** The smoke's vertical runs as boxes (a few a chimney): what the tile shader will drop (#770 item 2). None for a bare one. */
  readonly boxes: readonly CellBox[];
  /** The box round every smoke voxel, or the mouth's cells for a bare chimney. */
  readonly bounds: CellBox;
}

/** Why a plume of light voxels is not a chimney's smoke. */
export type PlumeReject =
  /** It has solid voxels of another colour beside it: a white part of a wall, a wonder's stone. */
  | "in a structure"
  /** More voxels than a smoke has. */
  | "too large"
  /** Its lowest voxel is on the ground slab, or in it. */
  | "on the ground"
  /** Nothing solid under its lowest voxels within `MOUTH_GAP` layers. */
  | "no stack"
  /** What it stands on is wider than 2 x 2 columns: a roof, a wall's top. */
  | "wide support"
  /** Its stack goes down to the slab without meeting a roof: a post, a pillar. */
  | "no roof";

/** Why a narrow high point is not a bare chimney. */
export type HighPointReject =
  /** Its stack goes down to the slab without meeting a roof: a tree's trunk, a post, a stone, a lamp. */
  | "no roof"
  /** It is of leaves, or stands on them: a tree's top. */
  | "vegetation"
  /** It is of the walls' stone, or stands on it: a merlon, a tower's top, a wall's corner. */
  | "wall"
  /** It is of a wonder's colours, or stands on them: a spire, an ornament. */
  | "wonder"
  /** It is of its roof's own colour: the apex of a pyramid roof, a bump of it, not a stack. */
  | "roof"
  /** More than `MAX_BARE_STACK` layers of narrow stack: a spire, a pole, a flag. */
  | "spire"
  /** Another high point of its height within `CRENEL_REACH` columns: a crenellation's merlon. */
  | "crenel"
  /** `CHIMNEY_OVERRIDES` drops it. */
  | "override";

export type ChimneyReject = PlumeReject | HighPointReject;

/** A plume or a high point the detection rejected, with its cells and why. */
export interface RejectedCandidate {
  readonly kind: "plume" | "high point";
  readonly reason: ChimneyReject;
  readonly cells: ReadonlyArray<readonly [number, number, number]>;
  readonly bounds: CellBox;
}

export interface FoundChimneys {
  readonly chimneys: Chimney[];
  readonly rejected: RejectedCandidate[];
  /** The light voxels read, every plume's. */
  readonly lightVoxels: number;
  /** How long the detection took, in ms. */
  readonly buildMs: number;
}

/** A model's correction of the rules: the chimney whose mouth is at the column `x`, `y` is kept or dropped. */
export interface ChimneyOverride {
  readonly x: number;
  readonly y: number;
  readonly keep: boolean;
  /** Why, as the story shows it. */
  readonly note: string;
}

/** What the detection knows of the model's palette, and its corrections. */
export interface ChimneyOptions {
  /** The palette entries that read as white (`LIGHT_ENTRIES`, or `lightEntries` of the palette's colours). */
  readonly light: readonly number[];
  /** The entries of leaves, trunks and grass: a high point of them, or on them, is a tree's. */
  readonly vegetation?: readonly number[];
  /** The chimneys' colours (`CHIMNEY_ENTRIES`): a hint only. */
  readonly stacks?: readonly number[];
  /** The walls' stone (`PaletteClasses.stone`): a high point of it, or on it, is a merlon or a tower's top. */
  readonly walls?: readonly number[];
  /** A wonder's colours (`PaletteClasses.wonder`): a high point of them, or on them, is the wonder's. */
  readonly wonders?: readonly number[];
  readonly overrides?: readonly ChimneyOverride[];
}

/**
 * The light entries of each palette (`lightEntries` of its 256 colours, pinned by `chimneys.test.ts` against the models' palettes):
 * the smoke's (24 in the base palette, 240 in the Forest one) and the wonders' whites, which the detection rejects by their shape.
 */
export const LIGHT_ENTRIES: Record<PaletteName, readonly number[]> = {
  base: [24, 63, 64, 248, 249],
  forest: [24, 25, 28, 62, 64, 240, 248, 249],
};

/**
 * The chimneys' colours: the entries of the stacks under the models' white smoke (`chimneys.test.ts` reads them off every smoking
 * chimney): 223, a grey stone (127, 127, 114), and 225 in one Forest variant. The same entries in both palettes.
 */
export const CHIMNEY_ENTRIES: Record<PaletteName, readonly number[]> = { base: [223, 225], forest: [223, 225] };

/** Overrides that drop the chimneys of some columns, for one reason. */
function dropAll(note: string, ...columns: ReadonlyArray<readonly [number, number]>): ChimneyOverride[] {
  return columns.map(([x, y]) => ({ x, y, keep: false, note }));
}

/**
 * The models the rules settle wrong (#770, open point 3), by model id (a plan key, or a variant's file name without its hash:
 * `rfrfffffr_HF_3`): a mouth's column kept or dropped. Checked in the `Renderer/Chimneys` story with the rest.
 */
export const CHIMNEY_OVERRIDES: Readonly<Record<string, readonly ChimneyOverride[]>> = {
  // The Forest wonder's grey pinnacles (entries 188 to 191, in no class of the Forest palette): its towers' tops, not chimneys.
  // The apexes of the houses' pyramid roofs (entry 235 on a roof of 234): one shade off the roof, which the grid cannot tell.
  rfffrfffr_HF_7: dropAll("a pyramid roof's apex", [27, 22], [35, 25], [27, 26], [16, 29], [21, 33], [28, 35], [16, 36], [35, 36]),
  wfffffffr_HF_2: dropAll("the wonder's pinnacles", [14, 13], [25, 13], [4, 16], [35, 16], [14, 18], [25, 18], [4, 21], [35, 21], [14, 24], [19, 24], [25, 24], [17, 33], [22, 33]),
};

/** The override list of a model id (a plan key, or a variant's path: `models/forest/<plan>_HF_<n>.<hash>.glb`). */
export function overridesOf(id: string): readonly ChimneyOverride[] {
  const name = id.slice(id.lastIndexOf("/") + 1).replace(/\.[0-9a-f]{10}\.glb$/, "").replace(/\.glb$/, "");
  return CHIMNEY_OVERRIDES[name] ?? [];
}

/** The detection's options for a model id: its palette's light, vegetation (the stone greys left out) and chimney entries, its overrides. */
export function chimneyOptionsOf(id: string): ChimneyOptions {
  const palette = paletteOfModel(id) ?? "base";
  const classes = PALETTE_CLASSES[palette];
  return { light: LIGHT_ENTRIES[palette], vegetation: plantEntries(classes.vegetation), stacks: CHIMNEY_ENTRIES[palette], walls: classes.stone, wonders: classes.wonder, overrides: overridesOf(id) };
}

/** The palette entries that read as white or very light: each channel at least `minChannel`. `colors` is `[r, g, b]` per entry. */
export function lightEntries(colors: ReadonlyArray<readonly [number, number, number]>, minChannel = LIGHT_MIN_CHANNEL): number[] {
  const out: number[] = [];
  colors.forEach(([r, g, b], entry) => {
    if (Math.min(r, g, b) >= minChannel) out.push(entry);
  });
  return out;
}

/** The box round some cells. */
function boundsOf(cells: ReadonlyArray<readonly [number, number, number]>): CellBox {
  let [x0, y0, layer0, x1, y1, layer1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const [x, y, l] of cells) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    layer0 = Math.min(layer0, l);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
    layer1 = Math.max(layer1, l);
  }
  return { x0, y0, layer0, x1, y1, layer1 };
}

/** Some cells as vertical runs, each run a box one column wide: a column's cells that follow each other with no gap. */
export function runsOf(cells: ReadonlyArray<readonly [number, number, number]>): CellBox[] {
  const sorted = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
  const runs: CellBox[] = [];
  for (const [x, y, l] of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.x0 === x && last.y0 === y && last.layer1 === l - 1) runs[runs.length - 1] = { ...last, layer1: l };
    else runs.push({ x0: x, y0: y, layer0: l, x1: x, y1: y, layer1: l });
  }
  return runs;
}

type Column = readonly [number, number];

/** A set of columns, as `x + 40 * y` (`LABEL_COLUMNS`: every model's grid is 40 x 40). */
const columnsOf = (cells: readonly Column[]) => new Set(cells.map(([x, y]) => x + 40 * y));

/** The chimneys of a grid, smoking and bare, and what was rejected (`ChimneyOptions`: the palette's entries, the overrides). */
export function findChimneys(grid: VoxelGrid, options: ChimneyOptions): FoundChimneys {
  const start = traceStart();
  const began = performance.now();
  const { sizeX, sizeY, layers, occupied, groundTop } = grid;
  const [isLight, isPlant, isStack, isWall, isWonder] = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
  for (const entry of options.light) isLight[entry] = 1;
  for (const entry of options.walls ?? []) isWall[entry] = 1;
  for (const entry of options.wonders ?? []) isWonder[entry] = 1;
  for (const entry of options.vegetation ?? []) isPlant[entry] = 1;
  for (const entry of options.stacks ?? []) isStack[entry] = 1;
  const overrides = options.overrides ?? [];
  // Each cell's state: 0 air (or past the grid), 1 solid, 2 light; and its palette entry.
  const state = new Uint8Array(occupied.length);
  const entries = new Uint8Array(occupied.length);
  const lights: number[] = [];
  for (let v = 0; v < grid.count; v++) {
    const i = cellIndex(grid, grid.cells[v * 3]!, grid.cells[v * 3 + 1]!, grid.cells[v * 3 + 2]!);
    entries[i] = grid.entry[v]!;
    state[i] = isLight[grid.entry[v]!] ? 2 : 1;
    if (state[i] === 2) lights.push(i);
  }
  const inside = (x: number, y: number, l: number) => x >= 0 && y >= 0 && l >= 0 && x < sizeX && y < sizeY && l < layers;
  const at = (x: number, y: number, l: number) => (inside(x, y, l) ? state[cellIndex(grid, x, y, l)]! : 0);
  const entryAt = (x: number, y: number, l: number) => entries[cellIndex(grid, x, y, l)]!;
  const cellOf = (i: number): [number, number, number] => [i % sizeX, Math.floor(i / sizeX) % sizeY, Math.floor(i / (sizeX * sizeY))];

  /** The solid cells of layer `l` joined (4-neighbours) to `seeds`, at most `cap` + 1 of them: the footprint of a stack there. */
  const footprint = (seeds: readonly Column[], l: number, cap: number): Array<[number, number]> => {
    const seen = new Set<number>();
    const out: Array<[number, number]> = [];
    const stack: Array<[number, number]> = [];
    for (const [x, y] of seeds) {
      if (at(x, y, l) !== 1 || seen.has(x + sizeX * y)) continue;
      seen.add(x + sizeX * y);
      stack.push([x, y]);
    }
    while (stack.length && out.length <= cap) {
      const [x, y] = stack.pop()!;
      out.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const [nx, ny] = [x + dx, y + dy];
        if (at(nx, ny, l) !== 1 || seen.has(nx + sizeX * ny)) continue;
        seen.add(nx + sizeX * ny);
        stack.push([nx, ny]);
      }
    }
    return out;
  };
  const narrow = (cells: readonly Column[]) => {
    if (!cells.length || cells.length > MAX_STACK_WIDTH * MAX_STACK_WIDTH) return false;
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    return Math.max(...xs) - Math.min(...xs) < MAX_STACK_WIDTH && Math.max(...ys) - Math.min(...ys) < MAX_STACK_WIDTH;
  };
  /**
   * Down a stack from its top layer `top` (its cells `mouth`): its layers stay narrow until a wider one, the roof. The stack's
   * height (the mouth's layer included), and the roof's cells, or null when it reaches the slab (or air) first: no roof.
   */
  const stackOf = (mouth: readonly Column[], top: number): { height: number; roof: Array<[number, number]> | null; roofLayer: number } => {
    let height = 1;
    let columns = mouth;
    for (let l = top - 1; l > groundTop; l--) {
      const layer = footprint(columns, l, 64);
      if (!layer.length) break; // air under it: an overhang, no roof under it
      if (!narrow(layer)) return { height, roof: layer, roofLayer: l };
      height++;
      columns = layer;
    }
    return { height, roof: null, roofLayer: -1 };
  };
  const mouthOf = (cells: readonly Column[], layer: number) => {
    const x = Math.min(...cells.map((c) => c[0]));
    const y = Math.min(...cells.map((c) => c[1]));
    return { x, y, width: Math.max(...cells.map((c) => c[0])) - x + 1, depth: Math.max(...cells.map((c) => c[1])) - y + 1, layer };
  };
  const overrideAt = (mouth: { x: number; y: number; width: number; depth: number }) =>
    overrides.find((o) => o.x >= mouth.x && o.x < mouth.x + mouth.width && o.y >= mouth.y && o.y < mouth.y + mouth.depth);

  const chimneys: Chimney[] = [];
  const rejected: RejectedCandidate[] = [];

  // 1. The smoking chimneys: the plumes, light voxels joined within a column sideways (diagonals too) and up to `PLUME_GAP`
  // layers of air apart.
  const plumeOf = new Int32Array(occupied.length).fill(-1);
  const plumes: Array<Array<[number, number, number]>> = [];
  for (const seed of lights) {
    if (plumeOf[seed]! >= 0) continue;
    const id = plumes.length;
    const cells: Array<[number, number, number]> = [];
    plumeOf[seed] = id;
    const stack = [seed];
    while (stack.length) {
      const i = stack.pop()!;
      const [x, y, l] = cellOf(i);
      cells.push([x, y, l]);
      for (let dl = -(PLUME_GAP + 1); dl <= PLUME_GAP + 1; dl++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const [nx, ny, nl] = [x + dx, y + dy, l + dl];
            if (!inside(nx, ny, nl)) continue;
            const n = cellIndex(grid, nx, ny, nl);
            if (state[n] !== 2 || plumeOf[n]! >= 0) continue;
            plumeOf[n] = id;
            stack.push(n);
          }
        }
      }
    }
    cells.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    plumes.push(cells);
  }
  /** The smoke voxels kept: air for the height map of the bare chimneys. */
  const smoke = new Uint8Array(occupied.length);
  for (const cells of plumes) {
    const bounds = boundsOf(cells);
    const reject = (reason: PlumeReject) => rejected.push({ kind: "plume", reason, cells, bounds });
    if (cells.length > MAX_SMOKE_VOXELS) {
      reject("too large");
      continue;
    }
    if (bounds.layer0 <= groundTop + 1) {
      reject("on the ground");
      continue;
    }
    // Free-standing: no solid of another colour beside any of its voxels (above or below is the stack, or a roof's eave).
    if (cells.some(([x, y, l]) => at(x + 1, y, l) === 1 || at(x - 1, y, l) === 1 || at(x, y + 1, l) === 1 || at(x, y - 1, l) === 1)) {
      reject("in a structure");
      continue;
    }
    // The stack's top: the first layer under the plume's lowest voxels, within `MOUTH_GAP` layers of air, with solid cells under
    // them or one column aside (a puff drifts).
    const lowest = cells.filter((c) => c[2] === bounds.layer0);
    let top = -1;
    let seeds: Column[] = [];
    for (let l = bounds.layer0 - 1; l >= bounds.layer0 - 1 - MOUTH_GAP && l > groundTop && top < 0; l--) {
      const under = lowest.filter(([x, y]) => at(x, y, l) === 1).map(([x, y]): Column => [x, y]);
      const aside: Column[] = [];
      if (!under.length) {
        for (const [x, y] of lowest) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy, l) === 1) aside.push([x + dx, y + dy]);
      }
      if (under.length || aside.length) {
        top = l;
        seeds = under.length ? under : aside;
      }
    }
    if (top < 0) {
      reject("no stack");
      continue;
    }
    const mouthCells = footprint(seeds, top, MAX_STACK_WIDTH * MAX_STACK_WIDTH);
    if (!narrow(mouthCells)) {
      reject("wide support");
      continue;
    }
    const { height, roof } = stackOf(mouthCells, top);
    if (!roof) {
      reject("no roof");
      continue;
    }
    const mouth = mouthOf(mouthCells, top);
    const entry = entryAt(mouth.x, mouth.y, top);
    for (const [x, y, l] of cells) smoke[cellIndex(grid, x, y, l)] = 1;
    chimneys.push({ kind: "smoking", mouth, stackHeight: height, entry, colour: !!isStack[entry], overridden: false, smoke: cells, boxes: runsOf(cells), bounds });
  }

  // 2. The bare chimneys: the height map of the column tops, the kept smoke taken off.
  const tops = new Int16Array(sizeX * sizeY).fill(-1);
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      for (let l = layers - 1; l >= 0; l--) {
        const i = cellIndex(grid, x, y, l);
        if (occupied[i] && !smoke[i]) {
          tops[x + sizeX * y] = l;
          break;
        }
      }
    }
  }
  const topOf = (x: number, y: number) => (x < 0 || y < 0 || x >= sizeX || y >= sizeY ? -1 : tops[x + sizeX * y]!);
  const isSmokingMouth = (cells: readonly Column[]) =>
    chimneys.some((c) => cells.some(([x, y]) => x >= c.mouth.x && x < c.mouth.x + c.mouth.width && y >= c.mouth.y && y < c.mouth.y + c.mouth.depth));
  interface HighPoint {
    cells: Array<[number, number]>;
    layer: number;
    verdict: HighPointReject | null;
    height: number;
  }
  const highPoints: HighPoint[] = [];
  const seen = new Uint8Array(sizeX * sizeY);
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      const layer = topOf(x, y);
      if (seen[x + sizeX * y] || layer <= groundTop + 1) continue;
      // The columns of the same top joined to it (4-neighbours): a narrow one is a high point when every column round it is lower.
      const cells: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[x, y]];
      seen[x + sizeX * y] = 1;
      while (stack.length && cells.length <= MAX_STACK_WIDTH * MAX_STACK_WIDTH) {
        const [cx, cy] = stack.pop()!;
        cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const [nx, ny] = [cx + dx, cy + dy];
          if (topOf(nx, ny) !== layer || seen[nx + sizeX * ny]) continue;
          seen[nx + sizeX * ny] = 1;
          stack.push([nx, ny]);
        }
      }
      if (stack.length || !narrow(cells)) continue;
      const box = mouthOf(cells, layer);
      let lower = true;
      for (let ry = box.y - 1; ry <= box.y + box.depth && lower; ry++) {
        for (let rx = box.x - 1; rx <= box.x + box.width && lower; rx++) {
          if (cells.some(([cx, cy]) => cx === rx && cy === ry)) continue;
          if (topOf(rx, ry) >= layer) lower = false;
        }
      }
      if (!lower || isSmokingMouth(cells)) continue;
      const { height, roof, roofLayer } = stackOf(cells, layer);
      let verdict: HighPointReject | null = null;
      // Of a class, or on a roof mostly of it (the roof's cells the stack stands on and round it, as far as `footprint` reaches).
      const of = (is: Uint8Array) => !!roof && (cells.some(([cx, cy]) => is[entryAt(cx, cy, layer)]) || roof.filter(([rx, ry]) => is[entryAt(rx, ry, roofLayer)]).length * 2 > roof.length);
      if (!roof) verdict = "no roof";
      else if (of(isPlant)) verdict = "vegetation";
      else if (of(isWonder)) verdict = "wonder";
      else if (of(isWall)) verdict = "wall";
      else if (height > MAX_BARE_STACK) verdict = "spire";
      else {
        // Of its roof's own colour (a quarter of the roof round the stack, the cells under it left out): the roof's apex, a bump.
        const own = entryAt(cells[0]![0], cells[0]![1], layer);
        const round = roof.filter(([rx, ry]) => !columnsOf(cells).has(rx + 40 * ry));
        if (round.length && round.filter(([rx, ry]) => entryAt(rx, ry, roofLayer) === own).length * 4 >= round.length) verdict = "roof";
      }
      highPoints.push({ cells, layer, verdict, height });
    }
  }
  // A crenel: another high point of its height within `CRENEL_REACH` columns (a merlon has twins; a chimney stands alone).
  for (const point of highPoints) {
    if (point.verdict) continue;
    const box = mouthOf(point.cells, point.layer);
    const twin = highPoints.some((other) => {
      if (other === point || other.layer !== point.layer) return false;
      const o = mouthOf(other.cells, other.layer);
      const gapX = Math.max(o.x - (box.x + box.width - 1), box.x - (o.x + o.width - 1));
      const gapY = Math.max(o.y - (box.y + box.depth - 1), box.y - (o.y + o.depth - 1));
      return Math.max(gapX, gapY) <= CRENEL_REACH;
    });
    if (twin) point.verdict = "crenel";
  }
  for (const point of highPoints) {
    const mouth = mouthOf(point.cells, point.layer);
    const override = overrideAt(mouth);
    const cells3 = point.cells.map(([x, y]): [number, number, number] => [x, y, point.layer]);
    const keep = override ? override.keep : !point.verdict;
    if (!keep) {
      rejected.push({ kind: "high point", reason: override ? "override" : point.verdict!, cells: cells3, bounds: boundsOf(cells3) });
      continue;
    }
    const entry = entryAt(mouth.x, mouth.y, point.layer);
    chimneys.push({ kind: "bare", mouth, stackHeight: point.height, entry, colour: !!isStack[entry], overridden: !!override && !!point.verdict, smoke: [], boxes: [], bounds: boundsOf(cells3) });
  }
  // A smoking chimney an override drops: its smoke stays the model's (the voxels are not hidden).
  for (let i = chimneys.length - 1; i >= 0; i--) {
    const c = chimneys[i]!;
    if (c.kind !== "smoking" || overrideAt(c.mouth)?.keep !== false) continue;
    chimneys.splice(i, 1);
    rejected.push({ kind: "plume", reason: "override", cells: c.smoke, bounds: c.bounds });
  }
  traceMeasure("chimneys", start);
  return { chimneys, rejected, lightVoxels: lights.length, buildMs: performance.now() - began };
}

/**
 * The point the smoke leaves a chimney, in the model's frame (the grid's: x, height, z): the middle of the mouth's top face.
 * The tile's model matrix takes it to the board.
 */
export function mouthPoint(grid: Pick<VoxelGrid, "origin" | "step">, chimney: Pick<Chimney, "mouth">): [number, number, number] {
  const { mouth } = chimney;
  const [ox, oy, oz] = grid.origin;
  return [ox + (mouth.x + mouth.width / 2) * grid.step, oy + (mouth.layer + 1) * grid.step, oz + (mouth.y + mouth.depth / 2) * grid.step];
}
