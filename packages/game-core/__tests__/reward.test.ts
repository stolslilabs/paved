import { describe, expect, it } from "vitest";
import { capScore, estimateReward, guarded, payout, referenceReward, vaultSplit, winningScore, REWARD_RATE_SCALE, type RewardInputs } from "../src/reward";

// The expected values are those of the contracts' own tests of `curve` (`contracts/src/tests/economy/curve.cairo`), or
// computed by hand from the Cairo functions with their rounding down.

const PAVED = 10n ** 18n;

describe("the curve mirror", () => {
  it("splits a swap by input, the Vault's part rounded down (vault_split)", () => {
    expect(vaultSplit(1_000n, 7n, 3n)).toEqual([700n, 300n]);
    // 1,001 x 3 / 10 = 300.3: the Vault gets 300, the burn the rest
    expect(vaultSplit(1_001n, 7n, 3n)).toEqual([701n, 300n]);
    expect(vaultSplit(500n, 0n, 0n)).toEqual([500n, 0n]);
  });

  it("guards the PAVED counted at 110 % of quote x rate (guarded)", () => {
    const rate = 80n * REWARD_RATE_SCALE;
    expect(guarded(800n, 10n, rate)).toBe(800n);
    expect(guarded(880n, 10n, rate)).toBe(880n);
    expect(guarded(881n, 10n, rate)).toBe(880n);
    expect(guarded(2_000n, 10n, rate)).toBe(880n);
    expect(guarded(2_000n, 10n, 0n)).toBe(2_000n);
  });

  it("boosts by the stake and scales by F (reference)", () => {
    const bought = 1_000n * PAVED;
    expect(referenceReward(bought, 1, 10_000)).toBe(1_010n * PAVED);
    expect(referenceReward(bought, 10, 10_000)).toBe(1_100n * PAVED);
    expect(referenceReward(bought, 10, 20_000)).toBe(2_200n * PAVED);
    expect(referenceReward(bought, 3, 9_000)).toBe(927n * PAVED);
    expect(referenceReward(bought, 3, 0)).toBe(0n);
  });

  it("pays 0 below the threshold, c x R at it, linearly above, capped at H x R (payout)", () => {
    const r = 1_000n * PAVED;
    expect(payout(r, 0, 3_000_000, 18_130, 5)).toBe(0n);
    expect(payout(r, 2_999, 3_000_000, 18_130, 5)).toBe(0n);
    expect(payout(r, 3_000, 3_000_000, 18_130, 5)).toBe(1_813n * PAVED);
    expect(payout(r, 4_500, 3_000_000, 18_130, 5)).toBe(2_719_500_000_000_000_000_000n);
    expect(payout(r, 4_000, 3_353_500, 18_130, 5)).toBe(2_162_516_773_520_202_773_222n);
    expect(payout(r, 8_273, 3_000_000, 18_130, 5)).toBe(4_999_649_666_666_666_666_666n);
    expect(payout(r, 8_274, 3_000_000, 18_130, 5)).toBe(5_000n * PAVED);
    expect(payout(r, 100_000, 3_000_000, 18_130, 5)).toBe(5_000n * PAVED);
  });

  it("finds the least winning score and the least capped score", () => {
    expect(winningScore(3_000_000)).toBe(3_000);
    expect(winningScore(3_353_500)).toBe(3_354);
    // 5 x 3,000 / 1.813 = 8,273.03: the cap from 8,274, as payout's own test
    expect(capScore(3_000_000, 18_130, 5)).toBe(8_274);
    // A cap below c: the cap from the winning score itself
    expect(capScore(3_000_000, 18_130, 1)).toBe(3_000);
  });

  it("finds the cap's score exactly, for any R", () => {
    for (const r of [1n, 7n, 999n, 1_234_567n * PAVED]) {
      for (const [t, c, h] of [[3_000_000, 18_130, 5], [3_353_500, 12_220, 5], [1_234_567, 12_220, 2]] as const) {
        const s = capScore(t, c, h);
        expect(payout(r, s, t, c, h)).toBe(r * BigInt(h));
        if (s > winningScore(t)) expect(payout(r, s - 1, t, c, h)).toBeLessThan(r * BigInt(h));
      }
    }
  });
});

describe("estimateReward", () => {
  // Stake 1: a price of 1 USDC, 70 % burn quote, swapped whole (no referrer) for 80 PAVED per USDC; the guard's rate is
  // the same ratio, so 70 % of 80 = 56 PAVED is bought by the burn's part, under its 110 % guard (61.6).
  const base: RewardInputs = {
    stake: 1,
    threshold: 3_000_000,
    slopeBps: 12_220,
    cap: 5,
    factorBps: 10_000,
    burnQuote: 700_000n,
    swapIn: 1_000_000n,
    poolOut: 80n * PAVED,
    rate: (80n * PAVED * REWARD_RATE_SCALE) / 1_000_000n,
  };

  it("builds R from the burn's part of the swap, guarded, boosted and scaled", () => {
    const estimate = estimateReward(base);
    expect(estimate.bought).toBe(56n * PAVED);
    expect(estimate.guardBinds).toBe(false);
    // 56 x 1.01 x 1.0
    expect(estimate.reference).toBe(5_656n * 10n ** 16n);
    expect(estimate.capReward).toBe(5n * 5_656n * 10n ** 16n);
  });

  it("shows the threshold and its multiples, each the contract's payout", () => {
    const estimate = estimateReward(base);
    const r = estimate.reference;
    expect(estimate.rows.map((row) => row.score)).toEqual([3_000, 3_750, 4_500, 6_000]);
    // At the threshold: c x R; at 2x: 2c x R
    expect(estimate.rows[0]!.reward).toBe((r * 12_220n) / 10_000n);
    expect(estimate.rows[3]!.reward).toBe((r * 2n * 12_220n) / 10_000n);
    for (const row of estimate.rows) expect(row.reward).toBe(payout(r, row.score, 3_000_000, 12_220, 5));
    // 5 x 3,000 / 1.222 = 12,274.95
    expect(estimate.capScore).toBe(12_275);
  });

  it("rounds a fractional threshold's scores up to whole points", () => {
    const estimate = estimateReward({ ...base, threshold: 3_353_500 });
    // 3,353.5; x 1.25 = 4,191.875; x 1.5 = 5,030.25; x 2 = 6,707
    expect(estimate.rows.map((row) => row.score)).toEqual([3_354, 4_192, 5_031, 6_707]);
  });

  it("drops the multiples at or past the cap's score", () => {
    // c = 1.222, H = 2: the cap from 2 / 1.222 = 1.637x the threshold, 4,910
    const estimate = estimateReward({ ...base, cap: 2 });
    expect(estimate.capScore).toBe(4_910);
    expect(estimate.rows.map((row) => row.score)).toEqual([3_000, 3_750, 4_500]);
    expect(estimate.capReward).toBe(estimate.reference * 2n);
  });

  it("counts at most 110 % of the burn quote at the guard's rate when the pool pays more", () => {
    // The pool pays 100 PAVED per USDC; the burn's part, 70 PAVED, is guarded at 0.7 x 80 x 1.1 = 61.6 PAVED
    const estimate = estimateReward({ ...base, poolOut: 100n * PAVED });
    expect(estimate.bought).toBe(70n * PAVED);
    expect(estimate.guardBinds).toBe(true);
    expect(estimate.reference).toBe((616n * 10n ** 17n * 10_100n) / 10_000n);
  });

  it("counts the whole burn's part without a guard rate", () => {
    const estimate = estimateReward({ ...base, poolOut: 100n * PAVED, rate: 0n });
    expect(estimate.guardBinds).toBe(false);
    expect(estimate.reference).toBe(707n * 10n ** 17n);
  });

  it("splits a referred purchase's swap by its own input", () => {
    // A referral of 5 % leaves 0.95 USDC to swap: the burn's 0.7 of it buys 7 / 9.5 of the pool's PAVED
    const estimate = estimateReward({ ...base, swapIn: 950_000n, poolOut: 76n * PAVED });
    expect(estimate.bought).toBe(76n * PAVED - (76n * PAVED * 250_000n) / 950_000n);
    expect(estimate.bought).toBe(56n * PAVED);
  });

  it("boosts R with the stake and F", () => {
    const estimate = estimateReward({ ...base, stake: 10, factorBps: 15_000, burnQuote: 7_000_000n, swapIn: 10_000_000n, poolOut: 800n * PAVED, rate: base.rate });
    // 560 x 1.1 x 1.5
    expect(estimate.reference).toBe(924n * PAVED);
  });
});
