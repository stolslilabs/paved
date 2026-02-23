import { describe, it, expect } from "vitest";
import { Spot, SpotType } from "../src/types/spot";
import { OrientationType } from "../src/types/orientation";

describe("Spot", () => {
  describe("into() and from() round-trip", () => {
    const allSpots = [
      { type: SpotType.None, index: 0 },
      { type: SpotType.Center, index: 1 },
      { type: SpotType.NorthWest, index: 2 },
      { type: SpotType.North, index: 3 },
      { type: SpotType.NorthEast, index: 4 },
      { type: SpotType.East, index: 5 },
      { type: SpotType.SouthEast, index: 6 },
      { type: SpotType.South, index: 7 },
      { type: SpotType.SouthWest, index: 8 },
      { type: SpotType.West, index: 9 },
    ];

    it("has 10 values", () => {
      expect(Object.values(SpotType)).toHaveLength(10);
    });

    for (const { type, index } of allSpots) {
      it(`into() returns ${index} for ${type}`, () => {
        expect(new Spot(type).into()).toBe(index);
      });

      it(`from(${index}) returns ${type}`, () => {
        expect(Spot.from(index).value).toBe(type);
      });

      it(`from(${index}).into() === ${index}`, () => {
        expect(Spot.from(index).into()).toBe(index);
      });
    }
  });

  describe("rotate(North) is identity", () => {
    const directionalSpots = [
      SpotType.NorthWest, SpotType.North, SpotType.NorthEast,
      SpotType.East, SpotType.SouthEast, SpotType.South,
      SpotType.SouthWest, SpotType.West, SpotType.Center,
    ];

    for (const spot of directionalSpots) {
      it(`rotate(North) keeps ${spot} as ${spot}`, () => {
        expect(new Spot(spot).rotate(OrientationType.North).value).toBe(spot);
      });
    }
  });

  describe("rotate(East) — 90 degrees clockwise", () => {
    const mappings: [SpotType, SpotType][] = [
      [SpotType.NorthWest, SpotType.NorthEast],
      [SpotType.North, SpotType.East],
      [SpotType.NorthEast, SpotType.SouthEast],
      [SpotType.East, SpotType.South],
      [SpotType.SouthEast, SpotType.SouthWest],
      [SpotType.South, SpotType.West],
      [SpotType.SouthWest, SpotType.NorthWest],
      [SpotType.West, SpotType.North],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Spot(from).rotate(OrientationType.East).value).toBe(to);
      });
    }

    it("Center stays Center", () => {
      expect(new Spot(SpotType.Center).rotate(OrientationType.East).value).toBe(SpotType.Center);
    });
  });

  describe("rotate(South) — 180 degrees", () => {
    const mappings: [SpotType, SpotType][] = [
      [SpotType.NorthWest, SpotType.SouthEast],
      [SpotType.North, SpotType.South],
      [SpotType.NorthEast, SpotType.SouthWest],
      [SpotType.East, SpotType.West],
      [SpotType.SouthEast, SpotType.NorthWest],
      [SpotType.South, SpotType.North],
      [SpotType.SouthWest, SpotType.NorthEast],
      [SpotType.West, SpotType.East],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Spot(from).rotate(OrientationType.South).value).toBe(to);
      });
    }

    it("Center stays Center", () => {
      expect(new Spot(SpotType.Center).rotate(OrientationType.South).value).toBe(SpotType.Center);
    });
  });

  describe("rotate(West) — 270 degrees clockwise", () => {
    const mappings: [SpotType, SpotType][] = [
      [SpotType.NorthWest, SpotType.SouthWest],
      [SpotType.North, SpotType.West],
      [SpotType.NorthEast, SpotType.NorthWest],
      [SpotType.East, SpotType.North],
      [SpotType.SouthEast, SpotType.NorthEast],
      [SpotType.South, SpotType.East],
      [SpotType.SouthWest, SpotType.SouthEast],
      [SpotType.West, SpotType.South],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Spot(from).rotate(OrientationType.West).value).toBe(to);
      });
    }

    it("Center stays Center", () => {
      expect(new Spot(SpotType.Center).rotate(OrientationType.West).value).toBe(SpotType.Center);
    });
  });

  describe("Center stays Center for all rotations", () => {
    const orientations = [
      OrientationType.None, OrientationType.North, OrientationType.East,
      OrientationType.South, OrientationType.West,
    ];

    for (const orient of orientations) {
      it(`rotate(${orient}) keeps Center`, () => {
        const result = new Spot(SpotType.Center).rotate(orient);
        // None orientation returns None; others keep Center
        if (orient === OrientationType.None) {
          expect(result.value).toBe(SpotType.None);
        } else {
          expect(result.value).toBe(SpotType.Center);
        }
      });
    }
  });

  describe("antirotate(East) is same as rotate(West)", () => {
    const directionalSpots = [
      SpotType.NorthWest, SpotType.North, SpotType.NorthEast,
      SpotType.East, SpotType.SouthEast, SpotType.South,
      SpotType.SouthWest, SpotType.West, SpotType.Center,
    ];

    for (const spot of directionalSpots) {
      it(`antirotate(East) === rotate(West) for ${spot}`, () => {
        const anti = new Spot(spot).antirotate(OrientationType.East);
        const rot = new Spot(spot).rotate(OrientationType.West);
        expect(anti.value).toBe(rot.value);
      });
    }
  });
});
