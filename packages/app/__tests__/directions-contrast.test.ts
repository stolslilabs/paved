import { describe, expect, it } from "vitest";
import { checks, contrastHex, mix } from "../src/directions/contrast";
import { DIRECTIONS, DIRECTION_IDS, STATES } from "../src/directions/palettes";

describe("Direction/A, B, C: the white-with-transparency states stay legible (#537)", () => {
  it("keeps the three states ordered: hover under active under pressed", () => {
    expect(STATES.hover).toBeLessThan(STATES.active);
    expect(STATES.active).toBeLessThan(STATES.pressed);
  });

  it("computes the WCAG ratio and the overlay", () => {
    expect(contrastHex("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(mix("#000000", "#FFFFFF", 0.2)).toBe("#333333");
  });

  for (const id of DIRECTION_IDS) {
    it(`${id}: every text pair reaches its ratio at rest, hover, active and pressed`, () => {
      const failing = checks(DIRECTIONS[id].palette).filter((c) => c.ratio < c.min);
      expect(failing.map((c) => `${c.label} (${c.state}): ${c.ratio.toFixed(2)}`)).toEqual([]);
    });
  }
});
