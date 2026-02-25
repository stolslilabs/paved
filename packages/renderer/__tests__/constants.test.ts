import { describe, it, expect } from "vitest";
import { TILE_SIZE } from "../src/core/types";

describe("TILE_SIZE constant", () => {
  it("is exported from types and equals 3", () => {
    expect(TILE_SIZE).toBe(3);
  });
});
