import { describe, expect, it } from "vitest";
import { PlanType, baseDeckPlans, deckSheetCounts } from "../src";

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
    const counts = deckSheetCounts([PlanType.CCCCCCCCC, PlanType.CCCCCFFFC], [id(PlanType.CCCCCFFFC)], 2);
    expect(counts).toMatchObject({ total: 2, placed: 1, discarded: 2 });
    expect(counts.plans.map((p) => p.code)).toEqual([PlanType.CCCCCCCCC, PlanType.CCCCCFFFC]);
  });
});
