import { describe, expect, it } from "vitest";
import {
  mapLandingTokenPanel,
  mapGameEconomySnapshot,
  buildRewardPreview,
} from "../src/utils/economy-ui";

describe("economy ui mappers", () => {
  it("maps landing token panel props", () => {
    expect(mapLandingTokenPanel({
      balance: 1230000000000000000n,
      supportsMint: true,
      mintLoading: false,
      mintError: null,
    })).toEqual({
      balanceLabel: "1.23",
      supportsMint: true,
      isMinting: false,
      error: null,
    });
  });

  it("maps game snapshot model", () => {
    expect(mapGameEconomySnapshot({
      entry_multiplier_fp: 1250000,
      entry_supply_snapshot: "4200000000000000000",
      entry_target_snapshot: "5000000000000000000",
    })).toEqual({
      multiplierLabel: "1.25x",
      supplyLabel: "4.2",
      targetLabel: "5",
      warning: null,
    });
  });

  it("falls back to observed token supply when snapshot supply is zero", () => {
    expect(mapGameEconomySnapshot({
      entry_multiplier_fp: 2000000,
      entry_supply_snapshot: "0",
      entry_target_snapshot: "1000000000000000000",
      observedTokenSupply: "1999999000000000000000000",
    })).toEqual({
      multiplierLabel: "2x",
      supplyLabel: "1999999",
      targetLabel: "1",
      warning: "Economy snapshot supply is zero; using observed token supply.",
    });
  });

  it("computes adjusted reward preview from base payout and multiplier", () => {
    expect(buildRewardPreview({ baseReward: 1000, multiplierFp: 1250000 })).toEqual({
      baseLabel: "1000",
      multiplierLabel: "1.25x",
      adjustedLabel: "1250",
    });
  });
});
