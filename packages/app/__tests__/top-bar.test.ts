import { describe, expect, it } from "vitest";
import { sideWidth } from "../src/components/containers/top-bar";

describe("TopBar: the side columns (sideWidth)", () => {
  it("both as wide as the wider side, so the title is centred, while the title keeps its room", () => {
    expect(sideWidth(40, 120, 1256)).toBe("120px");
    expect(sideWidth(40, 70, 336)).toBe("70px");
  });

  it("never under 48 px", () => {
    expect(sideWidth(0, 0, 336)).toBe("48px");
  });

  it("auto when two such sides leave the title under 96 px: the final board's card beside the desktop rail (#620)", () => {
    // The card is 672 px wide (`max-w-2xl`), 646 px inside; the rail and the score made the right side 341 px.
    expect(sideWidth(40, 341, 646)).toBe("auto");
    // 2 x 275 + 96 = 646: the last width that stays centred.
    expect(sideWidth(40, 275, 646)).toBe("275px");
    expect(sideWidth(40, 276, 646)).toBe("auto");
  });
});
