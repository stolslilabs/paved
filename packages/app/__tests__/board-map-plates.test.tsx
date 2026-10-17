import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT_SETTINGS } from "@paved/renderer";
import { BoardMap } from "../src/components/containers/board-map";

const tiles = [{ id: 1, plan: 1, orientation: 1, x: 0, y: 0 }];
const theme = readFileSync(join(__dirname, "../src/styles/theme.css"), "utf8");
/** The hex a theme token is pinned to (the comment beside its oklch value). */
const hexOf = (token: string) => new RegExp(`--color-${token}: [^;]+; /\\* (#[0-9A-F]{6}) \\*/`).exec(theme)?.[1]?.toLowerCase();

describe("the plates' colours (PLATES)", () => {
  it("are the palette's tokens, the renderer's colours the same values", () => {
    const { colors } = DEFAULT_PLACEMENT_SETTINGS;
    expect(hexOf("plate")).toBe(colors.plate);
    expect(hexOf("plate-off")).toBe(colors.invalid);
    expect(hexOf("plate-aura")).toBe(colors.aura);
    expect(hexOf("ember-500")).toBe(colors.red);
    expect(hexOf("meadow-400")).toBe(colors.green);
  });
});

describe("the plan view's plates", () => {
  const plates = (container: HTMLElement) => Object.fromEntries([...container.querySelectorAll("[data-plate]")].map((p) => [p.closest("[style]")!.getAttribute("style")!, p.getAttribute("data-plate")]));

  it("draws the three states: valid under its aura, possible, and every other free neighbour invalid", () => {
    const { container } = render(<BoardMap tiles={tiles} slots={[{ x: 1, y: 0, fits: true }, { x: 0, y: 1, fits: false }]} />);
    const states = [...container.querySelectorAll("[data-plate]")].map((p) => p.getAttribute("data-plate"));
    expect(states.sort()).toEqual(["invalid", "invalid", "possible", "valid"]);
    const cls = (state: string) => container.querySelector(`[data-plate="${state}"]`)!.className;
    expect(cls("valid")).toContain("bg-plate/90");
    expect(cls("valid")).toContain("--color-plate-aura");
    expect(cls("possible")).toContain("bg-plate/90");
    expect(cls("possible")).not.toContain("plate-aura");
    expect(cls("invalid")).toContain("bg-plate-off/45");
    // Inset in the cell (a gap between neighbours), rounded, each change eased over 150 ms.
    for (const state of ["valid", "possible", "invalid"]) {
      expect(cls(state)).toContain("inset-[5%]");
      expect(cls(state)).toContain("duration-150");
      expect(cls(state)).toContain("motion-reduce:transition-none");
    }
    // Only the legal ones are buttons.
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(Object.keys(plates(container))).toHaveLength(4);
  });

  it("rims the placed tile white while its rotation fits, red while not, and flashes green on confirm", () => {
    const slot = { x: 1, y: 0 };
    const ghost = { ...slot, plan: 1, orientation: 1, placed: true };
    const rim = (fits: boolean) => {
      const { container, unmount } = render(<BoardMap tiles={tiles} slots={[{ ...slot, fits }]} ghost={{ ...ghost, fits }} />);
      const span = container.querySelector("[data-rim]")!;
      const out = { tone: span.getAttribute("data-rim"), className: span.className };
      unmount();
      return out;
    };
    expect(rim(true).tone).toBe("aura");
    expect(rim(true).className).toContain("ring-plate-aura");
    expect(rim(false).tone).toBe("red");
    expect(rim(false).className).toContain("ring-ember-500");
    const { container } = render(<BoardMap tiles={tiles} confirmed={{ ...ghost, key: 1 }} />);
    expect(container.querySelector("[data-confirm]")!.className).toContain("ring-meadow-400");
  });

  it("draws no plate with the highlight off, nor any yellow ring, veil or dashed stroke", () => {
    const { container } = render(<BoardMap tiles={tiles} slots={[{ x: 1, y: 0 }]} highlight={false} />);
    expect(container.querySelectorAll("[data-plate]")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    const { container: lit } = render(<BoardMap tiles={tiles} slots={[{ x: 1, y: 0 }]} ghost={{ x: 1, y: 0, plan: 1, orientation: 1, placed: true }} />);
    expect(lit.innerHTML).not.toMatch(/border-dashed|border-primary|bg-gold-300|data-veil/);
    // The ring grid is off by default.
    expect(lit.querySelectorAll("[data-ring]")).toHaveLength(0);
    const { container: grid } = render(<BoardMap tiles={tiles} grid />);
    expect(grid.querySelectorAll("[data-ring]").length).toBeGreaterThan(0);
  });
});
