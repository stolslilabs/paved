import { afterEach, describe, expect, it } from "vitest";
import { rewardMarks } from "../src/components/containers/reward-estimate";
import { flushPending } from "./lazy-chunks";

// Each test's pending timers and effects run before its tree is unmounted (`lazy-chunks.ts`).
afterEach(flushPending);

describe("RewardEstimate rows (#705)", () => {
  it("leaves out the steps at or past the cap's score", () => {
    expect(rewardMarks(1_150_000, 12_220, 5)).toEqual([
      { score: 1150, capped: false },
      { score: 1438, capped: false },
      { score: 1725, capped: false },
      { score: 2300, capped: false },
      { score: 4706, capped: true },
    ]);
    // c 3: the cap from 1,917, before 2x the threshold.
    expect(rewardMarks(1_150_000, 30_000, 5)).toEqual([
      { score: 1150, capped: false },
      { score: 1438, capped: false },
      { score: 1725, capped: false },
      { score: 1917, capped: true },
    ]);
    // c of H or more: the cap from the threshold, one row.
    expect(rewardMarks(1_150_000, 50_000, 5)).toEqual([{ score: 1150, capped: true }]);
  });
});
