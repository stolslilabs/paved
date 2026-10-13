import { describe, it, expect } from "vitest";
import { getPlanKey, getTilePath } from "../src/asset-keys";
import { PlanType } from "../src/types/plan";

describe("getPlanKey()", () => {
  it("PlanType.CCCCCCCCC returns 'ccccccccc'", () => {
    expect(getPlanKey(PlanType.CCCCCCCCC)).toBe("ccccccccc");
  });

  it("PlanType.None returns '00'", () => {
    expect(getPlanKey(PlanType.None)).toBe("00");
  });

  it("PlanType.RFFFRFCFR returns 'rfffrfcfr'", () => {
    expect(getPlanKey(PlanType.RFFFRFCFR)).toBe("rfffrfcfr");
  });

  it("PlanType.WFFFFFFFF returns 'wffffffff'", () => {
    expect(getPlanKey(PlanType.WFFFFFFFF)).toBe("wffffffff");
  });

  it("PlanType.SFRFRFRFR returns 'sfrfrfrfr'", () => {
    expect(getPlanKey(PlanType.SFRFRFRFR)).toBe("sfrfrgrfr" === "sfrfrfrfr" ? "sfrfrfrfr" : "sfrfrfrfr");
    expect(getPlanKey(PlanType.SFRFRFRFR)).toBe("sfrfrfrfr");
  });

  it("all 19 non-None plan types have valid lowercase keys", () => {
    const planTypes = Object.values(PlanType).filter((p) => p !== PlanType.None);
    expect(planTypes).toHaveLength(19);

    for (const planType of planTypes) {
      const key = getPlanKey(planType);
      expect(key).not.toBe("00");
      expect(key).toMatch(/^[a-z]+$/);
      expect(key).toHaveLength(9);
    }
  });

  it("each plan key is the lowercase version of the plan name", () => {
    const planTypes = Object.values(PlanType).filter((p) => p !== PlanType.None);
    for (const planType of planTypes) {
      expect(getPlanKey(planType)).toBe(planType.toLowerCase());
    }
  });
});

describe("getTilePath()", () => {
  it("returns correct path for a plan type", () => {
    expect(getTilePath(PlanType.CCCCCCCCC)).toBe("/assets/tiles/ccccccccc.png");
  });

  it("uses custom basePath", () => {
    expect(getTilePath(PlanType.CCCCCCCCC, "/custom")).toBe("/custom/ccccccccc.png");
  });

  it("returns 00 path for None plan", () => {
    expect(getTilePath(PlanType.None)).toBe("/assets/tiles/00.png");
  });
});
