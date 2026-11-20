/**
 * TOWN-HALL: the Town Hall's voxels, a 2 x 2 tile (80 x 80 columns) at each of its 10 levels.
 *
 * The ground is four base tiles joined, so the wood, the roads and the two pieces of city are the board's own, voxel for
 * voxel, and each outer edge matches the plans it is made of (`TOWN_HALL_TILES` of `@paved/game-core`):
 *
 *   north-west RFFFRFFFR (North): the road from the west        north-east SFRFRFFFR (North): roads north and east, met at the gate
 *   south-west FFFFFFCFF (North): a piece of city to the south  south-east FFFFFFCFF (West):  a piece of city to the east
 *
 * At the centre a closed ring of walls, built as the cities' are, stands in the wood: the city's paving inside, its gate to
 * the north on the road. The ring is no structure of the game. The hall stands in the middle of it: the Beffroi of the Town
 * Hall study (a plastered hall under a two-pitch roof and a bell tower built as the gate towers are), grown level by level.
 * Windows and doors are real openings, as the night lights need them (`windows.ts` of the renderer).
 */
import { Grid, TILE_VOXELS } from "./voxels.ts";

export const TOWN_HALL_LEVELS = 10;
/** The grid: two tiles a side, and the tallest tile's height (the camera's near plane is set for 35 voxels). */
export const SIDE = 2 * TILE_VOXELS;
export const HEIGHT = 40;
export const MAX_TOP = 35;

/**
 * The four quadrants: the base model each is cut from, its quarter turns clockwise, its corner in the grid, and its set: the
 * model of a quadrant at `level` is its plan's variant `level + TOWN_HALL_LEVELS x set` (two quadrants share a plan).
 */
export const QUADRANTS = [
  { id: "nw", plan: "rfffrfffr", turns: 0, x: 0, z: 0, set: 1 },
  { id: "ne", plan: "sfrfrfffr", turns: 3, x: TILE_VOXELS, z: 0, set: 0 },
  { id: "sw", plan: "ffcfffffc", turns: 3, x: 0, z: TILE_VOXELS, set: 0 },
  { id: "se", plan: "rfffrfffr", turns: 1, x: TILE_VOXELS, z: TILE_VOXELS, set: 0 },
] as const;
/**
 * The ring of walls, as the points its outline is drawn through, clockwise from the west: a wide, rounded town wall, as a
 * capital's (the corners are cut twice, `OUTLINE`), a tower every few columns along it. It keeps clear of the roads (north) and
 * of the two pieces of city (both in the south-west corner), wood between.
 */
const RING_POINTS: ReadonlyArray<readonly [number, number]> = [
  [17, 30],
  [20, 15],
  [34, 10],
  [52, 9],
  [66, 11],
  [73, 22],
  [73, 40],
  [71, 55],
  [65, 66],
  [54, 70],
  [44, 64],
  [36, 58],
  [24, 56],
  [17, 44],
];
/** The outline: the points with their corners cut twice (Chaikin), so the wall turns as a curve. */
export const RING: ReadonlyArray<readonly [number, number]> = (() => {
  let points = RING_POINTS.map(([x, z]) => [x, z] as [number, number]);
  for (let pass = 0; pass < 2; pass++) {
    const next: [number, number][] = [];
    points.forEach(([x, z], i) => {
      const [nx, nz] = points[(i + 1) % points.length]!;
      next.push([x * 0.75 + nx * 0.25, z * 0.75 + nz * 0.25], [x * 0.25 + nx * 0.75, z * 0.25 + nz * 0.75]);
    });
    points = next;
  }
  return points;
})();
/** The columns between two towers, along the wall. */
const TOWER_PITCH = 11;
export type QuadrantId = (typeof QUADRANTS)[number]["id"];

/** The palette entries the hall adds, on entries the base palette leaves unused, with their colours. */
export const EXTRA_ENTRIES: Record<number, string> = {
  240: "#4d6076", // slate
  241: "#566b82",
  242: "#4f7f70", // verdigris copper
  243: "#5a8c7b",
  244: "#7c6630", // gold
  245: "#8a7238",
  138: "#8a3b32", // banner
  139: "#d5d6db", // marble
  140: "#bfc0c4",
  141: "#a9aaae",
  142: "#9172c3", // crystal
};

const PAVE = [91, 92, 94, 95];
const STONE = [195, 196];
const QUOIN = [198, 199];
const DARK = [192, 193];
const PLASTER = [216, 217];
const TIMBER = 163;
const TERRACOTTA = [218, 219];
const SLATE = [240, 241];
const COPPER = [242, 243];
const GOLD = [244, 245];
const MARBLE = [139, 140, 141];
const BACK = 246; // the dark behind a window or a door
const LAMP = 237;
const BANNER = 138;
const CRYSTAL = 142;

const ROAD = [96, 97];
const TOWER_TOP = 253;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The four base tiles joined: the Town Hall's ground before anything is cleared or built. */
export function compose(tiles: Record<string, Grid>): Grid {
  const grid = new Grid(SIDE, SIDE, HEIGHT);
  for (const q of QUADRANTS) grid.paste(tiles[q.plan]!.turned(q.turns), 0, 0, TILE_VOXELS, TILE_VOXELS, q.x, q.z);
  return grid;
}

/**
 * The ring of walls round the court, a tower on each corner, its gate, and the gate's road north to the tile's own. Returns
 * the ring's columns: 1 the court, 2 the wall and its gates, 0 the rest.
 */
function court(v: Grid, gate: Grid): Uint8Array {
  const stone = rng(11);
  const body = () => STONE[Math.floor(stone() * 2)]!;
  const pave = () => PAVE[Math.floor(stone() * PAVE.length)]!;
  // Inside the outline: a column whose centre the outline holds (even-odd).
  const inside = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= SIDE || z >= SIDE) return false;
    let hit = false;
    for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
      const [[xi, zi], [xj, zj]] = [RING[i]!, RING[j]!];
      if (zi > z + 0.5 !== zj > z + 0.5 && x + 0.5 < ((xj - xi) * (z + 0.5 - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  };
  // The tiles' roads, read before the court covers them: where the wall crosses one stands a gate. Inside the walls the
  // ground is the city's paving, as in a city tile: a road ends at its gate.
  const road = new Uint8Array(SIDE * SIDE);
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) if (v.get(x, 3, z) < 0 && ROAD.includes(v.get(x, 2, z))) road[x + SIDE * z] = 1;
  const mask = new Uint8Array(SIDE * SIDE);
  const near = (x: number, z: number, reach: number) => {
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) if (!inside(x + dx, z + dz)) return true;
    return false;
  };
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) if (inside(x, z)) mask[x + SIDE * z] = near(x, z, 2) ? 2 : 1;
  // The ground: everything inside cleared (and a column round it, for the towers); paving inside, down to the slab's bottom.
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) {
    if (!mask[x + SIDE * z]) {
      if ([-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => inside(x + dx, z + dz)))) v.box(x, 4, z, x, HEIGHT - 1, z, -1);
      continue;
    }
    v.box(x, 4, z, x, HEIGHT - 1, z, -1);
    v.box(x, 0, z, x, 3, z, (_x, y) => (y === 3 ? pave() : PAVE[0]!));
    if (mask[x + SIDE * z] !== 2) continue;
    // The curtain: two columns thick, a light course under the walk, merlons on the outer row.
    const outer = near(x, z, 1);
    v.box(x, 3, z, x, 7, z, body);
    v.set(x, 8, z, outer ? QUOIN[0]! : PAVE[1]!);
    if (outer && (x + z) % 2 === 0) v.set(x, 9, z, QUOIN[1]!);
  }
  // The gates: where the wall crosses a road stands the gate of the base tile `CCCCCFRFC` itself (its towers, its barbican and
  // the road through it), copied voxel for voxel and turned to look out of the walls.
  const crossing = new Uint8Array(SIDE * SIDE);
  for (let i = 0; i < SIDE * SIDE; i++) if (road[i] && mask[i] === 2) crossing[i] = 1;
  const gated = new Uint8Array(SIDE * SIDE);
  const seen = new Uint8Array(SIDE * SIDE);
  for (let start = 0; start < SIDE * SIDE; start++) {
    if (!crossing[start] || seen[start]) continue;
    // One crossing: the group of its columns, and its middle.
    const group = [start];
    seen[start] = 1;
    for (let k = 0; k < group.length; k++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const [nx, nz] = [(group[k]! % SIDE) + dx, Math.floor(group[k]! / SIDE) + dz];
      if (nx < 0 || nz < 0 || nx >= SIDE || nz >= SIDE || seen[nx + SIDE * nz] || !crossing[nx + SIDE * nz]) continue;
      seen[nx + SIDE * nz] = 1;
      group.push(nx + SIDE * nz);
    }
    const [mx, mz] = [group.reduce((sum, i) => sum + (i % SIDE), 0) / group.length, group.reduce((sum, i) => sum + Math.floor(i / SIDE), 0) / group.length];
    // The way out: the side on which the road goes on outside the walls (south, west, north, east: the gate looks south in its
    // tile, and a quarter turn clockwise looks west).
    const out = ([[0, 1], [-1, 0], [0, -1], [1, 0]] as const).map(([dx, dz]) => {
      let reach = 0;
      for (let step = 3; step <= 9; step++) for (let side = -2; side <= 2; side++) {
        const [px, pz] = [Math.round(mx + dx * step + dz * side), Math.round(mz + dz * step + dx * side)];
        if (px >= 0 && pz >= 0 && px < SIDE && pz < SIDE && road[px + SIDE * pz] && !inside(px, pz)) reach++;
      }
      return reach;
    });
    const turns = out.indexOf(Math.max(...out));
    // Each column of the gate, turned: the gate's own road and barbican whole, its curtain only inside the walls (so it never
    // runs over what stands outside them, a piece of city close by).
    for (let z = 0; z < gate.sizeZ; z++) for (let x = 0; x < gate.sizeX; x++) {
      let [rx, rz, ax, az, d] = [x, z, GATE_ANCHOR[0] as number, GATE_ANCHOR[1] as number, gate.sizeZ];
      let w = gate.sizeX;
      for (let t = 0; t < turns; t++) [rx, rz, ax, az, w, d] = [d - 1 - rz, rx, d - 1 - az, ax, d, w];
      const [gx, gz] = [Math.round(mx - ax) + rx, Math.round(mz - az) + rz];
      if (gx < 0 || gz < 0 || gx >= SIDE || gz >= SIDE) continue;
      if (Math.abs(x - GATE_ANCHOR[0]) > 5 && !inside(gx, gz)) continue;
      for (let y = 0; y < HEIGHT; y++) v.set(gx, y, gz, gate.get(x, y, z));
      gated[gx + SIDE * gz] = 1;
      if (mask[gx + SIDE * gz]) mask[gx + SIDE * gz] = 2;
    }
  }
  // A tower: light corners, a light band, a dark slab, corner merlons (the gate towers' build).
  const tower = (x0: number, z0: number, size: number, top: number) => {
    const [x1, z1] = [x0 + size - 1, z0 + size - 1];
    v.box(x0, 4, z0, x1, HEIGHT - 1, z1, -1);
    v.box(x0, 3, z0, x1, top, z1, (x, y, z) => (y === top - 1 || ((x === x0 || x === x1) && (z === z0 || z === z1)) ? QUOIN[Math.floor(stone() * 2)]! : body()));
    v.box(x0, top + 1, z0, x1, top + 1, z1, TOWER_TOP);
    for (const x of [x0, x1]) for (const z of [z0, z1]) v.set(x, top + 2, z, DARK[0]!);
    v.set(x0 + 1, top - 3, z0, -1); v.set(x0 + 1, top - 3, z0 + 1, BACK);
    v.set(x0 + 1, top - 3, z1, -1); v.set(x0 + 1, top - 3, z1 - 1, BACK);
  };
  // A tower every `TOWER_PITCH` columns along the outline, from its west point: alternately a little taller, each under a
  // small pointed roof (slate, or terracotta every third).
  let walked = TOWER_PITCH;
  let count = 0;
  RING.forEach(([x, z], i) => {
    const [nx, nz] = RING[(i + 1) % RING.length]!;
    const length = Math.hypot(nx - x, nz - z);
    for (; walked <= length; walked += TOWER_PITCH) {
      const [tx, tz] = [Math.round(x + ((nx - x) * walked) / length), Math.round(z + ((nz - z) * walked) / length)];
      // Not on a gate.
      if ([-2, 0, 2].some((dz) => [-2, 0, 2].some((dx) => gated[Math.min(SIDE - 1, Math.max(0, tx + dx)) + SIDE * Math.min(SIDE - 1, Math.max(0, tz + dz))]))) continue;
      const top = 10 + (count % 2);
      tower(tx - 1, tz - 1, 3, top);
      const cap = count % 3 === 2 ? TERRACOTTA : SLATE;
      v.box(tx - 1, top + 1, tz - 1, tx + 1, top + 1, tz + 1, cap[0]!);
      v.set(tx, top + 2, tz, cap[1]!);
      for (const cx of [tx - 1, tx + 1]) for (const cz of [tz - 1, tz + 1]) v.set(cx, top + 2, cz, -1);
      count++;
    }
    walked -= length;
  });
  return mask;
}

/** A decoration plot's side, in voxels. */
export const DECOR_SIZE = 4;

/**
 * The eight decoration plots of the Town Hall's square (TOWN-HALL): square pads of `DECOR_SIZE` voxels round the hall, four
 * before it (the gate's side, north) and four behind, clear of the largest hall and of the walk to its doors, at the same place
 * at every level. `x` and `z` are the pad's north-west column on the 80 x 80 tile. Each holds a small tree for now (`sapling`): they are
 * where a player's own decorations (won or bought) will stand.
 */
export const DECOR_SLOTS: ReadonlyArray<{ readonly id: number; readonly x: number; readonly z: number }> = [
  { id: 1, x: 27, z: 27 },
  { id: 2, x: 33, z: 27 },
  { id: 3, x: 43, z: 27 },
  { id: 4, x: 49, z: 27 },
  { id: 5, x: 27, z: 47 },
  { id: 6, x: 33, z: 47 },
  { id: 7, x: 43, z: 47 },
  { id: 8, x: 49, z: 47 },
];

/** The placeholder of a plot whose first column is (x, z): a small tree at its middle, the tiles' own trunk and leaves. */
function sapling(v: Grid, x: number, z: number, random: () => number): void {
  const leaf = () => [176, 177][Math.floor(random() * 2)]!;
  v.set(x + 1, 4, z + 1, 160);
  v.set(x + 1, 5, z + 1, 160);
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) v.set(x + 1 + dx, 6, z + 1 + dz, leaf());
  v.set(x + 1, 7, z + 1, [179, 180][Math.floor(random() * 2)]!);
}

/** The gate cut from the base tile `CCCCCFRFC` (facing North: the gate looks south): its columns, and the road's middle on the wall's line. */
const GATE_BOX = { x: 12, z: 20, w: 16, d: 9 } as const;
const GATE_ANCHOR = [7.5, 4] as const;

/** What only a house is made of: plaster, roof tiles, timber. */
const HOUSE = new Set([216, 217, 218, 219, 220, 221, 163, 164]);
const ROOF = new Set([218, 219]);

/**
 * The houses of a city tile, each cut out whole (its voxels above the paving): the groups of columns built of a house's
 * colours, small enough to be one house or one block, clear of the tile's border.
 */
export function houseStamps(tile: Grid): Grid[] {
  const n = tile.sizeX;
  const built = (x: number, z: number) => {
    if (tile.columnTop(x, z) < 5) return false;
    for (let y = 4; y < tile.height; y++) if (HOUSE.has(tile.get(x, y, z))) return true;
    return false;
  };
  const seen = new Uint8Array(n * n);
  const stamps: Grid[] = [];
  for (let start = 0; start < n * n; start++) {
    if (seen[start] || !built(start % n, Math.floor(start / n))) continue;
    const group = [start];
    seen[start] = 1;
    for (let k = 0; k < group.length; k++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const [x, z] = [(group[k]! % n) + dx, Math.floor(group[k]! / n) + dz];
      if (x < 0 || z < 0 || x >= n || z >= n || seen[x + n * z] || !built(x, z)) continue;
      seen[x + n * z] = 1;
      group.push(x + n * z);
    }
    const xs = group.map((i) => i % n);
    const zs = group.map((i) => Math.floor(i / n));
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const roofs = group.filter((i) => ROOF.has(tile.get(i % n, tile.columnTop(i % n, Math.floor(i / n)), Math.floor(i / n)))).length;
    if (group.length < 12 || group.length > 90 || x1 - x0 > 10 || z1 - z0 > 10 || x1 - x0 < 2 || z1 - z0 < 2 || x0 < 1 || z0 < 1 || x1 > n - 2 || z1 > n - 2 || roofs < 6) continue;
    const stamp = new Grid(x1 - x0 + 1, z1 - z0 + 1, tile.height);
    for (const i of group) for (let y = 4; y < tile.height; y++) stamp.set((i % n) - x0, y, Math.floor(i / n) - z0, tile.get(i % n, y, Math.floor(i / n)));
    stamps.push(stamp);
  }
  return stamps;
}

/** The Town Hall at `level` (1 to 10) over the four base tiles (`tiles`: each plan's voxels, facing North). */
export function townHall(level: number, tiles: Record<string, Grid>, patterns: { gate: Grid; cities: readonly Grid[] }): Grid {
  const base = compose(tiles);
  const gate = new Grid(GATE_BOX.w, GATE_BOX.d, HEIGHT);
  gate.paste(patterns.gate, GATE_BOX.x, GATE_BOX.z, GATE_BOX.w, GATE_BOX.d, 0, 0);
  const mask = court(base, gate);
  // The hall is built with its front to the south, then set down turned to the gate (north).
  const v = new Grid(SIDE, SIDE, HEIGHT);
  const r = rng(1000 + level);
  const of = (list: readonly number[]) => () => list[Math.floor(r() * list.length)]!;
  // The court's columns, in the hall's frame (its front to the south: north and south swapped).
  const inCourt = (x: number, z: number) => x >= 0 && x < SIDE && z >= 0 && z < SIDE && mask[x + SIDE * (SIDE - 1 - z)] === 1;
  const free = (x: number, z: number) => inCourt(x, z) && v.get(x, 4, z) < 0;

  const L = level;
  const roofs = L >= 10 ? GOLD : L >= 9 ? COPPER : L >= 5 ? SLATE : TERRACOTTA;
  const roof = of(roofs);
  const roofDark = roofs[0]!;
  const plaster = L >= 10 ? of(MARBLE.slice(0, 2)) : of(PLASTER);
  const stone = L >= 10 ? of(MARBLE.slice(1)) : of(STONE);
  const quoin = L >= 10 ? of(MARBLE.slice(0, 1)) : of(QUOIN);
  const trim = L >= 10 ? of(GOLD) : of(QUOIN);
  const dark = of(DARK);
  const metal = L >= 9 ? GOLD[1]! : DARK[0]!;

  /** A window: a recess one voxel deep in the face at `z` (or `x` when `alongZ`), dark behind it. */
  const windowAt = (x: number, y: number, z: number, w: number, h: number, dx: number, dz: number, alongZ = false) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      const [wx, wz] = alongZ ? [x, z + i] : [x + i, z];
      v.set(wx, y + j, wz, -1);
      v.set(wx - dx, y + j, wz - dz, BACK);
    }
  };

  // The hall: plaster on a stone plinth, pilasters every third column, a band under the eaves, a two-pitch roof whose ridge
  // runs east to west. Its front looks south, to the gate.
  const half = [4, 5, 5, 6, 6, 6, 6, 7, 7, 7][L - 1]!;
  const deep = [3, 3, 4, 4, 4, 5, 5, 5, 5, 5][L - 1]!;
  const walls = [3, 4, 4, 5, 6, 6, 7, 7, 8, 8][L - 1]!;
  const [x0, x1, z0, z1] = [40 - half, 39 + half, 40 - deep, 39 + deep];
  const eave = 4 + walls;
  v.box(x0, 4, z0, x1, eave - 1, z1, plaster);
  v.box(x0, 4, z0, x1, 4, z1, (x, _y, z) => (x === x0 || x === x1 || z === z0 || z === z1 ? stone() : plaster()));
  const pilaster = (k: number, span: number) => k % 3 === 0 || k === span;
  for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) {
    if (pilaster(x - x0, x1 - x0)) v.box(x, 5, z, x, eave - 1, z, L <= 4 ? TIMBER : quoin);
    else v.set(x, eave - 1, z, L <= 4 ? TIMBER : trim());
  }
  for (let z = z0; z <= z1; z++) for (const x of [x0, x1]) {
    if (pilaster(z - z0, z1 - z0)) v.box(x, 5, z, x, eave - 1, z, L <= 4 ? TIMBER : quoin);
    else v.set(x, eave - 1, z, L <= 4 ? TIMBER : trim());
  }
  // Windows in the bays, a row a floor.
  for (let y = 6; y + 1 < eave - 1; y += 3) {
    for (let x = x0 + 1; x < x1; x += 3) for (const [z, dz] of [[z0, -1], [z1, 1]] as const) if (Math.abs(x - 39.5) > 2.5 || z === z0) windowAt(x, y, z, 2, L >= 5 ? 2 : 1, 0, dz);
    for (let z = z0 + 1; z + 1 < z1; z += 3) for (const [x, dx] of [[x0, -1], [x1, 1]] as const) windowAt(x, y, z, 2, L >= 5 ? 2 : 1, dx, 0, true);
  }
  // The roof, a layer every row from both long sides, the gables filled.
  const layers = deep + 1;
  for (let i = 0; i < layers; i++) {
    v.box(x0 - 1, eave + i, z0 - 1 + i, x1 + 1, eave + i, z1 + 1 - i, (_x, _y, z) => (i === layers - 1 || z === z0 - 1 + i || z === z1 + 1 - i ? (i === layers - 1 ? roofDark : roof()) : plaster()));
    v.box(x0 - 1, eave + i, z0 - 1 + i, x1 + 1, eave + i, z0 - 1 + i, i === 0 ? roofDark : roof);
    v.box(x0 - 1, eave + i, z1 + 1 - i, x1 + 1, eave + i, z1 + 1 - i, i === 0 ? roofDark : roof);
  }
  // Chimneys from level 3, dormers from level 5.
  if (L >= 3) for (const x of [x0 + 2, x1 - 2]) { v.box(x, eave, 38, x, eave + layers + 1, 38, stone); v.set(x, eave + layers + 2, 38, DARK[0]!); }
  if (L >= 5) for (let x = x0 + 3; x <= x1 - 3; x += 5) if (Math.abs(x - 39.5) > 4) for (const [z, dz] of [[z0, -1], [z1, 1]] as const) {
    v.box(x - 1, eave + 1, z, x + 1, eave + 2, z, plaster);
    v.box(x - 1, eave + 3, z, x + 1, eave + 3, z - dz, roofDark);
    windowAt(x, eave + 1, z, 1, 2, 0, dz);
  }

  // The front door (south), under a lintel; a porch with its own gable from level 5.
  const front = z1;
  if (L >= 5) {
    v.box(37, 4, front + 1, 42, eave + 1, front + 1, (x) => (x === 37 || x === 42 ? quoin() : plaster()));
    for (let i = 0; i < 3; i++) v.box(37 + i, eave + 2 + i, front - 1, 42 - i, eave + 2 + i, front + 2, (_x, _y, z) => (z === front + 2 || i === 2 ? roofDark : roof()));
    v.box(38, 7, front + 1, 41, 7, front + 1, trim);
    windowAt(39, 4, front + 1, 2, 3, 0, 1);
    if (eave - 9 >= 1) windowAt(39, 9, front + 1, 2, 2, 0, 1);
    v.set(38, 5, front + 2, LAMP); v.set(41, 5, front + 2, LAMP);
  } else {
    windowAt(39, 4, front, 2, 2, 0, 1);
    v.box(38, 6, front, 41, 6, front, TIMBER);
  }
  // The back door (north), so the hall is lit on both sides.
  windowAt(39, 4, z0, 2, 2, 0, -1);

  // The bell tower, built as the gate towers are: light corners, a light band, a dark slab, corner merlons. It stands on the
  // hall's ridge line, toward the front.
  const shaft = (xa: number, za: number, xb: number, zb: number, ya: number, yb: number) =>
    v.box(xa, ya, za, xb, yb, zb, (x, y, z) => (y === ya ? dark() : (x === xa || x === xb) && (z === za || z === zb) ? quoin() : stone()));
  /** The bell stage: open arches on the four faces, the core dark behind them. */
  const belfry = (xa: number, za: number, xb: number, zb: number, ya: number, yb: number) => {
    v.box(xa + 1, ya, za + 1, xb - 1, yb, zb - 1, BACK);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa + 1; x < xb; x++) { v.set(x, y, za, -1); v.set(x, y, zb, -1); }
      for (let z = za + 1; z < zb; z++) { v.set(xa, y, z, -1); v.set(xb, y, z, -1); }
    }
  };
  const spire = (xa: number, za: number, xb: number, zb: number, y: number, steps: number, rise: number) => {
    for (let i = 0; i < steps; i++) v.box(xa + i, y + rise * i, za + i, xb - i, y + rise * (i + 1) - 1, zb - i, (_x, yy) => (i === 0 && yy === y ? roofDark : roof()));
    return y + rise * steps;
  };
  if (L <= 3) {
    // A bell-cote on the ridge.
    const y = eave + layers;
    v.box(39, y, 39, 40, y + (L >= 2 ? 2 : 1), 40, plaster);
    if (L >= 2) { v.set(39, y + 1, 39, -1); v.set(40, y + 1, 39, -1); v.set(39, y + 1, 40, BACK); v.set(40, y + 1, 40, BACK); }
    v.box(38, y + (L >= 2 ? 3 : 2), 38, 41, y + (L >= 2 ? 3 : 2), 41, roofDark);
    v.box(39, y + (L >= 2 ? 4 : 3), 39, 40, y + (L >= 2 ? 4 : 3), 40, roof);
  } else {
    const wide = L >= 6 ? 3 : 2; // half-width: 4 or 6 voxels a side
    const top = [0, 0, 0, 16, 18, 19, 20, 20, 21, 21][L - 1]!;
    const [xa, xb] = [40 - wide, 39 + wide];
    const zb = front + (L >= 5 ? 0 : 1);
    const za = zb - 2 * wide + 1;
    shaft(xa, za, xb, zb, 4, top);
    // Lit slits up the shaft, a clock band from level 6.
    for (let y = eave + 2; y + 1 < top - 5; y += 3) for (const [z, dz] of [[za, -1], [zb, 1]] as const) if (z !== zb || y > eave + layers) windowAt(39, y, z, 2, 1, 0, dz);
    if (L >= 6) {
      v.box(xa, top - 4, za, xb, top - 4, zb, (x, _y, z) => (x === xa || x === xb || z === za || z === zb ? trim() : stone()));
      for (const z of [za, zb]) v.box(39, top - 7, z, 40, top - 6, z, metal);
      for (const x of [xa, xb]) v.box(x, top - 7, za + wide - 1, x, top - 6, za + wide, metal);
    }
    belfry(xa, za, xb, zb, top - (L >= 6 ? 3 : 2), top - 1);
    v.box(xa - (L >= 6 ? 1 : 0), top + 1, za - (L >= 6 ? 1 : 0), xb + (L >= 6 ? 1 : 0), top + 1, zb + (L >= 6 ? 1 : 0), L >= 6 ? trim : of(QUOIN));
    let tip: number;
    if (L === 4) {
      v.box(xa, top + 2, za, xb, top + 2, zb, dark);
      for (const x of [xa, xb]) for (const z of [za, zb]) v.set(x, top + 3, z, DARK[0]!);
      tip = top + 3;
    } else if (L <= 7) {
      tip = spire(xa, za, xb, zb, top + 2, wide, L === 7 ? 2 : 1);
    } else {
      // A lantern over the bells, then the spire.
      const [lh, yl] = [L >= 10 ? 5 : 4, top + 2];
      v.box(xa, yl, za, xb, yl, zb, roofDark);
      shaft(xa + 1, za + 1, xb - 1, zb - 1, yl, yl + lh - 1);
      belfry(xa + 1, za + 1, xb - 1, zb - 1, yl + 1, yl + lh - 2);
      v.box(xa, yl + lh, za, xb, yl + lh, zb, trim);
      tip = spire(xa + 1, za + 1, xb - 1, zb - 1, yl + lh + 1, 2, 2);
      if (L >= 9) for (const x of [xa - 1, xb + 1]) for (const z of [za - 1, zb + 1]) { v.box(x, top + 2, z, x, top + 3, z, quoin); v.set(x, top + 4, z, L >= 10 ? CRYSTAL : metal); }
    }
    if (L >= 8) { v.set(39, tip, za + wide - 1, L >= 10 ? CRYSTAL : metal); if (L >= 9) v.set(39, tip + 1, za + wide - 1, L >= 10 ? CRYSTAL : metal); }
    if (L >= 6) for (const x of [xa - 1, xb + 1]) v.box(x, 6, zb + 1, x, 9, zb + 1, L >= 10 ? GOLD[1]! : BANNER);
  }

  // The side pavilions, from level 7.
  if (L >= 7) for (const xa of [x0 - 5, x1 + 2]) {
    if (!inCourt(xa, 38) || !inCourt(xa + 3, 41)) throw new Error("pavilion out of the court");
    const top = eave - 1;
    v.box(xa, 4, 38, xa + 3, top, 41, (x, y, z) => (y === 4 ? stone() : (x === xa || x === xa + 3) && (z === 38 || z === 41) ? quoin() : plaster()));
    for (let y = 6; y + 1 <= top - 1; y += 3) { windowAt(xa + 1, y, 41, 2, 2, 0, 1); windowAt(xa + 1, y, 38, 2, 2, 0, -1); }
    for (let i = 0; i < 3; i++) v.box(xa - 1 + i, top + 1 + i, 37 + i, xa + 4 - i, top + 1 + i, 42 - i, i === 0 ? roofDark : roof);
    if (L >= 9) v.box(xa + 1, top + 4, 39, xa + 1, top + 5, 39, metal);
    // A gallery to the hall.
    v.box(Math.min(xa + 4, x1 + 1), 4, 39, Math.max(xa - 1, x0 - 1), 6, 40, plaster);
    v.box(Math.min(xa + 4, x1 + 1), 7, 39, Math.max(xa - 1, x0 - 1), 7, 40, roofDark);
  }

  // Lanterns at the hall's corners.
  const lantern = (x: number, z: number) => { if (!free(x, z)) return; v.box(x, 4, z, x, 5, z, TIMBER); v.set(x, 6, z, LAMP); };
  for (const x of [x0 - 2, x1 + 2]) for (const z of [z0 - 2, z1 + 3]) lantern(x, z);
  // The hall's square: open paving round it, clear of houses, so the hall stands apart as a town hall does. On it, the eight
  // decoration plots (`DECOR_SLOTS`), each with the thing that stands there until the player sets their own.
  const PARK = { x0: 26, x1: 53, z0: 29, z1: 52 } as const;
  const garden = rng(77);
  for (const slot of DECOR_SLOTS) {
    // The plots are given as the tile shows them; the hall is built with north and south swapped.
    const [sx, sz] = [slot.x, SIDE - slot.z - DECOR_SIZE];
    let clear = true;
    for (let dz = 0; dz < DECOR_SIZE; dz++) for (let dx = 0; dx < DECOR_SIZE; dx++) if (!inCourt(sx + dx, sz + dz) || v.get(sx + dx, 4, sz + dz) >= 0) clear = false;
    if (!clear) throw new Error(`town hall level ${L}: the decoration plot ${slot.id} is not clear`);
    // The plot: a pad of even, lighter paving.
    v.box(sx, 3, sz, sx + DECOR_SIZE - 1, 3, sz + DECOR_SIZE - 1, PAVE[3]!);
    sapling(v, sx, sz, garden);
  }
  // The town round the hall: houses of the city tiles themselves (`houseStamps`), copied voxel for voxel and turned, thrown
  // over the court until no more fits. The same every level (the town does not move when the hall grows), clear of the largest
  // hall and of the streets.
  const stamps = patterns.cities.flatMap(houseStamps);
  const town = rng(57);
  for (let i = 0; i < 9000 && stamps.length > 0; i++) {
    const stamp = stamps[Math.floor(town() * stamps.length)]!.turned(Math.floor(town() * 4));
    const [hx, hz] = [Math.floor(town() * SIDE), Math.floor(town() * SIDE)];
    // Clear of the hall's square.
    if (hx <= PARK.x1 + 1 && hx + stamp.sizeX - 1 >= PARK.x0 - 1 && hz <= PARK.z1 + 1 && hz + stamp.sizeZ - 1 >= PARK.z0 - 1) continue;
    let room = true;
    for (let z = 0; z < stamp.sizeZ && room; z++) for (let x = 0; x < stamp.sizeX; x++) {
      if (stamp.columnTop(x, z) < 0) continue;
      if (![-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => free(hx + x + dx, hz + z + dz)))) { room = false; break; }
    }
    if (!room) continue;
    for (let z = 0; z < stamp.sizeZ; z++) for (let x = 0; x < stamp.sizeX; x++) for (let y = 4; y < HEIGHT; y++) {
      const entry = stamp.get(x, y, z);
      if (entry >= 0) v.set(hx + x, y, hz + z, entry);
    }
  }
  // Trees along the walls, as a city's squares have: the same every level, clear of the hall.
  const plant = rng(31);
  for (let i = 0, planted = 0; i < 600 && planted < 10; i++) {
    const [x, z] = [Math.floor(plant() * SIDE), Math.floor(plant() * SIDE)];
    const clear = [-2, -1, 0, 1, 2].every((dx) => [-2, -1, 0, 1, 2].every((dz) => free(x + dx, z + dz)));
    const byWall = [-4, 4].some((d) => !inCourt(x + d, z) || !inCourt(x, z + d));
    if (!clear || !byWall || (Math.abs(x - 39.5) < 16 && Math.abs(z - 39.5) < 13) || (Math.abs(x - 39.5) < 6 && z > 39)) continue;
    const h = 2 + Math.floor(plant() * 3);
    v.set(x, 4, z, 160);
    for (let y = 5; y < 5 + h; y++) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (y > 5 || (dx === 0 && dz === 0)) v.set(x + dx, y, z + dz, [176, 177][Math.floor(plant() * 2)]!);
    v.set(x, 5 + h, z, [179, 180][Math.floor(plant() * 2)]!);
    planted++;
  }
  for (let y = 3; y < HEIGHT; y++) for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) {
    const entry = v.get(x, y, z);
    if (entry >= 0) base.set(x, y, SIDE - 1 - z, entry);
  }
  // The top stays under the camera's bound.
  if (base.top() > MAX_TOP) throw new Error(`town hall level ${L}: ${base.top()} voxels high, over ${MAX_TOP}`);
  return base;
}

/** One quadrant of a Town Hall grid, turned back to its plan's own frame (facing North), as a tile model is. */
export function quadrant(grid: Grid, id: QuadrantId): Grid {
  const q = QUADRANTS.find((c) => c.id === id)!;
  const cut = new Grid(TILE_VOXELS, TILE_VOXELS, grid.height);
  cut.paste(grid, q.x, q.z, TILE_VOXELS, TILE_VOXELS, 0, 0);
  return cut.turned(4 - q.turns);
}
