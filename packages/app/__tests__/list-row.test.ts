import { describe, expect, it } from "vitest";
import { listRowShape } from "../src/components/elements/list-row";

describe("a carved list's row shape (the owner's rule of 2026-11-07)", () => {
  it("rounds the list's first row at its top and its last at its foot, squares every row between, rounds a lone row whole", () => {
    expect(listRowShape(0, 3)).toBe("rounded-none rounded-t-xl");
    expect(listRowShape(1, 3)).toBe("rounded-none");
    expect(listRowShape(2, 3)).toBe("rounded-none rounded-b-xl");
    expect(listRowShape(0, 1)).toBe("rounded-none rounded-t-xl rounded-b-xl");
  });
});
