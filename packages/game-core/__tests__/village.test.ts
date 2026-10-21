// The village's territory on the off-chain engine (#640, `docs/architecture/village-territory.md`): the territory
// mask, the parcel rule, forced placement, and the parity with `Village` (`contracts/src/systems/village.cairo`):
// `fixtures/village-parity.json` is replayed here, and its steps are the ones `test_village_parity` replays in
// snforge (`contracts/src/tests/village.cairo`, `parity_steps`), checked below by reading that file.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EngineError,
  EngineGame,
  PARCEL_COBBLES,
  VILLAGE_MAX_CELLS,
  VILLAGE_MAX_PARCELS,
  parcelLevel,
  parcelPrice,
  demolitionPrice,
  startTerritory,
} from "../src/engine";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";

const { North } = OrientationType;
const ORIENTATIONS = [OrientationType.None, OrientationType.North, OrientationType.East, OrientationType.South, OrientationType.West];

interface Step {
  action: "buy" | "place" | "demolish";
  plan?: PlanType;
  code?: number;
  orientation?: number;
  x: number;
  y: number;
  refusal?: string;
  parcel?: number;
  points?: number;
  price?: number;
  score?: number;
}

const FIXTURE = resolve(__dirname, "fixtures/village-parity.json");
const CAIRO = resolve(__dirname, "../../../contracts/src/tests/village.cairo");
const steps = (JSON.parse(readFileSync(FIXTURE, "utf8")) as { steps: Step[] }).steps;

describe("village parity", () => {
  it("replays the fixture on the engine", () => {
    const game = EngineGame.village();
    let demolitions = 0;
    for (const step of steps) {
      if (step.action === "demolish") {
        const cell = { x: step.x, y: step.y };
        expect(game.demolitionRefusal(cell)).toBe(step.refusal ?? null);
        if (step.refusal) continue;
        expect(demolitionPrice(demolitions)).toBe(step.price);
        demolitions += 1;
        expect(game.demolish(cell)).toBe(step.score);
        continue;
      }
      if (step.action === "buy") {
        const cell = { x: step.x, y: step.y };
        expect(game.parcelRefusal(cell)).toBe(step.refusal ?? null);
        if (!step.refusal) expect(game.buyParcel(cell)).toBe(step.parcel);
        continue;
      }
      const plan = step.plan as PlanType;
      const placement = { orientation: ORIENTATIONS[step.orientation as number] as OrientationType, x: step.x, y: step.y };
      if (step.refusal) {
        expect(game.refusal(placement, plan)).toBe(step.refusal);
        expect(() => game.place(plan, placement)).toThrow(step.refusal);
        continue;
      }
      const move = game.place(plan, placement);
      expect([move.points, move.score]).toEqual([step.points, step.score]);
    }
  });

  it("holds the chain codes of its plans", () => {
    const codes = Object.values(PlanType);
    for (const step of steps.filter((s) => s.action === "place")) expect(codes.indexOf(step.plan as PlanType)).toBe(step.code);
  });

  it("is the list snforge replays (`parity_steps` of contracts/src/tests/village.cairo)", () => {
    const source = readFileSync(CAIRO, "utf8");
    const body = source.slice(source.indexOf("fn parity_steps"), source.indexOf("// End of parity_steps"));
    const calls = [...body.matchAll(/\b(place|refused|buy|buy_refused|demolish|demolish_refused)\(([^)]*)\)/g)].map(([, name, args]) => {
      const values = (args as string).split(",").map((a) => a.trim());
      const n = (i: number) => Number(values[i]);
      const text = (i: number) => (values[i] as string).replace(/^'|'$/g, "");
      switch (name) {
        case "place":
          return { action: "place", code: n(0), orientation: n(1), x: n(2), y: n(3), points: n(4), score: n(5) };
        case "refused":
          return { action: "place", code: n(0), orientation: n(1), x: n(2), y: n(3), refusal: text(4) };
        case "buy":
          return { action: "buy", x: n(0), y: n(1), parcel: n(2) };
        case "demolish":
          return { action: "demolish", x: n(0), y: n(1), price: n(2), score: n(3) };
        case "demolish_refused":
          return { action: "demolish", x: n(0), y: n(1), refusal: text(2) };
        default:
          return { action: "buy", x: n(0), y: n(1), refusal: text(2) };
      }
    });
    const expected = steps.map(({ plan: _plan, code, ...rest }) => (code === undefined ? rest : { code, ...rest }));
    expect(calls).toEqual(expected);
  });
});

describe("village territory", () => {
  it("starts with the starter and the 3 x 3 around it", () => {
    const game = EngineGame.village();
    expect(game.territory()).toEqual(startTerritory());
    expect(game.territory()).toHaveLength(9);
    expect(game.placed()).toEqual([
      { id: 1, plan: PlanType.RFFFRFCFR, orientation: OrientationType.South, x: 0, y: 0, owner: 1n },
    ]);
    expect(game.hand).toBeNull();
    expect(game.over).toBe(false);
  });

  it("buys parcels next to the territory, up to 38 cells", () => {
    const game = EngineGame.village();
    for (let parcel = 1; parcel <= VILLAGE_MAX_PARCELS; parcel++) {
      expect(game.buyParcel({ x: 1 + parcel, y: 0 })).toBe(parcel);
    }
    expect(game.territory()).toHaveLength(VILLAGE_MAX_CELLS);
    expect(game.parcelRefusal({ x: 31, y: 0 })).toBe("Village: territory full");
    expect(() => game.buyParcel({ x: -2, y: 0 })).toThrow("Village: territory full");
  });

  it("keeps the territory connected", () => {
    const game = EngineGame.village();
    expect(game.parcelRefusal({ x: 2, y: 2 })).toBe("Village: not adjacent");
    expect(game.parcelRefusal({ x: 3, y: 0 })).toBe("Village: not adjacent");
    expect(game.parcelRefusal({ x: 2, y: 1 })).toBeNull();
  });

  it("keeps legal placements on owned cells", () => {
    const game = EngineGame.village();
    const road = game.legalPlacements(PlanType.RFFFRFFFR);
    expect(road.length).toBeGreaterThan(0);
    for (const p of road) expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeLessThanOrEqual(1);
    game.place(PlanType.RFFFRFFFR, { orientation: North, x: 1, y: 0 });
    // The road's east end faces (2, 0), not owned: no placement there until it is bought
    expect(game.legalPlacements(PlanType.SFRFRFRFR).some((p) => p.x === 2)).toBe(false);
    game.buyParcel({ x: 2, y: 0 });
    expect(game.legalPlacements(PlanType.SFRFRFRFR).some((p) => p.x === 2 && p.y === 0)).toBe(true);
  });

  it("applies the mask to any deck (the attack's replay, #643)", () => {
    const game = EngineGame.start({
      deck: "story",
      seed: 0n,
      sequence: [PlanType.SFRFRFRFR, PlanType.SFRFRFRFR],
      territory: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    });
    expect(game.refusal({ orientation: North, x: -1, y: 0 })).toBe("Village: cell not owned");
    expect(game.legalPlacements().every((p) => p.x === 1 && p.y === 0)).toBe(true);
    expect(game.build({ orientation: North, x: 1, y: 0 }).score).toBe(0);
  });

  it("clones the territory", () => {
    const game = EngineGame.village();
    const copy = game.clone();
    copy.buyParcel({ x: 2, y: 0 });
    expect(game.territory()).toHaveLength(9);
    expect(copy.territory()).toHaveLength(10);
  });

  it("places only on a village", () => {
    const game = EngineGame.start({ deck: "simple", seed: 0n });
    expect(() => game.place(PlanType.RFFFRFFFR, { orientation: North, x: 1, y: 0 })).toThrow(EngineError);
    expect(game.parcelRefusal({ x: 2, y: 0 })).toBe("Village: no village");
  });

  it("demolishes by rebuilding the village from the tiles left, in their order", () => {
    const game = EngineGame.village();
    game.place(PlanType.RFFFRFFFR, { orientation: North, x: 1, y: 0 });
    game.place(PlanType.SFRFRFRFR, { orientation: North, x: -1, y: 0 });
    game.buyParcel({ x: 2, y: 0 });
    expect(game.place(PlanType.SFRFRFRFR, { orientation: North, x: 2, y: 0 }).score).toBe(438);
    // The road loses its middle tile: open again, nothing scores; the tiles keep their order, renumbered
    expect(game.demolish({ x: 1, y: 0 })).toBe(0);
    expect(game.placed().map((t) => [t.id, t.x, t.y])).toEqual([
      [1, 0, 0],
      [2, -1, 0],
      [3, 2, 0],
    ]);
    expect(game.territory()).toHaveLength(10);
    expect(game.place(PlanType.RFFFRFFFR, { orientation: North, x: 1, y: 0 }).points).toBe(438);
    expect(game.demolitionRefusal({ x: 0, y: 0 })).toBe("Village: starter stays");
    expect(() => game.demolish({ x: 0, y: 2 })).toThrow("Village: no tile");
    expect(EngineGame.start({ deck: "simple", seed: 0n }).demolitionRefusal({ x: 0, y: 0 })).toBe("Engine: not a village");
  });

  it("prices a day's demolitions at 5, doubled after each one", () => {
    expect([0, 1, 2, 3, 4].map(demolitionPrice)).toEqual([5, 10, 20, 40, 80]);
    expect(demolitionPrice(29)).toBe(5 * 2 ** 29);
    expect(demolitionPrice(200)).toBe(5 * 2 ** 29);
  });

  it("prices parcel k at 10 x k Cobbles and level k", () => {
    expect([parcelPrice(1), parcelLevel(1)]).toEqual([PARCEL_COBBLES, 1]);
    expect([parcelPrice(5), parcelLevel(5)]).toEqual([50, 5]);
    expect([parcelPrice(29), parcelLevel(29)]).toEqual([290, 29]);
    expect([parcelPrice(0), parcelLevel(0), parcelPrice(30), parcelLevel(30)]).toEqual([0, 0, 0, 0]);
    let total = 0;
    for (let k = 1; k <= VILLAGE_MAX_PARCELS; k++) total += parcelPrice(k);
    expect(total).toBe(4350);
  });
});
