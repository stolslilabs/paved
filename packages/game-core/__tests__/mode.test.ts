import { describe, it, expect } from "vitest";
import { Mode, ModeType } from "../src/types/mode";

describe("Mode", () => {
  describe("Daily", () => {
    const daily = new Mode(ModeType.Daily);

    it("duration is 86400", () => {
      expect(daily.duration()).toBe(86400);
    });

    it("count is 38", () => {
      expect(daily.count()).toBe(38);
    });

    it("price is 1e18", () => {
      expect(daily.price()).toBe(BigInt("1000000000000000000"));
    });
  });

  describe("Weekly", () => {
    const weekly = new Mode(ModeType.Weekly);

    it("duration is 604800", () => {
      expect(weekly.duration()).toBe(604800);
    });

    it("count is 72", () => {
      expect(weekly.count()).toBe(72);
    });

    it("price is 1e18", () => {
      expect(weekly.price()).toBe(BigInt("1000000000000000000"));
    });
  });

  describe("Tutorial", () => {
    const tutorial = new Mode(ModeType.Tutorial);

    it("duration is 1", () => {
      expect(tutorial.duration()).toBe(1);
    });

    it("count is 10", () => {
      expect(tutorial.count()).toBe(10);
    });

    it("price is 0", () => {
      expect(tutorial.price()).toBe(BigInt(0));
    });
  });

  describe("None", () => {
    const none = new Mode(ModeType.None);

    it("duration is 0", () => {
      expect(none.duration()).toBe(0);
    });

    it("count is 0", () => {
      expect(none.count()).toBe(0);
    });

    it("price is 0", () => {
      expect(none.price()).toBe(BigInt(0));
    });
  });

  describe("from/into round-trip", () => {
    it("round-trips all 4 values", () => {
      for (let i = 0; i < 4; i++) {
        const mode = Mode.from(i);
        expect(mode.into()).toBe(i);
      }
    });

    it("from(0) is None", () => {
      expect(Mode.from(0).value).toBe(ModeType.None);
    });

    it("from(1) is Daily", () => {
      expect(Mode.from(1).value).toBe(ModeType.Daily);
    });

    it("from(2) is Weekly", () => {
      expect(Mode.from(2).value).toBe(ModeType.Weekly);
    });

    it("from(3) is Tutorial", () => {
      expect(Mode.from(3).value).toBe(ModeType.Tutorial);
    });
  });
});
