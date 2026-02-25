import { describe, it, expect } from "vitest";
import { Tile, TileData } from "../src/models/tile";
import { Direction, DirectionType } from "../src/types/direction";
import { SpotType, Spot } from "../src/types/spot";
import { PlanType } from "../src/types/plan";
import { OrientationType } from "../src/types/orientation";
import { CategoryType } from "../src/types/category";

function makeTileData(overrides: Partial<TileData> = {}): TileData {
  return {
    game_id: 1,
    id: 1,
    player_id: 123,
    plan: 9, // RFFFRFCFR
    orientation: 1, // North
    x: 0,
    y: 0,
    occupied_spot: 0, // None
    ...overrides,
  };
}

describe("Tile", () => {
  describe("constructor", () => {
    it("converts raw data correctly", () => {
      const tile = new Tile(makeTileData());
      expect(tile.gameId).toBe(1);
      expect(tile.id).toBe(1);
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(0);
    });

    it("converts player_id to hex string", () => {
      const tile = new Tile(makeTileData({ player_id: 255 }));
      expect(tile.playerId).toBe("ff");
    });

    it("sets plan from index", () => {
      const tile = new Tile(makeTileData({ plan: 9 }));
      expect(tile.plan.value).toBe(PlanType.RFFFRFCFR);
    });

    it("sets orientation from index", () => {
      const tile = new Tile(makeTileData({ orientation: 1 }));
      expect(tile.orientation.value).toBe(OrientationType.North);
    });

    it("sets occupied spot from index", () => {
      const tile = new Tile(makeTileData({ occupied_spot: 0 }));
      expect(tile.occupiedSpot.value).toBe(SpotType.None);
    });

    it("sets occupied spot Center (index 1)", () => {
      const tile = new Tile(makeTileData({ occupied_spot: 1 }));
      expect(tile.occupiedSpot.value).toBe(SpotType.Center);
    });
  });

  describe("referenceDirection()", () => {
    const baseTile = new Tile(makeTileData({ x: 0, y: 0 }));

    it("returns North when reference is directly above (y+1)", () => {
      const northTile = new Tile(makeTileData({ x: 0, y: 1 }));
      expect(baseTile.referenceDirection(northTile).value).toBe(DirectionType.North);
    });

    it("returns South when reference is directly below (y-1)", () => {
      const southTile = new Tile(makeTileData({ x: 0, y: -1 }));
      expect(baseTile.referenceDirection(southTile).value).toBe(DirectionType.South);
    });

    it("returns East when reference is to the right (x+1)", () => {
      const eastTile = new Tile(makeTileData({ x: 1, y: 0 }));
      expect(baseTile.referenceDirection(eastTile).value).toBe(DirectionType.East);
    });

    it("returns West when reference is to the left (x-1)", () => {
      const westTile = new Tile(makeTileData({ x: -1, y: 0 }));
      expect(baseTile.referenceDirection(westTile).value).toBe(DirectionType.West);
    });

    it("returns None for non-adjacent tile", () => {
      const farTile = new Tile(makeTileData({ x: 2, y: 2 }));
      expect(baseTile.referenceDirection(farTile).value).toBe(DirectionType.None);
    });

    it("returns None for diagonal tile", () => {
      const diagTile = new Tile(makeTileData({ x: 1, y: 1 }));
      expect(baseTile.referenceDirection(diagTile).value).toBe(DirectionType.None);
    });
  });

  describe("getLayout()", () => {
    it("returns a Layout object", () => {
      const tile = new Tile(makeTileData({ plan: 9, orientation: 1 }));
      const layout = tile.getLayout();
      // RFFFRFCFR with North orientation
      expect(layout.center.value).toBe(CategoryType.Road);
      expect(layout.north.value).toBe(CategoryType.Forest);
      expect(layout.east.value).toBe(CategoryType.Road);
      expect(layout.south.value).toBe(CategoryType.City);
      expect(layout.west.value).toBe(CategoryType.Road);
    });
  });

  describe("areConnected()", () => {
    it("returns true for spots in same area", () => {
      // RFFFRFCFR: Center, East, West are all in area A
      const tile = new Tile(makeTileData({ plan: 9, orientation: 1 }));
      const from = new Spot(SpotType.Center);
      const to = new Spot(SpotType.East);
      expect(tile.areConnected(from, to)).toBe(true);
    });

    it("returns true for spots in area B (North, NW, NE)", () => {
      const tile = new Tile(makeTileData({ plan: 9, orientation: 1 }));
      const from = new Spot(SpotType.North);
      const to = new Spot(SpotType.NorthWest);
      expect(tile.areConnected(from, to)).toBe(true);
    });

    it("returns false for spots in different areas", () => {
      // Center (area A) vs South (area D)
      const tile = new Tile(makeTileData({ plan: 9, orientation: 1 }));
      const from = new Spot(SpotType.Center);
      const to = new Spot(SpotType.South);
      expect(tile.areConnected(from, to)).toBe(false);
    });
  });

  describe("isEmpty()", () => {
    it("returns true when occupiedSpot is None", () => {
      const tile = new Tile(makeTileData({ occupied_spot: 0 }));
      expect(tile.isEmpty()).toBe(true);
    });

    it("returns false when occupiedSpot is Center", () => {
      const tile = new Tile(makeTileData({ occupied_spot: 1 }));
      expect(tile.isEmpty()).toBe(false);
    });

    it("returns false when occupiedSpot is North", () => {
      const tile = new Tile(makeTileData({ occupied_spot: 3 }));
      expect(tile.isEmpty()).toBe(false);
    });
  });

  describe("canPlace()", () => {
    it("returns false when no neighbors", () => {
      const tile = new Tile(makeTileData());
      expect(tile.canPlace([])).toBe(false);
    });

    it("returns false when 4 or more neighbors", () => {
      const tile = new Tile(makeTileData());
      const neighbors = [
        new Tile(makeTileData({ x: 0, y: 1 })),
        new Tile(makeTileData({ x: 1, y: 0 })),
        new Tile(makeTileData({ x: 0, y: -1 })),
        new Tile(makeTileData({ x: -1, y: 0 })),
      ];
      expect(tile.canPlace(neighbors)).toBe(false);
    });
  });

  describe("proxyCoordinates()", () => {
    it("returns correct coordinates for all directions", () => {
      const tile = new Tile(makeTileData({ x: 5, y: 5 }));

      expect(tile.proxyCoordinates(new Direction(DirectionType.None))).toEqual([5, 5]);
      expect(tile.proxyCoordinates(new Direction(DirectionType.North))).toEqual([5, 6]);
      expect(tile.proxyCoordinates(new Direction(DirectionType.South))).toEqual([5, 4]);
      expect(tile.proxyCoordinates(new Direction(DirectionType.East))).toEqual([6, 5]);
      expect(tile.proxyCoordinates(new Direction(DirectionType.West))).toEqual([4, 5]);
      expect(tile.proxyCoordinates(new Direction(DirectionType.NorthEast))).toEqual([6, 6]);
      expect(tile.proxyCoordinates(new Direction(DirectionType.NorthWest))).toEqual([4, 6]);
      expect(tile.proxyCoordinates(new Direction(DirectionType.SouthEast))).toEqual([6, 4]);
      expect(tile.proxyCoordinates(new Direction(DirectionType.SouthWest))).toEqual([4, 4]);
    });
  });
});
