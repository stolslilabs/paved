import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { voxelize, type VoxelGrid } from "../src/core/voxelizer";
import { PALETTE_CLASSES, labelTileColumns } from "../src/core/features";
import { planLayout } from "../src/core/feature-layout";
import { WALK_GROUND, buildWalkMap, type WalkMap, type WalkTile } from "../src/core/walk-map";
import { Walker, findStart, footprint } from "../src/core/walker";
import { WalkSession, boardWalkMap } from "../src/core/walk";
import { DEFAULT_WALK_SETTINGS, resolveWalkSettings, type WalkSettings } from "../src/core/walk-settings";
import { SOURCES, loadMesh, sourceOf } from "./helpers/model-meshes";

/** Reading and voxelizing the models: well under a second here, but CI runs every package's tests at once. */
const HEAVY_TEST_MS = 60_000;

/** A model's frame to the board's at cell (`cx`, `cz`), turned `turn` radians about the vertical: as the board places a tile. */
function placed(cx: number, cz: number, turn = 0, scale = 0.75): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(cx * 3, 0, cz * 3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(scale, scale, scale));
}

/** Whether the walker's body holds a solid voxel. */
function bodyHitsSolid(map: WalkMap, walker: Walker, settings: WalkSettings): boolean {
  const top = walker.feet + settings.eyeVoxels + settings.headroomVoxels;
  for (const [i, j] of footprint(walker.x, walker.z, settings.radiusVoxels)) {
    for (let layer = Math.floor(walker.feet); layer < Math.ceil(top); layer++) if (map.solidAt(i, j, layer)) return true;
  }
  return false;
}

describe("the walk's ground (V4-WALK-1)", () => {
  /** A 4 x 4 x 2 model of one solid voxel in its corner, its west column a road. */
  const grid = { sizeX: 4, sizeY: 4, layers: 2, step: 1, origin: [-2, 0, -2], count: 1, cells: Uint8Array.from([0, 0, 0]) } as unknown as VoxelGrid;
  const feature = new Uint8Array(16);
  for (let row = 0; row < 4; row++) feature[row * 4] = WALK_GROUND.road;
  const labels = { size: 4, feature, minX: -2, minZ: -2, cell: 1 };

  it("puts each tile's voxels and ground on the board, turned to its orientation and joined at its edges", () => {
    const tiles: WalkTile[] = [
      { grid, labels, toBoard: placed(0, 0, 0, 0.5).elements },
      // Turned a quarter: its west column becomes its south row.
      { grid, labels, toBoard: new THREE.Matrix4().compose(new THREE.Vector3(2, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(0.5, 0.5, 0.5)).elements },
    ];
    const map = buildWalkMap(tiles)!;
    expect(map.voxel).toBe(0.5);
    expect(map.minX).toBeCloseTo(-1, 10);
    expect(map.minZ).toBeCloseTo(-1, 10);
    expect([map.sizeX, map.sizeZ, map.layers]).toEqual([8, 4, 2]);
    expect(map.solidAt(0, 0, 0)).toBe(true);
    expect(map.solidAt(4, 3, 0)).toBe(true);
    expect(map.solid.reduce((a, b) => a + b, 0)).toBe(2);
    for (let z = 0; z < 4; z++) expect(map.groundAt(0, z)).toBe(WALK_GROUND.road);
    for (let x = 4; x < 8; x++) expect(map.groundAt(x, 3)).toBe(WALK_GROUND.road);
    expect(map.walkable).toBe(8);
  });

  it("is a wall past the board's sides and under it, open over it", () => {
    const map = buildWalkMap([{ grid, labels, toBoard: placed(0, 0, 0, 0.5).elements }])!;
    expect(map.solidAt(-1, 0, 1)).toBe(true);
    expect(map.solidAt(0, 4, 1)).toBe(true);
    expect(map.solidAt(1, 1, -1)).toBe(true);
    expect(map.solidAt(1, 1, 9)).toBe(false);
    expect(map.groundAt(-1, 0)).toBe(WALK_GROUND.none);
  });

  it("is null with no tile", () => {
    expect(buildWalkMap([])).toBeNull();
  });
});

describe("a walk on the real models", () => {
  const meshes = new Map<string, THREE.Mesh>();
  const tileOf = (plan: string, cx: number, cz: number, turn = 0): WalkTile => {
    const mesh = meshes.get(plan)!;
    const { columns, grid } = labelTileColumns(mesh.geometry, planLayout(plan), mesh.matrixWorld, PALETTE_CLASSES.base);
    return {
      grid: voxelize(sourceOf(mesh))!,
      labels: { size: columns.size, feature: columns.feature, minX: grid.minX, minZ: grid.minZ, cell: grid.cell },
      toBoard: placed(cx, cz, turn).elements,
    };
  };
  beforeAll(async () => {
    for (const plan of ["rfffrfffr", "rfrfcccfr", "sfrfrfrfr", "ccccccccc", "rfrfffffr", "cccccfrfc"]) meshes.set(plan, await loadMesh(`${SOURCES}/${plan}.glb`));
  }, HEAVY_TEST_MS);

  it(
    "follows a straight road across three tiles, its ground joined at their edges",
    () => {
      const map = buildWalkMap([0, 1, 2].map((c) => tileOf("rfffrfffr", c, 0)))!;
      expect(map.voxel).toBeCloseTo(0.075, 10);
      // The road's surface is the fourth layer's bottom: the slab's top is at 4, the sunk road at 3.
      const start = findStart(map, DEFAULT_WALK_SETTINGS, 20, 20)!;
      expect(start.floor).toBe(3);
      // Facing east (+x): a yaw of minus a quarter turn.
      const walker = new Walker(map, DEFAULT_WALK_SETTINGS, start, -Math.PI / 2);
      for (let n = 0; n < 600; n++) walker.step(1 / 30, { x: 0, y: 1 });
      // From the first tile's middle to the third's: past x = 4.5 world units (the third tile's west edge).
      expect(map.minX + walker.x * map.voxel).toBeGreaterThan(4.5);
      expect(walker.feet).toBe(3);
    },
    HEAVY_TEST_MS,
  );

  it(
    "never goes through a wall, a roof or the ground of a village, whatever the input",
    () => {
      const plans = ["rfrfcccfr", "sfrfrfrfr", "ccccccccc", "rfrfffffr", "rfffrfffr", "cccccfrfc", "sfrfrfrfr", "rfrfcccfr", "rfffrfffr"];
      const map = buildWalkMap(plans.map((plan, n) => tileOf(plan, (n % 3) - 1, Math.floor(n / 3) - 1, (n * Math.PI) / 2)))!;
      let seed = 11;
      const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
      for (const [x, z] of [[60, 60], [20, 100], [100, 20]] as const) {
        const walker = new Walker(map, DEFAULT_WALK_SETTINGS, findStart(map, DEFAULT_WALK_SETTINGS, x, z)!, random() * Math.PI);
        let travelled = 0;
        for (let n = 0; n < 2000; n++) {
          if (n % 25 === 0) walker.turn(random() * 2.5, 0);
          travelled += walker.step(1 / 30 + Math.abs(random()) * 0.07, { x: random() * 0.6, y: random() + 0.4 });
          expect(bodyHitsSolid(map, walker, DEFAULT_WALK_SETTINGS)).toBe(false);
          expect(map.groundAt(Math.floor(walker.x), Math.floor(walker.z))).not.toBe(WALK_GROUND.none);
        }
        expect(travelled).toBeGreaterThan(40);
      }
    },
    HEAVY_TEST_MS,
  );

  /** The board as the renderer draws it: each tile's model root (scaled, turned, moved to its cell) in the tiles' group. */
  function boardOf(plans: string[]): { board: THREE.Group; sources: { key: string; tile: THREE.Object3D }[] } {
    const board = new THREE.Group();
    const sources = plans.map((key, n) => {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(meshes.get(key)!.geometry);
      mesh.applyMatrix4(meshes.get(key)!.matrixWorld);
      root.add(mesh);
      root.scale.setScalar(0.75);
      root.position.set(n * 3, 0, 0);
      board.add(root);
      return { key, tile: root };
    });
    return { board, sources };
  }

  function camera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(50, 9 / 19.5, 5, 2000);
    camera.position.set(3, 40, 20);
    camera.lookAt(3, 0, 0);
    camera.updateMatrixWorld();
    return camera;
  }

  it(
    "eases down to the walker's eye, walks on demand, and eases back to the view it came from",
    () => {
      const { board, sources } = boardOf(["rfffrfffr", "rfffrfffr", "rfffrfffr"]);
      const map = boardWalkMap(board, sources)!;
      const cam = camera();
      const from = cam.position.clone();
      const settings = DEFAULT_WALK_SETTINGS;
      const session = WalkSession.start({ camera: cam, board, map, settings, near: { x: 3, z: 0 }, reducedMotion: false, now: 0 })!;
      expect(session.state().phase).toBe("entering");
      // The near plane is the walk's from the start of the descent.
      expect(cam.near).toBe(settings.near);
      expect(session.update(settings.easeMs / 2)).toBe(true);
      expect(cam.position.y).toBeLessThan(from.y);
      expect(cam.position.y).toBeGreaterThan(1);
      session.update(settings.easeMs);
      expect(session.state().phase).toBe("walking");
      expect(cam.fov).toBe(settings.fov);
      // At eye level: the road's floor and the eye over it.
      expect(cam.position.y).toBeCloseTo(session.state().floor + settings.eyeVoxels * map.voxel, 5);
      expect(session.state().ground).toBe("road");
      // Standing still with the view settled draws nothing.
      session.update(settings.easeMs + 500);
      expect(session.update(settings.easeMs + 516)).toBe(false);
      // Walking draws.
      session.setMove({ x: 0, y: 1 });
      const before = cam.position.clone();
      expect(session.update(settings.easeMs + 616)).toBe(true);
      expect(cam.position.distanceTo(before)).toBeGreaterThan(0);
      session.setMove({ x: 0, y: 0 });
      let done = false;
      void session.leave(settings.easeMs + 700).then(() => {
        done = true;
      });
      session.update(settings.easeMs + 700 + settings.easeMs / 2);
      expect(session.done).toBe(false);
      session.update(settings.easeMs * 3);
      expect(session.done).toBe(true);
      expect(cam.position.distanceTo(from)).toBeLessThan(1e-9);
      expect([cam.fov, cam.near]).toEqual([50, 5]);
      return Promise.resolve().then(() => expect(done).toBe(true));
    },
    HEAVY_TEST_MS,
  );

  it(
    "cuts in place of the eases under reduced motion, and never bobs",
    () => {
      const { board, sources } = boardOf(["rfffrfffr", "rfffrfffr"]);
      const map = boardWalkMap(board, sources)!;
      const cam = camera();
      const settings = resolveWalkSettings({ lookSmoothingMs: 0 });
      const session = WalkSession.start({ camera: cam, board, map, settings, near: { x: 1.5, z: 0 }, reducedMotion: true, now: 0 })!;
      session.update(16);
      expect(session.state().phase).toBe("walking");
      expect(cam.position.y).toBeCloseTo(session.state().floor + settings.eyeVoxels * map.voxel, 5);
      session.setMove({ x: 0, y: 1 });
      for (let t = 32; t < 1000; t += 16) {
        session.update(t);
        // On whatever floor it stands, the eye is right over it: no bob, no ease after a step.
        expect(cam.position.y).toBeCloseTo(session.state().floor + settings.eyeVoxels * map.voxel, 5);
      }
      void session.leave(1000);
      session.update(1016);
      expect(session.done).toBe(true);
    },
    HEAVY_TEST_MS,
  );

  it(
    "starts facing the way the orbit camera looked, and turns with the mouse",
    () => {
      const { board, sources } = boardOf(["rfffrfffr", "rfffrfffr"]);
      const map = boardWalkMap(board, sources)!;
      const cam = camera();
      const session = WalkSession.start({ camera: cam, board, map, settings: resolveWalkSettings({ lookSmoothingMs: 0 }), near: { x: 1.5, z: 0 }, reducedMotion: true, now: 0 })!;
      // The orbit camera looks to -z: a yaw of 0.
      expect(session.state().yaw).toBeCloseTo(0, 5);
      session.update(16);
      session.look(100, 0);
      session.update(32);
      // A mouse moved right turns the view right (the yaw goes down).
      expect(session.state().yaw).toBeCloseTo(-100 * DEFAULT_WALK_SETTINGS.mouseRadiansPerPx, 5);
      session.look(0, 40);
      session.update(48);
      expect(session.state().pitch).toBeCloseTo(-40 * DEFAULT_WALK_SETTINGS.mouseRadiansPerPx, 5);
    },
    HEAVY_TEST_MS,
  );
});
