import { describe, expect, it } from "vitest";
import { EngineGame } from "../src/engine/game";
import { edgeCategory } from "../src/engine/geometry";
import {
  TOWN_HALL_LEVELS,
  TOWN_HALL_TILES,
  VillageDraft,
  buildOrder,
  emptyInventory,
  layoutRefusal,
  starterBoard,
  townHallLevelAt,
  townHallPlayerLevel,
  townHallPrice,
  townHallRefusal,
  townHallSlots,
} from "../src/rules";
/** North, east, south, west as the engine's directions, and the step each takes. */
const SIDES = [
  ["North", 0, 1],
  ["East", 1, 0],
  ["South", 0, -1],
  ["West", -1, 0],
] as const;

describe("the Town Hall's footprint", () => {
  it("is four cells of a 2 x 2 square, ids 1 to 4, in place of the starter", () => {
    const game = starterBoard();
    expect(game.placed().map((t) => [t.id, t.x, t.y])).toEqual([
      [1, 0, 0],
      [2, 1, 0],
      [3, 0, 1],
      [4, 1, 1],
    ]);
    expect(game.score).toBe(0);
  });

  it("shows three roads, two cities and three forests on its eight outer edges, and matches itself inside", () => {
    const NAMES = ["", "Forest", "Road", "City"];
    const outer: string[] = [];
    for (const tile of TOWN_HALL_TILES) {
      SIDES.forEach(([side, dx, dy], index) => {
        const category = edgeCategory(tile.plan, tile.orientation, 2 * index + 2);
        const inner = TOWN_HALL_TILES.find((t) => t.x === tile.x + dx && t.y === tile.y + dy);
        if (inner) expect(edgeCategory(inner.plan, inner.orientation, 2 * ((index + 2) % 4) + 2)).toBe(category);
        else outer.push(`${tile.quadrant}-${side}:${NAMES[category]}`);
      });
    }
    expect(outer).toEqual([
      "sw-South:City",
      "sw-West:City",
      "se-East:Forest",
      "se-South:Road",
      "nw-North:Forest",
      "nw-West:Road",
      "ne-North:Road",
      "ne-East:Forest",
    ]);
  });

  it("leaves every other mode its starter", () => {
    expect(EngineGame.start({ deck: "village", seed: 0n }).placed()).toHaveLength(1);
    expect(() => EngineGame.start({ deck: "simple", seed: 1n, townHall: true })).toThrow("only a village");
  });
});

describe("a layout round the Town Hall", () => {
  const inventory = emptyInventory().map(() => 9);
  it("refuses a tile on any of its four cells and walks from all of them", () => {
    for (const t of TOWN_HALL_TILES) expect(layoutRefusal([{ plan: 8, orientation: 1, x: t.x, y: t.y }], { slots: 9, inventory })).toBe("starter-cell");
    // A city cap south of the south-west cell's piece of city.
    const draft = new VillageDraft({ slots: 9, inventory });
    const fits = draft.placements(8).filter((p) => p.x === 0 && p.y === -1);
    expect(fits.length).toBeGreaterThan(0);
    expect(buildOrder([fits[0]!])).toHaveLength(1);
    expect(draft.liftRefusal(1, 1)).toBe("starter");
    expect(draft.tileAt(0, 1)?.plan).toBe(10);
    expect(draft.tileAt(0, 0)?.plan).toBe(6);
  });
});

describe("the Town Hall's levels", () => {
  it("sets the slots: 9 at level 1, two more a level, 27 at level 10", () => {
    expect(townHallSlots(1)).toBe(9);
    expect(townHallSlots(2)).toBe(11);
    expect(townHallSlots(TOWN_HALL_LEVELS)).toBe(27);
    expect(townHallSlots(99)).toBe(27);
  });

  it("upgrades for Cobbles, with a player level", () => {
    expect([townHallPrice(1), townHallPlayerLevel(1)]).toEqual([40, 2]);
    expect(townHallRefusal(1, 1, 40, 500)).toBe("level-too-low");
    expect(townHallRefusal(1, 2, 30, 500)).toBe("price-changed");
    expect(townHallRefusal(1, 2, 40, 39)).toBe("not-enough-cobbles");
    expect(townHallRefusal(1, 2, 40, 40)).toBeNull();
    expect(townHallRefusal(TOWN_HALL_LEVELS, 20, 0, 9999)).toBe("max-level");
    expect([townHallLevelAt(1), townHallLevelAt(5), townHallLevelAt(20)]).toEqual([1, 3, 10]);
  });
});
