import { describe, expect, it } from "vitest";
import { TILE_NAME_MAX, tileName } from "../src/components/elements/tile-render";

// CHESTS-PAGE (the owner's asks of 2026-11-06): the tiles' names, one a plan, short enough to stand on one line of a chest's card.

const PLANS = Array.from({ length: 19 }, (_, i) => i + 1);

describe("the tiles' names", () => {
  it("names each of the 19 plans, each name its own", () => {
    const names = PLANS.map(tileName);
    expect(names.every((n) => !/^Tile \d+$/.test(n))).toBe(true);
    expect(new Set(names).size).toBe(PLANS.length);
  });

  it(`keeps every name to ${TILE_NAME_MAX} characters at most`, () => {
    expect(PLANS.map(tileName).filter((n) => n.length > TILE_NAME_MAX)).toEqual([]);
  });

  it("falls back on the plan's number for a plan it does not know", () => {
    expect(tileName(0)).toBe("Tile 0");
  });
});
