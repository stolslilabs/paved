import { describe, it, expect } from "vitest";
import { Tournament, TournamentData } from "../src/models/tournament";

function makeTournamentData(overrides: Partial<TournamentData> = {}): TournamentData {
  return {
    id: 100,
    prize: 6000,
    top1_player_id: 1,
    top2_player_id: 2,
    top3_player_id: 3,
    top1_score: 5000,
    top2_score: 4000,
    top3_score: 3000,
    top1_multiplier_fp: 1000000,
    top2_multiplier_fp: 1000000,
    top3_multiplier_fp: 1000000,
    top1_claimed: false,
    top2_claimed: false,
    top3_claimed: false,
    ...overrides,
  };
}

describe("Tournament", () => {
  describe("constructor", () => {
    it("converts fields correctly", () => {
      const t = new Tournament(makeTournamentData());
      expect(t.id).toBe(100);
      expect(t.prize).toBe("6000");
      expect(t.top1_player_id).toBe("0x1");
      expect(t.top2_player_id).toBe("0x2");
      expect(t.top3_player_id).toBe("0x3");
      expect(t.top1_score).toBe(5000);
      expect(t.top2_score).toBe(4000);
      expect(t.top3_score).toBe(3000);
      expect((t as any).top1_multiplier_fp).toBe(1000000);
      expect((t as any).top2_multiplier_fp).toBe(1000000);
      expect((t as any).top3_multiplier_fp).toBe(1000000);
    });
  });

  describe("reward()", () => {
    it("reward(3) = prize / 6", () => {
      const t = new Tournament(makeTournamentData({ prize: 6000 }));
      expect(t.reward(3)).toBe(1000);
    });

    it("reward(2) = (prize - reward(3)) / 3", () => {
      const t = new Tournament(makeTournamentData({ prize: 6000 }));
      const third = t.reward(3); // 1000
      const expected = (6000 - third) / 3; // (6000 - 1000) / 3 = 5000/3
      expect(t.reward(2)).toBeCloseTo(expected);
    });

    it("reward(1) = prize - reward(2) - reward(3)", () => {
      const t = new Tournament(makeTournamentData({ prize: 6000 }));
      const second = t.reward(2);
      const third = t.reward(3);
      expect(t.reward(1)).toBeCloseTo(6000 - second - third);
    });

    it("reward distribution sums to prize", () => {
      const t = new Tournament(makeTournamentData({ prize: 6000 }));
      const total = t.reward(1) + t.reward(2) + t.reward(3);
      expect(total).toBeCloseTo(6000);
    });

    it("reward(4) returns 0", () => {
      const t = new Tournament(makeTournamentData());
      expect(t.reward(4)).toBe(0);
    });

    it("reward(0) returns 0", () => {
      const t = new Tournament(makeTournamentData());
      expect(t.reward(0)).toBe(0);
    });

    it("when top2_player_id is 0, reward(2) returns 0", () => {
      const t = new Tournament(makeTournamentData({ top2_player_id: 0 }));
      expect(t.reward(2)).toBe(0);
    });

    it("when top3_player_id is 0, reward(3) returns 0", () => {
      const t = new Tournament(makeTournamentData({ top3_player_id: 0 }));
      expect(t.reward(3)).toBe(0);
    });

    it("when top2 and top3 are 0, winner gets full prize", () => {
      const t = new Tournament(makeTournamentData({
        prize: 6000,
        top2_player_id: 0,
        top3_player_id: 0,
      }));
      expect(t.reward(1)).toBe(6000);
      expect(t.reward(2)).toBe(0);
      expect(t.reward(3)).toBe(0);
    });
  });

  describe("rewardWithMultiplier()", () => {
    it("applies rank multiplier to base rank reward", () => {
      const t = new Tournament(makeTournamentData({
        prize: 6000,
        top1_multiplier_fp: 1250000,
      } as any));

      expect((t as any).rewardWithMultiplier(1)).toBeCloseTo(t.reward(1) * 1.25);
    });
  });

  describe("isClaimed()", () => {
    it("rank 1 returns top1_claimed", () => {
      const t1 = new Tournament(makeTournamentData({ top1_claimed: true }));
      expect(t1.isClaimed(1)).toBe(true);

      const t2 = new Tournament(makeTournamentData({ top1_claimed: false }));
      expect(t2.isClaimed(1)).toBe(false);
    });

    it("rank 2 returns top2_claimed", () => {
      const t1 = new Tournament(makeTournamentData({ top2_claimed: true }));
      expect(t1.isClaimed(2)).toBe(true);

      const t2 = new Tournament(makeTournamentData({ top2_claimed: false }));
      expect(t2.isClaimed(2)).toBe(false);
    });

    it("rank 3 returns top3_claimed", () => {
      const t1 = new Tournament(makeTournamentData({ top3_claimed: true }));
      expect(t1.isClaimed(3)).toBe(true);

      const t2 = new Tournament(makeTournamentData({ top3_claimed: false }));
      expect(t2.isClaimed(3)).toBe(false);
    });

    it("rank 4 or higher returns false", () => {
      const t = new Tournament(makeTournamentData({
        top1_claimed: true,
        top2_claimed: true,
        top3_claimed: true,
      }));
      expect(t.isClaimed(4)).toBe(false);
      expect(t.isClaimed(0)).toBe(false);
    });
  });
});
