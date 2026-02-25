import { describe, it, expect } from "vitest";
import { computeHoverState } from "../src/core/interaction";

describe("computeHoverState", () => {
  it("returns null when gridPos is null", () => {
    expect(computeHoverState(null, 9, 1)).toBeNull();
  });

  it("returns null when tilePlan is 0 (no tile in hand)", () => {
    expect(computeHoverState({ x: 1, y: 0 }, 0, 1)).toBeNull();
  });

  it("returns correct HoverState for valid inputs", () => {
    const result = computeHoverState({ x: 2, y: -1 }, 9, 3);
    expect(result).toEqual({
      x: 2,
      y: -1,
      valid: true,
      idle: true,
      planIndex: 9,
      orientation: 3,
    });
  });

  it("preserves orientation value as-is", () => {
    const result = computeHoverState({ x: 0, y: 0 }, 7, 4);
    expect(result).not.toBeNull();
    expect(result!.orientation).toBe(4);
  });

  it("works with various plan indices", () => {
    for (const plan of [1, 5, 12, 19]) {
      const result = computeHoverState({ x: 0, y: 0 }, plan, 1);
      expect(result).not.toBeNull();
      expect(result!.planIndex).toBe(plan);
    }
  });
});
