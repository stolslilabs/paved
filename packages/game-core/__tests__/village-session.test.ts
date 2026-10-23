/** A village read from the chain on the engine (#646 PR 2): `EngineGame.villageOf` and the code-level helpers of `sessions/village.ts`. */
import { describe, expect, it } from "vitest";
import { EngineGame, baseDeckPlans, offerPlans, placeInVillage, startTerritory, villageGame, villageRefusal } from "../src";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/** A village grown on the engine by the first legal placement of each plan; its tiles as the chain lists them (codes, ids). */
function grown(plans: readonly number[]) {
  const territory = [...startTerritory(), { x: 2, y: 0 }, { x: 2, y: 1 }];
  const game = EngineGame.village({ territory });
  for (const code of plans) {
    const spot = game.legalPlacements(PLANS[code] as PlanType)[0];
    if (spot) game.place(PLANS[code] as PlanType, spot);
  }
  const tiles = game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: t.x, y: t.y }));
  return { game, territory, tiles };
}

describe("a village read from the chain", () => {
  it("rebuilds to the same tiles and score, the starter skipped", () => {
    const { game, territory, tiles } = grown([10, 9, 13, 18, 10, 12]);
    expect(tiles.length).toBeGreaterThan(3);
    expect(tiles[0]).toMatchObject({ id: 1, x: 0, y: 0 });
    const read = villageGame(territory, tiles);
    expect(read.score).toBe(game.score);
    expect(read.placed()).toEqual(game.placed());
    expect(read.territory()).toEqual(game.territory());
  });

  it("refuses and places as Village.place does, in codes", () => {
    const { territory, tiles } = grown([10]);
    const read = villageGame(territory, tiles);
    expect(villageRefusal(read, 10, 1, { x: 3, y: 0 })).toBe("Village: cell not owned");
    expect(villageRefusal(read, 10, 1, { x: 0, y: 0 })).toBe("Tile: already exists");
    expect(villageRefusal(read, 10, 1, { x: 2, y: 1 })).toBe("Tile: no neighbors");
    expect(villageRefusal(read, 0, 1, { x: 1, y: 1 })).toBe("Village: invalid plan");
    expect(villageRefusal(read, 10, 5, { x: 1, y: 1 })).toBe("Village: invalid orientation");
    const legal = read.legalPlacements(PLANS[9] as PlanType)[0]!;
    const orientation = ORIENTATIONS.indexOf(legal.orientation);
    const before = read.score;
    const points = placeInVillage(read, 9, orientation, legal);
    expect(read.score).toBe(before + points);
    expect(() => placeInVillage(read, 9, orientation, legal)).toThrow("Tile: already exists");
  });

  it("refuses a code out of range in the chain's tiles", () => {
    expect(() => villageGame(startTerritory(), [{ id: 2, plan: 20, orientation: 1, x: 1, y: 0 }])).toThrow();
  });
});

describe("a reward's offer", () => {
  it("draws three cards of the base deck from three 64-bit lanes, as offer_plans", () => {
    const deck = baseDeckPlans().map((p) => PLANS.indexOf(p));
    const random = (5n << 128n) | (71n << 64n) | 0n;
    expect(offerPlans(random)).toEqual([deck[0], deck[71], deck[5]]);
    // A lane past 72 wraps: 72 is card 0, and bits above the lane do not reach it.
    expect(offerPlans(72n | (1n << 200n))[0]).toBe(deck[0]);
    for (let i = 0n; i < 50n; i++) {
      for (const plan of offerPlans(i * 0x9e3779b97f4a7c15n * (1n << 61n) + i)) expect(plan).toBeGreaterThanOrEqual(1);
    }
  });
});
