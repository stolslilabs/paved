import { describe, expect, it } from "vitest";
import { fpToMultiplier, computeAdjustedReward } from "../src/economy";

describe("economy helpers", () => {
  it("converts fixed-point multiplier into decimal multiplier", () => {
    expect(fpToMultiplier(1250000)).toBe(1.25);
    expect(fpToMultiplier("2000000")).toBe(2);
  });

  it("computes adjusted rewards from base and fixed-point multiplier", () => {
    expect(computeAdjustedReward(1000, 1250000)).toBe(1250);
    expect(computeAdjustedReward("600", "500000")).toBe(300);
  });
});
