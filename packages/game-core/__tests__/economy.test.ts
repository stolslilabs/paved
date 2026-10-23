import { describe, expect, it } from "vitest";
import {
  burnShare,
  capScore,
  computeAdjustedReward,
  estimatedReference,
  fpToMultiplier,
  guardedPaved,
  referenceReward,
  rewardOf,
  winningScore,
} from "../src/economy";

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

// The vectors of `contracts/src/tests/economy/curve.cairo`: the client pays what the chain pays.
const PAVED = 10n ** 18n;
const RATE_SCALE = 10n ** 18n;

describe("Challenge reward (#705, curve.cairo)", () => {
  it("splits one swap's PAVED by input, the Vault's part rounded down", () => {
    expect(burnShare(1_000n, 7_368n, 10_000n)).toBe(737n);
    expect(burnShare(1_000n, 7_368n, 9_500n)).toBe(776n);
    expect(burnShare(1_000n, 0n, 0n)).toBe(1_000n);
  });

  it("counts at most 110 % of the guard's rate, everything at a rate of 0", () => {
    const rate = 80n * RATE_SCALE;
    expect(guardedPaved(800n, 10n, rate)).toBe(800n);
    expect(guardedPaved(880n, 10n, rate)).toBe(880n);
    expect(guardedPaved(881n, 10n, rate)).toBe(880n);
    expect(guardedPaved(2_000n, 10n, rate)).toBe(880n);
    expect(guardedPaved(2_000n, 10n, 0n)).toBe(2_000n);
  });

  it("boosts R by the stake and scales it by the supply factor", () => {
    const bought = 1_000n * PAVED;
    expect(referenceReward(bought, 1, 10_000)).toBe(1_010n * PAVED);
    expect(referenceReward(bought, 10, 10_000)).toBe(1_100n * PAVED);
    expect(referenceReward(bought, 10, 20_000)).toBe(2_200n * PAVED);
    expect(referenceReward(bought, 3, 9_000)).toBe(927n * PAVED);
    expect(referenceReward(bought, 3, 0)).toBe(0n);
  });

  it("estimates R from the pool's quote of the whole swap", () => {
    // 10 USDC swapped for 760 PAVED; the burn quote is 7.368 USDC of it: 559.968 PAVED, under the guard (80 x 7.368 x 1.1).
    const input = { poolOut: 760n * PAVED, swapIn: 10_000_000n, burnQuote: 7_368_000n, rate: (80n * PAVED * RATE_SCALE) / 1_000_000n, stake: 5, factorBps: 10_000 };
    expect(estimatedReference(input)).toBe(referenceReward(559_968n * 10n ** 15n, 5, 10_000));
    // A pool far above the guard's rate counts 110 % of it.
    expect(estimatedReference({ ...input, poolOut: 2_000n * PAVED })).toBe(referenceReward(648_384n * 10n ** 15n, 5, 10_000));
  });

  it("pays 0 below the threshold, c x R at it, linear above, capped at H x R", () => {
    const r = 1_000n * PAVED;
    expect(rewardOf(r, 0, 3_000_000, 18_130, 5)).toBe(0n);
    expect(rewardOf(r, 2_999, 3_000_000, 18_130, 5)).toBe(0n);
    expect(rewardOf(r, 3_000, 3_000_000, 18_130, 5)).toBe(1_813n * PAVED);
    expect(rewardOf(r, 4_500, 3_000_000, 18_130, 5)).toBe(2_719_500_000_000_000_000_000n);
    expect(rewardOf(r, 4_000, 3_353_500, 18_130, 5)).toBe(2_162_516_773_520_202_773_222n);
    expect(rewardOf(r, 8_273, 3_000_000, 18_130, 5)).toBe(4_999_649_666_666_666_666_666n);
    expect(rewardOf(r, 8_274, 3_000_000, 18_130, 5)).toBe(5_000n * PAVED);
    expect(rewardOf(r, 100_000, 3_000_000, 18_130, 5)).toBe(5_000n * PAVED);
    expect(rewardOf(100_000_000n * PAVED, 4_000_000_000, 100_000, 50_000, 20)).toBe(2_000_000_000n * PAVED);
  });

  it("finds the winning score and the score of the cap", () => {
    expect(winningScore(3_000_000)).toBe(3_000);
    expect(winningScore(3_353_500)).toBe(3_354);
    expect(capScore(3_000_000, 18_130, 5)).toBe(8_274);
    expect(capScore(1_150_000, 12_220, 5)).toBe(4_706);
    // A slope of H or more pays the cap from the threshold.
    expect(capScore(1_150_000, 50_000, 5)).toBe(1_150);
    expect(capScore(1_150_000, 50_000, 1)).toBe(1_150);
  });
});
