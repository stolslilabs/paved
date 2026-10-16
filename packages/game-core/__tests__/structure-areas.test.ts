import { describe, expect, it } from "vitest";
import { StructureBoard } from "../src";
import { Orientation, OrientationType } from "../src/types/orientation";
import { Plan, PlanType } from "../src/types/plan";
import { SpotType } from "../src/types/spot";

const code = (plan: PlanType) => new Plan(plan).into();
const north = new Orientation(OrientationType.North).into();
/** The area code (1 to 9) of a plan's spot, in the plan's north frame. */
const areaOf = (plan: PlanType, spot: SpotType) => " ABCDEFGHI".indexOf(new Plan(plan).area(spot));

describe("the structures with their nodes (Board.structures, structureOf)", () => {
  // ffcfffcff: a city on the north edge and one on the south; ffffffcff north of it closes the first with its south city.
  const board = new StructureBoard();
  const below = board.place({ id: 1, plan: code(PlanType.FFCFFFCFF), orientation: north, x: 0, y: 0, owner: 0n });
  const above = board.place({ id: 2, plan: code(PlanType.FFFFFFCFF), orientation: north, x: 0, y: 1, owner: 0n });
  const belowNorth = areaOf(PlanType.FFCFFFCFF, SpotType.North);
  const belowSouth = areaOf(PlanType.FFCFFFCFF, SpotType.South);
  const aboveSouth = areaOf(PlanType.FFFFFFCFF, SpotType.South);

  it("gives a city across two tiles its area on each, and nothing of the other city", () => {
    const city = board.structureOf(above, aboveSouth)!;
    expect(city.category).toBe(3);
    expect(city.size).toBe(2);
    expect(city.open).toBe(0);
    expect([...city.areas]).toEqual([
      [1, 1 << (belowNorth - 1)],
      [2, 1 << (aboveSouth - 1)],
    ]);
    // The same structure from either tile.
    expect(board.structureOf(below, belowNorth)!.root).toBe(city.root);
    // The south city of the first tile is its own, still open.
    const other = board.structureOf(below, belowSouth)!;
    expect(other.root).not.toBe(city.root);
    expect([...other.areas]).toEqual([[1, 1 << (belowSouth - 1)]]);
    expect(other.open).toBeGreaterThan(0);
  });

  it("lists every structure once, each node in exactly one", () => {
    const structures = board.structures();
    expect(new Set(structures.map((s) => s.root)).size).toBe(structures.length);
    const nodes = structures.flatMap((s) => [...s.areas].flatMap(([tile, mask]) => [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((b) => mask & (1 << b)).map((b) => `${tile}:${b + 1}`)));
    expect(new Set(nodes).size).toBe(nodes.length);
    expect(structures.filter((s) => s.category === 3)).toHaveLength(2);
    expect(board.structureOf(below, 0)).toBeNull();
  });
});
