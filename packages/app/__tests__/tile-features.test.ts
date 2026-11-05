import { describe, expect, it } from "vitest";
import { tileFeatures } from "../src/components/elements/tile-features";

// COLLECTION-PAGE's Description: what a tile holds, read from its plan (chain plan ids, `PlanType`'s order).
describe("tileFeatures", () => {
  it("counts each tile's cities, roads, forests and wonder, and says how far they reach", () => {
    expect(tileFeatures(1)).toEqual({ cities: 1, roads: 0, forests: 0, wonders: 0, deck: 1, sentence: "A city open on every side." });
    expect(tileFeatures(3)).toMatchObject({ cities: 1, roads: 1, forests: 2, sentence: "A city open on three sides, a road ending at the city and two forests." });
    expect(tileFeatures(5).sentence).toBe("Two cities open on one side each and a forest.");
    expect(tileFeatures(11).sentence).toBe("A city open on two sides, a road linking two sides and two forests.");
    expect(tileFeatures(17)).toMatchObject({ roads: 4, forests: 4, sentence: "A crossroads at its centre, four roads ending there and four forests." });
    expect(tileFeatures(19)).toMatchObject({ wonders: 1, roads: 1, sentence: "A wonder at its centre, a road leading to it and a forest." });
  });

  it("gives each plan its copies in the base deck, 72 in all", () => {
    const copies = Array.from({ length: 19 }, (_, i) => tileFeatures(i + 1).deck);
    expect(copies.reduce((a, b) => a + b, 0)).toBe(72);
    expect(tileFeatures(13).deck).toBe(9);
  });

  it("describes every plan, and holds nothing for no plan", () => {
    for (let plan = 1; plan <= 19; plan++) expect(tileFeatures(plan).sentence).toMatch(/^[A-Z].+\.$/);
    expect(tileFeatures(0)).toEqual({ cities: 0, roads: 0, forests: 0, wonders: 0, deck: 0, sentence: "" });
  });
});
