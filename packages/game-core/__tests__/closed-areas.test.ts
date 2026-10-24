import { describe, expect, it } from "vitest";
import { ALL_AREAS, EngineGame, closedOf } from "../src";
import { CategoryType } from "../src/types/category";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";

const { North } = OrientationType;

/** The nodes of a list of tile masks, as `tile:area`. */
const nodes = (areas: readonly { tileId: number; areas: number }[]) =>
  areas.flatMap(({ tileId, areas: mask }) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((a) => mask & (1 << (a - 1))).map((a) => `${tileId}:${a}`));

describe("the closed structures' areas (#722)", () => {
  it("gives each road one tile closes its own areas, beside the Scored events", () => {
    // Two road ends (a stop, its roads ending at its centre) at (20, 20) and (22, 20); a third between them closes both.
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    game.write({ id: 100, plan: PlanType.SFRFRFFFR, orientation: North, x: 20, y: 20 });
    game.write({ id: 101, plan: PlanType.SFRFRFFFR, orientation: North, x: 22, y: 20 });
    game.force(PlanType.SFRFRFFFR);
    const result = game.build({ orientation: North, x: 21, y: 20 });

    expect(result.scored.map((s) => s.category)).toEqual([CategoryType.Road, CategoryType.Road]);
    // One closed structure per Scored event, in the same order, the event's fields unchanged.
    expect(result.closed).toHaveLength(2);
    result.closed.forEach((closed, i) => expect(closed).toMatchObject({ ...result.scored[i], tiles: 2, tileId: result.tileId }));
    const [first, second] = result.closed.map((c) => c.areas!);
    // Each road holds one area of the closing tile and one of a road end: the closing tile is in both, with other areas.
    // (Their order is the contract's start spots'.)
    const ends = [first, second].map((areas) => areas.map((a) => a.tileId).filter((id) => id !== result.tileId));
    expect(ends.flat().sort()).toEqual([100, 101]);
    for (const areas of [first, second]) expect(areas.map((a) => a.tileId)).toContain(result.tileId);
    const own = (areas: typeof first) => areas.find((a) => a.tileId === result.tileId)!.areas;
    expect(own(first) & own(second)).toBe(0);
    for (const areas of [first, second]) expect(nodes(areas)).toHaveLength(2);
    // The game's closings carry the same areas.
    expect(game.closings().map((c) => c.areas)).toEqual([first, second]);
    // A discard closes nothing.
    expect(game.discard().closed).toEqual([]);
  });

  it("gives a wonder its tile and the 8 around it, whole, as D-19 counts them", () => {
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    game.force(PlanType.WFFFFFFFR);
    const wonder = game.build({ orientation: North, x: 1, y: 0 }).tileId;
    [[1, 1], [2, 1], [2, 0], [2, -1], [1, -1], [0, -1]].forEach(([x, y], index) => {
      game.write({ id: 100 + index, plan: PlanType.FFFFFFCFF, orientation: North, x, y });
    });
    game.force(PlanType.FFFFFFCFF);
    const result = game.build({ orientation: North, x: 0, y: 1 });

    const closed = result.closed.find((c) => c.category === CategoryType.Wonder)!;
    expect(closed.tiles).toBe(9);
    expect(closed.areas).toEqual(
      [1, wonder, result.tileId, 100, 101, 102, 103, 104, 105].sort((a, b) => a - b).map((tileId) => ({ tileId, areas: ALL_AREAS })),
    );
    // The city the same tile closed with the starter is its own structure.
    const city = result.closed.find((c) => c.category === CategoryType.City)!;
    expect(city.areas!.map((a) => a.tileId)).toEqual([1, result.tileId]);
  });

  it("reads the closed structures off a board written as it is, and gives the chain's ids back", () => {
    // The same two roads, written: nothing scored, both closed on the board; one still-open road end is left out.
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    game.write({ id: 1100, plan: PlanType.SFRFRFFFR, orientation: North, x: 20, y: 20 });
    game.write({ id: 1101, plan: PlanType.SFRFRFFFR, orientation: North, x: 21, y: 20 });
    game.write({ id: 1102, plan: PlanType.SFRFRFFFR, orientation: North, x: 22, y: 20 });
    expect(game.closings()).toEqual([]);
    const roads = game.closedOnBoard().filter((c) => c.category === CategoryType.Road);
    expect(roads).toHaveLength(2);
    const closed = closedOf(roads, (id) => id - 1000);
    expect(closed.map((areas) => areas.map((a) => a.tileId))).toEqual([
      [100, 101],
      [101, 102],
    ]);
    // Every structure listed is closed: no road end that still points at an empty cell.
    expect(game.openStructures().length).toBeGreaterThan(0);
  });

  it("puts a written board's last move's structures last, in the order the move scored them (the feed's)", () => {
    // Played: the closing tile's two roads, in the order of its Scored events.
    const played = EngineGame.start({ deck: "simple", seed: 0n });
    played.write({ id: 100, plan: PlanType.SFRFRFFFR, orientation: North, x: 20, y: 20 });
    played.write({ id: 101, plan: PlanType.SFRFRFFFR, orientation: North, x: 22, y: 20 });
    played.force(PlanType.SFRFRFFFR);
    const move = played.build({ orientation: North, x: 21, y: 20 });
    const scoredOrder = move.closed.map((c) => c.areas!.find((a) => a.tileId === move.tileId)!.areas);
    // Written: a road closed earlier elsewhere, then the same three tiles, the middle one last (id 103).
    const written = EngineGame.start({ deck: "simple", seed: 0n });
    written.write({ id: 90, plan: PlanType.SFRFRFFFR, orientation: North, x: 40, y: 40 });
    written.write({ id: 91, plan: PlanType.SFRFRFFFR, orientation: North, x: 41, y: 40 });
    written.write({ id: 100, plan: PlanType.SFRFRFFFR, orientation: North, x: 20, y: 20 });
    written.write({ id: 101, plan: PlanType.SFRFRFFFR, orientation: North, x: 22, y: 20 });
    written.write({ id: 103, plan: PlanType.SFRFRFFFR, orientation: North, x: 21, y: 20 });
    const roads = written.closedOnBoard(103).filter((c) => c.category === CategoryType.Road);
    expect(roads.map((c) => c.areas.map((a) => a.tileId))[0]).toEqual([90, 91]);
    expect(roads.slice(1).map((c) => c.areas.find((a) => a.tileId === 103)!.areas)).toEqual(scoredOrder);
    // Without a closer, the board's order: the same structures.
    expect(new Set(written.closedOnBoard().map((c) => JSON.stringify(c)))).toEqual(new Set(written.closedOnBoard(103).map((c) => JSON.stringify(c))));
  });

  it("names each tile as the board does (closedOf), the starter included", () => {
    const toChain = (id: number) => (id > 1000 ? id - 1000 : id);
    expect(closedOf([{ areas: [{ tileId: 1, areas: 8 }, { tileId: 1003, areas: 2 }] }, {}], toChain)).toEqual([
      [{ tileId: 1, areas: 8 }, { tileId: 3, areas: 2 }],
      [],
    ]);
  });
});
