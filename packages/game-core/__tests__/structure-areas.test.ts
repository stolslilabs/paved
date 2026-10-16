import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StructureBoard } from "../src";
import { CategoryType } from "../src/types/category";
import { Orientation, OrientationType } from "../src/types/orientation";
import { Plan, PlanType } from "../src/types/plan";
import { SpotType } from "../src/types/spot";

const code = (plan: PlanType) => new Plan(plan).into();
const north = new Orientation(OrientationType.North).into();
/** The area code (1 to 9) of a plan's spot, in the plan's north frame. */
const areaOf = (plan: PlanType, spot: SpotType) => " ABCDEFGHI".indexOf(new Plan(plan).area(spot));

describe("the structures with their nodes (StructureBoard)", () => {
  // ffcfffcff: a city on the north edge and one on the south; ffffffcff north of it closes the first with its south city.
  // Given out of order: the board places them in id order.
  const board = new StructureBoard([
    { id: 2, plan: code(PlanType.FFFFFFCFF), orientation: north, x: 0, y: 1 },
    { id: 1, plan: code(PlanType.FFCFFFCFF), orientation: north, x: 0, y: 0 },
  ]);
  const belowNorth = areaOf(PlanType.FFCFFFCFF, SpotType.North);
  const belowSouth = areaOf(PlanType.FFCFFFCFF, SpotType.South);
  const aboveSouth = areaOf(PlanType.FFFFFFCFF, SpotType.South);

  it("gives a city across two tiles its area on each, its tiles and nodes, and nothing of the other city", () => {
    const city = board.structureOf(2, aboveSouth)!;
    expect(city.category).toBe(CategoryType.City);
    expect([city.tiles, city.nodes, city.open]).toEqual([2, 2, 0]);
    expect([...city.areas]).toEqual([
      [1, 1 << (belowNorth - 1)],
      [2, 1 << (aboveSouth - 1)],
    ]);
    // The same structure from either tile.
    expect(board.structureOf(1, belowNorth)).toBe(city);
    // The south city of the first tile is its own, still open.
    const other = board.structureOf(1, belowSouth)!;
    expect(other.root).not.toBe(city.root);
    expect([...other.areas]).toEqual([[1, 1 << (belowSouth - 1)]]);
    expect(other.open).toBeGreaterThan(0);
  });

  it("lists every structure once, each node in exactly one, and changes nothing it was given", () => {
    const structures = board.structures();
    expect(new Set(structures.map((s) => s.root)).size).toBe(structures.length);
    const nodes = structures.flatMap((s) => [...s.areas].flatMap(([tile, mask]) => [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((b) => mask & (1 << b)).map((b) => `${tile}:${b + 1}`)));
    expect(new Set(nodes).size).toBe(nodes.length);
    expect(structures.filter((s) => s.category === CategoryType.City)).toHaveLength(2);
    expect(board.structureOf(1, 0)).toBeNull();
    expect(board.structureOf(9, 1)).toBeNull();
    // A read-only view: frozen structures, no placement on it.
    expect(Object.isFrozen(structures)).toBe(true);
    expect(Object.isFrozen(structures[0])).toBe(true);
    expect("place" in board).toBe(false);
  });

  it("counts a structure's tiles, not its nodes: two areas of one tile count it once", () => {
    // The 72-tile bench board: some forests hold two areas of one tile (they wrap round a road's end).
    const tiles = (JSON.parse(readFileSync(resolve(__dirname, "../bench/fixtures/board-72.json"), "utf8")) as { tiles: { id: number; plan: number; orientation: number; x: number; y: number }[] }).tiles;
    const structures = new StructureBoard(tiles).structures();
    for (const structure of structures) expect(structure.tiles).toBe(structure.areas.size);
    expect(structures.some((s) => s.nodes > s.tiles)).toBe(true);
  });
});
