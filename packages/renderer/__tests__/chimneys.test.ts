import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROUND_VOXELS } from "../src/core/feature-codes";
import { cellIndex, voxelize, type VoxelGrid } from "../src/core/voxelizer";
import { PALETTE_CLASSES } from "../src/core/features";
import {
  CHIMNEY_ENTRIES,
  LIGHT_ENTRIES,
  chimneyOptionsOf,
  findChimneys,
  lightEntries,
  mouthPoint,
  overridesOf,
  runsOf,
  type ChimneyOptions,
} from "../src/core/chimneys";
import { decodePng } from "./helpers/png";
import { PLANS, SHIPPED, loadMesh, shipped, sourceOf } from "./helpers/model-meshes";

const HEAVY_TEST_MS = 120_000;

/** Entries of the synthetic grids: 7 a wall, 20 the smoke, 30 a stack, 40 a roof, 50 leaves, 60 the walls' stone, 70 a wonder. */
const [WALL, SMOKE, STACK, ROOF, LEAF, STONE, WONDER] = [7, 20, 30, 40, 50, 60, 70];
const OPTIONS: ChimneyOptions = { light: [SMOKE], vegetation: [LEAF], stacks: [STACK], walls: [STONE], wonders: [WONDER] };

/** A synthetic grid from an entry function (null for air): 16 x 16 x 16 cells, the slab four layers high, as the models are. */
function gridOf(entryAt: (x: number, y: number, layer: number) => number | null, size = 16, layers = 16): VoxelGrid {
  const occupied = new Uint8Array(size * size * layers);
  const cells: number[] = [];
  const entries: number[] = [];
  for (let l = 0; l < layers; l++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const entry = l < GROUND_VOXELS ? WALL : entryAt(x, y, l);
        if (entry === null) continue;
        occupied[cellIndex({ sizeX: size, sizeY: size }, x, y, l)] = 1;
        cells.push(x, y, l);
        entries.push(entry);
      }
    }
  }
  return {
    sizeX: size,
    sizeY: size,
    layers,
    step: 0.1,
    origin: [0, 0, 0],
    count: entries.length,
    cells: Uint8Array.from(cells),
    entry: Uint8Array.from(entries),
    visible: new Uint8Array(entries.length).fill(1),
    visibleCount: entries.length,
    occupied,
    groundTop: GROUND_VOXELS - 1,
    slabCount: 0,
    buildMs: 0,
  };
}

/** A house: walls x 3 to 9, y 3 to 9, layers 4 to 6, a flat roof at layer 7. */
const house = (x: number, y: number, l: number): number | null => (x >= 3 && x <= 9 && y >= 3 && y <= 9 && l >= 4 && l <= 7 ? (l === 7 ? ROOF : WALL) : null);
/** A house with a 1 x 1 stack at (5, 5) on its roof (layer 8), and `top` over it. */
const withStack = (top: (x: number, y: number, l: number) => number | null = () => null) => (x: number, y: number, l: number) =>
  house(x, y, l) ?? (x === 5 && y === 5 && l === 8 ? STACK : top(x, y, l));
/** The smoke of a stack at (5, 5): puffs at layers 9, 11 and 12 (a gap of one), the last drifted a column. */
const puffs = (x: number, y: number, l: number) => ((x === 5 && y === 5 && (l === 9 || l === 11)) || (x === 6 && y === 5 && l === 12) ? SMOKE : null);

describe("the smoking chimneys", () => {
  it("finds the white voxels over a narrow stack on a roof: the mouth, the smoke and its boxes", () => {
    const found = findChimneys(gridOf(withStack(puffs)), OPTIONS);
    expect(found.chimneys).toHaveLength(1);
    const [chimney] = found.chimneys;
    expect(chimney).toMatchObject({ kind: "smoking", mouth: { x: 5, y: 5, width: 1, depth: 1, layer: 8 }, stackHeight: 1, entry: STACK, colour: true });
    expect(chimney!.smoke).toEqual([[5, 5, 9], [5, 5, 11], [6, 5, 12]]);
    expect(chimney!.boxes).toEqual([
      { x0: 5, y0: 5, layer0: 9, x1: 5, y1: 5, layer1: 9 },
      { x0: 5, y0: 5, layer0: 11, x1: 5, y1: 5, layer1: 11 },
      { x0: 6, y0: 5, layer0: 12, x1: 6, y1: 5, layer1: 12 },
    ]);
    // The smoke leaves at the middle of the mouth's top face.
    expect(mouthPoint({ origin: [1, 2, 3], step: 0.1 }, chimney!)).toEqual([1 + 0.55, 2 + 0.9, 3 + 0.55].map((v) => expect.closeTo(v, 9)));
    expect(found.rejected).toEqual([]);
  });

  it("rejects the light voxels that are not smoke, each with its reason", () => {
    const reasons = (at: (x: number, y: number, l: number) => number | null) => findChimneys(gridOf(at), OPTIONS).rejected.filter((r) => r.kind === "plume").map((r) => [r.kind, r.reason]);
    // A white stone in a wall: solid of another colour beside it.
    expect(reasons((x, y, l) => (x === 3 && y === 6 && l === 5 ? SMOKE : house(x, y, l)))).toEqual([["plume", "in a structure"]]);
    // A white voxel on the slab.
    expect(reasons((x, y, l) => (x === 12 && y === 12 && l === 4 ? SMOKE : house(x, y, l)))).toEqual([["plume", "on the ground"]]);
    // A puff with nothing under it within two layers of air.
    expect(reasons((x, y, l) => (x === 12 && y === 12 && l === 10 ? SMOKE : house(x, y, l)))).toEqual([["plume", "no stack"]]);
    // A puff on a flat roof: a wide support.
    expect(reasons((x, y, l) => (x === 5 && y === 5 && l === 8 ? SMOKE : house(x, y, l)))).toEqual([["plume", "wide support"]]);
    // A puff on a post that stands on the slab: no roof.
    expect(reasons((x, y, l) => (x === 12 && y === 12 ? (l <= 7 ? STACK : l === 8 ? SMOKE : null) : house(x, y, l)))).toEqual([["plume", "no roof"]]);
    // More than a smoke's voxels.
    expect(reasons((x, y, l) => (x >= 4 && x <= 8 && y >= 4 && y <= 8 && l >= 8 && l <= 9 ? SMOKE : house(x, y, l)))).toEqual([["plume", "too large"]]);
  });
});

describe("the bare chimneys", () => {
  it("finds a narrow stack on a roof with nothing on it, its mouth at the stack's top", () => {
    const found = findChimneys(gridOf(withStack()), OPTIONS);
    expect(found.chimneys).toEqual([expect.objectContaining({ kind: "bare", mouth: { x: 5, y: 5, width: 1, depth: 1, layer: 8 }, stackHeight: 1, smoke: [], boxes: [], colour: true })]);
  });

  it("keeps a bare stack in another colour, marked as such: the colour is a hint, not a rule", () => {
    const found = findChimneys(gridOf((x, y, l) => house(x, y, l) ?? (x === 5 && y === 5 && l === 8 ? WALL : null)), OPTIONS);
    expect(found.chimneys).toEqual([expect.objectContaining({ kind: "bare", entry: WALL, colour: false })]);
  });

  it("finds a 2 x 2 stack, and a stack two layers high", () => {
    const wide = findChimneys(gridOf((x, y, l) => house(x, y, l) ?? (x >= 5 && x <= 6 && y >= 5 && y <= 6 && l === 8 ? STACK : null)), OPTIONS);
    expect(wide.chimneys.map((c) => c.mouth)).toEqual([{ x: 5, y: 5, width: 2, depth: 2, layer: 8 }]);
    const tall = findChimneys(gridOf((x, y, l) => house(x, y, l) ?? (x === 5 && y === 5 && (l === 8 || l === 9) ? STACK : null)), OPTIONS);
    expect(tall.chimneys).toEqual([expect.objectContaining({ mouth: expect.objectContaining({ layer: 9 }), stackHeight: 2 })]);
  });

  it("rejects the high points that are not chimneys: a post, a tree, a merlon, a wonder's ornament, a roof's apex, a spire, a crenel", () => {
    const reasons = (at: (x: number, y: number, l: number) => number | null) => findChimneys(gridOf(at), OPTIONS).rejected.filter((r) => r.kind === "high point").map((r) => r.reason);
    // A post on the slab, as high as a chimney: no roof.
    expect(reasons((x, y, l) => house(x, y, l) ?? (x === 13 && y === 13 && l <= 8 ? STACK : null))).toEqual(["no roof"]);
    // A tree: a trunk of leaves' entries on a crown.
    expect(reasons((x, y, l) => house(x, y, l) ?? (x === 5 && y === 5 && l === 8 ? LEAF : null))).toEqual(["vegetation"]);
    expect(reasons((x, y, l) => (house(x, y, l) !== null ? LEAF : x === 5 && y === 5 && l === 8 ? STACK : null))).toEqual(["vegetation"]);
    // A merlon: the walls' stone.
    expect(reasons((x, y, l) => house(x, y, l) ?? (x === 5 && y === 5 && l === 8 ? STONE : null))).toEqual(["wall"]);
    // A wonder's ornament.
    expect(reasons((x, y, l) => house(x, y, l) ?? (x === 5 && y === 5 && l === 8 ? WONDER : null))).toEqual(["wonder"]);
    // The apex of a roof: the roof's own colour.
    expect(reasons((x, y, l) => house(x, y, l) ?? (x === 5 && y === 5 && l === 8 ? ROOF : null))).toEqual(["roof"]);
    // A spire: four layers of narrow stack.
    expect(reasons((x, y, l) => house(x, y, l) ?? (x === 5 && y === 5 && l >= 8 && l <= 11 ? STACK : null))).toEqual(["spire"]);
    // Crenels: high points of the same height two columns apart along the roof's edge.
    expect(reasons((x, y, l) => house(x, y, l) ?? (y === 3 && (x === 3 || x === 5 || x === 7 || x === 9) && l === 8 ? STACK : null))).toEqual(["crenel", "crenel", "crenel", "crenel"]);
  });

  it("does not take a smoking chimney's stack for a bare one", () => {
    expect(findChimneys(gridOf(withStack(puffs)), OPTIONS).chimneys.map((c) => c.kind)).toEqual(["smoking"]);
  });

  it("applies the overrides: a rejected high point kept, a chimney dropped", () => {
    const merlon = (x: number, y: number, l: number) => house(x, y, l) ?? (x === 5 && y === 5 && l === 8 ? STONE : null);
    const kept = findChimneys(gridOf(merlon), { ...OPTIONS, overrides: [{ x: 5, y: 5, keep: true, note: "a test" }] });
    expect(kept.chimneys).toEqual([expect.objectContaining({ kind: "bare", overridden: true })]);
    const dropped = findChimneys(gridOf(withStack(puffs)), { ...OPTIONS, overrides: [{ x: 5, y: 5, keep: false, note: "a test" }] });
    expect(dropped.chimneys).toEqual([]);
    expect(dropped.rejected.map((r) => [r.kind, r.reason])).toEqual(expect.arrayContaining([["plume", "override"]]));
  });

  it("reads the override list by model id, a variant's path or its name", () => {
    expect(overridesOf("models/forest/wfffffffr_HF_2.0123456789.glb").length).toBeGreaterThan(0);
    expect(overridesOf("wfffffffr_HF_2")).toBe(overridesOf("models/forest/wfffffffr_HF_2.0123456789.glb"));
    expect(overridesOf("ccccccccc")).toEqual([]);
  });
});

describe("runsOf", () => {
  it("joins a column's cells that follow each other into one box", () => {
    expect(runsOf([[1, 1, 5], [1, 1, 6], [1, 1, 8], [2, 1, 5]])).toEqual([
      { x0: 1, y0: 1, layer0: 5, x1: 1, y1: 1, layer1: 6 },
      { x0: 1, y0: 1, layer0: 8, x1: 1, y1: 1, layer1: 8 },
      { x0: 2, y0: 1, layer0: 5, x1: 2, y1: 1, layer1: 5 },
    ]);
  });
});

/** A model file's palette: its embedded 256 x 1 texture's colours. */
function paletteOf(file: string): Array<[number, number, number]> {
  const glb = readFileSync(file);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const bin = glb.subarray(20 + glb.readUInt32LE(12) + 8);
  const view = json.bufferViews[json.images[0].bufferView];
  const { rgba } = decodePng(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
  return Array.from({ length: 256 }, (_, i) => [rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!]);
}

/**
 * The chimneys of every model, by kind (CHIMNEY-SMOKE-1, #770 PR 1, the owner to check in `Renderer/Chimneys`): smoking, bare,
 * and the smoke voxels of the smoking ones. 29 smoking chimneys and 110 bare across the 19 base models and the 72 Forest variants.
 */
const TABLE: Record<string, readonly [number, number, number]> = {
  ccccccccc: [0, 0, 0],
  cccccfffc: [0, 3, 0],
  cccccfrfc: [0, 3, 0],
  cfffcfffc: [0, 1, 0],
  ffcfffcff: [0, 1, 0],
  ffcfffffc: [0, 4, 0],
  ffffcccff: [0, 1, 0],
  ffffffcff: [0, 2, 0],
  rfffrfcfr: [0, 2, 0],
  rfffrfffr: [1, 1, 4],
  rfrfcccfr: [0, 3, 0],
  rfrfffcfr: [0, 3, 0],
  rfrfffffr: [0, 2, 0],
  rfrfrfcff: [0, 1, 0],
  sfrfrfcfr: [0, 1, 0],
  sfrfrfffr: [2, 0, 18],
  sfrfrfrfr: [0, 2, 0],
  wffffffff: [0, 1, 0],
  wfffffffr: [0, 1, 0],
  ccccccccc_HF_1: [0, 0, 0],
  cccccfffc_HF_1: [0, 3, 0],
  cccccfffc_HF_2: [0, 1, 0],
  cccccfffc_HF_3: [0, 4, 0],
  cccccfffc_HF_4: [0, 1, 0],
  cccccfrfc_HF_1: [0, 3, 0],
  cccccfrfc_HF_2: [0, 2, 0],
  cccccfrfc_HF_3: [0, 4, 0],
  cfffcfffc_HF_1: [1, 0, 4],
  cfffcfffc_HF_2: [0, 0, 0],
  cfffcfffc_HF_3: [0, 3, 0],
  ffcfffcff_HF_1: [0, 1, 0],
  ffcfffcff_HF_2: [0, 1, 0],
  ffcfffcff_HF_3: [0, 1, 0],
  ffcfffffc_HF_1: [1, 3, 5],
  ffcfffffc_HF_2: [0, 1, 0],
  ffffcccff_HF_1: [0, 1, 0],
  ffffcccff_HF_2: [1, 2, 7],
  ffffcccff_HF_3: [0, 2, 0],
  ffffcccff_HF_4: [0, 1, 0],
  ffffcccff_HF_5: [0, 1, 0],
  ffffffcff_HF_1: [1, 0, 6],
  ffffffcff_HF_2: [1, 1, 6],
  ffffffcff_HF_3: [0, 1, 0],
  ffffffcff_HF_4: [0, 2, 0],
  ffffffcff_HF_5: [0, 1, 0],
  rfffrfcfr_HF_1: [1, 1, 8],
  rfffrfcfr_HF_2: [1, 0, 4],
  rfffrfcfr_HF_3: [0, 1, 0],
  rfffrfcfr_HF_4: [0, 1, 0],
  rfffrfffr_HF_1: [1, 1, 3],
  rfffrfffr_HF_2: [0, 2, 0],
  rfffrfffr_HF_3: [1, 0, 3],
  rfffrfffr_HF_4: [0, 0, 0],
  rfffrfffr_HF_5: [0, 0, 0],
  rfffrfffr_HF_6: [1, 0, 4],
  rfffrfffr_HF_7: [0, 1, 0],
  rfffrfffr_HF_8: [0, 1, 0],
  rfrfcccfr_HF_1: [0, 3, 0],
  rfrfcccfr_HF_2: [1, 2, 6],
  rfrfcccfr_HF_3: [0, 1, 0],
  rfrfcccfr_HF_4: [0, 0, 0],
  rfrfcccfr_HF_5: [0, 3, 0],
  rfrfffcfr_HF_1: [1, 2, 4],
  rfrfffcfr_HF_2: [0, 0, 0],
  rfrfffcfr_HF_3: [0, 1, 0],
  rfrfffffr_HF_1: [1, 0, 8],
  rfrfffffr_HF_2: [0, 2, 0],
  rfrfffffr_HF_3: [1, 1, 3],
  rfrfffffr_HF_4: [0, 0, 0],
  rfrfffffr_HF_5: [0, 0, 0],
  rfrfffffr_HF_6: [1, 0, 2],
  rfrfffffr_HF_7: [0, 1, 0],
  rfrfffffr_HF_8: [0, 0, 0],
  rfrfffffr_HF_9: [0, 0, 0],
  rfrfrfcff_HF_1: [1, 1, 6],
  rfrfrfcff_HF_2: [0, 2, 0],
  rfrfrfcff_HF_3: [1, 3, 5],
  sfrfrfcfr_HF_1: [1, 1, 6],
  sfrfrfcfr_HF_2: [1, 0, 5],
  sfrfrfcfr_HF_3: [1, 1, 4],
  sfrfrfffr_HF_1: [1, 0, 5],
  sfrfrfffr_HF_2: [2, 1, 6],
  sfrfrfffr_HF_3: [1, 0, 5],
  sfrfrfffr_HF_4: [1, 1, 6],
  sfrfrfrfr_HF_1: [0, 2, 0],
  wffffffff_HF_1: [0, 0, 0],
  wffffffff_HF_2: [0, 1, 0],
  wffffffff_HF_3: [0, 0, 0],
  wffffffff_HF_4: [1, 0, 6],
  wfffffffr_HF_1: [0, 1, 0],
  wfffffffr_HF_2: [0, 0, 0],
};

const MODELS: ReadonlyArray<readonly [string, string]> = [
  ...PLANS.map((plan) => [plan, shipped(plan)] as const),
  ...readdirSync(`${SHIPPED}/forest`).map((file) => [`models/forest/${file}`, `${SHIPPED}/forest/${file}`] as const),
];
const nameOf = (id: string) => id.slice(id.lastIndexOf("/") + 1).replace(/\.[0-9a-f]{10}\.glb$/, "");

describe("the chimneys of the models", () => {
  it("pins each palette's light entries and chimney colours to the models' palettes", () => {
    for (const [id, file] of MODELS) {
      const palette = paletteOf(file);
      const name = id.startsWith("models/forest/") ? "forest" : "base";
      expect(lightEntries(palette), id).toEqual(LIGHT_ENTRIES[name]);
      // The smoke's colour (224, 228, 234), and the stacks' grey stone (127, 127, 114).
      expect(palette[name === "base" ? 24 : 240], id).toEqual([224, 228, 234]);
      expect(palette[CHIMNEY_ENTRIES[name][0]!], id).toEqual([127, 127, 114]);
    }
    expect(chimneyOptionsOf("models/forest/ffcfffcff_HF_1.0123456789.glb")).toMatchObject({ light: LIGHT_ENTRIES.forest, walls: PALETTE_CLASSES.forest.stone, wonders: PALETTE_CLASSES.forest.wonder });
  });

  it(
    "finds each model's chimneys by kind, takes every smoke voxel for a smoking chimney's, and rejects the wonders' whites",
    async () => {
      const smokeEntry = { base: 24, forest: 240 };
      const stacks = new Set<number>();
      for (const [id, file] of MODELS) {
        const grid = voxelize(sourceOf(await loadMesh(file)), { name: id })!;
        const found = findChimneys(grid, chimneyOptionsOf(id));
        const smoking = found.chimneys.filter((c) => c.kind === "smoking");
        const smoke = smoking.reduce((n, c) => n + c.smoke.length, 0);
        expect([smoking.length, found.chimneys.length - smoking.length, smoke], id).toEqual(TABLE[nameOf(id)]);
        // Every voxel of the smoke's colour is a smoking chimney's; no other light voxel is.
        const entry = smokeEntry[id.startsWith("models/forest/") ? "forest" : "base"];
        let smokeVoxels = 0;
        for (let v = 0; v < grid.count; v++) if (grid.entry[v] === entry) smokeVoxels++;
        expect(smoke, id).toBe(smokeVoxels);
        for (const c of smoking) {
          stacks.add(c.entry);
          for (const [x, y, l] of c.smoke) expect(grid.entry[findVoxel(grid, x, y, l)], id).toBe(entry);
        }
        // Every other light voxel (a wonder's whites) is in a rejected plume: none is lost, none taken for smoke.
        const rejectedLight = found.rejected.filter((r) => r.kind === "plume").reduce((n, r) => n + r.cells.length, 0);
        expect(smoke + rejectedLight, id).toBe(found.lightVoxels);
      }
      // The chimneys' colours are the stacks under the white smoke.
      expect([...stacks].sort()).toEqual([...CHIMNEY_ENTRIES.base]);
    },
    HEAVY_TEST_MS,
  );
});

/** The voxel index of a cell (the grid's cells are listed layer by layer, then row by row). */
function findVoxel(grid: VoxelGrid, x: number, y: number, l: number): number {
  for (let v = 0; v < grid.count; v++) if (grid.cells[v * 3] === x && grid.cells[v * 3 + 1] === y && grid.cells[v * 3 + 2] === l) return v;
  return -1;
}

