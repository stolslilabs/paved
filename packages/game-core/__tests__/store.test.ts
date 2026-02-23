import { describe, it, expect } from "vitest";
import { Store, Tiles } from "../src/store";
import { Tile, TileData } from "../src/models/tile";

function makeTileData(overrides: Partial<TileData> = {}): TileData {
  return {
    game_id: 1,
    id: 1,
    player_id: 123,
    plan: 9,
    orientation: 1,
    x: 0,
    y: 0,
    occupied_spot: 0,
    ...overrides,
  };
}

describe("Store", () => {
  describe("getTileById()", () => {
    it("looks up tile by gameId-tileId key", () => {
      const tile = new Tile(makeTileData({ game_id: 1, id: 5 }));
      const tiles: Tiles = { "1-5": tile };
      const store = new Store(1, tiles);

      expect(store.getTileById(5)).toBe(tile);
    });

    it("returns undefined for missing tileId", () => {
      const tiles: Tiles = {};
      const store = new Store(1, tiles);

      expect(store.getTileById(99)).toBeUndefined();
    });

    it("does not return tiles from a different gameId", () => {
      const tile = new Tile(makeTileData({ game_id: 2, id: 5 }));
      const tiles: Tiles = { "2-5": tile };
      const store = new Store(1, tiles);

      expect(store.getTileById(5)).toBeUndefined();
    });
  });

  describe("getTileByPosition()", () => {
    it("looks up tile by gameId-x-y key", () => {
      const tile = new Tile(makeTileData({ game_id: 1, x: 3, y: 4 }));
      const tiles: Tiles = { "1-3-4": tile };
      const store = new Store(1, tiles);

      expect(store.getTileByPosition(3, 4)).toBe(tile);
    });

    it("returns undefined for missing position", () => {
      const tiles: Tiles = {};
      const store = new Store(1, tiles);

      expect(store.getTileByPosition(0, 0)).toBeUndefined();
    });

    it("handles negative coordinates", () => {
      const tile = new Tile(makeTileData({ game_id: 1, x: -1, y: -2 }));
      const tiles: Tiles = { "1--1--2": tile };
      const store = new Store(1, tiles);

      expect(store.getTileByPosition(-1, -2)).toBe(tile);
    });

    it("does not return tiles from different position", () => {
      const tile = new Tile(makeTileData({ game_id: 1, x: 0, y: 0 }));
      const tiles: Tiles = { "1-0-0": tile };
      const store = new Store(1, tiles);

      expect(store.getTileByPosition(1, 1)).toBeUndefined();
    });
  });

  describe("constructor", () => {
    it("stores gameId and tiles", () => {
      const tiles: Tiles = {};
      const store = new Store(42, tiles);
      expect(store.gameId).toBe(42);
      expect(store.tiles).toBe(tiles);
    });
  });
});
