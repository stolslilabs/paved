import { describe, it, expect } from "vitest";
import { spotKeyToNumber } from "../src/utils/game-helpers";

describe("spotKeyToNumber", () => {
  it("maps 5 to Center (1)", () => {
    expect(spotKeyToNumber("5")).toBe(1);
  });
  it("maps 7 to NW (2)", () => {
    expect(spotKeyToNumber("7")).toBe(2);
  });
  it("maps 8 to N (3)", () => {
    expect(spotKeyToNumber("8")).toBe(3);
  });
  it("maps 9 to NE (4)", () => {
    expect(spotKeyToNumber("9")).toBe(4);
  });
  it("maps 6 to E (5)", () => {
    expect(spotKeyToNumber("6")).toBe(5);
  });
  it("maps 3 to SE (6)", () => {
    expect(spotKeyToNumber("3")).toBe(6);
  });
  it("maps 2 to S (7)", () => {
    expect(spotKeyToNumber("2")).toBe(7);
  });
  it("maps 1 to SW (8)", () => {
    expect(spotKeyToNumber("1")).toBe(8);
  });
  it("maps 4 to W (9)", () => {
    expect(spotKeyToNumber("4")).toBe(9);
  });
  it("returns null for 0", () => {
    expect(spotKeyToNumber("0")).toBeNull();
  });
  it("returns null for non-digit", () => {
    expect(spotKeyToNumber("a")).toBeNull();
  });
});
