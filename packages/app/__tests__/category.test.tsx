import { CategoryType } from "@paved/game-core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryIcon, categoryInfo } from "../src/components/elements/category";

const CITY = Object.values(CategoryType).indexOf(CategoryType.City);

describe("the City category (#862)", () => {
  it("is drawn as the castle wherever a closing or a points line shows it", () => {
    expect(categoryInfo(CITY).icon).toBe("castle");
    const { container } = render(<CategoryIcon category={CITY} />);
    expect(container.querySelector("[data-icon='castle']")).not.toBeNull();
  });
});
