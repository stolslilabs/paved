import { describe, expect, it, vi } from "vitest";
import { GROUND_VOXELS } from "../src/core/feature-codes";
import { cellIndex, voxelize, type VoxelGrid } from "../src/core/voxelizer";
import { PALETTE_CLASSES } from "../src/core/features";
import { DEFAULT_LIGHT_VOLUME, WindowCache, bakeWindows, buildLightVolume, detectWindows, findOpenings, lightOf, ownerAt, plantEntries, spillOf, windowCells, type Window } from "../src/core/windows";
import { PLANS, loadMesh, litColumnsOf, shipped, sourceOf } from "./helpers/model-meshes";

const HEAVY_TEST_MS = 60_000;

/** The windows #513 found per base model (its table, sill above the ground): the count and the sizes `w x h: count`. */
const TABLE: Record<string, readonly [number, Record<string, number>]> = {
  ccccccccc: [4, { "1x1": 3, "2x1": 1 }],
  cccccfffc: [8, { "1x1": 7, "2x1": 1 }],
  cccccfrfc: [2, { "1x1": 2 }],
  cfffcfffc: [1, { "1x1": 1 }],
  ffcfffcff: [11, { "1x1": 10, "1x2": 1 }],
  ffffcccff: [9, { "1x1": 9 }],
  rfrfrfcff: [10, { "2x1": 5, "4x1": 3, "1x1": 2 }],
  sfrfrfffr: [5, { "1x1": 3, "2x1": 1, "1x2": 1 }],
  wffffffff: [0, {}],
  wfffffffr: [2, { "3x1": 2 }],
};

/** A synthetic grid from an occupancy function: 12 x 12 x 10 cells, the slab four layers high, as the models are. */
function gridOf(solid: (x: number, y: number, layer: number) => boolean, size = 12, layers = 10): VoxelGrid {
  const occupied = new Uint8Array(size * size * layers);
  const cells: number[] = [];
  for (let l = 0; l < layers; l++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (solid(x, y, l)) {
    occupied[cellIndex({ sizeX: size, sizeY: size }, x, y, l)] = 1;
    cells.push(x, y, l);
  }
  return {
    sizeX: size,
    sizeY: size,
    layers,
    step: 0.1,
    origin: [0, 0, 0],
    count: cells.length / 3,
    cells: Uint8Array.from(cells),
    entry: new Uint8Array(cells.length / 3).fill(7),
    visible: new Uint8Array(cells.length / 3).fill(1),
    visibleCount: cells.length / 3,
    occupied,
    groundTop: GROUND_VOXELS - 1,
    slabCount: 0,
    buildMs: 0,
  };
}

/** A house block (x 4 to 7, y 4 to 7, layers 4 to 8) on the slab, with a 1 x 1 window in its north face at (5, 4, 6). */
const house = (x: number, y: number, l: number) => l < GROUND_VOXELS || (x >= 4 && x <= 7 && y >= 4 && y <= 7 && l <= 8 && !(x === 5 && y === 4 && l === 6));

describe("the window detection", () => {
  it("finds a recess in a wall: solid behind and all round it, air in front", () => {
    const windows = detectWindows(gridOf(house));
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ kind: "window", facing: 0, x: 5, y: 4, layer: 6, width: 1, height: 1, back: 7 });
    expect(windowCells(windows[0]!)).toEqual([[5, 4, 6]]);
  });

  it("tells a door from a gap by its height, on the slab", () => {
    const door = detectWindows(gridOf((x, y, l) => house(x, y, l) && !(x === 6 && y === 4 && l >= 4 && l <= 5)));
    expect(door.map((w) => [w.kind, w.x, w.layer, w.height])).toEqual(expect.arrayContaining([["door", 6, 4, 2]]));
    const gap = detectWindows(gridOf((x, y, l) => house(x, y, l) && !(x === 6 && y === 4 && l === 4)));
    expect(gap.map((w) => [w.kind, w.x, w.layer])).toEqual(expect.arrayContaining([["gap", 6, 4]]));
  });

  it("rejects a recess that is open on a side, a through hole and a hole in the roof's edge", () => {
    // A hole through the whole block has air behind it from the other side: no window on either face.
    const through = findOpenings(gridOf((x, y, l) => house(x, y, l) && !(x === 5 && l === 6)));
    expect(through.windows.filter((w) => w.layer === 6 && w.facing === 0)).toHaveLength(0);
    const edge = findOpenings(gridOf((x, y, l) => house(x, y, l) && !(x === 5 && y === 4 && l === 8)));
    expect(edge.windows.filter((w) => w.layer === 8)).toHaveLength(0);
  });

  it("keeps only the openings on lit columns when the lights are given", () => {
    const grid = gridOf(house);
    expect(detectWindows(grid, new Uint8Array(144))).toHaveLength(0);
    const lit = new Uint8Array(144).fill(1);
    expect(detectWindows(grid, lit)).toHaveLength(1);
    expect(findOpenings(grid, new Uint8Array(144)).rejected.map((r) => r.reason)).toContain("unlit column");
  });

  it.each(Object.entries(TABLE))(
    "still finds #513's windows of %s (its recesses), among the windows through the walls",
    async (plan, [count, sizes]) => {
      const grid = voxelize(sourceOf(await loadMesh(shipped(plan))), { name: plan })!;
      const windows = detectWindows(grid).filter((w) => w.kind === "window");
      const recesses = windows.filter((w) => !w.through);
      expect(recesses).toHaveLength(count);
      const found: Record<string, number> = {};
      for (const w of recesses) found[`${w.width}x${w.height}`] = (found[`${w.width}x${w.height}`] ?? 0) + 1;
      expect(found).toEqual(sizes);
      expect(windows.length).toBeGreaterThanOrEqual(count);
    },
    HEAVY_TEST_MS,
  );

  it(
    "finds #513's 84 windows over the 19 plans and those through the walls; the structures keep more than the lit columns",
    async () => {
      const total = { recesses: 0, all: 0, structures: 0, columns: 0 };
      for (const plan of PLANS) {
        const mesh = await loadMesh(shipped(plan));
        const grid = voxelize(sourceOf(mesh), { name: plan })!;
        const count = (windows: readonly Window[]) => windows.filter((w) => w.kind === "window").length;
        const all = detectWindows(grid);
        total.recesses += all.filter((w) => w.kind === "window" && !w.through).length;
        total.all += count(all);
        total.structures += count(detectWindows(grid, { vegetation: plantEntries(PALETTE_CLASSES.base.vegetation) }));
        total.columns += count(detectWindows(grid, litColumnsOf(plan, mesh)));
      }
      expect(PLANS).toHaveLength(19);
      expect(total.recesses).toBe(84);
      // Measured on 2026-10-19: 872 windows, 836 kept on the structures, 720 on the lit columns.
      expect(total.all).toBeGreaterThan(800);
      expect(total.structures).toBeLessThanOrEqual(total.all);
      expect(total.structures).toBeGreaterThan(total.columns);
    },
    HEAVY_TEST_MS,
  );
});

/**
 * A hollow house (#571's houses: walls one voxel thick, x 3 to 8, y 3 to 8, layers 4 to 9, a roof at 10) with a window through
 * the middle of each wall at layer 7.
 */
const WALL_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [5, 3],
  [8, 5],
  [5, 8],
  [3, 5],
];
const hollow = (x: number, y: number, l: number) => {
  if (l < GROUND_VOXELS) return true;
  if (x < 3 || x > 8 || y < 3 || y > 8 || l > 10) return false;
  if (l === 10) return true;
  if (x > 3 && x < 8 && y > 3 && y < 8) return false;
  return !(l === 7 && WALL_WINDOWS.some(([wx, wy]) => wx === x && wy === y));
};

describe("the windows through the walls (#571)", () => {
  it("finds the window of each of a hollow house's four walls, once each, from the outside", () => {
    const found = findOpenings(gridOf(hollow, 12, 12));
    const windows = found.windows.filter((w) => w.kind === "window");
    expect(windows.map((w) => [w.facing, w.x, w.y, w.layer, w.through]).sort()).toEqual(
      [
        [0, 5, 3, 7, true],
        [1, 8, 5, 7, true],
        [2, 5, 8, 7, true],
        [3, 3, 5, 7, true],
      ].sort(),
    );
    // The same holes seen from the room are told apart, not kept.
    expect(found.rejected.filter((r) => r.reason === "seen from inside")).toHaveLength(4);
  });

  it("the four windows of a room share one owner, and the room is lit, so they switch on together", () => {
    const grid = gridOf(hollow, 12, 12);
    const volume = buildLightVolume(grid, detectWindows(grid));
    expect(volume.sources).toHaveLength(4);
    expect(new Set(volume.owners).size).toBe(1);
    // The room's far wall is seen through each window: its air is lit full, owned by the room's window.
    expect(lightOf(volume, 5, 5, 7)).toBe(255);
    expect(ownerAt(volume, 5, 5, 7)).toBe(volume.sources[volume.owners[0]!]);
    // And in front of each window, that window's pool.
    expect(lightOf(volume, 5, 1, 7)).toBeGreaterThan(0);
    expect(lightOf(volume, 10, 5, 7)).toBeGreaterThan(0);
  });

  it("a recess keeps its own owner, and a hole through a solid block is no window", () => {
    const volume = buildLightVolume(gridOf(house), detectWindows(gridOf(house)));
    expect(volume.owners).toEqual([0]);
    const tunnel = findOpenings(gridOf((x, y, l) => house(x, y, l) && !(x === 5 && l === 6)));
    expect(tunnel.windows.filter((w) => w.layer === 6)).toHaveLength(0);
  });

  it("drops the openings in a wall of leaves (the structures' rule), with the reason", () => {
    const leaves = findOpenings(gridOf(hollow, 12, 12), { vegetation: [7] });
    expect(leaves.windows.filter((w) => w.kind === "window")).toHaveLength(0);
    expect(leaves.dropped.map((w) => w.reason)).toEqual(["vegetation", "vegetation", "vegetation", "vegetation"]);
    expect(findOpenings(gridOf(hollow, 12, 12), { vegetation: [3] }).windows.filter((w) => w.kind === "window")).toHaveLength(4);
    // The first pass's rule, the lit columns, still drops what is not on a lit column.
    expect(findOpenings(gridOf(hollow, 12, 12), new Uint8Array(144)).dropped.map((w) => w.reason)).toContain("unlit column");
  });

  it("the stone greys of the vegetation class are walls, not plants", () => {
    expect(plantEntries(PALETTE_CLASSES.base.vegetation)).not.toContain(187);
    expect(plantEntries(PALETTE_CLASSES.base.vegetation)).toContain(176);
  });

  it(
    "finds the four windows of a tower (cccccfffc), one a wall, and a house's (ccccccccc) on its north wall",
    async () => {
      const tower = detectWindows(voxelize(sourceOf(await loadMesh(shipped("cccccfffc"))), { name: "cccccfffc" })!).filter(
        (w) => w.kind === "window" && w.layer === 10 && w.x >= 35 && w.x <= 39 && w.y >= 29 && w.y <= 33,
      );
      expect(tower.map((w) => w.facing).sort()).toEqual([0, 1, 2, 3]);
      const city = detectWindows(voxelize(sourceOf(await loadMesh(shipped("ccccccccc"))), { name: "ccccccccc" })!);
      expect(city.filter((w) => w.kind === "window" && w.facing === 0 && w.x === 5 && w.y === 2).map((w) => w.layer).sort()).toEqual([10, 6]);
    },
    HEAVY_TEST_MS,
  );
});

describe("the light volume", () => {
  const grid = gridOf(house);
  const windows = detectWindows(grid);

  it.each(["flood", "rays"] as const)("%s: light reaches the cell in front of a window, falling off with the distance", (method) => {
    const volume = buildLightVolume(grid, windows, { method, reach: 6 });
    expect(lightOf(volume, 5, 4, 6)).toBe(255);
    const [near, far] = [lightOf(volume, 5, 3, 6), lightOf(volume, 5, 0, 6)];
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(ownerAt(volume, 5, 3, 6)).toBe(volume.sources[0]);
    expect(volume.bytes).toBe(12 * 12 * 10 * 2);
  });

  it.each(["flood", "rays"] as const)("%s: nothing beyond the reach, nothing behind the wall", (method) => {
    const volume = buildLightVolume(grid, windows, { method, reach: 3 });
    expect(lightOf(volume, 5, 3, 6)).toBeGreaterThan(0);
    expect(lightOf(volume, 5, 0, 6)).toBe(0);
    // Inside the wall and behind the window's plane: solid cells and the air behind it get none.
    expect(lightOf(volume, 5, 5, 6)).toBe(0);
    expect(lightOf(volume, 9, 8, 6)).toBe(0);
    for (let i = 0; i < volume.data.length; i += 2) if (grid.occupied[i / 2] && !(i / 2 === cellIndex(grid, 5, 4, 6))) expect(volume.data[i]).toBe(0);
  });

  it.each(["flood", "rays"] as const)("%s: a wall stops the light", (method) => {
    // A full-height wall across the tile two cells in front of the window.
    const walled = gridOf((x, y, l) => house(x, y, l) || (y === 2 && l >= GROUND_VOXELS));
    const volume = buildLightVolume(walled, detectWindows(walled), { method, reach: 6 });
    expect(lightOf(volume, 5, 3, 6)).toBeGreaterThan(0);
    expect(lightOf(volume, 5, 1, 6)).toBe(0);
    expect(lightOf(volume, 5, 0, 6)).toBe(0);
  });

  it("the doors light too unless told not to, and the gaps never", () => {
    const withDoor = gridOf((x, y, l) => house(x, y, l) && !(x === 6 && y === 4 && l >= 4 && l <= 5) && !(x === 5 && y === 7 && l === 4));
    const found = detectWindows(withDoor);
    expect(found.map((w) => w.kind).sort()).toEqual(["door", "gap", "window"]);
    expect(buildLightVolume(withDoor, found).sources.map((w) => w.kind).sort()).toEqual(["door", "window"]);
    expect(buildLightVolume(withDoor, found, { doors: false }).sources.map((w) => w.kind)).toEqual(["window"]);
  });

  it("the second pass's defaults: a longer reach, a softer falloff, a margin", () => {
    expect(DEFAULT_LIGHT_VOLUME).toEqual({ reach: 10, falloff: 1.2, method: "flood", doors: true, margin: 8 });
  });

  it.each(["flood", "rays"] as const)("%s: the light goes past the tile's border within the margin, kept as the spill", (method) => {
    // The window faces north at y 4: the border is 4 cells in front of it.
    const grid = gridOf(house);
    const windows = detectWindows(grid);
    const none = buildLightVolume(grid, windows, { method, reach: 10, margin: 0 });
    expect(none.spill.data.every((v) => v === 0)).toBe(true);
    const wide = buildLightVolume(grid, windows, { method, reach: 10, margin: 6 });
    expect(wide.spill.size).toBe(24);
    expect(spillOf(wide, 5, -1)).toBeGreaterThan(0);
    expect(spillOf(wide, 5, -1)).toBeGreaterThan(spillOf(wide, 5, -5));
    // Nothing past the margin, nothing inside the tile, nothing behind the wall's plane.
    expect(spillOf(wide, 5, -7)).toBe(0);
    expect(spillOf(wide, 5, 2)).toBe(0);
    expect(spillOf(wide, 5, 13)).toBe(0);
    // The volume inside the tile is the same size as without a margin.
    expect(wide.bytes).toBe(none.bytes);
  });

  it("a model with no window gives an empty volume", () => {
    const volume = buildLightVolume(gridOf((_x, _y, l) => l < GROUND_VOXELS), []);
    expect(volume.sources).toHaveLength(0);
    expect(volume.data.every((v) => v === 0)).toBe(true);
  });
});

describe("the per-type cache", () => {
  const grid = gridOf(house);

  it("builds nothing until a type is asked for, then once per type, in an idle slice", async () => {
    const cache = new WindowCache();
    expect(cache.size).toBe(0);
    const [a, b] = [cache.request("house", grid), cache.request("house", grid)];
    expect(a).toBe(b);
    expect(cache.peek("house")).toBeUndefined();
    const baked = await a;
    expect(cache.peek("house")).toBe(baked);
    expect(baked.windows).toHaveLength(1);
    expect(baked.volume.bytes).toBeGreaterThan(0);
    expect(await cache.request("house", grid)).toBe(baked);
  });

  it("frees every volume on clear, and a request made before it is not kept", async () => {
    const cache = new WindowCache();
    await cache.request("house", grid);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.peek("house")).toBeUndefined();
    const late = cache.request("house", grid);
    cache.clear();
    await late;
    expect(cache.size).toBe(0);
  });

  it("builds nothing for a request whose reader no longer wants it (skip), and builds for the next one", async () => {
    const cache = new WindowCache();
    expect(await cache.request("house", grid, undefined, {}, () => true)).toBeNull();
    expect(cache.size).toBe(0);
    expect((await cache.request("house", grid))!.windows).toHaveLength(1);
  });

  it("bakeWindows reports its times", () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(5);
    const baked = bakeWindows(grid);
    expect(baked.detectMs).toBeGreaterThanOrEqual(0);
    vi.restoreAllMocks();
  });
});
