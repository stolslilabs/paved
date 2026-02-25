import { describe, it, expect } from "vitest";
import { findNextTile, shouldPollUpdateBuilder } from "../src/utils/game-helpers";

describe("findNextTile", () => {
  it("returns the next unplaced tile after the current tile", () => {
    const rows = [
      { id: "1", plan: "9", orientation: "1", x: "100", y: "200" }, // placed
      { id: "2", plan: "5", orientation: "0", x: "0", y: "0" },     // unplaced (next)
      { id: "3", plan: "7", orientation: "0", x: "0", y: "0" },     // unplaced
    ];
    const result = findNextTile(rows, 1);
    expect(result).toEqual({ tile_id: 2, tile_plan: 5 });
  });

  it("returns null when no next tile exists", () => {
    const rows = [
      { id: "1", plan: "9", orientation: "1", x: "100", y: "200" }, // placed
    ];
    const result = findNextTile(rows, 1);
    expect(result).toBeNull();
  });

  it("returns null for empty rows", () => {
    const result = findNextTile([], 1);
    expect(result).toBeNull();
  });

  it("skips placed tiles (orientation !== 0) when looking for next", () => {
    const rows = [
      { id: "1", plan: "9", orientation: "1", x: "100", y: "200" }, // placed
      { id: "2", plan: "5", orientation: "2", x: "101", y: "200" }, // also placed
      { id: "3", plan: "7", orientation: "0", x: "0", y: "0" },     // unplaced (next)
    ];
    const result = findNextTile(rows, 1);
    expect(result).toEqual({ tile_id: 3, tile_plan: 7 });
  });

  it("only looks at tiles with id > currentTileId", () => {
    const rows = [
      { id: "5", plan: "3", orientation: "0", x: "0", y: "0" },     // unplaced but id < current
      { id: "10", plan: "9", orientation: "1", x: "100", y: "200" }, // current (placed)
      { id: "11", plan: "7", orientation: "0", x: "0", y: "0" },    // next
    ];
    const result = findNextTile(rows, 10);
    expect(result).toEqual({ tile_id: 11, tile_plan: 7 });
  });

  it("returns the lowest id > currentTileId among unplaced tiles", () => {
    const rows = [
      { id: "1", plan: "9", orientation: "1", x: "100", y: "200" }, // placed
      { id: "5", plan: "12", orientation: "0", x: "0", y: "0" },    // unplaced
      { id: "3", plan: "7", orientation: "0", x: "0", y: "0" },     // unplaced, lower id
    ];
    // After current tile 1, the next unplaced by id should be 3 (lowest > 1)
    const result = findNextTile(rows, 1);
    expect(result).toEqual({ tile_id: 3, tile_plan: 7 });
  });
});

describe("shouldPollUpdateBuilder", () => {
  it("returns true when no tx is in-flight (null)", () => {
    expect(shouldPollUpdateBuilder(null, 5)).toBe(true);
  });

  it("returns false when poll reports same tile as in-flight tx", () => {
    // Tx is building tile 3 → poll still shows tile 3 as current → don't overwrite
    expect(shouldPollUpdateBuilder(3, 3)).toBe(false);
  });

  it("returns true when poll reports a different (newer) tile than in-flight", () => {
    // Tx built tile 3, poll now shows tile 4 → contract processed → safe to update
    expect(shouldPollUpdateBuilder(3, 4)).toBe(true);
  });

  it("returns true when poll reports a different (any) tile than in-flight", () => {
    // Edge case: poll tile id doesn't match in-flight at all
    expect(shouldPollUpdateBuilder(5, 10)).toBe(true);
  });
});
