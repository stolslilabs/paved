import { describe, it, expect } from "vitest";
import {
  parseGameRow,
  splitGames,
  parseLeaderboardRow,
  parseTournamentRow,
  formatTimeRemaining,
  formatEntryFee,
} from "../src/utils/landing-helpers";

describe("parseGameRow", () => {
  it("converts raw SQL row to PlayerGame object", () => {
    const row = {
      id: "42",
      mode: "1",
      score: "1200",
      built: "15",
      tile_count: "38",
      over: false,
      start_time: "1700000000",
    };
    const result = parseGameRow(row);
    expect(result).toEqual({
      gameId: 42,
      mode: "daily",
      score: 1200,
      tilesPlaced: 15,
      totalTiles: 38,
      isOver: false,
      startTime: 1700000000,
    });
  });

  it("maps mode index 2 to weekly", () => {
    const row = { id: "1", mode: "2", score: "0", built: "0", tile_count: "72", over: false, start_time: "0" };
    expect(parseGameRow(row).mode).toBe("weekly");
  });

  it("maps mode index 3 to tutorial", () => {
    const row = { id: "1", mode: "3", score: "0", built: "0", tile_count: "9", over: false, start_time: "0" };
    expect(parseGameRow(row).mode).toBe("tutorial");
  });

  it("marks over=true games correctly", () => {
    const row = { id: "1", mode: "1", score: "500", built: "38", tile_count: "38", over: true, start_time: "0" };
    expect(parseGameRow(row).isOver).toBe(true);
  });
});

describe("splitGames", () => {
  const active1 = { gameId: 10, mode: "daily", score: 100, tilesPlaced: 5, totalTiles: 38, isOver: false, startTime: 0 };
  const active2 = { gameId: 20, mode: "weekly", score: 200, tilesPlaced: 10, totalTiles: 72, isOver: false, startTime: 0 };
  const completed1 = { gameId: 5, mode: "daily", score: 500, tilesPlaced: 38, totalTiles: 38, isOver: true, startTime: 0 };

  it("separates active and completed games", () => {
    const { activeGames, completedGames } = splitGames([active1, completed1, active2]);
    expect(activeGames).toHaveLength(2);
    expect(completedGames).toHaveLength(1);
  });

  it("sorts active games by gameId descending", () => {
    const { activeGames } = splitGames([active1, active2]);
    expect(activeGames[0].gameId).toBe(20);
    expect(activeGames[1].gameId).toBe(10);
  });

  it("returns empty arrays for empty input", () => {
    const { activeGames, completedGames } = splitGames([]);
    expect(activeGames).toEqual([]);
    expect(completedGames).toEqual([]);
  });
});

describe("parseLeaderboardRow", () => {
  it("converts raw player row to LeaderboardEntry", () => {
    const row = { id: "0x123", name: "0x5061766564", score: "9999" };
    const result = parseLeaderboardRow(row, 1);
    expect(result).toEqual({
      rank: 1,
      name: "Paved",
      score: 9999,
    });
  });
});

describe("parseTournamentRow", () => {
  it("converts raw tournament row to TournamentInfo", () => {
    const row = {
      id: "100",
      prize: "5000000000000000000",
      top1_player_id: "0x1",
      top1_score: "800",
      top2_player_id: "0x2",
      top2_score: "600",
      top3_player_id: "0x3",
      top3_score: "400",
      top1_multiplier_fp: "1250000",
      top2_multiplier_fp: "1000000",
      top3_multiplier_fp: "900000",
    };
    const playerNames: Record<string, string> = {
      "0x1": "Alice",
      "0x2": "Bob",
      "0x3": "Charlie",
    };
    const result = parseTournamentRow(row, playerNames);
    expect(result.prizePool).toBe("5");
    expect(result.topPlayers).toEqual([
      { name: "Alice", score: 800 },
      { name: "Bob", score: 600 },
      { name: "Charlie", score: 400 },
    ]);
    expect(result.rewardPreview).toEqual([
      { rank: 1, baseLabel: "2.78", multiplierLabel: "1.25x", adjustedLabel: "3.47" },
      { rank: 2, baseLabel: "1.39", multiplierLabel: "1x", adjustedLabel: "1.39" },
      { rank: 3, baseLabel: "0.83", multiplierLabel: "0.9x", adjustedLabel: "0.75" },
    ]);
  });
});

describe("formatTimeRemaining", () => {
  it("shows hours and minutes for active tournaments", () => {
    const now = Math.floor(Date.now() / 1000);
    const endTime = now + 2 * 3600 + 30 * 60; // 2h 30m from now
    const result = formatTimeRemaining(endTime);
    expect(result).toMatch(/2h\s*30m/);
  });

  it("shows 'Ended' for expired tournaments", () => {
    const pastTime = Math.floor(Date.now() / 1000) - 100;
    expect(formatTimeRemaining(pastTime)).toBe("Ended");
  });

  it("shows days when more than 24h remaining", () => {
    const now = Math.floor(Date.now() / 1000);
    const endTime = now + 2 * 86400 + 3600; // 2d 1h from now
    const result = formatTimeRemaining(endTime);
    expect(result).toMatch(/2d/);
  });
});

describe("formatEntryFee", () => {
  it("shows 'Free' for zero price", () => {
    expect(formatEntryFee(BigInt(0))).toBe("Free");
  });

  it("shows '1 ETH' for 1e18", () => {
    expect(formatEntryFee(BigInt("1000000000000000000"))).toBe("1 ETH");
  });

  it("shows fractional ETH for smaller amounts", () => {
    expect(formatEntryFee(BigInt("500000000000000000"))).toBe("0.5 ETH");
  });
});
