import { describe, it, expect } from "vitest";
import { Orientation, OrientationType } from "../src/types/orientation";

describe("Orientation", () => {
  describe("into()", () => {
    it("returns 0 for None", () => {
      expect(new Orientation(OrientationType.None).into()).toBe(0);
    });

    it("returns 1 for North", () => {
      expect(new Orientation(OrientationType.North).into()).toBe(1);
    });

    it("returns 2 for East", () => {
      expect(new Orientation(OrientationType.East).into()).toBe(2);
    });

    it("returns 3 for South", () => {
      expect(new Orientation(OrientationType.South).into()).toBe(3);
    });

    it("returns 4 for West", () => {
      expect(new Orientation(OrientationType.West).into()).toBe(4);
    });
  });

  describe("from()", () => {
    it("round-trips all values", () => {
      for (let i = 0; i < 5; i++) {
        const orientation = Orientation.from(i);
        expect(orientation.into()).toBe(i);
      }
    });

    it("from(0) is None", () => {
      expect(Orientation.from(0).value).toBe(OrientationType.None);
    });

    it("from(1) is North", () => {
      expect(Orientation.from(1).value).toBe(OrientationType.North);
    });

    it("from(2) is East", () => {
      expect(Orientation.from(2).value).toBe(OrientationType.East);
    });

    it("from(3) is South", () => {
      expect(Orientation.from(3).value).toBe(OrientationType.South);
    });

    it("from(4) is West", () => {
      expect(Orientation.from(4).value).toBe(OrientationType.West);
    });
  });

  describe("enum values", () => {
    it("has all 5 enum values", () => {
      const values = Object.values(OrientationType);
      expect(values).toHaveLength(5);
      expect(values).toContain("None");
      expect(values).toContain("North");
      expect(values).toContain("East");
      expect(values).toContain("South");
      expect(values).toContain("West");
    });
  });
});
