import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import * as THREE from "three";
import { DEFAULT_PERCH_RULES, findPerches, vegetationOf } from "../src/core/bird-perches";
import { DEFAULT_BIRD_SETTINGS, MAX_BIRDS, resolveBirdSettings, type BirdSettings } from "../src/core/bird-settings";
import { Birds, birdGeometry } from "../src/core/birds";
import { voxelize, type VoxelGrid } from "../src/core/voxelizer";
import { TILE_SIZE } from "../src/core/types";
import { PLANS, SHIPPED, loadMesh, shipped, sourceOf } from "./helpers/model-meshes";

/** Reading and voxelizing every model: well under a second here, but CI runs every package's tests at once. */
const HEAVY_TEST_MS = 60_000;

/** A grid of `columns` (x, y, top layer, entry), the slab under them, for the perch rules alone. */
function gridOf(columns: Array<[number, number, number, number]>, size = 12): VoxelGrid {
  const cells: number[] = [];
  const entry: number[] = [];
  const layers = Math.max(4, ...columns.map(([, , top]) => top + 1));
  for (let layer = 0; layer < layers; layer++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const column = columns.find(([cx, cy]) => cx === x && cy === y);
        const top = column ? column[2] : 3;
        if (layer > top) continue;
        cells.push(x, y, layer);
        entry.push(layer === top && column ? column[3] : 3);
      }
    }
  }
  const count = entry.length;
  return {
    sizeX: size, sizeY: size, layers, step: 0.1, origin: [0, 0, 0], count,
    cells: Uint8Array.from(cells), entry: Uint8Array.from(entry), visible: new Uint8Array(count), visibleCount: 0,
    occupied: new Uint8Array(size * size * layers), groundTop: 3, slabCount: 0, buildMs: 0,
  };
}

const LEAVES = 176;
const ROOF = 7;

describe("the perches: tree tops off the voxels (#574)", () => {
  it("keeps the highest vegetation column of a crown, not a roof, not the grass", () => {
    const grid = gridOf([
      [2, 2, 9, LEAVES],
      [3, 2, 8, LEAVES],
      [2, 3, 8, LEAVES],
      [8, 8, 10, ROOF],
      [8, 2, 5, LEAVES],
    ]);
    const perches = findPerches(grid, vegetationOf("base"));
    // The crown at (2, 2) and nothing else: the roof is no vegetation, the bush at (8, 2) is under three voxels over the slab.
    expect(Array.from(perches)).toEqual([expect.closeTo(0.25, 5), expect.closeTo(1, 5), expect.closeTo(0.25, 5)]);
  });

  it("keeps one perch per crown: two tops closer than the spacing are one", () => {
    const grid = gridOf([
      [2, 2, 9, LEAVES],
      [4, 2, 9, LEAVES],
      [9, 2, 8, LEAVES],
    ]);
    const perches = findPerches(grid, vegetationOf("base"));
    expect(perches.length / 3).toBe(2);
    expect(perches[0]).toBeCloseTo(0.25);
    expect(perches[3]).toBeCloseTo(0.95);
  });

  it(
    "finds trees on every base model and every Forest variant, each a vegetation top over the bushes",
    async () => {
      expect(PLANS).toHaveLength(19);
      const check = (grid: VoxelGrid, perches: Float32Array, name: string) => {
        expect(perches.length / 3, name).toBeGreaterThanOrEqual(8);
        for (let i = 0; i < perches.length; i += 3) {
          const layer = Math.round((perches[i + 1]! - grid.origin[1]) / grid.step) - 1;
          expect(layer, name).toBeGreaterThanOrEqual(grid.groundTop + DEFAULT_PERCH_RULES.minAbove);
        }
      };
      for (const plan of PLANS) {
        const grid = voxelize(sourceOf(await loadMesh(shipped(plan))), { name: plan })!;
        check(grid, findPerches(grid, vegetationOf("base")), plan);
      }
      const forest = readdirSync(`${SHIPPED}/forest`).filter((f) => f.endsWith(".glb"));
      expect(forest).toHaveLength(72);
      for (const file of forest) {
        const grid = voxelize(sourceOf(await loadMesh(`${SHIPPED}/forest/${file}`)), { name: file })!;
        check(grid, findPerches(grid, vegetationOf("forest")), file);
      }
    },
    HEAVY_TEST_MS,
  );
});

describe("the bird", () => {
  it("is a few cubes, its two wings marked for the wingbeat", () => {
    const geometry = birdGeometry();
    const wing = geometry.getAttribute("aWing");
    // Five boxes of 36 vertices: 12 triangles each.
    expect(geometry.getAttribute("position").count).toBe(5 * 36);
    const sides = new Set(Array.from(wing.array as Float32Array));
    expect(sides).toEqual(new Set([-1, 0, 1]));
  });
});

/** A board of `plans` in a row, each tile its model placed as the board places it (a clone, scaled to a tile), and its birds. */
async function board(plans: string[], settings: Partial<BirdSettings> = {}) {
  const frame = new THREE.Group();
  const time = { value: 0 };
  const birds = new Birds(time, resolveBirdSettings(settings), 7);
  frame.add(birds.object);
  const sources = [];
  for (const [i, plan] of plans.entries()) {
    const mesh = await loadMesh(shipped(plan));
    let type: THREE.Object3D = mesh;
    while (type.parent) type = type.parent;
    const tile = type.clone();
    tile.scale.setScalar(TILE_SIZE / 4);
    const container = new THREE.Group();
    container.position.set(i * TILE_SIZE, 0, 0);
    container.add(tile);
    frame.add(container);
    sources.push({ key: plan, type, tile });
  }
  birds.setTiles(sources, frame);
  await birds.whenReady();
  return { birds, time, frame };
}

/** Steps the birds at 30 a second for `seconds`, from `time`; returns the steps that asked for a frame. */
function run(birds: Birds, time: { value: number }, seconds: number): number {
  let frames = 0;
  for (let i = 0; i < seconds * 30; i++) {
    time.value += 1 / 30;
    if (birds.step(time.value)) frames++;
  }
  return frames;
}

describe("the birds (#574)", () => {
  it("place each type's perches on every tile of it, in the board's frame", async () => {
    const { birds } = await board(["rfffrfffr", "rfffrfffr"]);
    const own = birds.perchesOfType("rfffrfffr")!.length / 3;
    const perches = birds.boardPerches();
    expect(perches).toHaveLength(own * 2);
    // The second tile's perches are the first's, a tile further along x.
    for (let i = 0; i < own; i++) expect(perches[own + i]!.clone().sub(perches[i]!).toArray().map((v) => +v.toFixed(4))).toEqual([TILE_SIZE, 0, 0]);
    birds.dispose();
  });

  it("fly a bird from one tree to another: it rises, cruises, lands and sinks into the crown, one draw while it shows", async () => {
    const { birds, time } = await board(["rfffrfffr", "rfrfffffr"], { intervalSeconds: 3600 });
    run(birds, time, 1);
    expect(birds.stats()).toMatchObject({ flying: 0, drawCalls: 0 });
    expect(birds.launch("single")).toBe(true);
    const seen = new Set<string>();
    let most = 0;
    for (let i = 0; i < 30 * 20 && birds.states().length; i++) {
      time.value += 1 / 30;
      birds.step(time.value);
      birds.states().forEach((s) => seen.add(s));
      most = Math.max(most, birds.stats().drawCalls);
    }
    expect([...seen]).toEqual(expect.arrayContaining(["takeoff", "cruise", "landing", "settling"]));
    expect(birds.states()).toEqual([]);
    expect(most).toBe(1);
    // The last bird gone: one more frame clears it, then the birds ask for none.
    expect(run(birds, time, 2)).toBeLessThanOrEqual(1);
    expect(birds.stats().drawCalls).toBe(0);
    birds.dispose();
  });

  it("fly a flock: two to the flock's size, all land, the air never past its cap", async () => {
    const { birds, time } = await board(["rfffrfffr", "rfrfffffr", "ffffffcff"], { intervalSeconds: 3600, flockSize: 6 });
    expect(birds.launch("flock")).toBe(true);
    const count = birds.states().length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(6);
    let most = 0;
    for (let i = 0; i < 30 * 30 && birds.states().length; i++) {
      time.value += 1 / 30;
      birds.step(time.value);
      most = Math.max(most, birds.stats().flying);
    }
    expect(most).toBe(count);
    expect(birds.states()).toEqual([]);
    for (let i = 0; i < 20; i++) birds.launch("flock");
    expect(birds.states().length).toBeLessThanOrEqual(MAX_BIRDS);
    birds.dispose();
  });

  it("start a flight from the tree nearest a point when asked (the stories' \"Fly now\")", async () => {
    const { birds, time } = await board(["rfffrfffr", "rfrfffffr"], { intervalSeconds: 3600 });
    const perches = birds.boardPerches();
    const corner = perches.reduce((a, p) => (p.x + p.z > a.x + a.z ? p : a));
    birds.launch("single", { x: corner.x + 0.01, z: corner.z });
    run(birds, time, 0.5);
    const bird = (birds as unknown as { birds: Array<{ pos: THREE.Vector3 }> }).birds[0]!;
    expect(Math.hypot(bird.pos.x - corner.x, bird.pos.z - corner.z)).toBeLessThan(TILE_SIZE / 4);
    birds.dispose();
  });

  it("start a flight every interval on average, and none at night (they roost)", async () => {
    const { birds, time } = await board(["rfffrfffr", "rfrfffffr"], { intervalSeconds: 4 });
    run(birds, time, 400);
    const flights = birds.stats().flights;
    expect(flights).toBeGreaterThan(60);
    expect(flights).toBeLessThan(140);
    birds.setNight(true);
    run(birds, time, 60);
    expect(birds.states()).toEqual([]);
    run(birds, time, 200);
    expect(birds.stats().flights).toBeLessThanOrEqual(flights + 1);
    birds.dispose();
  });

  it("cast shadows only when the settings say so, asking for the shadow map then", async () => {
    const { birds, time } = await board(["rfffrfffr", "rfrfffffr"], { intervalSeconds: 3600 });
    let shadows = 0;
    birds.onShadow = () => shadows++;
    birds.launch("single");
    run(birds, time, 2);
    expect(shadows).toBe(0);
    birds.setSettings(resolveBirdSettings({ intervalSeconds: 3600, shadows: true }));
    expect((birds.object.getObjectByName("birds-flying") as THREE.Mesh).castShadow).toBe(true);
    run(birds, time, 1);
    expect(shadows).toBeGreaterThan(0);
    birds.dispose();
  });

  it("show the perches as markers, one more draw, and free everything on dispose (twice is fine)", async () => {
    const { birds, frame } = await board(["rfffrfffr"]);
    birds.showPerches(true);
    expect(birds.stats().drawCalls).toBe(1);
    const markers = birds.object.getObjectByName("bird-perches") as THREE.InstancedMesh;
    expect(markers.count).toBe(birds.boardPerches().length);
    birds.dispose();
    birds.dispose();
    expect(frame.getObjectByName("birds")).toBeUndefined();
  });
});

describe("the birds' settings", () => {
  it("are subtle by default and keep the base's value for one out of range", () => {
    expect(DEFAULT_BIRD_SETTINGS.intervalSeconds).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_BIRD_SETTINGS.shadows).toBe(false);
    const s = resolveBirdSettings({ flockSize: 99, speed: -1, color: "red", flockShare: 0.5 });
    expect(s.flockSize).toBe(DEFAULT_BIRD_SETTINGS.flockSize);
    expect(s.speed).toBe(DEFAULT_BIRD_SETTINGS.speed);
    expect(s.color).toBe(DEFAULT_BIRD_SETTINGS.color);
    expect(s.flockShare).toBe(0.5);
  });
});
