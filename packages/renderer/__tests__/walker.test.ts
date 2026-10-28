import { describe, expect, it } from "vitest";
import { WALK_GROUND, WalkMap } from "../src/core/walk-map";
import { Walker, findStart, footprint, stanceAt } from "../src/core/walker";
import { DEFAULT_WALK_SETTINGS, resolveWalkSettings, type WalkSettings } from "../src/core/walk-settings";

/**
 * A synthetic board, `size` columns a side and 16 layers: a ground slab 3 layers deep (its top at 3) everywhere, a road (walkable)
 * on the rows `road`, and what `build` adds.
 */
function board(size: number, road: (x: number, z: number) => boolean, build: (solid: (x: number, z: number, layer: number) => void) => void = () => {}): WalkMap {
  const layers = 16;
  const solid = new Uint8Array(size * size * layers);
  const ground = new Uint8Array(size * size);
  const set = (x: number, z: number, layer: number) => {
    solid[x + size * (z + size * layer)] = 1;
  };
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      for (let layer = 0; layer < 3; layer++) set(x, z, layer);
      if (road(x, z)) ground[x + size * z] = WALK_GROUND.road;
    }
  }
  build(set);
  return new WalkMap(0.075, 0, 0, size, size, layers, solid, ground);
}

const SETTINGS: WalkSettings = resolveWalkSettings({ lookSmoothingMs: 0 });

/** Whether the walker's body (its cylinder from the floor to the eye and headroom) holds a solid voxel. */
function bodyHitsSolid(map: WalkMap, walker: Walker, settings: WalkSettings): boolean {
  const top = walker.feet + settings.eyeVoxels + settings.headroomVoxels;
  for (const [i, j] of footprint(walker.x, walker.z, settings.radiusVoxels)) {
    for (let layer = Math.floor(walker.feet); layer < Math.ceil(top); layer++) if (map.solidAt(i, j, layer)) return true;
  }
  return false;
}

describe("the walker's stance (V4-WALK-1)", () => {
  it("stands on the floor of the walkable ground, never off it", () => {
    const map = board(20, (_x, z) => z >= 8 && z < 12);
    expect(stanceAt(map, SETTINGS, 10, 10, 3)).toBe(3);
    // Off the road: the field is not walkable (the walker stops at the edge, open point 4).
    expect(stanceAt(map, SETTINGS, 10, 5, 3)).toBeNull();
  });

  it("climbs a step of one voxel, not two", () => {
    const one = board(20, () => true, (set) => {
      for (let z = 0; z < 20; z++) for (let x = 10; x < 20; x++) set(x, z, 3);
    });
    expect(stanceAt(one, SETTINGS, 12, 10, 3)).toBe(4);
    const two = board(20, () => true, (set) => {
      for (let z = 0; z < 20; z++) for (let x = 10; x < 20; x++) [3, 4].forEach((layer) => set(x, z, layer));
    });
    // Two layers up is a wall to the feet.
    expect(stanceAt(two, SETTINGS, 12, 10, 3)).toBeNull();
  });

  it("does not fit under a ceiling lower than its head", () => {
    const low = board(20, () => true, (set) => {
      for (let x = 0; x < 20; x++) set(x, 10, 3 + SETTINGS.eyeVoxels + 1);
    });
    expect(stanceAt(low, SETTINGS, 10, 10.5, 3)).toBeNull();
    const high = board(20, () => true, (set) => {
      for (let x = 0; x < 20; x++) set(x, 10, 3 + SETTINGS.eyeVoxels + SETTINGS.headroomVoxels);
    });
    expect(stanceAt(high, SETTINGS, 10, 10.5, 3)).toBe(3);
  });

  it("keeps its radius from a wall", () => {
    const map = board(20, () => true, (set) => {
      for (let z = 0; z < 20; z++) for (let layer = 3; layer < 12; layer++) set(12, z, layer);
    });
    // The wall's face is at x = 12: the centre may come no closer than the radius.
    expect(stanceAt(map, SETTINGS, 12 - SETTINGS.radiusVoxels - 0.01, 10, 3)).toBe(3);
    expect(stanceAt(map, SETTINGS, 12 - SETTINGS.radiusVoxels + 0.05, 10, 3)).toBeNull();
  });
});

describe("the walker's moves", () => {
  it("walks forward along its yaw (0 looks to -z) and turns right with a positive turn", () => {
    const map = board(40, () => true);
    const walker = new Walker(map, SETTINGS, { x: 20, z: 20, floor: 3 });
    walker.step(0.5, { x: 0, y: 1 });
    expect(walker.z).toBeCloseTo(20 - SETTINGS.speed * 0.5, 5);
    expect(walker.x).toBeCloseTo(20, 5);
    walker.turn(Math.PI / 2, 0);
    walker.step(0.25, { x: 0, y: 1 });
    // A quarter turn to the right faces +x.
    expect(walker.x).toBeCloseTo(20 + SETTINGS.speed * 0.25, 5);
  });

  it("slides along a wall it walks into at an angle", () => {
    const map = board(40, () => true, (set) => {
      for (let z = 0; z < 40; z++) for (let layer = 3; layer < 14; layer++) set(25, z, layer);
    });
    const walker = new Walker(map, SETTINGS, { x: 22, z: 30, floor: 3 });
    // Forward and right: toward the wall (+x) and along it (-z).
    for (let n = 0; n < 60; n++) walker.step(1 / 60, { x: 0.7, y: 0.7 });
    expect(walker.x).toBeLessThanOrEqual(25 - SETTINGS.radiusVoxels);
    expect(walker.x).toBeGreaterThan(23.5);
    expect(walker.z).toBeLessThan(30 - 5);
  });

  it("stops at the edge of the walkable ground", () => {
    const map = board(40, (_x, z) => z >= 10);
    const walker = new Walker(map, SETTINGS, { x: 20, z: 20, floor: 3 });
    for (let n = 0; n < 120; n++) walker.step(1 / 30, { x: 0, y: 1 });
    expect(walker.z).toBeGreaterThanOrEqual(10);
    expect(walker.z).toBeLessThan(10.5);
  });

  it("never steps through a thin wall, however fast it goes", () => {
    const map = board(40, () => true, (set) => {
      for (let x = 0; x < 40; x++) for (let layer = 3; layer < 14; layer++) set(x, 15, layer);
    });
    const fast = resolveWalkSettings({ ...SETTINGS, speed: 400 });
    const walker = new Walker(map, fast, { x: 20, z: 30, floor: 3 });
    // A frame of a tenth of a second at 400 voxels a second: 40 voxels in one step.
    walker.step(0.1, { x: 0, y: 1 });
    expect(walker.z).toBeGreaterThan(16);
  });

  it("never holds a solid voxel nor leaves the walkable ground, whatever the input", () => {
    // A small town: two streets crossing, houses in the corners, an arch over one street, a kerb on the other.
    const map = board(
      48,
      (x, z) => (x >= 20 && x < 28) || (z >= 20 && z < 28),
      (set) => {
        for (let z = 0; z < 48; z++) {
          for (let x = 0; x < 48; x++) {
            const street = (x >= 20 && x < 28) || (z >= 20 && z < 28);
            if (!street) for (let layer = 3; layer < 10; layer++) set(x, z, layer);
            if (x >= 20 && x < 28 && z === 8) set(x, z, 3 + 9);
            if (z >= 20 && z < 28 && x > 34) set(x, z, 3);
          }
        }
      },
    );
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
    const walker = new Walker(map, DEFAULT_WALK_SETTINGS, findStart(map, DEFAULT_WALK_SETTINGS, 24, 24)!);
    for (let n = 0; n < 3000; n++) {
      if (n % 20 === 0) walker.turn(random() * 2, random() * 0.5);
      walker.step(1 / 30 + Math.abs(random()) * 0.07, { x: random(), y: random() + 0.3 });
      expect(bodyHitsSolid(map, walker, DEFAULT_WALK_SETTINGS)).toBe(false);
      expect(map.groundAt(Math.floor(walker.x), Math.floor(walker.z))).not.toBe(WALK_GROUND.none);
    }
  });

  it("eases its eye after a step and bobs while it walks, not under reduced motion", () => {
    const map = board(40, () => true, (set) => {
      for (let z = 0; z < 40; z++) for (let x = 0; x < 20; x++) set(x, z, 3);
    });
    const walker = new Walker(map, { ...SETTINGS, bobVoxels: 0 }, { x: 25, z: 20, floor: 3 });
    walker.turn(-Math.PI / 2, 0);
    while (walker.feet === 3 && walker.x > 21) walker.step(1 / 30, { x: 0, y: 1 });
    expect(walker.feet).toBe(4);
    // Just after the step up, the eye is still on its way up.
    expect(walker.eye().y).toBeGreaterThan(3 + SETTINGS.eyeVoxels);
    expect(walker.eye().y).toBeLessThan(4 + SETTINGS.eyeVoxels);
    const still = new Walker(map, SETTINGS, { x: 25, z: 20, floor: 3 });
    const heights = new Set<number>();
    for (let n = 0; n < 30; n++) {
      still.step(1 / 30, { x: 0, y: 1 }, undefined, true);
      heights.add(still.eye().y);
    }
    expect([...heights]).toEqual([3 + SETTINGS.eyeVoxels]);
  });
});

describe("the walk's start", () => {
  it("drops on the road nearest the point given, standing on its surface", () => {
    // A field two layers over the road, west of it: the first column the walker fits on is a radius into the road.
    const map = board(40, (x) => x >= 30 && x < 36, (set) => {
      for (let z = 0; z < 40; z++) for (let x = 0; x < 30; x++) [3, 4].forEach((layer) => set(x, z, layer));
    });
    const start = findStart(map, SETTINGS, 5, 5.5)!;
    expect(start.x).toBe(31.5);
    expect(start.z).toBe(5.5);
    expect(start.floor).toBe(3);
  });

  it("finds none on a board with no walkable ground", () => {
    expect(findStart(board(10, () => false), SETTINGS, 5, 5)).toBeNull();
  });
});
