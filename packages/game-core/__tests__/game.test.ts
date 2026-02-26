import { describe, it, expect } from "vitest";
import { Game, GameData } from "../src/models/game";
import { ModeType } from "../src/types/mode";

function makeGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    id: 1,
    over: false,
    built: 5,
    discarded: 2,
    tiles: 0,
    tile_count: 10,
    start_time: 1700000000,
    end_time: 1700086400,
    score: 1500,
    seed: 12345,
    mode: 1, // Daily
    tournament_id: 42,
    entry_multiplier_fp: 1000000,
    entry_supply_snapshot: 1000000000000000000n,
    entry_target_snapshot: 2000000000000000000n,
    ...overrides,
  };
}

describe("Game", () => {
  describe("constructor", () => {
    it("converts raw data correctly", () => {
      const data = makeGameData();
      const game = new Game(data);

      expect(game.id).toBe(1);
      expect(game.over).toBe(false);
      expect(game.built).toBe(5);
      expect(game.discarded).toBe(2);
      expect(game.tiles).toBe(0n);
      expect(game.tile_count).toBe(10);
      expect(game.score).toBe(1500);
      expect(game.tournament_id).toBe(42n);
    });

    it("converts start_time and end_time to Date objects", () => {
      const game = new Game(makeGameData());
      expect(game.start_time).toBeInstanceOf(Date);
      expect(game.end_time).toBeInstanceOf(Date);
      expect(game.start_time.getTime()).toBe(1700000000 * 1000);
      expect(game.end_time.getTime()).toBe(1700086400 * 1000);
    });

    it("converts seed to hex string", () => {
      const game = new Game(makeGameData({ seed: 255 }));
      expect(game.seed).toBe("ff");
    });

    it("converts tiles to bigint", () => {
      const game = new Game(makeGameData({ tiles: "123456789" }));
      expect(game.tiles).toBe(123456789n);
    });

    it("stores entry economy snapshot fields", () => {
      const game = new Game(makeGameData({
        entry_multiplier_fp: 1250000,
        entry_supply_snapshot: 4200000000000000000n,
        entry_target_snapshot: 5000000000000000000n,
      } as any));

      expect((game as any).entry_multiplier_fp).toBe(1250000);
      expect((game as any).entry_supply_snapshot).toBe("4200000000000000000");
      expect((game as any).entry_target_snapshot).toBe("5000000000000000000");
    });

    it("mode is set from index", () => {
      const game = new Game(makeGameData({ mode: 1 }));
      expect(game.mode.value).toBe(ModeType.Daily);
    });

    it("mode Weekly from index 2", () => {
      const game = new Game(makeGameData({ mode: 2 }));
      expect(game.mode.value).toBe(ModeType.Weekly);
    });
  });

  describe("isOver()", () => {
    it("returns true when over=true", () => {
      const game = new Game(makeGameData({ over: true }));
      expect(game.isOver()).toBe(true);
    });

    it("returns false when over=false", () => {
      const game = new Game(makeGameData({ over: false }));
      expect(game.isOver()).toBe(false);
    });
  });

  describe("tilesLeft()", () => {
    it("returns mode.count() - tile_count for Daily", () => {
      const game = new Game(makeGameData({ mode: 1, tile_count: 10 }));
      // Daily count is 38
      expect(game.tilesLeft()).toBe(38 - 10);
    });

    it("returns mode.count() - tile_count for Weekly", () => {
      const game = new Game(makeGameData({ mode: 2, tile_count: 20 }));
      // Weekly count is 72
      expect(game.tilesLeft()).toBe(72 - 20);
    });

    it("returns 0 when all tiles used", () => {
      const game = new Game(makeGameData({ mode: 1, tile_count: 38 }));
      expect(game.tilesLeft()).toBe(0);
    });
  });

  describe("getPlans()", () => {
    it("when tiles=0n all 72 tiles available", () => {
      const game = new Game(makeGameData({ tiles: 0n, mode: 2 }));
      const plans = game.getPlans();
      // tiles=0 means all bits are 0, so all tiles are available
      const totalCount = plans.reduce((sum, p) => sum + p.count, 0);
      expect(totalCount).toBe(72);
    });

    it("when all bits set, no tiles available", () => {
      // 72 bits all set to 1
      const allOnes = (1n << 72n) - 1n;
      const game = new Game(makeGameData({ tiles: allOnes, mode: 2 }));
      const plans = game.getPlans();
      expect(plans).toHaveLength(0);
    });

    it("returns plans with correct structure", () => {
      const game = new Game(makeGameData({ tiles: 0n, mode: 2 }));
      const plans = game.getPlans();
      for (const entry of plans) {
        expect(entry).toHaveProperty("plan");
        expect(entry).toHaveProperty("count");
        expect(entry.count).toBeGreaterThan(0);
        expect(entry.plan.into()).toBeGreaterThan(0); // non-None
      }
    });

    it("partially consumed deck has fewer tiles", () => {
      // Set first 10 bits to mark those tiles as used
      const tiles = (1n << 10n) - 1n; // bits 0-9 set
      const game = new Game(makeGameData({ tiles, mode: 2 }));
      const plans = game.getPlans();
      const totalCount = plans.reduce((sum, p) => sum + p.count, 0);
      expect(totalCount).toBe(72 - 10);
    });
  });
});
