import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT_SETTINGS } from "@paved/renderer";
import { BoardMap } from "../src/components/containers/board-map";

const tiles = [{ id: 1, plan: 1, orientation: 1, x: 0, y: 0 }];
const slot = { x: 1, y: 0 };
const theme = readFileSync(join(__dirname, "../src/styles/theme.css"), "utf8");
/** The hex a theme token is pinned to (the comment beside its oklch value). */
const hexOf = (token: string) => new RegExp(`--color-${token}: [^;]+; /\\* (#[0-9A-F]{6}) \\*/`).exec(theme)?.[1]?.toLowerCase();

describe("the plan view's veil (SLOTS2)", () => {
  it("is the neon's own colour at 0.14 in every state, yellow, red and green, never a UI token", () => {
    // The tokens the plan view uses are the renderer's state colours.
    expect(hexOf("gold-300")).toBe(DEFAULT_PLACEMENT_SETTINGS.colors.yellow);
    expect(hexOf("ember-500")).toBe(DEFAULT_PLACEMENT_SETTINGS.colors.red);
    expect(hexOf("meadow-400")).toBe(DEFAULT_PLACEMENT_SETTINGS.colors.green);
    expect(DEFAULT_PLACEMENT_SETTINGS.veil.opacity).toBe(0.14);

    const ghost = { ...slot, plan: 1, orientation: 1, placed: true };
    const veil = (fits: boolean) => {
      const { container, unmount } = render(<BoardMap tiles={tiles} slots={[{ ...slot, fits }]} ghost={{ ...ghost, fits }} />);
      const className = container.querySelector("[data-veil]")!.className;
      unmount();
      return className;
    };
    expect(veil(true)).toContain("bg-gold-300/14");
    expect(veil(false)).toContain("bg-ember-500/14");
    const { container } = render(<BoardMap tiles={tiles} confirmed={{ ...ghost, key: 1 }} />);
    const flash = container.querySelector("[data-confirm]")!.className;
    expect(flash).toContain("bg-meadow-400/14");
    for (const className of [veil(true), veil(false), flash]) expect(className).not.toMatch(/\bbg-primary\b|bg-primary\//);
  });
});
