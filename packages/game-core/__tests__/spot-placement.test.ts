import { describe, it, expect } from "vitest";
import { SpotType } from "../src/types/spot";
import { CategoryType } from "../src/types/category";
import { OrientationType } from "../src/types/orientation";
import { getSpotOffset, categoryToChar, getValidSpotsForRole } from "../src/utils";

describe("getSpotOffset", () => {
  it("returns {dx:0, dz:0} for Center", () => {
    expect(getSpotOffset(SpotType.Center)).toEqual({ dx: 0, dz: 0 });
  });

  it("returns {dx:-1/3, dz:-1/3} for NorthWest", () => {
    const result = getSpotOffset(SpotType.NorthWest);
    expect(result.dx).toBeCloseTo(-1 / 3);
    expect(result.dz).toBeCloseTo(-1 / 3);
  });

  it("returns {dx:0, dz:-1/3} for North", () => {
    const result = getSpotOffset(SpotType.North);
    expect(result.dx).toBeCloseTo(0);
    expect(result.dz).toBeCloseTo(-1 / 3);
  });

  it("returns {dx:1/3, dz:-1/3} for NorthEast", () => {
    const result = getSpotOffset(SpotType.NorthEast);
    expect(result.dx).toBeCloseTo(1 / 3);
    expect(result.dz).toBeCloseTo(-1 / 3);
  });

  it("returns {dx:1/3, dz:0} for East", () => {
    const result = getSpotOffset(SpotType.East);
    expect(result.dx).toBeCloseTo(1 / 3);
    expect(result.dz).toBeCloseTo(0);
  });

  it("returns {dx:1/3, dz:1/3} for SouthEast", () => {
    const result = getSpotOffset(SpotType.SouthEast);
    expect(result.dx).toBeCloseTo(1 / 3);
    expect(result.dz).toBeCloseTo(1 / 3);
  });

  it("returns {dx:0, dz:1/3} for South", () => {
    const result = getSpotOffset(SpotType.South);
    expect(result.dx).toBeCloseTo(0);
    expect(result.dz).toBeCloseTo(1 / 3);
  });

  it("returns {dx:-1/3, dz:1/3} for SouthWest", () => {
    const result = getSpotOffset(SpotType.SouthWest);
    expect(result.dx).toBeCloseTo(-1 / 3);
    expect(result.dz).toBeCloseTo(1 / 3);
  });

  it("returns {dx:-1/3, dz:0} for West", () => {
    const result = getSpotOffset(SpotType.West);
    expect(result.dx).toBeCloseTo(-1 / 3);
    expect(result.dz).toBeCloseTo(0);
  });

  it("returns {dx:0, dz:0} for None", () => {
    expect(getSpotOffset(SpotType.None)).toEqual({ dx: 0, dz: 0 });
  });
});

describe("categoryToChar", () => {
  it("maps City to C", () => {
    expect(categoryToChar(CategoryType.City)).toBe("C");
  });

  it("maps Road to R", () => {
    expect(categoryToChar(CategoryType.Road)).toBe("R");
  });

  it("maps Forest to F", () => {
    expect(categoryToChar(CategoryType.Forest)).toBe("F");
  });

  it("maps Wonder to W", () => {
    expect(categoryToChar(CategoryType.Wonder)).toBe("W");
  });

  it("maps Stop to S", () => {
    expect(categoryToChar(CategoryType.Stop)).toBe("S");
  });

  it("maps None to empty string", () => {
    expect(categoryToChar(CategoryType.None)).toBe("");
  });
});

describe("getValidSpotsForRole", () => {
  // Plan index 11 = RFRFCCCFR at North orientation:
  //   Center(1)=R, NW(2)=F, N(3)=R, NE(4)=F, E(5)=C, SE(6)=C, S(7)=C, SW(8)=F, W(9)=R
  const RFRFCCCFR_PLAN = 11;
  const NORTH = 1; // OrientationType.North index

  it("Lord (0) on RFRFCCCFR gets R+C spots (allowed C,R,W)", () => {
    const spots = getValidSpotsForRole(0, RFRFCCCFR_PLAN, NORTH);
    // R spots: Center(1), North(3), West(9)
    // C spots: East(5), SE(6), South(7)
    expect(spots.sort()).toEqual([1, 3, 5, 6, 7, 9]);
  });

  it("Woodsman (5) on RFRFCCCFR gets R+F spots (allowed R,F)", () => {
    const spots = getValidSpotsForRole(5, RFRFCCCFR_PLAN, NORTH);
    // R spots: Center(1), North(3), West(9)
    // F spots: NW(2), NE(4), SW(8)
    expect(spots.sort()).toEqual([1, 2, 3, 4, 8, 9]);
  });

  it("Paladin (3) on RFRFCCCFR gets only C spots (allowed C,W)", () => {
    const spots = getValidSpotsForRole(3, RFRFCCCFR_PLAN, NORTH);
    // C spots: East(5), SE(6), South(7)
    expect(spots.sort()).toEqual([5, 6, 7]);
  });

  it("Adventurer (2) on RFRFCCCFR gets only R spots (allowed R,W)", () => {
    const spots = getValidSpotsForRole(2, RFRFCCCFR_PLAN, NORTH);
    // R spots: Center(1), North(3), West(9)
    expect(spots.sort()).toEqual([1, 3, 9]);
  });

  it("returns empty array for invalid roleIndex", () => {
    expect(getValidSpotsForRole(99, RFRFCCCFR_PLAN, NORTH)).toEqual([]);
  });

  it("returns empty for roleIndex -1 (no selection)", () => {
    expect(getValidSpotsForRole(-1, RFRFCCCFR_PLAN, NORTH)).toEqual([]);
  });

  // Plan index 1 = CCCCCCCCC (all cities)
  it("Adventurer (2) on all-city tile returns [] (allowed R,W only)", () => {
    expect(getValidSpotsForRole(2, 1, NORTH)).toEqual([]);
  });

  // Plan index 18 = WFFFFFFFF at North: Center=W, rest=F
  it("Pilgrim (4) on WFFFFFFFF gets C+R+W spots => only Center=W", () => {
    const spots = getValidSpotsForRole(4, 18, NORTH);
    // Pilgrim allowed: C, R, W. Only Center is W.
    expect(spots).toEqual([1]);
  });
});
