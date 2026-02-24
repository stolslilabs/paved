import { describe, it, expect } from "vitest";
import { computeCharWorldPos } from "../src/core/spot-position";

describe("computeCharWorldPos", () => {
  it("spot=1 (Center) at tile (0,0) returns center position", () => {
    expect(computeCharWorldPos(0, 0, 1)).toEqual({ worldX: 0, worldZ: 0 });
  });

  it("spot=3 (North) at tile (2,-3) offsets dz by -1/3", () => {
    const result = computeCharWorldPos(2, -3, 3);
    expect(result.worldX).toBeCloseTo(2);
    expect(result.worldZ).toBeCloseTo(-3 - 1 / 3);
  });

  it("spot=5 (East) at tile (0,0) offsets dx by 1/3", () => {
    const result = computeCharWorldPos(0, 0, 5);
    expect(result.worldX).toBeCloseTo(1 / 3);
    expect(result.worldZ).toBeCloseTo(0);
  });

  it("spot=2 (NorthWest) at tile (1,1) offsets both by -1/3", () => {
    const result = computeCharWorldPos(1, 1, 2);
    expect(result.worldX).toBeCloseTo(1 - 1 / 3);
    expect(result.worldZ).toBeCloseTo(1 - 1 / 3);
  });

  it("spot=0 (None) returns tile center position", () => {
    expect(computeCharWorldPos(5, -2, 0)).toEqual({ worldX: 5, worldZ: -2 });
  });

  it("spot=7 (South) at tile (0,0) offsets dz by +1/3", () => {
    const result = computeCharWorldPos(0, 0, 7);
    expect(result.worldX).toBeCloseTo(0);
    expect(result.worldZ).toBeCloseTo(1 / 3);
  });
});
