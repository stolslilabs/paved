import { describe, it, expect } from "vitest";
import { shouldShowSpotSelector } from "../src/utils/game-helpers";

describe("shouldShowSpotSelector", () => {
  it("returns false when character is 0", () => {
    expect(shouldShowSpotSelector(0, { col: 0, row: 0 }, true)).toBe(false);
  });

  it("returns false when selectedTile is null", () => {
    expect(shouldShowSpotSelector(1, null, true)).toBe(false);
  });

  it("returns false when hoverValid is false", () => {
    expect(shouldShowSpotSelector(1, { col: 0, row: 0 }, false)).toBe(false);
  });

  it("returns true when all conditions met", () => {
    expect(shouldShowSpotSelector(1, { col: 0, row: 0 }, true)).toBe(true);
  });
});
