import { describe, expect, test } from "vitest";
import { toGame, toTournament } from "../src/models/adapters";

describe("model adapters economy mapping", () => {
  test("maps game economy snapshot fields", () => {
    const game = toGame({
      id: 7,
      mode: 1,
      tiles: 0,
      seed: 1,
      tournament_id: 77,
      entry_multiplier_fp: 1250000,
      entry_supply_snapshot: "4200000000000000000",
      entry_target_snapshot: "5000000000000000000",
    });

    expect((game as any).entry_multiplier_fp).toBe(1250000);
    expect((game as any).entry_supply_snapshot).toBe("4200000000000000000");
    expect((game as any).entry_target_snapshot).toBe("5000000000000000000");
  });

  test("maps tournament multiplier fields", () => {
    const tournament = toTournament({
      id: 1,
      prize: 6000,
      top1_player_id: 1,
      top2_player_id: 2,
      top3_player_id: 3,
      top1_score: 100,
      top2_score: 90,
      top3_score: 80,
      top1_claimed: false,
      top2_claimed: false,
      top3_claimed: false,
      top1_multiplier_fp: 1100000,
      top2_multiplier_fp: 900000,
      top3_multiplier_fp: 800000,
    });

    expect((tournament as any).top1_multiplier_fp).toBe(1100000);
    expect((tournament as any).top2_multiplier_fp).toBe(900000);
    expect((tournament as any).top3_multiplier_fp).toBe(800000);
  });
});
