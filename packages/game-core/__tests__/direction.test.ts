import { describe, it, expect } from "vitest";
import { Direction, DirectionType } from "../src/types/direction";
import { OrientationType } from "../src/types/orientation";

describe("Direction", () => {
  describe("rotate(East) — 90 degrees clockwise", () => {
    const mappings: [DirectionType, DirectionType][] = [
      [DirectionType.North, DirectionType.East],
      [DirectionType.East, DirectionType.South],
      [DirectionType.South, DirectionType.West],
      [DirectionType.West, DirectionType.North],
      [DirectionType.NorthWest, DirectionType.NorthEast],
      [DirectionType.NorthEast, DirectionType.SouthEast],
      [DirectionType.SouthEast, DirectionType.SouthWest],
      [DirectionType.SouthWest, DirectionType.NorthWest],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Direction(from).rotate(OrientationType.East).value).toBe(to);
      });
    }

    it("None stays None", () => {
      expect(new Direction(DirectionType.None).rotate(OrientationType.East).value).toBe(DirectionType.None);
    });
  });

  describe("rotate(South) — 180 degrees", () => {
    const mappings: [DirectionType, DirectionType][] = [
      [DirectionType.North, DirectionType.South],
      [DirectionType.East, DirectionType.West],
      [DirectionType.South, DirectionType.North],
      [DirectionType.West, DirectionType.East],
      [DirectionType.NorthWest, DirectionType.SouthEast],
      [DirectionType.NorthEast, DirectionType.SouthWest],
      [DirectionType.SouthEast, DirectionType.NorthWest],
      [DirectionType.SouthWest, DirectionType.NorthEast],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Direction(from).rotate(OrientationType.South).value).toBe(to);
      });
    }
  });

  describe("rotate(West) — 270 degrees clockwise", () => {
    const mappings: [DirectionType, DirectionType][] = [
      [DirectionType.North, DirectionType.West],
      [DirectionType.East, DirectionType.North],
      [DirectionType.South, DirectionType.East],
      [DirectionType.West, DirectionType.South],
      [DirectionType.NorthWest, DirectionType.SouthWest],
      [DirectionType.NorthEast, DirectionType.NorthWest],
      [DirectionType.SouthEast, DirectionType.NorthEast],
      [DirectionType.SouthWest, DirectionType.SouthEast],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Direction(from).rotate(OrientationType.West).value).toBe(to);
      });
    }
  });

  describe("rotate(North) is identity", () => {
    const dirs = [
      DirectionType.North, DirectionType.East, DirectionType.South,
      DirectionType.West, DirectionType.NorthWest, DirectionType.NorthEast,
      DirectionType.SouthEast, DirectionType.SouthWest,
    ];

    for (const dir of dirs) {
      it(`${dir} stays ${dir}`, () => {
        expect(new Direction(dir).rotate(OrientationType.North).value).toBe(dir);
      });
    }
  });

  describe("antirotate(East) === rotate(West)", () => {
    const dirs = [
      DirectionType.None, DirectionType.North, DirectionType.East,
      DirectionType.South, DirectionType.West, DirectionType.NorthWest,
      DirectionType.NorthEast, DirectionType.SouthEast, DirectionType.SouthWest,
    ];

    for (const dir of dirs) {
      it(`antirotate(East) === rotate(West) for ${dir}`, () => {
        const anti = new Direction(dir).antirotate(OrientationType.East);
        const rot = new Direction(dir).rotate(OrientationType.West);
        expect(anti.value).toBe(rot.value);
      });
    }
  });

  describe("source() returns opposite direction", () => {
    const mappings: [DirectionType, DirectionType][] = [
      [DirectionType.North, DirectionType.South],
      [DirectionType.South, DirectionType.North],
      [DirectionType.East, DirectionType.West],
      [DirectionType.West, DirectionType.East],
      [DirectionType.NorthWest, DirectionType.SouthEast],
      [DirectionType.NorthEast, DirectionType.SouthWest],
      [DirectionType.SouthEast, DirectionType.NorthWest],
      [DirectionType.SouthWest, DirectionType.NorthEast],
      [DirectionType.None, DirectionType.None],
    ];

    for (const [from, to] of mappings) {
      it(`source of ${from} is ${to}`, () => {
        expect(new Direction(from).source().value).toBe(to);
      });
    }
  });

  describe("into() and from() round-trip", () => {
    it("round-trips all 9 values", () => {
      const d = new Direction(DirectionType.None);
      for (let i = 0; i < 9; i++) {
        const dir = d.from(i);
        expect(dir.into()).toBe(i);
      }
    });
  });
});
