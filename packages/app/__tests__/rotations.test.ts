/**
 * Rotate only where a turn changes the tile (TILE-ACTIONS, the owner's ask of 2026-11-07): the legal rotations at a cell, one per
 * distinct layout. A symmetric plan fits a cell in orientations that are the same tile in the game.
 */
import { describe, expect, it } from "vitest";
import { PlanType } from "@paved/game-core";
import { nextValid } from "../src/data/placement";
import { distinctRotations } from "../src/lib/rotations";

/** A plan's index (the chain's and the session's `plan`) by its code. */
const plan = (code: string) => Object.values(PlanType).indexOf(code as PlanType);

describe("the rotations that change the tile", () => {
  it("keeps every legal rotation of a plan with four distinct layouts", () => {
    expect(distinctRotations(plan("CCCCCFFFC"), [1, 2, 3, 4], 1)).toEqual([1, 2, 3, 4]);
    expect(distinctRotations(plan("RFRFCCCFR"), [2, 4], 2)).toEqual([2, 4]);
  });

  it("one for a plan the same in every orientation (the full city, the crossroads, the wonder): no Rotate", () => {
    for (const code of ["CCCCCCCCC", "SFRFRFRFR", "WFFFFFFFF"]) {
      expect(distinctRotations(plan(code), [1, 2, 3, 4], 3), code).toEqual([3]);
    }
  });

  it("two for the straight road and the two-sided cities, the current orientation standing for its own: a turn always changes the tile", () => {
    const road = plan("RFFFRFFFR");
    expect(distinctRotations(road, [1, 2, 3, 4], 3)).toEqual([3, 4]);
    expect(distinctRotations(road, [1, 2, 3, 4], 4)).toEqual([1, 4]);
    // Turning from 3 gives 4, then from 4 gives 1: road along one axis, then the other, never the same twice.
    expect(nextValid(3, distinctRotations(road, [1, 2, 3, 4], 3))).toBe(4);
    expect(nextValid(4, distinctRotations(road, [1, 2, 3, 4], 4))).toBe(1);
    // Where only its two turns along one axis fit: one tile, no Rotate.
    expect(distinctRotations(road, [1, 3], 1)).toEqual([1]);
    expect(distinctRotations(plan("CFFFCFFFC"), [2, 4], 2)).toEqual([2]);
    expect(distinctRotations(plan("FFCFFFCFF"), [1, 2, 3, 4], 1)).toEqual([1, 2]);
  });

  it("leaves one legal rotation, none, and an unknown plan as they are", () => {
    expect(distinctRotations(plan("RFRFFFFFR"), [2], 2)).toEqual([2]);
    expect(distinctRotations(plan("RFRFFFFFR"), [], 1)).toEqual([]);
    expect(distinctRotations(null, [1, 3], 1)).toEqual([1, 3]);
    expect(distinctRotations(999, [1, 3], 1)).toEqual([1, 3]);
  });
});
