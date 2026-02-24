import { describe, it, expect } from "vitest";
import { toRenderCharacters, buildCharQuery } from "../src/utils/char-helpers";

describe("buildCharQuery", () => {
  it("returns correct SQL for gameId", () => {
    expect(buildCharQuery(42)).toBe("SELECT * FROM [paved-Char] WHERE game_id = 42");
  });

  it("handles gameId 0", () => {
    expect(buildCharQuery(0)).toBe("SELECT * FROM [paved-Char] WHERE game_id = 0");
  });
});

describe("toRenderCharacters", () => {
  it("returns empty array for empty input", () => {
    expect(toRenderCharacters([], new Map())).toEqual([]);
  });

  it("converts single char row with matching tile", () => {
    const tileMap = new Map([[5, { worldX: 2, worldZ: -1 }]]);
    const rows = [{
      game_id: 1,
      player_id: "0x123",
      index: 1,       // character index (maps to Lord role)
      tile_id: 5,
      spot: 1,         // Center
      weight: 1,
      power: 1,
    }];
    const result = toRenderCharacters(rows, tileMap as any);
    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe(1);
    expect(result[0].playerId).toBe("0x123");
    expect(result[0].index).toBe(1);
    expect(result[0].tileId).toBe(5);
    expect(result[0].spot).toBe(1);
    expect(result[0].worldX).toBeCloseTo(2);  // Center offset = 0
    expect(result[0].worldZ).toBeCloseTo(-1); // Center offset = 0
    expect(result[0].color).toBe("blue");     // character 1 = blue
  });

  it("filters out char rows with missing tiles", () => {
    const tileMap = new Map(); // empty - no tiles
    const rows = [{ game_id: 1, player_id: "0x1", index: 1, tile_id: 99, spot: 1, weight: 1, power: 1 }];
    expect(toRenderCharacters(rows, tileMap as any)).toEqual([]);
  });

  it("sets color from getColorFromCharacter", () => {
    const tileMap = new Map([[1, { worldX: 0, worldZ: 0 }]]);
    const rows = [
      { game_id: 1, player_id: "0x1", index: 3, tile_id: 1, spot: 1, weight: 1, power: 1 }, // char 3 = grey
    ];
    const result = toRenderCharacters(rows, tileMap as any);
    expect(result[0].color).toBe("grey");
  });

  it("computes world position with spot offset", () => {
    const tileMap = new Map([[1, { worldX: 0, worldZ: 0 }]]);
    const rows = [
      { game_id: 1, player_id: "0x1", index: 1, tile_id: 1, spot: 5, weight: 1, power: 1 }, // East
    ];
    const result = toRenderCharacters(rows, tileMap as any);
    expect(result[0].worldX).toBeCloseTo(1/3);  // East dx
    expect(result[0].worldZ).toBeCloseTo(0);
  });

  it("handles multiple chars on different tiles", () => {
    const tileMap = new Map([
      [1, { worldX: 0, worldZ: 0 }],
      [2, { worldX: 1, worldZ: -1 }],
    ]);
    const rows = [
      { game_id: 1, player_id: "0x1", index: 1, tile_id: 1, spot: 1, weight: 1, power: 1 },
      { game_id: 1, player_id: "0x1", index: 2, tile_id: 2, spot: 3, weight: 1, power: 1 }, // North
    ];
    const result = toRenderCharacters(rows, tileMap as any);
    expect(result).toHaveLength(2);
    expect(result[0].tileId).toBe(1);
    expect(result[1].tileId).toBe(2);
    expect(result[1].worldZ).toBeCloseTo(-1 - 1/3); // North offset
  });
});
