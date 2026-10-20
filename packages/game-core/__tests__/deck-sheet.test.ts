import { describe, expect, it } from "vitest";
import { PlanType, baseDeckPlans, deckSheetCounts, deckSheetOrder } from "../src";

const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);

describe("deckSheetCounts", () => {
  it("counts the 72 base cards over the plans", () => {
    const counts = deckSheetCounts(baseDeckPlans(), []);
    expect(counts.total).toBe(72);
    expect(counts.plans.reduce((n, p) => n + p.total, 0)).toBe(72);
    expect(counts.plans).toHaveLength(19);
    expect(counts.plans.find((p) => p.code === PlanType.CCCCCFFFC)?.total).toBe(4);
    expect(counts.placed).toBe(0);
  });

  it("crosses out the plans on the board, never past a plan's total", () => {
    const board = [id(PlanType.CCCCCFFFC), id(PlanType.CCCCCFFFC), id(PlanType.CCCCCCCCC), id(PlanType.CCCCCCCCC)];
    const counts = deckSheetCounts(baseDeckPlans(), board);
    expect(counts.plans.find((p) => p.code === PlanType.CCCCCFFFC)?.placed).toBe(2);
    expect(counts.plans.find((p) => p.code === PlanType.CCCCCCCCC)?.placed).toBe(1);
    expect(counts.placed).toBe(3);
  });

  it("keeps the discards as a count and takes the deck as an input", () => {
    const counts = deckSheetCounts([PlanType.CCCCCCCCC, PlanType.CCCCCFFFC], [id(PlanType.CCCCCFFFC)], [id(PlanType.CCCCCCCCC), id(PlanType.CCCCCFFFC)]);
    expect(counts).toMatchObject({ total: 2, placed: 1, discarded: 1 });
    expect(counts.plans.find((p) => p.code === PlanType.CCCCCCCCC)?.discarded).toBe(1);
    expect(counts.plans.map((p) => p.code)).toEqual([PlanType.CCCCCCCCC, PlanType.CCCCCFFFC]);
  });
});

describe("deckSheetOrder", () => {
  const sequence = [PlanType.CCCCCFFFC, PlanType.RFFFRFCFR, PlanType.CCCCCFFFC, PlanType.FFCFFFCFF];

  it("keeps the draw order, the next tile first in hand", () => {
    const order = deckSheetOrder(sequence, []);
    expect(order.slots.map((s) => s.code)).toEqual(sequence);
    expect(order.slots.map((s) => s.state)).toEqual(["hand", "next", "next", "next"]);
    expect(order.slots[1]!.plan).toBe(id(PlanType.RFFFRFCFR));
    expect(order).toMatchObject({ placed: 0, discarded: 0 });
  });

  it("marks each move's tile at its position, placed or discarded", () => {
    const order = deckSheetOrder(sequence, [{ discard: false }, { discard: true }]);
    expect(order.slots.map((s) => s.state)).toEqual(["placed", "discarded", "hand", "next"]);
    expect(order).toMatchObject({ placed: 1, discarded: 1 });
  });

  it("has no tile in hand once every tile is played", () => {
    const order = deckSheetOrder(sequence, [{ discard: false }, { discard: false }, { discard: true }, { discard: false }]);
    expect(order.slots.some((s) => s.state === "hand" || s.state === "next")).toBe(false);
    expect(order).toMatchObject({ placed: 3, discarded: 1 });
  });
});

describe("the counted view never reveals the order (#613)", () => {
  it("is the same whatever order the same tiles were drawn and played in", () => {
    const played = [id(PlanType.CCCCCFFFC), id(PlanType.RFFFRFCFR), id(PlanType.FFFFCCCFF), id(PlanType.CCCCCCCCC)];
    const thrown = [id(PlanType.FFFFFFCFF), id(PlanType.RFFFRFCFR)];
    const a = deckSheetCounts(baseDeckPlans(), played, thrown);
    const b = deckSheetCounts([...baseDeckPlans()].reverse(), [...played].reverse(), [...thrown].reverse());
    expect(b).toEqual(a);
    // Plans in their id order, not in the deck's.
    expect(a.plans.map((p) => p.plan)).toEqual([...a.plans.map((p) => p.plan)].sort((x, y) => x - y));
  });
});

describe("discarded plans of a session", () => {
  it("the engine keeps the plan of each discard", async () => {
    const { EngineGame } = await import("../src");
    const game = EngineGame.start({ deck: "simple", seed: 7n });
    const first = Object.values(PlanType).indexOf(game.hand!.plan);
    game.discard();
    expect(game.discardedPlans).toEqual([first]);
    expect(game.clone().discardedPlans).toEqual([first]);
  });
});
