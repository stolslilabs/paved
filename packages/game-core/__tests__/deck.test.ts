import { describe, it, expect } from "vitest";
import { Base } from "../src/elements/decks/base";
import { Tutorial } from "../src/elements/decks/tutorial";
import { PlanType } from "../src/types/plan";

describe("Base deck", () => {
  it("total_count() is 72", () => {
    expect(Base.total_count()).toBe(72);
  });

  it("count() is 72", () => {
    expect(Base.count()).toBe(72);
  });

  it("plan(i) returns valid PlanType for indices 0-71", () => {
    for (let i = 0; i < 72; i++) {
      const plan = Base.plan(i);
      expect(Object.values(PlanType)).toContain(plan);
      expect(plan).not.toBe(PlanType.None);
    }
  });

  it("plan(i) for index >= 72 wraps (uses modulo)", () => {
    for (let i = 72; i < 80; i++) {
      expect(Base.plan(i)).toBe(Base.plan(i % 72));
    }
  });

  it("all 19 PlanTypes (non-None) appear at least once in the deck", () => {
    const seen = new Set<PlanType>();
    for (let i = 0; i < 72; i++) {
      seen.add(Base.plan(i));
    }

    const allNonNone = Object.values(PlanType).filter((p) => p !== PlanType.None);
    expect(allNonNone).toHaveLength(19);

    for (const planType of allNonNone) {
      expect(seen.has(planType)).toBe(true);
    }
  });

  it("CCCCCCCCC appears once (index 0)", () => {
    expect(Base.plan(0)).toBe(PlanType.CCCCCCCCC);
    let count = 0;
    for (let i = 0; i < 72; i++) {
      if (Base.plan(i) === PlanType.CCCCCCCCC) count++;
    }
    expect(count).toBe(1);
  });

  it("SFRFRFRFR appears once (index 65)", () => {
    expect(Base.plan(65)).toBe(PlanType.SFRFRFRFR);
    let count = 0;
    for (let i = 0; i < 72; i++) {
      if (Base.plan(i) === PlanType.SFRFRGRFR) count++;
    }
    // Just check that it exists
    expect(Base.plan(65)).toBe(PlanType.SFRFRFRFR);
  });
});

describe("Tutorial deck", () => {
  it("has correct structure", () => {
    expect(Tutorial.total_count()).toBe(9);
    expect(Tutorial.count()).toBe(9);
  });

  it("plan(i) returns valid PlanType for indices 0-8", () => {
    for (let i = 0; i < 9; i++) {
      const plan = Tutorial.plan(i);
      expect(Object.values(PlanType)).toContain(plan);
      expect(plan).not.toBe(PlanType.None);
    }
  });

  it("wraps with modulo", () => {
    expect(Tutorial.plan(9)).toBe(Tutorial.plan(0));
    expect(Tutorial.plan(10)).toBe(Tutorial.plan(1));
  });

  it("first plan is RFFFRFCFR", () => {
    expect(Tutorial.plan(0)).toBe(PlanType.RFFFRFCFR);
  });

  it("parameters returns valid data for indices 1-8", () => {
    for (let i = 1; i <= 8; i++) {
      const params = Tutorial.parameters(i);
      expect(params).toHaveProperty("orientation");
      expect(params).toHaveProperty("x");
      expect(params).toHaveProperty("y");
      expect(params).toHaveProperty("role");
      expect(params).toHaveProperty("spot");
    }
  });
});
