import { describe, it, expect } from "vitest";
import { Area, AreaType } from "../src/types/area";
import { OrientationType } from "../src/types/orientation";

describe("Area", () => {
  describe("into() and from() round-trip", () => {
    const allAreas = [
      { type: AreaType.None, index: 0 },
      { type: AreaType.A, index: 1 },
      { type: AreaType.B, index: 2 },
      { type: AreaType.C, index: 3 },
      { type: AreaType.D, index: 4 },
      { type: AreaType.E, index: 5 },
      { type: AreaType.F, index: 6 },
      { type: AreaType.G, index: 7 },
      { type: AreaType.H, index: 8 },
      { type: AreaType.I, index: 9 },
    ];

    for (const { type, index } of allAreas) {
      it(`into() returns ${index} for ${type}`, () => {
        expect(new Area(type).into()).toBe(index);
      });

      it(`from(${index}) returns ${type}`, () => {
        expect(Area.from(index).value).toBe(type);
      });

      it(`from(${index}).into() === ${index}`, () => {
        expect(Area.from(index).into()).toBe(index);
      });
    }
  });

  describe("rotate(North) is identity", () => {
    const areas = [
      AreaType.A, AreaType.B, AreaType.C, AreaType.D,
      AreaType.E, AreaType.F, AreaType.G, AreaType.H, AreaType.I,
    ];

    for (const area of areas) {
      it(`rotate(North) keeps ${area}`, () => {
        expect(new Area(area).rotate(OrientationType.North).value).toBe(area);
      });
    }
  });

  describe("rotate(East) — rotation algebra", () => {
    const mappings: [AreaType, AreaType][] = [
      [AreaType.A, AreaType.A],
      [AreaType.B, AreaType.D],
      [AreaType.C, AreaType.E],
      [AreaType.D, AreaType.F],
      [AreaType.E, AreaType.G],
      [AreaType.F, AreaType.H],
      [AreaType.G, AreaType.I],
      [AreaType.H, AreaType.B],
      [AreaType.I, AreaType.C],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Area(from).rotate(OrientationType.East).value).toBe(to);
      });
    }
  });

  describe("rotate(South) — rotation algebra", () => {
    const mappings: [AreaType, AreaType][] = [
      [AreaType.A, AreaType.A],
      [AreaType.B, AreaType.F],
      [AreaType.C, AreaType.G],
      [AreaType.D, AreaType.H],
      [AreaType.E, AreaType.I],
      [AreaType.F, AreaType.B],
      [AreaType.G, AreaType.C],
      [AreaType.H, AreaType.D],
      [AreaType.I, AreaType.E],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Area(from).rotate(OrientationType.South).value).toBe(to);
      });
    }
  });

  describe("rotate(West) — rotation algebra", () => {
    const mappings: [AreaType, AreaType][] = [
      [AreaType.A, AreaType.A],
      [AreaType.B, AreaType.H],
      [AreaType.C, AreaType.I],
      [AreaType.D, AreaType.B],
      [AreaType.E, AreaType.C],
      [AreaType.F, AreaType.D],
      [AreaType.G, AreaType.E],
      [AreaType.H, AreaType.F],
      [AreaType.I, AreaType.G],
    ];

    for (const [from, to] of mappings) {
      it(`${from} -> ${to}`, () => {
        expect(new Area(from).rotate(OrientationType.West).value).toBe(to);
      });
    }
  });

  describe("antirotate(East) === rotate(West)", () => {
    const areas = [
      AreaType.A, AreaType.B, AreaType.C, AreaType.D,
      AreaType.E, AreaType.F, AreaType.G, AreaType.H, AreaType.I,
    ];

    for (const area of areas) {
      it(`antirotate(East) === rotate(West) for ${area}`, () => {
        const anti = new Area(area).antirotate(OrientationType.East);
        const rot = new Area(area).rotate(OrientationType.West);
        expect(anti.value).toBe(rot.value);
      });
    }
  });

  describe("antirotate(West) === rotate(East)", () => {
    const areas = [
      AreaType.A, AreaType.B, AreaType.C, AreaType.D,
      AreaType.E, AreaType.F, AreaType.G, AreaType.H, AreaType.I,
    ];

    for (const area of areas) {
      it(`antirotate(West) === rotate(East) for ${area}`, () => {
        const anti = new Area(area).antirotate(OrientationType.West);
        const rot = new Area(area).rotate(OrientationType.East);
        expect(anti.value).toBe(rot.value);
      });
    }
  });

  describe("rotate defaults return None", () => {
    it("rotate(None) returns None for area A", () => {
      expect(new Area(AreaType.A).rotate(OrientationType.None).value).toBe(AreaType.None);
    });

    it("rotate(East) returns None for AreaType.None", () => {
      expect(new Area(AreaType.None).rotate(OrientationType.East).value).toBe(AreaType.None);
    });
  });
});
