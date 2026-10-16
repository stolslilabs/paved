import * as THREE from "three";
import { AreaType, CategoryType, Plan, PlanType, SpotType } from "@paved/game-core";
import { TILE_VOXELS } from "./outlines";

/**
 * Which feature of the game each voxel of a tile model shows (FEATURE-HL): a city, a road, a forest or a wonder, with the
 * plan's area (A to I) it belongs to. Nothing is authored in the models: the labels are read off the voxels, column by
 * column of the 40 x 40 grid (`TILE_VOXELS`), from the colour of each column's top and the plan's layout (its spots'
 * categories and areas, `@paved/game-core`). The board can then light every city, or one structure, in the tile shader
 * (`TileRenderer`).
 *
 * The method (the feasibility prototype, 2026-10-16): a city is a group of city-coloured or stone columns that touches the
 * tile's border on a city edge, or lies mostly in city spots, with the gardens it encloses; a road is a road-coloured column
 * at least two voxels wide on the ground (under a bridge too), on a road that reaches a road edge or the centre; a wonder,
 * a wonder-coloured group over a wonder spot; a structure (a stop, a bridge, a house, a rock), a column topped above the
 * ground by something else, labelled none; a forest, a free column reached from a forest spot's border, the nearest one's
 * area. The 3 x 3 grid of spots is only a prior: the areas' shapes come from the voxels.
 */

/** The features a column can show, by code: the code is the `feature` attribute's value. */
export const FEATURES = ["none", "city", "road", "forest", "wonder"] as const;
export type FeatureName = (typeof FEATURES)[number];
export const FEATURE_CODE: Record<FeatureName, number> = { none: 0, city: 1, road: 2, forest: 3, wonder: 4 };

/** The areas by code: the `area` attribute's value, 0 for none, 1 to 9 for A to I (the contracts' area codes). */
const AREA_CODES: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9 };

/**
 * The entries of the base models' palette (the 256 x 1 texture every base model shares) by what they paint, read off the
 * 19 base models: an entry is in a class when it lies mostly in that feature's spots across them. `stone` is the grey of
 * walls and of rocks alike: a city only when it joins a city. The Forest variants' palette differs on 34 entries (among
 * them 179, 180, 228 and 229): this table is the base palette's.
 */
export const BASE_PALETTE_CLASSES = {
  city: [7, 91, 92, 94, 95, 163, 164, 216, 217, 218, 219, 220, 221, 222, 225, 227, 228, 229, 253],
  stone: [192, 193, 195, 196, 197, 198, 199],
  road: [96, 97],
  wonder: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 249],
  // Grass, leaves, trunks and earth: what a column of forest is topped with (a structure is topped with anything else).
  vegetation: [3, 80, 81, 82, 83, 104, 105, 112, 113, 114, 115, 152, 153, 160, 161, 176, 177, 179, 180, 184, 185, 187, 188],
} as const;
export type PaletteClasses = { readonly [K in keyof typeof BASE_PALETTE_CLASSES]: readonly number[] };

/** The palette's width in texels: an entry is `floor(u * PALETTE_SIZE)`. */
const PALETTE_SIZE = 256;

/** The ground's top, in voxels above the model's bottom: every base model's ground is 4 voxels high (0.4 of its 4 units). */
export const GROUND_VOXELS = 4;
/**
 * How far above the ground's top a face stands on it, in voxels: a column topped higher by no vegetation, road or city is a
 * structure, and a road column's fragment higher is a bridge's deck, not the road (`TileRenderer`). The sunk road is at
 * about 3 voxels, the ground's top at 4.
 */
export const ABOVE_GROUND_VOXELS = 0.5;
/** The ground layer of a column: its highest horizontal face at the ground's top or below (within a tenth of a voxel). */
const GROUND_LAYER_VOXELS = 0.1;

/** The plan key's spots in order (centre, then north-west clockwise to west), and each one's cell [row from north, column from west]. */
const SPOTS = [
  SpotType.Center,
  SpotType.NorthWest,
  SpotType.North,
  SpotType.NorthEast,
  SpotType.East,
  SpotType.SouthEast,
  SpotType.South,
  SpotType.SouthWest,
  SpotType.West,
];
const SPOT_OF_CELL = [
  [1, 2, 3],
  [8, 0, 4],
  [7, 6, 5],
];
/** The edge spots (north, east, south, west) and the border of the grid each one touches. */
const EDGE_SPOTS: Record<number, (x: number, y: number, n: number) => boolean> = {
  2: (_x, y) => y === 0,
  4: (x, _y, n) => x === n - 1,
  6: (_x, y, n) => y === n - 1,
  8: (x) => x === 0,
};

/**
 * The colour of the highest horizontal face over each column of the grid (-1: no face) and its height, the colour of its
 * ground layer (the highest face at the ground's top or below: the road under a bridge), and where the ground's top and a
 * voxel are in the model's frame.
 */
export interface ColumnTops {
  readonly size: number;
  readonly entry: Int16Array;
  readonly height: Float32Array;
  readonly ground: Int16Array;
  readonly groundTop: number;
  readonly cell: number;
}

/** The feature and area of each column of the grid, row by row from the north-west corner. */
export interface ColumnLabels {
  readonly size: number;
  readonly feature: Uint8Array;
  readonly area: Uint8Array;
}

/** Where the grid lies in the model's frame: its north-west corner (x, z), the model's bottom (y) and a column's width. */
export interface TileGrid {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly cell: number;
}

/** A model's column labels and where its grid lies (`labelTileColumns`). */
export interface TileColumns {
  readonly columns: ColumnLabels;
  readonly grid: TileGrid;
}

/** A model's labels: per column, and per vertex (`labelTileGeometry`). */
export interface TileLabels extends TileColumns {
  readonly feature: Uint8Array;
  readonly area: Uint8Array;
}

/** The layout of a plan: each spot's category and area code, in plan-key order. */
interface PlanLayout {
  readonly category: CategoryType[];
  readonly area: number[];
}

function planLayout(planKey: string): PlanLayout {
  const value = planKey.toUpperCase() as PlanType;
  if (!Object.values(PlanType).includes(value) || value === PlanType.None) throw new Error(`features: unknown plan ${planKey}`);
  const plan = new Plan(value);
  const category = plan.unpack().map((c) => c.value);
  const area = SPOTS.map((spot) => AREA_CODES[plan.area(spot) as AreaType] ?? 0);
  return { category, area };
}

/**
 * The plan key of a model id: a plan key as is, or a variant's path (`models/forest/cccccfffc_HF_1.<hash>.glb`) by its file
 * name. Null when the id names no plan.
 */
export function planKeyOfModel(id: string): string | null {
  const name = id.slice(id.lastIndexOf("/") + 1).split(/[_.]/)[0].toLowerCase();
  return Object.values(PlanType).includes(name.toUpperCase() as PlanType) && name !== "none" ? name : null;
}

/** A model's positions in its model's frame (the loaded scene's, Y up), and the footprint of the grid. */
interface ModelFrame {
  readonly positions: Float32Array;
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly cell: number;
}

function modelFrame(geometry: THREE.BufferGeometry, toModel: THREE.Matrix4, size: number): ModelFrame {
  const source = geometry.getAttribute("position");
  const positions = new Float32Array(source.count * 3);
  const v = new THREE.Vector3();
  let [minX, maxX, minY, minZ, maxZ] = [Infinity, -Infinity, Infinity, Infinity, -Infinity];
  for (let i = 0; i < source.count; i++) {
    v.fromBufferAttribute(source, i).applyMatrix4(toModel);
    positions.set([v.x, v.y, v.z], i * 3);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }
  // The footprint is the model's square, as the board scales it (`TileRenderer.createVoxelTile`: its larger side).
  const cell = Math.max(maxX - minX, maxZ - minZ) / size;
  return { positions, minX, minY, minZ, cell };
}

/** The triangles of a geometry, as vertex indices. */
function triangles(geometry: THREE.BufferGeometry): ArrayLike<number> {
  const index = geometry.getIndex();
  if (index) return index.array;
  return Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i);
}

/**
 * The top of each column: the palette entry (`floor(u * 256)`, the triangle's mean) and height of the highest horizontal
 * face whose projection covers the column's centre, and the entry of its ground layer (`ColumnTops`).
 */
export function columnTops(geometry: THREE.BufferGeometry, toModel = new THREE.Matrix4(), size = TILE_VOXELS): ColumnTops {
  const frame = modelFrame(geometry, toModel, size);
  return topsOf(geometry, frame, size);
}

function topsOf(geometry: THREE.BufferGeometry, frame: ModelFrame, size: number): ColumnTops {
  const { positions: p, minX, minZ, cell } = frame;
  const uv = geometry.getAttribute("uv");
  const tris = triangles(geometry);
  const entry = new Int16Array(size * size).fill(-1);
  const height = new Float32Array(size * size).fill(-Infinity);
  const ground = new Int16Array(size * size).fill(-1);
  const groundHeight = new Float32Array(size * size).fill(-Infinity);
  const groundTop = frame.minY + GROUND_VOXELS * cell;
  const groundLayer = groundTop + GROUND_LAYER_VOXELS * cell;
  const flat = cell * 1e-3;
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2], p[c * 3], p[c * 3 + 1], p[c * 3 + 2]];
    if (Math.abs(ay - by) > flat || Math.abs(ay - cy) > flat) continue;
    const twice = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (Math.abs(twice) < flat * cell) continue;
    const u = uv ? (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3 : 0;
    const value = Math.min(PALETTE_SIZE - 1, Math.max(0, Math.floor(u * PALETTE_SIZE)));
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cell));
    const i1 = Math.min(size - 1, Math.floor((Math.max(ax, bx, cx) - minX) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cell));
    const j1 = Math.min(size - 1, Math.floor((Math.max(az, bz, cz) - minZ) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = minX + (i + 0.5) * cell;
        const d1 = (bx - ax) * (z - az) - (bz - az) * (x - ax);
        const d2 = (cx - bx) * (z - bz) - (cz - bz) * (x - bx);
        const d3 = (ax - cx) * (z - cz) - (az - cz) * (x - cx);
        const inside = (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
        const k = j * size + i;
        if (!inside) continue;
        if (ay > height[k]) {
          height[k] = ay;
          entry[k] = value;
        }
        if (ay <= groundLayer && ay > groundHeight[k]) {
          groundHeight[k] = ay;
          ground[k] = value;
        }
      }
    }
  }
  return { size, entry, height, ground, groundTop, cell };
}

const NEIGHBOURS_8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
const NEIGHBOURS_4 = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;

/** The groups of the columns `mask` keeps, each a list of columns, by `neighbours`. */
function groups(mask: (k: number) => boolean, size: number, neighbours: readonly (readonly [number, number])[]): number[][] {
  const seen = new Uint8Array(size * size);
  const out: number[][] = [];
  for (let k = 0; k < size * size; k++) {
    if (seen[k] || !mask(k)) continue;
    const cells: number[] = [];
    const stack = [k];
    seen[k] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const [x, y] = [c % size, Math.floor(c / size)];
      for (const [dx, dy] of neighbours) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (!seen[n] && mask(n)) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    out.push(cells);
  }
  return out;
}

/** The most frequent value of `values`, ignoring 0; 0 when there is none. */
function majority(values: Iterable<number>): number {
  const votes = new Map<number, number>();
  for (const v of values) if (v) votes.set(v, (votes.get(v) ?? 0) + 1);
  let best = 0;
  let count = 0;
  for (const [v, n] of votes) if (n > count) [best, count] = [v, n];
  return best;
}

/**
 * Spreads `area` from the columns that have one to those `open` keeps that have none, nearest first (8 neighbours); the
 * columns it cannot reach keep 0.
 */
function spread(area: Uint8Array, open: (k: number) => boolean, size: number): void {
  let front: number[] = [];
  for (let k = 0; k < size * size; k++) if (area[k] && open(k)) front.push(k);
  while (front.length) {
    const next: number[] = [];
    for (const c of front) {
      const [x, y] = [c % size, Math.floor(c / size)];
      for (const [dx, dy] of NEIGHBOURS_8) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (!area[n] && open(n)) {
          area[n] = area[c];
          next.push(n);
        }
      }
    }
    front = next;
  }
}

/** The columns `inside` keeps that cannot reach the grid's border without crossing `wall` (4 neighbours). */
function enclosed(wall: (k: number) => boolean, size: number): Uint8Array {
  const out = new Uint8Array(size * size).fill(1);
  const stack: number[] = [];
  for (let k = 0; k < size * size; k++) {
    const [x, y] = [k % size, Math.floor(k / size)];
    if ((x === 0 || y === 0 || x === size - 1 || y === size - 1) && !wall(k)) {
      out[k] = 0;
      stack.push(k);
    }
  }
  while (stack.length) {
    const c = stack.pop()!;
    const [x, y] = [c % size, Math.floor(c / size)];
    for (const [dx, dy] of NEIGHBOURS_4) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (out[n] && !wall(n)) {
        out[n] = 0;
        stack.push(n);
      }
    }
  }
  for (let k = 0; k < size * size; k++) if (wall(k)) out[k] = 0;
  return out;
}

/** The feature and area of each column of a model of plan `planKey`, from its columns' tops (`columnTops`). */
export function classifyColumns(tops: ColumnTops, planKey: string, classes: PaletteClasses = BASE_PALETTE_CLASSES): ColumnLabels {
  const { size, entry } = tops;
  const total = size * size;
  const layout = planLayout(planKey);
  const spotOf = (k: number) => {
    const [x, y] = [k % size, Math.floor(k / size)];
    return SPOT_OF_CELL[Math.min(2, Math.floor((y * 3) / size))][Math.min(2, Math.floor((x * 3) / size))];
  };
  const spots = Uint8Array.from({ length: total }, (_, k) => spotOf(k));
  const categoryAt = (k: number) => layout.category[spots[k]];
  const spotArea = (k: number) => layout.area[spots[k]];
  const is = (list: readonly number[]) => {
    const set = new Set(list);
    return (k: number) => set.has(entry[k]);
  };
  const [isCity, isStone, isWonder] = [is(classes.city), is(classes.stone), is(classes.wonder)];
  const [roadEntries, vegetation] = [new Set(classes.road), new Set(classes.vegetation)];
  const isRoad = (k: number) => roadEntries.has(tops.ground[k]);

  const feature = new Uint8Array(total);
  const area = new Uint8Array(total);
  const label = (k: number, name: FeatureName, code: number) => {
    feature[k] = FEATURE_CODE[name];
    area[k] = code;
  };

  // Cities: city-coloured or stone groups that touch the border on a city edge or lie mostly in city spots. A group takes
  // the areas of the city spots it covers: each of its columns the nearest one along the group, so two cities whose walls
  // touch (ffcfffffc) stay two.
  for (const cells of groups((k) => isCity(k) || isStone(k), size, NEIGHBOURS_8)) {
    const inCity = cells.filter((k) => categoryAt(k) === CategoryType.City);
    if (!inCity.length) continue;
    const onEdge = inCity.some((k) => EDGE_SPOTS[spots[k]]?.(k % size, Math.floor(k / size), size));
    if (!onEdge && inCity.length / cells.length < 0.4) continue;
    const member = new Uint8Array(total);
    const cityArea = new Uint8Array(total);
    for (const k of cells) member[k] = 1;
    for (const k of inCity) cityArea[k] = spotArea(k);
    spread(cityArea, (k) => member[k] === 1, size);
    for (const k of cells) label(k, "city", cityArea[k]);
  }
  // The cities take the columns they enclose in city spots (gardens and squares), each the nearest city's area, then the
  // columns five of whose eight neighbours are one city (one pass).
  const isCityColumn = (k: number) => feature[k] === FEATURE_CODE.city;
  const inside = enclosed(isCityColumn, size);
  const filled = Uint8Array.from(area, (a, k) => (isCityColumn(k) ? a : 0));
  spread(filled, (k) => isCityColumn(k) || inside[k] === 1, size);
  for (let k = 0; k < total; k++) if (inside[k] && !feature[k] && filled[k] && categoryAt(k) === CategoryType.City) label(k, "city", filled[k]);
  const before = Uint8Array.from(feature);
  const beforeArea = Uint8Array.from(area);
  for (let k = 0; k < total; k++) {
    if (before[k]) continue;
    const [x, y] = [k % size, Math.floor(k / size)];
    const around: number[] = [];
    for (const [dx, dy] of NEIGHBOURS_8) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (before[n] === FEATURE_CODE.city) around.push(beforeArea[n]);
    }
    const code = majority(around);
    if (code && around.filter((a) => a === code).length >= 5) label(k, "city", code);
  }

  // The wonder: wonder-coloured groups over the wonder spot, with what they enclose.
  const wonderSpot = layout.category.indexOf(CategoryType.Wonder);
  if (wonderSpot >= 0) {
    const code = layout.area[wonderSpot];
    for (const cells of groups((k) => !feature[k] && isWonder(k), size, NEIGHBOURS_8)) {
      if (cells.some((k) => spots[k] === wonderSpot)) for (const k of cells) label(k, "wonder", code);
    }
    const inside = enclosed((k) => feature[k] === FEATURE_CODE.wonder, size);
    for (let k = 0; k < total; k++) if (inside[k] && !feature[k]) label(k, "wonder", code);
  }

  // Roads: columns whose ground layer is road-coloured (so a road runs on under a bridge or an arch), without the
  // decoration that shares their colours (the paths by a house or a stop): first an opening by a 2 x 2 square (a column stays only in a 2 x 2 block of road columns: what is one voxel wide
  // goes), then only the groups (8 neighbours) that reach the tile's border on a road edge, or the centre of a stop or a
  // crossing. Each column left takes the area of the nearest road spot's column along the road. A column dropped is left
  // to the forest.
  const roadColour = Uint8Array.from({ length: total }, (_, k) => (!feature[k] && isRoad(k) ? 1 : 0));
  const opened = new Uint8Array(total);
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const block = [y * size + x, y * size + x + 1, (y + 1) * size + x, (y + 1) * size + x + 1];
      if (block.every((k) => roadColour[k])) for (const k of block) opened[k] = 1;
    }
  }
  const centre = layout.category[0];
  const roadEnd = (k: number) =>
    (categoryAt(k) === CategoryType.Road && EDGE_SPOTS[spots[k]]?.(k % size, Math.floor(k / size), size)) ||
    (spots[k] === 0 && (centre === CategoryType.Stop || centre === CategoryType.Road));
  const onRoad = new Uint8Array(total);
  for (const cells of groups((k) => opened[k] === 1, size, NEIGHBOURS_8)) {
    if (cells.some(roadEnd)) for (const k of cells) onRoad[k] = 1;
  }
  const roadArea = new Uint8Array(total);
  for (let k = 0; k < total; k++) if (onRoad[k] && categoryAt(k) === CategoryType.Road) roadArea[k] = spotArea(k);
  spread(roadArea, (k) => onRoad[k] === 1, size);
  for (let k = 0; k < total; k++) if (onRoad[k] && roadArea[k]) label(k, "road", roadArea[k]);

  // Structures: what stands on the ground outside a city and is no vegetation or road (a stop, a bridge or an arch, a
  // house or a gate under a city-coloured roof, a rock): labelled none, and a forest does not cross them.
  const above = tops.groundTop + ABOVE_GROUND_VOXELS * tops.cell;
  const structure = (k: number) => tops.height[k] > above && !vegetation.has(entry[k]) && !roadEntries.has(entry[k]);
  const free = Uint8Array.from({ length: total }, (_, k) => (!feature[k] && !structure(k) ? 1 : 0));

  // Forests: each forest area grows from its own columns on the tile's border (an edge spot's middle third, a corner
  // spot's outer thirds of both sides) and, for a forest centre, the centre's columns: one search from every seed at once
  // over the free columns (4 neighbours), each column the area of the nearest seed. Two areas may meet where a road has a
  // gap, never merge. A free column no seed reaches (a pocket shut in by structures: a courtyard) stays none.
  const forestArea = new Uint8Array(total);
  const queue: number[] = [];
  layout.category.forEach((category, spot) => {
    if (category !== CategoryType.Forest) return;
    for (let k = 0; k < total; k++) {
      if (spots[k] !== spot || !free[k] || forestArea[k]) continue;
      const [x, y] = [k % size, Math.floor(k / size)];
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      if (spot === 0 || border) {
        forestArea[k] = layout.area[spot];
        queue.push(k);
      }
    }
  });
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const [x, y] = [c % size, Math.floor(c / size)];
    for (const [dx, dy] of NEIGHBOURS_4) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (free[n] && !forestArea[n]) {
        forestArea[n] = forestArea[c];
        queue.push(n);
      }
    }
  }
  for (let k = 0; k < total; k++) if (forestArea[k]) label(k, "forest", forestArea[k]);
  return { size, feature, area };
}

/**
 * The column labels of a tile model's mesh (`classifyColumns`) and where its grid lies in the model's frame: what the tile
 * shader reads per fragment (`packLabels`, `TileRenderer`). `toModel` takes the geometry's positions to the model's frame
 * (Y up, the north to -Z), as the loaded scene places it.
 */
export function labelTileColumns(
  geometry: THREE.BufferGeometry,
  planKey: string,
  toModel = new THREE.Matrix4(),
  classes: PaletteClasses = BASE_PALETTE_CLASSES,
  size = TILE_VOXELS,
): TileColumns {
  return columnsOf(modelFrame(geometry, toModel, size), geometry, planKey, classes, size);
}

function columnsOf(frame: ModelFrame, geometry: THREE.BufferGeometry, planKey: string, classes: PaletteClasses, size: number): TileColumns {
  const columns = classifyColumns(topsOf(geometry, frame, size), planKey, classes);
  return { columns, grid: { minX: frame.minX, minY: frame.minY, minZ: frame.minZ, cell: frame.cell } };
}

/**
 * The column labels packed one byte a column, row by row from the north-west corner: `feature * 16 + area`. The tile
 * shader's label map (an R8 texture, `TileRenderer`) holds them.
 */
export function packLabels(columns: ColumnLabels): Uint8Array {
  return Uint8Array.from(columns.feature, (feature, k) => feature * 16 + columns.area[k]);
}

/**
 * The labels of a tile model's mesh per column (`labelTileColumns`) and per vertex: the label of the voxel column its
 * triangles stand on (a triangle's centre stepped half a voxel inward along its normal, so a wall's side takes its own
 * column). A vertex shared by triangles of different columns takes the label covering most of their area. A merged face
 * over columns of two labels cannot show both through its vertices: the tile shader reads the columns per fragment.
 */
export function labelTileGeometry(
  geometry: THREE.BufferGeometry,
  planKey: string,
  toModel = new THREE.Matrix4(),
  classes: PaletteClasses = BASE_PALETTE_CLASSES,
  size = TILE_VOXELS,
): TileLabels {
  const frame = modelFrame(geometry, toModel, size);
  const { columns, grid } = columnsOf(frame, geometry, planKey, classes, size);
  const { positions: p, minX, minZ, cell } = frame;
  const count = geometry.getAttribute("position").count;
  // Per vertex: the area of its triangles under each label (feature and area packed in one key).
  const weights: Map<number, number>[] = Array.from({ length: count }, () => new Map());
  const tris = triangles(geometry);
  const [a, b, c, ab, ac, n] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const ids = [tris[t], tris[t + 1], tris[t + 2]];
    a.fromArray(p, ids[0] * 3);
    b.fromArray(p, ids[1] * 3);
    c.fromArray(p, ids[2] * 3);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const twiceArea = n.length();
    if (twiceArea === 0) continue;
    n.divideScalar(twiceArea);
    const centre = a.add(b).add(c).divideScalar(3).addScaledVector(n, -cell / 2);
    const i = Math.min(size - 1, Math.max(0, Math.floor((centre.x - minX) / cell)));
    const j = Math.min(size - 1, Math.max(0, Math.floor((centre.z - minZ) / cell)));
    const k = j * size + i;
    const key = columns.feature[k] * 16 + columns.area[k];
    for (const id of ids) weights[id].set(key, (weights[id].get(key) ?? 0) + twiceArea);
  }
  const feature = new Uint8Array(count);
  const area = new Uint8Array(count);
  for (let v = 0; v < count; v++) {
    let best = 0;
    let weight = -1;
    for (const [key, w] of weights[v]) if (w > weight) [best, weight] = [key, w];
    feature[v] = Math.floor(best / 16);
    area[v] = best % 16;
  }
  return { feature, area, columns, grid };
}
