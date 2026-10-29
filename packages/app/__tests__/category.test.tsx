import { CategoryType } from "@paved/game-core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CLOSING_CATEGORIES, CategoryIcon, categoryInfo } from "../src/components/elements/category";

const CITY = Object.values(CategoryType).indexOf(CategoryType.City);

describe("the City category (#862)", () => {
  it("is drawn as the castle wherever a closing or a points line shows it", () => {
    expect(categoryInfo(CITY).glyph).toBe("castle");
    const { container } = render(<CategoryIcon category={CITY} />);
    expect(container.querySelector("[data-icon='castle']")).not.toBeNull();
  });
});

describe("the categories' icons (#870)", () => {
  it("are game icons, each in its own tones", () => {
    const glyphs = CLOSING_CATEGORIES.map((c) => {
      const svg = render(<CategoryIcon category={c} />).container.querySelector("[data-slot=game-icon]")!;
      expect(svg, categoryInfo(c).label).not.toBeNull();
      return [svg.getAttribute("data-icon"), [...svg.querySelectorAll("linearGradient")].map((g) => g.id.match(/[a-z]+$/)![0])];
    });
    expect(Object.fromEntries(glyphs.map(([g, t]) => [g, t]))).toEqual({
      castle: ["stone"],
      road: ["stone", "gold"],
      tree: ["green"],
      "landmark-dome": ["gold", "stone"],
    });
  });

  it("fall back to a flat star for a category the client does not know", () => {
    const { container } = render(<CategoryIcon category={99} />);
    expect(container.querySelector("[data-slot=game-icon]")).toBeNull();
    expect(container.querySelector("[data-icon=star]")).not.toBeNull();
  });
});
