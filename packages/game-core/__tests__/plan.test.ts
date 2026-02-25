import { describe, it, expect } from "vitest";
import { Plan, PlanType } from "../src/types/plan";
import { CategoryType } from "../src/types/category";
import { SpotType } from "../src/types/spot";
import { AreaType } from "../src/types/area";

describe("Plan", () => {
  describe("into() and from() round-trip", () => {
    it("round-trips all 20 values (0-19)", () => {
      for (let i = 0; i < 20; i++) {
        const plan = Plan.from(i);
        expect(plan.into()).toBe(i);
      }
    });

    it("from(0) is None", () => {
      expect(Plan.from(0).value).toBe(PlanType.None);
    });

    it("from(1) is CCCCCCCCC", () => {
      expect(Plan.from(1).value).toBe(PlanType.CCCCCCCCC);
    });

    it("from(9) is RFFFRFCFR", () => {
      expect(Plan.from(9).value).toBe(PlanType.RFFFRFCFR);
    });
  });

  describe("unpack()", () => {
    it("RFFFRFCFR unpacks to [R, F, F, F, R, F, C, F, R]", () => {
      const plan = new Plan(PlanType.RFFFRFCFR);
      const categories = plan.unpack();
      expect(categories).toHaveLength(9);
      const values = categories.map((c) => c.value);
      expect(values).toEqual([
        CategoryType.Road,
        CategoryType.Forest,
        CategoryType.Forest,
        CategoryType.Forest,
        CategoryType.Road,
        CategoryType.Forest,
        CategoryType.City,
        CategoryType.Forest,
        CategoryType.Road,
      ]);
    });

    it("CCCCCCCCC unpacks to all City", () => {
      const plan = new Plan(PlanType.CCCCCCCCC);
      const categories = plan.unpack();
      expect(categories).toHaveLength(9);
      for (const cat of categories) {
        expect(cat.value).toBe(CategoryType.City);
      }
    });

    it("WFFFFFFFF unpacks to [W, F, F, F, F, F, F, F, F]", () => {
      const plan = new Plan(PlanType.WFFFFFFFF);
      const categories = plan.unpack();
      const values = categories.map((c) => c.value);
      expect(values[0]).toBe(CategoryType.Wonder);
      for (let i = 1; i < 9; i++) {
        expect(values[i]).toBe(CategoryType.Forest);
      }
    });

    it("None unpacks to 4 characters (N, o, n, e) which map to None", () => {
      const plan = new Plan(PlanType.None);
      const categories = plan.unpack();
      expect(categories).toHaveLength(4);
    });
  });

  describe("starts()", () => {
    it("returns non-empty array for all 19 non-None plan types", () => {
      const planTypes = Object.values(PlanType).filter((p) => p !== PlanType.None);
      expect(planTypes).toHaveLength(19);

      for (const planType of planTypes) {
        const plan = new Plan(planType);
        const starts = plan.starts();
        expect(starts.length).toBeGreaterThan(0);
      }
    });

    it("returns empty array for None", () => {
      const plan = new Plan(PlanType.None);
      expect(plan.starts()).toEqual([]);
    });

    it("RFFFRFCFR starts include Center and North", () => {
      const plan = new Plan(PlanType.RFFFRFCFR);
      const starts = plan.starts();
      expect(starts).toContain(SpotType.Center);
      expect(starts).toContain(SpotType.North);
    });
  });

  describe("wonder()", () => {
    it("WFFFFFFFF returns SpotType.Center", () => {
      expect(new Plan(PlanType.WFFFFFFFF).wonder()).toBe(SpotType.Center);
    });

    it("WFFFFFFFR returns SpotType.Center", () => {
      expect(new Plan(PlanType.WFFFFFFFR).wonder()).toBe(SpotType.Center);
    });

    it("CCCCCCCCC returns SpotType.None", () => {
      expect(new Plan(PlanType.CCCCCCCCC).wonder()).toBe(SpotType.None);
    });

    it("RFFFRFCFR returns SpotType.None", () => {
      expect(new Plan(PlanType.RFFFRFCFR).wonder()).toBe(SpotType.None);
    });

    it("all non-wonder plans return SpotType.None", () => {
      const nonWonder = Object.values(PlanType).filter(
        (p) => p !== PlanType.WFFFFFFFF && p !== PlanType.WFFFFFFFR
      );
      for (const planType of nonWonder) {
        expect(new Plan(planType).wonder()).toBe(SpotType.None);
      }
    });
  });

  describe("moves()", () => {
    it("RFFFRFCFR from Center returns moves", () => {
      const plan = new Plan(PlanType.RFFFRFCFR);
      const moves = plan.moves(SpotType.Center);
      expect(moves.length).toBeGreaterThan(0);
    });

    it("RFFFRFCFR from South returns moves", () => {
      const plan = new Plan(PlanType.RFFFRFCFR);
      const moves = plan.moves(SpotType.South);
      expect(moves.length).toBeGreaterThan(0);
    });

    it("None plan returns empty array", () => {
      const plan = new Plan(PlanType.None);
      expect(plan.moves(SpotType.Center)).toEqual([]);
    });
  });

  describe("area()", () => {
    it("RFFFRFCFR Center returns area A", () => {
      const plan = new Plan(PlanType.RFFFRFCFR);
      expect(plan.area(SpotType.Center)).toBe(AreaType.A);
    });

    it("RFFFRFCFR North returns area B", () => {
      const plan = new Plan(PlanType.RFFFRFCFR);
      expect(plan.area(SpotType.North)).toBe(AreaType.B);
    });

    it("RFFFRFCFR SouthEast returns area C", () => {
      const plan = new Plan(PlanType.RFFFRFCFR);
      expect(plan.area(SpotType.SouthEast)).toBe(AreaType.C);
    });

    it("RFFFRFCFR South returns area D", () => {
      const plan = new Plan(PlanType.RFFFRFCFR);
      expect(plan.area(SpotType.South)).toBe(AreaType.D);
    });

    it("returns valid AreaType for all non-None plans and Center", () => {
      const planTypes = Object.values(PlanType).filter((p) => p !== PlanType.None);
      for (const planType of planTypes) {
        const plan = new Plan(planType);
        const area = plan.area(SpotType.Center);
        expect(Object.values(AreaType)).toContain(area);
      }
    });

    it("None plan returns AreaType.None", () => {
      const plan = new Plan(PlanType.None);
      expect(plan.area(SpotType.Center)).toBe(AreaType.None);
    });
  });
});
