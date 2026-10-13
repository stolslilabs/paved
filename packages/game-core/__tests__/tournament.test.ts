import { describe, it, expect, vi, afterEach } from "vitest";
import { Tournament, TournamentData } from "../src/models/tournament";
import { Mode } from "../src/types/mode";

function makeTournamentData(overrides: Partial<TournamentData> = {}): TournamentData {
  return {
    id: 100,
    top1_player_id: 1,
    top2_player_id: 2,
    top3_player_id: 3,
    top1_score: 5000,
    top2_score: 4000,
    top3_score: 3000,
    ...overrides,
  };
}

describe("Tournament", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("converts fields correctly", () => {
      const t = new Tournament(makeTournamentData());
      expect(t.id).toBe(100);
      expect(t.top1_player_id).toBe("0x1");
      expect(t.top2_player_id).toBe("0x2");
      expect(t.top3_player_id).toBe("0x3");
      expect(t.top1_score).toBe(5000);
      expect(t.top2_score).toBe(4000);
      expect(t.top3_score).toBe(3000);
    });

    it("keeps no prize, multiplier or claim (D-20)", () => {
      const t = new Tournament(makeTournamentData()) as unknown as Record<string, unknown>;
      for (const key of ["prize", "top1_claimed", "top1_multiplier_fp", "reward", "isClaimable"]) {
        expect(t[key], key).toBeUndefined();
      }
    });
  });

  describe("the day", () => {
    it("computeId is the current time over the duration", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(100 * 86400 * 1000 + 5000));
      expect(Tournament.computeId(86400)).toBe(100);
    });

    it("isCurrent on its day, isOver after it", () => {
      vi.useFakeTimers();
      const mode = { duration: () => 86400 } as unknown as Mode;
      const t = new Tournament(makeTournamentData({ id: 100 }));
      vi.setSystemTime(new Date(100 * 86400 * 1000 + 5000));
      expect(t.isCurrent(mode)).toBe(true);
      expect(t.isOver(mode)).toBe(false);
      vi.setSystemTime(new Date(101 * 86400 * 1000));
      expect(t.isCurrent(mode)).toBe(false);
      expect(t.isOver(mode)).toBe(true);
    });
  });
});
