import { describe, expect, it } from "vitest";
import { DEFAULT_WALK_SETTINGS, TILE_VOXELS, TILE_SIZE, clampVector, isWalkKey, moveOfKeys, nearPlaneReach, resolveWalkSettings, stickLookRate } from "../src";

describe("walk keys (V4-WALK-1)", () => {
  it("reads the keys by their place: ZQSD on AZERTY are the codes of WASD", () => {
    // An AZERTY keyboard's Z, Q, S and D send KeyW, KeyA, KeyS and KeyD.
    expect(moveOfKeys(["KeyW"])).toEqual({ x: 0, y: 1 });
    expect(moveOfKeys(["KeyS"])).toEqual({ x: 0, y: -1 });
    expect(moveOfKeys(["KeyA"])).toEqual({ x: -1, y: 0 });
    expect(moveOfKeys(["KeyD"])).toEqual({ x: 1, y: 0 });
    expect(moveOfKeys(["KeyZ", "KeyQ"])).toEqual({ x: 0, y: 0 });
    expect(isWalkKey("KeyZ")).toBe(false);
  });

  it("takes the arrows too", () => {
    expect(moveOfKeys(["ArrowUp"])).toEqual({ x: 0, y: 1 });
    expect(moveOfKeys(["ArrowLeft"])).toEqual({ x: -1, y: 0 });
    expect(isWalkKey("ArrowRight")).toBe(true);
  });

  it("is no faster on a diagonal, and two opposite keys cancel", () => {
    const diagonal = moveOfKeys(["KeyW", "KeyD"]);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 10);
    expect(moveOfKeys(["KeyW", "KeyS"])).toEqual({ x: 0, y: 0 });
    // A key and its arrow held together count once.
    expect(moveOfKeys(["KeyW", "ArrowUp"])).toEqual({ x: 0, y: 1 });
  });

  it("clamps a vector to length 1", () => {
    expect(clampVector({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(clampVector({ x: 0.2, y: 0 })).toEqual({ x: 0.2, y: 0 });
  });
});

describe("the look stick", () => {
  it("turns faster the more it tilts (the tilt's square), at most the set rate", () => {
    const settings = { stickRadiansPerSecond: 2 };
    expect(stickLookRate({ x: 0.5, y: 0 }, settings).x).toBeCloseTo(0.5);
    expect(stickLookRate({ x: 1, y: 0 }, settings).x).toBeCloseTo(2);
    expect(stickLookRate({ x: 0, y: -1 }, settings).y).toBeCloseTo(-2);
    expect(Math.hypot(...Object.values(stickLookRate({ x: 5, y: 5 }, settings)))).toBeCloseTo(2);
  });
});

describe("walk settings", () => {
  it("fill what the input leaves out", () => {
    expect(resolveWalkSettings({ eyeVoxels: 7 })).toEqual({ ...DEFAULT_WALK_SETTINGS, eyeVoxels: 7 });
    expect(DEFAULT_WALK_SETTINGS.fov).toBe(70);
  });

  it("keep every solid voxel beyond the near plane: the plane's farthest point is inside the walker's radius and headroom", () => {
    const voxel = TILE_SIZE / TILE_VOXELS;
    const { near, fov, radiusVoxels, headroomVoxels, bobVoxels } = DEFAULT_WALK_SETTINGS;
    // From a tall phone (9:19.5) to an ultrawide screen (21:9), with a step down's lag (a voxel) and the bob over the eye.
    for (const aspect of [9 / 19.5, 1, 16 / 9, 21 / 9]) {
      const reach = nearPlaneReach(near, fov, aspect);
      expect(reach).toBeLessThan(radiusVoxels * voxel);
      expect(reach + (1 + bobVoxels) * voxel).toBeLessThan(headroomVoxels * voxel);
    }
  });
});
