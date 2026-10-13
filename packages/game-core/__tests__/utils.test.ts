import { describe, it, expect } from "vitest";
import { getColor } from "../src/utils";

describe("getColor()", () => {
  it("returns valid hex color string", () => {
    const color = getColor("test");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns consistent results for same input", () => {
    expect(getColor("abc")).toBe(getColor("abc"));
  });

  it("returns different colors for different inputs", () => {
    const c1 = getColor("hello");
    const c2 = getColor("world");
    expect(c1).not.toBe(c2);
  });

  it("handles empty string", () => {
    const color = getColor("");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
