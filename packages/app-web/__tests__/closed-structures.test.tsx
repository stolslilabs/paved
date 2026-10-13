// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClosedStructures, closureLine } from "../src/components/ClosedStructures";

afterEach(cleanup);

// Category codes of the contracts (`Into<Category, u8>`): 1 forest, 2 road, 3 city, 5 wonder.
describe("closureLine", () => {
  it("names the category, the size and the points of a closure", () => {
    expect(closureLine({ category: 2, size: 3, points: 6 })).toBe("Road closed: size 3, +6 points");
    expect(closureLine({ category: 3, size: 4, points: 32 })).toBe("City closed: size 4, +32 points");
    expect(closureLine({ category: 5, size: 9, points: 45 })).toBe("Wonder closed: size 9, +45 points");
  });

  it("says that a structure closed for 0 points", () => {
    expect(closureLine({ category: 1, size: 5, points: 0 })).toBe("Forest closed: size 5, 0 points");
  });

  it("falls back to a plain name for a category it does not know", () => {
    expect(closureLine({ category: 9, size: 1, points: 2 })).toBe("Structure closed: size 1, +2 points");
  });
});

describe("ClosedStructures", () => {
  it("shows each closure of a move in a polite live region", () => {
    render(<ClosedStructures closures={[{ category: 2, size: 3, points: 6 }, { category: 1, size: 4, points: 12 }]} />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.style.display).toBe("flex");
    expect([...region.querySelectorAll("span")].map((s) => s.textContent)).toEqual([
      "Road closed: size 3, +6 points",
      "Forest closed: size 4, +12 points",
    ]);
  });

  it("shows a closure at 0 points", () => {
    render(<ClosedStructures closures={[{ category: 1, size: 2, points: 0 }]} />);
    expect(screen.getByRole("status").textContent).toBe("Forest closed: size 2, 0 points");
  });

  it("shows nothing for a move that closes nothing, and keeps the region for the next one", () => {
    const { rerender } = render(<ClosedStructures closures={[]} />);
    const region = screen.getByTestId("closures");
    expect(region.textContent).toBe("");
    expect(region.style.display).toBe("none");
    rerender(<ClosedStructures closures={null} />);
    expect(screen.getByTestId("closures").textContent).toBe("");
  });
});
